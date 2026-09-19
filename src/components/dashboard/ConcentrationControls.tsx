'use client';

import React from 'react';
import {
  ConcentrationRiskAlert,
  PortfolioExposureSummary,
  RebalanceRecommendation,
  SupportedAssetConfig,
} from '@/types';
import { generateRebalanceRecommendation } from '@/lib/engine/rebalance';
import { SUPPORTED_ASSETS } from '@/config/tokens';
import { ShieldAlert, AlertTriangle, ArrowRight, CheckCircle2, Sliders, Zap } from 'lucide-react';

interface ConcentrationControlsProps {
  alerts: ConcentrationRiskAlert[];
  targetConcentrationPct: number;
  setTargetConcentrationPct: (val: number) => void;
  summary: PortfolioExposureSummary | null;
  registry?: Record<string, SupportedAssetConfig>;
  onSelectRebalancePlan?: (plan: RebalanceRecommendation) => void;
}

export function ConcentrationControls({
  alerts,
  targetConcentrationPct,
  setTargetConcentrationPct,
  summary,
  registry = SUPPORTED_ASSETS,
  onSelectRebalancePlan,
}: ConcentrationControlsProps) {
  const getDirectConfig = (ticker: string) => {
    const target = ticker.toUpperCase();
    return Object.values(registry).find(
      (a) =>
        (a.underlyingTicker?.toUpperCase() === target ||
          a.symbol.toUpperCase() === target ||
          a.symbol.toUpperCase().replace(/^T-/, '') === target) &&
        a.assetType === 'SINGLE_STOCK'
    );
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md space-y-6">
      {/* Target Concentration Slider Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
            <Sliders className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-white">Risk Engine & Concentration Target</h3>
            <p className="text-xs text-slate-400">
              Set your maximum desired single-stock exposure threshold
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">Max Single Stock Target:</span>
          <span className="text-sm font-mono font-bold px-3 py-1 rounded-lg bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
            {targetConcentrationPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Slider Control */}
      <div className="space-y-2">
        <input
          type="range"
          min="5"
          max="30"
          step="1"
          value={targetConcentrationPct}
          onChange={(e) => setTargetConcentrationPct(parseFloat(e.target.value))}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
        <div className="flex justify-between text-[11px] font-mono text-slate-400">
          <span>5% (Conservative)</span>
          <span>10% (Balanced Default)</span>
          <span>20% (High Conviction)</span>
          <span>30% (Aggressive)</span>
        </div>
      </div>

      {/* Concentration Alerts & De-risking Plans */}
      <div className="space-y-3 pt-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Detected Portfolio Concentration Anomalies ({alerts.length})
        </h4>

        {alerts.length === 0 ? (
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              All single-stock holdings and ETF-derived exposures are within your{' '}
              <strong>{targetConcentrationPct.toFixed(1)}%</strong> target limit.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const rebalancePlan = summary
                ? generateRebalanceRecommendation(
                    alert.ticker,
                    summary,
                    targetConcentrationPct,
                    registry.USDC || SUPPORTED_ASSETS.USDC,
                    getDirectConfig
                  )
                : null;

              return (
                <div
                  key={alert.ticker}
                  className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-rose-950/90 text-rose-300 border border-rose-800'
                          : alert.severity === 'HIGH'
                          ? 'bg-amber-950/90 text-amber-300 border border-amber-800'
                          : 'bg-yellow-950/90 text-yellow-300 border border-yellow-800'
                      }`}>
                        {alert.severity} RISK
                      </span>
                      <span className="font-semibold text-white text-sm">
                        {alert.ticker} ({alert.companyName})
                      </span>
                    </div>

                    <div className="text-xs font-mono text-slate-300">
                      Current: <strong className="text-amber-400">{alert.currentPercentage.toFixed(1)}%</strong> | Target: {alert.targetPercentage.toFixed(1)}%
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {alert.message}
                  </p>

                  {/* Proposed Phase 1 Rebalance Action */}
                  {rebalancePlan && (
                    <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider block">
                          Rebalance Action (Direct Stock Only)
                        </span>
                        <span className="text-slate-200 block">
                          Sell <strong>{rebalancePlan.sellAmountTokens.toFixed(4)} {rebalancePlan.directStockToSell.symbol}</strong> (~${rebalancePlan.sellAmountUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) → USDC
                        </span>
                        <span className="text-[11px] text-slate-400 block font-mono">
                          Projected New Exposure: <strong className="text-emerald-400">{rebalancePlan.projectedNewPercentage.toFixed(1)}%</strong> (${rebalancePlan.projectedNewExposureUsd.toFixed(2)})
                        </span>
                      </div>

                      {onSelectRebalancePlan && (
                        <button
                          onClick={() => onSelectRebalancePlan(rebalancePlan)}
                          className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 font-bold text-white text-xs shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Fix Exposure on Jupiter</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
