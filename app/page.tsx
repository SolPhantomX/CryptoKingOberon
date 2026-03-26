// app/page.tsx

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-900 p-4 text-center">
      {/* Logo */}
      <img 
        src="/logo.png" 
        alt="Logo" 
        className="w-24 h-24 mx-auto rounded-full mb-4"
      />
      
      {/* Title */}
      <h1 className="text-3xl font-bold text-white mb-2">OBERON</h1>
      <p className="text-gray-400 mb-8">Sleep. We hunt.</p>
      
      {/* Card will go here */}
      <div className="text-gray-500">Loading arbitrage scanner...</div>
    </main>
  );
}
