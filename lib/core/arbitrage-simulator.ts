// lib/core/arbitrage-simulator.ts

import { 
  ArbitrageOpportunity, 
  JupiterQuoteParams,
} from '@/types/arbitrage';

import { getJupiterQuote } from '@/lib/api/jupiter';
import { 
  getTokenConfig, 
  isProfitable, 
  getMinProfitThreshold,
  TOKEN_MINTS,
} from './profit-calculator';

const SOL_MINT = TOKEN_MINTS.SOL;
const USDC_MINT = TOKEN_MINTS.USDC;
const LAMPORTS_PER_SOL = 1_000_000_000;

const DEX_FEE_PERCENT = 0.25;
const NETWORK_FEE_SOL = 0.000015;

export async function simulateArbitrage(
  params: {
    tokenSymbol: string;
    amountSOL: number;
    solPriceUSD: number;
  }
): Promise<{ opportunity: ArbitrageOpportunity | null; error?: string }> {
  const { tokenSymbol, amountSOL, solPriceUSD } = params;

  if (amountSOL <= 0.05) {
    return { opportunity: null, error: 'Minimum amount is 0.05 SOL' };
  }

  const tokenConfig = getTokenConfig(tokenSymbol);
  if (!tokenConfig) {
    return { opportunity: null, error: `Unknown token: ${tokenSymbol}` };
  }

  const tradeValueUSD = amountSOL * solPriceUSD;

  try {
    const quoteParams: JupiterQuoteParams = {
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: Math.floor(amountSOL * LAMPORTS_PER_SOL),
      slippageBps: 50,
    };

    const quote = await getJupiterQuote(quoteParams);
    if (!quote) {
      return { opportunity: null, error: 'Failed to get Jupiter quote' };
    }

    const outAmountUSDC = Number(quote.outAmount) / 1_000_000;

    const grossProfitUSD = outAmountUSDC - tradeValueUSD;

    const dexFeeUSD = tradeValueUSD * (DEX_FEE_PERCENT / 100);
    const slippageUSD = tradeValueUSD * 0.005;
    const priceImpactUSD = tradeValueUSD * 0.005;
    const networkFeeUSD = NETWORK_FEE_SOL * solPriceUSD;

    const totalFeesUSD = dexFeeUSD + slippageUSD + priceImpactUSD + networkFeeUSD + 0.25;

    const netProfitUSD = grossProfitUSD - totalFeesUSD;
    const netProfitPercent = (netProfitUSD / tradeValueUSD) * 100;

    const minRequired = getMinProfitThreshold(tokenSymbol, tradeValueUSD);
    const profitable = isProfitable(tokenSymbol, tradeValueUSD, netProfitUSD);

    const opportunity: ArbitrageOpportunity = {
      tokenSymbol: tokenConfig.symbol,
      tokenMint: tokenConfig.mint,
      amountSOL,
      tradeValueUSD,
      netProfitUSD,
      netProfitPercent,
      minRequiredProfitUSD: minRequired,
      isProfitable: profitable,
      timestamp: Date.now(),
    };

    return { opportunity };

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Simulation error:', msg);
    return { opportunity: null, error: msg };
  }
}

export function getArbitrageSummary(opportunity: ArbitrageOpportunity): string {
  const { tokenSymbol, amountSOL, netProfitUSD, netProfitPercent, isProfitable, minRequiredProfitUSD } = opportunity;

  if (!isProfitable) {
    return `❌ ${tokenSymbol} not profitable. Need >$${minRequiredProfitUSD.toFixed(2)}. Current: $${netProfitUSD.toFixed(2)} (${netProfitPercent.toFixed(2)}%)`;
  }

  return `✅ ${tokenSymbol} arbitrage: +$${netProfitUSD.toFixed(2)} (${netProfitPercent.toFixed(2)}%) on ${amountSOL} SOL`;
}
