// types/arbitrage.ts

export interface ProfitThreshold {
  minPercent: number;
  minAbsoluteUSD: number;
}

export interface TokenConfig {
  symbol: string;
  mint: string;
  name: string;
  decimals: number;           // ✅ Added - required for token amount conversion
  priceUSD?: number;          // ✅ Added - optional, can be updated dynamically
  isMemecoin: boolean;
  profitThreshold: ProfitThreshold;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  priceImpactPct: number;     // ✅ Will be used directly from quote
  routePlan: unknown[];
  timeTaken: number;
  contextSlot: number;
}

export interface ArbitrageOpportunity {
  tokenSymbol: string;
  tokenMint: string;
  amountSOL: number;
  tradeValueUSD: number;
  grossProfitUSD: number;
  netProfitUSD: number;
  netProfitPercent: number;
  fees: {
    dexFeeUSD: number;
    slippageUSD: number;
    priceImpactUSD: number;
    networkFeeUSD: number;
    totalUSD: number;
  };
  quote: SwapQuote;
  isProfitable: boolean;
  minRequiredProfitUSD: number;
  timestamp: number;
  expiresAt: number;
}

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  onlyDirectRoutes?: boolean;
  maxAccounts?: number;
}

export interface JupiterError {
  error: string;
  code?: string;
  message?: string;
}
