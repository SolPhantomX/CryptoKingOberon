// app/page.tsx

import { ArbitrageCard } from '@/components/arbitrage/ArbitrageCard';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0A0A1A] to-[#1A1A2E] flex items-center justify-center p-4">
      <ArbitrageCard />
    </main>
  );
}
