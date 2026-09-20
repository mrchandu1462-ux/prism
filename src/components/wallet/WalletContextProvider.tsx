'use client';

import React, { FC, ReactNode, useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { getRpcEndpoint } from '@/lib/solana/connection';
import { PrismWalletModalProvider } from './PrismWalletContext';
import { PrismWalletModal } from './PrismWalletModal';

interface Props {
  children: ReactNode;
}

export const WalletContextProvider: FC<Props> = ({ children }) => {
  const endpoint = useMemo(() => {
    return getRpcEndpoint();
  }, []);

  // In Solana Wallet Adapter, standard wallets (Phantom, Solflare, Backpack, Coinbase, etc.)
  // are detected dynamically via the Solana Wallet Standard.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <PrismWalletModalProvider>
          {children}
          <PrismWalletModal />
        </PrismWalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
