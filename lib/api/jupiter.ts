// lib/api/jupiter.ts

import { PublicKey } from '@solana/web3.js';
import type { QuoteResponse } from '@jup-ag/api';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6';
const MAX_RETRIES = 2;

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number; // in lamports
  slippageBps?: number;
}

export async function fetchJupiterQuote(params: JupiterQuoteParams): Promise<QuoteResponse> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const url = `${JUPITER_QUOTE_API}/quote?` + new URLSearchParams({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount.toString(),
        slippageBps: (params.slippageBps ?? 50).toString(),
        onlyDirectRoutes: 'false',
        maxAccounts: '20',
      });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error text');
        throw new Error(`Jupiter API error ${response.status}: ${errorText}`);
      }

      const quote: QuoteResponse = await response.json();
      
      if (!quote || !quote.outAmount) {
        throw new Error('Invalid quote response from Jupiter');
      }
      
      return quote;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`Jupiter quote attempt ${attempt} failed:`, lastError.message);
      
      if (attempt <= MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  throw new Error(`Failed to fetch Jupiter quote after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
}

export async function fetchJupiterPrice(
  inputMint: string,
  outputMint: string,
  amountSOL: number
): Promise<{ price: number; quote: QuoteResponse }> {
  const amountLamports = Math.floor(amountSOL * 1_000_000_000);
  
  const quote = await fetchJupiterQuote({
    inputMint,
    outputMint,
    amount: amountLamports,
    slippageBps: 50,
  });
  
  const price = parseFloat(quote.outAmount) / 1_000_000_000;
  
  return { price, quote };
}
