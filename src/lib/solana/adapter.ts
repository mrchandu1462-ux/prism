import { AssetHolding, SupportedAssetConfig } from '@/types';
import { ScannedTokenAccount } from './scanner';
import { TokenPriceRecord } from '../price/fetcher';

export interface DiagnosticsTokenRecord {
  pubkey: string;
  mint: string;
  symbol: string;
  name: string;
  rawAmount: string;
  decimals: number;
  normalizedBalance: number;
  usdPrice: number | null;
  usdValue: number | null;
  programId: string;
  isToken2022: boolean;
  status: 'ACCEPTED' | 'IGNORED_UNVERIFIED_MINT' | 'IGNORED_ZERO_BALANCE' | 'IGNORED_NOT_WHITELISTED';
  reason?: string;
}

export interface AdapterResult {
  engineHoldings: AssetHolding[];
  diagnostics: DiagnosticsTokenRecord[];
  totalReportedUsd: number;
}

/**
 * Transforms raw scanned Solana token accounts into verified Phase 1 engine inputs
 * while generating full diagnostics for every detected account.
 */
export function adaptScannedAccountsToHoldings(
  accounts: ScannedTokenAccount[],
  whitelist: Record<string, SupportedAssetConfig>,
  prices: Record<string, TokenPriceRecord>
): AdapterResult {
  const engineHoldings: AssetHolding[] = [];
  const diagnostics: DiagnosticsTokenRecord[] = [];

  // Build lookup index by mint address
  const mintToAssetConfig = new Map<string, SupportedAssetConfig>();
  for (const asset of Object.values(whitelist)) {
    mintToAssetConfig.set(asset.mint, asset);
  }

  for (const acc of accounts) {
    const config = mintToAssetConfig.get(acc.mint);
    const priceRecord = prices[acc.mint];
    const usdPrice = priceRecord ? priceRecord.usdPrice : 0;
    const usdValue = usdPrice > 0 ? acc.uiAmount * usdPrice : 0;

    // Evaluate account status
    let status: DiagnosticsTokenRecord['status'] = 'ACCEPTED';
    let reason: string | undefined;

    if (acc.rawAmount <= 0n) {
      status = 'IGNORED_ZERO_BALANCE';
      reason = 'Token balance is 0';
    } else if (!config) {
      status = 'IGNORED_NOT_WHITELISTED';
      reason = 'Mint is not present in supported assets whitelist';
    } else if (!config.isVerifiedMint) {
      status = 'IGNORED_UNVERIFIED_MINT';
      reason = `Mint '${acc.mint}' is an unverified placeholder pending issuer confirmation`;
    }

    // Record diagnostic entry
    diagnostics.push({
      pubkey: acc.pubkey,
      mint: acc.mint,
      symbol: config?.symbol || 'UNKNOWN',
      name: config?.name || 'Unrecognized SPL Token',
      rawAmount: acc.rawAmount.toString(),
      decimals: acc.decimals,
      normalizedBalance: acc.uiAmount,
      usdPrice: usdPrice > 0 ? usdPrice : null,
      usdValue: usdValue > 0 ? usdValue : null,
      programId: acc.programId,
      isToken2022: acc.isToken2022,
      status,
      reason,
    });

    // If accepted, add to engine holdings
    if (status === 'ACCEPTED' && config) {
      engineHoldings.push({
        mint: acc.mint,
        symbol: config.symbol,
        name: config.name,
        assetType: config.assetType,
        rawBalance: acc.rawAmount,
        uiAmount: acc.uiAmount,
        usdPrice,
        usdValue,
        underlyingTicker: config.underlyingTicker,
        etfConstituentId: config.etfConstituentId,
        sector: config.sector,
        markPrice: config.markPrice,
      });
    }
  }

  const totalReportedUsd = engineHoldings.reduce((sum, h) => sum + h.usdValue, 0);

  return {
    engineHoldings,
    diagnostics,
    totalReportedUsd,
  };
}
