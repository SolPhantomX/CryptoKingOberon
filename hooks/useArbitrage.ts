import useSWR from 'swr';
import { getArbitrageOpportunity, ArbitrageOpportunity } from '../lib/core/price-engine';

const fetcher = async (amount: number): Promise<ArbitrageOpportunity> => {
  return await getArbitrageOpportunity(amount);
};

export function useArbitrage(amountSOL: number = 1) {
  const { data, error, isLoading, mutate } = useSWR(
    ['arbitrage', amountSOL],
    () => fetcher(amountSOL),
    {
      refreshInterval: 7000,        // Update every 7 seconds
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );
  
  return {
    data,
    error,
    isLoading,
    mutate,
  };
}
