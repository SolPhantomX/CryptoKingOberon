// app/api/jupiter/route.ts

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // или 'edge' - зависит от окружения
export const maxDuration = 10; // таймаут в секундах для Vercel

// Валидация Solana public key (упрощённая, для production использовать base58 validation)
const isValidSolanaAddress = (address: string): boolean => {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

const isValidAmount = (amount: string): boolean => {
  const num = Number(amount);
  return !isNaN(num) && num > 0 && num <= 1e15; // не более 1M SOL в лампортах
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

export async function GET(request: NextRequest) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s таймаут

  try {
    const searchParams = request.nextUrl.searchParams;
    
    const inputMint = searchParams.get('inputMint');
    const outputMint = searchParams.get('outputMint');
    const amount = searchParams.get('amount');
    const slippageBps = searchParams.get('slippageBps');

    // Валидация обязательных параметров
    if (!inputMint || !isValidSolanaAddress(inputMint)) {
      return NextResponse.json(
        { error: 'Invalid or missing inputMint', code: 'INVALID_INPUT_MINT' },
        { status: 400 }
      );
    }

    if (!outputMint || !isValidSolanaAddress(outputMint)) {
      return NextResponse.json(
        { error: 'Invalid or missing outputMint', code: 'INVALID_OUTPUT_MINT' },
        { status: 400 }
      );
    }

    if (!amount || !isValidAmount(amount)) {
      return NextResponse.json(
        { error: 'Invalid or missing amount', code: 'INVALID_AMOUNT' },
        { status: 400 }
      );
    }

    let slippageBpsNum = 50; // default
    if (slippageBps) {
      if (!isValidSlippage(slippageBps)) {
        return NextResponse.json(
          { error: 'Invalid slippageBps (must be 0-10000)', code: 'INVALID_SLIPPAGE' },
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
      maxAccounts: '100', // увеличен для сложных маршрутов
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

    // Обработка специфических HTTP статусов
    if (response.status === 429) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.', code: 'RATE_LIMIT' },
        { status: 429, headers: { 'Retry-After': '5' } }
      );
    }

    if (response.status === 503 || response.status === 504) {
      return NextResponse.json(
        { error: 'Jupiter API temporarily unavailable', code: 'SERVICE_UNAVAILABLE' },
        { status: response.status }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jupiter API error:', {
        status: response.status,
        error: errorText,
        inputMint,
        outputMint,
        amount,
      });
      
      return NextResponse.json(
        { error: `Jupiter API error: ${response.status}`, code: 'API_ERROR' },
        { status: response.status }
      );
    }

    // Проверка Content-Type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Invalid content-type from Jupiter:', contentType);
      return NextResponse.json(
        { error: 'Invalid response from Jupiter API', code: 'INVALID_RESPONSE' },
        { status: 502 }
      );
    }

    const data: unknown = await response.json();

    // Валидация структуры ответа
    if (!data || typeof data !== 'object') {
      console.error('Invalid response structure from Jupiter');
      return NextResponse.json(
        { error: 'Invalid response structure', code: 'INVALID_STRUCTURE' },
        { status: 502 }
      );
    }

    const quote = data as Partial<JupiterQuoteResponse>;

    // Проверка наличия обязательных полей
    if (!quote.outAmount || !quote.inAmount) {
      console.error('Missing outAmount/inAmount in Jupiter response', quote);
      return NextResponse.json(
        { error: 'No route found for the given tokens/amount', code: 'NO_ROUTE' },
        { status: 404 }
      );
    }

    // Проверка, что outAmount > 0
    const outAmountNum = Number(quote.outAmount);
    if (isNaN(outAmountNum) || outAmountNum <= 0) {
      console.error('Invalid or zero outAmount:', quote.outAmount);
      return NextResponse.json(
        { error: 'Insufficient liquidity or no route available', code: 'NO_LIQUIDITY' },
        { status: 404 }
      );
    }

    // Нормализация типов для консистентности
    const normalizedResponse = {
      ...quote,
      slippageBps: typeof quote.slippageBps === 'string' ? Number(quote.slippageBps) : quote.slippageBps,
      priceImpactPct: typeof quote.priceImpactPct === 'string' ? Number(quote.priceImpactPct) : quote.priceImpactPct,
      inAmount: String(quote.inAmount),
      outAmount: String(quote.outAmount),
      otherAmountThreshold: String(quote.otherAmountThreshold || '0'),
    };

    // Добавляем заголовки anti-caching
    return NextResponse.json(normalizedResponse, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'CDN-Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Логируем с trace-id (в production использовать структурированное логирование)
    const requestId = crypto.randomUUID();
    console.error(`Request ${requestId} - Jupiter API route error:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });

    // AbortError - таймаут
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout. Please try again.', code: 'TIMEOUT' },
        { status: 504 }
      );
    }

    // Network errors
    if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network'))) {
      return NextResponse.json(
        { error: 'Network error. Please check your connection.', code: 'NETWORK_ERROR' },
        { status: 503 }
      );
    }

    // Generic error
    return NextResponse.json(
      { error: 'Internal server error. Please try again later.', code: 'INTERNAL_ERROR', requestId },
      { status: 500 }
    );
  }
}

// Явная обработка других HTTP методов
export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET.', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}

export async function OPTIONS() {
  return NextResponse.json(null, {
    status: 204,
    headers: {
      Allow: 'GET, OPTIONS',
    },
  });
}
