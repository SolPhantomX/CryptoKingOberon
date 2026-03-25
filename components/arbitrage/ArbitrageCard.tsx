// components/arbitrage/ArbitrageCard.tsx

'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Loader2, Info } from 'lucide-react';
import { useArbitrage } from '@/hooks/useArbitrage';

export function ArbitrageCard() {
  const { data: opportunity, isLoading, error, mutate } = useArbitrage(1);
  const [showDetails, setShowDetails] = useState(false);
  
  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);
  
  if (isLoading) {
    return (
      <Card className="max-w-md mx-auto bg-[#1A1A2E] border-purple-500/20">
        <CardContent className="pt-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-400" />
          <p className="mt-2 text-gray-400">Scanning markets...</p>
        </CardContent>
      </Card>
    );
  }
  
  if (error || !opportunity) {
    return (
      <Card className="max-w-md mx-auto bg-[#1A1A2E] border-red-500/20">
        <CardContent className="pt-6 text-center">
          <p className="text-red-400">Failed to fetch arbitrage data</p>
          <Button variant="outline" onClick={handleRefresh} className="mt-4">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  const isProfitable = opportunity.buttonEnabled;
  
  return (
    <Card className={`max-w-md mx-auto transition-all bg-[#1A1A2E] border ${isProfitable ? 'border-green-500/50 shadow-lg shadow-green-500/10' : 'border-purple-500/20'}`}>
      <CardContent className="pt-6">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-2xl">👑</span>
            <Badge variant="outline" className="text-purple-400 border-purple-500">
              OBERON
            </Badge>
          </div>
          <p className="text-xs text-gray-500">{opportunity.pair}</p>
        </div>
        
        {/* Price columns */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="text-center">
            <p className="text-sm text-gray-400">Binance</p>
            <p className="text-2xl font-bold text-white">${opportunity.binancePrice.toFixed(2)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-400">Jupiter</p>
            <p className="text-2xl font-bold text-white">${opportunity.jupiterPrice.toFixed(2)}</p>
          </div>
        </div>
        
        {/* Spread indicator */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {opportunity.spreadPercent > 0 ? (
            <>
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="text-xl font-bold text-green-500">+{opportunity.spreadPercent.toFixed(2)}%</span>
            </>
          ) : (
            <>
              <TrendingDown className="h-5 w-5 text-red-500" />
              <span className="text-xl font-bold text-red-500">{opportunity.spreadPercent.toFixed(2)}%</span>
            </>
          )}
        </div>
        
        {/* Action message */}
        <div className={`text-center mb-4 p-3 rounded-lg border ${isProfitable ? 'bg-green-900/20 border-green-500/30' : 'bg-purple-900/20 border-purple-500/20'}`}>
          <p className={`text-lg font-semibold ${isProfitable ? 'text-green-400' : 'text-gray-400'}`}>
            {opportunity.suggestedAction}
          </p>
        </div>
        
        {/* Main button */}
        <Button
          className="w-full h-12 text-lg bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 disabled:opacity-50"
          disabled={!isProfitable}
          onClick={() => {
            // TODO: Open Jupiter swap modal
            console.log('Claim profit clicked', opportunity.quote);
          }}
        >
          {isProfitable ? '💰 Claim Profit' : '💤 Waiting for Signal'}
        </Button>
        
        {/* Details toggle */}
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-gray-500 hover:text-purple-400 transition flex items-center justify-center gap-1"
          >
            <Info className="h-3 w-3" />
            {showDetails ? 'Hide details' : 'Why this amount?'}
          </button>
          
          {showDetails && (
            <div className="mt-3 text-xs text-left text-gray-400 space-y-1 p-3 bg-purple-900/10 rounded-lg border border-purple-500/10">
              <p>📊 Net profit: <span className="text-green-400">${opportunity.netProfitUSD.toFixed(2)}</span> ({opportunity.netProfitPercent.toFixed(1)}%)</p>
              <p>💸 Trading fees: ${opportunity.tradingFeesUSD.toFixed(2)}</p>
              <p>🚚 Withdrawal fee: ${opportunity.withdrawalFeeUSD.toFixed(2)}</p>
              <p>⛽ Gas fee: ${opportunity.gasFeeUSD.toFixed(4)}</p>
              <p>{opportunity.liquidity.message}</p>
              {opportunity.networkCompatibility.warning && (
                <p className="text-yellow-500">{opportunity.networkCompatibility.warning}</p>
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <p className="text-center text-xs text-gray-600 mt-4">
          Sleep. We hunt.
        </p>
      </CardContent>
    </Card>
  );
}
