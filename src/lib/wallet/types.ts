import { Adapter, WalletReadyState } from '@solana/wallet-adapter-base';

export interface SupportedWalletMeta {
  id: string;
  name: string;
  icon: string; // SVG or data URL
  url: string; // Official install / homepage URL
  description: string;
  isStandardCompatible: boolean;
}

export interface DetectedWalletItem {
  name: string;
  icon: string;
  readyState: WalletReadyState;
  installed: boolean;
  adapter?: Adapter;
  url?: string;
}

export interface UninstalledWalletItem {
  id: string;
  name: string;
  icon: string;
  url: string;
  description: string;
  installed: false;
}

export interface CategorizedWallets {
  detectedWallets: DetectedWalletItem[];
  otherSupportedWallets: UninstalledWalletItem[];
}
