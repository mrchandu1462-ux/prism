/**
 * PRISM DOMAIN TYPE DEFINITIONS
 * Strict types for Token Holdings, Off-Chain ETF Decomposition, Look-Through Risk & Rebalancing
 */

export type AssetType = 'SINGLE_STOCK' | 'ETF' | 'STABLECOIN' | 'OTHER';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SupportedAssetConfig {
  symbol: string;           // e.g. "NVDAx", "SPYx", "USDC", "T-OpenAI"
  name: string;             // e.g. "NVIDIA Tokenized Stock", "T-OpenAI"
  mint: string;             // Solana Mint address (or placeholder if unverified)
  decimals: number;
  assetType: AssetType;
  underlyingTicker?: string;// e.g. "NVDA", "T-OpenAI"
  etfConstituentId?: string;// Reference key in ETF constituent registry (e.g. "SPY")
  isVerifiedMint: boolean;  // Strict check flag
  sector?: string;          // e.g. "Artificial Intelligence", "Aerospace"
  markPrice?: number;       // Tessera authoritative markPrice if available
}

export interface ETFProvenance {
  source: string;           // e.g. "State Street Global Advisors (SSGA) / SEC Form N-PORT"
  retrievalDate: string;    // ISO Date: e.g. "2026-09-15"
  effectiveDate: string;    // ISO Date: e.g. "2026-09-15"
  timestamp: number;        // Unix epoch ms
  legalDisclaimer: string;  // Off-chain TradFi constituent attribution notice
}

export interface ETFConstituent {
  ticker: string;           // e.g. "NVDA", "AAPL", "MSFT"
  companyName: string;
  weight: number;           // Fractional weight (e.g., 0.0685 for 6.85%)
  sector: string;           // e.g. "Information Technology"
}

export interface ETFConstituentData {
  etfTicker: string;        // "SPY", "QQQ"
  name: string;             // "SPDR S&P 500 ETF Trust"
  provenance: ETFProvenance;
  constituents: ETFConstituent[];
}

export interface AssetHolding {
  mint: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  rawBalance: bigint;       // Integer base units (lamports/decimals)
  uiAmount: number;         // Float quantity of tokens held
  usdPrice: number;         // USD price per 1 full token unit
  usdValue: number;         // uiAmount * usdPrice
  underlyingTicker?: string;
  etfConstituentId?: string;
  sector?: string;
  markPrice?: number;
}

export interface ETFAttribution {
  etfSymbol: string;
  etfHoldingUsd: number;
  weightInEtf: number;
  contributedUsd: number;
}

export interface UnderlyingCompanyExposure {
  ticker: string;
  companyName: string;
  sector: string;
  directHoldingUsd: number;
  etfDerivedUsd: number;
  totalExposureUsd: number;
  portfolioPercentage: number; // 0 - 100%
  derivedFromETFs: ETFAttribution[];
}

export interface SectorExposure {
  sector: string;
  exposureUsd: number;
  portfolioPercentage: number;
}

export interface PortfolioExposureSummary {
  totalPortfolioUsd: number;
  reportedHoldings: AssetHolding[];
  underlyingCompanies: UnderlyingCompanyExposure[];
  sectorBreakdown: SectorExposure[];
  topConcentrations: UnderlyingCompanyExposure[];
}

export interface ConcentrationRiskAlert {
  ticker: string;
  companyName: string;
  currentPercentage: number;
  targetPercentage: number;
  excessPercentage: number;
  excessUsd: number;
  directHoldingUsd: number;
  etfDerivedUsd: number;
  canFullyRebalanceWithDirectHolding: boolean;
  maxDirectReductionUsd: number;
  severity: RiskSeverity;
  message: string;
}

export interface RebalanceRecommendation {
  targetCompanyTicker: string;
  companyName: string;
  directStockToSell: SupportedAssetConfig;
  currentExposureUsd: number;
  targetPercentage: number;
  excessUsd: number;
  sellAmountUsd: number;
  sellAmountTokens: number;
  outputToken: SupportedAssetConfig;
  isConstrainedByDirectHolding: boolean;
  projectedNewExposureUsd: number;
  projectedNewPercentage: number;
}
