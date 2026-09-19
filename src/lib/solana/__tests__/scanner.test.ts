import { describe, expect, it } from 'vitest';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { parseRawTokenAccount, ScannedTokenAccount } from '../scanner';
import { adaptScannedAccountsToHoldings } from '../adapter';
import { SupportedAssetConfig } from '@/types';
import { calculateUnderlyingExposure } from '@/lib/engine/exposure';
import { getETFConstituentData } from '@/lib/etf/registry';

describe('Solana Scanner & Adapter Subsystem (Phase 2)', () => {
  const verifiedUSDC: SupportedAssetConfig = {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    assetType: 'STABLECOIN',
    isVerifiedMint: true,
  };

  const verifiedNVDAx: SupportedAssetConfig = {
    symbol: 'NVDAx',
    name: 'NVIDIA Tokenized Stock',
    mint: 'NVDAxVerifiedMintAddress1111111111111111111',
    decimals: 8,
    assetType: 'SINGLE_STOCK',
    underlyingTicker: 'NVDA',
    isVerifiedMint: true,
  };

  const unverifiedSPYx: SupportedAssetConfig = {
    symbol: 'SPYx',
    name: 'SPDR S&P 500 Tokenized ETF',
    mint: 'TODO_VERIFIED_SPYX_MINT_ADDRESS',
    decimals: 8,
    assetType: 'ETF',
    underlyingTicker: 'SPY',
    etfConstituentId: 'SPY',
    isVerifiedMint: false, // Unverified placeholder
  };

  const mockWhitelist: Record<string, SupportedAssetConfig> = {
    USDC: verifiedUSDC,
    NVDAx: verifiedNVDAx,
    SPYx: unverifiedSPYx,
  };

  describe('1. Raw Token Account Parser', () => {
    it('correctly parses standard SPL token account with 6 decimals', () => {
      const mockAccountInfo = {
        data: {
          program: 'spl-token',
          parsed: {
            info: {
              mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              owner: 'OwnerWallet11111111111111111111111111111111',
              tokenAmount: {
                amount: '150000000', // 150.000000 USDC
                decimals: 6,
                uiAmount: 150.0,
                uiAmountString: '150',
              },
            },
            type: 'account',
          },
        },
      };

      const result = parseRawTokenAccount(
        'TokenAccountPubkey1111111111111111111111111',
        mockAccountInfo,
        TOKEN_PROGRAM_ID.toBase58()
      );

      expect(result).not.toBeNull();
      expect(result?.mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(result?.rawAmount).toBe(150000000n);
      expect(result?.decimals).toBe(6);
      expect(result?.uiAmount).toBe(150.0);
      expect(result?.isToken2022).toBe(false);
      expect(result?.programId).toBe(TOKEN_PROGRAM_ID.toBase58());
    });

    it('correctly identifies and parses Token-2022 account with 8 decimals', () => {
      const mockAccountInfo = {
        data: {
          program: 'spl-token-2022',
          parsed: {
            info: {
              mint: 'NVDAxVerifiedMintAddress1111111111111111111',
              owner: 'OwnerWallet11111111111111111111111111111111',
              tokenAmount: {
                amount: '2500000000', // 25.00000000 NVDAx
                decimals: 8,
                uiAmount: 25.0,
                uiAmountString: '25',
              },
            },
            type: 'account',
          },
        },
      };

      const result = parseRawTokenAccount(
        'Token2022AccountPubkey11111111111111111111111',
        mockAccountInfo,
        TOKEN_2022_PROGRAM_ID.toBase58()
      );

      expect(result).not.toBeNull();
      expect(result?.mint).toBe('NVDAxVerifiedMintAddress1111111111111111111');
      expect(result?.rawAmount).toBe(2500000000n);
      expect(result?.decimals).toBe(8);
      expect(result?.uiAmount).toBe(25.0);
      expect(result?.isToken2022).toBe(true);
      expect(result?.programId).toBe(TOKEN_2022_PROGRAM_ID.toBase58());
    });

    it('returns null on malformed account data', () => {
      const malformedInfo = { data: { other: {} } };
      const result = parseRawTokenAccount('invalid', malformedInfo, TOKEN_PROGRAM_ID.toBase58());
      expect(result).toBeNull();
    });
  });

  describe('2. Whitelist Filtering & Holding Adaptation', () => {
    it('accepts verified whitelisted tokens and computes exact USD valuation', () => {
      const scanned: ScannedTokenAccount[] = [
        {
          pubkey: 'AccountPubkey1',
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          owner: 'Owner1',
          rawAmount: 5000000000n,
          decimals: 6,
          uiAmount: 5000.0,
          programId: TOKEN_PROGRAM_ID.toBase58(),
          isToken2022: false,
        },
        {
          pubkey: 'AccountPubkey2',
          mint: 'NVDAxVerifiedMintAddress1111111111111111111',
          owner: 'Owner1',
          rawAmount: 1600000000n,
          decimals: 8,
          uiAmount: 16.0,
          programId: TOKEN_2022_PROGRAM_ID.toBase58(),
          isToken2022: true,
        },
      ];

      const prices = {
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          usdPrice: 1.0,
          source: 'PEG_ORACLE',
          fetchedAt: Date.now(),
        },
        'NVDAxVerifiedMintAddress1111111111111111111': {
          mint: 'NVDAxVerifiedMintAddress1111111111111111111',
          usdPrice: 125.0,
          source: 'DEXSCREENER',
          fetchedAt: Date.now(),
        },
      };

      const adapted = adaptScannedAccountsToHoldings(scanned, mockWhitelist, prices);

      expect(adapted.engineHoldings).toHaveLength(2);
      expect(adapted.totalReportedUsd).toBe(7000.0); // $5,000 USDC + $2,000 NVDAx

      expect(adapted.diagnostics).toHaveLength(2);
      expect(adapted.diagnostics[0].status).toBe('ACCEPTED');
      expect(adapted.diagnostics[1].status).toBe('ACCEPTED');
    });

    it('rejects unverified placeholder mints with explicit IGNORED_UNVERIFIED_MINT status', () => {
      const scanned: ScannedTokenAccount[] = [
        {
          pubkey: 'AccountPubkey3',
          mint: 'TODO_VERIFIED_SPYX_MINT_ADDRESS',
          owner: 'Owner1',
          rawAmount: 1000000000n,
          decimals: 8,
          uiAmount: 10.0,
          programId: TOKEN_PROGRAM_ID.toBase58(),
          isToken2022: false,
        },
      ];

      const prices = {};
      const adapted = adaptScannedAccountsToHoldings(scanned, mockWhitelist, prices);

      expect(adapted.engineHoldings).toHaveLength(0); // Excluded from engine
      expect(adapted.diagnostics).toHaveLength(1);
      expect(adapted.diagnostics[0].status).toBe('IGNORED_UNVERIFIED_MINT');
      expect(adapted.diagnostics[0].reason).toContain('unverified placeholder');
    });

    it('rejects spam / non-whitelisted tokens with IGNORED_NOT_WHITELISTED status', () => {
      const scanned: ScannedTokenAccount[] = [
        {
          pubkey: 'AccountPubkey4',
          mint: 'SpamScamTokenMint111111111111111111111111111',
          owner: 'Owner1',
          rawAmount: 1000000000n,
          decimals: 6,
          uiAmount: 1000.0,
          programId: TOKEN_PROGRAM_ID.toBase58(),
          isToken2022: false,
        },
      ];

      const adapted = adaptScannedAccountsToHoldings(scanned, mockWhitelist, {});

      expect(adapted.engineHoldings).toHaveLength(0);
      expect(adapted.diagnostics).toHaveLength(1);
      expect(adapted.diagnostics[0].status).toBe('IGNORED_NOT_WHITELISTED');
    });

    it('passes adapted holdings seamlessly into Phase 1 exposure engine', () => {
      const scanned: ScannedTokenAccount[] = [
        {
          pubkey: 'AccountPubkey1',
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          owner: 'Owner1',
          rawAmount: 8000000000n,
          decimals: 6,
          uiAmount: 8000.0,
          programId: TOKEN_PROGRAM_ID.toBase58(),
          isToken2022: false,
        },
        {
          pubkey: 'AccountPubkey2',
          mint: 'NVDAxVerifiedMintAddress1111111111111111111',
          owner: 'Owner1',
          rawAmount: 1600000000n,
          decimals: 8,
          uiAmount: 16.0,
          programId: TOKEN_2022_PROGRAM_ID.toBase58(),
          isToken2022: true,
        },
      ];

      const prices = {
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          usdPrice: 1.0,
          source: 'PEG_ORACLE',
          fetchedAt: Date.now(),
        },
        'NVDAxVerifiedMintAddress1111111111111111111': {
          mint: 'NVDAxVerifiedMintAddress1111111111111111111',
          usdPrice: 125.0,
          source: 'DEXSCREENER',
          fetchedAt: Date.now(),
        },
      };

      const adapted = adaptScannedAccountsToHoldings(scanned, mockWhitelist, prices);
      const summary = calculateUnderlyingExposure(adapted.engineHoldings, getETFConstituentData);

      expect(summary.totalPortfolioUsd).toBe(10000.0); // $8,000 USDC + $2,000 NVDAx
      const nvda = summary.underlyingCompanies.find((c) => c.ticker === 'NVDA');
      expect(nvda?.totalExposureUsd).toBe(2000.0);
      expect(nvda?.portfolioPercentage).toBe(20.0);
    });
  });
});
