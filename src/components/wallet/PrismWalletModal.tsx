'use client';

import React, { FC, useEffect, useMemo, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  X,
  Shield,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Wallet as WalletIcon,
  Search,
} from 'lucide-react';
import { usePrismWalletModal } from './PrismWalletContext';
import {
  categorizeWallets,
  formatWalletError,
  findCuratedWalletMeta,
} from '@/lib/wallet/walletRegistry';
import { DetectedWalletItem, UninstalledWalletItem } from '@/lib/wallet/types';

export const PrismWalletModal: FC = () => {
  const { isOpen, closeWalletModal, walletError, setWalletError } = usePrismWalletModal();
  const { wallets, select, connected, connecting, wallet } = useWallet();
  const [connectingWalletName, setConnectingWalletName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Close modal if wallet connects successfully
  useEffect(() => {
    if (connected && isOpen) {
      closeWalletModal();
      setConnectingWalletName(null);
    }
  }, [connected, isOpen, closeWalletModal]);

  // Reset states on open/close
  useEffect(() => {
    if (!isOpen) {
      setConnectingWalletName(null);
      setSearchQuery('');
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeWalletModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeWalletModal]);

  // Prevent scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Categorize detected vs other supported wallets
  const { detectedWallets, otherSupportedWallets } = useMemo(() => {
    return categorizeWallets(wallets);
  }, [wallets]);

  // Filtered wallets based on search query
  const filteredDetected = useMemo(() => {
    if (!searchQuery.trim()) return detectedWallets;
    const q = searchQuery.toLowerCase();
    return detectedWallets.filter((w) => w.name.toLowerCase().includes(q));
  }, [detectedWallets, searchQuery]);

  const filteredSupported = useMemo(() => {
    if (!searchQuery.trim()) return otherSupportedWallets;
    const q = searchQuery.toLowerCase();
    return otherSupportedWallets.filter(
      (w) => w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q)
    );
  }, [otherSupportedWallets, searchQuery]);

  // Select and connect handler
  const handleSelectWallet = useCallback(
    async (detectedItem: DetectedWalletItem) => {
      try {
        setWalletError(null);
        setConnectingWalletName(detectedItem.name);

        // Select the adapter
        select(detectedItem.name as any);

        // If adapter is available and not already connected, trigger connect
        if (detectedItem.adapter) {
          await detectedItem.adapter.connect();
        }
      } catch (err: unknown) {
        console.warn('Wallet connection notification:', err);
        const userMsg = formatWalletError(err);
        setWalletError(userMsg);
        setConnectingWalletName(null);
      }
    },
    [select, setWalletError]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={closeWalletModal}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prism-wallet-center-title"
        className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800/90 shadow-2xl shadow-cyan-950/30 overflow-hidden z-10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
      >
        {/* Top Glow Accent */}
        <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500" />

        {/* Modal Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-slate-800/80 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <WalletIcon className="w-4 h-4" />
              </div>
              <h2
                id="prism-wallet-center-title"
                className="text-lg font-bold tracking-tight text-white flex items-center gap-2"
              >
                PRISM WALLET CENTER
              </h2>
            </div>
            <p className="text-xs text-slate-400 pl-0.5">
              Connect a Solana wallet to analyze your portfolio.
            </p>
          </div>

          <button
            type="button"
            onClick={closeWalletModal}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Display */}
        {walletError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-rose-300 font-medium leading-relaxed">{walletError}</p>
            </div>
            <button
              type="button"
              onClick={() => setWalletError(null)}
              className="text-rose-400 hover:text-rose-200 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Search Bar */}
        <div className="px-6 pt-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Solana wallets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
            />
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 pt-2 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
          {/* SECTION 1: DETECTED WALLETS */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span>Detected Wallets</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {detectedWallets.length} Available
                </span>
              </h3>
            </div>

            {filteredDetected.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredDetected.map((item) => {
                  const isThisConnecting = connectingWalletName === item.name || (connecting && wallet?.adapter.name === item.name);
                  const curated = findCuratedWalletMeta(item.name);
                  const iconSrc = item.icon || curated?.icon;

                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handleSelectWallet(item)}
                      disabled={isThisConnecting}
                      className="group relative p-3.5 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-cyan-500/40 transition-all duration-150 flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700/50 flex items-center justify-center p-1.5 overflow-hidden flex-shrink-0">
                          {iconSrc ? (
                            <img
                              src={iconSrc}
                              alt={item.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <WalletIcon className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                            {item.name}
                          </p>
                          <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Detected
                          </span>
                        </div>
                      </div>

                      {isThisConnecting ? (
                        <Loader2 className="w-4 h-4 text-cyan-400 animate-spin flex-shrink-0" />
                      ) : (
                        <div className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                          Connect
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/60 text-center">
                <p className="text-xs text-slate-400">
                  {detectedWallets.length === 0
                    ? 'No Solana browser extensions currently detected. Install one from the supported list below to connect.'
                    : 'No detected wallets match your search query.'}
                </p>
              </div>
            )}
          </div>

          {/* SECTION 2: OTHER SUPPORTED WALLETS */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span>Other Supported Wallets</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-slate-800 text-slate-400">
                  {otherSupportedWallets.length}
                </span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredSupported.map((item: UninstalledWalletItem) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/60 flex items-center justify-between text-left hover:border-slate-700/60 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center p-1.5 overflow-hidden flex-shrink-0">
                      {item.icon ? (
                        <img
                          src={item.icon}
                          alt={item.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <WalletIcon className="w-5 h-5 text-slate-500" />
                      )}
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate max-w-[140px]">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 transition-colors flex-shrink-0"
                  >
                    <span>Install</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer: Security Notice */}
        <div className="p-4 px-6 border-t border-slate-800/80 bg-slate-950/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <p className="text-[11px] text-slate-400">
              PRISM is non-custodial. Your private keys never leave your wallet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
