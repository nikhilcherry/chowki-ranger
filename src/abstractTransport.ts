import { Transport } from './transport.js';
import {
  TriagePacket,
  AckPacket,
  PacketEnvelope,
  DeliveryReport,
  ReceiveCallback,
  StatsCallback,
  RandomProvider
} from './types.js';
import { StatsManager } from './stats.js';
import { TransmissionQueue } from './queue.js';
import { retry } from './retry.js';
import { PayloadTooLargeError } from './errors.js';
import { Logger } from './logger.js';

/**
 * Protocol-agnostic transport coordinator enforcing LoRa constraint logic.
 * Handles queuing, exponential backoff retries, telemetry tracking, duplicate checking,
 * and multi-hop flooding, delegating actual physical transfers to the child class.
 */
export abstract class AbstractTransport implements Transport {
  protected readonly nodeId: string;
  protected readonly queue: TransmissionQueue<PacketEnvelope>;
  protected readonly stats: StatsManager;
  protected readonly seenPackets = new Set<string>();
  protected readonly logger: Logger;
  protected readonly randomProvider: RandomProvider;
  
  // Maps packet ID to source peer context for tracking ACK reverse paths
  private readonly triageTracker = new Map<string, { fromPeerId: string; packet: TriagePacket }>();
  
  // Tracks active delivery sessions to resolve sendTriage promises upon ACK matching
  private readonly activeSends = new Map<string, {
    resolve: (report: DeliveryReport) => void;
    reject: (error: Error) => void;
    attempts: number;
    pathHint: string[];
  }>();

  private readonly pendingAcks = new Map<string, () => void>();
  private receiveCallback: ReceiveCallback | null = null;

  private readonly ackTimeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(
    nodeId: string,
    randomProvider: RandomProvider,
    dutyCycleMs = 1000,
    ackTimeoutMs = 3000,
    retryDelayMs = 1000
  ) {
    this.nodeId = nodeId;
    this.randomProvider = randomProvider;
    this.queue = new TransmissionQueue<PacketEnvelope>(dutyCycleMs);
    this.stats = new StatsManager();
    this.logger = new Logger(nodeId);
    this.ackTimeoutMs = ackTimeoutMs;
    this.retryDelayMs = retryDelayMs;
  }

  /**
   * Concretely implemented by the network layer (e.g. UDPTransport) to dispatch raw bytes to a target peer.
   */
  public abstract sendEnvelope(envelope: PacketEnvelope, targetPeerId: string): Promise<void>;

  /**
   * Retrieves configured direct neighbor node IDs.
   */
  public abstract getPeers(): string[];

  public onReceive(callback: ReceiveCallback): void {
    this.receiveCallback = callback;
  }

  public onStats(callback: StatsCallback): void {
    this.stats.onStats(callback);
  }

  /**
   * Validates and enqueues triage packets, triggering an exponential backoff retry loop.
   */
  public async sendTriage(packet: TriagePacket, dst: string): Promise<DeliveryReport> {
    // 1. Enforce payload size limit measured by Uint8Array.length, not string length
    if (packet.payload.length > 200) {
      throw new PayloadTooLargeError(packet.payload.length);
    }

    this.logger.info(`Starting delivery session for packet ${packet.packetId} targeting destination ${dst}`);
    this.stats.increment('queued');

    // Prevent immediate loopback of own generated packet
    this.seenPackets.add(packet.packetId);

    const urgency = packet.urgency;
    const maxRetries = urgency === 'sos' ? 6 : 3;

    return new Promise<DeliveryReport>((resolve, reject) => {
      this.activeSends.set(packet.packetId, {
        resolve,
        reject,
        attempts: 0,
        pathHint: [],
      });

      // Execute retry loop with backoff
      retry(
        async () => {
          const activeSend = this.activeSends.get(packet.packetId);
          if (!activeSend) {
            throw new Error('Send session terminated');
          }

          activeSend.attempts++;
          this.stats.increment('sent');
          if (activeSend.attempts > 1) {
            this.stats.increment('retried');
          }

          this.logger.info(`Transmitting packet ${packet.packetId} (Attempt ${activeSend.attempts}/${maxRetries + 1})`);

          const peers = this.getPeers();
          if (peers.length === 0) {
            this.logger.warn(`No adjacent peers configured to relay packet ${packet.packetId}`);
          }

          for (const peerId of peers) {
          // Ensure original sender is recorded in the hop passport if not already present
          const passport = packet.hopPassport.includes(this.nodeId)
            ? packet.hopPassport
            : [...packet.hopPassport, this.nodeId];

          const envelope: PacketEnvelope = {
            type: 'TRIAGE',
            packetId: packet.packetId,
            from: this.nodeId,
            to: peerId,
            ttl: packet.ttl,
            payload: this.serializeTriagePacket({
              ...packet,
              hopPassport: passport
            }),
          };

            // Respect duty cycle spacing via transmission queue
            await this.queue.enqueue(envelope);

            // Inject simulated random latency (300-800ms)
            const latency = this.randomProvider.randomInRange(300, 800);
            await new Promise((res) => setTimeout(res, latency));

            // Simulating physical LoRa packet loss constraints
            if (this.shouldDropPacket()) {
              this.logger.warn(`Simulated link loss dropped packet ${packet.packetId} intended for peer ${peerId}`);
              this.stats.increment('dropped');
              continue;
            }

            try {
              await this.sendEnvelope(envelope, peerId);
            } catch (err) {
              this.logger.error(`Error sending envelope to peer ${peerId}: ${(err as Error).message}`);
            }
          }

          // Wait for end-to-end ACK to arrive within a window
          await this.waitForAck(packet.packetId, this.ackTimeoutMs);
        },
        {
          maxRetries,
          initialDelayMs: this.retryDelayMs,
          onRetry: (attempt, err) => {
            this.logger.warn(`Retrying delivery of packet ${packet.packetId} (attempt ${attempt}): ${err.message}`);
          },
        }
      )
      .then(() => {
        const activeSend = this.activeSends.get(packet.packetId);
        if (activeSend) {
          this.activeSends.delete(packet.packetId);
          activeSend.resolve({
            delivered: true,
            attempts: activeSend.attempts,
            pathHint: activeSend.pathHint,
          });
        }
      })
      .catch((error) => {
        this.logger.error(`Delivery failed for packet ${packet.packetId}: ${error.message}`);
        const activeSend = this.activeSends.get(packet.packetId);
        if (activeSend) {
          this.activeSends.delete(packet.packetId);
          this.stats.increment('failed');
          activeSend.resolve({
            delivered: false,
            attempts: activeSend.attempts,
            pathHint: [],
          });
        }
      });
    });
  }

  /**
   * Internal processor for incoming envelopes dispatched by the network implementation.
   */
  protected async handleIncomingEnvelope(envelope: PacketEnvelope): Promise<void> {
    if (envelope.type === 'ACK') {
      const ack = this.deserializeAckPacket(envelope.payload);
      this.logger.info(`Received ACK for packet ${envelope.packetId} from immediate sender ${envelope.from}`);
      
      const activeSend = this.activeSends.get(envelope.packetId);
      if (activeSend) {
        activeSend.pathHint = ack.hopPassport || [];
        this.stats.increment('acked');
        this.resolveAck(envelope.packetId);
      } else {
        // Not the original sender, routing back along the reverse path using tracked context
        const tracker = this.triageTracker.get(envelope.packetId);
        if (tracker) {
          this.logger.info(`Forwarding ACK for packet ${envelope.packetId} back to peer ${tracker.fromPeerId}`);
          
          const forwardEnvelope: PacketEnvelope = {
            type: 'ACK',
            packetId: envelope.packetId,
            from: this.nodeId,
            to: tracker.fromPeerId,
            ttl: envelope.ttl - 1,
            payload: envelope.payload,
          };

          await this.queue.enqueue(forwardEnvelope);
          const latency = this.randomProvider.randomInRange(300, 800);
          await new Promise((res) => setTimeout(res, latency));

          if (this.shouldDropPacket()) {
            this.logger.warn(`ACK packet ${envelope.packetId} dropped during relay to peer ${tracker.fromPeerId}`);
            this.stats.increment('dropped');
            return;
          }

          try {
            await this.sendEnvelope(forwardEnvelope, tracker.fromPeerId);
          } catch (err) {
            this.logger.error(`Failed to forward ACK envelope to peer ${tracker.fromPeerId}`);
          }
        }
      }
      return;
    }

    if (envelope.type === 'TRIAGE') {
      const packet = this.deserializeTriagePacket(envelope.payload);

      // Duplicate suppression
      if (this.seenPackets.has(packet.packetId)) {
        this.logger.info(`Duplicate triage packet ${packet.packetId} detected. Dropping.`);
        this.stats.increment('dropped');
        return;
      }

      this.seenPackets.add(packet.packetId);
      
      // Store reference path context to allow reverse routing of ACKs
      this.triageTracker.set(packet.packetId, {
        fromPeerId: envelope.from,
        packet,
      });

      if (packet.dst === this.nodeId) {
        this.logger.info(`Triage packet ${packet.packetId} successfully reached destination ${this.nodeId}`);
        
        if (this.receiveCallback) {
          try {
            this.receiveCallback(packet);
          } catch (err) {
            this.logger.error(`Exception inside receive callback handler: ${(err as Error).message}`);
          }
        }

        // Return a path-tracked ACK packet back to the original sender
        const ackPacket: AckPacket & { hopPassport: string[] } = {
          packetId: packet.packetId,
          hopPassport: [...packet.hopPassport, this.nodeId],
        };

        const ackEnvelope: PacketEnvelope = {
          type: 'ACK',
          packetId: packet.packetId,
          from: this.nodeId,
          to: envelope.from, // Unicast to the node we received the triage packet from
          ttl: packet.ttl,
          payload: this.serializeAckPacket(ackPacket),
        };

        this.logger.info(`Dispatching ACK envelope for packet ${packet.packetId} back to peer ${envelope.from}`);
        await this.queue.enqueue(ackEnvelope);
        const latency = this.randomProvider.randomInRange(300, 800);
        await new Promise((res) => setTimeout(res, latency));

        if (this.shouldDropPacket()) {
          this.logger.warn(`ACK for packet ${packet.packetId} dropped due to link loss before transmission.`);
          this.stats.increment('dropped');
          return;
        }

        try {
          await this.sendEnvelope(ackEnvelope, envelope.from);
        } catch (err) {
          this.logger.error(`Error sending ACK back to peer ${envelope.from}`);
        }
      } else {
        // Handoff Flooding Relay
        const nextTtl = packet.ttl - 1;
        if (nextTtl <= 0) {
          this.logger.warn(`Triage packet ${packet.packetId} TTL expired. Dropping.`);
          this.stats.increment('dropped');
          return;
        }

        this.stats.increment('forwarded');
        const relayedPacket: TriagePacket = {
          ...packet,
          ttl: nextTtl,
          hopPassport: [...packet.hopPassport, this.nodeId],
        };

        const peers = this.getPeers();
        for (const peerId of peers) {
          // Prevent reflection loopback to direct source node
          if (peerId === envelope.from) {
            continue;
          }

          const forwardEnvelope: PacketEnvelope = {
            type: 'TRIAGE',
            packetId: packet.packetId,
            from: this.nodeId,
            to: peerId,
            ttl: nextTtl,
            payload: this.serializeTriagePacket(relayedPacket),
          };

          this.logger.info(`Relaying triage packet ${packet.packetId} to peer ${peerId} (Remaining TTL ${nextTtl})`);
          await this.queue.enqueue(forwardEnvelope);
          const latency = this.randomProvider.randomInRange(300, 800);
          await new Promise((res) => setTimeout(res, latency));

          if (this.shouldDropPacket()) {
            this.logger.warn(`Relayed packet ${packet.packetId} dropped due to simulated loss to peer ${peerId}`);
            this.stats.increment('dropped');
            continue;
          }

          try {
            await this.sendEnvelope(forwardEnvelope, peerId);
          } catch (err) {
            this.logger.error(`Failed to dispatch relayed packet ${packet.packetId} to peer ${peerId}`);
          }
        }
      }
    }
  }

  private waitForAck(packetId: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(packetId);
        reject(new Error('ACK timeout'));
      }, timeoutMs);

      this.pendingAcks.set(packetId, () => {
        clearTimeout(timeout);
        this.pendingAcks.delete(packetId);
        resolve();
      });
    });
  }

  private resolveAck(packetId: string): void {
    const resolver = this.pendingAcks.get(packetId);
    if (resolver) {
      resolver();
    }
  }

  protected abstract shouldDropPacket(): boolean;

  protected serializeTriagePacket(packet: TriagePacket): Uint8Array {
    const rawObj = {
      ...packet,
      payload: Buffer.from(packet.payload).toString('base64'),
    };
    return Buffer.from(JSON.stringify(rawObj), 'utf-8');
  }

  protected deserializeTriagePacket(data: Uint8Array): TriagePacket {
    const rawObj = JSON.parse(Buffer.from(data).toString('utf-8'));
    return {
      ...rawObj,
      payload: new Uint8Array(Buffer.from(rawObj.payload, 'base64')),
    };
  }

  protected serializeAckPacket(packet: AckPacket & { hopPassport: string[] }): Uint8Array {
    return Buffer.from(JSON.stringify(packet), 'utf-8');
  }

  protected deserializeAckPacket(data: Uint8Array): AckPacket & { hopPassport?: string[] } {
    return JSON.parse(Buffer.from(data).toString('utf-8'));
  }

  public async close(): Promise<void> {
    this.queue.clear();
    this.seenPackets.clear();
    this.triageTracker.clear();
    this.activeSends.clear();
    for (const timeoutFn of this.pendingAcks.values()) {
      timeoutFn();
    }
    this.pendingAcks.clear();
  }
}
