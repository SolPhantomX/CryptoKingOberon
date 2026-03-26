// app/api/jupiter/route.ts

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // or 'edge' - depends on environment
export const maxDuration = 10; // timeout in seconds for Vercel

// Solana public key validation (simplified, use base58 validation for production)
const isValidSolanaAddress = (address: string): boolean => {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

const isValidAmount = (amount: string): boolean => {
  const num = Number(amount);
  return !isNaN(num) && num > 0 && num <= 1e15; // max 1M SOL in lamports
};

const isValidSlippage = (slippage: string): boolean => {
  const num = Number(slippage);
  return !isNaN(num) && num >= 0 && num <= 10000; // 0% - 100%
};

interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  routePlan: unknown[];
  otherRouteQuotes: unknown[];
  slippageBps: number;
  platformFee: null | unknown;
  timeTaken: number;
  contextSlot: number;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
}

interface ErrorResponse {
  error: string;
  code: string;
  requestId?: string;
  inputMint?: string;
  outputMint?: string;
  amount?: string;
}

export async function GET(request: NextRequest) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const searchParams = request.nextUrl.searchParams;
    
    const inputMint = searchParams.get('inputMint');
    const outputMint = searchParams.get('outputMint');
    const amount = searchParams.get('amount');
    const slippageBps = searchParams.get('slippageBps');

    // Validate required parameters
    if (!inputMint || !isValidSolanaAddress(inputMint)) {
      return NextResponse.json(
        { error: 'Invalid or missing inputMint', code: 'INVALID_INPUT_MINT' } as ErrorResponse,
        { status: 400 }
      );
    }

    if (!outputMint || !isValidSolanaAddress(outputMint)) {
      return NextResponse.json(
        { error: 'Invalid or missing outputMint', code: 'INVALID_OUTPUT_MINT' } as ErrorResponse,
        { status: 400 }
      );
    }

    if (!amount || !isValidAmount(amount)) {
      return NextResponse.json(
        { error: 'Invalid or missing amount', code: 'INVALID_AMOUNT' } as ErrorResponse,
        { status: 400 }
      );
    }

    let slippageBpsNum = 50; // default
    if (slippageBps) {
      if (!isValidSlippage(slippageBps)) {
        return NextResponse.json(
          { error: 'Invalid slippageBps (must be 0-10000)', code: 'INVALID_SLIPPAGE' } as ErrorResponse,
          { status: 400 }
        );
      }
      slippageBpsNum = Number(slippageBps);
    }

    const url = `https://quote-api.jup.ag/v6/quote?${new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      slippageBps: String(slippageBpsNum),
      onlyDirectRoutes: 'false',
      maxAccounts: '100', // increased for complex routes
    })}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'crypto-dashboard/1.0.0 (contact: support@example.com)',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    // Handle specific HTTP status codes
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '5';
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.', code: 'RATE_LIMIT' } as ErrorResponse,
        { 
          status: 429, 
          headers: { 
            'Retry-After': retryAfter,
            'Cache-Control': 'no-store',
          } 
        }
      );
    }

    if (response.status === 503 || response.status === 504) {
      return NextResponse.json(
        { error: 'Jupiter API temporarily unavailable', code: 'SERVICE_UNAVAILABLE' } as ErrorResponse,
        { status: response.status }
      );
    }

    if (!response.ok) {
      // Limit error text size to prevent memory issues
      const errorText = await response.text().then(text => text.slice(0, 500));
      console.error('Jupiter API error:', {
        status: response.status,
        error: errorText,
        inputMint,
        outputMint,
        amount,
      });
      
      return NextResponse.json(
        { error: `Jupiter API error: ${response.status}`, code: 'API_ERROR' } as ErrorResponse,
        { status: response.status }
      );
    }

    // Validate Content-Type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Invalid content-type from Jupiter:', contentType);
      return NextResponse.json(
        { error: 'Invalid response from Jupiter API', code: 'INVALID_RESPONSE' } as ErrorResponse,
        { status: 502 }
      );
    }

    // Parse JSON with size limit check
    const text = await response.text();
    if (text.length > 1024 * 1024) { // 1MB limit
      console.error('Jupiter response too large:', { size: text.length });
      return NextResponse.json(
        { error: 'Response size exceeds limit', code: 'RESPONSE_TOO_LARGE' } as ErrorResponse,
        { status: 502 }
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('Failed to parse Jupiter response:', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        preview: text.slice(0, 200),
      });
      return NextResponse.json(
        { error: 'Invalid JSON response from Jupiter', code: 'INVALID_JSON' } as ErrorResponse,
        { status: 502 }
      );
    }

    // Validate response structure
    if (!data || typeof data !== 'object') {
      console.error('Invalid response structure from Jupiter');
      return NextResponse.json(
        { error: 'Invalid response structure', code: 'INVALID_STRUCTURE' } as ErrorResponse,
        { status: 502 }
      );
    }

    const quote = data as Partial<JupiterQuoteResponse>;

    // Check for required fields
    if (!quote.outAmount || !quote.inAmount) {
      console.error('Missing outAmount/inAmount in Jupiter response', quote);
      return NextResponse.json(
        { error: 'No route found for the given tokens/amount', code: 'NO_ROUTE' } as ErrorResponse,
        { status: 404 }
      );
    }

    // Validate outAmount > 0
    const outAmountNum = Number(quote.outAmount);
    if (isNaN(outAmountNum) || outAmountNum <= 0) {
      console.error('Invalid or zero outAmount:', quote.outAmount);
      return NextResponse.json(
        { error: 'Insufficient liquidity or no route available', code: 'NO_LIQUIDITY' } as ErrorResponse,
        { status: 404 }
      );
    }

    // Validate inAmount is a valid number
    const inAmountNum = Number(quote.inAmount);
    if (isNaN(inAmountNum) || inAmountNum <= 0) {
      console.error('Invalid inAmount:', quote.inAmount);
      return NextResponse.json(
        { error: 'Invalid input amount in response', code: 'INVALID_IN_AMOUNT' } as ErrorResponse,
        { status: 502 }
      );
    }

    // Normalize types for consistency
    const normalizedResponse = {
      ...quote,
      slippageBps: typeof quote.slippageBps === 'string' ? Number(quote.slippageBps) : quote.slippageBps,
      priceImpactPct: typeof quote.priceImpactPct === 'string' ? Number(quote.priceImpactPct) : quote.priceImpactPct,
      inAmount: String(quote.inAmount),
      outAmount: String(quote.outAmount),
      otherAmountThreshold: String(quote.otherAmountThreshold || '0'),
      timestamp: Date.now(),
      source: 'jupiter',
    };

    // Add anti-caching headers
    return NextResponse.json(normalizedResponse, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'CDN-Cache-Control': 'no-store',
        'Vary': 'Accept-Encoding',
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Generate request ID for tracing
    const requestId = crypto.randomUUID();
    
    // Structured logging with request context
    console.error(`Request ${requestId} - Jupiter API route error:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
      inputMint: request.nextUrl.searchParams.get('inputMint'),
      outputMint: request.nextUrl.searchParams.get('outputMint'),
      amount: request.nextUrl.searchParams.get('amount'),
    });

    // Handle AbortError (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { 
          error: 'Request timeout. Please try again.', 
          code: 'TIMEOUT',
          requestId,
        } as ErrorResponse,
        { status: 504 }
      );
    }

    // Handle network errors
    if (error instanceof Error && (
      error.message.includes('fetch') || 
      error.message.includes('network') || 
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ECONNREFUSED')
    )) {
      return NextResponse.json(
        { 
          error: 'Network error. Please check your connection.', 
          code: 'NETWORK_ERROR',
          requestId,
        } as ErrorResponse,
        { status: 503 }
      );
    }

    // Handle URL parsing errors
    if (error instanceof Error && error.message.includes('URL')) {
      return NextResponse.json(
        { 
          error: 'Invalid request URL', 
          code: 'INVALID_URL',
          requestId,
        } as ErrorResponse,
        { status: 400 }
      );
    }

    // Generic error with request ID for debugging
    return NextResponse.json(
      { 
        error: 'Internal server error. Please try again later.', 
        code: 'INTERNAL_ERROR',
        requestId,
      } as ErrorResponse,
      { status: 500 }
    );
  }
}

// Explicit handling for other HTTP methods
export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET.', code: 'METHOD_NOT_ALLOWED' } as ErrorResponse,
    { status: 405, headers: { 'Allow': 'GET, OPTIONS' } }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Allow': 'GET, OPTIONS',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
