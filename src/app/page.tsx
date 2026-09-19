'use client';

import React, { useState } from 'react';
import { Header } from '@/components/dashboard/Header';
import { LookThroughToggle, DashboardViewMode } from '@/components/dashboard/LookThroughToggle';
import { TokenHoldingsList } from '@/components/dashboard/TokenHoldingsList';
import { UnderlyingExposureList } from '@/components/dashboard/UnderlyingExposureList';
import { ConcentrationControls } from '@/components/dashboard/ConcentrationControls';
import { SectorBreakdown } from '@/components/dashboard/SectorBreakdown';
import { DiagnosticsView } from '@/components/dashboard/DiagnosticsView';
import { RebalanceModal } from '@/components/dashboard/RebalanceModal';
import { usePrismPortfolio } from '@/hooks/usePrismPortfolio';
import { RebalanceRecommendation } from '@/types';
import { Wallet, ShieldAlert, AlertCircle, RefreshCw, Layers, TrendingUp, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';

const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export default function HomePage() {
  const {
    isWalletConnected,
    walletAddress,
    isLoading,
    error,
    registryError,
    registry,
    diagnostics,
    engineHoldings,
    exposureSummary,
    alerts,
    targetConcentrationPct,
    setTargetConcentrationPct,
    refresh,
  } = usePrismPortfolio();

  const [viewMode, setViewMode] = useState<DashboardViewMode>('LOOK_THROUGH');
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [activeRebalancePlan, setActiveRebalancePlan] = useState<RebalanceRecommendation | null>(null);

  const totalPortfolioUsd = exposureSummary?.totalPortfolioUsd || 0;
  const companies = exposureSummary?.underlyingCompanies || [];
  const sectors = exposureSummary?.sectorBreakdown || [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-sm flex items-start gap-3 shadow-lg">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Solana RPC Notice</p>
              <p className="text-xs text-rose-300/90 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Registry Notification if any */}
        {registryError && !error && (
          <div className="p-4 rounded-xl bg-amber-950/80 border border-amber-800 text-amber-200 text-sm flex items-start gap-3 shadow-lg">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Tessera Registry Notice</p>
              <p className="text-xs text-amber-300/90 mt-0.5">{registryError}</p>
            </div>
          </div>
        )}

        {!isWalletConnected ? (
          /* Disconnected State Hero */
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-2xl mx-auto space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center shadow-xl shadow-cyan-500/10">
              <Layers className="w-8 h-8 text-cyan-400" />
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Wallet-Native Look-Through Risk Engine
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                Connect your Solana wallet to read live token balances, detect supported tokenized stocks and ETFs, and look through to your true underlying company exposure.
              </p>
            </div>

            <div className="pt-2">
              <WalletMultiButtonDynamic className="!bg-indigo-600 hover:!bg-indigo-700 !rounded-xl !h-12 !px-6 !text-sm !font-semibold !shadow-lg !shadow-indigo-600/30 transition-all" />
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 w-full text-left">
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
                <span className="font-semibold text-slate-200 block">Token-2022 & SPL</span>
                <span className="text-slate-400 text-[11px] mt-0.5 block">Dual program scanner</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
                <span className="font-semibold text-slate-200 block">TradFi Decomposition</span>
                <span className="text-slate-400 text-[11px] mt-0.5 block">ETF constituent look-through</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
                <span className="font-semibold text-slate-200 block">Pure Math Engine</span>
                <span className="text-slate-400 text-[11px] mt-0.5 block">Deterministic risk solver</span>
              </div>
            </div>
          </div>
        ) : (
          /* Connected State: Real Live Portfolio Dashboard */
          <div className="space-y-6">
            {/* Top Portfolio Summary Banner */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Total Portfolio Value
                </span>
                <div className="text-3xl font-extrabold text-white font-mono flex items-baseline gap-2">
                  ${totalPortfolioUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="text-xs font-sans font-normal text-slate-400">USD</span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Wallet: {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}` : ''}
                </p>
              </div>

              {/* Quick Metrics */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                  <span className="text-slate-400 block">Reported Tokens</span>
                  <span className="text-sm font-bold text-slate-200 mt-0.5 block">
                    {engineHoldings.length} Assets
                  </span>
                </div>

                <div className="px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                  <span className="text-slate-400 block">Underlying Companies</span>
                  <span className="text-sm font-bold text-cyan-400 mt-0.5 block">
                    {companies.length} Companies
                  </span>
                </div>

                <div className="px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                  <span className="text-slate-400 block">Risk Status</span>
                  <span className={`text-sm font-bold mt-0.5 block ${alerts.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {alerts.length > 0 ? `${alerts.length} Warnings` : 'Balanced'}
                  </span>
                </div>

                <button
                  onClick={refresh}
                  disabled={isLoading}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Rescan on-chain balances"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Hero Look-Through Toggle */}
            <LookThroughToggle
              mode={viewMode}
              onModeChange={setViewMode}
              holdingsCount={engineHoldings.length}
              companiesCount={companies.length}
            />

            {/* Main Interactive Views */}
            {viewMode === 'HOLDINGS' ? (
              <TokenHoldingsList
                holdings={engineHoldings}
                totalPortfolioUsd={totalPortfolioUsd}
              />
            ) : (
              <div className="space-y-6">
                <UnderlyingExposureList
                  companies={companies}
                  totalPortfolioUsd={totalPortfolioUsd}
                  targetConcentrationPct={targetConcentrationPct}
                />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <ConcentrationControls
                      alerts={alerts}
                      targetConcentrationPct={targetConcentrationPct}
                      setTargetConcentrationPct={setTargetConcentrationPct}
                      summary={exposureSummary}
                      registry={registry}
                      onSelectRebalancePlan={(plan) => setActiveRebalancePlan(plan)}
                    />
                  </div>
                  <div>
                    <SectorBreakdown
                      sectors={sectors}
                      totalPortfolioUsd={totalPortfolioUsd}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Rebalance Swap Modal (Jupiter Integration) */}
            {activeRebalancePlan && (
              <RebalanceModal
                isOpen={!!activeRebalancePlan}
                onClose={() => setActiveRebalancePlan(null)}
                recommendation={activeRebalancePlan}
                onSwapSuccess={async () => {
                  await refresh();
                }}
              />
            )}

            {/* Bottom Toggle for Technical Diagnostics */}
            <div className="pt-4 border-t border-slate-900 flex justify-between items-center text-xs text-slate-400">
              <button
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="hover:text-slate-200 underline font-mono text-[11px] cursor-pointer"
              >
                {showDiagnostics ? '▲ Hide On-Chain Scanner Diagnostics' : '▼ Show On-Chain Scanner Diagnostics'}
              </button>
              <span>Verified Token-2022 & SPL Mainnet Feeds</span>
            </div>

            {showDiagnostics && (
              <DiagnosticsView
                walletAddress={walletAddress}
                diagnostics={diagnostics}
                isLoading={isLoading}
                onRefresh={refresh}
                totalReportedUsd={totalPortfolioUsd}
              />
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-400">
        PRISM — STOCKLANA / Solana Foundation Hackathon 2026. Non-custodial risk engine.
      </footer>
    </div>
  );
}
