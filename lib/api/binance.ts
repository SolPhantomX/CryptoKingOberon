// lib/api/binance.ts

const BINANCE_API_BASE = '/api/binance';

export async function fetchBinancePrice(symbol: string = 'SOLUSDT'): Promise<number> {
  try {
    const response = await fetch(`${BINANCE_API_BASE}?symbol=${symbol}`);
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error('Failed to fetch Binance price:', error);
    return 87.60;
  }
}
