// app/layout.tsx

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Oberon — SleepTrader',
  description: 'Earn while you sleep. One button. Real profit.',
  keywords: 'arbitrage, solana, jupiter, binance, crypto trading',
  authors: [{ name: 'Oberon' }],
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  themeColor: '#0A0A1A',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
