export enum LogLevel {
  INFO = 0,
  WARN = 1,
  ERROR = 2,
}

/**
 * Structured logger to replace scattered console.logs with formatted level-based outputs.
 */
export class Logger {
  private readonly nodeId: string;
  private readonly minLevel: LogLevel;

  constructor(nodeId: string, minLevel: LogLevel = LogLevel.INFO) {
    this.nodeId = nodeId;
    this.minLevel = minLevel;
  }

  /**
   * Logs an informational message.
   */
  public info(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.INFO) {
      console.log(`[INFO] [${this.nodeId}] ${message}`, ...args);
    }
  }

  /**
   * Logs a warning message.
   */
  public warn(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.WARN) {
      console.warn(`[WARN] [${this.nodeId}] ${message}`, ...args);
    }
  }

  /**
   * Logs an error message.
   */
  public error(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.ERROR) {
      console.error(`[ERROR] [${this.nodeId}] ${message}`, ...args);
    }
  }
}
