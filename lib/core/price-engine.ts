// lib/core/price-engine.ts

import { fetchBinancePrice } from '../api/binance';
import { fetchJupiterPrice, QuoteResponse } from '../api/jupiter';  // ✅ Import from jupiter
import { calculateNetProfit, NetProfitCalculation } from './fees';
import { checkNetworkCompatibility, NetworkCompatibility } from './network-checker';
import { assessLiquidity, LiquidityAssessment } from './liquidity-assessor';

// No need to redefine QuoteResponse - import it from jupiter.ts!

export interface ArbitrageOpportunity extends NetProfitCalculation {
  pair: string;
  binancePrice: number;
  jupiterPrice: number;
  spreadPercent: number;
  networkCompatibility: NetworkCompatibility;
  liquidity: LiquidityAssessment;
  quote: QuoteResponse;  // ✅ Use imported type
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
  const [binancePrice, { price: jupiterPrice, quote }] = await Promise.all([
    fetchBinancePrice('SOLUSDT'),
    fetchJupiterPrice(TOKENS.SOL_INPUT, TOKENS.USDC_OUTPUT, amountSOL),
  ]);
  
  const spreadPercent = ((binancePrice - jupiterPrice) / jupiterPrice) * 100;
  
  const profitDetails = calculateNetProfit(amountSOL, binancePrice, spreadPercent, 'SOL');
  const networkCompat = checkNetworkCompatibility('SOL', 'SOL');
  const liquidity = assessLiquidity(quote, amountSOL * binancePrice);
  
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
