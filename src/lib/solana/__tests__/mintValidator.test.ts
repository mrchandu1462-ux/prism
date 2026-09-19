import { describe, it, expect, vi } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { validateSolanaMint, validateSolanaMints } from '../mintValidator';

describe('Solana Mint On-Chain Validator', () => {
  const mockConnection = (accountValue: any) =>
    ({
      getParsedAccountInfo: vi.fn().mockResolvedValue({ value: accountValue }),
    } as unknown as Connection);

  it('validates a valid Token-2022 mint account and extracts decimals', async () => {
    const mintAddress = 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ';
    const conn = mockConnection({
      owner: TOKEN_2022_PROGRAM_ID,
      data: {
        parsed: {
          type: 'mint',
          info: {
            decimals: 9,
            isInitialized: true,
            supply: '684788275616',
            mintAuthority: 'EXvTtxurWBUNNCtLojaN8ZBJFNJPZFSH3szoih9hh7YW',
          },
        },
      },
    });

    const result = await validateSolanaMint(conn, mintAddress);
    expect(result.isValid).toBe(true);
    expect(result.mintInfo).toBeDefined();
    expect(result.mintInfo?.decimals).toBe(9);
    expect(result.mintInfo?.isToken2022).toBe(true);
    expect(result.mintInfo?.isInitialized).toBe(true);
    expect(result.mintInfo?.supply).toBe('684788275616');
  });

  it('validates a standard SPL Token mint account', async () => {
    const mintAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const conn = mockConnection({
      owner: TOKEN_PROGRAM_ID,
      data: {
        parsed: {
          type: 'mint',
          info: {
            decimals: 6,
            isInitialized: true,
            supply: '1000000000',
          },
        },
      },
    });

    const result = await validateSolanaMint(conn, mintAddress);
    expect(result.isValid).toBe(true);
    expect(result.mintInfo?.decimals).toBe(6);
    expect(result.mintInfo?.isToken2022).toBe(false);
  });

  it('rejects an invalid base58 public key string immediately', async () => {
    const conn = mockConnection(null);
    const result = await validateSolanaMint(conn, 'invalid-pubkey-string!');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/Invalid Solana public key format/i);
    expect((conn.getParsedAccountInfo as any)).not.toHaveBeenCalled();
  });

  it('rejects a non-existent on-chain mint account', async () => {
    const conn = mockConnection(null);
    const result = await validateSolanaMint(conn, 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/not found on-chain/i);
  });

  it('rejects an account not owned by SPL Token or Token-2022', async () => {
    const conn = mockConnection({
      owner: new PublicKey('11111111111111111111111111111111'), // System program
      data: {
        parsed: {
          type: 'mint',
          info: { decimals: 6, isInitialized: true },
        },
      },
    });

    const result = await validateSolanaMint(conn, 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/not owned by SPL Token or Token-2022/i);
  });

  it('rejects an uninitialized mint account', async () => {
    const conn = mockConnection({
      owner: TOKEN_PROGRAM_ID,
      data: {
        parsed: {
          type: 'mint',
          info: {
            decimals: 6,
            isInitialized: false,
          },
        },
      },
    });

    const result = await validateSolanaMint(conn, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/not initialized/i);
  });

  it('performs batch validation of multiple mints concurrently', async () => {
    const mint1 = 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ';
    const mint2 = 'TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ';

    const conn = {
      getParsedAccountInfo: vi.fn().mockImplementation(async (pubkey: PublicKey) => {
        if (pubkey.toBase58() === mint1) {
          return {
            value: {
              owner: TOKEN_2022_PROGRAM_ID,
              data: { parsed: { type: 'mint', info: { decimals: 9, isInitialized: true } } },
            },
          };
        }
        return { value: null };
      }),
    } as unknown as Connection;

    const results = await validateSolanaMints(conn, [mint1, mint2]);
    expect(results.size).toBe(2);
    expect(results.get(mint1)?.isValid).toBe(true);
    expect(results.get(mint1)?.mintInfo?.decimals).toBe(9);
    expect(results.get(mint2)?.isValid).toBe(false);
  });
});
