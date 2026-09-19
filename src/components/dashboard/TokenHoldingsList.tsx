'use client';

import React from 'react';
import { AssetHolding } from '@/types';
import { Coins, ExternalLink } from 'lucide-react';

interface TokenHoldingsListProps {
  holdings: AssetHolding[];
  totalPortfolioUsd: number;
}

export function TokenHoldingsList({ holdings, totalPortfolioUsd }: TokenHoldingsListProps) {
  if (holdings.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-slate-400 text-sm">
        No supported tokenized stock or ETF balances detected in this wallet.
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <Coins className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-white">Reported Token Holdings</h3>
            <p className="text-xs text-slate-400">Tokens physically held in your Solana wallet account</p>
          </div>
        </div>
        <span className="text-xs font-mono font-medium px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
          {holdings.length} {holdings.length === 1 ? 'Asset' : 'Assets'}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead>
            <tr className="border-b border-slate-800/80 text-slate-400 uppercase tracking-wider text-[10px]">
              <th className="py-2.5 px-3">Asset</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3 text-right">Quantity</th>
              <th className="py-2.5 px-3 text-right">Price</th>
              <th className="py-2.5 px-3 text-right">Market Value</th>
              <th className="py-2.5 px-3 text-right">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 font-sans">
            {holdings.map((holding) => {
              const sharePct = totalPortfolioUsd > 0 ? (holding.usdValue / totalPortfolioUsd) * 100 : 0;

              return (
                <tr key={holding.mint} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-slate-800 to-slate-700 flex items-center justify-center font-bold text-[11px] text-cyan-400 border border-slate-700">
                        {holding.symbol.slice(0, 3)}
                      </div>
                      <div>
                        <span className="font-semibold text-white block">{holding.symbol}</span>
                        <span className="text-[10px] text-slate-400 block">{holding.name}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      holding.assetType === 'ETF'
                        ? 'bg-purple-950/80 text-purple-300 border border-purple-800/50'
                        : holding.assetType === 'SINGLE_STOCK'
                        ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/50'
                        : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
                    }`}>
                      {holding.assetType === 'ETF' ? 'Tokenized ETF' : holding.assetType === 'SINGLE_STOCK' ? 'Direct Stock' : 'Stablecoin'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-medium text-slate-200">
                    {holding.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-300">
                    ${holding.usdPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-semibold text-cyan-400">
                    ${holding.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-medium text-slate-300">
                    {sharePct.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
