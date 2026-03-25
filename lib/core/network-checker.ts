// lib/core/network-checker.ts

export interface NetworkCompatibility {
  isCompatible: boolean;
  availableNetworks: string[];
  warning?: string;
}

const BINANCE_NETWORKS: Record<string, string[]> = {
  SOL: ['SOL', 'BEP20'],
  USDC: ['SOL', 'BEP20', 'ERC20'],
  USDT: ['SOL', 'BEP20', 'TRC20', 'ERC20'],
};

export function checkNetworkCompatibility(
  token: string,
  targetNetwork: string = 'SOL'
): NetworkCompatibility {
  const networks = BINANCE_NETWORKS[token] || ['SOL'];
  const isCompatible = networks.includes(targetNetwork);
  
  return {
    isCompatible,
    availableNetworks: networks,
    warning: isCompatible 
      ? undefined 
      : `⚠️ ${token} withdrawal on ${targetNetwork} is currently unavailable on Binance`,
  };
}
