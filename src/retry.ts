export interface RetryOptions {
  maxRetries: number;
  initialDelayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Universal retry runner. Executes an asynchronous operation, retrying it with
 * exponential backoff if it throws an error.
 * Completely decoupled from networking, ACKs, and routing.
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const maxRetries = options.maxRetries;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      attempt++;
      if (options.onRetry) {
        options.onRetry(attempt, error as Error);
      }
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
