import { USDC_MINT_MAINNET } from '@/config/tokens';

/**
 * MULTI-SOURCE LIVE USD PRICING ENGINE
 * 
 * Rules Adherence:
 * - Rule 10: Never invent fake prices in production mode.
 * - Sourced from live DexScreener & Jupiter Price v3 endpoints.
 */

export interface TokenPriceRecord {
  mint: string;
  usdPrice: number;
  source: string;
  fetchedAt: number;
}

export interface FetchTokenPricesOptions {
  jupiterApiKey?: string;
  tesseraPrices?: Record<string, number>; // mint -> markPrice
}

export async function fetchLiveTokenPrices(
  mints: string[],
  options?: string | FetchTokenPricesOptions
): Promise<Record<string, TokenPriceRecord>> {
  const opts: FetchTokenPricesOptions =
    typeof options === 'string' ? { jupiterApiKey: options } : options || {};

  const { jupiterApiKey, tesseraPrices = {} } = opts;
  const results: Record<string, TokenPriceRecord> = {};
  const missingMints: string[] = [];

  // 1. Hardcoded / Pegged Stablecoin Defaults
  for (const mint of mints) {
    if (mint === USDC_MINT_MAINNET) {
      results[mint] = {
        mint,
        usdPrice: 1.0,
        source: 'PEG_ORACLE',
        fetchedAt: Date.now(),
      };
    } else if (typeof tesseraPrices[mint] === 'number' && tesseraPrices[mint] > 0) {
      // 2. Authoritative Tessera Mark Price for supported Tessera assets
      results[mint] = {
        mint,
        usdPrice: tesseraPrices[mint],
        source: 'TESSERA_ORACLE',
        fetchedAt: Date.now(),
      };
    } else {
      missingMints.push(mint);
    }
  }

  if (missingMints.length === 0) {
    return results;
  }

  // 3. Try DexScreener Public API (Works with zero API keys)
  try {
    const mintListStr = missingMints.join(',');
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintListStr}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.pairs)) {
        for (const pair of data.pairs) {
          const baseMint = pair.baseToken?.address;
          if (baseMint && missingMints.includes(baseMint) && !results[baseMint]) {
            const price = parseFloat(pair.priceUsd);
            if (!isNaN(price) && price > 0) {
              results[baseMint] = {
                mint: baseMint,
                usdPrice: price,
                source: 'DEXSCREENER',
                fetchedAt: Date.now(),
              };
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('DexScreener price query failed:', err);
  }

  // 4. Try Jupiter Price API v3 if API key available
  const stillMissing = missingMints.filter((m) => !results[m]);
  if (stillMissing.length > 0 && jupiterApiKey) {
    try {
      const ids = stillMissing.join(',');
      const response = await fetch(`https://api.jup.ag/price/v3?ids=${ids}`, {
        headers: {
          'x-api-key': jupiterApiKey,
        },
      });

      if (response.ok) {
        const data = await response.json();
        for (const [mint, info] of Object.entries<any>(data)) {
          if (info && typeof info.usdPrice === 'number') {
            results[mint] = {
              mint,
              usdPrice: info.usdPrice,
              source: 'JUPITER_V3',
              fetchedAt: Date.now(),
            };
          }
        }
      }
    } catch (err) {
      console.warn('Jupiter Price v3 query failed:', err);
    }
  }

  return results;
}
