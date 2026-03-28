import { JupiterQuoteParams, JupiterQuoteResponse } from '@/types/arbitrage';

export const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';
export const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6';

export interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  priceImpactPct: number;
  routePlan: unknown[];
  timeTaken: number;
  contextSlot: number;
}

const FETCH_TIMEOUT_MS = 10000;
const RATE_LIMIT_DELAY_MS = 1000;
let lastRequestTime = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    await enforceRateLimit();
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

export async function getJupiterQuote(params: JupiterQuoteParams): Promise<JupiterQuoteResponse> {
  const {
    inputMint,
    outputMint,
    amount,
    slippageBps = 50,
    onlyDirectRoutes = false,
    maxAccounts = 20,
  } = params;

  const url = new URL(`${JUPITER_QUOTE_API}/quote`);
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', amount.toString());
  url.searchParams.set('slippageBps', slippageBps.toString());
  url.searchParams.set('onlyDirectRoutes', onlyDirectRoutes.toString());
  url.searchParams.set('maxAccounts', maxAccounts.toString());

  const headers: HeadersInit = {
    'Accept': 'application/json',
  };

  const apiKey = process.env.NEXT_PUBLIC_JUPITER_API_KEY;
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers,
    cache: 'no-store',
  }, FETCH_TIMEOUT_MS);

  if (!response.ok) {
    let errorMessage = `Jupiter API error: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      // Ignore JSON parsing error
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();

  if (!data.outAmount || !data.inAmount) {
    throw new Error('Invalid response from Jupiter API: missing outAmount or inAmount');
  }

  return {
    inputMint: data.inputMint,
    outputMint: data.outputMint,
    inAmount: data.inAmount,
    outAmount: data.outAmount,
    otherAmountThreshold: data.otherAmountThreshold || '0',
    swapMode: data.swapMode || 'ExactIn',
    slippageBps: data.slippageBps || slippageBps,
    priceImpactPct: typeof data.priceImpactPct === 'string' ? parseFloat(data.priceImpactPct) : data.priceImpactPct,
    routePlan: data.routePlan || [],
    timeTaken: data.timeTaken || 0,
    contextSlot: data.contextSlot || 0,
  };
}

export async function getJupiterSwapTransaction(
  quote: JupiterQuoteResponse,
  userPublicKey: string,
  wrapAndUnwrapSol: boolean = true,
  dynamicComputeUnitLimit: boolean = true,
  prioritizationFeeLamports?: number
): Promise<{ swapTransaction: string; lastValidBlockHeight: number }> {
  const url = `${JUPITER_SWAP_API}/swap`;

  const payload = {
    quoteResponse: quote,
    userPublicKey,
    wrapAndUnwrapSol,
    dynamicComputeUnitLimit,
    ...(prioritizationFeeLamports && { prioritizationFeeLamports }),
  };

  const headers: HeadersInit = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  const apiKey = process.env.NEXT_PUBLIC_JUPITER_API_KEY;
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  }, FETCH_TIMEOUT_MS);

  if (!response.ok) {
    let errorMessage = `Jupiter swap API error: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      // Ignore JSON parsing error
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();

  if (!data.swapTransaction) {
    throw new Error('Invalid response from Jupiter swap API: missing swapTransaction');
  }

  return {
    swapTransaction: data.swapTransaction,
    lastValidBlockHeight: data.lastValidBlockHeight,
  };
}
