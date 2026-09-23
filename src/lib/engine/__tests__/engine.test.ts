import { describe, expect, it } from 'vitest';
import {
  AssetHolding,
  ETFConstituentData,
  SupportedAssetConfig,
} from '@/types';
import { calculateUnderlyingExposure } from '../exposure';
import { evaluateConcentrationRisk } from '../concentration';
import { generateRebalanceRecommendation, applySimulatedRebalance } from '../rebalance';
import { getETFConstituentData } from '@/lib/etf/registry';
import { SUPPORTED_ASSETS } from '@/config/tokens';
import { ScannedTokenAccount } from '@/lib/solana/scanner';

describe('PRISM Core Risk & Rebalancing Engine', () => {
  // Mock ETF data for exact mathematical determinism
  const mockETFRegistry: Record<string, ETFConstituentData> = {
    SPY: {
      etfTicker: 'SPY',
      name: 'SPDR S&P 500 ETF Trust',
      provenance: {
        source: 'SEC Form N-PORT Test Fixture',
        retrievalDate: '2026-09-15',
        effectiveDate: '2026-09-15',
        timestamp: 1789430400000,
        legalDisclaimer: 'Test fixture data',
      },
      constituents: [
        { ticker: 'NVDA', companyName: 'NVIDIA Corporation', weight: 0.06, sector: 'Information Technology' },
        { ticker: 'AAPL', companyName: 'Apple Inc.', weight: 0.07, sector: 'Information Technology' },
        { ticker: 'MSFT', companyName: 'Microsoft Corporation', weight: 0.065, sector: 'Information Technology' },
      ],
    },
    QQQ: {
      etfTicker: 'QQQ',
      name: 'Invesco QQQ Trust',
      provenance: {
        source: 'Nasdaq-100 Test Fixture',
        retrievalDate: '2026-09-15',
        effectiveDate: '2026-09-15',
        timestamp: 1789430400000,
        legalDisclaimer: 'Test fixture data',
      },
      constituents: [
        { ticker: 'NVDA', companyName: 'NVIDIA Corporation', weight: 0.08, sector: 'Information Technology' },
        { ticker: 'AAPL', companyName: 'Apple Inc.', weight: 0.09, sector: 'Information Technology' },
        { ticker: 'AMZN', companyName: 'Amazon.com Inc.', weight: 0.05, sector: 'Consumer Discretionary' },
      ],
    },
  };

  const mockGetETFData = (ticker: string) => mockETFRegistry[ticker.toUpperCase()];

  const getDirectConfig = (ticker: string): SupportedAssetConfig | undefined => {
    if (ticker.toUpperCase() === 'NVDA') return SUPPORTED_ASSETS.NVDAx;
    return undefined;
  };

  const usdcConfig = SUPPORTED_ASSETS.USDC;

  describe('1. Look-Through Exposure Calculation (Rule 7)', () => {
    it('calculates exact exposure for Rule 7 specification: $5,000 SPYx (6% NVDA) + $2,000 NVDAx = $2,300 NVDA', () => {
      const holdings: AssetHolding[] = [
        {
          mint: 'SPYx_MINT',
          symbol: 'SPYx',
          name: 'SPDR S&P 500 Tokenized ETF',
          assetType: 'ETF',
          rawBalance: BigInt(1000000000),
          uiAmount: 10,
          usdPrice: 500,
          usdValue: 5000,
          etfConstituentId: 'SPY',
        },
        {
          mint: 'NVDAx_MINT',
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK',
          rawBalance: BigInt(1600000000),
          uiAmount: 16,
          usdPrice: 125,
          usdValue: 2000,
          underlyingTicker: 'NVDA',
        },
      ];

      const result = calculateUnderlyingExposure(holdings, mockGetETFData);

      expect(result.totalPortfolioUsd).toBe(7000);

      const nvda = result.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(nvda).toBeDefined();
      expect(nvda?.directHoldingUsd).toBe(2000);
      expect(nvda?.etfDerivedUsd).toBe(300); // $5,000 * 0.06
      expect(nvda?.totalExposureUsd).toBe(2300); // $2,000 + $300
      expect(nvda?.portfolioPercentage).toBeCloseTo((2300 / 7000) * 100, 4);

      // Verify derivedFromETFs breakdown
      expect(nvda?.derivedFromETFs).toHaveLength(1);
      expect(nvda?.derivedFromETFs[0]).toEqual({
        etfSymbol: 'SPYx',
        etfHoldingUsd: 5000,
        weightInEtf: 0.06,
        contributedUsd: 300,
      });
    });

    it('calculates overlapping exposure across multiple ETFs (SPYx + QQQx)', () => {
      const holdings: AssetHolding[] = [
        {
          mint: 'SPYx_MINT',
          symbol: 'SPYx',
          name: 'SPDR S&P 500 Tokenized ETF',
          assetType: 'ETF',
          rawBalance: BigInt(1000000000),
          uiAmount: 10,
          usdPrice: 500,
          usdValue: 5000, // SPY NVDA: 6% ($300), AAPL: 7% ($350)
          etfConstituentId: 'SPY',
        },
        {
          mint: 'QQQx_MINT',
          symbol: 'QQQx',
          name: 'Invesco QQQ Tokenized ETF',
          assetType: 'ETF',
          rawBalance: BigInt(1000000000),
          uiAmount: 10,
          usdPrice: 400,
          usdValue: 4000, // QQQ NVDA: 8% ($320), AAPL: 9% ($360)
          etfConstituentId: 'QQQ',
        },
      ];

      const result = calculateUnderlyingExposure(holdings, mockGetETFData);

      expect(result.totalPortfolioUsd).toBe(9000);

      const nvda = result.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(nvda?.directHoldingUsd).toBe(0);
      expect(nvda?.etfDerivedUsd).toBe(620); // $300 + $320
      expect(nvda?.totalExposureUsd).toBe(620);
      expect(nvda?.derivedFromETFs).toHaveLength(2);

      const aapl = result.underlyingCompanies.find((c) => c.ticker === 'AAPL');
      expect(aapl?.totalExposureUsd).toBe(710); // $350 + $360
    });

    it('handles direct-stock-only portfolio with no ETFs', () => {
      const holdings: AssetHolding[] = [
        {
          mint: 'NVDAx_MINT',
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK',
          rawBalance: BigInt(8000000000),
          uiAmount: 80,
          usdPrice: 125,
          usdValue: 10000,
          underlyingTicker: 'NVDA',
        },
        {
          mint: 'USDC_MINT',
          symbol: 'USDC',
          name: 'USD Coin',
          assetType: 'STABLECOIN',
          rawBalance: BigInt(10000000000),
          uiAmount: 10000,
          usdPrice: 1.0,
          usdValue: 10000,
        },
      ];

      const result = calculateUnderlyingExposure(holdings, mockGetETFData);

      expect(result.totalPortfolioUsd).toBe(20000);
      const nvda = result.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(nvda?.directHoldingUsd).toBe(10000);
      expect(nvda?.etfDerivedUsd).toBe(0);
      expect(nvda?.totalExposureUsd).toBe(10000);
      expect(nvda?.portfolioPercentage).toBe(50);
    });

    it('derives sector breakdown directly from resolved underlying companies with exact equality', () => {
      const holdings: AssetHolding[] = [
        {
          mint: 'SPYx_MINT',
          symbol: 'SPYx',
          name: 'SPDR S&P 500 Tokenized ETF',
          assetType: 'ETF',
          rawBalance: BigInt(1000000000),
          uiAmount: 10,
          usdPrice: 500,
          usdValue: 5000,
          etfConstituentId: 'SPY',
        },
        {
          mint: 'NVDAx_MINT',
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK',
          rawBalance: BigInt(1600000000),
          uiAmount: 16,
          usdPrice: 125,
          usdValue: 2000,
          underlyingTicker: 'NVDA',
          sector: 'Information Technology',
        },
      ];

      const result = calculateUnderlyingExposure(holdings, mockGetETFData);

      // In mock SPY: NVDA (6% = $300), AAPL (7% = $350), MSFT (6.5% = $325) -> all Information Technology
      // Direct NVDA = $2,000 (Information Technology)
      // Total IT = $300 + $350 + $325 + $2,000 = $2,975
      const itSector = result.sectorBreakdown.find((s) => s.sector === 'Information Technology');
      expect(itSector).toBeDefined();
      expect(itSector?.exposureUsd).toBe(2975);
      expect(itSector?.portfolioPercentage).toBeCloseTo((2975 / 7000) * 100, 4);

      // Mathematical equivalence: sum of all company exposures grouped by sector must equal sectorBreakdown
      const groupedSums = new Map<string, number>();
      for (const comp of result.underlyingCompanies) {
        groupedSums.set(comp.sector, (groupedSums.get(comp.sector) || 0) + comp.totalExposureUsd);
      }

      for (const sector of result.sectorBreakdown) {
        expect(sector.exposureUsd).toBeCloseTo(groupedSums.get(sector.sector) || 0, 4);
      }
    });

    it('handles empty / zero balance portfolio safely', () => {
      const result = calculateUnderlyingExposure([], mockGetETFData);
      expect(result.totalPortfolioUsd).toBe(0);
      expect(result.underlyingCompanies).toHaveLength(0);
      expect(result.sectorBreakdown).toHaveLength(0);
    });
  });

  describe('2. Concentration Risk Evaluation', () => {
    it('detects concentration excess against user target and flags severity', () => {
      const holdings: AssetHolding[] = [
        {
          mint: 'NVDAx_MINT',
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK',
          rawBalance: BigInt(3200000000),
          uiAmount: 32,
          usdPrice: 125,
          usdValue: 4000, // 40% of $10,000
          underlyingTicker: 'NVDA',
        },
        {
          mint: 'USDC_MINT',
          symbol: 'USDC',
          name: 'USD Coin',
          assetType: 'STABLECOIN',
          rawBalance: BigInt(6000000000),
          uiAmount: 6000,
          usdPrice: 1.0,
          usdValue: 6000,
        },
      ];

      const summary = calculateUnderlyingExposure(holdings, mockGetETFData);
      const alerts = evaluateConcentrationRisk(summary, 15.0); // Target = 15%

      expect(alerts).toHaveLength(1);
      const alert = alerts[0];
      expect(alert.ticker).toBe('NVDA');
      expect(alert.currentPercentage).toBe(40);
      expect(alert.targetPercentage).toBe(15);
      expect(alert.excessPercentage).toBe(25);
      expect(alert.excessUsd).toBe(2500); // $4,000 - $1,500
      expect(alert.canFullyRebalanceWithDirectHolding).toBe(true);
      expect(alert.severity).toBe('CRITICAL'); // >= 30%
    });

    it('returns empty alert list when all holdings are below target', () => {
      const holdings: AssetHolding[] = [
        {
          mint: 'NVDAx_MINT',
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK',
          rawBalance: BigInt(800000000),
          uiAmount: 8,
          usdPrice: 125,
          usdValue: 1000, // 10% of $10,000
          underlyingTicker: 'NVDA',
        },
        {
          mint: 'USDC_MINT',
          symbol: 'USDC',
          name: 'USD Coin',
          assetType: 'STABLECOIN',
          rawBalance: BigInt(9000000000),
          uiAmount: 9000,
          usdPrice: 1.0,
          usdValue: 9000,
        },
      ];

      const summary = calculateUnderlyingExposure(holdings, mockGetETFData);
      const alerts = evaluateConcentrationRisk(summary, 15.0);

      expect(alerts).toHaveLength(0);
    });
  });

  describe('3. Direct-Stock-Only Rebalance Solver (Rule 9)', () => {
    it('solves exact Rule 9 specification: $20,000 portfolio, $4,000 NVDA (20%), target 12% -> sell $1,600 NVDAx', () => {
      const holdings: AssetHolding[] = [
        {
          mint: 'NVDAx_MINT',
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK',
          rawBalance: BigInt(3200000000),
          uiAmount: 32,
          usdPrice: 125,
          usdValue: 4000,
          underlyingTicker: 'NVDA',
        },
        {
          mint: 'USDC_MINT',
          symbol: 'USDC',
          name: 'USD Coin',
          assetType: 'STABLECOIN',
          rawBalance: BigInt(16000000000),
          uiAmount: 16000,
          usdPrice: 1.0,
          usdValue: 16000,
        },
      ];

      const summary = calculateUnderlyingExposure(holdings, mockGetETFData);
      const recommendation = generateRebalanceRecommendation(
        'NVDA',
        summary,
        12.0, // 12% target
        usdcConfig,
        getDirectConfig
      );

      expect(recommendation).not.toBeNull();
      expect(recommendation?.targetCompanyTicker).toBe('NVDA');
      expect(recommendation?.directStockToSell.symbol).toBe('NVDAx');
      expect(recommendation?.currentExposureUsd).toBe(4000);
      expect(recommendation?.excessUsd).toBe(1600); // $4,000 - ($20,000 * 0.12 = $2,400)
      expect(recommendation?.sellAmountUsd).toBe(1600);
      expect(recommendation?.sellAmountTokens).toBe(12.8); // $1,600 / $125 per token
      expect(recommendation?.isConstrainedByDirectHolding).toBe(false);
      expect(recommendation?.projectedNewExposureUsd).toBe(2400);
      expect(recommendation?.projectedNewPercentage).toBe(12);
    });

    it('handles target-above-current: returns null (no rebalance required)', () => {
      const holdings: AssetHolding[] = [
        {
          mint: 'NVDAx_MINT',
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK',
          rawBalance: BigInt(800000000),
          uiAmount: 8,
          usdPrice: 125,
          usdValue: 1000, // 10%
          underlyingTicker: 'NVDA',
        },
        {
          mint: 'USDC_MINT',
          symbol: 'USDC',
          name: 'USD Coin',
          assetType: 'STABLECOIN',
          rawBalance: BigInt(9000000000),
          uiAmount: 9000,
          usdPrice: 1.0,
          usdValue: 9000,
        },
      ];

      const summary = calculateUnderlyingExposure(holdings, mockGetETFData);
      const recommendation = generateRebalanceRecommendation(
        'NVDA',
        summary,
        20.0, // Target = 20% > current 10%
        usdcConfig,
        getDirectConfig
      );

      expect(recommendation).toBeNull();
    });

    it('handles zero direct balance: returns null when user holds stock only via ETF', () => {
      const holdings: AssetHolding[] = [
        {
          mint: 'SPYx_MINT',
          symbol: 'SPYx',
          name: 'SPDR S&P 500 Tokenized ETF',
          assetType: 'ETF',
          rawBalance: BigInt(20000000000),
          uiAmount: 200,
          usdPrice: 500,
          usdValue: 100000, // 6% NVDA = $6,000 exposure
          etfConstituentId: 'SPY',
        },
      ];

      const summary = calculateUnderlyingExposure(holdings, mockGetETFData);
      const recommendation = generateRebalanceRecommendation(
        'NVDA',
        summary,
        2.0, // Target = 2% ($2,000), excess is $4,000
        usdcConfig,
        getDirectConfig
      );

      // Cannot rebalance direct stock since user has $0 direct NVDAx
      expect(recommendation).toBeNull();
    });

    it('handles target-below-ETF-derived floor: caps sell at 100% of direct holding with flag', () => {
      // Portfolio: $10,000 SPY ($600 NVDA) + $400 direct NVDAx = $1,000 Total NVDA (9.615% of $10,400)
      const holdings: AssetHolding[] = [
        {
          mint: 'SPYx_MINT',
          symbol: 'SPYx',
          name: 'SPDR S&P 500 Tokenized ETF',
          assetType: 'ETF',
          rawBalance: BigInt(2000000000),
          uiAmount: 20,
          usdPrice: 500,
          usdValue: 10000, // NVDA ETF exposure = $600
          etfConstituentId: 'SPY',
        },
        {
          mint: 'NVDAx_MINT',
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK',
          rawBalance: BigInt(320000000),
          uiAmount: 3.2,
          usdPrice: 125,
          usdValue: 400, // Direct NVDA = $400
          underlyingTicker: 'NVDA',
        },
      ];

      const summary = calculateUnderlyingExposure(holdings, mockGetETFData);
      // Total portfolio = $10,400. Total NVDA = $1,000 (9.615%).
      // User sets target = 2% ($208 allowed).
      // Excess is $1,000 - $208 = $792.
      // But direct holding is only $400!
      const recommendation = generateRebalanceRecommendation(
        'NVDA',
        summary,
        2.0,
        usdcConfig,
        getDirectConfig
      );

      expect(recommendation).not.toBeNull();
      expect(recommendation?.isConstrainedByDirectHolding).toBe(true);
      expect(recommendation?.excessUsd).toBe(792);
      expect(recommendation?.sellAmountUsd).toBe(400); // Capped at $400 max direct
      expect(recommendation?.sellAmountTokens).toBe(3.2); // Sells all 3.2 NVDAx tokens
      expect(recommendation?.projectedNewExposureUsd).toBe(600); // Remaining ETF-only exposure
      expect(recommendation?.projectedNewPercentage).toBeCloseTo((600 / 10400) * 100, 4);
    });
  });

  describe('4. Full End-to-End Pipeline with Verified Datasets', () => {
    it('executes full pipeline: Reported Holdings -> Look-Through -> Warnings -> Rebalance Recommendation using real JSON datasets', () => {
      // User holds $50,000 SPYx, $30,000 QQQx, $15,000 NVDAx, $5,000 USDC ($100,000 total)
      const holdings: AssetHolding[] = [
        {
          mint: 'SPYx_MINT',
          symbol: 'SPYx',
          name: 'SPDR S&P 500 Tokenized ETF',
          assetType: 'ETF',
          rawBalance: BigInt(10000000000),
          uiAmount: 100,
          usdPrice: 500,
          usdValue: 50000,
          etfConstituentId: 'SPY',
        },
        {
          mint: 'QQQx_MINT',
          symbol: 'QQQx',
          name: 'Invesco QQQ Tokenized ETF',
          assetType: 'ETF',
          rawBalance: BigInt(7500000000),
          uiAmount: 75,
          usdPrice: 400,
          usdValue: 30000,
          etfConstituentId: 'QQQ',
        },
        {
          mint: 'NVDAx_MINT',
          symbol: 'NVDAx',
          name: 'NVIDIA Tokenized Stock',
          assetType: 'SINGLE_STOCK',
          rawBalance: BigInt(12000000000),
          uiAmount: 120,
          usdPrice: 125,
          usdValue: 15000,
          underlyingTicker: 'NVDA',
        },
        {
          mint: 'USDC_MINT',
          symbol: 'USDC',
          name: 'USD Coin',
          assetType: 'STABLECOIN',
          rawBalance: BigInt(5000000000),
          uiAmount: 5000,
          usdPrice: 1.0,
          usdValue: 5000,
        },
      ];

      // 1. Step: Look-Through
      const summary = calculateUnderlyingExposure(holdings, getETFConstituentData);
      expect(summary.totalPortfolioUsd).toBe(100000);

      // SPY NVDA: 6.85% of $50,000 = $3,425
      // QQQ NVDA: 8.50% of $30,000 = $2,550
      // Direct NVDA: $15,000
      // Total NVDA: $3,425 + $2,550 + $15,000 = $20,975 (20.975%)
      const nvda = summary.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(nvda?.directHoldingUsd).toBe(15000);
      expect(nvda?.etfDerivedUsd).toBe(5975);
      expect(nvda?.totalExposureUsd).toBe(20975);
      expect(nvda?.portfolioPercentage).toBe(20.975);

      // 2. Step: Concentration Risk Warnings (User limit: 12%)
      const alerts = evaluateConcentrationRisk(summary, 12.0);
      expect(alerts.length).toBeGreaterThan(0);
      const nvdaAlert = alerts.find((a) => a.ticker === 'NVDA');
      expect(nvdaAlert).toBeDefined();
      expect(nvdaAlert?.currentPercentage).toBe(20.975);
      expect(nvdaAlert?.targetPercentage).toBe(12.0);
      expect(nvdaAlert?.excessUsd).toBe(8975); // $20,975 - $12,000
      expect(nvdaAlert?.canFullyRebalanceWithDirectHolding).toBe(true); // $15,000 > $8,975

      // 3. Step: Rebalance Recommendation
      const plan = generateRebalanceRecommendation(
        'NVDA',
        summary,
        12.0,
        usdcConfig,
        getDirectConfig
      );

      expect(plan).not.toBeNull();
      expect(plan?.directStockToSell.symbol).toBe('NVDAx');
      expect(plan?.sellAmountUsd).toBe(8975);
      expect(plan?.sellAmountTokens).toBe(71.8); // $8,975 / $125
      expect(plan?.outputToken.symbol).toBe('USDC');
      expect(plan?.projectedNewExposureUsd).toBe(12000);
      expect(plan?.projectedNewPercentage).toBe(12.0);
    });

    it('applies simulated rebalance transition accurately to token accounts', () => {
      const mockAccounts: ScannedTokenAccount[] = [
        {
          pubkey: 'UsdcPubkey',
          mint: SUPPORTED_ASSETS.USDC.mint,
          owner: 'TestOwner',
          rawAmount: 10000000000n, // 10,000 USDC
          decimals: 6,
          uiAmount: 10000,
          programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          isToken2022: false,
        },
        {
          pubkey: 'NvdaxPubkey',
          mint: SUPPORTED_ASSETS.NVDAx.mint,
          owner: 'TestOwner',
          rawAmount: 5000000000n, // 50 NVDAx
          decimals: 8,
          uiAmount: 50,
          programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
          isToken2022: true,
        },
      ];

      const recommendation = {
        targetCompanyTicker: 'NVDA',
        companyName: 'NVIDIA Corporation',
        directStockToSell: SUPPORTED_ASSETS.NVDAx,
        currentExposureUsd: 9072.5,
        targetPercentage: 13.0,
        excessUsd: 1662.5,
        sellAmountUsd: 1662.5,
        sellAmountTokens: 13.854167,
        outputToken: SUPPORTED_ASSETS.USDC,
        isConstrainedByDirectHolding: false,
        projectedNewExposureUsd: 7410,
        projectedNewPercentage: 13.0,
      };

      const result = applySimulatedRebalance(mockAccounts, recommendation, {
        [SUPPORTED_ASSETS.USDC.mint]: {
          mint: SUPPORTED_ASSETS.USDC.mint,
          usdPrice: 1.0,
          source: 'PEG_ORACLE',
          fetchedAt: Date.now(),
        },
        [SUPPORTED_ASSETS.NVDAx.mint]: {
          mint: SUPPORTED_ASSETS.NVDAx.mint,
          usdPrice: 120.0,
          source: 'DEXSCREENER',
          fetchedAt: Date.now(),
        },
      });

      const nvda = result.find((a) => a.mint === SUPPORTED_ASSETS.NVDAx.mint);
      expect(nvda?.uiAmount).toBeCloseTo(36.145833, 4);
      expect(nvda?.rawAmount).toBe(3614583300n);

      const usdc = result.find((a) => a.mint === SUPPORTED_ASSETS.USDC.mint);
      expect(usdc?.uiAmount).toBe(11662.5);
      expect(usdc?.rawAmount).toBe(11662500000n);
    });
  });
});
