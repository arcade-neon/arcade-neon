// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Gamepad2, User, Trophy, Search, Hash, 
  Grid3X3, Video, Gamepad, Ghost, Swords, 
  Skull, Type, Activity, Bomb, LayoutList, 
  Brain, Circle, Share2, Anchor, Layers 
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import AdSpace from '@/components/AdSpace';
import { useAudio } from '@/contexts/AudioContext';

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

  const SoundLink = ({ href, className, children }) => (
    <Link 
      href={href} 
      className={className}
      onMouseEnter={() => playSound('hover')} 
      onClick={() => playSound('click')}
    >
      {children}
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono select-none overflow-x-hidden">
      
      {/* BANNER PUBLICIDAD SUPERIOR */}
      <div className="w-full max-w-4xl h-24 bg-slate-900/50 rounded-xl border border-dashed border-slate-800 mb-8 flex items-center justify-center overflow-hidden">
         <AdSpace type="banner" />
      </div>

      {/* HEADER PRINCIPAL (MARCA ACTUALIZADA) */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-8 relative z-10">
        <div>
           {/* NOMBRE DE MARCA */}
           <h1 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter">
             DAYTHA<span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-600">RIVALS</span>
           </h1>
           {/* NUEVO ESLOGAN */}
           <p className="text-[10px] md:text-xs text-slate-500 font-bold tracking-[0.3em] pl-1 uppercase">Desafía. Compite. Domina.</p>
        </div>
        
        <SoundLink href="/profile" className="flex items-center gap-3 bg-slate-900 pl-4 pr-1 py-1 rounded-full border border-slate-800 hover:border-pink-500 transition-all group shadow-lg">
           <span className="text-[10px] font-bold text-slate-300 group-hover:text-white hidden sm:block">
             {user ? 'MI PERFIL' : 'LOGIN'}
           </span>
           <div className="w-8 h-8 bg-gradient-to-tr from-pink-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <User className="w-4 h-4 text-white" />
           </div>
        </SoundLink>
      </div>

      {/* SECCIÓN NIVEL */}
      <div className="w-full max-w-4xl mb-12 relative">
         <div className="flex justify-between items-end mb-4">
            <h2 className="text-xl font-bold text-yellow-500 flex items-center gap-2">
              ZONA DE RETOS
            </h2>
            <button onClick={scrollToGames} onMouseEnter={() => playSound('hover')} className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-full text-[10px] font-bold text-white hover:bg-slate-800 hover:border-blue-500 transition flex items-center gap-2 group">
               <Share2 className="w-3 h-3 group-hover:text-blue-500 transition-colors" /> CREAR SALA
            </button>
         </div>

         <div className="w-full bg-gradient-to-r from-slate-900 to-slate-900/50 border border-slate-800 rounded-3xl p-8 relative overflow-hidden group">
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
         <p className="text-[10px] text-slate-500 font-bold tracking-widest mb-6 uppercase">Arena de Juegos</p>
         
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* UNO PRO */}
            <SoundLink href="/game/uno" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-red-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               {/* ICONO PERSONALIZADO: MINI CARTA */}
               <div className="relative w-16 h-20 group-hover:-translate-y-2 transition-transform duration-300">
                   {/* Carta trasera (Amarilla) */}
                   <div className="absolute inset-0 bg-yellow-500 rounded-lg border-2 border-white transform rotate-12 translate-x-4 shadow-md"></div>
                   {/* Carta delantera (Roja) */}
                   <div className="absolute inset-0 bg-red-600 rounded-lg border-2 border-white transform -rotate-6 shadow-xl flex items-center justify-center z-10">
                       <div className="w-10 h-14 bg-white rounded-[50%] transform -rotate-12 flex items-center justify-center border border-red-200 shadow-inner">
                            <span className="text-red-600 font-black text-2xl italic" style={{textShadow: '1px 1px 0 black'}}>1</span>
                       </div>
                   </div>
               </div>
               
               <div className="text-center relative z-10 mt-2">
                 <h2 className="text-2xl font-black text-white italic tracking-tighter mb-1 drop-shadow-md">UNO PRO</h2>
                 <p className="text-[9px] text-red-400 font-bold uppercase tracking-widest bg-red-950/30 px-2 py-1 rounded">JUEGO FAMOSO DE CARTAS</p>
               </div>
            </SoundLink>

            {/* NAVAL ELITE */}
            <SoundLink href="/game/battleship" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-900/80 hover:border-cyan-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-blue-950 rounded-2xl border border-blue-800 group-hover:border-cyan-500/50 group-hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all relative z-10">
                 <Anchor className="w-10 h-10 text-cyan-400" />
               </div>
               <div className="text-center relative z-10">
                 <h2 className="text-xl font-black text-white italic tracking-tighter mb-1">NAVAL ELITE</h2>
                 <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">TACTICAL WARFARE</p>
               </div>
            </SoundLink>

            {/* PIEDRA PAPEL TIJERA */}
            <SoundLink href="/game/rps" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-pink-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-pink-500/50 group-hover:shadow-[0_0_20px_rgba(236,72,153,0.4)] transition-all">
                 <Swords className="w-10 h-10 text-pink-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">PIEDRA PAPEL TIJERA</h2>
            </SoundLink>

            {/* TRES EN RAYA */}
            <SoundLink href="/game/tictactoe" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-cyan-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-cyan-500/50 group-hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all">
                 <Hash className="w-10 h-10 text-cyan-400" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">NEON 3 EN RAYA</h2>
            </SoundLink>

            {/* NEON SOLITAIRE */}
            <SoundLink href="/game/solitaire" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-900/80 hover:border-pink-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-pink-500/50 group-hover:shadow-[0_0_20px_rgba(236,72,153,0.4)] transition-all relative z-10">
                 <Layers className="w-10 h-10 text-pink-500" />
               </div>
               <div className="text-center relative z-10">
                 <h2 className="text-xl font-black text-white italic tracking-tighter mb-1">SOLITARIO PRO</h2>
                 <p className="text-[10px] text-pink-400 font-bold uppercase tracking-widest">CYBER DECK</p>
               </div>
            </SoundLink>

            {/* NEON SNAKE */}
            <SoundLink href="/game/snake" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-green-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-green-500/50 group-hover:shadow-[0_0_20px_rgba(74,222,128,0.4)] transition-all">
                 <Activity className="w-10 h-10 text-green-400" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">NEON SNAKE</h2>
            </SoundLink>

            {/* SOPA DE LETRAS */}
            <SoundLink href="/game/wordsearch" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-blue-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-blue-500/50 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all">
                 <Search className="w-10 h-10 text-blue-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">SOPA DE LETRAS</h2>
            </SoundLink>

            {/* SUDOKU */}
            <SoundLink href="/game/sudoku" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-indigo-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-indigo-500/50 group-hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all">
                 <Grid3X3 className="w-10 h-10 text-indigo-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">SUDOKU</h2>
            </SoundLink>

            {/* MEMORY */}
            <SoundLink href="/game/memory" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-pink-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-pink-500/50 group-hover:shadow-[0_0_20px_rgba(236,72,153,0.4)] transition-all relative z-10">
                 <Brain className="w-10 h-10 text-pink-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter mb-1">NEON MEMORY</h2>
            </SoundLink>

            {/* CONNECT 4 */}
            <SoundLink href="/game/connect4" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-yellow-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-yellow-500/50 group-hover:shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-all relative z-10">
                 <Circle className="w-10 h-10 text-yellow-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter mb-1">CONNECT 4</h2>
            </SoundLink>

            {/* DOMINO */}
            <SoundLink href="/game/domino" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-orange-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-orange-500/50 group-hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-all relative z-10">
                 <LayoutList className="w-10 h-10 text-orange-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter mb-1 text-center">DOMINO<br/><span className="text-sm font-normal text-slate-400">AARON MOURINHO</span></h2>
            </SoundLink>

            {/* TETRIX */}
            <SoundLink href="/game/tetris" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-purple-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-purple-500/50 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all">
                 <Gamepad2 className="w-10 h-10 text-purple-500" />
               </div>
               <h2 className="text-xl font-black text-white italic tracking-tighter">TETRIX</h2>
            </SoundLink>

            {/* EL AHORCADO */}
            <SoundLink href="/game/hangman" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-rose-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-rose-500/50 group-hover:shadow-[0_0_20px_rgba(244,63,94,0.4)] transition-all relative z-10">
                 <Skull className="w-10 h-10 text-rose-500" />
               </div>
               <div className="text-center relative z-10">
                 <h2 className="text-xl font-black text-white italic tracking-tighter mb-1">EL AHORCADO</h2>
                 <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest">ADIVINA O MUERE</p>
               </div>
            </SoundLink>

            {/* CHAMI TOXICA */}
            <SoundLink href="/game/minesweeper" className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:bg-slate-800 hover:border-red-500/50 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4 overflow-hidden min-h-[200px]">
               <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:border-red-500/50 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all relative z-10">
                 <Bomb className="w-10 h-10 text-red-500" />
               </div>
               <div className="text-center relative z-10">
                 <h2 className="text-xl font-black text-white italic tracking-tighter mb-1">CHAMI LA TÓXICA</h2>
                 <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">CUIDADO QUE EXPLOTA</p>
               </div>
            </SoundLink>

         </div>
      </div>

      <div className="mt-12 opacity-50"><AdSpace type="banner" /></div>
    </div>
  );
}