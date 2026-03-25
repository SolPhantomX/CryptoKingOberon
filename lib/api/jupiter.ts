// lib/api/jupiter.ts

import { PublicKey } from '@solana/web3.js';
import { getQuote, QuoteResponse } from '@jup-ag/api';

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
      const quote = await getQuote({
        inputMint: new PublicKey(params.inputMint),
        outputMint: new PublicKey(params.outputMint),
        amount: params.amount,
        slippageBps: params.slippageBps ?? 50,
      });
      
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
  const amountLamports = amountSOL * 1_000_000_000;
  const quote = await fetchJupiterQuote({
    inputMint,
    outputMint,
    amount: amountLamports,
    slippageBps: 50,
  });
  
  const price = parseFloat(quote.outAmount) / 1_000_000_000;
  
  return { price, quote };
}
