import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  calculateUnderlyingExposure,
  evaluateConcentrationRisk,
  generateRebalanceRecommendation,
} from '@/lib/engine';
import {
  adaptScannedAccountsToHoldings,
  DiagnosticsTokenRecord,
} from '@/lib/solana/adapter';
import {
  parseRawTokenAccount,
  ScannedTokenAccount,
} from '@/lib/solana/scanner';
import {
  fetchJupiterQuote,
  formatQuoteSummary,
  buildJupiterSwapTransaction,
  deserializeSwapTransaction,
} from '@/lib/jupiter/client';
import { SUPPORTED_ASSETS, USDC_MINT_MAINNET } from '@/config/tokens';
import { getETFConstituentData } from '@/lib/etf/registry';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, VersionedTransaction } from '@solana/web3.js';
import spyData from '../../../../public/data/etf-constituents/spy.json';
import qqqData from '../../../../public/data/etf-constituents/qqq.json';

describe('PRISM Phase 3C — Adversarial End-to-End Validation & Safety Audit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. ETF Provenance & Data Integrity Audit', () => {
    it('verifies that SPY constituent dataset contains full timestamped provenance metadata', () => {
      expect(spyData.provenance).toBeDefined();
      expect(spyData.provenance.source).toContain('State Street Global Advisors');
      expect(spyData.provenance.retrievalDate).toBe('2026-09-15T00:00:00.000Z');
      expect(spyData.provenance.effectiveDate).toBe('2026-09-15T00:00:00.000Z');
      expect(spyData.provenance.timestamp).toBe(1789430400000);
      expect(spyData.provenance.legalDisclaimer).toContain('Constituents do not reside on-chain');
      expect(spyData.constituents.length).toBeGreaterThan(20);
    });

    it('verifies that QQQ constituent dataset contains full timestamped provenance metadata', () => {
      expect(qqqData.provenance).toBeDefined();
      expect(qqqData.provenance.source).toContain('Invesco Ltd.');
      expect(qqqData.provenance.retrievalDate).toBe('2026-09-15T00:00:00.000Z');
      expect(qqqData.provenance.effectiveDate).toBe('2026-09-15T00:00:00.000Z');
      expect(qqqData.provenance.timestamp).toBe(1789430400000);
      expect(qqqData.provenance.legalDisclaimer).toContain('Constituents do not reside on-chain');
      expect(qqqData.constituents.length).toBeGreaterThan(20);
    });

    it('verifies that constituent weights sum to realistic positive numbers without NaN', () => {
      const spySum = spyData.constituents.reduce((acc, c) => acc + c.weight, 0);
      const qqqSum = qqqData.constituents.reduce((acc, c) => acc + c.weight, 0);

      expect(spySum).toBeGreaterThan(0.3); // Top 25 represent >35%
      expect(spySum).toBeLessThanOrEqual(1.0);
      expect(qqqSum).toBeGreaterThan(0.4); // Top 25 represent >45%
      expect(qqqSum).toBeLessThanOrEqual(1.0);

      for (const c of [...spyData.constituents, ...qqqData.constituents]) {
        expect(c.weight).toBeGreaterThan(0);
        expect(c.weight).toBeLessThan(0.2);
        expect(c.ticker.trim()).toBeTruthy();
        expect(c.sector.trim()).toBeTruthy();
      }
    });
  });

  describe('2. Empty Wallet & Zero-Balance Resilience Audit', () => {
    it('gracefully handles an empty wallet with 0 accounts', () => {
      const emptyAccounts: ScannedTokenAccount[] = [];
      const adapted = adaptScannedAccountsToHoldings(emptyAccounts, SUPPORTED_ASSETS, {});

      expect(adapted.engineHoldings).toHaveLength(0);
      expect(adapted.diagnostics).toHaveLength(0);
      expect(adapted.totalReportedUsd).toBe(0);

      const summary = calculateUnderlyingExposure(adapted.engineHoldings, getETFConstituentData);
      expect(summary.totalPortfolioUsd).toBe(0);
      expect(summary.underlyingCompanies).toHaveLength(0);
      expect(summary.sectorBreakdown).toHaveLength(0);

      const alerts = evaluateConcentrationRisk(summary, 10.0);
      expect(alerts).toHaveLength(0);

      const plan = generateRebalanceRecommendation(
        'NVDA',
        summary,
        10.0,
        SUPPORTED_ASSETS.USDC,
        (ticker) => Object.values(SUPPORTED_ASSETS).find((a) => a.underlyingTicker === ticker)
      );
      expect(plan).toBeNull();
    });

    it('ignores zero-balance accounts in holding calculations and marks diagnostic status', () => {
      const zeroBalanceAccounts: ScannedTokenAccount[] = [
        {
          pubkey: 'Account1',
          mint: SUPPORTED_ASSETS.NVDAx.mint,
          owner: 'Owner1',
          rawAmount: 0n,
          decimals: 8,
          uiAmount: 0,
          programId: TOKEN_2022_PROGRAM_ID.toBase58(),
          isToken2022: true,
        },
      ];

      const adapted = adaptScannedAccountsToHoldings(zeroBalanceAccounts, SUPPORTED_ASSETS, {});
      expect(adapted.engineHoldings).toHaveLength(0);
      expect(adapted.diagnostics).toHaveLength(1);
      expect(adapted.diagnostics[0].status).toBe('IGNORED_ZERO_BALANCE');
    });
  });

  describe('3. Manual Mathematical Proof against Multi-Asset Fixtures', () => {
    it('manually verifies mathematical precision across SPYx, QQQx, and direct NVDAx with odd amounts', () => {
      // Manual test fixture:
      // SPYx: 3.14159265 units @ $766.65 = $2,408.5020050225
      // QQQx: 2.71828182 units @ $722.91 = $1,965.0731004962
      // NVDAx: 5.00000000 units @ $222.46 = $1,112.3000000000
      // USDC: 500.000000 units @ $1.00 = $500.0000000000
      // Total Portfolio: $5,985.8751055187

      const spyUi = 3.14159265;
      const spyPrice = 766.65;
      const spyVal = spyUi * spyPrice; // $2,408.5020

      const qqqUi = 2.71828182;
      const qqqPrice = 722.91;
      const qqqVal = qqqUi * qqqPrice; // $1,965.0731

      const nvdaUi = 5.0;
      const nvdaPrice = 222.46;
      const nvdaVal = nvdaUi * nvdaPrice; // $1,112.30

      const usdcVal = 500.0;

      const totalCalculatedUsd = spyVal + qqqVal + nvdaVal + usdcVal; // ~$5,985.8751

      const holdings = [
        {
          mint: SUPPORTED_ASSETS.SPYx.mint,
          symbol: 'SPYx',
          name: 'SPDR S&P 500 Tokenized ETF',
          assetType: 'ETF' as const,
          rawBalance: BigInt(Math.floor(spyUi * 1e8)),
          uiAmount: spyUi,
          usdPrice: spyPrice,
          usdValue: spyVal,
          etfConstituentId: 'SPY',
        },
        {
          mint: SUPPORTED_ASSETS.QQQx.mint,
          symbol: 'QQQx',
          name: 'Invesco QQQ Tokenized ETF',
          assetType: 'ETF' as const,
          rawBalance: BigInt(Math.floor(qqqUi * 1e8)),
          uiAmount: qqqUi,
          usdPrice: qqqPrice,
          usdValue: qqqVal,
          etfConstituentId: 'QQQ',
        },
        {
          mint: SUPPORTED_ASSETS.NVDAx.mint,
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK' as const,
          rawBalance: BigInt(Math.floor(nvdaUi * 1e8)),
          uiAmount: nvdaUi,
          usdPrice: nvdaPrice,
          usdValue: nvdaVal,
          underlyingTicker: 'NVDA',
        },
        {
          mint: SUPPORTED_ASSETS.USDC.mint,
          symbol: 'USDC',
          name: 'USD Coin',
          assetType: 'STABLECOIN' as const,
          rawBalance: BigInt(500000000),
          uiAmount: 500,
          usdPrice: 1.0,
          usdValue: usdcVal,
        },
      ];

      const summary = calculateUnderlyingExposure(holdings, getETFConstituentData);
      expect(summary.totalPortfolioUsd).toBeCloseTo(totalCalculatedUsd, 2);

      // Manual look-through for NVIDIA:
      // SPY weight for NVDA: 0.0685 -> $2,408.5020 * 0.0685 = $164.982387
      // QQQ weight for NVDA: 0.0850 -> $1,965.0731 * 0.0850 = $167.031213
      // Direct NVDA: $1,112.30
      // Total NVDA Expected: $164.982387 + $167.031213 + $1,112.30 = $1,444.3136
      const nvda = summary.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(nvda).toBeDefined();
      expect(nvda?.directHoldingUsd).toBeCloseTo(1112.30, 2);
      expect(nvda?.etfDerivedUsd).toBeCloseTo(332.0136, 2);
      expect(nvda?.totalExposureUsd).toBeCloseTo(1444.3136, 2);

      const expectedPct = (1444.3136 / totalCalculatedUsd) * 100; // ~24.128%
      expect(nvda?.portfolioPercentage).toBeCloseTo(expectedPct, 2);

      // Rebalance test: Target 10% ($598.5875)
      // Allowed = $598.5875
      // Excess = $1,444.3136 - $598.5875 = $845.7261
      // Excess is less than Direct ($1,112.30), so can fully rebalance
      const plan = generateRebalanceRecommendation(
        'NVDA',
        summary,
        10.0,
        SUPPORTED_ASSETS.USDC,
        (ticker) => Object.values(SUPPORTED_ASSETS).find((a) => a.underlyingTicker === ticker)
      );

      expect(plan).not.toBeNull();
      expect(plan?.excessUsd).toBeCloseTo(845.7261, 2);
      expect(plan?.sellAmountUsd).toBeCloseTo(845.7261, 2);
      expect(plan?.sellAmountTokens).toBeCloseTo(845.7261 / nvdaPrice, 4); // ~3.80168 NVDAx
      expect(plan?.isConstrainedByDirectHolding).toBe(false);
      expect(plan?.projectedNewPercentage).toBeCloseTo(10.0, 2);
    });
  });

  describe('4. Jupiter Adversarial & Failure Scenarios', () => {
    it('handles Jupiter 429 rate limit error gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Too Many Requests',
      } as any);

      await expect(
        fetchJupiterQuote(
          SUPPORTED_ASSETS.NVDAx.mint,
          SUPPORTED_ASSETS.USDC.mint,
          '100000000',
          50
        )
      ).rejects.toThrow(/Jupiter quote failed \(HTTP 429\)/);
    });

    it('handles Jupiter 503 service unavailable error gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Temporarily Unavailable',
      } as any);

      await expect(
        fetchJupiterQuote(
          SUPPORTED_ASSETS.NVDAx.mint,
          SUPPORTED_ASSETS.USDC.mint,
          '100000000',
          50
        )
      ).rejects.toThrow(/Jupiter quote failed \(HTTP 503\)/);
    });

    it('handles swap transaction build failure with custom RPC simulation error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({ error: 'Transaction simulation failed: Blockhash not found' }),
      } as any);

      const mockQuote: any = {
        inputMint: SUPPORTED_ASSETS.NVDAx.mint,
        outputMint: SUPPORTED_ASSETS.USDC.mint,
        inAmount: '100000000',
        outAmount: '222460000',
        otherAmountThreshold: '221347700',
        routePlan: [],
      };

      await expect(
        buildJupiterSwapTransaction(mockQuote, Keypair.generate().publicKey.toBase58())
      ).rejects.toThrow(/Transaction simulation failed: Blockhash not found/);
    });
  });

  describe('5. Post-Swap Recalculation Simulation', () => {
    it('verifies that rebalancing direct NVDAx reduces underlying exposure to target floor', () => {
      // Initial state: $10k portfolio with $2k NVDAx (20%)
      const initialHoldings = [
        {
          mint: SUPPORTED_ASSETS.NVDAx.mint,
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK' as const,
          rawBalance: 1600000000n,
          uiAmount: 16,
          usdPrice: 125,
          usdValue: 2000,
          underlyingTicker: 'NVDA',
        },
        {
          mint: SUPPORTED_ASSETS.USDC.mint,
          symbol: 'USDC',
          name: 'USD Coin',
          assetType: 'STABLECOIN' as const,
          rawBalance: 8000000000n,
          uiAmount: 8000,
          usdPrice: 1.0,
          usdValue: 8000,
        },
      ];

      const initialSummary = calculateUnderlyingExposure(initialHoldings, getETFConstituentData);
      expect(initialSummary.underlyingCompanies[0].portfolioPercentage).toBe(20.0);

      // Rebalance plan to 10% target: Sell $1,000 NVDAx -> USDC
      const plan = generateRebalanceRecommendation(
        'NVDA',
        initialSummary,
        10.0,
        SUPPORTED_ASSETS.USDC,
        (ticker) => Object.values(SUPPORTED_ASSETS).find((a) => a.underlyingTicker === ticker)
      );

      expect(plan?.sellAmountUsd).toBe(1000);
      expect(plan?.sellAmountTokens).toBe(8); // 8 NVDAx @ $125

      // Post-swap state: 8 NVDAx remaining ($1,000), 9,000 USDC ($9,000)
      const postSwapHoldings = [
        {
          mint: SUPPORTED_ASSETS.NVDAx.mint,
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK' as const,
          rawBalance: 800000000n,
          uiAmount: 8,
          usdPrice: 125,
          usdValue: 1000,
          underlyingTicker: 'NVDA',
        },
        {
          mint: SUPPORTED_ASSETS.USDC.mint,
          symbol: 'USDC',
          name: 'USD Coin',
          assetType: 'STABLECOIN' as const,
          rawBalance: 9000000000n,
          uiAmount: 9000,
          usdPrice: 1.0,
          usdValue: 9000,
        },
      ];

      const postSummary = calculateUnderlyingExposure(postSwapHoldings, getETFConstituentData);
      expect(postSummary.totalPortfolioUsd).toBe(10000);
      expect(postSummary.underlyingCompanies[0].totalExposureUsd).toBe(1000);
      expect(postSummary.underlyingCompanies[0].portfolioPercentage).toBe(10.0);

      // Post-swap risk alerts check
      const postAlerts = evaluateConcentrationRisk(postSummary, 10.0);
      expect(postAlerts).toHaveLength(0); // Risk eliminated!
    });
  });
});
