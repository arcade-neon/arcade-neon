// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Zap, Crown, Gem, Star, DollarSign, 
  Target, Rocket, Flame, RotateCw, Play, Pause, Coins, Info 
} from 'lucide-react';
import { useEconomy } from '@/contexts/EconomyContext'; 
import { useAudio } from '@/contexts/AudioContext';
import AdSpace from '@/components/AdSpace';

// --- CONFIGURACIÓN DE SÍMBOLOS Y PREMIOS ---
const SYMBOLS = [
  { id: 'cherry', icon: Target, color: 'text-red-500', weight: 40 },   // Común
  { id: 'lemon', icon: Zap, color: 'text-yellow-400', weight: 30 },    // Poco común
  { id: 'star', icon: Star, color: 'text-purple-400', weight: 20 },    // Raro
  { id: 'diamond', icon: Gem, color: 'text-cyan-400', weight: 10 },    // Muy raro
  { id: 'seven', icon: DollarSign, color: 'text-green-400', weight: 5 }, // Épico
  { id: 'jackpot', icon: Crown, color: 'text-amber-400', weight: 1 }   // Legendario
];

const PAYTABLE = {
  'jackpot': 500, // x500
  'seven': 100,   // x100
  'diamond': 50,  // x50
  'star': 20,     // x20
  'lemon': 10,    // x10
  'cherry': 5     // x5
};

// Generador de rodillo ponderado (más difícil sacar los buenos)
const getRandomSymbol = () => {
  const totalWeight = SYMBOLS.reduce((acc, s) => acc + s.weight, 0);
  let random = Math.random() * totalWeight;
  for (const s of SYMBOLS) {
    if (random < s.weight) return s;
    random -= s.weight;
  }
  return SYMBOLS[0];
};

export default function NeonSlots() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();

  const [reels, setReels] = useState([SYMBOLS[0], SYMBOLS[1], SYMBOLS[2]]);
  const [spinning, setSpinning] = useState([false, false, false]);
  const [bet, setBet] = useState(50);
  const [autoSpin, setAutoSpin] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [winLine, setWinLine] = useState(false); // Efecto visual de línea ganadora

  const spinIntervals = useRef([]);

  // --- LÓGICA DE GIRO ---
  const spin = async () => {
    if (coins < bet) {
      setAutoSpin(false);
      return alert("Sin monedas suficientes");
    }
    if (spinning.some(s => s)) return; // Evitar doble click

    const paid = await spendCoins(bet, "Slots Spin");
    if (!paid) return;

    setLastWin(0);
    setWinLine(false);
    playSound('spin'); // Sonido de inicio

    // Activar giro visual
    setSpinning([true, true, true]);

    // Resultados predeterminados (el backend o la lógica decide aquí)
    const result = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];

    // Parada secuencial de rodillos (Efecto cascada)
    // Rodillo 1: para en 500ms
    spinIntervals.current[0] = setTimeout(() => {
        setReels(prev => [result[0], prev[1], prev[2]]);
        setSpinning(prev => [false, true, true]);
        playSound('stop'); // Click rodillo
    }, 500);

    // Rodillo 2: para en 1000ms
    spinIntervals.current[1] = setTimeout(() => {
        setReels(prev => [prev[0], result[1], prev[2]]);
        setSpinning(prev => [false, false, true]);
        playSound('stop');
    }, 1000);

    // Rodillo 3: para en 1500ms y checkea premio
    spinIntervals.current[2] = setTimeout(() => {
        setReels(result); // Estado final
        setSpinning([false, false, false]);
        playSound('stop');
        checkWin(result);
    }, 1500);
  };

  const checkWin = (finalReels) => {
    const [r1, r2, r3] = finalReels;
    
    // Lógica simple: 3 Iguales
    if (r1.id === r2.id && r2.id === r3.id) {
        const multiplier = PAYTABLE[r1.id];
        const winAmount = bet * multiplier;
        
        setLastWin(winAmount);
        setWinLine(true);
        addCoins(winAmount, `Slots Win (${r1.id})`);
        
        if (multiplier >= 50) playSound('jackpot'); // Sonido especial
        else playSound('win');

    } else if (r1.id === r2.id || r2.id === r3.id || r1.id === r3.id) {
        // Opcional: Premio consuelo por 2 iguales (ej. recuperar apuesta)
        // Por ahora lo dejamos Hardcore: Solo 3 iguales ganan.
        if (autoSpin) setTimeout(spin, 1000);
    } else {
        // Perdió
        if (autoSpin) setTimeout(spin, 500);
    }
  };

  // Auto Spin Toggle
  useEffect(() => {
      if (autoSpin && !spinning.some(s => s) && lastWin === 0) {
          spin();
      }
  }, [autoSpin]); // Dependencia simplificada para evitar bucles infinitos

  // Limpiar timeouts al salir
  useEffect(() => {
      return () => spinIntervals.current.forEach(clearTimeout);
  }, []);

  // --- RENDER RODILLO ---
  const Reel = ({ symbol, isSpinning, index }) => {
      const Icon = symbol.icon;
      return (
          <div className="relative h-32 w-24 bg-black border-x-4 border-slate-800 flex items-center justify-center overflow-hidden shadow-inner">
              {/* Efecto de sombra interior para profundidad */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/80 z-20 pointer-events-none"></div>
              
              <div className={`flex flex-col items-center gap-8 ${isSpinning ? 'animate-slot-spin blur-sm' : 'animate-bounce-short'}`}>
                  {/* Icono Principal */}
                  <Icon className={`w-16 h-16 ${symbol.color} drop-shadow-[0_0_15px_currentColor] filter`} />
                  
                  {/* Iconos falsos para el efecto de movimiento (solo visibles si isSpinning es true vía CSS animation) */}
                  {isSpinning && (
                      <>
                          <Zap className="w-16 h-16 text-yellow-400 opacity-50"/>
                          <Crown className="w-16 h-16 text-amber-400 opacity-50"/>
                      </>
                  )}
              </div>
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono text-white select-none">
        
        {/* ESTILOS ANIMACIÓN CSS EN LÍNEA PARA NO DEPENDER DE TAILWIND CONFIG */}
        <style jsx>{`
            @keyframes slot-spin {
                0% { transform: translateY(0); }
                100% { transform: translateY(-100%); }
            }
            .animate-slot-spin {
                animation: slot-spin 0.1s linear infinite;
            }
            @keyframes bounce-short {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }
            .animate-bounce-short {
                animation: bounce-short 0.3s ease-out;
            }
        `}</style>

        {/* HEADER */}
        <div className="w-full max-w-xl flex justify-between items-center mb-8 z-10 mt-4">
            <Link href="/" className="p-3 bg-slate-900 rounded-full border border-slate-700 hover:border-purple-500 transition shadow-lg"><ArrowLeft className="w-5 h-5 text-slate-400"/></Link>
            <div className="text-center">
                <h1 className="text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 tracking-tighter drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]">
                    NEON SLOTS
                </h1>
                <p className="text-[10px] text-purple-400 font-bold tracking-[0.5em] uppercase">JACKPOT CITY</p>
            </div>
            <div className="bg-slate-900 px-4 py-2 rounded-full border border-slate-700 flex items-center gap-2 shadow-lg">
                <Coins className="w-4 h-4 text-yellow-500"/>
                <span className="font-bold text-yellow-500">{coins}</span>
            </div>
        </div>

        {/* MÁQUINA TRAGAPERRAS */}
        <div className="relative w-full max-w-xl bg-slate-900 p-6 rounded-3xl border-4 border-slate-800 shadow-[0_0_50px_rgba(168,85,247,0.2)]">
            
            {/* DISPLAY PREMIO */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black border-2 border-slate-700 px-8 py-2 rounded-xl shadow-xl z-20 flex flex-col items-center min-w-[200px]">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">ÚLTIMO PREMIO</span>
                <span className={`text-2xl font-black ${lastWin > 0 ? 'text-green-400 animate-pulse' : 'text-slate-700'}`}>
                    {lastWin > 0 ? `+${lastWin}` : '0'}
                </span>
            </div>

            {/* MARCO DE RODILLOS */}
            <div className={`flex justify-center gap-1 bg-black p-4 rounded-xl border-4 ${winLine ? 'border-yellow-500 shadow-[0_0_30px_#eab308]' : 'border-purple-900'} relative overflow-hidden transition-all duration-300`}>
                <Reel symbol={reels[0]} isSpinning={spinning[0]} index={0} />
                <div className="w-1 h-32 bg-slate-900 z-10"></div> {/* Separador */}
                <Reel symbol={reels[1]} isSpinning={spinning[1]} index={1} />
                <div className="w-1 h-32 bg-slate-900 z-10"></div> {/* Separador */}
                <Reel symbol={reels[2]} isSpinning={spinning[2]} index={2} />
                
                {/* LÍNEA DE PAGO (Visual) */}
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-red-500/30 pointer-events-none z-30"></div>
                
                {winLine && (
                    <div className="absolute inset-0 bg-yellow-500/10 z-30 animate-pulse pointer-events-none"></div>
                )}
            </div>

            {/* PANEL DE CONTROL */}
            <div className="mt-8 grid grid-cols-2 gap-4">
                
                {/* APUESTA */}
                <div className="bg-black/40 p-4 rounded-2xl border border-slate-700">
                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Apuesta</p>
                    <div className="flex items-center justify-between">
                        <button onClick={() => setBet(Math.max(10, bet - 10))} disabled={spinning.some(s=>s)} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-red-400 font-bold">-</button>
                        <span className="text-xl font-black text-white">{bet}</span>
                        <button onClick={() => setBet(bet + 10)} disabled={spinning.some(s=>s)} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-green-400 font-bold">+</button>
                    </div>
                    <div className="flex justify-between mt-2 gap-1">
                        <button onClick={() => setBet(50)} className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400">MIN</button>
                        <button onClick={() => setBet(100)} className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400">100</button>
                        <button onClick={() => setBet(500)} className="text-[10px] bg-slate-800 px-2 py-1 rounded text-yellow-500 font-bold">MAX</button>
                    </div>
                </div>

                {/* ACCIONES */}
                <div className="flex flex-col gap-2">
                    <button 
                        onClick={spin} 
                        disabled={spinning.some(s=>s) || autoSpin}
                        className={`flex-1 rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2
                            ${spinning.some(s=>s) ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white shadow-purple-500/20'}
                        `}
                    >
                        {spinning.some(s=>s) ? 'GIRANDO...' : <><RotateCw className="w-6 h-6"/> GIRAR</>}
                    </button>
                    
                    <button 
                        onClick={() => setAutoSpin(!autoSpin)} 
                        disabled={spinning.some(s=>s) && !autoSpin}
                        className={`py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border-2 transition-all
                            ${autoSpin ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}
                        `}
                    >
                        {autoSpin ? <><Pause className="w-3 h-3"/> DETENER AUTO</> : <><Play className="w-3 h-3"/> AUTO SPIN</>}
                    </button>
                </div>
            </div>
        </div>

        {/* TABLA DE PAGOS (INFO) */}
        <div className="w-full max-w-xl mt-8">
            <div className="flex items-center gap-2 mb-4">
                <Info className="w-4 h-4 text-slate-500"/>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">TABLA DE PAGOS (3 IGUALES)</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {SYMBOLS.slice().reverse().map((s) => (
                    <div key={s.id} className="bg-slate-900/50 border border-slate-800 p-2 rounded-lg flex items-center justify-between">
                        <s.icon className={`w-5 h-5 ${s.color}`}/>
                        <span className="text-xs font-black text-slate-300">x{PAYTABLE[s.id]}</span>
                    </div>
                ))}
            </div>
        </div>

        <div className="mt-auto opacity-50"><AdSpace type="banner" /></div>
    </div>
  );
}