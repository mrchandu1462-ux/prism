import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

export interface VerifiedMintInfo {
  mint: string;
  decimals: number;
  isInitialized: boolean;
  programId: string;
  isToken2022: boolean;
  supply?: string;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
}

export interface MintValidationResult {
  mint: string;
  isValid: boolean;
  mintInfo?: VerifiedMintInfo;
  error?: string;
}

/**
 * Validates a Solana mint address format and queries on-chain account data
 * to ensure it is an initialized SPL or Token-2022 mint.
 */
export async function validateSolanaMint(
  connection: Connection,
  mintAddress: string
): Promise<MintValidationResult> {
  let mintPubkey: PublicKey;

  try {
    mintPubkey = new PublicKey(mintAddress.trim());
  } catch (err: any) {
    return {
      mint: mintAddress,
      isValid: false,
      error: `Invalid Solana public key format: ${err?.message || 'bad base58'}`,
    };
  }

  try {
    const accountInfo = await connection.getParsedAccountInfo(mintPubkey);

    if (!accountInfo.value) {
      return {
        mint: mintAddress,
        isValid: false,
        error: `Mint account not found on-chain: ${mintAddress}`,
      };
    }

    const ownerProgram = accountInfo.value.owner.toBase58();
    const isSplToken = ownerProgram === TOKEN_PROGRAM_ID.toBase58();
    const isToken2022 = ownerProgram === TOKEN_2022_PROGRAM_ID.toBase58();

    if (!isSplToken && !isToken2022) {
      return {
        mint: mintAddress,
        isValid: false,
        error: `Account is not owned by SPL Token or Token-2022 program. Owner: ${ownerProgram}`,
      };
    }

    const data = accountInfo.value.data;
    if (typeof data !== 'object' || data === null || !('parsed' in data)) {
      return {
        mint: mintAddress,
        isValid: false,
        error: 'Mint account data could not be parsed as standard SPL mint.',
      };
    }

    const parsedInfo = (data as any).parsed?.info;
    const parsedType = (data as any).parsed?.type;

    if (parsedType && parsedType !== 'mint') {
      return {
        mint: mintAddress,
        isValid: false,
        error: `Account parsed type is '${parsedType}', expected 'mint'.`,
      };
    }

    if (!parsedInfo || typeof parsedInfo.decimals !== 'number') {
      return {
        mint: mintAddress,
        isValid: false,
        error: 'Missing decimals in on-chain mint account info.',
      };
    }

    const isInitialized = parsedInfo.isInitialized !== false;
    if (!isInitialized) {
      return {
        mint: mintAddress,
        isValid: false,
        error: 'On-chain mint account is not initialized.',
      };
    }

    const mintInfo: VerifiedMintInfo = {
      mint: mintAddress,
      decimals: parsedInfo.decimals,
      isInitialized: true,
      programId: ownerProgram,
      isToken2022,
      supply: parsedInfo.supply?.toString(),
      mintAuthority: parsedInfo.mintAuthority || null,
      freezeAuthority: parsedInfo.freezeAuthority || null,
    };

    return {
      mint: mintAddress,
      isValid: true,
      mintInfo,
    };
  } catch (err: any) {
    return {
      mint: mintAddress,
      isValid: false,
      error: `Failed to query on-chain mint data: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Validates a batch of mint addresses concurrently against Solana RPC
 */
export async function validateSolanaMints(
  connection: Connection,
  mintAddresses: string[]
): Promise<Map<string, MintValidationResult>> {
  const results = new Map<string, MintValidationResult>();
  const uniqueMints = Array.from(new Set(mintAddresses.map((m) => m.trim()).filter(Boolean)));

  const validations = await Promise.all(
    uniqueMints.map(async (mint) => {
      const result = await validateSolanaMint(connection, mint);
      return [mint, result] as const;
    })
  );

  for (const [mint, result] of validations) {
    results.set(mint, result);
  }

  return results;
}
