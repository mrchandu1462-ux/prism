'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { fetchWalletTokenAccounts, ScannedTokenAccount } from '@/lib/solana/scanner';
import { adaptScannedAccountsToHoldings, DiagnosticsTokenRecord } from '@/lib/solana/adapter';
import { fetchLiveTokenPrices, TokenPriceRecord } from '@/lib/price/fetcher';
import { buildAuthoritativeTokenRegistry } from '@/lib/tessera/adapter';
import { BASE_SUPPORTED_ASSETS } from '@/config/tokens';
import { DEMO_SCANNED_ACCOUNTS, DEMO_PRICES, DEMO_WALLET_ADDRESS } from '@/config/demo';
import { calculateUnderlyingExposure } from '@/lib/engine/exposure';
import { evaluateConcentrationRisk } from '@/lib/engine/concentration';
import { applySimulatedRebalance } from '@/lib/engine/rebalance';
import { getETFConstituentData } from '@/lib/etf/registry';
import {
  AssetHolding,
  ConcentrationRiskAlert,
  PortfolioExposureSummary,
  RebalanceRecommendation,
  SupportedAssetConfig,
} from '@/types';

export interface UsePrismPortfolioState {
  isWalletConnected: boolean;
  isDemoMode: boolean;
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
  loadDemoPortfolio: () => void;
  applyDemoRebalance: (recommendation: RebalanceRecommendation) => void;
  exitDemoMode: () => void;
  refresh: () => Promise<void>;
}

export function usePrismPortfolio(initialTargetPct: number = 10.0): UsePrismPortfolioState {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();

  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
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

  // Load deterministic demo portfolio using exact existing engine pipelines
  const loadDemoPortfolio = useCallback(() => {
    setIsDemoMode(true);
    setError(null);
    setRegistryError(null);
    setIsLoading(false);

    const adapterResult = adaptScannedAccountsToHoldings(
      DEMO_SCANNED_ACCOUNTS,
      BASE_SUPPORTED_ASSETS,
      DEMO_PRICES
    );

    setRawAccounts(DEMO_SCANNED_ACCOUNTS);
    setPrices(DEMO_PRICES);
    setDiagnostics(adapterResult.diagnostics);
    setEngineHoldings(adapterResult.engineHoldings);

    const summary = calculateUnderlyingExposure(
      adapterResult.engineHoldings,
      getETFConstituentData
    );
    setExposureSummary(summary);

    const generatedAlerts = evaluateConcentrationRisk(summary, targetConcentrationPct);
    setAlerts(generatedAlerts);
  }, [targetConcentrationPct]);

  // Apply simulated rebalance to demo state
  const applyDemoRebalance = useCallback(
    (recommendation: RebalanceRecommendation) => {
      const currentAccounts = rawAccounts.length > 0 ? rawAccounts : DEMO_SCANNED_ACCOUNTS;
      const currentPrices = Object.keys(prices).length > 0 ? prices : DEMO_PRICES;

      const updatedAccounts = applySimulatedRebalance(
        currentAccounts,
        recommendation,
        currentPrices
      );

      const adapterResult = adaptScannedAccountsToHoldings(
        updatedAccounts,
        BASE_SUPPORTED_ASSETS,
        currentPrices
      );

      setRawAccounts(updatedAccounts);
      setPrices(currentPrices);
      setDiagnostics(adapterResult.diagnostics);
      setEngineHoldings(adapterResult.engineHoldings);

      const summary = calculateUnderlyingExposure(
        adapterResult.engineHoldings,
        getETFConstituentData
      );
      setExposureSummary(summary);

      const generatedAlerts = evaluateConcentrationRisk(summary, targetConcentrationPct);
      setAlerts(generatedAlerts);
    },
    [rawAccounts, prices, targetConcentrationPct]
  );

  // Exit demo mode and restore real wallet state
  const exitDemoMode = useCallback(() => {
    setIsDemoMode(false);
  }, []);

  const fetchPortfolio = useCallback(async () => {
    // If in demo mode, preserve existing simulated accounts
    if (isDemoMode) {
      if (rawAccounts.length > 0) {
        const currentPrices = Object.keys(prices).length > 0 ? prices : DEMO_PRICES;
        const adapterResult = adaptScannedAccountsToHoldings(
          rawAccounts,
          BASE_SUPPORTED_ASSETS,
          currentPrices
        );
        setDiagnostics(adapterResult.diagnostics);
        setEngineHoldings(adapterResult.engineHoldings);
        const summary = calculateUnderlyingExposure(
          adapterResult.engineHoldings,
          getETFConstituentData
        );
        setExposureSummary(summary);
        const generatedAlerts = evaluateConcentrationRisk(summary, targetConcentrationPct);
        setAlerts(generatedAlerts);
      } else {
        loadDemoPortfolio();
      }
      return;
    }

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
  }, [connected, publicKey, connection, targetConcentrationPct, isDemoMode, rawAccounts, prices, loadDemoPortfolio]);

  // Recalculate alerts dynamically when target percentage changes
  useEffect(() => {
    if (exposureSummary) {
      const generatedAlerts = evaluateConcentrationRisk(exposureSummary, targetConcentrationPct);
      setAlerts(generatedAlerts);
    }
  }, [targetConcentrationPct, exposureSummary]);

  // Trigger on wallet connection / public key change
  useEffect(() => {
    if (!isDemoMode) {
      fetchPortfolio();
    }
  }, [fetchPortfolio, isDemoMode]);

  return {
    isWalletConnected: connected || isDemoMode,
    isDemoMode,
    walletAddress: isDemoMode ? DEMO_WALLET_ADDRESS : publicKey ? publicKey.toBase58() : null,
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
    loadDemoPortfolio,
    applyDemoRebalance,
    exitDemoMode,
    refresh: fetchPortfolio,
  };
}
