// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Gamepad2, User, Trophy, Search, Hash, 
  Grid3X3, Video, Ghost, Swords, 
  Skull, Activity, Bomb, LayoutList, ShoppingCart,
  Brain, Circle, Anchor, Layers, DollarSign, Share2
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import AdSpace from '@/components/AdSpace';
import { useAudio } from '@/contexts/AudioContext';

// --- CONFIGURACIÓN DE TUS 17 JUEGOS ---
const GAMES = [
  // 1. UNO (VISUAL ESPECIAL)
  {
    id: 'uno', 
    title: 'UNO', 
    slogan: 'EL POPULAR JUEGO DE CARTAS', 
    href: '/game/uno', 
    icon: Layers, color: 'red', border: 'border-red-500', shadow: 'shadow-red-500/20', text: 'text-red-400', bg: 'bg-red-950/20'
  },
  // 2. BATTLESHIP (CAMBIO DE NOMBRE Y SLOGAN)
  {
    id: 'battleship', 
    title: 'HUNDIR LA FLOTA', // Antes Naval Elite
    slogan: 'FUEGO A DISCRECIÓN', // Slogan potente
    href: '/game/battleship', 
    icon: Anchor, color: 'cyan', border: 'border-cyan-500', shadow: 'shadow-cyan-500/20', text: 'text-cyan-400', bg: 'bg-cyan-950/20'
  },
  // 3. PIEDRA PAPEL TIJERA
  {
    id: 'rps', title: 'PIEDRA PAPEL TIJERA', slogan: 'CLÁSICO RÁPIDO', href: '/game/rps', 
    icon: Swords, color: 'pink', border: 'border-pink-500', shadow: 'shadow-pink-500/20', text: 'text-pink-400', bg: 'bg-pink-950/20'
  },
  // 4. TRES EN RAYA
  {
    id: 'tictactoe', title: '3 EN RAYA', slogan: 'DUELO MENTAL', href: '/game/tictactoe', 
    icon: Hash, color: 'teal', border: 'border-teal-500', shadow: 'shadow-teal-500/20', text: 'text-teal-400', bg: 'bg-teal-950/20'
  },
  // 5. SOLITARIO
  {
    id: 'solitaire', title: 'SOLITARIO PRO', slogan: 'CYBER DECK', href: '/game/solitaire', 
    icon: Layers, color: 'blue', border: 'border-blue-500', shadow: 'shadow-blue-500/20', text: 'text-blue-400', bg: 'bg-blue-950/20'
  },
  // 6. SNAKE (CAMBIO DE NOMBRE Y SLOGAN)
  {
    id: 'snake', 
    title: 'JUEGO DE LA SERPIENTE', // Antes Neon Snake
    slogan: 'COMO EN TU NOKIA', // Referencia Nokia
    href: '/game/snake', 
    icon: Activity, color: 'green', border: 'border-green-500', shadow: 'shadow-green-500/20', text: 'text-green-400', bg: 'bg-green-950/20'
  },
  // 7. SOPA DE LETRAS
  {
    id: 'wordsearch', title: 'SOPA DE LETRAS', slogan: 'BUSCA Y ENCUENTRA', href: '/game/wordsearch', 
    icon: Search, color: 'sky', border: 'border-sky-500', shadow: 'shadow-sky-500/20', text: 'text-sky-400', bg: 'bg-sky-950/20'
  },
  // 8. SUDOKU
  {
    id: 'sudoku', title: 'SUDOKU', slogan: 'LÓGICA PURA', href: '/game/sudoku', 
    icon: Grid3X3, color: 'indigo', border: 'border-indigo-500', shadow: 'shadow-indigo-500/20', text: 'text-indigo-400', bg: 'bg-indigo-950/20'
  },
  // 9. MEMORY (CAMBIO DE NOMBRE Y SLOGAN)
  {
    id: 'memory', 
    title: 'JUEGO DE LAS PAREJAS', // Antes Neon Memory
    slogan: 'MEMORIA VISUAL', // Slogan
    href: '/game/memory', 
    icon: Brain, color: 'fuchsia', border: 'border-fuchsia-500', shadow: 'shadow-fuchsia-500/20', text: 'text-fuchsia-400', bg: 'bg-fuchsia-950/20'
  },
  // 10. CONNECT 4
  {
    id: 'connect4', title: 'CONNECT 4', slogan: 'ESTRATEGIA VERTICAL', href: '/game/connect4', 
    icon: Circle, color: 'orange', border: 'border-orange-500', shadow: 'shadow-orange-500/20', text: 'text-orange-400', bg: 'bg-orange-950/20'
  },
  // 11. DOMINO (CAMBIO DE SLOGAN)
  {
    id: 'domino', 
    title: 'DOMINO', 
    slogan: 'GOLPE EN LA MESA', // Slogan potente
    href: '/game/domino', 
    icon: LayoutList, color: 'yellow', border: 'border-yellow-500', shadow: 'shadow-yellow-500/20', text: 'text-yellow-400', bg: 'bg-yellow-950/20'
  },
  // 12. TETRIS
  {
    id: 'tetris', title: 'TETRIX', slogan: 'ENCAJA LAS PIEZAS', href: '/game/tetris', 
    icon: Gamepad2, color: 'purple', border: 'border-purple-500', shadow: 'shadow-purple-500/20', text: 'text-purple-400', bg: 'bg-purple-950/20'
  },
  // 13. AHORCADO
  {
    id: 'hangman', title: 'EL AHORCADO', slogan: 'ADIVINA O MUERE', href: '/game/hangman', 
    icon: Skull, color: 'rose', border: 'border-rose-600', shadow: 'shadow-rose-600/20', text: 'text-rose-500', bg: 'bg-rose-950/20'
  },
  // 14. BUSCAMINAS
  {
    id: 'mines', title: 'BUSCAMINAS', slogan: 'RIESGO PURO', href: '/game/minesweeper', 
    icon: Bomb, color: 'pink', border: 'border-pink-500', shadow: 'shadow-pink-500/20', text: 'text-pink-400', bg: 'bg-pink-950/20'
  },
  // 15. BLACKJACK
  {
    id: 'blackjack', title: 'BLACKJACK', slogan: 'DESAFÍA LA BANCA', href: '/game/blackjack', 
    icon: DollarSign, color: 'emerald', border: 'border-emerald-500', shadow: 'shadow-emerald-500/20', text: 'text-emerald-400', bg: 'bg-emerald-950/20'
  },
  // 16. TIENDA
  {
    id: 'shop', title: 'TIENDA', slogan: 'SKINS & UPGRADES', href: '/shop', 
    icon: ShoppingCart, color: 'violet', border: 'border-violet-500', shadow: 'shadow-violet-500/20', text: 'text-violet-400', bg: 'bg-violet-950/20'
  },
  // 17. RANKING
  {
    id: 'ranking', title: 'RANKING', slogan: 'TOP MUNDIAL', href: '/leaderboard', 
    icon: Trophy, color: 'amber', border: 'border-amber-500', shadow: 'shadow-amber-500/20', text: 'text-amber-400', bg: 'bg-amber-950/20'
  }
];

export default function Home() {
  const [user, setUser] = useState(null);
  const { playSound } = useAudio();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const scrollToGames = () => {
    playSound('click');
    const section = document.getElementById('games-section');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  };

  const SoundLink = ({ href, className, children, onClick }) => (
    <Link 
      href={href} 
      className={className}
      onMouseEnter={() => playSound('hover')} 
      onClick={(e) => {
        playSound('click');
        if(onClick) onClick(e);
      }}
    >
      {children}
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono select-none overflow-x-hidden">
      
      {/* HEADER PRINCIPAL */}
      <div className="w-full max-w-[1400px] flex justify-between items-center mb-8 relative z-10 mt-4">
        <div>
           <h1 className="text-3xl md:text-5xl font-black text-white italic tracking-tighter">
             DAYTHA <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-600">RIVALS</span>
           </h1>
           <p className="text-[10px] md:text-xs text-slate-500 font-bold tracking-[0.4em] pl-1 uppercase mt-1">ARCADE COMPETITIVO</p>
        </div>
        
        <SoundLink href="/profile" className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-md pl-4 pr-1 py-1 rounded-full border border-slate-700 hover:border-pink-500 transition-all group shadow-lg">
           <span className="text-[10px] font-bold text-slate-300 group-hover:text-white hidden sm:block">
             {user ? 'MI PERFIL' : 'LOGIN'}
           </span>
           <div className="w-8 h-8 bg-gradient-to-tr from-pink-600 to-purple-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <User className="w-4 h-4 text-white" />
           </div>
        </SoundLink>
      </div>

      {/* SECCIÓN NIVEL */}
      <div className="w-full max-w-[1400px] mb-12 relative">
         <div className="flex justify-between items-end mb-4 px-2">
            <h2 className="text-sm font-bold text-slate-400 flex items-center gap-2 uppercase tracking-widest">
              <Trophy className="w-4 h-4 text-yellow-500"/> Zona de Retos
            </h2>
            <button onClick={scrollToGames} className="px-5 py-2 bg-slate-900 border border-slate-700 rounded-full text-[10px] font-bold text-white hover:bg-slate-800 hover:border-blue-500 transition flex items-center gap-2 group shadow-lg">
               <Share2 className="w-3 h-3 group-hover:text-blue-500 transition-colors" /> CREAR SALA
            </button>
         </div>

         <div className="w-full bg-gradient-to-r from-slate-900 to-slate-900/50 border border-slate-800 rounded-3xl p-8 relative overflow-hidden group shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all duration-1000"></div>
            <div className="relative z-10 flex justify-between items-center">
               <div>
                  <p className="text-[10px] text-blue-400 font-bold tracking-[0.2em] mb-2 uppercase">Tu Estado Actual</p>
                  <h3 className="text-4xl md:text-6xl font-black text-white italic tracking-tighter mb-4 drop-shadow-lg">NOVATO</h3>
                  <div className="h-2 w-48 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                     <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 w-[10%] shadow-[0_0_10px_cyan]"></div>
                  </div>
               </div>
               <Gamepad2 className="w-24 h-24 md:w-32 md:h-32 text-slate-800 group-hover:text-blue-500/10 transition-all duration-500 transform group-hover:scale-110 group-hover:rotate-12" />
            </div>
         </div>
      </div>

      {/* GRID DE JUEGOS */}
      <div id="games-section" className="w-full max-w-[1400px] pb-20">
         <div className="flex items-center gap-4 mb-6 px-2">
             <div className="h-px bg-slate-800 flex-1"></div>
             <p className="text-[10px] text-slate-500 font-bold tracking-[0.3em] uppercase">Selecciona tu Juego</p>
             <div className="h-px bg-slate-800 flex-1"></div>
         </div>
         
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {GAMES.map((game) => (
                <SoundLink 
                    key={game.id} 
                    href={game.href}
                    className={`group relative rounded-2xl border-2 ${game.border} bg-[#0a0f1e] p-6 flex flex-col items-center justify-center gap-4 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 hover:shadow-2xl ${game.shadow} overflow-hidden min-h-[180px]`}
                >
                    {/* Fondo Glow */}
                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b ${game.bg} to-transparent pointer-events-none`}></div>
                    
                    {/* ICONO (Personalizado para UNO, Standard para el resto) */}
                    {game.id === 'uno' ? (
                        <div className="relative z-10 w-16 h-20 group-hover:-translate-y-2 transition-transform duration-300 mb-2">
                            <div className="absolute inset-0 bg-yellow-500 rounded-lg border-2 border-white transform rotate-12 translate-x-4 shadow-md"></div>
                            <div className="absolute inset-0 bg-red-600 rounded-lg border-2 border-white transform -rotate-6 shadow-xl flex items-center justify-center z-10">
                                <div className="w-10 h-14 bg-white rounded-[50%] transform -rotate-12 flex items-center justify-center border border-red-200 shadow-inner">
                                        <span className="text-red-600 font-black text-2xl italic" style={{textShadow: '1px 1px 0 black'}}>1</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={`relative z-10 w-16 h-16 rounded-full border-2 ${game.border} flex items-center justify-center bg-black/50 backdrop-blur-sm group-hover:shadow-[0_0_20px_currentColor] ${game.text} transition-all duration-300`}>
                            <game.icon className="w-8 h-8" strokeWidth={1.5} />
                        </div>
                    )}

                    {/* Texto y Slogan */}
                    <div className="relative z-10 text-center space-y-2 w-full">
                        <h2 className={`text-xl font-black italic tracking-tighter text-white group-hover:tracking-widest transition-all duration-300 drop-shadow-md uppercase`}>
                            {game.title}
                        </h2>
                        <div className={`inline-block px-3 py-1 rounded-full border ${game.border} bg-black/40 backdrop-blur-sm`}>
                            <p className={`text-[8px] font-bold uppercase tracking-[0.2em] ${game.text}`}>
                                {game.slogan}
                            </p>
                        </div>
                    </div>
                </SoundLink>
            ))}
         </div>
      </div>

      <div className="w-full max-w-md opacity-40 hover:opacity-100 transition-opacity duration-500 pb-6 z-10">
          <AdSpace type="banner" />
      </div>

    </div>
  );
}