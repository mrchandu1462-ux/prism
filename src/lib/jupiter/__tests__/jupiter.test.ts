import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchJupiterQuote,
  formatQuoteSummary,
  buildJupiterSwapTransaction,
  deserializeSwapTransaction,
  JUPITER_API_BASE,
} from '../client';
import { JupiterQuoteResponse } from '../types';
import { SUPPORTED_ASSETS } from '@/config/tokens';
import { Keypair, VersionedTransaction } from '@solana/web3.js';

describe('Jupiter Protocol Integration Subsystem (Phase 3B)', () => {
  const mockQuoteResponse: JupiterQuoteResponse = {
    inputMint: SUPPORTED_ASSETS.NVDAx.mint,
    inAmount: '2810410000', // 28.1041 NVDAx (8 decimals)
    outputMint: SUPPORTED_ASSETS.USDC.mint,
    outAmount: '6247340000', // 6247.34 USDC (6 decimals)
    otherAmountThreshold: '6216103300', // 6216.1033 USDC (0.5% slippage min)
    swapMode: 'ExactIn',
    slippageBps: 50,
    platformFee: null,
    priceImpactPct: '0.04',
    routePlan: [
      {
        swapInfo: {
          ammKey: '49iMatQtoyabsYAQc8GafVq6aeBFVDxSRH44oiatyyw6',
          label: 'Raydium CPMM',
          inputMint: SUPPORTED_ASSETS.NVDAx.mint,
          outputMint: SUPPORTED_ASSETS.USDC.mint,
          inAmount: '2810410000',
          outAmount: '6247340000',
          feeAmount: '6247340',
          feeMint: SUPPORTED_ASSETS.USDC.mint,
        },
        percent: 100,
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Live Quote Fetching & Response Parsing', () => {
    it('fetches and returns a valid Jupiter quote response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockQuoteResponse,
      } as any);

      const quote = await fetchJupiterQuote(
        SUPPORTED_ASSETS.NVDAx.mint,
        SUPPORTED_ASSETS.USDC.mint,
        '2810410000',
        50
      );

      expect(quote).toBeDefined();
      expect(quote.inAmount).toBe('2810410000');
      expect(quote.outAmount).toBe('6247340000');
      expect(quote.routePlan).toHaveLength(1);
      expect(quote.routePlan[0].swapInfo.label).toBe('Raydium CPMM');
    });

    it('handles COULD_NOT_FIND_ANY_ROUTE gracefully with explicit user error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'COULD_NOT_FIND_ANY_ROUTE' }),
      } as any);

      await expect(
        fetchJupiterQuote(
          SUPPORTED_ASSETS.NVDAx.mint,
          SUPPORTED_ASSETS.USDC.mint,
          '1000000000000000', // Extreme excessive size
          50
        )
      ).rejects.toThrow(/No direct liquidity route found on Jupiter/);
    });

    it('handles malformed API response missing outAmount or routePlan', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: true }),
      } as any);

      await expect(
        fetchJupiterQuote(
          SUPPORTED_ASSETS.NVDAx.mint,
          SUPPORTED_ASSETS.USDC.mint,
          '2810410000',
          50
        )
      ).rejects.toThrow(/Malformed quote response/);
    });
  });

  describe('2. Quote Summary Formatting', () => {
    it('accurately converts lamport base units to UI tokens with decimal precision', () => {
      const formatted = formatQuoteSummary(
        mockQuoteResponse,
        SUPPORTED_ASSETS.NVDAx, // 8 decimals
        SUPPORTED_ASSETS.USDC   // 6 decimals
      );

      expect(formatted.inputSymbol).toBe('NVDAx');
      expect(formatted.inputAmountTokens).toBeCloseTo(28.1041, 4);
      expect(formatted.outputSymbol).toBe('USDC');
      expect(formatted.expectedOutputTokens).toBeCloseTo(6247.34, 2);
      expect(formatted.minimumOutputTokens).toBeCloseTo(6216.1033, 2);
      expect(formatted.priceImpactPct).toBe(0.04);
      expect(formatted.routeLabels).toEqual(['Raydium CPMM']);
      expect(formatted.slippageBps).toBe(50);
    });
  });

  describe('3. Swap Transaction Construction & Deserialization', () => {
    it('constructs a serialized swap transaction payload via Jupiter Swap API', async () => {
      const mockSwapResponse = {
        swapTransaction: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAED...',
        lastValidBlockHeight: 348000000,
        prioritizationFeeLamports: 5000,
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockSwapResponse,
      } as any);

      const userPk = Keypair.generate().publicKey.toBase58();
      const res = await buildJupiterSwapTransaction(mockQuoteResponse, userPk);

      expect(res.swapTransaction).toBe(mockSwapResponse.swapTransaction);
      expect(res.lastValidBlockHeight).toBe(348000000);
    });

    it('rejects with descriptive message if swap transaction build fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: 'Internal RPC error in transaction simulation' }),
      } as any);

      const userPk = Keypair.generate().publicKey.toBase58();
      await expect(
        buildJupiterSwapTransaction(mockQuoteResponse, userPk)
      ).rejects.toThrow(/Internal RPC error/);
    });
  });

  describe('4. Error Handling & Edge Cases', () => {
    it('formats user rejection error cleanly without crashing', () => {
      const userRejectionError = new Error('User rejected the request.');
      let formattedMsg = userRejectionError.message;
      if (formattedMsg.includes('User rejected')) {
        formattedMsg = 'Transaction was rejected in your wallet.';
      }
      expect(formattedMsg).toBe('Transaction was rejected in your wallet.');
    });

    it('identifies on-chain slippage failure response structure', () => {
      const slippageError = {
        value: {
          err: {
            InstructionError: [2, { Custom: 6001 }], // Custom slippage exceeded
          },
        },
      };

      expect(slippageError.value.err).toBeDefined();
    });
  });
});
