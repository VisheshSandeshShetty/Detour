// A small wrapper around fetch() used for every call to an outside service.
// It adds a User-Agent, a timeout, and turns every kind of failure into one error type.

import dns from 'node:dns';
import { config } from '../config';

// On WSL and some home networks IPv6 is advertised but does not work. Node would then wait for
// IPv6 and fail with "Network error" while curl -4 works. Asking for IPv4 first avoids that.
dns.setDefaultResultOrder('ipv4first');

export class UpstreamError extends Error {
  status: number | null; // HTTP status, or null for network errors and timeouts
  body: unknown; // parsed JSON error body when the service sent one (OSRM does)

  constructor(message: string, status: number | null = null, body: unknown = null) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.body = body;
  }
}

interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = 20000, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'application/json',
        ...(headers as Record<string, string> | undefined),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    // The real reason (ECONNRESET, ENOTFOUND, ETIMEDOUT ...) is hidden inside error.cause
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    const reason = cause?.code ?? cause?.message;
    throw new UpstreamError(timedOut ? `Timed out after ${timeoutMs / 1000}s` : `Network error${reason ? ` (${reason})` : ''}`);
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // the error response was not JSON, that is fine
    }
    throw new UpstreamError(`HTTP ${response.status}`, response.status, body);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new UpstreamError('The service returned invalid JSON');
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
