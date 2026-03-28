// lib/api/binance.ts

/**
 * Client for fetching price data from Binance via Next.js API proxy
 */

export interface BinancePriceResponse {
  symbol: string;
  price: string;
  priceNumber: number;
  timestamp: number;
  source: string;
}

const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 30000;

const priceCache = new Map<string, { price: number; timestamp: number }>();
let cacheCleanupInterval: number | null = null;

// ====================== CACHE HELPERS ======================
function getCachedPrice(symbol: string): number | null {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.price;
  }
  return null;
}

function setCachedPrice(symbol: string, price: number): void {
  priceCache.set(symbol, { price, timestamp: Date.now() });

  if (!cacheCleanupInterval) {
    cacheCleanupInterval = setInterval(clearExpiredCache, 60000) as number;
  }
}

function clearExpiredCache(): void {
  const now = Date.now();
  for (const [symbol, { timestamp }] of priceCache.entries()) {
    if (now - timestamp > CACHE_TTL_MS) {
      priceCache.delete(symbol);
    }
  }

  if (priceCache.size === 0 && cacheCleanupInterval !== null) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
  }
}

// ====================== FETCH HELPERS ======================
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-cache',
    });
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

function validateBinanceResponse(data: unknown): asserts data is { symbol: string; price: string } {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response: not an object');
  }

  const response = data as Record<string, unknown>;

  if (!response.symbol || typeof response.symbol !== 'string' || response.symbol.trim() === '') {
    throw new Error('Invalid response: missing or invalid symbol');
  }

  if (!response.price || typeof response.price !== 'string' || response.price.trim() === '') {
    throw new Error('Invalid response: missing or invalid price');
  }
}

// ====================== MAIN FUNCTIONS ======================
export async function getBinancePrice(symbol: string, useCache: boolean = true): Promise<number> {
  if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
    throw new Error('Symbol must be a non-empty string');
  }

  const normalizedSymbol = symbol.toUpperCase().trim();

  if (useCache) {
    const cachedPrice = getCachedPrice(normalizedSymbol);
    if (cachedPrice !== null) return cachedPrice;
  }

  try {
    const response = await fetchWithTimeout(
      `/api/binance?symbol=${encodeURIComponent(normalizedSymbol)}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      let errorMessage = `Binance API error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }

    const data = await response.json();
    validateBinanceResponse(data);

    const price = parseFloat(data.price);
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price value: ${data.price}`);
    }

    setCachedPrice(normalizedSymbol, price);
    return price;
  } catch (error) {
    console.error('Failed to fetch Binance price:', {
      symbol: normalizedSymbol,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getSolPrice(useCache: boolean = true): Promise<number> {
  return getBinancePrice('SOLUSDT', useCache);
}

export async function getBinancePriceWithRetry(
  symbol: string,
  retries: number = 3,
  delayMs: number = 1000,
  useCache: boolean = true
): Promise<number> {
  let lastError: Error | null = null;
  const normalizedSymbol = symbol.toUpperCase().trim();

  for (let i = 0; i < retries; i++) {
    try {
      return await getBinancePrice(normalizedSymbol, useCache);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (i < retries - 1) {
        const backoff = delayMs * Math.pow(2, i) + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${normalizedSymbol} price after ${retries} retries`);
}

export function clearPriceCache(): void {
  priceCache.clear();
  if (cacheCleanupInterval !== null) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
  }
}

export function cleanup(): void {
  clearPriceCache();
}
