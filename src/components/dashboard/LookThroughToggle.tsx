'use client';

import React from 'react';
import { Coins, Eye, Sparkles } from 'lucide-react';

export type DashboardViewMode = 'HOLDINGS' | 'LOOK_THROUGH';

interface LookThroughToggleProps {
  mode: DashboardViewMode;
  onModeChange: (mode: DashboardViewMode) => void;
  holdingsCount: number;
  companiesCount: number;
}

export function LookThroughToggle({
  mode,
  onModeChange,
  holdingsCount,
  companiesCount,
}: LookThroughToggleProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800 shadow-xl">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Portfolio View Mode
          </h2>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          Switch between raw Solana wallet holdings and deep look-through company exposures
        </p>
      </div>

      <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800">
        <button
          onClick={() => onModeChange('HOLDINGS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            mode === 'HOLDINGS'
              ? 'bg-slate-800 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Coins className="w-3.5 h-3.5 text-indigo-400" />
          What You Hold ({holdingsCount})
        </button>

        <button
          onClick={() => onModeChange('LOOK_THROUGH')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            mode === 'LOOK_THROUGH'
              ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Eye className="w-3.5 h-3.5 text-cyan-200" />
          LOOK THROUGH ({companiesCount})
        </button>
      </div>
    </div>
  );
}
