// lib/api/binance.ts

export async function getBinancePrice(symbol: string): Promise<number> {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error('Symbol must be a non-empty string');
  }

  const normalized = symbol.toUpperCase().trim();

  try {
    const response = await fetch(`/api/binance?symbol=${normalized}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.price) {
      throw new Error('No price in response');
    }

    const price = parseFloat(data.price);
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price: ${data.price}`);
    }

    return price;
  } catch (error) {
    console.error(`Failed to fetch ${normalized}:`, error);
    throw error;
  }
}

export async function getSolPrice(): Promise<number> {
  return getBinancePrice('SOLUSDT');
}
