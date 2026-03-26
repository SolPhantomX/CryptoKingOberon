// app/api/jupiter/route.ts

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const inputMint = searchParams.get('inputMint') || 'So11111111111111111111111111111111111111112';
  const outputMint = searchParams.get('outputMint') || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const amount = searchParams.get('amount') || '1000000000';
  const slippageBps = searchParams.get('slippageBps') || '50';

  const url = `https://quote-api.jup.ag/v6/quote?` + new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps,
    onlyDirectRoutes: 'false',
    maxAccounts: '20',
  });

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jupiter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Jupiter API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Jupiter quote' },
      { status: 500 }
    );
  }
}
