import { describe, expect, it } from 'vitest';
import { SUPPORTED_ASSETS, USDC_MINT_MAINNET } from '@/config/tokens';
import { adaptScannedAccountsToHoldings } from '../adapter';
import { ScannedTokenAccount } from '../scanner';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { calculateUnderlyingExposure } from '@/lib/engine/exposure';
import { evaluateConcentrationRisk } from '@/lib/engine/concentration';
import { generateRebalanceRecommendation } from '@/lib/engine/rebalance';
import { getETFConstituentData } from '@/lib/etf/registry';

describe('Verified Mainnet Mint Configuration & Real Portfolio Flow (Phase 3A)', () => {
  describe('1. Verified Mint Configuration Integrity', () => {
    it('verifies that all supported assets are marked isVerifiedMint = true', () => {
      for (const [key, asset] of Object.entries(SUPPORTED_ASSETS)) {
        expect(asset.isVerifiedMint, `${key} must be marked as a verified mint`).toBe(true);
        expect(asset.mint).not.toContain('TODO');
      }
    });

    it('verifies official verified mint addresses and token decimals', () => {
      // NVDAx
      expect(SUPPORTED_ASSETS.NVDAx.mint).toBe('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh');
      expect(SUPPORTED_ASSETS.NVDAx.decimals).toBe(8);
      expect(SUPPORTED_ASSETS.NVDAx.assetType).toBe('SINGLE_STOCK');

      // SPYx
      expect(SUPPORTED_ASSETS.SPYx.mint).toBe('XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W');
      expect(SUPPORTED_ASSETS.SPYx.decimals).toBe(8);
      expect(SUPPORTED_ASSETS.SPYx.assetType).toBe('ETF');

      // QQQx
      expect(SUPPORTED_ASSETS.QQQx.mint).toBe('Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ');
      expect(SUPPORTED_ASSETS.QQQx.decimals).toBe(8);
      expect(SUPPORTED_ASSETS.QQQx.assetType).toBe('ETF');

      // USDC
      expect(SUPPORTED_ASSETS.USDC.mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(SUPPORTED_ASSETS.USDC.decimals).toBe(6);
      expect(SUPPORTED_ASSETS.USDC.assetType).toBe('STABLECOIN');
    });
  });

  describe('2. Real Portfolio Scanner-to-Engine Adaptation Flow', () => {
    it('executes full pipeline: Scanned Accounts -> Whitelist Adapter -> Exposure Engine -> Risk Alerts -> Rebalance Solver', () => {
      // Realistic multi-asset wallet on Solana Mainnet
      const scannedAccounts: ScannedTokenAccount[] = [
        // 1. USDC: 10,000.000000 USDC (SPL Token, 6 decimals)
        {
          pubkey: 'UsdcTokenAccountPubkey1111111111111111111',
          mint: USDC_MINT_MAINNET,
          owner: 'RealUserWallet1111111111111111111111111111',
          rawAmount: 10000000000n, // 10,000 * 10^6
          decimals: 6,
          uiAmount: 10000,
          programId: TOKEN_PROGRAM_ID.toBase58(),
          isToken2022: false,
        },
        // 2. SPYx: 50.00000000 SPYx (Token-2022, 8 decimals)
        {
          pubkey: 'SpyxTokenAccountPubkey1111111111111111111',
          mint: SUPPORTED_ASSETS.SPYx.mint,
          owner: 'RealUserWallet1111111111111111111111111111',
          rawAmount: 5000000000n, // 50 * 10^8
          decimals: 8,
          uiAmount: 50,
          programId: TOKEN_2022_PROGRAM_ID.toBase58(),
          isToken2022: true,
        },
        // 3. QQQx: 40.00000000 QQQx (Token-2022, 8 decimals)
        {
          pubkey: 'QqxTokenAccountPubkey1111111111111111111',
          mint: SUPPORTED_ASSETS.QQQx.mint,
          owner: 'RealUserWallet1111111111111111111111111111',
          rawAmount: 4000000000n, // 40 * 10^8
          decimals: 8,
          uiAmount: 40,
          programId: TOKEN_2022_PROGRAM_ID.toBase58(),
          isToken2022: true,
        },
        // 4. NVDAx: 50.00000000 NVDAx (Token-2022, 8 decimals)
        {
          pubkey: 'NvdaxTokenAccountPubkey111111111111111111',
          mint: SUPPORTED_ASSETS.NVDAx.mint,
          owner: 'RealUserWallet1111111111111111111111111111',
          rawAmount: 5000000000n, // 50 * 10^8
          decimals: 8,
          uiAmount: 50,
          programId: TOKEN_2022_PROGRAM_ID.toBase58(),
          isToken2022: true,
        },
      ];

      // Live market prices
      const prices = {
        [USDC_MINT_MAINNET]: {
          mint: USDC_MINT_MAINNET,
          usdPrice: 1.0,
          source: 'PEG_ORACLE',
          fetchedAt: Date.now(),
        },
        [SUPPORTED_ASSETS.SPYx.mint]: {
          mint: SUPPORTED_ASSETS.SPYx.mint,
          usdPrice: 500.0,
          source: 'DEXSCREENER',
          fetchedAt: Date.now(),
        },
        [SUPPORTED_ASSETS.QQQx.mint]: {
          mint: SUPPORTED_ASSETS.QQQx.mint,
          usdPrice: 400.0,
          source: 'DEXSCREENER',
          fetchedAt: Date.now(),
        },
        [SUPPORTED_ASSETS.NVDAx.mint]: {
          mint: SUPPORTED_ASSETS.NVDAx.mint,
          usdPrice: 120.0,
          source: 'DEXSCREENER',
          fetchedAt: Date.now(),
        },
      };

      // 1. Adapter Execution
      const adapterResult = adaptScannedAccountsToHoldings(scannedAccounts, SUPPORTED_ASSETS, prices);

      // Total Reported Value:
      // $10,000 (USDC) + $25,000 (SPYx) + $16,000 (QQQx) + $6,000 (NVDAx) = $57,000 USD
      expect(adapterResult.engineHoldings).toHaveLength(4);
      expect(adapterResult.totalReportedUsd).toBe(57000);
      expect(adapterResult.diagnostics.every((d) => d.status === 'ACCEPTED')).toBe(true);

      // 2. Exposure Engine Execution
      const summary = calculateUnderlyingExposure(adapterResult.engineHoldings, getETFConstituentData);
      expect(summary.totalPortfolioUsd).toBe(57000);

      // SPYx (6.85% of $25k = $1,712.50) + QQQx (8.50% of $16k = $1,360.00) + Direct NVDAx ($6,000)
      // Total NVDA Exposure = $1,712.50 + $1,360.00 + $6,000 = $9,072.50
      const nvda = summary.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(nvda).toBeDefined();
      expect(nvda?.directHoldingUsd).toBe(6000);
      expect(nvda?.etfDerivedUsd).toBe(3072.5);
      expect(nvda?.totalExposureUsd).toBe(9072.5);
      expect(nvda?.portfolioPercentage).toBeCloseTo((9072.5 / 57000) * 100, 4); // ~15.9167%

      // 3. Concentration Alert Evaluation (User Target = 10%)
      const alerts = evaluateConcentrationRisk(summary, 10.0);
      const nvdaAlert = alerts.find((a) => a.ticker === 'NVDA');
      expect(nvdaAlert).toBeDefined();
      // Allowed = $57,000 * 0.10 = $5,700. Excess = $9,072.50 - $5,700 = $3,372.50
      expect(nvdaAlert?.excessUsd).toBeCloseTo(3372.5, 2);
      expect(nvdaAlert?.canFullyRebalanceWithDirectHolding).toBe(true); // Direct $6k > $3.37k

      // 4. Rebalance Recommendation Solver
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
      expect(plan?.sellAmountTokens).toBeCloseTo(3372.5 / 120, 4); // ~28.1041 NVDAx tokens
      expect(plan?.projectedNewExposureUsd).toBeCloseTo(5700, 2);
      expect(plan?.projectedNewPercentage).toBe(10.0);
    });
  });
});
