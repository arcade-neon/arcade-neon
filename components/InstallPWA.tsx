// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    // Escuchar el evento de instalación (solo Android y Chrome/Edge PC)
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowButton(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Ocultar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowButton(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowButton(false);
    }
    setDeferredPrompt(null);
  };

  if (!showButton) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-10 duration-500 w-[90%] max-w-sm">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-emerald-500/30 p-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
            <Smartphone className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-white text-xs font-black uppercase tracking-tighter">Daytha Rivals App</h4>
            <p className="text-[10px] text-slate-400 font-bold">Instala para jugar mejor</p>
          </div>
        </div>
        
        <div className="flex gap-2">
            <button 
                onClick={handleInstallClick}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black px-4 py-2 rounded-xl transition-all shadow-lg shadow-emerald-900/20 active:scale-95 uppercase tracking-widest"
            >
                Instalar
            </button>
            <button onClick={() => setShowButton(false)} className="p-2 text-slate-500 hover:text-white transition">
                <X className="w-4 h-4" />
            </button>
        </div>
      </div>
    </div>
  );
}