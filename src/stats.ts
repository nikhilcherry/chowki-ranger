import { Stats, StatsCallback } from './types.js';

/**
 * Tracks node-specific transmission stats and exposes a callback for updates.
 */
export class StatsManager {
  private readonly stats: Stats = {
    queued: 0,
    sent: 0,
    acked: 0,
    retried: 0,
    forwarded: 0,
    failed: 0,
    dropped: 0,
    bytesTotal: 0,
  };

  private readonly callbacks: StatsCallback[] = [];

  /**
   * Registers a callback that fires whenever stats change.
   * Fires immediately with current stats.
   */
  public onStats(callback: StatsCallback): void {
    this.callbacks.push(callback);
    callback(this.getStats());
  }

  /**
   * Increments a specific counter state.
   */
  public increment(key: keyof Omit<Stats, 'bytesTotal'>): void {
    this.stats[key]++;
    this.emit();
  }

  /**
   * Accumulates the total physical byte count sent.
   */
  public addBytes(bytes: number): void {
    this.stats.bytesTotal += bytes;
    this.emit();
  }

  /**
   * Returns a copy of the current stats.
   */
  public getStats(): Stats {
    return { ...this.stats };
  }

  private emit(): void {
    const current = this.getStats();
    for (const cb of this.callbacks) {
      try {
        cb(current);
      } catch (error) {
        // Safely ignore callback errors to avoid disrupting transport flow
      }
    }
  }
}
