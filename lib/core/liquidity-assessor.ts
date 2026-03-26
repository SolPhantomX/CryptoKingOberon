// lib/core/liquidity-assessor.ts

import { QuoteResponse } from '../api/jupiter';  // ✅ Import from jupiter.ts!

export interface LiquidityAssessment {
  level: 'excellent' | 'good' | 'medium' | 'low';
  maxSafeAmountUSD: number;
  message: string;
}

export function assessLiquidity(quote: QuoteResponse, userAmountUSD: number): LiquidityAssessment {
  // Handle optional slippageBps field with fallback
  const slippagePercent = (quote.slippageBps ?? 50) / 100;
  
  if (slippagePercent < 0.3 && userAmountUSD < 5000) {
    return {
      level: 'excellent',
      maxSafeAmountUSD: 10000,
      message: '✅ Excellent liquidity — up to $10,000 safe',
    };
  }
  
  if (slippagePercent < 1 && userAmountUSD < 2000) {
    return {
      level: 'good',
      maxSafeAmountUSD: 5000,
      message: '👍 Good liquidity — up to $5,000 recommended',
    };
  }
  
  if (slippagePercent < 2 && userAmountUSD < 500) {
    return {
      level: 'medium',
      maxSafeAmountUSD: 1000,
      message: '⚠️ Medium liquidity — better to stay under $1,000',
    };
  }
  
  return {
    level: 'low',
    maxSafeAmountUSD: 100,
    message: '🔴 Low liquidity — high slippage risk, better avoid',
  };
}
