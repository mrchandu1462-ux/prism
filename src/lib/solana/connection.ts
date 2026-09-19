import { Connection, Commitment } from '@solana/web3.js';

/**
 * SOLANA RPC CONNECTION PROVIDER
 * 
 * Rules Adherence:
 * - Rule 12: Resilient RPC error handling.
 * - Allows configurable RPC endpoints via NEXT_PUBLIC_SOLANA_RPC_URL.
 */

export const DEFAULT_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export const DEFAULT_COMMITMENT: Commitment = 'confirmed';

export function getSolanaConnection(
  endpoint: string = DEFAULT_RPC_ENDPOINT,
  commitment: Commitment = DEFAULT_COMMITMENT
): Connection {
  return new Connection(endpoint, {
    commitment,
    confirmTransactionInitialTimeout: 60000,
  });
}
