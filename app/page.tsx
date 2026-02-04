// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Gamepad2, User, Trophy, Search, Hash, 
  Grid3X3, Video, Gamepad, Ghost, Swords, 
  Skull, Type, Activity, Bomb, LayoutList, // <--- AHORA SÍ ESTÁ AÑADIDO
  Brain, Circle, Share2
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import AdSpace from '@/components/AdSpace';

export default function Home() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const scrollToGames = () => {
    const section = document.getElementById('games-section');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono select-none overflow-x-hidden">
      
      {/* BANNER PUBLICIDAD SUPERIOR */}
      <div className="w-full max-w-4xl h-24 bg-slate-900/50 rounded-xl border border-dashed border-slate-800 mb-8 flex items-center justify-center overflow-hidden">
         <AdSpace type="banner" />
      </div>

      {/* HEADER PRINCIPAL */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-8 relative z-10">
        <div>
           <h1 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter">
             CHAMI<span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-600">ARCADE</span>
           </h1>
           <p className="text-[10px] md:text-xs text-slate-500 font-bold tracking-[0.3em] pl-1">JUEGOS TÓXICOS</p>
        </div>
        
        {/* BOTÓN PERFIL */}
        <Link href="/profile" className="flex items-center gap-3 bg-slate-900 pl-4 pr-1 py-1 rounded-full border border-slate-800 hover:border-pink-500 transition-all group shadow-lg">
           <span className="text-[10px] font-bold text-slate-300 group-hover:text-white hidden sm:block">
             {user ? 'MI PERFIL' : 'LOGIN'}
           </span>
           <div className="w-8 h-8 bg-gradient-to-tr from-pink-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <User className="w-4 h-4 text-white" />
           </div>
        </Link>
      </div>

      {/* SECCIÓN HERO / NIVEL */}
      <div className="w-full max-w-4xl mb-12 relative">
         <div className="flex justify-between items-end mb-4">
            <h2 className="text-xl font-bold text-yellow-500 flex items-center gap-2">
              ZONA DE RETOS
            </h2>
            {/* BOTÓN CREAR SALA */}
            <button onClick={scrollToGames} className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-full text-[10px] font-bold text-white hover:bg-slate-800 hover:border-blue-500 transition flex items-center gap-2 group">
               <Share2 className="w-3 h-3 group-hover:text-blue-500 transition-colors" /> CREAR SALA
            </button>
         </div>

         <div className="w-full bg-gradient-to-r from-slate-900 to-slate-900/50 border border-slate-800 rounded-3xl p-8 relative overflow-hidden group">
            {/* Efecto de fondo */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-all duration-1000"></div>
            
            <div className="relative z-10 flex justify-between items-center">
               <div>
                  <p className="text-[10px] text-slate-500 font-bold tracking-widest mb-1">TU NIVEL ACTUAL</p>
                  <h3 className="text-4xl md:text-5xl font-black text-white mb-2">NOVATO</h3>
                  <div className="h-1.5 w-32 bg-slate-800 rounded-full overflow-hidden">
                     <div className="h-full bg-blue-500 w-[10%]"></div>
                  </div>
               </div>
               <Trophy className="w-16 h-16 md:w-24 md:h-24 text-slate-800 group-hover:text-blue-500/20 transition-all duration-500" />
            </div>
         </div>
      </div>

      {/* GRID DE JUEGOS */}
      <div id="games-section" className="w-full max-w-4xl">
         <p className="text-[10px] text-slate-500 font-bold tracking-widest mb-6 uppercase">Arcade Disponible</p>
         
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* PIEDRA PAPEL TIJERA */}
            <Link href="/game/rps" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-pink-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="absolute top-4 right-4 px-2 py-1 bg-pink-900/30 border border-pink-500/30 rounded text-[9px] text-pink-400 font-bold">VS CPU/ONLINE</div>
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-pink-500/50 group-hover:shadow-[0_0_20px_rgba(236,72,153,0.4)] transition-all">
                 <Swords className="w-10 h-10 text-pink-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">PIEDRA PAPEL TIJERA</h2>
            </Link>

            {/* TRES EN RAYA */}
            <Link href="/game/tictactoe" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-cyan-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="absolute top-4 right-4 px-2 py-1 bg-cyan-900/30 border border-cyan-500/30 rounded text-[9px] text-cyan-400 font-bold">ONLINE</div>
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-cyan-500/50 group-hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all">
                 <Hash className="w-10 h-10 text-cyan-400" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">NEON 3 EN RAYA</h2>
            </Link>

            {/* NEON SNAKE */}
            <Link href="/game/snake" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-green-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="absolute top-4 right-4 px-2 py-1 bg-green-900/30 border border-green-500/30 rounded text-[9px] text-green-400 font-bold">RANKING</div>
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-green-500/50 group-hover:shadow-[0_0_20px_rgba(74,222,128,0.4)] transition-all">
                 <Activity className="w-10 h-10 text-green-400" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">NEON SNAKE</h2>
            </Link>

            {/* SOPA DE LETRAS */}
            <Link href="/game/wordsearch" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-blue-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="absolute top-4 right-4 px-2 py-1 bg-blue-900/30 border border-blue-500/30 rounded text-[9px] text-blue-400 font-bold">RANKING</div>
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-blue-500/50 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all">
                 <Search className="w-10 h-10 text-blue-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">SOPA DE LETRAS</h2>
            </Link>

            {/* SUDOKU */}
            <Link href="/game/sudoku" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-indigo-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="absolute top-4 right-4 px-2 py-1 bg-indigo-900/30 border border-indigo-500/30 rounded text-[9px] text-indigo-400 font-bold">RANKING</div>
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-indigo-500/50 group-hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all">
                 <Grid3X3 className="w-10 h-10 text-indigo-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">SUDOKU</h2>
            </Link>

            {/* MEMORY */}
            <Link href="/game/memory" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-pink-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/10 rounded-bl-full -mr-6 -mt-6 transition-all group-hover:bg-pink-500/20"></div>
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-pink-500/50 group-hover:shadow-[0_0_20px_rgba(236,72,153,0.4)] transition-all relative z-10">
                 <Brain className="w-10 h-10 text-pink-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter mb-1">NEON MEMORY</h2>
            </Link>

            {/* CONNECT 4 */}
            <Link href="/game/connect4" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-yellow-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/10 rounded-bl-full -mr-6 -mt-6 transition-all group-hover:bg-yellow-500/20"></div>
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-yellow-500/50 group-hover:shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-all relative z-10">
                 <Circle className="w-10 h-10 text-yellow-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter mb-1">CONNECT 4</h2>
            </Link>

            {/* DOMINO AARON MOURINHO */}
            <Link href="/game/domino" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-orange-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-bl-full -mr-6 -mt-6 transition-all group-hover:bg-orange-500/20"></div>
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-orange-500/50 group-hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-all relative z-10">
                 <LayoutList className="w-10 h-10 text-orange-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter mb-1 text-center">DOMINO<br/><span className="text-sm font-normal text-slate-400">AARON MOURINHO</span></h2>
            </Link>

            {/* TETRIX */}
            <Link href="/game/tetris" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-purple-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="absolute top-4 right-4 px-2 py-1 bg-purple-900/30 border border-purple-500/30 rounded text-[9px] text-purple-400 font-bold">RANKING</div>
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-purple-500/50 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all">
                 <Gamepad2 className="w-10 h-10 text-purple-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">TETRIX</h2>
            </Link>

            {/* EL AHORCADO */}
            <Link href="/game/hangman" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-rose-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px] col-span-1 md:col-span-2 lg:col-span-3">
               <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-bl-full -mr-6 -mt-6 transition-all group-hover:bg-rose-500/20"></div>
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-rose-500/50 group-hover:shadow-[0_0_20px_rgba(244,63,94,0.4)] transition-all relative z-10">
                 <Skull className="w-10 h-10 text-rose-500" />
               </div>
               <div className="text-center relative z-10">
                 <h2 className="text-xl font-black text-white italic tracking-tighter mb-1">EL AHORCADO</h2>
                 <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest">ADIVINA O MUERE</p>
               </div>
            </Link>

            {/* CHAMI TOXICA (BUSCAMINAS) */}
            <Link href="/game/minesweeper" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-red-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px] col-span-1 md:col-span-2 lg:col-span-3">
               <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-bl-full -mr-6 -mt-6 transition-all group-hover:bg-red-500/20"></div>
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-red-500/50 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all relative z-10">
                 <Bomb className="w-10 h-10 text-red-500" />
               </div>
               <div className="text-center relative z-10">
                 <h2 className="text-xl font-black text-white italic tracking-tighter mb-1">CHAMI LA TÓXICA</h2>
                 <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">CUIDADO QUE EXPLOTA</p>
               </div>
            </Link>

{/* THANIA LA CANTINERA (HUNDIR LA FLOTA) */}
            <Link href="/game/battleship" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-900/80 hover:border-cyan-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px] col-span-1 md:col-span-2 lg:col-span-3">
               {/* Fondo de olas/agua */}
               <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900/0 to-slate-900/0 opacity-50 group-hover:opacity-100 transition-opacity"></div>
               <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-blue-500/10 to-transparent rounded-b-2xl"></div>
               
               <div className="p-4 bg-blue-950 rounded-2xl border border-blue-800 group-hover:border-cyan-500/50 group-hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all relative z-10">
                 <Anchor className="w-10 h-10 text-cyan-400" />
               </div>
               <div className="text-center relative z-10">
                 <h2 className="text-xl font-black text-white italic tracking-tighter mb-1">THANIA LA CANTINERA</h2>
                 <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">NEON BATTLESHIP</p>
               </div>
            </Link>
            
         </div>
      </div>

      <div className="mt-12 opacity-50"><AdSpace type="banner" /></div>
    </div>
  );
}