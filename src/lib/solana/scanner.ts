import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export interface ScannedTokenAccount {
  pubkey: string;
  mint: string;
  owner: string;
  rawAmount: bigint;
  decimals: number;
  uiAmount: number;
  programId: string;
  isToken2022: boolean;
}

export interface ScannerResult {
  owner: string;
  accounts: ScannedTokenAccount[];
  scannedAt: number;
}

/**
 * Parses a raw parsed token account object from Solana RPC
 */
export function parseRawTokenAccount(
  accountPubkey: string,
  accountInfo: any,
  programId: string
): ScannedTokenAccount | null {
  try {
    const data = accountInfo?.data;
    if (!data || data.program !== 'spl-token' && data.program !== 'spl-token-2022') {
      // Fallback inspection of parsed structure
      if (!data?.parsed?.info) return null;
    }

    const info = data.parsed.info;
    const tokenAmount = info.tokenAmount;

    if (!info.mint || !tokenAmount) {
      return null;
    }

    const rawAmountStr = tokenAmount.amount || '0';
    const rawAmount = BigInt(rawAmountStr);
    const decimals = typeof tokenAmount.decimals === 'number' ? tokenAmount.decimals : 0;
    const uiAmount = typeof tokenAmount.uiAmount === 'number'
      ? tokenAmount.uiAmount
      : Number(rawAmount) / Math.pow(10, decimals);

    return {
      pubkey: accountPubkey,
      mint: info.mint,
      owner: info.owner || '',
      rawAmount,
      decimals,
      uiAmount,
      programId,
      isToken2022: programId === TOKEN_2022_PROGRAM_ID.toBase58(),
    };
  } catch (err) {
    console.error(`Failed to parse token account ${accountPubkey}:`, err);
    return null;
  }
}

/**
 * Scans all token accounts owned by the given public key across both
 * the legacy SPL Token Program and Token-2022 Program.
 * 
 * Propagates any RPC errors without silently converting them to empty arrays.
 */
export async function fetchWalletTokenAccounts(
  connection: Connection,
  ownerPublicKey: PublicKey
): Promise<ScannerResult> {
  const accounts: ScannedTokenAccount[] = [];

  // 1. Scan Legacy SPL Token Program
  let splAccounts;
  try {
    splAccounts = await connection.getParsedTokenAccountsByOwner(ownerPublicKey, {
      programId: TOKEN_PROGRAM_ID,
    });
  } catch (err: any) {
    console.error('Error scanning SPL Token Program accounts:', err);
    throw new Error(`Failed to scan SPL Token Program accounts: ${err?.message || String(err)}`);
  }

  for (const { pubkey, account } of splAccounts.value) {
    const parsed = parseRawTokenAccount(
      pubkey.toBase58(),
      account,
      TOKEN_PROGRAM_ID.toBase58()
    );
    if (parsed && parsed.rawAmount > 0n) {
      accounts.push(parsed);
    }
  }

  // 2. Scan Token-2022 Program
  let token2022Accounts;
  try {
    token2022Accounts = await connection.getParsedTokenAccountsByOwner(ownerPublicKey, {
      programId: TOKEN_2022_PROGRAM_ID,
    });
  } catch (err: any) {
    console.error('Error scanning Token-2022 Program accounts:', err);
    throw new Error(`Failed to scan Token-2022 Program accounts: ${err?.message || String(err)}`);
  }

  for (const { pubkey, account } of token2022Accounts.value) {
    const parsed = parseRawTokenAccount(
      pubkey.toBase58(),
      account,
      TOKEN_2022_PROGRAM_ID.toBase58()
    );
    if (parsed && parsed.rawAmount > 0n) {
      accounts.push(parsed);
    }
  }

  return {
    owner: ownerPublicKey.toBase58(),
    accounts,
    scannedAt: Date.now(),
  };
}
