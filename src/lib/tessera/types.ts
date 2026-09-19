import { PublicKey } from '@solana/web3.js';

/**
 * Raw JSON schema returned by Tessera Public API:
 * GET https://rest-api.tessera.pe/v1/public/token-details
 */
export interface TesseraRawTokenDetail {
  id: string;
  name: string;
  symbol: string;
  code?: string;
  sector: string;
  mint: string;
  markPrice: number;
  holders?: number;
  markValuation?: number;
}

/**
 * Validated and sanitized Tessera token record
 */
export interface TesseraToken {
  id: string;
  name: string;
  symbol: string;
  code: string;
  sector: string;
  mint: string;
  markPrice: number;
  holders: number;
  markValuation: number;
}

/**
 * Runtime validator to detect malformed Tessera API payloads
 */
export function isValidSolanaMintAddress(address: unknown): boolean {
  if (typeof address !== 'string' || address.trim().length === 0) {
    return false;
  }
  try {
    new PublicKey(address.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a single raw Tessera token item
 */
export function validateTesseraTokenItem(item: unknown): TesseraToken | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const raw = item as Record<string, unknown>;

  if (typeof raw.id !== 'string' || raw.id.trim() === '') return null;
  if (typeof raw.name !== 'string' || raw.name.trim() === '') return null;
  if (typeof raw.symbol !== 'string' || raw.symbol.trim() === '') return null;
  if (typeof raw.sector !== 'string' || raw.sector.trim() === '') return null;
  if (typeof raw.mint !== 'string' || !isValidSolanaMintAddress(raw.mint)) return null;
  if (typeof raw.markPrice !== 'number' || !Number.isFinite(raw.markPrice) || raw.markPrice <= 0) return null;

  const code = typeof raw.code === 'string' && raw.code.trim() ? raw.code.trim() : raw.symbol.trim();
  const holders = typeof raw.holders === 'number' && Number.isFinite(raw.holders) ? raw.holders : 0;
  const markValuation = typeof raw.markValuation === 'number' && Number.isFinite(raw.markValuation) ? raw.markValuation : 0;

  return {
    id: raw.id.trim(),
    name: raw.name.trim(),
    symbol: raw.symbol.trim(),
    code,
    sector: raw.sector.trim(),
    mint: raw.mint.trim(),
    markPrice: raw.markPrice,
    holders,
    markValuation,
  };
}

/**
 * Validates full Tessera API payload
 */
export function parseTesseraTokenDetailsResponse(data: unknown): TesseraToken[] {
  if (!Array.isArray(data)) {
    throw new Error('Malformed Tessera API response: expected JSON array of token objects.');
  }

  const validated: TesseraToken[] = [];
  for (const item of data) {
    const validItem = validateTesseraTokenItem(item);
    if (validItem) {
      validated.push(validItem);
    }
  }

  if (validated.length === 0 && data.length > 0) {
    throw new Error('Malformed Tessera API response: no valid token records found in response array.');
  }

  return validated;
}
