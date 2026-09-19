import { parseTesseraTokenDetailsResponse, TesseraToken } from './types';

export const TESSERA_TOKEN_DETAILS_ENDPOINT =
  process.env.NEXT_PUBLIC_TESSERA_API_URL || 'https://rest-api.tessera.pe/v1/public/token-details';

export interface TesseraClientOptions {
  endpoint?: string;
  forceRefresh?: boolean;
  ttlMs?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

interface CacheEntry {
  tokens: TesseraToken[];
  timestamp: number;
}

let memoryCache: CacheEntry | null = null;
export const DEFAULT_CACHE_TTL_MS = 60_000; // 1 minute
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000; // 10 seconds

/**
 * Clears the in-memory cache for Tessera token details
 */
export function clearTesseraCache(): void {
  memoryCache = null;
}

/**
 * Inspects current cached state without triggering a network call
 */
export function getTesseraCachedTokens(): { tokens: TesseraToken[]; timestamp: number } | null {
  if (!memoryCache) return null;
  return {
    tokens: [...memoryCache.tokens],
    timestamp: memoryCache.timestamp,
  };
}

/**
 * Fetches token details from the authoritative Tessera public API.
 * 
 * Rules Adherence:
 * - Do not fabricate fallback token data on network/parsing failure.
 * - Handles malformed responses and network timeouts.
 * - In-memory caching with TTL and force-refresh support.
 */
export function getDefaultTesseraEndpoint(): string {
  if (typeof window !== 'undefined') {
    return '/api/tessera/token-details';
  }
  return TESSERA_TOKEN_DETAILS_ENDPOINT;
}

export async function fetchTesseraTokens(
  options: TesseraClientOptions = {}
): Promise<TesseraToken[]> {
  const {
    endpoint = getDefaultTesseraEndpoint(),
    forceRefresh = false,
    ttlMs = DEFAULT_CACHE_TTL_MS,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    fetchFn = fetch,
  } = options;

  const now = Date.now();

  // 1. Check in-memory cache if not forced
  if (!forceRefresh && memoryCache && now - memoryCache.timestamp < ttlMs) {
    return memoryCache.tokens;
  }

  // 2. Fetch from remote endpoint with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Tessera API request failed with HTTP ${response.status} (${response.statusText}): ${errorText.slice(0, 200)}`
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (parseErr: any) {
      throw new Error(`Failed to parse JSON response from Tessera API: ${parseErr?.message || 'Invalid JSON'}`);
    }

    const tokens = parseTesseraTokenDetailsResponse(json);

    // Update cache
    memoryCache = {
      tokens,
      timestamp: Date.now(),
    };

    return tokens;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Tessera API request timed out after ${timeoutMs}ms.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
