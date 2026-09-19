import {
  AssetHolding,
  ETFConstituentData,
  PortfolioExposureSummary,
  SectorExposure,
  UnderlyingCompanyExposure,
} from '@/types';

/**
 * PURE DETERMINISTIC LOOK-THROUGH EXPOSURE ENGINE
 * 
 * Rules Adherence:
 * - Rule 7: Generic model: ETF position value * constituent weight = underlying exposure.
 * - Rule 8: Pure functions, zero React or RPC dependencies.
 */

export function calculateUnderlyingExposure(
  holdings: AssetHolding[],
  getETFData: (ticker: string) => ETFConstituentData | undefined
): PortfolioExposureSummary {
  const totalPortfolioUsd = holdings.reduce((sum, h) => sum + h.usdValue, 0);

  if (totalPortfolioUsd <= 0) {
    return {
      totalPortfolioUsd: 0,
      reportedHoldings: holdings,
      underlyingCompanies: [],
      sectorBreakdown: [],
      topConcentrations: [],
    };
  }

  // Map of underlying company ticker -> UnderlyingCompanyExposure accumulator
  const companyMap = new Map<string, UnderlyingCompanyExposure>();
  const sectorMap = new Map<string, number>();

  // Process all holdings
  for (const holding of holdings) {
    if (holding.usdValue <= 0) continue;

    if (holding.assetType === 'SINGLE_STOCK' && holding.underlyingTicker) {
      const ticker = holding.underlyingTicker.toUpperCase();
      const existing = companyMap.get(ticker) || {
        ticker,
        companyName: holding.name.replace(/ Tokenized Stock$/i, '').replace(/x$/i, ''),
        sector: holding.sector || 'Unclassified',
        directHoldingUsd: 0,
        etfDerivedUsd: 0,
        totalExposureUsd: 0,
        portfolioPercentage: 0,
        derivedFromETFs: [],
      };

      if (existing.sector === 'Unclassified' && holding.sector) {
        existing.sector = holding.sector;
      }

      existing.directHoldingUsd += holding.usdValue;
      existing.totalExposureUsd += holding.usdValue;
      companyMap.set(ticker, existing);

      // Accumulate direct single stock sector breakdown
      if (holding.sector) {
        const currentSectorUsd = sectorMap.get(holding.sector) || 0;
        sectorMap.set(holding.sector, currentSectorUsd + holding.usdValue);
      }
    } else if (holding.assetType === 'ETF' && holding.etfConstituentId) {
      const etfData = getETFData(holding.etfConstituentId);
      if (!etfData) continue;

      for (const constituent of etfData.constituents) {
        const ticker = constituent.ticker.toUpperCase();
        const contributedUsd = holding.usdValue * constituent.weight;

        const existing = companyMap.get(ticker) || {
          ticker,
          companyName: constituent.companyName,
          sector: constituent.sector,
          directHoldingUsd: 0,
          etfDerivedUsd: 0,
          totalExposureUsd: 0,
          portfolioPercentage: 0,
          derivedFromETFs: [],
        };

        // If sector was previously unclassified, populate with ETF constituent sector
        if (existing.sector === 'Unclassified' && constituent.sector) {
          existing.sector = constituent.sector;
        }

        existing.etfDerivedUsd += contributedUsd;
        existing.totalExposureUsd += contributedUsd;
        existing.derivedFromETFs.push({
          etfSymbol: holding.symbol,
          etfHoldingUsd: holding.usdValue,
          weightInEtf: constituent.weight,
          contributedUsd,
        });

        companyMap.set(ticker, existing);

        // Accumulate sector breakdown
        if (constituent.sector) {
          const currentSectorUsd = sectorMap.get(constituent.sector) || 0;
          sectorMap.set(constituent.sector, currentSectorUsd + contributedUsd);
        }
      }
    }
  }

  // Format underlying companies and calculate exact portfolio percentages
  const underlyingCompanies: UnderlyingCompanyExposure[] = Array.from(companyMap.values())
    .map((company) => {
      const percentage = (company.totalExposureUsd / totalPortfolioUsd) * 100;
      return {
        ...company,
        portfolioPercentage: Number(percentage.toFixed(4)),
        directHoldingUsd: Number(company.directHoldingUsd.toFixed(4)),
        etfDerivedUsd: Number(company.etfDerivedUsd.toFixed(4)),
        totalExposureUsd: Number(company.totalExposureUsd.toFixed(4)),
      };
    })
    .sort((a, b) => b.totalExposureUsd - a.totalExposureUsd);

  // Format sector breakdown
  const sectorBreakdown: SectorExposure[] = Array.from(sectorMap.entries())
    .map(([sector, exposureUsd]) => ({
      sector,
      exposureUsd: Number(exposureUsd.toFixed(4)),
      portfolioPercentage: Number(((exposureUsd / totalPortfolioUsd) * 100).toFixed(4)),
    }))
    .sort((a, b) => b.exposureUsd - a.exposureUsd);

  return {
    totalPortfolioUsd: Number(totalPortfolioUsd.toFixed(4)),
    reportedHoldings: holdings,
    underlyingCompanies,
    sectorBreakdown,
    topConcentrations: underlyingCompanies.slice(0, 10),
  };
}
