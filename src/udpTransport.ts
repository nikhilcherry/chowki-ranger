import { createSocket, Socket, RemoteInfo } from 'dgram';
import { Buffer } from 'buffer';
import { AbstractTransport } from './abstractTransport.js';
import { ChowkiConfig, PeerConfig } from './config.js';
import { PacketEnvelope, RandomProvider } from './types.js';

/**
 * Concrete implementation of the LoRa transport layer using UDP loopback sockets.
 * Owns socket binding, serialization/deserialization of network envelopes, and physical transfers.
 */
export class UDPTransport extends AbstractTransport {
  private readonly config: ChowkiConfig;
  private readonly peersMap = new Map<string, PeerConfig>();
  private socket: Socket | null = null;

  constructor(
    config: ChowkiConfig,
    randomProvider: RandomProvider,
    dutyCycleMs = 1000,
    ackTimeoutMs = 3000,
    retryDelayMs = 1000
  ) {
    super(config.id, randomProvider, dutyCycleMs, ackTimeoutMs, retryDelayMs);
    this.config = config;

    for (const peer of config.peers) {
      this.peersMap.set(peer.id, peer);
    }
  }

  /**
   * Binds the UDP socket to the configured local port and starts listening for incoming packets.
   */
  public async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket = createSocket('udp4');

      this.socket.on('error', (err) => {
        this.logger.error(`UDP Socket error: ${err.message}`);
        reject(err);
      });

      this.socket.on('message', (msg: Buffer, rinfo: RemoteInfo) => {
        this.handleRawMessage(msg, rinfo);
      });

      this.socket.bind(this.config.port, () => {
        this.logger.info(`UDP Transport started. Listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Implements the physical dispatch of a serialized envelope over a UDP socket.
   */
  public async sendEnvelope(envelope: PacketEnvelope, targetPeerId: string): Promise<void> {
    if (!this.socket) {
      throw new Error('UDP transport socket has not been started. Call start() first.');
    }

    const peer = this.peersMap.get(targetPeerId);
    if (!peer) {
      throw new Error(`Cannot send: target peer ${targetPeerId} is not configured.`);
    }

    const buffer = this.serializeEnvelope(envelope);
    this.stats.addBytes(buffer.length);

    return new Promise<void>((resolve, reject) => {
      this.socket!.send(buffer, 0, buffer.length, peer.port, peer.host, (error) => {
        if (error) {
          this.logger.error(`Failed to transmit envelope to ${targetPeerId}: ${error.message}`);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  public getPeers(): string[] {
    return Array.from(this.peersMap.keys());
  }

  /**
   * Implements packet loss evaluation using the injected RandomProvider.
   */
  protected shouldDropPacket(): boolean {
    const roll = this.randomProvider.random();
    return roll < this.config.loraLoss;
  }

  private handleRawMessage(msg: Buffer, rinfo: RemoteInfo): void {
    try {
      const envelope = this.deserializeEnvelope(msg);
      this.handleIncomingEnvelope(envelope);
    } catch (err) {
      this.logger.error(`Failed to process incoming raw UDP frame from ${rinfo.address}:${rinfo.port}: ${(err as Error).message}`);
    }
  }

  private serializeEnvelope(envelope: PacketEnvelope): Buffer {
    const jsonFriendlyEnvelope = {
      ...envelope,
      payload: Buffer.from(envelope.payload).toString('base64'),
    };
    return Buffer.from(JSON.stringify(jsonFriendlyEnvelope), 'utf-8');
  }

  private deserializeEnvelope(buffer: Buffer): PacketEnvelope {
    const parsed = JSON.parse(buffer.toString('utf-8'));
    return {
      type: parsed.type,
      packetId: parsed.packetId,
      from: parsed.from,
      to: parsed.to,
      ttl: parsed.ttl,
      payload: new Uint8Array(Buffer.from(parsed.payload, 'base64')),
    };
  }

  /**
   * Closes the UDP socket and cleans up parent resources.
   */
  public override async close(): Promise<void> {
    await super.close();
    if (this.socket) {
      const activeSocket = this.socket;
      this.socket = null;
      await new Promise<void>((resolve) => activeSocket.close(() => resolve()));
      this.logger.info('UDP Transport socket closed.');
    }
  }
}
