import { WalletReadyState } from '@solana/wallet-adapter-base';
import type { Wallet } from '@solana/wallet-adapter-react';
import {
  SupportedWalletMeta,
  CategorizedWallets,
  DetectedWalletItem,
  UninstalledWalletItem,
} from './types';

// Curated authoritative Solana wallets registry with official URLs & branding
export const SUPPORTED_SOLANA_WALLETS: SupportedWalletMeta[] = [
  {
    id: 'phantom',
    name: 'Phantom',
    icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="%23ab9ff2"/><path d="M110.5 64.5c0 23.5-19 42.5-42.5 42.5-18.4 0-34.1-11.7-39.9-28-1.5-4.2-2.3-8.7-2.3-13.4C25.8 42.1 44.9 23 68 23c23.5 0 42.5 19 42.5 42.5z" fill="%23fff"/><path d="M50.2 56.4c2.8 0 5-2.2 5-5s-2.2-5-5-5-5 2.2-5 5 2.2 5 5 5zm35.6 0c2.8 0 5-2.2 5-5s-2.2-5-5-5-5 2.2-5 5 2.2 5 5 5z" fill="%23ab9ff2"/></svg>',
    url: 'https://phantom.app/',
    description: 'Premier Solana web3 wallet for DeFi, NFTs, and portfolio look-through.',
    isStandardCompatible: true,
  },
  {
    id: 'solflare',
    name: 'Solflare',
    icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="%2314101d"/><path d="M64 24l36 36-18 18-18-18-18 18-18-18 36-36zm0 80l-36-36 18-18 18 18 18-18 18 18-36 36z" fill="%23FC6329"/></svg>',
    url: 'https://solflare.com/',
    description: 'Feature-rich Solana wallet with hardware support and staking.',
    isStandardCompatible: true,
  },
  {
    id: 'backpack',
    name: 'Backpack',
    icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="%23E33E38"/><path d="M42 38h44v14H42zM34 56h60v44H34z" fill="%23ffffff"/><circle cx="50" cy="74" r="5" fill="%23E33E38"/><circle cx="78" cy="74" r="5" fill="%23E33E38"/></svg>',
    url: 'https://backpack.app/',
    description: 'Next-generation xNFT wallet with built-in app store & exchange integration.',
    isStandardCompatible: true,
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="%230052FF"/><rect x="40" y="40" width="48" height="48" rx="10" fill="%23ffffff"/><rect x="52" y="52" width="24" height="24" rx="4" fill="%230052FF"/></svg>',
    url: 'https://www.coinbase.com/wallet',
    description: 'Self-custody multi-chain wallet backed by Coinbase.',
    isStandardCompatible: true,
  },
  {
    id: 'glow',
    name: 'Glow',
    icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="%232C2D30"/><circle cx="64" cy="64" r="32" fill="%23FFA927"/></svg>',
    url: 'https://glow.app/',
    description: 'Fast, secure Solana wallet with iCloud backup and Safari extension.',
    isStandardCompatible: true,
  },
  {
    id: 'brave',
    name: 'Brave Wallet',
    icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="%23FB542B"/><path d="M64 28l28 16-10 32-18 24-18-24-10-32z" fill="%23ffffff"/></svg>',
    url: 'https://brave.com/wallet/',
    description: 'Native browser wallet built directly into Brave Privacy Browser.',
    isStandardCompatible: true,
  },
  {
    id: 'okx',
    name: 'OKX Wallet',
    icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="%23000000"/><rect x="36" y="36" width="24" height="24" fill="%23ffffff"/><rect x="68" y="68" width="24" height="24" fill="%23ffffff"/><rect x="68" y="36" width="24" height="24" fill="%23ffffff"/><rect x="36" y="68" width="24" height="24" fill="%23ffffff"/></svg>',
    url: 'https://www.okx.com/web3',
    description: 'Universal multi-chain Web3 portal and portfolio hub.',
    isStandardCompatible: true,
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="%230500FF"/><path d="M64 30c16 8 30 10 30 10v30c0 20-14 36-30 42-16-6-30-22-30-42V40s14-2 30-10z" fill="%23ffffff"/></svg>',
    url: 'https://trustwallet.com/',
    description: 'Multi-asset self-custodial wallet with full Solana integration.',
    isStandardCompatible: true,
  },
  {
    id: 'ledger',
    name: 'Ledger',
    icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="%231E1E1E"/><path d="M40 40h20v6H46v14h-6V40zm48 0H68v6h14v14h6V40zM40 88h20v-6H46V68h-6v20zm48 0H68v-6h14V68h6v20z" fill="%23ffffff"/></svg>',
    url: 'https://www.ledger.com/',
    description: 'Industry standard hardware cold storage with Solana app support.',
    isStandardCompatible: true,
  },
];

/**
 * Normalizes wallet names for fuzzy comparison.
 */
export function normalizeWalletName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Find curated metadata for a given wallet name.
 */
export function findCuratedWalletMeta(name: string): SupportedWalletMeta | undefined {
  const normalized = normalizeWalletName(name);
  return SUPPORTED_SOLANA_WALLETS.find((meta) => {
    const metaNormalized = normalizeWalletName(meta.name);
    return normalized.includes(metaNormalized) || metaNormalized.includes(normalized);
  });
}

/**
 * Categorize wallets into Detected/Installed and Other Supported Wallets.
 */
export function categorizeWallets(walletAdapters: Wallet[]): CategorizedWallets {
  const detectedWallets: DetectedWalletItem[] = [];
  const detectedNormalizedNames = new Set<string>();

  // 1. Process wallets returned from Wallet Adapter (including standard wallets discovered in window)
  for (const w of walletAdapters) {
    const isInstalled =
      w.readyState === WalletReadyState.Installed ||
      w.readyState === WalletReadyState.Loadable;

    if (isInstalled) {
      const curated = findCuratedWalletMeta(w.adapter.name);
      const icon = w.adapter.icon || (curated ? curated.icon : '');
      const url = curated ? curated.url : w.adapter.url;

      detectedWallets.push({
        name: w.adapter.name,
        icon,
        readyState: w.readyState,
        installed: true,
        adapter: w.adapter,
        url,
      });

      detectedNormalizedNames.add(normalizeWalletName(w.adapter.name));
    }
  }

  // 2. Identify remaining supported wallets that are NOT detected
  const otherSupportedWallets: UninstalledWalletItem[] = [];

  for (const meta of SUPPORTED_SOLANA_WALLETS) {
    const normalized = normalizeWalletName(meta.name);
    const isAlreadyDetected = Array.from(detectedNormalizedNames).some((detected) => {
      return detected.includes(normalized) || normalized.includes(detected);
    });

    if (!isAlreadyDetected) {
      otherSupportedWallets.push({
        id: meta.id,
        name: meta.name,
        icon: meta.icon,
        url: meta.url,
        description: meta.description,
        installed: false,
      });
    }
  }

  return {
    detectedWallets,
    otherSupportedWallets,
  };
}

/**
 * Helper to produce clean, user-friendly error messages from wallet interactions.
 */
export function formatWalletError(err: unknown): string {
  if (!err) return 'An unknown error occurred while connecting your wallet.';

  const message = typeof err === 'object' && err !== null && 'message' in err
    ? String((err as { message: unknown }).message)
    : String(err);

  const name = typeof err === 'object' && err !== null && 'name' in err
    ? String((err as { name: unknown }).name)
    : '';

  if (
    message.includes('User rejected') ||
    message.includes('User cancelled') ||
    name === 'WalletConnectionError' && message.includes('rejected')
  ) {
    return 'Connection request was cancelled in your wallet.';
  }

  if (name === 'WalletNotReadyError' || message.includes('WalletNotReady')) {
    return 'Wallet is not installed or ready in this browser window.';
  }

  if (name === 'WalletTimeoutError' || message.includes('timed out')) {
    return 'Wallet connection request timed out. Please check your wallet extension.';
  }

  if (message.includes('Window blocked') || message.includes('popup')) {
    return 'Popup window was blocked by your browser. Please allow popups for PRISM.';
  }

  return message || 'Failed to connect to wallet.';
}
