import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UDPTransport } from '../src/udpTransport.js';
import { ChowkiConfig } from '../src/config.js';
import { TriagePacket, RandomProvider } from '../src/types.js';

class MockRandomProvider implements RandomProvider {
  public random(): number {
    return 0.0; // no loss
  }

  public randomInRange(min: number, max: number): number {
    return 10; // 10ms delay for fast test executions
  }
}

describe('UDPTransport - Relay and Multi-hop', () => {
  let rand: MockRandomProvider;
  let transport1: UDPTransport;
  let transport2: UDPTransport;
  let transport3: UDPTransport;

  beforeEach(async () => {
    rand = new MockRandomProvider();

    // Topology: cp1 <-> cp2 <-> cp3
    // cp1 can only talk to cp2
    const config1: ChowkiConfig = {
      id: 'cp1',
      port: 15001,
      peers: [{ id: 'cp2', host: '127.0.0.1', port: 15002 }],
      loraLoss: 0.0,
    };

    // cp2 can talk to cp1 and cp3
    const config2: ChowkiConfig = {
      id: 'cp2',
      port: 15002,
      peers: [
        { id: 'cp1', host: '127.0.0.1', port: 15001 },
        { id: 'cp3', host: '127.0.0.1', port: 15003 },
      ],
      loraLoss: 0.0,
    };

    // cp3 can only talk to cp2
    const config3: ChowkiConfig = {
      id: 'cp3',
      port: 15003,
      peers: [{ id: 'cp2', host: '127.0.0.1', port: 15002 }],
      loraLoss: 0.0,
    };

    transport1 = new UDPTransport(config1, rand, 10, 50, 10);
    transport2 = new UDPTransport(config2, rand, 10, 50, 10);
    transport3 = new UDPTransport(config3, rand, 10, 50, 10);

    await transport1.start();
    await transport2.start();
    await transport3.start();
  });

  afterEach(async () => {
    await transport1.close();
    await transport2.close();
    await transport3.close();
  });

  it('should successfully relay packets: cp1 -> cp2 -> cp3 and route the ACK back', async () => {
    const receivedPackets: TriagePacket[] = [];
    transport3.onReceive((p) => {
      receivedPackets.push(p);
    });

    const packet: TriagePacket = {
      packetId: 'relay-1',
      src: 'cp1',
      dst: 'cp3',
      ttl: 5,
      urgency: 'normal',
      payload: new Uint8Array([10, 20]),
      hopPassport: [],
      createdAt: Date.now(),
    };

    const report = await transport1.sendTriage(packet, 'cp3');

    // Verify delivery
    expect(report.delivered).toBe(true);
    // Path hint should capture the full traversal passport
    expect(report.pathHint).toEqual(['cp1', 'cp2', 'cp3']);

    // Check that destination received it
    expect(receivedPackets.length).toBe(1);
    expect(receivedPackets[0].packetId).toBe('relay-1');
  });

  it('should drop packet due to TTL expiration before reaching destination', async () => {
    const receivedPackets: TriagePacket[] = [];
    transport3.onReceive((p) => {
      receivedPackets.push(p);
    });

    const packet: TriagePacket = {
      packetId: 'ttl-1',
      src: 'cp1',
      dst: 'cp3',
      ttl: 1, // Only allowed to take 1 hop (from cp1 to cp2). At cp2, TTL becomes 0 and gets dropped.
      urgency: 'normal',
      payload: new Uint8Array([99]),
      hopPassport: [],
      createdAt: Date.now(),
    };

    const report = await transport1.sendTriage(packet, 'cp3');

    expect(report.delivered).toBe(false);
    expect(receivedPackets.length).toBe(0);

    // Verify that cp2 incremented its dropped stats due to TTL expiration
    const stats2 = transport2.stats.getStats();
    expect(stats2.dropped).toBeGreaterThan(0);
  });

  it('should suppress duplicate packets', async () => {
    // We send a packet that cp2 receives. We then verify that if the same packet ID is sent
    // again to cp2, it ignores it.
    const receivedPackets: TriagePacket[] = [];
    transport2.onReceive((p) => {
      receivedPackets.push(p);
    });

    const packet: TriagePacket = {
      packetId: 'dup-1',
      src: 'cp1',
      dst: 'cp2',
      ttl: 5,
      urgency: 'normal',
      payload: new Uint8Array([42]),
      hopPassport: [],
      createdAt: Date.now(),
    };

    // Send first time
    const report1 = await transport1.sendTriage(packet, 'cp2');
    expect(report1.delivered).toBe(true);
    expect(receivedPackets.length).toBe(1);

    // Reset receivedPackets list
    receivedPackets.length = 0;

    // Send second time (simulating duplicate flood)
    const report2 = await transport1.sendTriage(packet, 'cp2');
    // Note: Since cp2 suppresses it as duplicate, cp2 does not trigger receive and does not return ACK.
    // So the second sendTriage should fail/timeout.
    expect(report2.delivered).toBe(false);
    expect(receivedPackets.length).toBe(0);

    const stats2 = transport2.stats.getStats();
    // Verify that cp2 dropped the duplicate
    expect(stats2.dropped).toBeGreaterThan(0);
  });
});
