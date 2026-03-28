import { 
  ArbitrageOpportunity, 
  SwapQuote,
  JupiterQuoteParams,
  FeeBreakdown,
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
const NETWORK_FEE_SOL = 0.000005;
const DEFAULT_POOL_LIQUIDITY_USD = 1_000_000;

interface SimulatorParams {
  tokenSymbol: string;
  amountSOL: number;
  solPriceUSD: number;
  userRpcUrl?: string;
  poolLiquidityUSD?: number;
}

interface SimulationResult {
  opportunity: ArbitrageOpportunity | null;
  error?: string;
}

function calculatePriceImpactPercent(
  tradeValueUSD: number,
  poolLiquidityUSD: number = DEFAULT_POOL_LIQUIDITY_USD
): number {
  if (poolLiquidityUSD <= 0 || tradeValueUSD <= 0) return 0;
  const impact = (tradeValueUSD / (2 * poolLiquidityUSD)) * 100;
  return Math.min(impact, 5.0);
}

function solToUSD(amountSOL: number, solPriceUSD: number): number {
  if (isNaN(amountSOL) || isNaN(solPriceUSD) || solPriceUSD <= 0 || amountSOL <= 0) {
    return 0;
  }
  return amountSOL * solPriceUSD;
}

function usdToSOL(usd: number, solPriceUSD: number): number {
  if (isNaN(usd) || isNaN(solPriceUSD) || solPriceUSD <= 0 || usd <= 0) {
    return 0;
  }
  return usd / solPriceUSD;
}

function calculateFees(
  tradeValueUSD: number,
  quote: SwapQuote,
  solPriceUSD: number,
  poolLiquidityUSD?: number
): FeeBreakdown {
  const dexFeeUSD = tradeValueUSD * (DEX_FEE_PERCENT / 100);
  
  const outAmountNum = parseFloat(quote.outAmount);
  const otherAmountThresholdNum = parseFloat(quote.otherAmountThreshold);
  
  let slippageUSD = 0;
  let slippagePercent = 0;
  
  if (outAmountNum > 0 && otherAmountThresholdNum > 0) {
    slippagePercent = (outAmountNum - otherAmountThresholdNum) / outAmountNum;
    slippageUSD = tradeValueUSD * Math.max(0, Math.min(slippagePercent, 0.1));
  }
  
  const priceImpactPercent = calculatePriceImpactPercent(tradeValueUSD, poolLiquidityUSD);
  const priceImpactUSD = tradeValueUSD * (priceImpactPercent / 100);
  
  const networkFeeUSD = usdToSOL(NETWORK_FEE_SOL, solPriceUSD);
  
  const totalUSD = dexFeeUSD + slippageUSD + priceImpactUSD + networkFeeUSD;
  
  return {
    dexFeeUSD,
    slippageUSD,
    priceImpactUSD,
    networkFeeUSD,
    totalUSD,
    slippagePercent,
  } as FeeBreakdown & { slippagePercent: number };
}

export async function simulateArbitrage(
  params: SimulatorParams
): Promise<SimulationResult> {
  const {
    tokenSymbol,
    amountSOL,
    solPriceUSD,
    poolLiquidityUSD = DEFAULT_POOL_LIQUIDITY_USD,
  } = params;

  if (amountSOL <= 0 || isNaN(amountSOL)) {
    return { opportunity: null, error: 'Invalid amountSOL' };
  }

  if (solPriceUSD <= 0 || isNaN(solPriceUSD)) {
    return { opportunity: null, error: 'Invalid SOL price' };
  }

  const tokenConfig = getTokenConfig(tokenSymbol);
  if (!tokenConfig) {
    return { opportunity: null, error: `Unknown token: ${tokenSymbol}` };
  }

  const tradeValueUSD = solToUSD(amountSOL, solPriceUSD);
  
  if (tradeValueUSD <= 0) {
    return { opportunity: null, error: 'Trade value is zero or negative' };
  }

  try {
    const quoteParams: JupiterQuoteParams = {
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: amountSOL * LAMPORTS_PER_SOL,
      slippageBps: 50,
      onlyDirectRoutes: false,
      maxAccounts: 100,
    };

    const quote = await getJupiterQuote(quoteParams);
    
    const outAmountNum = parseFloat(quote.outAmount);
    const outAmountUSD = outAmountNum / 1e6;
    
    const grossProfitUSD = outAmountUSD - tradeValueUSD;
    
    const fees = calculateFees(tradeValueUSD, quote, solPriceUSD, poolLiquidityUSD);
    
    const netProfitUSD = grossProfitUSD - fees.totalUSD;
    const netProfitPercent = tradeValueUSD > 0 ? (netProfitUSD / tradeValueUSD) * 100 : 0;
    
    const minRequiredProfitUSD = getMinProfitThreshold(tokenSymbol, tradeValueUSD, fees.slippagePercent);
    const profitable = isProfitable(tokenSymbol, tradeValueUSD, netProfitUSD, fees.slippagePercent);
    
    const opportunity: ArbitrageOpportunity = {
      tokenSymbol: tokenConfig.symbol,
      tokenMint: tokenConfig.mint,
      amountSOL,
      tradeValueUSD,
      grossProfitUSD,
      netProfitUSD,
      netProfitPercent,
      fees: {
        dexFeeUSD: fees.dexFeeUSD,
        slippageUSD: fees.slippageUSD,
        priceImpactUSD: fees.priceImpactUSD,
        networkFeeUSD: fees.networkFeeUSD,
        totalUSD: fees.totalUSD,
      },
      quote: {
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        otherAmountThreshold: quote.otherAmountThreshold,
        swapMode: quote.swapMode,
        slippageBps: quote.slippageBps,
        priceImpactPct: quote.priceImpactPct,
        routePlan: quote.routePlan,
        timeTaken: quote.timeTaken,
        contextSlot: quote.contextSlot,
      },
      isProfitable: profitable,
      minRequiredProfitUSD,
      timestamp: Date.now(),
      expiresAt: Date.now() + 10000,
    };
    
    return { opportunity };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Arbitrage simulation error:', {
      tokenSymbol,
      amountSOL,
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
  return grossProfitUSD >= minRequired * 1.5;
}

export function getArbitrageSummary(opportunity: ArbitrageOpportunity): string {
  const { tokenSymbol, amountSOL, netProfitUSD, netProfitPercent, isProfitable, minRequiredProfitUSD } = opportunity;
  
  if (!isProfitable) {
    return `❌ ${tokenSymbol} arbitrage not profitable. Need >$${minRequiredProfitUSD.toFixed(2)} profit. Current: $${netProfitUSD.toFixed(2)} (${netProfitPercent.toFixed(2)}%)`;
  }
  
  return `✅ ${tokenSymbol} arbitrage: +$${netProfitUSD.toFixed(2)} (${netProfitPercent.toFixed(2)}%) on ${amountSOL} SOL`;
}
