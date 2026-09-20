'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, FC } from 'react';

interface PrismWalletContextState {
  isOpen: boolean;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  walletError: string | null;
  setWalletError: (err: string | null) => void;
}

const PrismWalletContext = createContext<PrismWalletContextState | null>(null);

export const PrismWalletModalProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const openWalletModal = useCallback(() => {
    setWalletError(null);
    setIsOpen(true);
  }, []);

  const closeWalletModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <PrismWalletContext.Provider
      value={{
        isOpen,
        openWalletModal,
        closeWalletModal,
        walletError,
        setWalletError,
      }}
    >
      {children}
    </PrismWalletContext.Provider>
  );
};

export function usePrismWalletModal(): PrismWalletContextState {
  const context = useContext(PrismWalletContext);
  if (!context) {
    throw new Error('usePrismWalletModal must be used within a PrismWalletModalProvider');
  }
  return context;
}
