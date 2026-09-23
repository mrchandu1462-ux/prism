import { Connection, Commitment } from '@solana/web3.js';

/**
 * SOLANA RPC CONNECTION PROVIDER
 * 
 * Rules Adherence:
 * - Browser runtime ALWAYS routes through internal Next.js /api/rpc proxy.
 *   This ensures:
 *   1. Zero leakage of private RPC API keys (Helius, QuickNode, Alchemy, etc.) to the browser.
 *   2. Prevents Cloudflare 403 blocks caused by browser Origin headers on public RPCs.
 * - Server/Node/Test runtime connects using server-side SOLANA_RPC_URL.
 */

export function getRpcEndpoint(): string {
  // In browser runtime, ALWAYS route through internal Next.js RPC proxy
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/rpc`;
  }

  // In Node.js / SSR / server / test runtime, use server-side env var
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
