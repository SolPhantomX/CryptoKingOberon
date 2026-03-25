// lib/core/fees.ts

export const FEE_CONFIG = {
  BINANCE_TRADING_FEE: 0.001, // 0.1%
  BINANCE_WITHDRAWAL_FEES: {
    SOL: 0.001,    // 0.001 SOL
    USDC: 0.8,     // $0.80
    USDT: 0.8,     // $0.80
  } as Record<string, number>,
  PRIORITY_FEE_SOL: 0.000005, // ~$0.00065 at $130 SOL
} as const;

export interface NetProfitCalculation {
  grossProfitUSD: number;
  tradingFeesUSD: number;
  withdrawalFeeUSD: number;
  gasFeeUSD: number;
  netProfitUSD: number;
  netProfitPercent: number;
}

export function calculateNetProfit(
  amountSOL: number,
  solPriceUSD: number,
  spreadPercent: number,
  token: keyof typeof FEE_CONFIG.BINANCE_WITHDRAWAL_FEES = 'SOL'
): NetProfitCalculation {
  const grossProfitUSD = amountSOL * solPriceUSD * (spreadPercent / 100);
  const tradingFeesUSD = amountSOL * solPriceUSD * FEE_CONFIG.BINANCE_TRADING_FEE * 2;
  const withdrawalFeeUSD = FEE_CONFIG.BINANCE_WITHDRAWAL_FEES[token] * solPriceUSD;
  const gasFeeUSD = FEE_CONFIG.PRIORITY_FEE_SOL * solPriceUSD;
  
  const netProfitUSD = grossProfitUSD - tradingFeesUSD - withdrawalFeeUSD - gasFeeUSD;
  const netProfitPercent = (netProfitUSD / (amountSOL * solPriceUSD)) * 100;
  
  return {
    grossProfitUSD,
    tradingFeesUSD,
    withdrawalFeeUSD,
    gasFeeUSD,
    netProfitUSD,
    netProfitPercent,
  };
}
