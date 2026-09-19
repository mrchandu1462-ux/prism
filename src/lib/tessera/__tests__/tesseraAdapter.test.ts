import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Connection } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import {
  adaptTesseraTokenToSupportedAsset,
  buildAuthoritativeTokenRegistry,
} from '../adapter';
import { fetchLiveTokenPrices } from '../../price/fetcher';
import { calculateUnderlyingExposure } from '../../engine/exposure';
import { evaluateConcentrationRisk } from '../../engine/concentration';
import { generateRebalanceRecommendation } from '../../engine/rebalance';
import { getETFConstituentData } from '../../etf/registry';
import { clearTesseraCache } from '../client';
import { AssetHolding, SupportedAssetConfig } from '@/types';

const MOCK_TESSERA_TOKENS = [
  {
    id: 'T-OpenAI',
    name: 'T-OpenAI',
    symbol: 'T-OpenAI',
    code: 'tOpenAI',
    sector: 'Artificial Intelligence',
    mint: 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ',
    markPrice: 812.79,
    holders: 8259,
    markValuation: 950000000000,
  },
  {
    id: 'T-SpaceX',
    name: 'T-SpaceX',
    symbol: 'T-SpaceX',
    code: 'tSpaceX',
    sector: 'Aerospace',
    mint: 'TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v',
    markPrice: 423.0,
    holders: 1274,
    markValuation: 800000000000,
  },
];

describe('Tessera Adapter & Unified Registry Integration', () => {
  beforeEach(() => {
    clearTesseraCache();
    vi.restoreAllMocks();
  });

  it('correctly adapts a TesseraToken into PRISM SupportedAssetConfig', () => {
    const token = MOCK_TESSERA_TOKENS[0];
    const verifiedMintInfo = {
      mint: token.mint,
      decimals: 9,
      isInitialized: true,
      programId: TOKEN_2022_PROGRAM_ID.toBase58(),
      isToken2022: true,
    };

    const config = adaptTesseraTokenToSupportedAsset(token, verifiedMintInfo);

    expect(config.symbol).toBe('T-OpenAI');
    expect(config.name).toBe('T-OpenAI');
    expect(config.mint).toBe('oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ');
    expect(config.decimals).toBe(9);
    expect(config.assetType).toBe('SINGLE_STOCK');
    expect(config.underlyingTicker).toBe('T-OpenAI');
    expect(config.sector).toBe('Artificial Intelligence');
    expect(config.markPrice).toBe(812.79);
    expect(config.isVerifiedMint).toBe(true);
  });

  it('builds authoritative registry with on-chain validation and preserves base assets', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MOCK_TESSERA_TOKENS,
    });

    const mockConnection = {
      getParsedAccountInfo: vi.fn().mockImplementation(async (pubkey) => {
        return {
          value: {
            owner: TOKEN_2022_PROGRAM_ID,
            data: {
              parsed: {
                type: 'mint',
                info: { decimals: 9, isInitialized: true },
              },
            },
          },
        };
      }),
    } as unknown as Connection;

    const registryResult = await buildAuthoritativeTokenRegistry(mockConnection, {
      fetchFn: mockFetch as any,
    });

    // Contains base settlement assets and ETFs
    expect(registryResult.assets.USDC).toBeDefined();
    expect(registryResult.assets.SPYx).toBeDefined();
    expect(registryResult.assets.QQQx).toBeDefined();

    // Contains validated Tessera assets
    expect(registryResult.assets['T-OpenAI']).toBeDefined();
    expect(registryResult.assets['T-OpenAI'].decimals).toBe(9);
    expect(registryResult.assets['T-SpaceX']).toBeDefined();

    // Contains markPrice mapping
    expect(registryResult.tesseraPrices['oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ']).toBe(812.79);
    expect(registryResult.tesseraPrices['TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v']).toBe(423.0);
  });

  it('uses Tessera authoritative markPrice in live price fetcher', async () => {
    const tesseraPrices = {
      oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ: 812.79,
      TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v: 423.0,
    };

    const prices = await fetchLiveTokenPrices(
      [
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ', // T-OpenAI
        'TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v', // T-SpaceX
      ],
      { tesseraPrices }
    );

    expect(prices['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'].usdPrice).toBe(1.0);
    expect(prices['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'].source).toBe('PEG_ORACLE');

    expect(prices['oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ'].usdPrice).toBe(812.79);
    expect(prices['oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ'].source).toBe('TESSERA_ORACLE');

    expect(prices['TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v'].usdPrice).toBe(423.0);
    expect(prices['TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v'].source).toBe('TESSERA_ORACLE');
  });

  it('integrates Tessera holdings with pure risk engine and ETF look-through decomposition', () => {
    // Portfolio holding:
    // 10 units of T-OpenAI ($812.79 * 10 = $8,127.90)
    // 5 units of T-SpaceX ($423.00 * 5 = $2,115.00)
    // 10 units of SPYx ($600 * 10 = $6,000.00)
    // 3,757.10 USDC ($3,757.10)
    // Total Portfolio = $20,000.00

    const holdings: AssetHolding[] = [
      {
        mint: 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ',
        symbol: 'T-OpenAI',
        name: 'T-OpenAI',
        assetType: 'SINGLE_STOCK',
        rawBalance: 10_000_000_000n,
        uiAmount: 10,
        usdPrice: 812.79,
        usdValue: 8127.90,
        underlyingTicker: 'T-OpenAI',
        sector: 'Artificial Intelligence',
      },
      {
        mint: 'TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v',
        symbol: 'T-SpaceX',
        name: 'T-SpaceX',
        assetType: 'SINGLE_STOCK',
        rawBalance: 5_000_000_000n,
        uiAmount: 5,
        usdPrice: 423.0,
        usdValue: 2115.0,
        underlyingTicker: 'T-SpaceX',
        sector: 'Aerospace',
      },
      {
        mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W',
        symbol: 'SPYx',
        name: 'SPDR S&P 500 Tokenized ETF',
        assetType: 'ETF',
        rawBalance: 1_000_000_000n,
        uiAmount: 10,
        usdPrice: 600.0,
        usdValue: 6000.0,
        underlyingTicker: 'SPY',
        etfConstituentId: 'SPY',
      },
      {
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        name: 'USD Coin',
        assetType: 'STABLECOIN',
        rawBalance: 3_757_100_000n,
        uiAmount: 3757.10,
        usdPrice: 1.0,
        usdValue: 3757.10,
      },
    ];

    const summary = calculateUnderlyingExposure(holdings, getETFConstituentData);

    expect(summary.totalPortfolioUsd).toBe(20000);

    // Verify Tessera companies appear in underlying companies
    const openAiExposure = summary.underlyingCompanies.find((c) => c.ticker === 'T-OPENAI');
    expect(openAiExposure).toBeDefined();
    expect(openAiExposure?.totalExposureUsd).toBe(8127.90);
    expect(openAiExposure?.portfolioPercentage).toBe(40.6395); // 8127.9 / 20000 = ~40.64%
    expect(openAiExposure?.sector).toBe('Artificial Intelligence');

    const spaceXExposure = summary.underlyingCompanies.find((c) => c.ticker === 'T-SPACEX');
    expect(spaceXExposure).toBeDefined();
    expect(spaceXExposure?.totalExposureUsd).toBe(2115.0);
    expect(spaceXExposure?.portfolioPercentage).toBe(10.575);
    expect(spaceXExposure?.sector).toBe('Aerospace');

    // Verify ETF constituents (e.g. NVDA, AAPL, MSFT) are decomposed
    const nvdaExposure = summary.underlyingCompanies.find((c) => c.ticker === 'NVDA');
    expect(nvdaExposure).toBeDefined();
    expect(nvdaExposure?.etfDerivedUsd).toBeGreaterThan(0);

    // Verify Sector Breakdown contains Artificial Intelligence and Aerospace
    const aiSector = summary.sectorBreakdown.find((s) => s.sector === 'Artificial Intelligence');
    expect(aiSector).toBeDefined();
    expect(aiSector?.exposureUsd).toBe(8127.90);

    const aeroSector = summary.sectorBreakdown.find((s) => s.sector === 'Aerospace');
    expect(aeroSector).toBeDefined();
    expect(aeroSector?.exposureUsd).toBe(2115.0);

    // Evaluate concentration risk against a 10% target
    const alerts = evaluateConcentrationRisk(summary, 10.0);
    const openAiAlert = alerts.find((a) => a.ticker === 'T-OPENAI');
    expect(openAiAlert).toBeDefined();
    expect(openAiAlert?.severity).toBe('CRITICAL'); // > 30%
    expect(openAiAlert?.canFullyRebalanceWithDirectHolding).toBe(true);

    // Generate Rebalance Recommendation for T-OpenAI
    const openAiConfig: SupportedAssetConfig = {
      symbol: 'T-OpenAI',
      name: 'T-OpenAI',
      mint: 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ',
      decimals: 9,
      assetType: 'SINGLE_STOCK',
      underlyingTicker: 'T-OpenAI',
      isVerifiedMint: true,
    };
    const usdcConfig: SupportedAssetConfig = {
      symbol: 'USDC',
      name: 'USD Coin',
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      assetType: 'STABLECOIN',
      isVerifiedMint: true,
    };

    const rebalance = generateRebalanceRecommendation(
      'T-OPENAI',
      summary,
      10.0,
      usdcConfig,
      () => openAiConfig
    );

    expect(rebalance).not.toBeNull();
    expect(rebalance?.directStockToSell.symbol).toBe('T-OpenAI');
    // Excess = 8127.90 - 2000 = 6127.90
    expect(rebalance?.sellAmountUsd).toBe(6127.9);
    // Tokens to sell = 6127.9 / 812.79 = ~7.53934
    expect(rebalance?.sellAmountTokens).toBeCloseTo(6127.9 / 812.79, 4);
    expect(rebalance?.projectedNewPercentage).toBeCloseTo(10.0, 1);
  });
});
