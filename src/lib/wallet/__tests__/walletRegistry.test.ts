import { describe, it, expect } from 'vitest';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import type { Wallet } from '@solana/wallet-adapter-react';
import {
  SUPPORTED_SOLANA_WALLETS,
  normalizeWalletName,
  findCuratedWalletMeta,
  categorizeWallets,
  formatWalletError,
} from '../walletRegistry';

describe('PRISM Wallet Registry & Discovery Engine', () => {
  it('contains verified official URLs and metadata for standard Solana wallets', () => {
    expect(SUPPORTED_SOLANA_WALLETS.length).toBeGreaterThanOrEqual(8);

    const phantom = SUPPORTED_SOLANA_WALLETS.find((w) => w.id === 'phantom');
    expect(phantom).toBeDefined();
    expect(phantom?.url).toBe('https://phantom.app/');
    expect(phantom?.icon).toContain('svg');

    const solflare = SUPPORTED_SOLANA_WALLETS.find((w) => w.id === 'solflare');
    expect(solflare).toBeDefined();
    expect(solflare?.url).toBe('https://solflare.com/');

    const backpack = SUPPORTED_SOLANA_WALLETS.find((w) => w.id === 'backpack');
    expect(backpack).toBeDefined();
    expect(backpack?.url).toBe('https://backpack.app/');
  });

  it('normalizes wallet names correctly', () => {
    expect(normalizeWalletName('Phantom')).toBe('phantom');
    expect(normalizeWalletName('Coinbase Wallet')).toBe('coinbasewallet');
    expect(normalizeWalletName('OKX Wallet (Web3)')).toBe('okxwalletweb3');
  });

  it('finds curated metadata by exact or fuzzy name match', () => {
    const meta = findCuratedWalletMeta('Phantom');
    expect(meta?.id).toBe('phantom');

    const coinbaseMeta = findCuratedWalletMeta('Coinbase');
    expect(coinbaseMeta?.id).toBe('coinbase');
  });

  it('categorizes empty adapter list into 0 detected and all supported uninstalled wallets', () => {
    const { detectedWallets, otherSupportedWallets } = categorizeWallets([]);

    expect(detectedWallets).toHaveLength(0);
    expect(otherSupportedWallets.length).toBe(SUPPORTED_SOLANA_WALLETS.length);
    expect(otherSupportedWallets.every((w) => w.installed === false)).toBe(true);
  });

  it('correctly places installed wallets in detectedWallets and omits them from otherSupportedWallets', () => {
    const mockWallets: Wallet[] = [
      {
        adapter: {
          name: 'Phantom' as any,
          url: 'https://phantom.app',
          icon: 'phantom-icon',
          readyState: WalletReadyState.Installed,
          publicKey: null,
          connecting: false,
          connected: false,
          autoConnect: async () => {},
          connect: async () => {},
          disconnect: async () => {},
          sendTransaction: async () => '' as any,
        } as any,
        readyState: WalletReadyState.Installed,
      },
      {
        adapter: {
          name: 'Unknown Custom Standard Wallet' as any,
          url: 'https://custom.xyz',
          icon: 'custom-icon',
          readyState: WalletReadyState.Installed,
          publicKey: null,
          connecting: false,
          connected: false,
          autoConnect: async () => {},
          connect: async () => {},
          disconnect: async () => {},
          sendTransaction: async () => '' as any,
        } as any,
        readyState: WalletReadyState.Installed,
      },
      {
        adapter: {
          name: 'Solflare' as any,
          url: 'https://solflare.com',
          icon: 'solflare-icon',
          readyState: WalletReadyState.NotDetected,
          publicKey: null,
          connecting: false,
          connected: false,
          autoConnect: async () => {},
          connect: async () => {},
          disconnect: async () => {},
          sendTransaction: async () => '' as any,
        } as any,
        readyState: WalletReadyState.NotDetected,
      },
    ];

    const { detectedWallets, otherSupportedWallets } = categorizeWallets(mockWallets);

    expect(detectedWallets).toHaveLength(2);
    expect(detectedWallets.map((w) => w.name)).toContain('Phantom');
    expect(detectedWallets.map((w) => w.name)).toContain('Unknown Custom Standard Wallet');
    expect(detectedWallets[0].installed).toBe(true);

    // Solflare was NotDetected, so it remains in otherSupportedWallets
    expect(otherSupportedWallets.some((w) => w.name === 'Solflare')).toBe(true);
    // Phantom was Installed, so it must NOT be in otherSupportedWallets
    expect(otherSupportedWallets.some((w) => w.name === 'Phantom')).toBe(false);
  });

  it('formats wallet errors into clean user-facing messages', () => {
    expect(formatWalletError(new Error('User rejected the request'))).toBe(
      'Connection request was cancelled in your wallet.'
    );
    expect(formatWalletError({ name: 'WalletNotReadyError', message: 'WalletNotReady' })).toBe(
      'Wallet is not installed or ready in this browser window.'
    );
    expect(formatWalletError({ name: 'WalletTimeoutError', message: 'Connection timed out' })).toBe(
      'Wallet connection request timed out. Please check your wallet extension.'
    );
    expect(formatWalletError('Unknown failure')).toBe('Unknown failure');
    expect(formatWalletError(null)).toBe(
      'An unknown error occurred while connecting your wallet.'
    );
  });
});
