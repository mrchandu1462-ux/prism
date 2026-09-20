'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { fetchWalletTokenAccounts, ScannedTokenAccount } from '@/lib/solana/scanner';
import { adaptScannedAccountsToHoldings, DiagnosticsTokenRecord } from '@/lib/solana/adapter';
import { fetchLiveTokenPrices, TokenPriceRecord } from '@/lib/price/fetcher';
import { buildAuthoritativeTokenRegistry } from '@/lib/tessera/adapter';
import { BASE_SUPPORTED_ASSETS } from '@/config/tokens';
import { calculateUnderlyingExposure } from '@/lib/engine/exposure';
import { evaluateConcentrationRisk } from '@/lib/engine/concentration';
import { getETFConstituentData } from '@/lib/etf/registry';
import {
  AssetHolding,
  ConcentrationRiskAlert,
  PortfolioExposureSummary,
  SupportedAssetConfig,
} from '@/types';

export interface UsePrismPortfolioState {
  isWalletConnected: boolean;
  walletAddress: string | null;
  isLoading: boolean;
  error: string | null;
  registryError: string | null;
  registry: Record<string, SupportedAssetConfig>;
  rawAccounts: ScannedTokenAccount[];
  diagnostics: DiagnosticsTokenRecord[];
  engineHoldings: AssetHolding[];
  prices: Record<string, TokenPriceRecord>;
  exposureSummary: PortfolioExposureSummary | null;
  alerts: ConcentrationRiskAlert[];
  targetConcentrationPct: number;
  setTargetConcentrationPct: (val: number) => void;
  refresh: () => Promise<void>;
}

export function usePrismPortfolio(initialTargetPct: number = 10.0): UsePrismPortfolioState {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<Record<string, SupportedAssetConfig>>(BASE_SUPPORTED_ASSETS);
  const [rawAccounts, setRawAccounts] = useState<ScannedTokenAccount[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsTokenRecord[]>([]);
  const [engineHoldings, setEngineHoldings] = useState<AssetHolding[]>([]);
  const [prices, setPrices] = useState<Record<string, TokenPriceRecord>>({});
  const [exposureSummary, setExposureSummary] = useState<PortfolioExposureSummary | null>(null);
  const [alerts, setAlerts] = useState<ConcentrationRiskAlert[]>([]);
  const [targetConcentrationPct, setTargetConcentrationPct] = useState<number>(initialTargetPct);

  const fetchPortfolio = useCallback(async () => {
    if (!connected || !publicKey) {
      setRawAccounts([]);
      setDiagnostics([]);
      setEngineHoldings([]);
      setPrices({});
      setExposureSummary(null);
      setAlerts([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setRegistryError(null);

    try {
      // 1. Fetch Authoritative Tessera Registry & Validate Mints on Solana
      let currentRegistry = BASE_SUPPORTED_ASSETS;
      let currentTesseraPrices: Record<string, number> = {};

      try {
        const registryResult = await buildAuthoritativeTokenRegistry(connection);
        currentRegistry = registryResult.assets;
        currentTesseraPrices = registryResult.tesseraPrices;
        setRegistry(registryResult.assets);
      } catch (regErr: any) {
        console.warn('Failed to load dynamic Tessera token registry:', regErr);
        setRegistryError(regErr?.message || 'Tessera registry unavailable.');
        // Fallback to BASE_SUPPORTED_ASSETS without fabricating fake data
      }

      // 2. Scan On-Chain SPL & Token-2022 accounts
      const scanResult = await fetchWalletTokenAccounts(connection, publicKey);
      setRawAccounts(scanResult.accounts);

      // 3. Collect unique mints for price resolution
      const detectedMints = Array.from(new Set(scanResult.accounts.map((a) => a.mint)));

      // 4. Fetch live USD prices with authoritative Tessera markPrice priority
      const fetchedPrices = await fetchLiveTokenPrices(detectedMints, {
        tesseraPrices: currentTesseraPrices,
      });
      setPrices(fetchedPrices);

      // 5. Adapt scanned accounts into verified Phase 1 engine inputs
      const adapterResult = adaptScannedAccountsToHoldings(
        scanResult.accounts,
        currentRegistry,
        fetchedPrices
      );
      setDiagnostics(adapterResult.diagnostics);
      setEngineHoldings(adapterResult.engineHoldings);

      // 6. Execute Pure Phase 1 Risk Engine
      const summary = calculateUnderlyingExposure(
        adapterResult.engineHoldings,
        getETFConstituentData
      );
      setExposureSummary(summary);

      // 7. Evaluate single-stock & ETF concentration alerts
      const generatedAlerts = evaluateConcentrationRisk(summary, targetConcentrationPct);
      setAlerts(generatedAlerts);
    } catch (err: any) {
      console.error('Failed to load wallet portfolio:', err);
      const msg = err?.message || 'Failed to scan on-chain token accounts.';
      setError(msg);
      setRawAccounts([]);
      setDiagnostics([]);
      setEngineHoldings([]);
      setExposureSummary(null);
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  }, [connected, publicKey, connection, targetConcentrationPct]);

  // Trigger on wallet connection / public key change
  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  return {
    isWalletConnected: connected,
    walletAddress: publicKey ? publicKey.toBase58() : null,
    isLoading,
    error,
    registryError,
    registry,
    rawAccounts,
    diagnostics,
    engineHoldings,
    prices,
    exposureSummary,
    alerts,
    targetConcentrationPct,
    setTargetConcentrationPct,
    refresh: fetchPortfolio,
  };
}
