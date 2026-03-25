// app/api/arbitrage/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getArbitrageOpportunity } from '@/lib/core/price-engine';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const amount = parseFloat(searchParams.get('amount') || '1');
    
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount. Must be a positive number.' },
        { status: 400 }
      );
    }
    
    const opportunity = await getArbitrageOpportunity(amount);
    
    // Cache on Vercel Edge Network for 5 seconds
    return NextResponse.json(opportunity, {
      headers: {
        'Cache-Control': 's-maxage=5, stale-while-revalidate=10',
      },
    });
    
  } catch (error) {
    console.error('Arbitrage API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
