// lib/api/binance.ts

/**
 * Client for fetching price data from Binance
 * Calls the Next.js API route that proxies to Binance
 */

export interface BinancePriceResponse {
  symbol: string;
  price: string;
  priceNumber: number;
  timestamp: number;
  source: string;
}

export interface BinanceErrorResponse {
  error: string;
  code: string;
  timestamp: number;
}

// Timeout for fetch requests (5 seconds)
const FETCH_TIMEOUT_MS = 5000;

/**
 * Helper to create a fetch with timeout
 */
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

/**
 * Validate Binance API response structure
 */
function validateBinanceResponse(data: unknown): asserts data is { symbol: string; price: string } {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response: not an object');
  }

  const response = data as Record<string, unknown>;

  if (!response.symbol || typeof response.symbol !== 'string') {
    throw new Error('Invalid response: missing or invalid symbol');
  }

  if (!response.price || typeof response.price !== 'string') {
    throw new Error('Invalid response: missing or invalid price');
  }
}

/**
 * Fetch price for any symbol from Binance
 * @param symbol - Trading pair symbol (e.g., 'SOLUSDT', 'BTCUSDT')
 * @returns Price in USD as number
 * @throws Error if request fails or price is invalid
 */
export async function getBinancePrice(symbol: string): Promise<number> {
  const normalizedSymbol = symbol.toUpperCase();

  try {
    const response = await fetchWithTimeout(
      `/api/binance?symbol=${normalizedSymbol}`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      let errorMessage = `Binance API error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Ignore JSON parsing error
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Validate response structure
    validateBinanceResponse(data);

    const price = parseFloat(data.price);
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price value: ${data.price}`);
    }

    return price;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch Binance price:', {
      symbol: normalizedSymbol,
      error: errorMessage,
    });
    throw new Error(`Failed to fetch ${normalizedSymbol} price: ${errorMessage}`);
  }
}

/**
 * Fetch current SOL price from Binance
 * @returns Price in USD as number
 * @throws Error if request fails or price is invalid
 */
export async function getSolPrice(): Promise<number> {
  return getBinancePrice('SOLUSDT');
}

/**
 * Fetch price with retry logic
 * @param symbol - Trading pair symbol
 * @param retries - Number of retry attempts (default: 3)
 * @param delayMs - Delay between retries in ms (default: 1000)
 * @returns Price in USD as number
 */
export async function getBinancePriceWithRetry(
  symbol: string,
  retries: number = 3,
  delayMs: number = 1000
): Promise<number> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      return await getBinancePrice(symbol);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on 4xx errors (client errors)
      if (lastError.message.includes('400') || lastError.message.includes('404')) {
        throw lastError;
      }

      console.warn(`Retry ${i + 1}/${retries} for ${symbol}: ${lastError.message}`);

      if (i < retries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, i)));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${symbol} price after ${retries} retries`);
}

/**
 * Get multiple prices in parallel with graceful failure
 * @param symbols - Array of trading pair symbols
 * @returns Map of symbol to price (only successful fetches)
 */
export async function getMultipleBinancePrices(
  symbols: string[]
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  // Use Promise.allSettled to handle individual failures gracefully
  const settledResults = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const price = await getBinancePriceWithRetry(symbol, 2, 500);
      return { symbol: symbol.toUpperCase(), price };
    })
  );

  for (const result of settledResults) {
    if (result.status === 'fulfilled') {
      results.set(result.value.symbol, result.value.price);
    } else {
      console.error('Failed to fetch price:', result.reason);
    }
  }

  return results;
}

/**
 * Get current SOL price with fallback value
 * @param fallbackPrice - Default price if fetch fails (default: 89.00)
 * @returns Price in USD as number
 */
export async function getSolPriceWithFallback(fallbackPrice: number = 89.00): Promise<number> {
  try {
    return await getSolPrice();
  } catch (error) {
    console.warn('Using fallback SOL price:', fallbackPrice);
    return fallbackPrice;
  }
}
