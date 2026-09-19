import { ETFConstituentData } from '@/types';
import spyData from '../../../public/data/etf-constituents/spy.json';
import qqqData from '../../../public/data/etf-constituents/qqq.json';

/**
 * OFF-CHAIN ETF TRADFI CONSTITUENT REGISTRY
 * 
 * Rules Adherence:
 * - Rule 2: Clearly separate on-chain token balances from off-chain TradFi constituent data.
 * - Sourced from regulatory disclosures with timestamped provenance.
 */

const ETF_REGISTRY: Record<string, ETFConstituentData> = {
  SPY: spyData as ETFConstituentData,
  QQQ: qqqData as ETFConstituentData,
};

export function getETFConstituentData(etfTicker: string): ETFConstituentData | undefined {
  return ETF_REGISTRY[etfTicker.toUpperCase()];
}

export function getAllSupportedETFs(): ETFConstituentData[] {
  return Object.values(ETF_REGISTRY);
}

export function isSupportedETF(etfTicker: string): boolean {
  return etfTicker.toUpperCase() in ETF_REGISTRY;
}
