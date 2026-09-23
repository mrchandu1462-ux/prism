import { SUPPORTED_ASSETS, USDC_MINT_MAINNET } from './tokens';
import { ScannedTokenAccount } from '@/lib/solana/scanner';
import { TokenPriceRecord } from '@/lib/price/fetcher';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

/**
 * PRISM DEMO PORTFOLIO CONFIGURATION
 * 
 * Sourced directly from repository test fixtures (portfolioAdapter.test.ts / engine.test.ts)
 * 
 * Portfolio Composition ($57,000 Total Value):
 * - 10,000.00 USDC @ $1.00   = $10,000 USD (SPL Token, 6 decimals)
 * - 50.00 SPYx       @ $500.00 = $25,000 USD (Token-2022, 8 decimals, S&P 500 ETF)
 * - 40.00 QQQx       @ $400.00 = $16,000 USD (Token-2022, 8 decimals, Nasdaq-100 ETF)
 * - 50.00 NVDAx      @ $120.00 = $6,000 USD  (Token-2022, 8 decimals, Direct Stock)
 */

export const DEMO_WALLET_ADDRESS = 'DemoPortfolio1111111111111111111111111111111';

export const DEMO_SCANNED_ACCOUNTS: ScannedTokenAccount[] = [
  // 1. USDC: 10,000.000000 USDC (SPL Token, 6 decimals)
  {
    pubkey: 'DemoUsdcTokenAccountPubkey111111111111111',
    mint: USDC_MINT_MAINNET,
    owner: DEMO_WALLET_ADDRESS,
    rawAmount: 10000000000n, // 10,000 * 10^6
    decimals: 6,
    uiAmount: 10000,
    programId: TOKEN_PROGRAM_ID.toBase58(),
    isToken2022: false,
  },
  // 2. SPYx: 50.00000000 SPYx (Token-2022, 8 decimals)
  {
    pubkey: 'DemoSpyxTokenAccountPubkey111111111111111',
    mint: SUPPORTED_ASSETS.SPYx.mint,
    owner: DEMO_WALLET_ADDRESS,
    rawAmount: 5000000000n, // 50 * 10^8
    decimals: 8,
    uiAmount: 50,
    programId: TOKEN_2022_PROGRAM_ID.toBase58(),
    isToken2022: true,
  },
  // 3. QQQx: 40.00000000 QQQx (Token-2022, 8 decimals)
  {
    pubkey: 'DemoQqxTokenAccountPubkey111111111111111',
    mint: SUPPORTED_ASSETS.QQQx.mint,
    owner: DEMO_WALLET_ADDRESS,
    rawAmount: 4000000000n, // 40 * 10^8
    decimals: 8,
    uiAmount: 40,
    programId: TOKEN_2022_PROGRAM_ID.toBase58(),
    isToken2022: true,
  },
  // 4. NVDAx: 50.00000000 NVDAx (Token-2022, 8 decimals)
  {
    pubkey: 'DemoNvdaxTokenAccountPubkey1111111111111',
    mint: SUPPORTED_ASSETS.NVDAx.mint,
    owner: DEMO_WALLET_ADDRESS,
    rawAmount: 5000000000n, // 50 * 10^8
    decimals: 8,
    uiAmount: 50,
    programId: TOKEN_2022_PROGRAM_ID.toBase58(),
    isToken2022: true,
  },
];

export const DEMO_PRICES: Record<string, TokenPriceRecord> = {
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
