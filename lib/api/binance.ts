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

// Timeout for fetch requests (10 seconds for better reliability)
const FETCH_TIMEOUT_MS = 10000;

// Cache for prices to reduce API calls
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_TTL_MS = 30000; // 30 seconds cache

// Используем ReturnType<typeof setTimeout> вместо NodeJS.Timeout для кросс-платформенности
let cacheCleanupInterval: ReturnType<typeof setTimeout> | null = null;

/**
 * Helper to create a fetch with timeout and AbortController cleanup
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
      cache: 'no-store',
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
 * Validate Binance API response structure with proper type checking
 */
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

/**
 * Get cached price if still valid
 */
function getCachedPrice(symbol: string): number | null {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.price;
  }
  return null;
}

/**
 * Set cached price
 */
function setCachedPrice(symbol: string, price: number): void {
  priceCache.set(symbol, { price, timestamp: Date.now() });
  
  // Start cache cleanup interval if not already running
  if (!cacheCleanupInterval) {
    cacheCleanupInterval = setInterval(clearExpiredCache, 60000);
  }
}

/**
 * Clear expired cache entries
 */
function clearExpiredCache(): void {
  const now = Date.now();
  for (const [symbol, { timestamp }] of priceCache.entries()) {
    if (now - timestamp > CACHE_TTL_MS) {
      priceCache.delete(symbol);
    }
  }
  
  // Clear interval if cache is empty
  if (priceCache.size === 0 && cacheCleanupInterval) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
  }
}

/**
 * Fetch price for any symbol from Binance with caching
 * @param symbol - Trading pair symbol (e.g., 'SOLUSDT', 'BTCUSDT')
 * @param useCache - Whether to use cached price (default: true)
 * @returns Price in USD as number
 * @throws Error if request fails or price is invalid
 */
export async function getBinancePrice(symbol: string, useCache: boolean = true): Promise<number> {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error('Symbol must be a non-empty string');
  }
  
  const normalizedSymbol = symbol.toUpperCase().trim();
  
  // Check cache first
  if (useCache) {
    const cachedPrice = getCachedPrice(normalizedSymbol);
    if (cachedPrice !== null) {
      return cachedPrice;
    }
  }

  try {
    const url = `/api/binance?symbol=${encodeURIComponent(normalizedSymbol)}`;
    
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      let errorMessage = `Binance API error: ${response.status}`;
      let errorCode: string | undefined;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        errorCode = errorData.code;
      } catch {
        // Ignore JSON parsing error
      }
      
      const error = new Error(errorMessage);
      Object.assign(error, { statusCode: response.status, errorCode });
      throw error;
    }

    const data = await response.json();

    // Validate response structure
    validateBinanceResponse(data);

    const price = parseFloat(data.price);
    
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price value: ${data.price}`);
    }

    // Cache the successful price
    setCachedPrice(normalizedSymbol, price);

    return price;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch Binance price:', {
      symbol: normalizedSymbol,
      error: errorMessage,
    });
    throw error;
  }
}

/**
 * Fetch current SOL price from Binance
 * @param useCache - Whether to use cached price (default: true)
 * @returns Price in USD as number
 * @throws Error if request fails or price is invalid
 */
export async function getSolPrice(useCache: boolean = true): Promise<number> {
  return getBinancePrice('SOLUSDT', useCache);
}

/**
 * Fetch price with retry logic and exponential backoff
 * @param symbol - Trading pair symbol
 * @param retries - Number of retry attempts (default: 3)
 * @param delayMs - Base delay between retries in ms (default: 1000)
 * @param useCache - Whether to use cached price (default: true)
 * @returns Price in USD as number
 */
export async function getBinancePriceWithRetry(
  symbol: string,
  retries: number = 3,
  delayMs: number = 1000,
  useCache: boolean = true
): Promise<number> {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error('Symbol must be a non-empty string');
  }
  
  let lastError: Error | null = null;
  const normalizedSymbol = symbol.toUpperCase();

  for (let i = 0; i < retries; i++) {
    try {
      return await getBinancePrice(normalizedSymbol, useCache);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a client error (4xx) - don't retry
      const statusCode = (error as any).statusCode;
      if (statusCode && statusCode >= 400 && statusCode < 500) {
        throw lastError;
      }
      
      // Don't retry on validation errors or missing symbol errors
      if (lastError.message.includes('Invalid response') || 
          lastError.message.includes('Invalid price') ||
          lastError.message.includes('non-empty string')) {
        throw lastError;
      }

      console.warn(`Retry ${i + 1}/${retries} for ${normalizedSymbol}: ${lastError.message}`);

      if (i < retries - 1) {
        // Exponential backoff with jitter: 1s, 2s, 4s + random jitter
        const jitter = Math.random() * 100;
        const backoffDelay = delayMs * Math.pow(2, i) + jitter;
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${normalizedSymbol} price after ${retries} retries`);
}

/**
 * Get multiple prices in parallel with graceful failure and rate limiting
 * @param symbols - Array of trading pair symbols
 * @param concurrency - Max concurrent requests (default: 5)
 * @returns Map of symbol to price (only successful fetches)
 */
export async function getMultipleBinancePrices(
  symbols: string[],
  concurrency: number = 5
): Promise<Map<string, number>> {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return new Map();
  }
  
  const results = new Map<string, number>();
  const uniqueSymbols = [...new Set(symbols.filter(s => s && typeof s === 'string').map(s => s.toUpperCase().trim()))];
  
  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < uniqueSymbols.length; i += concurrency) {
    const batch = uniqueSymbols.slice(i, i + concurrency);
    
    const batchResults = await Promise.allSettled(
      batch.map(async (symbol) => {
        const price = await getBinancePriceWithRetry(symbol, 2, 500, true);
        return { symbol, price };
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.set(result.value.symbol, result.value.price);
      } else {
        const error = result.reason;
        console.error('Failed to fetch price:', error instanceof Error ? error.message : error);
      }
    }
    
    // Small delay between batches to respect rate limits
    if (i + concurrency < uniqueSymbols.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Get current SOL price with fallback value
 * @param fallbackPrice - Default price if fetch fails (default: 89.00)
 * @param useCache - Whether to use cached price (default: true)
 * @returns Price in USD as number
 */
export async function getSolPriceWithFallback(
  fallbackPrice: number = 89.00,
  useCache: boolean = true
): Promise<number> {
  if (typeof fallbackPrice !== 'number' || isNaN(fallbackPrice) || fallbackPrice <= 0) {
    throw new Error('Fallback price must be a positive number');
  }
  
  try {
    return await getSolPrice(useCache);
  } catch (error) {
    console.warn('Using fallback SOL price:', fallbackPrice);
    return fallbackPrice;
  }
}

/**
 * Invalidate cache for a specific symbol
 */
export function invalidatePriceCache(symbol: string): void {
  if (!symbol || typeof symbol !== 'string') {
    return;
  }
  priceCache.delete(symbol.toUpperCase().trim());
}

/**
 * Clear entire price cache
 */
export function clearPriceCache(): void {
  priceCache.clear();
  if (cacheCleanupInterval) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
  }
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: priceCache.size,
    keys: Array.from(priceCache.keys()),
  };
}

/**
 * Cleanup function for testing or app shutdown
 */
export function cleanup(): void {
  if (cacheCleanupInterval) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
  }
  priceCache.clear();
}
