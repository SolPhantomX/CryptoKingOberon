// app/api/binance/route.ts

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'SOLUSDT';

    console.log(`Fetching Binance price for ${symbol}...`);

    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      { 
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Binance API error:', response.status, errorText);
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Binance price:', data.price);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Binance API route error:', error);
    // Return fallback price
    return NextResponse.json({ 
      symbol: 'SOLUSDT', 
      price: '87.60' 
    });
  }
}
