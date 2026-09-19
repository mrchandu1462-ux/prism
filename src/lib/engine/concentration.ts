import { ConcentrationRiskAlert, PortfolioExposureSummary, RiskSeverity } from '@/types';

/**
 * PURE DETERMINISTIC CONCENTRATION RISK ENGINE
 * 
 * Rules Adherence:
 * - Rule 8: Pure functions, unit-testable.
 * - Identifies single-company over-concentration relative to user target.
 */

export interface ConcentrationConfig {
  defaultMaxConcentrationPct: number; // e.g., 10.0 for 10%
  highRiskThresholdPct: number;       // e.g., 20.0 for 20%
  criticalRiskThresholdPct: number;   // e.g., 30.0 for 30%
}

export const DEFAULT_CONCENTRATION_CONFIG: ConcentrationConfig = {
  defaultMaxConcentrationPct: 10.0,
  highRiskThresholdPct: 20.0,
  criticalRiskThresholdPct: 30.0,
};

export function evaluateConcentrationRisk(
  summary: PortfolioExposureSummary,
  targetConcentrationPct: number = DEFAULT_CONCENTRATION_CONFIG.defaultMaxConcentrationPct,
  config: ConcentrationConfig = DEFAULT_CONCENTRATION_CONFIG
): ConcentrationRiskAlert[] {
  if (summary.totalPortfolioUsd <= 0 || targetConcentrationPct <= 0) {
    return [];
  }

  const alerts: ConcentrationRiskAlert[] = [];

  for (const company of summary.underlyingCompanies) {
    if (company.portfolioPercentage > targetConcentrationPct) {
      const excessPercentage = company.portfolioPercentage - targetConcentrationPct;
      const targetAllowedUsd = (summary.totalPortfolioUsd * targetConcentrationPct) / 100;
      const excessUsd = Math.max(0, company.totalExposureUsd - targetAllowedUsd);

      // Check if direct stock holdings are sufficient to rebalance
      const canFullyRebalance = company.directHoldingUsd >= excessUsd;
      const maxDirectReductionUsd = Math.min(excessUsd, company.directHoldingUsd);

      // Determine severity
      let severity: RiskSeverity = 'LOW';
      if (company.portfolioPercentage >= config.criticalRiskThresholdPct) {
        severity = 'CRITICAL';
      } else if (company.portfolioPercentage >= config.highRiskThresholdPct) {
        severity = 'HIGH';
      } else if (excessPercentage >= 3.0) {
        severity = 'MEDIUM';
      }

      let message = `${company.ticker} represents ${company.portfolioPercentage.toFixed(1)}% of your portfolio (target: ${targetConcentrationPct.toFixed(1)}%). Excess exposure: $${excessUsd.toFixed(2)}.`;
      if (!canFullyRebalance && company.directHoldingUsd > 0) {
        message += ` Selling 100% of direct holdings ($${company.directHoldingUsd.toFixed(2)}) reduces exposure to ${((company.etfDerivedUsd / summary.totalPortfolioUsd) * 100).toFixed(1)}% (ETF constituent floor).`;
      } else if (!canFullyRebalance && company.directHoldingUsd === 0) {
        message += ` Concentration is 100% derived from ETF constituents. Direct stock rebalancing unavailable.`;
      }

      alerts.push({
        ticker: company.ticker,
        companyName: company.companyName,
        currentPercentage: company.portfolioPercentage,
        targetPercentage: targetConcentrationPct,
        excessPercentage: Number(excessPercentage.toFixed(4)),
        excessUsd: Number(excessUsd.toFixed(4)),
        directHoldingUsd: company.directHoldingUsd,
        etfDerivedUsd: company.etfDerivedUsd,
        canFullyRebalanceWithDirectHolding: canFullyRebalance,
        maxDirectReductionUsd: Number(maxDirectReductionUsd.toFixed(4)),
        severity,
        message,
      });
    }
  }

  return alerts.sort((a, b) => b.excessUsd - a.excessUsd);
}
