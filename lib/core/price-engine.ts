// lib/core/price-engine.ts

import { fetchBinancePrice } from '../api/binance';
import { fetchJupiterPrice } from '../api/jupiter';
import { calculateNetProfit, NetProfitCalculation } from './fees';
import { checkNetworkCompatibility, NetworkCompatibility } from './network-checker';
import { assessLiquidity, LiquidityAssessment } from './liquidity-assessor';

// ← ← ← Локальный интерфейс (вместо импорта из @jup-ag/api)
export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  routePlan: Array<{
    percent: number;
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      feeAmount: string;
      feeMint: string;
    };
  }>;
  otherRouteQuotes: any[];
  slippageBps: number;
  platformFee: {
    amount: string;
    feeBps: number;
  } | null;
  timeTaken: number;
  contextSlot: number;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
}

export interface ArbitrageOpportunity extends NetProfitCalculation {
  pair: string;
  binancePrice: number;
  jupiterPrice: number;
  spreadPercent: number;
  networkCompatibility: NetworkCompatibility;
  liquidity: LiquidityAssessment;
  quote: QuoteResponse;
  isProfitable: boolean;
  suggestedAction: string;
  buttonEnabled: boolean;
}

const TOKENS = {
  SOL_INPUT: 'So11111111111111111111111111111111111111112',
  USDC_OUTPUT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
} as const;

const MIN_PROFIT_THRESHOLD_USD = 0.5;

export async function getArbitrageOpportunity(
  amountSOL: number = 1
): Promise<ArbitrageOpportunity> {
  // Fetch prices in parallel
  const [binancePrice, { price: jupiterPrice, quote }] = await Promise.all([
    fetchBinancePrice('SOLUSDT'),
    fetchJupiterPrice(TOKENS.SOL_INPUT, TOKENS.USDC_OUTPUT, amountSOL),
  ]);
  
  const spreadPercent = ((binancePrice - jupiterPrice) / jupiterPrice) * 100;
  
  // Calculate net profit
  const profitDetails = calculateNetProfit(amountSOL, binancePrice, spreadPercent, 'SOL');
  
  // Check network compatibility
  const networkCompat = checkNetworkCompatibility('SOL', 'SOL');
  
  // Assess liquidity
  const liquidity = assessLiquidity(quote, amountSOL * binancePrice);
  
  // Determine if button should be enabled
  const isProfitable = profitDetails.netProfitUSD > MIN_PROFIT_THRESHOLD_USD 
    && liquidity.level !== 'low' 
    && networkCompat.isCompatible;
  
  let suggestedAction = '';
  let buttonEnabled = false;
  
  if (!networkCompat.isCompatible) {
    suggestedAction = networkCompat.warning!;
    buttonEnabled = false;
  } else if (liquidity.level === 'low') {
    suggestedAction = liquidity.message;
    buttonEnabled = false;
  } else if (profitDetails.netProfitUSD < MIN_PROFIT_THRESHOLD_USD) {
    suggestedAction = `💤 Profit less than $${MIN_PROFIT_THRESHOLD_USD} — wait for better spread (${profitDetails.netProfitPercent.toFixed(1)}%)`;
    buttonEnabled = false;
  } else {
    suggestedAction = `💰 You earn $${profitDetails.netProfitUSD.toFixed(2)} clean!`;
    buttonEnabled = true;
  }
  
  return {
    pair: 'SOL/USDT → USDC',
    binancePrice,
    jupiterPrice,
    spreadPercent,
    ...profitDetails,
    networkCompatibility: networkCompat,
    liquidity,
    quote,
    isProfitable,
    suggestedAction,
    buttonEnabled,
  };
}
