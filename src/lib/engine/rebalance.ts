import {
  AssetHolding,
  PortfolioExposureSummary,
  RebalanceRecommendation,
  SupportedAssetConfig,
} from '@/types';
import { ScannedTokenAccount } from '../solana/scanner';
import { TokenPriceRecord } from '../price/fetcher';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

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

/**
 * Pure deterministic state transition helper for simulated / demo rebalances.
 * Applies the rebalance recommendation to the scanned token accounts:
 * - Reduces direct stock account uiAmount / rawAmount by sellAmountTokens
 * - Increases output token account uiAmount / rawAmount by received tokens
 * 
 * Returns a new array of ScannedTokenAccount without mutating inputs.
 */
export function applySimulatedRebalance(
  accounts: ScannedTokenAccount[],
  recommendation: RebalanceRecommendation,
  prices: Record<string, TokenPriceRecord> = {}
): ScannedTokenAccount[] {
  const sellMint = recommendation.directStockToSell.mint;
  const outputMint = recommendation.outputToken.mint;
  const sellTokens = recommendation.sellAmountTokens;

  const outputPrice = prices[outputMint]?.usdPrice || recommendation.outputToken.markPrice || 1.0;
  const receivedTokens = outputPrice > 0 ? recommendation.sellAmountUsd / outputPrice : recommendation.sellAmountUsd;

  let foundOutput = false;

  const updatedAccounts: ScannedTokenAccount[] = accounts.map((acc) => {
    if (acc.mint === sellMint) {
      const newUiAmount = Math.max(0, acc.uiAmount - sellTokens);
      const newRawAmount = BigInt(Math.max(0, Math.round(newUiAmount * Math.pow(10, acc.decimals))));
      return {
        ...acc,
        uiAmount: newUiAmount,
        rawAmount: newRawAmount,
      };
    }

    if (acc.mint === outputMint) {
      foundOutput = true;
      const newUiAmount = acc.uiAmount + receivedTokens;
      const newRawAmount = BigInt(Math.round(newUiAmount * Math.pow(10, acc.decimals)));
      return {
        ...acc,
        uiAmount: newUiAmount,
        rawAmount: newRawAmount,
      };
    }

    return { ...acc };
  });

  if (!foundOutput) {
    const decimals = recommendation.outputToken.decimals;
    const rawAmount = BigInt(Math.round(receivedTokens * Math.pow(10, decimals)));
    const isToken2022 = recommendation.outputToken.assetType !== 'STABLECOIN';
    updatedAccounts.push({
      pubkey: `Simulated${recommendation.outputToken.symbol}AccountPubkey1111111`,
      mint: outputMint,
      owner: accounts[0]?.owner || 'DemoPortfolio1111111111111111111111111111111',
      rawAmount,
      decimals,
      uiAmount: receivedTokens,
      programId: isToken2022
        ? TOKEN_2022_PROGRAM_ID.toBase58()
        : TOKEN_PROGRAM_ID.toBase58(),
      isToken2022,
    });
  }

  return updatedAccounts;
}
