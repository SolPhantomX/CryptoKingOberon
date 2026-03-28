import { TokenConfig, ProfitThreshold } from '@/types/arbitrage';

export const TOKEN_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  POPCAT: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
};

export const PROFIT_THRESHOLDS: Record<string, ProfitThreshold> = {
  SOL: { minPercent: 1.4, minAbsoluteUSD: 1.20 },
  MEMECOIN: { minPercent: 2.7, minAbsoluteUSD: 1.80 },
  DEFAULT: { minPercent: 3.0, minAbsoluteUSD: 2.00 },
};

export const TOKEN_CONFIGS: Record<string, TokenConfig> = {
  SOL: {
    symbol: 'SOL',
    mint: TOKEN_MINTS.SOL,
    name: 'Solana',
    isMemecoin: false,
    profitThreshold: PROFIT_THRESHOLDS.SOL,
  },
  BONK: {
    symbol: 'BONK',
    mint: TOKEN_MINTS.BONK,
    name: 'Bonk',
    isMemecoin: true,
    profitThreshold: PROFIT_THRESHOLDS.MEMECOIN,
  },
  WIF: {
    symbol: 'WIF',
    mint: TOKEN_MINTS.WIF,
    name: 'dogwifhat',
    isMemecoin: true,
    profitThreshold: PROFIT_THRESHOLDS.MEMECOIN,
  },
  POPCAT: {
    symbol: 'POPCAT',
    mint: TOKEN_MINTS.POPCAT,
    name: 'Popcat',
    isMemecoin: true,
    profitThreshold: PROFIT_THRESHOLDS.MEMECOIN,
  },
  JUP: {
    symbol: 'JUP',
    mint: TOKEN_MINTS.JUP,
    name: 'Jupiter',
    isMemecoin: false,
    profitThreshold: PROFIT_THRESHOLDS.DEFAULT,
  },
  RAY: {
    symbol: 'RAY',
    mint: TOKEN_MINTS.RAY,
    name: 'Raydium',
    isMemecoin: false,
    profitThreshold: PROFIT_THRESHOLDS.DEFAULT,
  },
};

const configByMintCache = new Map<string, TokenConfig | undefined>();

export function getTokenConfig(symbol: string): TokenConfig | undefined {
  const upperSymbol = symbol.toUpperCase();
  return TOKEN_CONFIGS[upperSymbol];
}

export function getTokenConfigByMint(mint: string): TokenConfig | undefined {
  if (configByMintCache.has(mint)) {
    return configByMintCache.get(mint);
  }
  
  const config = Object.values(TOKEN_CONFIGS).find(cfg => cfg.mint === mint);
  configByMintCache.set(mint, config);
  return config;
}

export function getProfitThresholdWithDynamicSlippage(
  tokenSymbol: string,
  tradeValueUSD: number,
  slippagePercent?: number
): { minRequiredUSD: number; effectivePercent: number } {
  const config = getTokenConfig(tokenSymbol);
  const threshold = config?.profitThreshold || PROFIT_THRESHOLDS.DEFAULT;
  
  const baseMinByPercent = tradeValueUSD * (threshold.minPercent / 100);
  const baseMinRequired = Math.max(baseMinByPercent, threshold.minAbsoluteUSD);
  
  if (slippagePercent && slippagePercent > 0) {
    const slippageCost = tradeValueUSD * (slippagePercent / 100);
    const adjustedMinRequired = baseMinRequired + slippageCost;
    
    return {
      minRequiredUSD: adjustedMinRequired,
      effectivePercent: (adjustedMinRequired / tradeValueUSD) * 100,
    };
  }
  
  return {
    minRequiredUSD: baseMinRequired,
    effectivePercent: (baseMinRequired / tradeValueUSD) * 100,
  };
}

export function getMinProfitThreshold(
  tokenSymbol: string,
  tradeValueUSD: number,
  slippagePercent?: number
): number {
  if (tradeValueUSD <= 0 || isNaN(tradeValueUSD)) {
    return 0;
  }
  
  return getProfitThresholdWithDynamicSlippage(tokenSymbol, tradeValueUSD, slippagePercent).minRequiredUSD;
}

export function isProfitable(
  tokenSymbol: string,
  tradeValueUSD: number,
  netProfitUSD: number,
  slippagePercent?: number
): boolean {
  if (tradeValueUSD <= 0 || netProfitUSD <= 0) return false;
  const minRequired = getMinProfitThreshold(tokenSymbol, tradeValueUSD, slippagePercent);
  return netProfitUSD >= minRequired;
}

export function getProfitThreshold(tokenSymbol: string): ProfitThreshold {
  const config = getTokenConfig(tokenSymbol);
  if (!config) {
    return PROFIT_THRESHOLDS.DEFAULT;
  }
  return config.profitThreshold;
}

export function getDynamicThresholdDescription(
  tokenSymbol: string,
  tradeValueUSD: number,
  slippagePercent?: number
): { minUSD: number; minPercent: number; description: string } {
  if (tradeValueUSD <= 0 || isNaN(tradeValueUSD)) {
    return {
      minUSD: 0,
      minPercent: 0,
      description: 'Need >0% (min $0)',
    };
  }
  
  const result = getProfitThresholdWithDynamicSlippage(tokenSymbol, tradeValueUSD, slippagePercent);
  
  return {
    minUSD: result.minRequiredUSD,
    minPercent: result.effectivePercent,
    description: `Need >${result.effectivePercent.toFixed(1)}% (min $${result.minRequiredUSD.toFixed(2)})${slippagePercent ? ` + ${slippagePercent.toFixed(1)}% slippage` : ''}`,
  };
}
