// lib/core/arbitrage-simulator.ts

import { 
  ArbitrageOpportunity, 
  SwapQuote,
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
const LAMPORTS_PER_SOL = 1_000_000_000;

const DEX_FEE_PERCENT = 0.25;
const NETWORK_FEE_SOL = 0.000015;
const ARBITRAGE_EXPIRY_MS = 10000;
const QUOTE_TIMEOUT_MS = 15000;

interface SimulatorParams {
  tokenSymbol: string;
  amountSOL: number;
  solPriceUSD: number;
  userRpcUrl?: string;
  abortSignal?: AbortSignal;
}

interface FeeBreakdown {
  dexFeeUSD: number;
  slippageUSD: number;
  priceImpactUSD: number;
  networkFeeUSD: number;
  totalUSD: number;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

function validateQuoteResponse(quote: unknown): quote is SwapQuote {
  if (!quote || typeof quote !== 'object') return false;
  
  const q = quote as Record<string, unknown>;
  
  if (typeof q.outAmount !== 'string') return false;
  if (typeof q.inAmount !== 'string') return false;
  if (typeof q.inputMint !== 'string') return false;
  if (typeof q.outputMint !== 'string') return false;
  if (typeof q.swapMode !== 'string') return false;
  if (typeof q.slippageBps !== 'number') return false;
  if (typeof q.priceImpactPct !== 'number') return false;
  if (typeof q.otherAmountThreshold !== 'string') return false;
  
  return true;
}

function calculateSlippageUSD(
  expectedOutAmount: string,
  minOutAmount: string,
  tradeValueUSD: number
): number {
  const expected = parseFloat(expectedOutAmount);
  const min = parseFloat(minOutAmount);
  
  if (expected <= 0 || min <= 0) return 0;
  
  const slippagePercent = (expected - min) / expected;
  const cappedSlippage = Math.min(Math.max(slippagePercent, -0.1), 0.1);
  
  return tradeValueUSD * cappedSlippage;
}

function calculateFees(
  tradeValueUSD: number,
  quote: SwapQuote,
  solPriceUSD: number
): FeeBreakdown {
  const dexFeeUSD = tradeValueUSD * (DEX_FEE_PERCENT / 100);
  
  const slippageUSD = calculateSlippageUSD(
    quote.outAmount,
    quote.otherAmountThreshold,
    tradeValueUSD
  );
  
  // Use actual price impact from Jupiter quote
  const priceImpactUSD = tradeValueUSD * (quote.priceImpactPct / 100);
  
  const networkFeeUSD = NETWORK_FEE_SOL * solPriceUSD;
  
  const totalUSD = dexFeeUSD + slippageUSD + priceImpactUSD + networkFeeUSD;
  
  return {
    dexFeeUSD,
    slippageUSD,
    priceImpactUSD,
    networkFeeUSD,
    totalUSD,
  };
}

async function fetchQuoteWithTimeout(
  params: JupiterQuoteParams,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<SwapQuote> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const quote = await getJupiterQuote(params, {
      signal: abortSignal || controller.signal,
    });
    
    if (!validateQuoteResponse(quote)) {
      throw new Error('Invalid or malformed quote response from Jupiter API');
    }
    
    return quote;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function simulateArbitrage(
  params: SimulatorParams
): Promise<{ opportunity: ArbitrageOpportunity | null; error?: string }> {
  try {
    const {
      tokenSymbol,
      amountSOL,
      solPriceUSD,
      abortSignal,
    } = params;

    // Validate inputs
    if (!isValidNumber(amountSOL) || amountSOL <= 0) {
      return { opportunity: null, error: 'Invalid amountSOL: must be a positive number' };
    }

    if (!isValidNumber(solPriceUSD) || solPriceUSD <= 0) {
      return { opportunity: null, error: 'Invalid SOL price: must be a positive number' };
    }

    const tokenConfig = getTokenConfig(tokenSymbol);
    if (!tokenConfig) {
      return { opportunity: null, error: `Unknown token: ${tokenSymbol}` };
    }

    const tradeValueUSD = amountSOL * solPriceUSD;
    
    if (tradeValueUSD <= 0) {
      return { opportunity: null, error: 'Trade value is zero or negative' };
    }

    // Fetch quote for SOL -> Token
    const quoteParams: JupiterQuoteParams = {
      inputMint: SOL_MINT,
      outputMint: tokenConfig.mint,
      amount: Math.floor(amountSOL * LAMPORTS_PER_SOL),
      slippageBps: 50,
      onlyDirectRoutes: false,
      maxAccounts: 100,
    };

    const quote = await fetchQuoteWithTimeout(quoteParams, QUOTE_TIMEOUT_MS, abortSignal);
    
    // Calculate gross profit in SOL first, then convert to USD
    // This avoids needing token price or decimals
    const outAmountNum = parseFloat(quote.outAmount);
    const outAmountSOL = outAmountNum / LAMPORTS_PER_SOL;
    const grossProfitSOL = outAmountSOL - amountSOL;
    const grossProfitUSD = grossProfitSOL * solPriceUSD;
    
    const fees = calculateFees(tradeValueUSD, quote, solPriceUSD);
    
    const netProfitUSD = grossProfitUSD - fees.totalUSD;
    const netProfitPercent = tradeValueUSD > 0 ? (netProfitUSD / tradeValueUSD) * 100 : 0;
    
    const minRequiredProfitUSD = getMinProfitThreshold(tokenSymbol, tradeValueUSD);
    const profitable = isProfitable(tokenSymbol, tradeValueUSD, netProfitUSD);
    
    const opportunity: ArbitrageOpportunity = {
      tokenSymbol: tokenConfig.symbol,
      tokenMint: tokenConfig.mint,
      amountSOL: Number(amountSOL.toFixed(6)),
      tradeValueUSD: Number(tradeValueUSD.toFixed(2)),
      grossProfitUSD: Number(grossProfitUSD.toFixed(2)),
      netProfitUSD: Number(netProfitUSD.toFixed(2)),
      netProfitPercent: Number(netProfitPercent.toFixed(2)),
      fees: {
        dexFeeUSD: Number(fees.dexFeeUSD.toFixed(2)),
        slippageUSD: Number(fees.slippageUSD.toFixed(2)),
        priceImpactUSD: Number(fees.priceImpactUSD.toFixed(2)),
        networkFeeUSD: Number(fees.networkFeeUSD.toFixed(4)),
        totalUSD: Number(fees.totalUSD.toFixed(2)),
      },
      quote,
      isProfitable: profitable,
      minRequiredProfitUSD: Number(minRequiredProfitUSD.toFixed(2)),
      timestamp: Date.now(),
      expiresAt: Date.now() + ARBITRAGE_EXPIRY_MS,
    };
    
    return { opportunity };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Arbitrage simulation error:', {
      tokenSymbol: params.tokenSymbol,
      amountSOL: params.amountSOL,
      error: errorMessage,
    });
    return { opportunity: null, error: errorMessage };
  }
}

export function hasArbitragePotential(
  tokenSymbol: string,
  tradeValueUSD: number,
  grossProfitUSD: number
): boolean {
  if (tradeValueUSD <= 0) return false;
  
  const minRequired = getMinProfitThreshold(tokenSymbol, tradeValueUSD);
  if (!isValidNumber(minRequired) || !isFinite(minRequired)) {
    return false;
  }
  
  return grossProfitUSD >= minRequired * 1.5;
}

export function getArbitrageSummary(opportunity: ArbitrageOpportunity): string {
  const { tokenSymbol, amountSOL, netProfitUSD, netProfitPercent, isProfitable, minRequiredProfitUSD } = opportunity;
  
  if (!isProfitable) {
    return `❌ ${tokenSymbol} arbitrage not profitable. Need >$${minRequiredProfitUSD.toFixed(2)} profit. Current: $${netProfitUSD.toFixed(2)} (${netProfitPercent.toFixed(2)}%)`;
  }
  
  return `✅ ${tokenSymbol} arbitrage: +$${netProfitUSD.toFixed(2)} (${netProfitPercent.toFixed(2)}%) on ${amountSOL} SOL`;
}
