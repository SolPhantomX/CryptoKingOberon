// lib/api/binance.ts

export async function getBinancePrice(symbol: string): Promise<number> {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error('Symbol must be a non-empty string');
  }

  const normalized = symbol.toUpperCase().trim();

  try {
    const res = await fetch(`/api/binance?symbol=${encodeURIComponent(normalized)}`, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-cache',
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!data.price || typeof data.price !== 'string') {
      throw new Error('Invalid response format');
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
