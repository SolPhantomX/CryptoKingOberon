// components/arbitrage/ArbitrageCard.tsx

'use client';

import { useState, useCallback, useMemo, memo, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { TrendingUp, TrendingDown, Loader2, Info } from 'lucide-react';
import { useArbitrage } from '../../hooks/useArbitrage';
import { SoundNotification } from '../SoundNotification';

const PriceColumn = memo(({ label, price }: { label: string; price: number }) => (
  <div className="text-center">
    <p className="text-sm text-gray-400">{label}</p>
    <p className="text-2xl font-bold text-white">${price.toFixed(2)}</p>
  </div>
));

PriceColumn.displayName = 'PriceColumn';

export const ArbitrageCard = memo(() => {
  const { data: opportunity, isLoading, error, mutate, isValidating } = useArbitrage(1);
  const [showDetails, setShowDetails] = useState(false);
  const [shouldPlaySound, setShouldPlaySound] = useState(false);
  const [prevProfitable, setPrevProfitable] = useState(false);

  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const handleClaim = useCallback(() => {
    if (!opportunity?.quote) return;
    console.log('Claim profit clicked', opportunity.quote);
    alert('Profit claimed! (test mode)');
  }, [opportunity?.quote]);

  const isProfitable = useMemo(() => 
    opportunity?.isProfitable ?? false, 
    [opportunity?.isProfitable]
  );

  // 🔊 Play sound when profitable opportunity appears
  useEffect(() => {
    if (isProfitable && !prevProfitable && !isLoading) {
      setShouldPlaySound(true);
      setTimeout(() => setShouldPlaySound(false), 1000);
    }
    setPrevProfitable(isProfitable);
  }, [isProfitable, prevProfitable, isLoading]);

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

  // Calculate derived values from new structure
  const spreadPercent = opportunity.netProfitPercent;
  const netProfitUSD = opportunity.netProfitUSD;
  const netProfitPercent = opportunity.netProfitPercent;
  const dexFeeUSD = opportunity.fees?.dexFeeUSD ?? 0;
  const networkFeeUSD = opportunity.fees?.networkFeeUSD ?? 0;
  const priceImpactUSD = opportunity.fees?.priceImpactUSD ?? 0;
  const slippageUSD = opportunity.fees?.slippageUSD ?? 0;
  const totalFeesUSD = opportunity.fees?.totalUSD ?? 0;

  return (
    <>
      <SoundNotification playSound={shouldPlaySound} volume={0.7} />

      <Card className={`max-w-md mx-auto transition-all bg-[#1A1A2E] border ${
        isProfitable 
          ? 'border-green-500/50 shadow-lg shadow-green-500/10' 
          : 'border-purple-500/20'
      }`}>
        <CardContent className="pt-6">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <img src="/logo.png" alt="Oberon" className="w-10 h-10 rounded-full" />
              <Badge variant="outline" className="text-purple-400 border-purple-500">
                OBERON
              </Badge>
              {isValidating && <Loader2 className="h-3 w-3 animate-spin text-purple-400" />}
            </div>
            <p className="text-xs text-gray-500">{opportunity.tokenSymbol} / SOL</p>
          </div>

          {/* Trade info */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center">
              <p className="text-sm text-gray-400">Amount SOL</p>
              <p className="text-2xl font-bold text-white">{opportunity.amountSOL.toFixed(4)} SOL</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-400">Trade Value</p>
              <p className="text-2xl font-bold text-white">${opportunity.tradeValueUSD.toFixed(2)}</p>
            </div>
          </div>

          {/* Spread indicator */}
          <div className="flex items-center justify-center gap-2 mb-4">
            {netProfitUSD > 0 ? (
              <>
                <TrendingUp className="h-5 w-5 text-green-500" />
                <span className="text-xl font-bold text-green-500">
                  +{netProfitPercent.toFixed(2)}%
                </span>
              </>
            ) : (
              <>
                <TrendingDown className="h-5 w-5 text-red-500" />
                <span className="text-xl font-bold text-red-500">
                  {netProfitPercent.toFixed(2)}%
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
              {isProfitable 
                ? `💰 Clean Profit $${netProfitUSD.toFixed(2)}` 
                : '💤 Waiting for Signal'}
            </p>
          </div>

          {/* Main button */}
          <Button
            className="w-full h-12 text-lg bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 disabled:opacity-50"
            disabled={!isProfitable || isValidating}
            onClick={handleClaim}
          >
            {isValidating ? (
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
              {showDetails ? 'Hide details' : 'Show details'}
            </button>

            {showDetails && (
              <div className="mt-3 text-xs text-left text-gray-400 space-y-1 p-3 bg-purple-900/10 rounded-lg border border-purple-500/10">
                <p>📊 Net profit: <span className="text-green-400">${netProfitUSD.toFixed(2)}</span> ({netProfitPercent.toFixed(1)}%)</p>
                <p>💰 Gross profit: ${opportunity.grossProfitUSD.toFixed(2)}</p>
                <p>💸 Dex fee: ${dexFeeUSD.toFixed(2)}</p>
                <p>📉 Slippage: ${slippageUSD.toFixed(2)}</p>
                <p>⚡ Price impact: ${priceImpactUSD.toFixed(2)}</p>
                <p>⛽ Network fee: ${networkFeeUSD.toFixed(4)}</p>
                <p>💵 Total fees: ${totalFeesUSD.toFixed(2)}</p>
                <p className="text-purple-400 mt-1">Min required profit: ${opportunity.minRequiredProfitUSD.toFixed(2)}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-600 mt-6">
            Sleep. We hunt.
          </p>
        </CardContent>
      </Card>
    </>
  );
});

ArbitrageCard.displayName = 'ArbitrageCard';
