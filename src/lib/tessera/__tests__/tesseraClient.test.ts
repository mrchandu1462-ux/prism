import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchTesseraTokens,
  clearTesseraCache,
  getTesseraCachedTokens,
  TESSERA_TOKEN_DETAILS_ENDPOINT,
} from '../client';
import { parseTesseraTokenDetailsResponse, validateTesseraTokenItem } from '../types';

const MOCK_TESSERA_DATA = [
  {
    id: 'T-OpenAI',
    name: 'T-OpenAI',
    symbol: 'T-OpenAI',
    code: 'tOpenAI',
    sector: 'Artificial Intelligence',
    mint: 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ',
    markPrice: 812.79,
    holders: 8259,
    markValuation: 950000000000,
  },
  {
    id: 'T-Kalshi',
    name: 'T-Kalshi',
    symbol: 'T-Kalshi',
    code: 'tKalshi',
    sector: 'Prediction Markets',
    mint: 'TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ',
    markPrice: 413.8,
    holders: 2605,
    markValuation: 14000000000,
  },
  {
    id: 'T-SpaceX',
    name: 'T-SpaceX',
    symbol: 'T-SpaceX',
    code: 'tSpaceX',
    sector: 'Aerospace',
    mint: 'TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v',
    markPrice: 423.0,
    holders: 1274,
    markValuation: 800000000000,
  },
];

describe('Tessera API Client & Schema Validation', () => {
  beforeEach(() => {
    clearTesseraCache();
    vi.restoreAllMocks();
  });

  describe('Schema Validation', () => {
    it('validates a correct Tessera token item', () => {
      const item = validateTesseraTokenItem(MOCK_TESSERA_DATA[0]);
      expect(item).not.toBeNull();
      expect(item?.symbol).toBe('T-OpenAI');
      expect(item?.mint).toBe('oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ');
      expect(item?.markPrice).toBe(812.79);
      expect(item?.sector).toBe('Artificial Intelligence');
    });

    it('rejects an item with an invalid Solana mint address', () => {
      const item = validateTesseraTokenItem({
        ...MOCK_TESSERA_DATA[0],
        mint: 'NotAValidSolanaMintAddress!!!',
      });
      expect(item).toBeNull();
    });

    it('rejects an item with non-numeric or non-positive markPrice', () => {
      expect(
        validateTesseraTokenItem({
          ...MOCK_TESSERA_DATA[0],
          markPrice: 0,
        })
      ).toBeNull();

      expect(
        validateTesseraTokenItem({
          ...MOCK_TESSERA_DATA[0],
          markPrice: -50,
        })
      ).toBeNull();

      expect(
        validateTesseraTokenItem({
          ...MOCK_TESSERA_DATA[0],
          markPrice: NaN,
        })
      ).toBeNull();

      expect(
        validateTesseraTokenItem({
          ...MOCK_TESSERA_DATA[0],
          markPrice: '812.79',
        })
      ).toBeNull();
    });

    it('rejects malformed array / non-array root payloads', () => {
      expect(() => parseTesseraTokenDetailsResponse({ error: 'not an array' })).toThrow(
        /expected JSON array/i
      );
      expect(() => parseTesseraTokenDetailsResponse('string')).toThrow(
        /expected JSON array/i
      );
    });

    it('throws error when array contains only invalid objects', () => {
      expect(() =>
        parseTesseraTokenDetailsResponse([
          { bad: 'data' },
          { id: '', mint: 'invalid' },
        ])
      ).toThrow(/no valid token records/i);
    });
  });

  describe('fetchTesseraTokens', () => {
    it('successfully fetches and parses tokens from mock fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_TESSERA_DATA,
      });

      const tokens = await fetchTesseraTokens({
        fetchFn: mockFetch as any,
      });

      expect(tokens).toHaveLength(3);
      expect(tokens[0].symbol).toBe('T-OpenAI');
      expect(tokens[1].symbol).toBe('T-Kalshi');
      expect(tokens[2].symbol).toBe('T-SpaceX');
      expect(mockFetch).toHaveBeenCalledWith(
        TESSERA_TOKEN_DETAILS_ENDPOINT,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('caches response in memory and serves subsequent calls from cache', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_TESSERA_DATA,
      });

      const firstCall = await fetchTesseraTokens({ fetchFn: mockFetch as any });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(getTesseraCachedTokens()).not.toBeNull();

      const secondCall = await fetchTesseraTokens({ fetchFn: mockFetch as any });
      expect(mockFetch).toHaveBeenCalledTimes(1); // Not called again
      expect(secondCall).toEqual(firstCall);

      // Force refresh bypasses cache
      const thirdCall = await fetchTesseraTokens({
        fetchFn: mockFetch as any,
        forceRefresh: true,
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(thirdCall).toEqual(firstCall);
    });

    it('handles HTTP error status codes gracefully without fabrication', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'Rate limit exceeded',
      });

      await expect(
        fetchTesseraTokens({ fetchFn: mockFetch as any })
      ).rejects.toThrow(/HTTP 503/);
    });

    it('handles JSON parsing failure gracefully without fabrication', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        },
      });

      await expect(
        fetchTesseraTokens({ fetchFn: mockFetch as any })
      ).rejects.toThrow(/Failed to parse JSON/);
    });

    it('handles request timeout cleanly', async () => {
      const mockFetch = vi.fn().mockImplementation((url, options) => {
        return new Promise((_, reject) => {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      await expect(
        fetchTesseraTokens({ fetchFn: mockFetch as any, timeoutMs: 10 })
      ).rejects.toThrow(/timed out/i);
    });
  });
});
