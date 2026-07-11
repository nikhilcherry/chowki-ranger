/**
 * A duty cycle spacing queue. Enforces a minimum interval between consecutive
 * packet transmissions. It does not know anything about networking or UDP.
 */
export class TransmissionQueue<T> {
  private readonly queue: { item: T; resolve: () => void }[] = [];
  private lastTransmissionTime = 0;
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;

  constructor(intervalMs = 1000) {
    this.intervalMs = intervalMs;
  }

  /**
   * Enqueues an item and returns a promise that resolves when the item is allowed to be transmitted.
   */
  public enqueue(item: T): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push({ item, resolve });
      this.process();
    });
  }

  /**
   * Clears all pending elements in the queue and cancels any active timer.
   */
  public clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue.length = 0;
    this.isProcessing = false;
    this.lastTransmissionTime = 0;
  }

  /**
   * Gets the number of items currently waiting in the queue.
   */
  public get length(): number {
    return this.queue.length;
  }

  private process(): void {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    const now = Date.now();
    const elapsed = now - this.lastTransmissionTime;

    if (elapsed >= this.intervalMs) {
      const next = this.queue.shift();
      if (next) {
        this.lastTransmissionTime = Date.now();
        this.isProcessing = false;
        next.resolve();
        // Immediately try to schedule the next item in the queue
        this.process();
      } else {
        this.isProcessing = false;
      }
    } else {
      const delay = this.intervalMs - elapsed;
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(() => {
        this.timer = null;
        this.isProcessing = false;
        this.process();
      }, delay);
    }
  }
}
