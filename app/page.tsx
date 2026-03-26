// app/page.tsx

import Image from 'next/image';
import { ArbitrageCard } from '../components/arbitrage/ArbitrageCard';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-4">
      {/* Header with Logo */}
      <div className="max-w-4xl mx-auto text-center mb-8">
        <div className="flex flex-col items-center justify-center gap-4">
          {/* Logo */}
          <div className="relative w-24 h-24 md:w-32 md:h-32">
            <Image
              src="/logo.png"
              alt="Oberon Logo"
              fill
              className="object-contain rounded-full shadow-2xl shadow-purple-500/50"
              priority
            />
          </div>
          
          {/* Title */}
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
              OBERON
            </h1>
            <p className="text-gray-400 text-sm md:text-base">
              Sleep. We hunt.
            </p>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <ArbitrageCard />

      {/* Footer */}
      <footer className="max-w-4xl mx-auto text-center mt-8 text-gray-600 text-xs">
        <p>Real-time Solana arbitrage scanner</p>
      </footer>
    </main>
  );
}
