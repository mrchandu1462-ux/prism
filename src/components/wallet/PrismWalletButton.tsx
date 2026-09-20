'use client';

import React, { FC, useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  Wallet,
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  LogOut,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { usePrismWalletModal } from './PrismWalletContext';
import { findCuratedWalletMeta } from '@/lib/wallet/walletRegistry';

export const PrismWalletButton: FC<{ className?: string }> = ({ className = '' }) => {
  const { connected, connecting, disconnecting, publicKey, wallet, disconnect } = useWallet();
  const { openWalletModal } = usePrismWalletModal();
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyAddress = useCallback(() => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicKey]);

  const handleDisconnect = useCallback(async () => {
    setDropdownOpen(false);
    try {
      await disconnect();
    } catch (err) {
      console.error('Failed to disconnect wallet:', err);
    }
  }, [disconnect]);

  const handleChangeWallet = useCallback(() => {
    setDropdownOpen(false);
    openWalletModal();
  }, [openWalletModal]);

  // SSR placeholder
  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        className={`h-10 px-4 rounded-xl bg-indigo-600/50 text-white/70 font-semibold text-sm flex items-center gap-2 cursor-wait ${className}`}
      >
        <Wallet className="w-4 h-4" />
        <span>Connect Wallet</span>
      </button>
    );
  }

  // Connecting / Disconnecting State
  if (connecting || disconnecting) {
    return (
      <button
        type="button"
        disabled
        className={`h-10 px-4 rounded-xl bg-indigo-600/80 text-white font-semibold text-sm flex items-center gap-2 cursor-wait shadow-md shadow-indigo-600/20 ${className}`}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{connecting ? 'Connecting...' : 'Disconnecting...'}</span>
      </button>
    );
  }

  // Disconnected State
  if (!connected || !publicKey) {
    return (
      <button
        type="button"
        onClick={openWalletModal}
        className={`h-10 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-semibold text-sm flex items-center gap-2 transition-all shadow-md shadow-indigo-600/25 hover:shadow-cyan-500/25 active:scale-95 ${className}`}
      >
        <Wallet className="w-4 h-4" />
        <span>Connect Wallet</span>
      </button>
    );
  }

  // Connected State
  const base58 = publicKey.toBase58();
  const truncatedAddress = `${base58.slice(0, 4)}...${base58.slice(-4)}`;
  const curated = wallet?.adapter?.name ? findCuratedWalletMeta(wallet.adapter.name) : undefined;
  const iconSrc = wallet?.adapter?.icon || curated?.icon;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className={`h-10 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800/90 border border-slate-700/80 hover:border-slate-600 text-white text-sm font-medium flex items-center gap-2.5 transition-all shadow-sm active:scale-95 ${className}`}
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
      >
        <div className="w-5 h-5 rounded-md bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
          {iconSrc ? (
            <img
              src={iconSrc}
              alt={wallet?.adapter?.name || 'Wallet'}
              className="w-full h-full object-contain"
            />
          ) : (
            <Wallet className="w-3.5 h-3.5 text-cyan-400" />
          )}
        </div>
        <span className="font-mono text-xs font-semibold text-slate-200">{truncatedAddress}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            dropdownOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-cyan-950/40 p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Header info */}
          <div className="p-3 border-b border-slate-800/80 mb-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-400">Connected Wallet</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Mainnet
              </span>
            </div>
            <p className="text-xs font-bold text-white truncate">
              {wallet?.adapter?.name || 'Solana Wallet'}
            </p>
            <p className="font-mono text-[11px] text-slate-400 truncate mt-0.5">{base58}</p>
          </div>

          {/* Action List */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleCopyAddress}
              className="w-full px-3 py-2 text-xs rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{copied ? 'Address Copied!' : 'Copy Address'}</span>
              </div>
            </button>

            <a
              href={`https://solscan.io/account/${base58}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-3 py-2 text-xs rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                <span>View on Solscan</span>
              </div>
            </a>

            <button
              type="button"
              onClick={handleChangeWallet}
              className="w-full px-3 py-2 text-xs rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                <span>Change Wallet</span>
              </div>
            </button>

            <div className="h-px bg-slate-800 my-1" />

            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full px-3 py-2 text-xs rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
