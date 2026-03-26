// lib/core/config-service.ts

export interface FeeConfig {
  solPriceUSD: number;
  dexFeePercent: number;
  cexFeePercent: number;
  networkFeeUSD: number;
  withdrawalFeeSOL: number;
  estimatedSlippagePercent: number;
  priceImpactPer1kUSD: number;
  lastUpdated: number;
  ttlMs: number;
}

export interface FeeSource {
  fetch(): Promise<Partial<FeeConfig>>;
  priority: number;
}

// ===== DATA SOURCES =====

export class PriceSource implements FeeSource {
  priority = 10;
  
  async fetch(): Promise<Partial<FeeConfig>> {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        { next: { revalidate: 10 } }
      );
      const data = await response.json();
      return { solPriceUSD: data.solana.usd };
    } catch (e) {
      console.warn('PriceSource failed, using fallback');
      return { solPriceUSD: 87.60 };
    }
  }
}

export class BinanceFeeSource implements FeeSource {
  priority = 8;
  
  async fetch(): Promise<Partial<FeeConfig>> {
    try {
      const response = await fetch(
        'https://api.binance.com/api/v3/tradeFee?symbol=SOLUSDT',
        { headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY || '' } }
      );
      if (response.ok) {
        const [fee] = await response.json();
        return {
          cexFeePercent: parseFloat(fee.makerCommission) / 100,
          withdrawalFeeSOL: 0.0005,
        };
      }
    } catch (e) {
      console.warn('BinanceFeeSource failed');
    }
    return { cexFeePercent: 0.001, withdrawalFeeSOL: 0.0005 };
  }
}

export class SolanaFeeSource implements FeeSource {
  priority = 7;
  private rpcUrl: string;
  
  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }
  
  async fetch(): Promise<Partial<FeeConfig>> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getRecentPrioritizationFees',
          params: [[]],
        }),
      });
      const data = await response.json();
      const fees = data.result as Array<{ prioritizationFee: number }>;
      
      const medianFeeLamports = fees.length > 0 
        ? fees.sort((a, b) => a.prioritizationFee - b.prioritizationFee)[Math.floor(fees.length / 2)].prioritizationFee
        : 5000;
        
      const priceSource = new PriceSource();
      const solPrice = await priceSource.fetch();
      const networkFeeUSD = (medianFeeLamports / 1e9) * (solPrice.solPriceUSD || 87.60);
      
      return { networkFeeUSD };
    } catch (e) {
      console.warn('SolanaFeeSource failed');
      return { networkFeeUSD: 0.001 };
    }
  }
}

export class JupiterSlippageSource implements FeeSource {
  priority = 5;
  
  async fetch(): Promise<Partial<FeeConfig>> {
    return { estimatedSlippagePercent: 0.005 };
  }
}

// ===== SERVICE =====

export class DynamicFeeMonitor {
  private sources: FeeSource[];
  private cache: FeeConfig | null = null;
  private defaultConfig: FeeConfig = {
    solPriceUSD: 87.60,
    dexFeePercent: 0.003,
    cexFeePercent: 0.001,
    networkFeeUSD: 0.001,
    withdrawalFeeSOL: 0.0005,
    estimatedSlippagePercent: 0.005,
    priceImpactPer1kUSD: 0.0002,
    lastUpdated: 0,
    ttlMs: 10_000,
  };

  constructor(sources: FeeSource[] = []) {
    this.sources = [
      new PriceSource(),
      new BinanceFeeSource(),
      new SolanaFeeSource(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'),
      new JupiterSlippageSource(),
      ...sources,
    ].sort((a, b) => b.priority - a.priority);
  }

  async getConfig(forceRefresh = false): Promise<FeeConfig> {
    const now = Date.now();
    
    if (!forceRefresh && this.cache && (now - this.cache.lastUpdated) < this.cache.ttlMs) {
      return this.cache;
    }

    const results = await Promise.allSettled(
      this.sources.map(src => src.fetch())
    );

    const merged: Partial<FeeConfig> = {};
    for (let i = this.sources.length - 1; i >= 0; i--) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        Object.assign(merged, result.value);
      }
    }

    const config: FeeConfig = {
      ...this.defaultConfig,
      ...merged,
      lastUpdated: now,
    };

    this.cache = config;
    return config;
  }

  async getSolPrice(): Promise<number> {
    const config = await this.getConfig();
    return config.solPriceUSD;
  }
}

export const feeMonitor = new DynamicFeeMonitor();
