// lib/core/profit-calculator.ts

import { FeeConfig, feeMonitor } from './config-service';

export interface ProfitConfig {
  profitMargin?: number;        // 0.2 = 20% above break-even
  customSlippage?: number;      // Override estimated slippage
}

export interface ProfitBreakdown {
  tradeValueUSD: number;
  fixedCostsUSD: number;
  variableCostsUSD: number;
  totalCostsUSD: number;
  minProfitableSpreadUSD: number;
  minProfitableSpreadPercent: number;
  netProfitUSD: (spreadUSD: number) => number;
  isProfitable: (spreadUSD: number) => boolean;
  feeBreakdown: {
    dexFee: number;
    cexFee: number;
    slippage: number;
    networkFee: number;
    withdrawalFee: number;
    priceImpact: number;
  };
}

/**
 * Calculates profitability with REAL-TIME fees
 */
export async function calculateProfitability(
  amountSOL: number,
  customConfig?: ProfitConfig
): Promise<ProfitBreakdown> {
  // 🔥 Get real-time fees from monitor
  const feeConfig = await feeMonitor.getConfig();
  
  const {
    profitMargin = 0.2,
    customSlippage,
  } = customConfig || {};

  // ===== FIXED COSTS =====
  const fixedCostsUSD = 
    feeConfig.networkFeeUSD + 
    (feeConfig.withdrawalFeeSOL * feeConfig.solPriceUSD) + 
    0.15; // volatility buffer

  // ===== VARIABLE COSTS =====
  const tradeValueUSD = amountSOL * feeConfig.solPriceUSD;
  
  const slippagePercent = customSlippage ?? feeConfig.estimatedSlippagePercent;
  
  const variableCostPercent = 
    feeConfig.dexFeePercent + 
    feeConfig.cexFeePercent + 
    slippagePercent + 
    (slippagePercent * 0.6); // exit slippage

  // ===== PRICE IMPACT (dynamic) =====
  const priceImpactPercent = Math.min(
    feeConfig.priceImpactPer1kUSD * (tradeValueUSD / 1000),
    0.03 // cap at 3%
  );

  const variableCostsUSD = tradeValueUSD * (variableCostPercent + priceImpactPercent);
  const totalCostsUSD = fixedCostsUSD + variableCostsUSD;
  
  const minProfitableSpreadUSD = totalCostsUSD * (1 + profitMargin);
  const minProfitableSpreadPercent = (minProfitableSpreadUSD / tradeValueUSD) * 100;

  return {
    tradeValueUSD,
    fixedCostsUSD,
    variableCostsUSD,
    totalCostsUSD,
    minProfitableSpreadUSD,
    minProfitableSpreadPercent,
    netProfitUSD: (spreadUSD: number) => spreadUSD - totalCostsUSD,
    isProfitable: (spreadUSD: number) => spreadUSD > minProfitableSpreadUSD,
    feeBreakdown: {
      dexFee: tradeValueUSD * feeConfig.dexFeePercent,
      cexFee: tradeValueUSD * feeConfig.cexFeePercent,
      slippage: tradeValueUSD * slippagePercent,
      networkFee: feeConfig.networkFeeUSD,
      withdrawalFee: feeConfig.withdrawalFeeSOL * feeConfig.solPriceUSD,
      priceImpact: tradeValueUSD * priceImpactPercent,
    },
  };
}

/**
 * Quick check: is this arbitrage opportunity profitable?
 */
export async function isArbitrageProfitable(
  amountSOL: number,
  spreadUSD: number,
  customConfig?: ProfitConfig
): Promise<boolean> {
  const metrics = await calculateProfitability(amountSOL, customConfig);
  return metrics.isProfitable(spreadUSD);
}

/**
 * Get human-readable message for UI
 */
export async function getProfitabilityMessage(
  amountSOL: number,
  spreadUSD: number,
  customConfig?: ProfitConfig
): Promise<{ status: 'profitable' | 'break-even' | 'loss'; message: string }> {
  const metrics = await calculateProfitability(amountSOL, customConfig);
  const net = metrics.netProfitUSD(spreadUSD);
  
  if (net > 0) {
    return {
      status: 'profitable',
      message: `✅ +$${net.toFixed(2)} net profit`,
    };
  } else if (net > -0.1) {
    return {
      status: 'break-even',
      message: `⚖️ Break-even (fees: $${metrics.totalCostsUSD.toFixed(2)})`,
    };
  } else {
    return {
      status: 'loss',
      message: `❌ -$${Math.abs(net).toFixed(2)} loss (need >$${metrics.minProfitableSpreadUSD.toFixed(2)})`,
    };
  }
}
