import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UDPTransport } from '../src/udpTransport.js';
import { ChowkiConfig, PeerConfig } from '../src/config.js';
import { TriagePacket, RandomProvider } from '../src/types.js';
import { PayloadTooLargeError } from '../src/errors.js';

class MockRandomProvider implements RandomProvider {
  public val = 0.0; // no loss
  public lat = 10;  // 10ms latency for speed in tests

  public random(): number {
    return this.val;
  }

  public randomInRange(min: number, max: number): number {
    return this.lat;
  }
}

describe('UDPTransport - Basic Operations', () => {
  let config1: ChowkiConfig;
  let config2: ChowkiConfig;
  let rand: MockRandomProvider;
  let transport1: UDPTransport;
  let transport2: UDPTransport;

  beforeEach(async () => {
    rand = new MockRandomProvider();

    config1 = {
      id: 'cp1',
      port: 14001,
      peers: [{ id: 'cp2', host: '127.0.0.1', port: 14002 }],
      loraLoss: 0.0,
    };

    config2 = {
      id: 'cp2',
      port: 14002,
      peers: [{ id: 'cp1', host: '127.0.0.1', port: 14001 }],
      loraLoss: 0.0,
    };

    transport1 = new UDPTransport(config1, rand, 10, 50, 10); // 10ms spacing, 50ms ACK timeout, 10ms retry delay
    transport2 = new UDPTransport(config2, rand, 10, 50, 10);

    await transport1.start();
    await transport2.start();
  });

  afterEach(async () => {
    await transport1.close();
    await transport2.close();
  });

  it('should throw PayloadTooLargeError if payload exceeds 200 bytes', async () => {
    const hugePayload = new Uint8Array(201);
    const packet: TriagePacket = {
      packetId: 'p1',
      src: 'cp1',
      dst: 'cp2',
      ttl: 5,
      urgency: 'normal',
      payload: hugePayload,
      hopPassport: [],
      createdAt: Date.now(),
    };

    await expect(transport1.sendTriage(packet, 'cp2')).rejects.toThrow(PayloadTooLargeError);
  });

  it('should deliver packet to peer and return success report with pathHint', async () => {
    const receivedPackets: TriagePacket[] = [];
    transport2.onReceive((p) => {
      receivedPackets.push(p);
    });

    const packet: TriagePacket = {
      packetId: 'p2',
      src: 'cp1',
      dst: 'cp2',
      ttl: 5,
      urgency: 'normal',
      payload: new Uint8Array([1, 2, 3]),
      hopPassport: [],
      createdAt: Date.now(),
    };

    const report = await transport1.sendTriage(packet, 'cp2');

    expect(report.delivered).toBe(true);
    expect(report.attempts).toBe(1);
    expect(report.pathHint).toContain('cp1');
    expect(report.pathHint).toContain('cp2');

    expect(receivedPackets.length).toBe(1);
    expect(receivedPackets[0].packetId).toBe('p2');
    expect(Array.from(receivedPackets[0].payload)).toEqual([1, 2, 3]);
  });

  it('should report failure if ACK is never received (timeout / retry exhausted)', async () => {
    // Close receiver transport2 so that ACKs are never returned
    await transport2.close();

    const packet: TriagePacket = {
      packetId: 'p3',
      src: 'cp1',
      dst: 'cp2',
      ttl: 5,
      urgency: 'normal', // 3 retries (total 4 attempts)
      payload: new Uint8Array([4, 5]),
      hopPassport: [],
      createdAt: Date.now(),
    };

    // Speed up retries in this test by mocking setTimeout delay in retry.ts
    // or just let it run (with max 3 retries, initial delay 10ms -> 10ms + 20ms + 40ms = 70ms total wait time)
    const report = await transport1.sendTriage(packet, 'cp2');

    expect(report.delivered).toBe(false);
    expect(report.attempts).toBeGreaterThanOrEqual(2);
  });

  it('should drop packets based on environment LORA_LOSS roll', async () => {
    rand.val = 0.5; // force simulated drop since 0.5 < 0.95
    const lossConfig: ChowkiConfig = {
      id: 'cp1-loss',
      port: 14003,
      peers: [{ id: 'cp2-loss', host: '127.0.0.1', port: 14004 }],
      loraLoss: 0.95,
    };
    const targetConfig: ChowkiConfig = {
      id: 'cp2-loss',
      port: 14004,
      peers: [{ id: 'cp1-loss', host: '127.0.0.1', port: 14003 }],
      loraLoss: 0.0,
    };

    const transportWithLoss = new UDPTransport(lossConfig, rand, 10, 50, 10);
    const transportTarget = new UDPTransport(targetConfig, rand, 10, 50, 10);

    await transportWithLoss.start();
    await transportTarget.start();

    const packet: TriagePacket = {
      packetId: 'p4',
      src: 'cp1-loss',
      dst: 'cp2-loss',
      ttl: 5,
      urgency: 'normal',
      payload: new Uint8Array([7, 8]),
      hopPassport: [],
      createdAt: Date.now(),
    };

    const report = await transportWithLoss.sendTriage(packet, 'cp2-loss');
    expect(report.delivered).toBe(false);

    const stats = transportWithLoss.stats.getStats();
    expect(stats.dropped).toBeGreaterThan(0);

    await transportWithLoss.close();
    await transportTarget.close();
  });

  it('should track telemetry stats (queued, sent, acked, bytesTotal)', async () => {
    const packet: TriagePacket = {
      packetId: 'p5',
      src: 'cp1',
      dst: 'cp2',
      ttl: 5,
      urgency: 'normal',
      payload: new Uint8Array([1, 2, 3]),
      hopPassport: [],
      createdAt: Date.now(),
    };

    const statsCallback = vi.fn();
    transport1.onStats(statsCallback);

    await transport1.sendTriage(packet, 'cp2');

    const stats = transport1.stats.getStats();
    expect(stats.queued).toBe(1);
    expect(stats.sent).toBe(1);
    expect(stats.acked).toBe(1);
    expect(stats.bytesTotal).toBeGreaterThan(0);
    expect(statsCallback).toHaveBeenCalled();
  });
});
