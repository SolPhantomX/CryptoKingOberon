// lib/api/cex.ts
export type CexExchange = 'bybit' | 'binance' | 'okx';

export interface NormalizedPrice {
  exchange: CexExchange;
  symbol: string;
  price: number;
  timestamp: number;
  raw?: any;
}

export interface CexError {
  exchange: CexExchange;
  error: string;
  code?: string;
  timestamp: number;
}

const FETCH_TIMEOUT_MS = 5000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

export async function getCexPrice(
  exchange: CexExchange,
  symbol: string
): Promise<NormalizedPrice> {
  const normalizedSymbol = symbol.toUpperCase();

  try {
    const response = await fetchWithTimeout(`/api/${exchange}?symbol=${normalizedSymbol}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      let errorMessage = `${exchange.toUpperCase()} API error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Ignore
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.price || typeof data.price !== 'string') {
      throw new Error('Invalid response: missing or invalid price');
    }

    const price = parseFloat(data.price);
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price value: ${data.price}`);
    }

    return {
      exchange,
      symbol: normalizedSymbol,
      price,
      timestamp: data.timestamp || Date.now(),
      raw: data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to fetch ${exchange} price:`, { symbol: normalizedSymbol, error: errorMessage });
    throw new Error(`Failed to fetch ${normalizedSymbol} price from ${exchange}: ${errorMessage}`);
  }
}

export async function getSolPrice(exchange: CexExchange = 'bybit'): Promise<number> {
  const result = await getCexPrice(exchange, 'SOLUSDT');
  return result.price;
}

export async function getSolPriceWithFallback(
  exchange: CexExchange = 'bybit',
  fallbackPrice: number = 89.00
): Promise<number> {
  try {
    return await getSolPrice(exchange);
  } catch (error) {
    console.warn(`Failed to fetch SOL price from ${exchange}, using fallback: ${fallbackPrice}`);
    return fallbackPrice;
  }
}

export async function getCexPriceWithRetry(
  exchange: CexExchange,
  symbol: string,
  retries: number = 3,
  delayMs: number = 1000
): Promise<NormalizedPrice> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      return await getCexPrice(exchange, symbol);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.message.includes('400') || lastError.message.includes('404')) {
        throw lastError;
      }

      console.warn(`Retry ${i + 1}/${retries} for ${exchange} ${symbol}: ${lastError.message}`);

      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, i)));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${symbol} from ${exchange} after ${retries} retries`);
}
