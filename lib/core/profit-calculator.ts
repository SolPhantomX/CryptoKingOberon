// lib/core/profit-calculator.ts

export interface ProfitConfig {
  profitMargin?: number;
  customSlippage?: number;
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

export async function calculateProfitability(
  amountSOL: number,
  solPriceUSD: number,
  customConfig?: ProfitConfig
): Promise<ProfitBreakdown> {
  const {
    profitMargin = 0.2,
    customSlippage,
  } = customConfig || {};

  const slippagePercent = customSlippage ?? 0.005;
  
  const fixedCostsUSD = 0.195; // network + withdrawal + buffer
  
  const tradeValueUSD = amountSOL * solPriceUSD;
  
  const variableCostPercent = 
    0.003 +  // DEX fee
    0.001 +  // CEX fee
    slippagePercent + 
    (slippagePercent * 0.6); // exit slippage

  const priceImpactPercent = Math.min(
    0.0002 * (tradeValueUSD / 1000),
    0.03
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
      dexFee: tradeValueUSD * 0.003,
      cexFee: tradeValueUSD * 0.001,
      slippage: tradeValueUSD * slippagePercent,
      networkFee: 0.001,
      withdrawalFee: 0.044,
      priceImpact: tradeValueUSD * priceImpactPercent,
    },
  };
}

export async function getProfitabilityMessage(
  amountSOL: number,
  solPriceUSD: number,
  spreadUSD: number,
  customConfig?: ProfitConfig
): Promise<{ status: 'profitable' | 'break-even' | 'loss'; message: string }> {
  const metrics = await calculateProfitability(amountSOL, solPriceUSD, customConfig);
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
