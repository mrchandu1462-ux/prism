'use client';

import React from 'react';
import { DiagnosticsTokenRecord } from '@/lib/solana/adapter';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, ShieldAlert, Cpu, Sparkles, Info } from 'lucide-react';

interface DiagnosticsViewProps {
  walletAddress: string | null;
  diagnostics: DiagnosticsTokenRecord[];
  isLoading: boolean;
  onRefresh: () => void;
  totalReportedUsd: number;
  isDemoMode?: boolean;
}

export function DiagnosticsView({
  walletAddress,
  diagnostics,
  isLoading,
  onRefresh,
  totalReportedUsd,
  isDemoMode = false,
}: DiagnosticsViewProps) {
  const acceptedCount = diagnostics.filter((d) => d.status === 'ACCEPTED').length;

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-2xl backdrop-blur-md space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
              <Cpu className="w-4 h-4" />
            </span>
            <h3 className="text-lg font-semibold text-white tracking-wide flex items-center gap-2">
              On-Chain Token Scanner Diagnostics
              {isDemoMode && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-sans">
                  Demo Simulated Data
                </span>
              )}
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isDemoMode
              ? 'Showing simulated token accounts mapped to verified mainnet SPL & Token-2022 mint configurations.'
              : 'Real-time SPL Token & Token-2022 account discovery via Solana RPC.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isDemoMode && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Rescan Accounts
            </button>
          )}
        </div>
      </div>

      {/* Demo Mode Disclaimer Notice */}
      {isDemoMode && (
        <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-200 text-xs flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p>
            <strong>Demo Mode Active:</strong> Account balances shown below are simulated for evaluation purposes. All mint addresses and token decimals reflect verified production configurations. Zero on-chain RPC calls or wallet signatures were executed.
          </p>
        </div>
      )}

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3 border-b border-slate-800/60 text-xs">
        <div>
          <span className="text-slate-400">{isDemoMode ? 'Session Type' : 'Connected Wallet'}</span>
          <p className="font-mono font-medium text-slate-200 truncate mt-0.5" title={walletAddress || ''}>
            {isDemoMode
              ? 'Demo Portfolio (Simulated)'
              : walletAddress
              ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}`
              : 'Not Connected'}
          </p>
        </div>
        <div>
          <span className="text-slate-400">{isDemoMode ? 'Simulated Accounts' : 'Scanned Accounts'}</span>
          <p className="font-semibold text-slate-200 mt-0.5">
            {diagnostics.length} <span className="text-slate-400 font-normal">detected</span>
          </p>
        </div>
        <div>
          <span className="text-slate-400">Accepted Whitelisted</span>
          <p className="font-semibold text-emerald-400 mt-0.5">
            {acceptedCount} <span className="text-slate-400 font-normal">assets</span>
          </p>
        </div>
        <div>
          <span className="text-slate-400">Total Portfolio Value</span>
          <p className="font-semibold text-cyan-400 mt-0.5">
            ${totalReportedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="mt-4 overflow-x-auto">
        {diagnostics.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            {isLoading
              ? 'Scanning Solana blockchain for SPL and Token-2022 accounts...'
              : 'No token accounts detected for this wallet address.'}
          </div>
        ) : (
          <table className="w-full text-left text-xs text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Asset</th>
                <th className="py-2.5 px-3">Mint Address</th>
                <th className="py-2.5 px-3">Program</th>
                <th className="py-2.5 px-3 text-right">Raw Amount</th>
                <th className="py-2.5 px-3 text-right">Decimals</th>
                <th className="py-2.5 px-3 text-right">Normalized</th>
                <th className="py-2.5 px-3 text-right">USD Price</th>
                <th className="py-2.5 px-3 text-right">USD Value</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {diagnostics.map((item, idx) => {
                const isAccepted = item.status === 'ACCEPTED';

                return (
                  <tr key={`${item.pubkey}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 font-sans font-medium text-slate-200">
                      <div className="flex flex-col">
                        <span>{item.symbol}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{item.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-400" title={item.mint}>
                      {item.mint.length > 12 ? `${item.mint.slice(0, 4)}...${item.mint.slice(-4)}` : item.mint}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${item.isToken2022 ? 'bg-purple-950/80 text-purple-300 border border-purple-800/50' : 'bg-slate-800 text-slate-300'}`}>
                        {item.isToken2022 ? 'Token-2022' : 'SPL Token'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400">
                      {item.rawAmount}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400">
                      {item.decimals}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-slate-200 font-mono">
                      {item.normalizedBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-300">
                      {item.usdPrice !== null ? `$${item.usdPrice.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-cyan-400">
                      {item.usdValue !== null ? `$${item.usdValue.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.status === 'ACCEPTED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/50">
                          <CheckCircle2 className="w-3 h-3" />
                          {isDemoMode ? 'Verified Config' : 'Accepted'}
                        </span>
                      )}
                      {item.status === 'IGNORED_UNVERIFIED_MINT' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium bg-amber-950/80 text-amber-300 border border-amber-800/50" title={item.reason}>
                          <AlertTriangle className="w-3 h-3" />
                          Unverified Placeholder
                        </span>
                      )}
                      {item.status === 'IGNORED_NOT_WHITELISTED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium bg-slate-800 text-slate-400 border border-slate-700" title={item.reason}>
                          <XCircle className="w-3 h-3" />
                          Ignored (Non-Whitelist)
                        </span>
                      )}
                      {item.status === 'IGNORED_ZERO_BALANCE' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium bg-slate-800/60 text-slate-400" title={item.reason}>
                          Zero Balance
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
