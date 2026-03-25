// lib/api/binance.ts

const BINANCE_API_URL = 'https://api.binance.com';
const TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;

interface BinancePriceResponse {
  symbol: string;
  price: string;
}

export async function fetchBinancePrice(symbol: string = 'SOLUSDT'): Promise<number> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      const response = await fetch(
        `${BINANCE_API_URL}/api/v3/ticker/price?symbol=${symbol}`,
        { signal: controller.signal }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }
      
      const data: BinancePriceResponse = await response.json();
      const price = parseFloat(data.price);
      
      if (isNaN(price) || price <= 0) {
        throw new Error('Invalid price from Binance');
      }
      
      return price;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`Binance fetch attempt ${attempt} failed:`, lastError.message);
      
      if (attempt <= MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
  }
  
  throw new Error(`Failed to fetch Binance price after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
}
