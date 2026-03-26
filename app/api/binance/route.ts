// app/api/binance/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 10;

// Validation schema for Binance symbols
const symbolSchema = z
  .string()
  .min(3)
  .max(20)
  .regex(/^[A-Z]{2,10}(USDT|USD|BUSD|BTC|ETH|BNB)$/, {
    message: 'Invalid symbol format. Must be like: BTCUSDT, ETHUSD, etc.',
  })
  .transform((val) => val.toUpperCase());

const isValidSymbol = (symbol: string): boolean => {
  try {
    symbolSchema.parse(symbol);
    return true;
  } catch {
    return false;
  }
};

interface BinancePriceResponse {
  symbol: string;
  price: string;
}

interface ErrorResponse {
  error: string;
  code: string;
  timestamp: number;
  requestId?: string;
  symbol?: string;
}

export async function GET(request: NextRequest) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const requestId = crypto.randomUUID();

  try {
    const searchParams = request.nextUrl.searchParams;
    const rawSymbol = searchParams.get('symbol');

    // Validate required parameter
    if (!rawSymbol) {
      return NextResponse.json(
        {
          error: 'Missing symbol parameter',
          code: 'MISSING_SYMBOL',
          timestamp: Date.now(),
          requestId,
        } as ErrorResponse,
        { status: 400 }
      );
    }

    // Validate symbol format
    if (!isValidSymbol(rawSymbol)) {
      return NextResponse.json(
        {
          error: 'Invalid symbol format',
          code: 'INVALID_SYMBOL',
          timestamp: Date.now(),
          requestId,
          symbol: rawSymbol,
        } as ErrorResponse,
        { status: 400 }
      );
    }

    const symbol = rawSymbol.toUpperCase();

    // Build URL with validated symbol
    const url = new URL('https://api.binance.com/api/v3/ticker/price');
    url.searchParams.set('symbol', symbol);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'crypto-dashboard/1.0.0 (contact: support@example.com)',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '5';
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT',
          timestamp: Date.now(),
          requestId,
          symbol,
        } as ErrorResponse,
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter,
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // Handle Binance maintenance or temporary unavailability
    if (response.status === 503 || response.status === 504) {
      return NextResponse.json(
        {
          error: 'Binance service temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE',
          timestamp: Date.now(),
          requestId,
          symbol,
        } as ErrorResponse,
        { status: response.status }
      );
    }

    // Check if response is OK
    if (!response.ok) {
      // Limit error text size to prevent memory issues
      const errorText = await response.text().then((text) => text.slice(0, 500));
      console.error('Binance API error:', {
        status: response.status,
        symbol,
        error: errorText,
        requestId,
      });

      return NextResponse.json(
        {
          error: `Binance API error: ${response.status}`,
          code: 'API_ERROR',
          timestamp: Date.now(),
          requestId,
          symbol,
        } as ErrorResponse,
        { status: response.status }
      );
    }

    // Validate Content-Type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Invalid content-type from Binance:', { contentType, requestId, symbol });
      return NextResponse.json(
        {
          error: 'Invalid response format from Binance',
          code: 'INVALID_RESPONSE_FORMAT',
          timestamp: Date.now(),
          requestId,
          symbol,
        } as ErrorResponse,
        { status: 502 }
      );
    }

    // Parse JSON with size limit check
    const text = await response.text();
    if (text.length > 1024 * 1024) {
      // 1MB limit
      console.error('Binance response too large:', { size: text.length, requestId, symbol });
      return NextResponse.json(
        {
          error: 'Response size exceeds limit',
          code: 'RESPONSE_TOO_LARGE',
          timestamp: Date.now(),
          requestId,
          symbol,
        } as ErrorResponse,
        { status: 502 }
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse Binance response:', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        requestId,
        symbol,
        preview: text.slice(0, 200),
      });
      return NextResponse.json(
        {
          error: 'Invalid JSON response from Binance',
          code: 'INVALID_JSON',
          timestamp: Date.now(),
          requestId,
          symbol,
        } as ErrorResponse,
        { status: 502 }
      );
    }

    // Validate response structure
    if (!data || typeof data !== 'object') {
      console.error('Invalid response structure:', { requestId, symbol });
      return NextResponse.json(
        {
          error: 'Invalid response structure from Binance',
          code: 'INVALID_STRUCTURE',
          timestamp: Date.now(),
          requestId,
          symbol,
        } as ErrorResponse,
        { status: 502 }
      );
    }

    const priceData = data as Partial<BinancePriceResponse>;

    // Validate required fields
    if (!priceData.price || typeof priceData.price !== 'string') {
      console.error('Missing or invalid price field:', {
        priceData,
        requestId,
        symbol,
      });
      return NextResponse.json(
        {
          error: 'Missing price data in Binance response',
          code: 'MISSING_PRICE',
          timestamp: Date.now(),
          requestId,
          symbol,
        } as ErrorResponse,
        { status: 502 }
      );
    }

    // Validate price is a valid number
    const priceNum = Number(priceData.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      console.error('Invalid price value:', {
        price: priceData.price,
        requestId,
        symbol,
      });
      return NextResponse.json(
        {
          error: 'Invalid price value received',
          code: 'INVALID_PRICE',
          timestamp: Date.now(),
          requestId,
          symbol,
        } as ErrorResponse,
        { status: 502 }
      );
    }

    // Normalize response with consistent types
    const normalizedResponse = {
      symbol: priceData.symbol || symbol,
      price: priceData.price,
      priceNumber: priceNum, // Add numeric version for convenience
      timestamp: Date.now(),
      source: 'binance',
    };

    // Return with anti-caching headers
    return NextResponse.json(normalizedResponse, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'CDN-Cache-Control': 'no-store',
        'Vary': 'Accept-Encoding',
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle AbortError (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Request ${requestId} - Timeout error:`, {
        symbol: request.nextUrl.searchParams.get('symbol'),
      });
      return NextResponse.json(
        {
          error: 'Request timeout. Please try again.',
          code: 'TIMEOUT',
          timestamp: Date.now(),
          requestId,
        } as ErrorResponse,
        { status: 504 }
      );
    }

    // Handle network errors
    if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('ENOTFOUND'))) {
      console.error(`Request ${requestId} - Network error:`, {
        error: error.message,
        symbol: request.nextUrl.searchParams.get('symbol'),
      });
      return NextResponse.json(
        {
          error: 'Network error. Please check your connection.',
          code: 'NETWORK_ERROR',
          timestamp: Date.now(),
          requestId,
        } as ErrorResponse,
        { status: 503 }
      );
    }

    // Handle URL parsing errors
    if (error instanceof Error && error.message.includes('URL')) {
      console.error(`Request ${requestId} - URL parsing error:`, error.message);
      return NextResponse.json(
        {
          error: 'Invalid request URL',
          code: 'INVALID_URL',
          timestamp: Date.now(),
          requestId,
        } as ErrorResponse,
        { status: 400 }
      );
    }

    // Generic error with requestId for debugging
    console.error(`Request ${requestId} - Unexpected error:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      symbol: request.nextUrl.searchParams.get('symbol'),
    });

    return NextResponse.json(
      {
        error: 'Internal server error. Please try again later.',
        code: 'INTERNAL_ERROR',
        timestamp: Date.now(),
        requestId,
      } as ErrorResponse,
      { status: 500 }
    );
  }
}

// Handle other HTTP methods
export async function POST() {
  return NextResponse.json(
    {
      error: 'Method not allowed. Use GET.',
      code: 'METHOD_NOT_ALLOWED',
      timestamp: Date.now(),
    } as ErrorResponse,
    { status: 405, headers: { Allow: 'GET, OPTIONS' } }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, OPTIONS',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
