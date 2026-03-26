// hooks/useArbitrage.ts

import useSWR from 'swr';
import { getArbitrageOpportunity, ArbitrageOpportunity } from '../lib/core/price-engine';

const isValidAmount = (amount: number): boolean => {
  return !isNaN(amount) && amount > 0 && amount <= 10000; // Max 10,000 SOL
};

const fetcher = async ([_, amount]: [string, number]): Promise<ArbitrageOpportunity | null> => {
  try {
    const result = await getArbitrageOpportunity(amount);
    
    // Validate result structure
    if (!result || typeof result !== 'object') {
      console.error('Invalid arbitrage opportunity data:', result);
      return null;
    }
    
    return result;
  } catch (error) {
    // Log with context for debugging
    console.error('Arbitrage fetcher error:', {
      amount,
      error: error instanceof Error ? error.message : String(error),
    });
    
    // Re-throw for SWR to handle
    throw error;
  }
};

interface UseArbitrageReturn {
  data: ArbitrageOpportunity | null;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  mutate: () => void;
  isError: boolean;
}

export function useArbitrage(amountSOL: number = 1): UseArbitrageReturn {
  // Validate input
  if (!isValidAmount(amountSOL)) {
    console.warn(`Invalid amountSOL: ${amountSOL}. Using default 1 SOL.`);
    amountSOL = 1;
  }
  
  const { 
    data, 
    error, 
    isLoading, 
    mutate, 
    isValidating 
  } = useSWR(
    ['arbitrage', amountSOL],
    fetcher,
    {
      refreshInterval: 10000,          // 10 seconds (increased from 7s)
      revalidateOnFocus: false,        // Disabled to reduce load
      revalidateOnReconnect: true,
      dedupingInterval: 5000,          // 5 seconds (increased from 2s)
      errorRetryCount: 2,              // Reduced from 3
      errorRetryInterval: 10000,       // 10 seconds between retries
      shouldRetryOnError: (error) => {
        // Only retry on network errors or 5xx, not on 4xx
        if (error instanceof Error) {
          return error.message.includes('fetch') || 
                 error.message.includes('network') ||
                 error.message.includes('503') ||
                 error.message.includes('504');
        }
        return false;
      },
      onError: (err, key, config) => {
        // Centralized error logging
        console.error('SWR error:', {
          key,
          error: err instanceof Error ? err.message : String(err),
          amount: amountSOL,
        });
      },
      // Prevent race conditions by comparing old and new data
      compare: (a, b) => {
        if (!a || !b) return a === b;
        return a.profitPercent === b.profitPercent && a.timestamp === b.timestamp;
      },
    }
  );
  
  return {
    data: data || null,
    error: error || null,
    isLoading,
    isValidating,
    mutate,
    isError: !!error,
  };
}
