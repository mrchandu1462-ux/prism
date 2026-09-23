import { describe, expect, it } from 'vitest';
import { DEMO_SCANNED_ACCOUNTS, DEMO_PRICES, DEMO_WALLET_ADDRESS } from '@/config/demo';
import { SUPPORTED_ASSETS, USDC_MINT_MAINNET } from '@/config/tokens';
import { adaptScannedAccountsToHoldings } from '@/lib/solana/adapter';
import { calculateUnderlyingExposure } from '@/lib/engine/exposure';
import { evaluateConcentrationRisk } from '@/lib/engine/concentration';
import { generateRebalanceRecommendation } from '@/lib/engine/rebalance';
import { getETFConstituentData } from '@/lib/etf/registry';

describe('PRISM Demo Mode Integration & Isolation', () => {
  describe('1. Demo Configuration & Provenance Integrity', () => {
    it('uses only verified token mints present in SUPPORTED_ASSETS', () => {
      const allowedMints = new Set(Object.values(SUPPORTED_ASSETS).map((a) => a.mint));

      for (const account of DEMO_SCANNED_ACCOUNTS) {
        expect(allowedMints.has(account.mint), `Mint ${account.mint} must exist in verified SUPPORTED_ASSETS`).toBe(true);
      }
    });

    it('has valid non-zero amounts and matching decimals for all demo assets', () => {
      expect(DEMO_SCANNED_ACCOUNTS).toHaveLength(4);

      const usdc = DEMO_SCANNED_ACCOUNTS.find((a) => a.mint === USDC_MINT_MAINNET);
      expect(usdc).toBeDefined();
      expect(usdc?.decimals).toBe(6);
      expect(usdc?.uiAmount).toBe(10000);
      expect(usdc?.isToken2022).toBe(false);

      const nvda = DEMO_SCANNED_ACCOUNTS.find((a) => a.mint === SUPPORTED_ASSETS.NVDAx.mint);
      expect(nvda).toBeDefined();
      expect(nvda?.decimals).toBe(8);
      expect(nvda?.uiAmount).toBe(50);
      expect(nvda?.isToken2022).toBe(true);

      const spy = DEMO_SCANNED_ACCOUNTS.find((a) => a.mint === SUPPORTED_ASSETS.SPYx.mint);
      expect(spy).toBeDefined();
      expect(spy?.decimals).toBe(8);
      expect(spy?.uiAmount).toBe(50);
      expect(spy?.isToken2022).toBe(true);

      const qqq = DEMO_SCANNED_ACCOUNTS.find((a) => a.mint === SUPPORTED_ASSETS.QQQx.mint);
      expect(qqq).toBeDefined();
      expect(qqq?.decimals).toBe(8);
      expect(qqq?.uiAmount).toBe(40);
      expect(qqq?.isToken2022).toBe(true);
    });
  });

  describe('2. Deterministic Pipeline Execution in Demo Mode', () => {
    it('processes demo portfolio through the pure exposure engine without modification', () => {
      // 1. Adapter phase
      const adapterResult = adaptScannedAccountsToHoldings(
        DEMO_SCANNED_ACCOUNTS,
        SUPPORTED_ASSETS,
        DEMO_PRICES
      );

      expect(adapterResult.engineHoldings).toHaveLength(4);
      expect(adapterResult.totalReportedUsd).toBe(57000); // $10k + $25k + $16k + $6k

      // All demo assets are verified whitelisted assets
      expect(adapterResult.diagnostics.every((d) => d.status === 'ACCEPTED')).toBe(true);

      // 2. Exposure engine phase
      const summary = calculateUnderlyingExposure(adapterResult.engineHoldings, getETFConstituentData);
      expect(summary.totalPortfolioUsd).toBe(57000);

      // NVIDIA calculation: Direct $6k + SPYx ($1,712.50) + QQQx ($1,360.00) = $9,072.50
      const nvda = summary.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(nvda).toBeDefined();
      expect(nvda?.directHoldingUsd).toBe(6000);
      expect(nvda?.etfDerivedUsd).toBe(3072.5);
      expect(nvda?.totalExposureUsd).toBe(9072.5);
      expect(nvda?.portfolioPercentage).toBeCloseTo((9072.5 / 57000) * 100, 4);

      // 3. Concentration risk evaluation phase
      const alerts = evaluateConcentrationRisk(summary, 10.0);
      const nvdaAlert = alerts.find((a) => a.ticker === 'NVDA');
      expect(nvdaAlert).toBeDefined();
      expect(nvdaAlert?.excessUsd).toBeCloseTo(3372.5, 2);

      // 4. Jupiter rebalance solver phase
      const plan = generateRebalanceRecommendation(
        'NVDA',
        summary,
        10.0,
        SUPPORTED_ASSETS.USDC,
        (ticker) => Object.values(SUPPORTED_ASSETS).find((a) => a.underlyingTicker === ticker)
      );

      expect(plan).not.toBeNull();
      expect(plan?.directStockToSell.symbol).toBe('NVDAx');
      expect(plan?.sellAmountUsd).toBeCloseTo(3372.5, 2);
      expect(plan?.sellAmountTokens).toBeCloseTo(3372.5 / 120, 4);
    });
  });

  describe('3. Dynamic Target Slider in Demo Mode', () => {
    it('updates concentration risk dynamically when target percentage changes', () => {
      const adapterResult = adaptScannedAccountsToHoldings(
        DEMO_SCANNED_ACCOUNTS,
        SUPPORTED_ASSETS,
        DEMO_PRICES
      );
      const summary = calculateUnderlyingExposure(adapterResult.engineHoldings, getETFConstituentData);

      // Target = 20% (NVDA at ~15.92% should produce NO alerts)
      const lenientAlerts = evaluateConcentrationRisk(summary, 20.0);
      expect(lenientAlerts.find((a) => a.ticker === 'NVDA')).toBeUndefined();

      // Target = 12% (NVDA at ~15.92% should produce alert with $2,232.50 excess)
      const strictAlerts = evaluateConcentrationRisk(summary, 12.0);
      const alert = strictAlerts.find((a) => a.ticker === 'NVDA');
      expect(alert).toBeDefined();
      // Allowed = $57,000 * 0.12 = $6,840. Excess = $9,072.50 - $6,840 = $2,232.50
      expect(alert?.excessUsd).toBeCloseTo(2232.5, 2);
    });
  });

  describe('4. Demo Mode Rebalance Quote & Language Consistency', () => {
    it('generates consistent expected USDC output matching the rebalance recommendation ($3,372.50)', () => {
      const adapterResult = adaptScannedAccountsToHoldings(
        DEMO_SCANNED_ACCOUNTS,
        SUPPORTED_ASSETS,
        DEMO_PRICES
      );
      const summary = calculateUnderlyingExposure(adapterResult.engineHoldings, getETFConstituentData);

      const plan = generateRebalanceRecommendation(
        'NVDA',
        summary,
        10.0,
        SUPPORTED_ASSETS.USDC,
        (ticker) => Object.values(SUPPORTED_ASSETS).find((a) => a.underlyingTicker === ticker)
      );

      expect(plan).not.toBeNull();
      if (!plan) return;

      // Sells ~28.1042 NVDAx ($3,372.50 value)
      expect(plan.sellAmountTokens).toBeCloseTo(28.1041666, 4);
      expect(plan.sellAmountUsd).toBeCloseTo(3372.5, 2);

      // Simulated quote output in Demo Mode must match recommendation exact dollar value ($3,372.50)
      const expectedUsdcOutput = plan.sellAmountUsd;
      const slippageBps = 50; // 0.5%
      const minimumUsdcOutput = expectedUsdcOutput * (1 - slippageBps / 10000);

      expect(expectedUsdcOutput).toBeCloseTo(3372.5, 2);
      expect(minimumUsdcOutput).toBeCloseTo(3355.6375, 2);
    });
  });
});
