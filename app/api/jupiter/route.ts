// app/api/jupiter/route.ts

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const inputMint = searchParams.get('inputMint') || 'So11111111111111111111111111111111111111112';
    const outputMint = searchParams.get('outputMint') || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const amount = searchParams.get('amount') || '1000000000';
    const slippageBps = searchParams.get('slippageBps') || '50';

    console.log('Fetching Jupiter quote...');

    const url = `https://quote-api.jup.ag/v6/quote?` + new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      slippageBps,
      onlyDirectRoutes: 'false',
      maxAccounts: '20',
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jupiter API error:', response.status, errorText);
      throw new Error(`Jupiter API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Jupiter quote received');
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Jupiter API route error:', error);
    // Return fallback quote
    return NextResponse.json({ 
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      inAmount: '1000000000',
      outAmount: '87600000',
      priceImpactPct: 0,
      routePlan: [],
      otherRouteQuotes: [],
      slippageBps: 50,
      platformFee: null,
      timeTaken: 0,
      contextSlot: 0,
      otherAmountThreshold: '0',
      swapMode: 'ExactIn' as const,
    });
  }
}
