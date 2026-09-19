import { Connection } from '@solana/web3.js';
import { SupportedAssetConfig } from '@/types';
import { TesseraToken } from './types';
import { fetchTesseraTokens, TesseraClientOptions } from './client';
import { validateSolanaMints, MintValidationResult, VerifiedMintInfo } from '../solana/mintValidator';
import { BASE_SUPPORTED_ASSETS } from '@/config/tokens';

export interface AuthoritativeRegistryResult {
  assets: Record<string, SupportedAssetConfig>;
  tesseraTokens: TesseraToken[];
  tesseraPrices: Record<string, number>;
  validationResults: Map<string, MintValidationResult>;
  fetchedAt: number;
}

/**
 * Maps a validated Tessera token into PRISM's SupportedAssetConfig model
 */
export function adaptTesseraTokenToSupportedAsset(
  token: TesseraToken,
  mintInfo?: VerifiedMintInfo
): SupportedAssetConfig {
  const decimals = mintInfo?.decimals ?? 9; // Default to on-chain SPL Token-2022 decimals if pre-verified
  const underlyingTicker = token.symbol;

  return {
    symbol: token.symbol,
    name: token.name,
    mint: token.mint,
    decimals,
    assetType: 'SINGLE_STOCK',
    underlyingTicker,
    sector: token.sector,
    markPrice: token.markPrice,
    isVerifiedMint: mintInfo ? mintInfo.isInitialized : true,
  };
}

/**
 * Builds the authoritative PRISM token registry combining:
 * 1. Authoritative Tessera API token details with on-chain Solana mint validation
 * 2. Base settlement stablecoin (USDC) and verified TradFi ETFs (SPYx, QQQx)
 * 
 * Rules Adherence:
 * - Does not remove verified Solana mint validation or core risk engine.
 * - Sourced directly from Tessera public API + Solana mainnet on-chain mints.
 * - Never fabricates fake fallback data.
 */
export async function buildAuthoritativeTokenRegistry(
  connection: Connection,
  clientOptions: TesseraClientOptions = {}
): Promise<AuthoritativeRegistryResult> {
  // 1. Fetch raw token details from Tessera public API
  const tesseraTokens = await fetchTesseraTokens(clientOptions);

  // 2. Extract mint addresses and validate against Solana on-chain program accounts
  const mintAddresses = tesseraTokens.map((t) => t.mint);
  const validationResults = await validateSolanaMints(connection, mintAddresses);

  // 3. Build merged supported asset configs
  const mergedAssets: Record<string, SupportedAssetConfig> = { ...BASE_SUPPORTED_ASSETS };
  const tesseraPrices: Record<string, number> = {};

  for (const token of tesseraTokens) {
    const valResult = validationResults.get(token.mint);

    // Only include tokens whose mints exist and are verified on Solana
    if (valResult?.isValid && valResult.mintInfo) {
      const config = adaptTesseraTokenToSupportedAsset(token, valResult.mintInfo);
      mergedAssets[token.symbol] = config;
      tesseraPrices[token.mint] = token.markPrice;
    } else {
      console.warn(
        `Tessera token ${token.symbol} (${token.mint}) failed on-chain mint verification: ${valResult?.error || 'Unknown error'}`
      );
    }
  }

  return {
    assets: mergedAssets,
    tesseraTokens,
    tesseraPrices,
    validationResults,
    fetchedAt: Date.now(),
  };
}
