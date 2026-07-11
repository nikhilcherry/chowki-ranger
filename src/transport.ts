import { TriagePacket, DeliveryReport, ReceiveCallback, StatsCallback } from './types.js';

/**
 * Public interface representing the simulated LoRa Transport layer.
 */
export interface Transport {
  /**
   * Enqueues and attempts delivery of a Triage incident report to a destination node.
   * Under the hood, this will run through duty-cycling, random hop latency, loss check,
   * exponential backoff retries, duplicate checking, and multi-hop flood routing.
   */
  sendTriage(packet: TriagePacket, dst: string): Promise<DeliveryReport>;

  /**
   * Registers a listener callback that triggers whenever a unique triage packet
   * addressed to this current node is received.
   */
  onReceive(callback: ReceiveCallback): void;

  /**
   * Registers a telemetry listener that receives real-time stats updates.
   */
  onStats(callback: StatsCallback): void;

  /**
   * Closes transport bindings, cleans up timers, queues, and stops socket listening.
   */
  close(): Promise<void>;
}
