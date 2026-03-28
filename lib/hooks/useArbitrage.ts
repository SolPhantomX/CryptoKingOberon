import useSWR from 'swr';
import { useConnection } from '@solana/wallet-adapter-react';
import { simulateArbitrage, getArbitrageSummary } from '@/lib/core/arbitrage-simulator';
import { ArbitrageOpportunity } from '@/types/arbitrage';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const DEFAULT_SOL_PRICE = 89.00;
const DEFAULT_AMOUNT_SOL = 1.0;

interface UseArbitrageParams {
  tokenSymbol: string;
  amountSOL?: number;
  refreshInterval?: number;
  userRpcUrl?: string;
}

interface UseArbitrageReturn {
  data: ArbitrageOpportunity | null;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  mutate: () => void;
  summary: string;
  refresh: () => void;
}

async function fetchSolPrice(): Promise<number> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch('/api/binance?symbol=SOLUSDT', { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch SOL price: ${response.status}`);
    }
    const data = await response.json();
    const price = parseFloat(data.price);
    if (isNaN(price) || price <= 0) {
      return DEFAULT_SOL_PRICE;
    }
    return price;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Error fetching SOL price:', error);
    return DEFAULT_SOL_PRICE;
  }
}

export function useArbitrage({
  tokenSymbol,
  amountSOL = DEFAULT_AMOUNT_SOL,
  refreshInterval = 15000,
  userRpcUrl,
}: UseArbitrageParams): UseArbitrageReturn {
  const { connection } = useConnection();
  const [solPrice, setSolPrice] = useState<number>(DEFAULT_SOL_PRICE);
  const [isSolPriceReady, setIsSolPriceReady] = useState<boolean>(false);
  const isMountedRef = useRef(true);
  
  const stableAmountSOL = useMemo(() => {
    return parseFloat(amountSOL.toFixed(6));
  }, [amountSOL]);
  
  useEffect(() => {
    isMountedRef.current = true;
    
    const updatePrice = async () => {
      const price = await fetchSolPrice();
      if (isMountedRef.current) {
        setSolPrice(price);
        setIsSolPriceReady(price > 0);
      }
    };
    
    updatePrice();
    const interval = setInterval(updatePrice, 30000);
    
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, []);
  
  const fetcher = useCallback(async ([, token, amount]: [string, string, number]) => {
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    
    if (!isSolPriceReady || solPrice <= 0) {
      throw new Error('SOL price not available');
    }
    
    const result = await simulateArbitrage({
      tokenSymbol: token,
      amountSOL: amount,
      solPriceUSD: solPrice,
      userRpcUrl,
    });
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return result.opportunity;
  }, [solPrice, userRpcUrl, isSolPriceReady]);
  
  const swrKey = useMemo(() => {
    return ['arbitrage', tokenSymbol, stableAmountSOL];
  }, [tokenSymbol, stableAmountSOL]);
  
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(
    swrKey,
    fetcher,
    {
      refreshInterval: isSolPriceReady ? refreshInterval : 0,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
      onError: (err) => {
        console.error('SWR error:', {
          tokenSymbol,
          amountSOL: stableAmountSOL,
          error: err.message,
        });
      },
    }
  );
  
  const summary = data ? getArbitrageSummary(data) : '';
  
  return {
    data: data || null,
    error: error || null,
    isLoading: isLoading || !isSolPriceReady,
    isValidating,
    mutate,
    summary,
    refresh: () => mutate(),
  };
}
