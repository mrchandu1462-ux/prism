'use client';

import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { RebalanceRecommendation } from '@/types';
import {
  buildJupiterSwapTransaction,
  deserializeSwapTransaction,
  fetchJupiterQuote,
  formatQuoteSummary,
} from '@/lib/jupiter/client';
import { FormattedQuoteSummary, SwapExecutionStatus } from '@/lib/jupiter/types';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Sparkles,
  TrendingDown,
  X,
  Zap,
} from 'lucide-react';

interface RebalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommendation: RebalanceRecommendation;
  onSwapSuccess: (recommendation?: RebalanceRecommendation) => Promise<void> | void;
  isDemoMode?: boolean;
}

export function RebalanceModal({
  isOpen,
  onClose,
  recommendation,
  onSwapSuccess,
  isDemoMode = false,
}: RebalanceModalProps) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [status, setStatus] = useState<SwapExecutionStatus>('IDLE');
  const [quoteSummary, setQuoteSummary] = useState<FormattedQuoteSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  // Calculate base units for input token (e.g. 9 decimals for Tessera Token-2022, 8 decimals for NVDAx)
  const inputLamports = BigInt(
    Math.max(1, Math.round(recommendation.sellAmountTokens * Math.pow(10, recommendation.directStockToSell.decimals)))
  ).toString();

  // Fetch Live Quote or Prepare Deterministic Demo Quote
  const loadQuote = async () => {
    setStatus('FETCHING_QUOTE');
    setErrorMessage(null);
    setTxSignature(null);

    // In Demo Mode: produce deterministic simulated quote matching exact rebalance math
    if (isDemoMode) {
      const expectedOutput = recommendation.sellAmountUsd;
      const slippageBps = 50; // 0.5%
      const minimumOutput = expectedOutput * (1 - slippageBps / 10000);

      const demoQuote: FormattedQuoteSummary = {
        inputSymbol: recommendation.directStockToSell.symbol,
        inputAmountTokens: recommendation.sellAmountTokens,
        inputAmountLamports: inputLamports,
        outputSymbol: recommendation.outputToken.symbol,
        expectedOutputTokens: expectedOutput,
        minimumOutputTokens: minimumOutput,
        priceImpactPct: 0.01,
        slippageBps,
        routeLabels: [recommendation.directStockToSell.symbol, 'USDC (Jupiter Best Route)'],
        rawQuote: null as any,
      };

      setQuoteSummary(demoQuote);
      setStatus('QUOTE_READY');
      return;
    }

    // Live Wallet Mode: fetch real Jupiter quote across on-chain pools
    try {
      const rawQuote = await fetchJupiterQuote(
        recommendation.directStockToSell.mint,
        recommendation.outputToken.mint,
        inputLamports,
        50 // 0.5% default slippage
      );

      const formatted = formatQuoteSummary(
        rawQuote,
        recommendation.directStockToSell,
        recommendation.outputToken
      );

      setQuoteSummary(formatted);
      setStatus('QUOTE_READY');
    } catch (err: any) {
      console.error('Quote fetch failed:', err);
      setErrorMessage(err?.message || 'Failed to obtain a Jupiter swap quote.');
      setStatus('ERROR');
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadQuote();
    } else {
      setStatus('IDLE');
      setQuoteSummary(null);
      setErrorMessage(null);
      setTxSignature(null);
    }
  }, [isOpen, isDemoMode]);

  // Execute Swap Transaction (or Simulate in Demo Mode)
  const handleExecuteSwap = async () => {
    if (isDemoMode) {
      setStatus('CONFIRMED');
      await onSwapSuccess(recommendation);
      return;
    }

    if (!publicKey || !quoteSummary) return;

    setStatus('BUILDING_TRANSACTION');
    setErrorMessage(null);

    try {
      // 1. Build serialized VersionedTransaction via Jupiter
      const swapRes = await buildJupiterSwapTransaction(
        quoteSummary.rawQuote,
        publicKey.toBase58()
      );

      const versionedTx = deserializeSwapTransaction(swapRes.swapTransaction);

      // 2. Request user wallet approval
      setStatus('AWAITING_WALLET_SIGNATURE');
      const signature = await sendTransaction(versionedTx, connection, {
        skipPreflight: false,
        maxRetries: 3,
      });

      // 3. Await on-chain confirmation
      setStatus('CONFIRMING_ON_CHAIN');
      setTxSignature(signature);

      const blockhash = versionedTx.message.recentBlockhash;
      const lastValidBlockHeight = swapRes.lastValidBlockHeight;

      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(
          `On-chain transaction failed: ${JSON.stringify(confirmation.value.err)}`
        );
      }

      setStatus('CONFIRMED');
      await onSwapSuccess();
    } catch (err: any) {
      console.error('Swap execution error:', err);
      let msg = err?.message || 'Transaction failed or was rejected by user.';
      if (msg.includes('User rejected')) {
        msg = 'Transaction was rejected in your wallet.';
      } else if (msg.includes('Attempt to debit an account but found no record of a prior credit') || msg.includes('insufficient lamports')) {
        msg = 'Insufficient SOL balance to pay for Solana network transaction fees. Please fund your wallet with at least 0.005 SOL.';
      }
      setErrorMessage(msg);
      setStatus('ERROR');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-6 relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 text-cyan-400 rounded-xl border border-cyan-500/30">
              <Zap className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                De-Risk Concentration — Jupiter Swap
                {isDemoMode && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Demo Mode
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {isDemoMode
                  ? 'Simulated Jupiter Rebalance Preview'
                  : 'User-approved on-chain rebalancing order'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Before vs After Exposure Comparison Card */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>Exposure Look-Through Impact</span>
            <span className="text-cyan-400">{recommendation.targetCompanyTicker}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/40">
              <span className="text-[11px] text-rose-300 block">Current Exposure</span>
              <div className="text-lg font-bold text-rose-400 font-mono mt-0.5">
                ${recommendation.currentExposureUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-rose-300/80 block mt-0.5">
                Over-Concentrated
              </span>
            </div>

            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40">
              <span className="text-[11px] text-emerald-300 block">Target Exposure</span>
              <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                ${recommendation.projectedNewExposureUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-emerald-300/80 block mt-0.5">
                Target ({recommendation.targetPercentage}%)
              </span>
            </div>
          </div>

          {recommendation.isConstrainedByDirectHolding && (
            <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-300 text-[11px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                Selling 100% of direct holdings. Remaining exposure is derived from ETF constituents.
              </span>
            </div>
          )}
        </div>

        {/* Quote Details & Route Breakdown */}
        {status === 'FETCHING_QUOTE' ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-3 text-slate-400 text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            <span>Fetching live quotes across Solana DEX liquidity pools...</span>
          </div>
        ) : quoteSummary ? (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">You Pay (Input):</span>
                <span className="font-mono font-bold text-white">
                  {quoteSummary.inputAmountTokens.toFixed(4)} {quoteSummary.inputSymbol} (~${recommendation.sellAmountUsd.toFixed(2)})
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Expected Output:</span>
                <span className="font-mono font-bold text-emerald-400">
                  ~{quoteSummary.expectedOutputTokens.toFixed(2)} {quoteSummary.outputSymbol}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Guaranteed Minimum:</span>
                <span className="font-mono text-slate-200">
                  {quoteSummary.minimumOutputTokens.toFixed(2)} {quoteSummary.outputSymbol}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-slate-700/50">
                <span className="text-slate-400">Execution Route:</span>
                <span className="font-mono text-[11px] text-cyan-300">
                  {quoteSummary.routeLabels.join(' → ')}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Price Impact / Slippage:</span>
                <span className="font-mono text-slate-300">
                  {quoteSummary.priceImpactPct < 0.01 ? '<0.01%' : `${quoteSummary.priceImpactPct.toFixed(2)}%`} (Slippage: {(quoteSummary.slippageBps / 100).toFixed(1)}%)
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-400 text-[10px] pt-1 border-t border-slate-700/40">
                <span>Signer Wallet:</span>
                <span className="font-mono text-slate-300 truncate max-w-[200px]">
                  {isDemoMode ? 'Demo Portfolio (Simulated)' : publicKey ? `${publicKey.toBase58().slice(0, 6)}...${publicKey.toBase58().slice(-6)}` : ''}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Error Alert */}
        {status === 'ERROR' && errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold block">Execution Error</span>
              <p className="text-rose-300/90 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Success Confirmation Banner */}
        {status === 'CONFIRMED' && (
          <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{isDemoMode ? 'Simulated Rebalance Complete!' : 'Exposure Successfully Reduced!'}</span>
            </div>
            <p className="text-emerald-300/90 leading-relaxed">
              {isDemoMode
                ? 'Simulated portfolio updated to target concentration. No on-chain transaction was submitted.'
                : 'Transaction confirmed on Solana. Direct holdings swapped into USDC and portfolio rebalanced.'}
            </p>
            {!isDemoMode && txSignature && (
              <a
                href={`https://solscan.io/tx/${txSignature}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-[11px] text-cyan-400 hover:text-cyan-300 underline pt-1"
              >
                <span>View on Solscan ({txSignature.slice(0, 8)}...{txSignature.slice(-8)})</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Actions Footer */}
        <div className="pt-2 flex items-center justify-end gap-3">
          {status === 'CONFIRMED' ? (
            <button
              onClick={onClose}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-white text-sm shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              Done & View Updated Portfolio
            </button>
          ) : status === 'ERROR' ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={loadQuote}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-white text-xs transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Quote
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={status === 'BUILDING_TRANSACTION' || status === 'AWAITING_WALLET_SIGNATURE' || status === 'CONFIRMING_ON_CHAIN'}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteSwap}
                disabled={status !== 'QUOTE_READY'}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 font-bold text-white text-xs shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {status === 'BUILDING_TRANSACTION' && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Building Transaction...
                  </>
                )}
                {status === 'AWAITING_WALLET_SIGNATURE' && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Approve in Wallet...
                  </>
                )}
                {status === 'CONFIRMING_ON_CHAIN' && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Confirming on Solana...
                  </>
                )}
                {status === 'QUOTE_READY' && (
                  <>
                    <span>{isDemoMode ? 'Demo — No Transaction' : 'Approve & Sign Swap'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
