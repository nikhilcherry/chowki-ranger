import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retry } from '../src/retry.js';

describe('Retry Orchestrator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return value immediately on success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retry(fn, { maxRetries: 3, initialDelayMs: 100 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed if within limit', async () => {
    vi.useFakeTimers();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const promise = retry(fn, { maxRetries: 3, initialDelayMs: 100 });
    
    // Resolve all timer delays asynchronously
    await vi.runAllTimersAsync();
    
    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('should throw the final error on retry exhaustion', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(new Error('Persistent Fail'));

    const promise = retry(fn, { maxRetries: 3, initialDelayMs: 100 });
    promise.catch(() => {});
    
    await vi.runAllTimersAsync();
    
    await expect(promise).rejects.toThrow('Persistent Fail');
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    vi.useRealTimers();
  });

  it('should execute backoff exponentially (100ms -> 200ms -> 400ms)', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(new Error('Fail'));
    const onRetry = vi.fn();

    const promise = retry(fn, { maxRetries: 3, initialDelayMs: 100, onRetry });
    promise.catch(() => {});

    // Initial execution runs immediately and fails.
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance 50ms - should not trigger 1st retry (needs 100ms)
    await vi.advanceTimersByTimeAsync(50);
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance another 60ms (total 110ms) - triggers 1st retry
    await vi.advanceTimersByTimeAsync(60);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));

    // Advance 150ms (total 260ms) - should not trigger 2nd retry (needs 200ms since last failure)
    await vi.advanceTimersByTimeAsync(150);
    expect(fn).toHaveBeenCalledTimes(2);

    // Advance another 60ms (total 320ms since start, 210ms since last) - triggers 2nd retry
    await vi.advanceTimersByTimeAsync(60);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error));

    // Advance 350ms - should not trigger 3rd retry (needs 400ms since last failure)
    await vi.advanceTimersByTimeAsync(350);
    expect(fn).toHaveBeenCalledTimes(3);

    // Advance another 60ms - triggers 3rd retry
    await vi.advanceTimersByTimeAsync(60);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(onRetry).toHaveBeenCalledWith(3, expect.any(Error));

    // Next timer runs and fails, throwing exhaustion
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('Fail');
    vi.useRealTimers();
  });
});
