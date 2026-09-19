import {
  AssetHolding,
  PortfolioExposureSummary,
  RebalanceRecommendation,
  SupportedAssetConfig,
} from '@/types';

/**
 * PURE DETERMINISTIC REBALANCE SOLVER
 * 
 * Rules Adherence:
 * - Rule 9: For MVP, ONLY rebalance direct tokenized-stock holdings.
 * - Do not automatically unwind ETFs, LPs, or lending collateral.
 * - Bound de-risking trades to the available direct stock holding.
 */

export function generateRebalanceRecommendation(
  targetCompanyTicker: string,
  summary: PortfolioExposureSummary,
  targetConcentrationPct: number,
  outputStablecoin: SupportedAssetConfig,
  getDirectAssetConfig: (underlyingTicker: string) => SupportedAssetConfig | undefined
): RebalanceRecommendation | null {
  if (summary.totalPortfolioUsd <= 0 || targetConcentrationPct <= 0) {
    return null;
  }

  const ticker = targetCompanyTicker.toUpperCase();
  const company = summary.underlyingCompanies.find((c) => c.ticker === ticker);

  if (!company) {
    return null;
  }

  // If already below or equal to target, no rebalance needed
  if (company.portfolioPercentage <= targetConcentrationPct) {
    return null;
  }

  // Find corresponding direct stock configuration (e.g. NVDA -> NVDAx)
  const directAssetConfig = getDirectAssetConfig(ticker);
  if (!directAssetConfig) {
    return null;
  }

  // Find user's direct holding for this stock in the portfolio
  const directHolding = summary.reportedHoldings.find(
    (h) =>
      h.assetType === 'SINGLE_STOCK' &&
      (h.underlyingTicker?.toUpperCase() === ticker ||
        h.symbol.toUpperCase() === ticker ||
        h.symbol.toUpperCase().replace(/^T-/, '') === ticker)
  );

  const directHoldingUsd = directHolding?.usdValue || 0;
  const directTokenPrice = directHolding?.usdPrice || (directHoldingUsd > 0 && directHolding?.uiAmount ? directHoldingUsd / directHolding.uiAmount : 0);

  // If user owns 0 direct stock, we cannot rebalance using direct stock sales
  if (directHoldingUsd <= 0 || directTokenPrice <= 0) {
    return null;
  }

  const allowedTargetUsd = (summary.totalPortfolioUsd * targetConcentrationPct) / 100;
  const rawExcessUsd = Math.max(0, company.totalExposureUsd - allowedTargetUsd);

  // Constraint: Cannot sell more direct stock than user owns
  const isConstrainedByDirectHolding = rawExcessUsd > directHoldingUsd;
  const sellAmountUsd = isConstrainedByDirectHolding ? directHoldingUsd : rawExcessUsd;
  const sellAmountTokens = sellAmountUsd / directTokenPrice;

  const projectedNewExposureUsd = company.totalExposureUsd - sellAmountUsd;
  // Portfolio total value remains approximately equal (swapped into USDC)
  const projectedNewPercentage = (projectedNewExposureUsd / summary.totalPortfolioUsd) * 100;

  return {
    targetCompanyTicker: ticker,
    companyName: company.companyName,
    directStockToSell: directAssetConfig,
    currentExposureUsd: Number(company.totalExposureUsd.toFixed(4)),
    targetPercentage: targetConcentrationPct,
    excessUsd: Number(rawExcessUsd.toFixed(4)),
    sellAmountUsd: Number(sellAmountUsd.toFixed(4)),
    sellAmountTokens: Number(sellAmountTokens.toFixed(6)),
    outputToken: outputStablecoin,
    isConstrainedByDirectHolding,
    projectedNewExposureUsd: Number(projectedNewExposureUsd.toFixed(4)),
    projectedNewPercentage: Number(projectedNewPercentage.toFixed(4)),
  };
}
