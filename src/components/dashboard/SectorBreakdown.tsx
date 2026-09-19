'use client';

import React from 'react';
import { SectorExposure } from '@/types';
import { PieChart } from 'lucide-react';

interface SectorBreakdownProps {
  sectors: SectorExposure[];
  totalPortfolioUsd: number;
}

export function SectorBreakdown({ sectors, totalPortfolioUsd }: SectorBreakdownProps) {
  if (sectors.length === 0) return null;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
        <PieChart className="w-4 h-4 text-cyan-400" />
        <h3 className="text-base font-semibold text-white">Underlying Sector Allocation</h3>
      </div>

      <div className="space-y-3">
        {sectors.slice(0, 6).map((sector) => (
          <div key={sector.sector} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-medium">{sector.sector}</span>
              <span className="font-mono font-semibold text-slate-200">
                ${sector.exposureUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({sector.portfolioPercentage.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                style={{ width: `${Math.min(100, sector.portfolioPercentage)}%` }}
                className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-full rounded-full"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
