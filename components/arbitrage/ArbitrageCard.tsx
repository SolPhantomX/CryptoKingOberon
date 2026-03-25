'use client';

import { useState, useCallback, useMemo, memo, useRef } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { TrendingUp, TrendingDown, Loader2, Info, RefreshCw } from 'lucide-react';
import { useArbitrage } from '../../hooks/useArbitrage';

const formatPrice = (price: number | null | undefined): string => {
  if (price === null || price === undefined || isNaN(price)) {
    return '—';
  }
  return `$${price.toFixed(2)}`;
};

const PriceColumn = memo(({ label, price }: { label: string; price: number | null | undefined }) => (
  <div className="text-center">
    <p className="text-sm text-gray-400">{label}</p>
    <p className="text-2xl font-bold text-white">{formatPrice(price)}</p>
  </div>
));

PriceColumn.displayName = 'PriceColumn';

export const ArbitrageCard = memo(() => {
  const { data: opportunity, isLoading, error, mutate, isValidating } = useArbitrage(1);
  const [showDetails, setShowDetails] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const lastRefreshRef = useRef<number>(0);

  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 1000) {
      return;
    }
    lastRefreshRef.current = now;
    mutate();
  }, [mutate]);

  const handleClaim = useCallback(async () => {
    if (!opportunity?.quote || isClaiming || !opportunity.buttonEnabled) return;
    
    setIsClaiming(true);
    try {
      console.log('Claim profit clicked', opportunity.quote);
      // TODO: Add actual swap logic here
      alert('Profit claimed! (test mode)');
    } catch (err) {
      console.error('Claim failed:', err);
      alert('Failed to claim profit');
    } finally {
      setIsClaiming(false);
    }
  }, [opportunity?.quote, opportunity?.buttonEnabled, isClaiming]);

  const isProfitable = useMemo(() => 
    opportunity?.buttonEnabled ?? false, 
    [opportunity?.buttonEnabled]
  );

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

  return (
    <Card className={`max-w-md mx-auto transition-all bg-[#1A1A2E] border ${
      isProfitable 
        ? 'border-green-500/50 shadow-lg shadow-green-500/10' 
        : 'border-purple-500/20'
    }`}>
      <CardContent className="pt-6">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-2xl">👑</span>
            <Badge variant="outline" className="text-purple-400 border-purple-500">
              OBERON
            </Badge>
            {isValidating && <Loader2 className="h-3 w-3 animate-spin text-purple-400" />}
          </div>
          <p className="text-xs text-gray-500">{opportunity.pair}</p>
        </div>

        {/* Price columns */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <PriceColumn label="Binance" price={opportunity.binancePrice} />
          <PriceColumn label="Jupiter" price={opportunity.jupiterPrice} />
        </div>

        {/* Spread indicator */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {opportunity.spreadPercent > 0 ? (
            <>
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="text-xl font-bold text-green-500">
                +{opportunity.spreadPercent.toFixed(2)}%
              </span>
            </>
          ) : (
            <>
              <TrendingDown className="h-5 w-5 text-red-500" />
              <span className="text-xl font-bold text-red-500">
                {opportunity.spreadPercent.toFixed(2)}%
              </span>
            </>
          )}
        </div>

        {/* Action message */}
        <div className={`text-center mb-4 p-3 rounded-lg border ${
          isProfitable 
            ? 'bg-green-900/20 border-green-500/30' 
            : 'bg-purple-900/20 border-purple-500/20'
        }`}>
          <p className={`text-lg font-semibold ${isProfitable ? 'text-green-400' : 'text-gray-400'}`}>
            {opportunity.suggestedAction}
          </p>
        </div>

        {/* Main button */}
        <Button
          className="w-full h-12 text-lg bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 disabled:opacity-50"
          disabled={!isProfitable || isValidating || isClaiming}
          onClick={handleClaim}
        >
          {isClaiming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Claiming...
            </>
          ) : isValidating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Updating...
            </>
          ) : isProfitable ? (
            '💰 Claim Profit'
          ) : (
            '💤 Waiting for Signal'
          )}
        </Button>

        {/* Details toggle */}
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-gray-500 hover:text-purple-400 transition flex items-center justify-center gap-1 mx-auto"
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
        <div className="text-center mt-6">
          <button
            onClick={handleRefresh}
            disabled={isValidating}
            className="text-xs text-gray-600 hover:text-purple-400 transition flex items-center justify-center gap-1 mx-auto disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isValidating ? 'animate-spin' : ''}`} />
            Sleep. We hunt.
          </button>
        </div>
      </CardContent>
    </Card>
  );
});

ArbitrageCard.displayName = 'ArbitrageCard';
