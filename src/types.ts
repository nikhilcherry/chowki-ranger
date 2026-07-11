/**
 * Representation of a Trek Hiker triage incident or status report.
 */
export interface TriagePacket {
  packetId: string;
  src: string;
  dst: string;
  ttl: number;
  urgency: 'normal' | 'warning' | 'sos';
  payload: Uint8Array; // The raw data payload carried by the packet
  hopPassport: string[]; // List of node IDs this packet has visited
  createdAt: number;
}

/**
 * Acknowledgment packet sent back to confirm receipt.
 */
export interface AckPacket {
  packetId: string;
}

/**
 * Envelope wrapper used by the physical transport layer to transmit messages.
 * Contains routing headers and the serialized payload.
 */
export interface PacketEnvelope {
  type: 'TRIAGE' | 'ACK';
  packetId: string;
  from: string;
  to: string;
  ttl: number;
  payload: Uint8Array; // The serialized inner packet (either TriagePacket or AckPacket)
}

/**
 * Report generated upon completion of a send operation, indicating whether it succeeded.
 */
export interface DeliveryReport {
  delivered: boolean;
  attempts: number;
  pathHint: string[];
}

/**
 * Telemetry structure representing node statistics.
 */
export interface Stats {
  queued: number;
  sent: number;
  acked: number;
  retried: number;
  forwarded: number;
  failed: number;
  dropped: number;
  bytesTotal: number;
}

/**
 * Callback signatures.
 */
export type ReceiveCallback = (packet: TriagePacket) => void;
export type StatsCallback = (stats: Stats) => void;

/**
 * Interface to inject randomness, allowing deterministic unit testing.
 */
export interface RandomProvider {
  random(): number;
  randomInRange(min: number, max: number): number;
}
