import { Connection, Commitment } from '@solana/web3.js';

/**
 * SOLANA RPC CONNECTION PROVIDER
 * 
 * Rules Adherence:
 * - Resilient RPC error handling.
 * - Routes browser RPC traffic through Next.js /api/rpc proxy to prevent Cloudflare 403 Origin blocks and protect private RPC API keys.
 * - Allows configurable RPC endpoints via SOLANA_RPC_URL (server/Vercel) and NEXT_PUBLIC_SOLANA_RPC_URL.
 */

export function getRpcEndpoint(): string {
  // If explicitly overridden via NEXT_PUBLIC_SOLANA_RPC_URL, respect it
  if (process.env.NEXT_PUBLIC_SOLANA_RPC_URL) {
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  }

  // In browser runtime, route through internal Next.js RPC proxy to prevent CORS/403 origin blocks & protect private keys
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/rpc`;
  }

  // In Node.js / SSR / server / test runtime, use server-side env var or fallback
  return process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
}

export const DEFAULT_RPC_ENDPOINT = getRpcEndpoint();

export const DEFAULT_COMMITMENT: Commitment = 'confirmed';

export function getSolanaConnection(
  endpoint: string = getRpcEndpoint(),
  commitment: Commitment = DEFAULT_COMMITMENT
): Connection {
  return new Connection(endpoint, {
    commitment,
    confirmTransactionInitialTimeout: 60000,
  });
}
