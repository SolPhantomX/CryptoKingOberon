// lib/api/binance.ts

export async function getBinancePrice(symbol: string): Promise<number> {
  const normalized = symbol.toUpperCase().trim();

  const response = await fetch(`/api/binance?symbol=${normalized}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-cache',
  });

  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`);
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
}

export async function getSolPrice(): Promise<number> {
  return getBinancePrice('SOLUSDT');
}
