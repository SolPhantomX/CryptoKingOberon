// lib/core/price-engine.ts

import { fetchBinancePrice } from '../api/binance';
import { fetchJupiterPrice, QuoteResponse } from '../api/jupiter';
import { calculateNetProfit, NetProfitCalculation } from './fees';
import { checkNetworkCompatibility, NetworkCompatibility } from './network-checker';
import { assessLiquidity, LiquidityAssessment } from './liquidity-assessor';
import { calculateProfitability, getProfitabilityMessage } from './profit-calculator';

export interface ArbitrageOpportunity extends NetProfitCalculation {
  pair: string;
  binancePrice: number;
  jupiterPrice: number;
  spreadPercent: number;
  spreadUSD: number;
  networkCompatibility: NetworkCompatibility;
  liquidity: LiquidityAssessment;
  quote: QuoteResponse;
  isProfitable: boolean;
  suggestedAction: string;
  buttonEnabled: boolean;
  minProfitThresholdUSD: number; // For UI display
}

const TOKENS = {
  SOL_INPUT: 'So11111111111111111111111111111111111111112',
  USDC_OUTPUT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
} as const;

export async function getArbitrageOpportunity(
  amountSOL: number = 1
): Promise<ArbitrageOpportunity> {
  
  const [binancePrice, { price: jupiterPrice, quote }] = await Promise.all([
    fetchBinancePrice('SOLUSDT'),
    fetchJupiterPrice(TOKENS.SOL_INPUT, TOKENS.USDC_OUTPUT, amountSOL),
  ]);
  
  const spreadPercent = ((binancePrice - jupiterPrice) / jupiterPrice) * 100;
  const spreadUSD = Math.abs(binancePrice - jupiterPrice) * amountSOL;
  
  // 🔥 UNIVERSAL CALCULATION for any volume
  const profitMetrics = await calculateProfitability(amountSOL);
  
  const profitDetails = calculateNetProfit(amountSOL, binancePrice, spreadPercent, 'SOL');
  const networkCompat = checkNetworkCompatibility('SOL', 'SOL');
  const liquidity = assessLiquidity(quote, amountSOL * binancePrice);
  
  // ✅ Decision based on real metrics
  const isProfitable = profitMetrics.isProfitable(spreadUSD)
    && liquidity.level !== 'low' 
    && networkCompat.isCompatible;
  
  // ✅ Smart message for UI
  const profitMessage = await getProfitabilityMessage(amountSOL, spreadUSD);
  let suggestedAction = '';
  
  if (!networkCompat.isCompatible) {
    suggestedAction = networkCompat.warning!;
  } else if (liquidity.level === 'low') {
    suggestedAction = liquidity.message;
  } else {
    suggestedAction = profitMessage.message;
  }
  
  return {
    pair: 'SOL/USDT → USDC',
    binancePrice,
    jupiterPrice,
    spreadPercent,
    spreadUSD,
    ...profitDetails,
    networkCompatibility: networkCompat,
    liquidity,
    quote,
    isProfitable,
    suggestedAction,
    buttonEnabled: isProfitable,
    minProfitThresholdUSD: profitMetrics.minProfitableSpreadUSD,
  };
}
