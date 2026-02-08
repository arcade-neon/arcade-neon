'use client';
import React, { useEffect, useState } from 'react';
import { useEconomy } from '@/contexts/EconomyContext';
import { Plus, Coins } from 'lucide-react';
import { auth } from '@/lib/firebase';

export default function WalletBar() {
  const { coins, addCoins, loading } = useEconomy();
  const [animate, setAnimate] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
     auth.onAuthStateChanged(setUser);
  }, []);

  // Efecto de rebote cuando cambian las monedas
  useEffect(() => {
    setAnimate(true);
    const t = setTimeout(() => setAnimate(false), 300);
    return () => clearTimeout(t);
  }, [coins]);

  // Función trampa para ver anuncios (Demo)
  const watchAd = () => {
    if(confirm("📺 ¿Ver anuncio publicitario para ganar 50 Monedas?")) {
        // Aquí iría la lógica real de AdMob/Google Ads
        setTimeout(() => {
            addCoins(50, "Ad Reward");
            alert("¡Recompensa recibida!");
        }, 2000);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
      {/* Contenedor de Monedas */}
      <div 
        className={`bg-slate-900/90 backdrop-blur-md border border-yellow-500/30 rounded-full py-1.5 px-4 flex items-center gap-3 shadow-[0_0_15px_rgba(234,179,8,0.2)] transition-transform duration-300 ${animate ? 'scale-110 border-yellow-400' : ''}`}
      >
        <div className="relative">
            <Coins className={`w-5 h-5 text-yellow-400 ${animate ? 'animate-spin' : ''}`} />
            {/* Brillo */}
            <div className="absolute inset-0 bg-yellow-400 blur-md opacity-40 animate-pulse"></div>
        </div>
        
        <span className="font-mono font-black text-yellow-100 text-sm tracking-wider">
            {coins.toLocaleString()}
        </span>
      </div>

      {/* Botón rápido para ganar más (Ads) */}
      <button 
        onClick={watchAd}
        className="bg-green-600 hover:bg-green-500 text-white rounded-full p-1.5 shadow-lg transition-transform hover:scale-110 active:scale-95 border border-green-400"
        title="Ganar Monedas Gratis"
      >
        <Plus className="w-4 h-4 font-bold" />
      </button>
    </div>
  );
}