// lib/api/binance.ts

/**
 * Simple Binance price client (without cache to avoid type issues)
 */

export async function getBinancePrice(symbol: string): Promise<number> {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error('Symbol must be a non-empty string');
  }

  const normalizedSymbol = symbol.toUpperCase().trim();

  try {
    const response = await fetch(`/api/binance?symbol=${encodeURIComponent(normalizedSymbol)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
    });

    if (!response.ok) {
      let errorMsg = `HTTP error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }

    const data = await response.json();

    if (!data.price || typeof data.price !== 'string') {
      throw new Error('Invalid response: missing price');
    }

    const price = parseFloat(data.price);
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price: ${data.price}`);
    }

    return price;
  } catch (error) {
    console.error(`Failed to fetch ${normalizedSymbol} price:`, error);
    throw error;
  }
}

export async function getSolPrice(): Promise<number> {
  return getBinancePrice('SOLUSDT');
}

// Простая версия с retry (без сложного кэша)
export async function getBinancePriceWithRetry(
  symbol: string,
  retries: number = 2
): Promise<number> {
  for (let i = 0; i < retries; i++) {
    try {
      return await getBinancePrice(symbol);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 800));
    }
  }
  throw new Error(`Failed after ${retries} retries`);
}
