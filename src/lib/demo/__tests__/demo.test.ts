import { describe, expect, it } from 'vitest';
import { DEMO_SCANNED_ACCOUNTS, DEMO_PRICES, DEMO_WALLET_ADDRESS } from '@/config/demo';
import { SUPPORTED_ASSETS, USDC_MINT_MAINNET } from '@/config/tokens';
import { adaptScannedAccountsToHoldings } from '@/lib/solana/adapter';
import { calculateUnderlyingExposure } from '@/lib/engine/exposure';
import { evaluateConcentrationRisk } from '@/lib/engine/concentration';
import { generateRebalanceRecommendation, applySimulatedRebalance } from '@/lib/engine/rebalance';
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

  describe('5. Sector Reconciliation & Look-Through Invariants', () => {
    it('verifies exact sector breakdown reconciliation for the $57,000 demo portfolio', () => {
      const adapterResult = adaptScannedAccountsToHoldings(
        DEMO_SCANNED_ACCOUNTS,
        SUPPORTED_ASSETS,
        DEMO_PRICES
      );
      const summary = calculateUnderlyingExposure(adapterResult.engineHoldings, getETFConstituentData);

      // 1. Total portfolio value unchanged ($57,000)
      expect(summary.totalPortfolioUsd).toBe(57000);

      // 2. NVDA direct $6,000 is included in Information Technology
      const nvda = summary.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(nvda).toBeDefined();
      expect(nvda?.sector).toBe('Information Technology');
      expect(nvda?.directHoldingUsd).toBe(6000);
      expect(nvda?.etfDerivedUsd).toBe(3072.5);
      expect(nvda?.totalExposureUsd).toBe(9072.5);

      // 3. Information Technology sector total equals exactly $17,992.50
      // (Direct NVDA: $6,000.00 + SPY IT: $5,712.50 + QQQ IT: $6,280.00 = $17,992.50)
      const itSector = summary.sectorBreakdown.find((s) => s.sector === 'Information Technology');
      expect(itSector).toBeDefined();
      expect(itSector?.exposureUsd).toBeCloseTo(17992.5, 2);
      expect(itSector?.portfolioPercentage).toBeCloseTo((17992.5 / 57000) * 100, 4);

      // 4. Sum of company totalExposureUsd grouped by sector mathematically equals sectorBreakdown
      const manualSectorSums = new Map<string, number>();
      for (const company of summary.underlyingCompanies) {
        const current = manualSectorSums.get(company.sector) || 0;
        manualSectorSums.set(company.sector, current + company.totalExposureUsd);
      }

      for (const sectorItem of summary.sectorBreakdown) {
        const manualSum = manualSectorSums.get(sectorItem.sector) || 0;
        expect(sectorItem.exposureUsd).toBeCloseTo(manualSum, 4);
      }
      expect(summary.sectorBreakdown.length).toBe(manualSectorSums.size);

      // 5. Total equity exposure across all sectors equals sum of all companies' totalExposureUsd
      const totalSectorExposure = summary.sectorBreakdown.reduce((acc, s) => acc + s.exposureUsd, 0);
      const totalCompanyExposure = summary.underlyingCompanies.reduce((acc, c) => acc + c.totalExposureUsd, 0);
      expect(totalSectorExposure).toBeCloseTo(totalCompanyExposure, 4);

      // 6. Verify non-IT sectors match exact ETF allocations:
      // Consumer Discretionary: SPY ($1,525.00) + QQQ ($1,496.00)
      const cdSector = summary.sectorBreakdown.find((s) => s.sector === 'Consumer Discretionary');
      expect(cdSector).toBeDefined();
      expect(cdSector?.exposureUsd).toBeCloseTo(manualSectorSums.get('Consumer Discretionary') || 0, 2);

      // Communication Services: SPY ($1,787.50) + QQQ ($1,856.00)
      const csSector = summary.sectorBreakdown.find((s) => s.sector === 'Communication Services');
      expect(csSector).toBeDefined();
      expect(csSector?.exposureUsd).toBeCloseTo(manualSectorSums.get('Communication Services') || 0, 2);

      // Financials: SPY ($1,150.00)
      const finSector = summary.sectorBreakdown.find((s) => s.sector === 'Financials');
      expect(finSector).toBeDefined();
      expect(finSector?.exposureUsd).toBeCloseTo(manualSectorSums.get('Financials') || 0, 2);

      // Health Care: SPY ($912.50) + QQQ ($528.00)
      const hcSector = summary.sectorBreakdown.find((s) => s.sector === 'Health Care');
      expect(hcSector).toBeDefined();
      expect(hcSector?.exposureUsd).toBeCloseTo(manualSectorSums.get('Health Care') || 0, 2);

      // Consumer Staples: SPY ($400.00) + QQQ ($384.00)
      const csStaplesSector = summary.sectorBreakdown.find((s) => s.sector === 'Consumer Staples');
      expect(csStaplesSector).toBeDefined();
      expect(csStaplesSector?.exposureUsd).toBeCloseTo(manualSectorSums.get('Consumer Staples') || 0, 2);

      // Energy: SPY ($250.00)
      const energySector = summary.sectorBreakdown.find((s) => s.sector === 'Energy');
      expect(energySector).toBeDefined();
      expect(energySector?.exposureUsd).toBeCloseTo(manualSectorSums.get('Energy') || 0, 2);

      // Materials: QQQ ($208.00)
      const matSector = summary.sectorBreakdown.find((s) => s.sector === 'Materials');
      expect(matSector).toBeDefined();
      expect(matSector?.exposureUsd).toBeCloseTo(manualSectorSums.get('Materials') || 0, 2);

      // Industrials: QQQ ($176.00)
      const indSector = summary.sectorBreakdown.find((s) => s.sector === 'Industrials');
      expect(indSector).toBeDefined();
      expect(indSector?.exposureUsd).toBeCloseTo(manualSectorSums.get('Industrials') || 0, 2);
    });
  });

  describe('6. Simulated Rebalance State Transition (13% Target)', () => {
    it('executes full 13% target demo rebalance: reduces direct NVDAx by 13.8542, preserves $3,072.50 ETF exposure, reaches exactly $7,410 / 13.00% and clears concentration warning', () => {
      // 1. Initial State Setup
      const initialAdapter = adaptScannedAccountsToHoldings(
        DEMO_SCANNED_ACCOUNTS,
        SUPPORTED_ASSETS,
        DEMO_PRICES
      );
      const initialSummary = calculateUnderlyingExposure(initialAdapter.engineHoldings, getETFConstituentData);

      expect(initialSummary.totalPortfolioUsd).toBe(57000);
      const initialNvda = initialSummary.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(initialNvda).toBeDefined();
      expect(initialNvda?.directHoldingUsd).toBe(6000); // 50 NVDAx @ $120
      expect(initialNvda?.etfDerivedUsd).toBe(3072.5); // SPY ($1,712.50) + QQQ ($1,360.00)
      expect(initialNvda?.totalExposureUsd).toBe(9072.5); // $9,072.50
      expect(initialNvda?.portfolioPercentage).toBeCloseTo((9072.5 / 57000) * 100, 4); // ~15.9167%

      // 2. Concentration Warning for 13.0% Target
      const initialAlerts = evaluateConcentrationRisk(initialSummary, 13.0);
      const nvdaAlert = initialAlerts.find((a) => a.ticker === 'NVDA');
      expect(nvdaAlert).toBeDefined();
      // Target Allowed = 13% * $57,000 = $7,410. Excess = $9,072.50 - $7,410.00 = $1,662.50
      expect(nvdaAlert?.excessUsd).toBeCloseTo(1662.5, 2);
      expect(nvdaAlert?.canFullyRebalanceWithDirectHolding).toBe(true); // $6,000 direct >= $1,662.50

      // 3. Rebalance Solver for 13.0% Target
      const recommendation = generateRebalanceRecommendation(
        'NVDA',
        initialSummary,
        13.0,
        SUPPORTED_ASSETS.USDC,
        (ticker) => Object.values(SUPPORTED_ASSETS).find((a) => a.underlyingTicker === ticker)
      );

      expect(recommendation).not.toBeNull();
      if (!recommendation) return;

      expect(recommendation.targetCompanyTicker).toBe('NVDA');
      expect(recommendation.directStockToSell.symbol).toBe('NVDAx');
      expect(recommendation.sellAmountUsd).toBe(1662.5);
      // sellAmountTokens = $1,662.50 / $120.00 = 13.8541666... NVDAx (~13.8542 NVDAx)
      expect(recommendation.sellAmountTokens).toBeCloseTo(13.854167, 4);
      expect(recommendation.projectedNewExposureUsd).toBe(7410);
      expect(recommendation.projectedNewPercentage).toBeCloseTo(13.0, 2);

      // 4. State Transition: Apply Simulated Rebalance
      const updatedAccounts = applySimulatedRebalance(
        DEMO_SCANNED_ACCOUNTS,
        recommendation,
        DEMO_PRICES
      );

      // Verify token account balance updates
      const updatedNvdaAccount = updatedAccounts.find((a) => a.mint === SUPPORTED_ASSETS.NVDAx.mint);
      expect(updatedNvdaAccount).toBeDefined();
      // Direct NVDAx reduced by 13.854167 tokens from 50.0 to 36.145833
      expect(updatedNvdaAccount?.uiAmount).toBeCloseTo(50 - 13.854167, 4);
      expect(updatedNvdaAccount?.uiAmount).toBeCloseTo(36.145833, 4);

      const updatedUsdcAccount = updatedAccounts.find((a) => a.mint === USDC_MINT_MAINNET);
      expect(updatedUsdcAccount).toBeDefined();
      // USDC increased by $1,662.50 from 10,000 to 11,662.50
      expect(updatedUsdcAccount?.uiAmount).toBeCloseTo(11662.5, 2);

      // SPY and QQQ accounts are untouched
      const updatedSpyAccount = updatedAccounts.find((a) => a.mint === SUPPORTED_ASSETS.SPYx.mint);
      expect(updatedSpyAccount?.uiAmount).toBe(50);
      const updatedQqqAccount = updatedAccounts.find((a) => a.mint === SUPPORTED_ASSETS.QQQx.mint);
      expect(updatedQqqAccount?.uiAmount).toBe(40);

      // 5. Post-Rebalance Exposure Engine Execution
      const postAdapter = adaptScannedAccountsToHoldings(
        updatedAccounts,
        SUPPORTED_ASSETS,
        DEMO_PRICES
      );
      const postSummary = calculateUnderlyingExposure(postAdapter.engineHoldings, getETFConstituentData);

      // Total portfolio value is preserved at exactly $57,000.00
      expect(postSummary.totalPortfolioUsd).toBe(57000);

      const postNvda = postSummary.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(postNvda).toBeDefined();
      // Direct holding reduced to $4,337.50
      expect(postNvda?.directHoldingUsd).toBeCloseTo(4337.5, 2);
      // ETF-derived NVDA exposure is preserved at exactly $3,072.50
      expect(postNvda?.etfDerivedUsd).toBe(3072.5);
      // Look Through view shows exactly $7,410.00 NVDA exposure
      expect(postNvda?.totalExposureUsd).toBe(7410);
      // Look Through view shows exactly 13.00% portfolio percentage
      expect(postNvda?.portfolioPercentage).toBe(13.0);

      // 6. Post-Rebalance Risk Concentration Evaluation
      const postAlerts = evaluateConcentrationRisk(postSummary, 13.0);
      // Concentration warning is cleared (0 alerts)
      expect(postAlerts).toHaveLength(0);
      expect(postAlerts.find((a) => a.ticker === 'NVDA')).toBeUndefined();

      // 7. Isolation Check: DEMO_SCANNED_ACCOUNTS fixture was not mutated in place
      const originalNvdaAccount = DEMO_SCANNED_ACCOUNTS.find((a) => a.mint === SUPPORTED_ASSETS.NVDAx.mint);
      expect(originalNvdaAccount?.uiAmount).toBe(50);
    });

    it('handles subsequent slider target changes on the post-rebalance demo state correctly', () => {
      // Setup post-rebalance portfolio
      const initialAdapter = adaptScannedAccountsToHoldings(DEMO_SCANNED_ACCOUNTS, SUPPORTED_ASSETS, DEMO_PRICES);
      const initialSummary = calculateUnderlyingExposure(initialAdapter.engineHoldings, getETFConstituentData);
      const recommendation = generateRebalanceRecommendation(
        'NVDA',
        initialSummary,
        13.0,
        SUPPORTED_ASSETS.USDC,
        (ticker) => Object.values(SUPPORTED_ASSETS).find((a) => a.underlyingTicker === ticker)
      )!;

      const rebalancedAccounts = applySimulatedRebalance(DEMO_SCANNED_ACCOUNTS, recommendation, DEMO_PRICES);
      const rebalancedAdapter = adaptScannedAccountsToHoldings(rebalancedAccounts, SUPPORTED_ASSETS, DEMO_PRICES);
      const rebalancedSummary = calculateUnderlyingExposure(rebalancedAdapter.engineHoldings, getETFConstituentData);

      // At 14% target: no alerts
      const alertsAt14 = evaluateConcentrationRisk(rebalancedSummary, 14.0);
      expect(alertsAt14).toHaveLength(0);

      // At 12% target: NVDA is 13.0%, allowed is $6,840. Excess = $7,410 - $6,840 = $570
      const alertsAt12 = evaluateConcentrationRisk(rebalancedSummary, 12.0);
      const nvdaAlert12 = alertsAt12.find((a) => a.ticker === 'NVDA');
      expect(nvdaAlert12).toBeDefined();
      expect(nvdaAlert12?.excessUsd).toBeCloseTo(570.0, 2);
    });
  });

  describe('7. Production Initial Demo State Invariants', () => {
    it('initializes exact expected demo portfolio state upon entry', () => {
      const adapterResult = adaptScannedAccountsToHoldings(
        DEMO_SCANNED_ACCOUNTS,
        SUPPORTED_ASSETS,
        DEMO_PRICES
      );
      const summary = calculateUnderlyingExposure(adapterResult.engineHoldings, getETFConstituentData);
      const alerts = evaluateConcentrationRisk(summary, 10.0);

      // Reported tokens: 4
      expect(adapterResult.engineHoldings).toHaveLength(4);
      expect(DEMO_SCANNED_ACCOUNTS).toHaveLength(4);

      // Individual Token Values:
      // USDC: $10,000
      const usdcHolding = adapterResult.engineHoldings.find((h) => h.mint === USDC_MINT_MAINNET);
      expect(usdcHolding?.usdValue).toBe(10000);

      // SPYx: $25,000
      const spyHolding = adapterResult.engineHoldings.find((h) => h.mint === SUPPORTED_ASSETS.SPYx.mint);
      expect(spyHolding?.usdValue).toBe(25000);

      // QQQx: $16,000
      const qqqHolding = adapterResult.engineHoldings.find((h) => h.mint === SUPPORTED_ASSETS.QQQx.mint);
      expect(qqqHolding?.usdValue).toBe(16000);

      // NVDAx: $6,000
      const nvdaHolding = adapterResult.engineHoldings.find((h) => h.mint === SUPPORTED_ASSETS.NVDAx.mint);
      expect(nvdaHolding?.usdValue).toBe(6000);

      // Total: $57,000
      expect(summary.totalPortfolioUsd).toBe(57000);

      // Underlying companies: 38
      expect(summary.underlyingCompanies).toHaveLength(38);

      // Initial NVDA exposure: $9,072.50 / 15.92%
      const nvdaCompany = summary.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(nvdaCompany).toBeDefined();
      expect(nvdaCompany?.directHoldingUsd).toBe(6000);
      expect(nvdaCompany?.etfDerivedUsd).toBe(3072.5);
      expect(nvdaCompany?.totalExposureUsd).toBe(9072.5);
      expect(nvdaCompany?.portfolioPercentage).toBeCloseTo(15.9167, 2);

      // At 10% target: concentration warning should appear
      expect(alerts).toHaveLength(1);
      const nvdaAlert = alerts[0];
      expect(nvdaAlert.ticker).toBe('NVDA');
      expect(nvdaAlert.currentPercentage).toBeCloseTo(15.9167, 2);
      expect(nvdaAlert.targetPercentage).toBe(10.0);
      expect(nvdaAlert.excessUsd).toBeCloseTo(3372.5, 2);
    });
  });
});


