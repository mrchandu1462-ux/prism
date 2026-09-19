import { VersionedTransaction } from '@solana/web3.js';
import {
  FormattedQuoteSummary,
  JupiterQuoteResponse,
  JupiterSwapRequestBody,
  JupiterSwapResponse,
} from './types';
import { SupportedAssetConfig } from '@/types';

export const JUPITER_API_BASE = 'https://api.jup.ag';

/**
 * Fetches a real quote from Jupiter Swap API v1
 */
export async function fetchJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: string,
  slippageBps: number = 50, // 0.5% default
  apiKey?: string
): Promise<JupiterQuoteResponse> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountLamports,
    slippageBps: slippageBps.toString(),
  });

  const url = `${JUPITER_API_BASE}/swap/v1/quote?${params.toString()}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `Jupiter quote failed (HTTP ${response.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error) errorMessage = parsed.error;
      else if (parsed.message) errorMessage = parsed.message;
    } catch {
      if (errorBody) errorMessage = `${errorMessage}: ${errorBody}`;
    }

    if (errorMessage.includes('COULD_NOT_FIND_ANY_ROUTE')) {
      throw new Error(
        'No direct liquidity route found on Jupiter for this token size. Slippage or liquidity constraints exceeded.'
      );
    }

    throw new Error(errorMessage);
  }

  const data: JupiterQuoteResponse = await response.json();
  if (!data.outAmount || !data.routePlan) {
    throw new Error('Malformed quote response received from Jupiter API.');
  }

  return data;
}

/**
 * Formats a raw Jupiter Quote into clear, human-readable numbers
 */
export function formatQuoteSummary(
  quote: JupiterQuoteResponse,
  inputAsset: SupportedAssetConfig,
  outputAsset: SupportedAssetConfig
): FormattedQuoteSummary {
  const inputAmountTokens = Number(quote.inAmount) / Math.pow(10, inputAsset.decimals);
  const expectedOutputTokens = Number(quote.outAmount) / Math.pow(10, outputAsset.decimals);
  const minimumOutputTokens = Number(quote.otherAmountThreshold) / Math.pow(10, outputAsset.decimals);
  const priceImpactPct = parseFloat(quote.priceImpactPct) || 0;

  const routeLabels = quote.routePlan.map(
    (step) => step.swapInfo.label || 'DEX Pool'
  );

  return {
    inputSymbol: inputAsset.symbol,
    inputAmountTokens,
    inputAmountLamports: quote.inAmount,
    outputSymbol: outputAsset.symbol,
    expectedOutputTokens,
    minimumOutputTokens,
    priceImpactPct,
    routeLabels: routeLabels.length > 0 ? routeLabels : ['Direct AMM'],
    slippageBps: quote.slippageBps,
    rawQuote: quote,
  };
}

/**
 * Builds a serialized VersionedTransaction from Jupiter Swap API
 */
export async function buildJupiterSwapTransaction(
  quoteResponse: JupiterQuoteResponse,
  userPublicKey: string,
  apiKey?: string
): Promise<JupiterSwapResponse> {
  const requestBody: JupiterSwapRequestBody = {
    userPublicKey,
    quoteResponse,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
  };

  const url = `${JUPITER_API_BASE}/swap/v1/swap`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `Jupiter swap transaction build failed (HTTP ${response.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error) errorMessage = parsed.error;
      else if (parsed.message) errorMessage = parsed.message;
    } catch {
      if (errorBody) errorMessage = `${errorMessage}: ${errorBody}`;
    }
    throw new Error(errorMessage);
  }

  const data: JupiterSwapResponse = await response.json();
  if (!data.swapTransaction) {
    throw new Error('Jupiter API returned an empty swap transaction payload.');
  }

  return data;
}

/**
 * Deserializes base64 string into a VersionedTransaction
 */
export function deserializeSwapTransaction(swapTransactionBase64: string): VersionedTransaction {
  const buffer = Buffer.from(swapTransactionBase64, 'base64');
  return VersionedTransaction.deserialize(buffer);
}
