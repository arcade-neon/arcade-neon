'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Gamepad2, User, Trophy, Users, Bot, 
  Grid3X3, Video, Ghost, Swords, Layers, 
  Skull, Activity, Bomb, LayoutList, ShoppingCart,
  Brain, Circle, Anchor, DollarSign, Share2, Zap, Coins, Plus, Disc, Crown,
  GripHorizontal, LogOut, Globe, Save, Loader2, Edit3, Hammer, MessageCircle,
  ChevronRight, ArrowUpRight, Shield, Crown as CrownIcon, Star, Sparkles,
  BarChart3, Target, Zap as ZapIcon, ShieldCheck, Award, Medal, Crown as Crown2,
  Hash
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useAudio } from '@/contexts/AudioContext';
import { useEconomy } from '@/contexts/EconomyContext';

// --- CONFIGURACIÓN DE JUEGOS ---
const GAMES = [
  {
    id: 'towerbloxx', 
    title: 'CONSTRUCCIONES', 
    slogan: 'CONSTRUYE ALTO', 
    href: '/game/tower', 
    icon: Hammer, 
    color: 'yellow', 
    border: 'border-yellow-500', 
    shadow: 'shadow-yellow-500/20', 
    text: 'text-yellow-400', 
    bg: 'bg-yellow-950/20'
  },
  {
    id: 'uno', 
    title: 'UNO', 
    slogan: 'EL POPULAR JUEGO DE CARTAS', 
    href: '/game/uno', 
    icon: Layers, 
    color: 'red', 
    border: 'border-red-500', 
    shadow: 'shadow-red-500/20', 
    text: 'text-red-400', 
    bg: 'bg-red-950/20'
  },
  {
    id: 'stack', 
    title: 'BLOQUES', 
    slogan: 'APILA Y GANA', 
    href: '/game/stack', 
    icon: Layers, 
    color: 'emerald', 
    border: 'border-emerald-500', 
    shadow: 'shadow-emerald-500/20', 
    text: 'text-emerald-400', 
    bg: 'bg-emerald-950/20'
  },
  {
    id: 'battleship', 
    title: 'HUNDIR LA FLOTA', 
    slogan: 'FUEGO A DISCRECIÓN', 
    href: '/game/battleship', 
    icon: Anchor, 
    color: 'cyan', 
    border: 'border-cyan-500', 
    shadow: 'shadow-cyan-500/20', 
    text: 'text-cyan-400', 
    bg: 'bg-cyan-950/20'
  },
  {
    id: 'checkers', 
    title: 'DAMAS PRO', 
    slogan: 'ESTRATEGIA MAESTRA', 
    href: '/game/checkers', 
    icon: Circle, 
    color: 'rose', 
    border: 'border-rose-500', 
    shadow: 'shadow-rose-500/20', 
    text: 'text-rose-400', 
    bg: 'bg-rose-950/20'
  },
  {
    id: 'domino', 
    title: 'DOMINO', 
    slogan: 'GOLPE EN LA MESA', 
    href: '/game/domino', 
    icon: GripHorizontal, 
    color: 'yellow', 
    border: 'border-yellow-500', 
    shadow: 'shadow-yellow-500/20', 
    text: 'text-yellow-400', 
    bg: 'bg-yellow-950/20'
  },
  {
    id: 'solitaire', 
    title: 'SOLITARIO', 
    slogan: 'CYBER DECK PRO', 
    href: '/game/solitaire', 
    icon: Layers, 
    color: 'blue', 
    border: 'border-blue-500', 
    shadow: 'shadow-blue-500/20', 
    text: 'text-blue-400', 
    bg: 'bg-blue-950/20'
  },
  {
    id: 'rps', 
    title: 'PIEDRA PAPEL TIJERA', 
    slogan: 'CLÁSICO RÁPIDO', 
    href: '/game/rps', 
    icon: Swords, 
    color: 'pink', 
    border: 'border-pink-500', 
    shadow: 'shadow-pink-500/20', 
    text: 'text-pink-400', 
    bg: 'bg-pink-950/20'
  },
  {
    id: 'tictactoe', 
    title: '3 EN RAYA', 
    slogan: 'DUELO MENTAL', 
    href: '/game/tictactoe', 
    icon: Hash, 
    color: 'teal', 
    border: 'border-teal-500', 
    shadow: 'shadow-teal-500/20', 
    text: 'text-teal-400', 
    bg: 'bg-teal-950/20'
  },
  {
    id: 'snake', 
    title: 'JUEGO DE LA SERPIENTE', 
    slogan: 'COMO EN TU NOKIA', 
    href: '/game/snake', 
    icon: Activity, 
    color: 'green', 
    border: 'border-green-500', 
    shadow: 'shadow-green-500/20', 
    text: 'text-green-400', 
    bg: 'bg-green-950/20'
  },
  {
    id: 'wordsearch', 
    title: 'SOPA DE LETRAS', 
    slogan: 'BUSCA Y ENCUENTRA', 
    href: '/game/wordsearch', 
    icon: Grid3X3, 
    color: 'sky', 
    border: 'border-sky-500', 
    shadow: 'shadow-sky-500/20', 
    text: 'text-sky-400', 
    bg: 'bg-sky-950/20'
  },
  {
    id: 'sudoku', 
    title: 'SUDOKU', 
    slogan: 'LÓGICA PURA', 
    href: '/game/sudoku', 
    icon: Grid3X3, 
    color: 'indigo', 
    border: 'border-indigo-500', 
    shadow: 'shadow-indigo-500/20', 
    text: 'text-indigo-400', 
    bg: 'bg-indigo-950/20'
  },
  {
    id: 'memory', 
    title: 'JUEGO DE LAS PAREJAS', 
    slogan: 'MEMORIA VISUAL', 
    href: '/game/memory', 
    icon: Brain, 
    color: 'fuchsia', 
    border: 'border-fuchsia-500', 
    shadow: 'shadow-fuchsia-500/20', 
    text: 'text-fuchsia-400', 
    bg: 'bg-fuchsia-950/20'
  },
  {
    id: 'connect4', 
    title: 'CONNECT 4', 
    slogan: 'ESTRATEGIA VERTICAL', 
    href: '/game/connect4', 
    icon: Circle, 
    color: 'orange', 
    border: 'border-orange-500', 
    shadow: 'shadow-orange-500/20', 
    text: 'text-orange-400', 
    bg: 'bg-orange-950/20'
  },
  {
    id: 'tetris', 
    title: 'TETRIX', 
    slogan: 'ENCAJA LAS PIEZAS', 
    href: '/game/tetris', 
    icon: Gamepad2, 
    color: 'purple', 
    border: 'border-purple-500', 
    shadow: 'shadow-purple-500/20', 
    text: 'text-purple-400', 
    bg: 'bg-purple-950/20'
  },
  {
    id: 'hangman', 
    title: 'EL AHORCADO', 
    slogan: 'ADIVINA O MUERE', 
    href: '/game/hangman', 
    icon: Skull, 
    color: 'rose', 
    border: 'border-rose-600', 
    shadow: 'shadow-rose-600/20', 
    text: 'text-rose-500', 
    bg: 'bg-rose-950/20'
  },
  {
    id: 'mines', 
    title: 'BUSCAMINAS', 
    slogan: 'RIESGO PURO', 
    href: '/game/minesweeper', 
    icon: Bomb, 
    color: 'pink', 
    border: 'border-pink-500', 
    shadow: 'shadow-pink-500/20', 
    text: 'text-pink-400', 
    bg: 'bg-pink-950/20'
  },
  {
    id: 'blackjack', 
    title: 'BLACKJACK', 
    slogan: 'DESAFÍA LA BANCA', 
    href: '/game/blackjack', 
    icon: DollarSign, 
    color: 'emerald', 
    border: 'border-emerald-500', 
    shadow: 'shadow-emerald-500/20', 
    text: 'text-emerald-400', 
    bg: 'bg-emerald-950/20'
  },
  {
    id: 'slots', 
    title: 'NEON SLOTS', 
    slogan: 'JACKPOT CITY', 
    href: '/game/slots', 
    icon: ZapIcon, 
    color: 'violet', 
    border: 'border-violet-500', 
    shadow: 'shadow-violet-500/20', 
    text: 'text-violet-400', 
    bg: 'bg-violet-950/20'
  },
  {
    id: 'simon', 
    title: 'SIMÓN DICE', 
    slogan: 'MEMORIA NEURAL', 
    href: '/game/simon', 
    icon: ZapIcon, 
    color: 'yellow', 
    border: 'border-yellow-500', 
    shadow: 'shadow-yellow-500/20', 
    text: 'text-yellow-400', 
    bg: 'bg-yellow-950/20'
  },
  {
    id: 'chess', 
    title: 'AJEDREZ PRO', 
    slogan: 'ESTRATEGIA MAESTRA', 
    href: '/game/chess', 
    icon: Crown2, 
    color: 'purple', 
    border: 'border-purple-500', 
    shadow: 'shadow-purple-500/20', 
    text: 'text-purple-400', 
    bg: 'bg-purple-950/20'
  }
];

// --- COMPONENTE PRINCIPAL ---
export default function HomeInterface() {
  const { playSound } = useAudio();
  const { coins } = useEconomy();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Simulación de obtención de usuario (ajustar según tu lógica de autenticación)
    const currentUser = auth.currentUser;
    setUser(currentUser);
  }, []);

  const SoundLink = ({ href, className, children, onClick }: any) => (
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

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex flex-col items-center p-6 font-sans select-none overflow-x-hidden">
      
      {/* --- HEADER PRINCIPAL --- */}
      <header className="w-full max-w-7xl mx-auto mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          
          {/* Logo y Título */}
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-purple-600 rounded-full blur-xl opacity-50"></div>
                <Gamepad2 className="w-16 h-16 text-white relative z-10 drop-shadow-2xl" />
              </div>
              <div>
                <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight">
                  DAYTHA <span className="bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">RIVALS</span>
                </h1>
                <p className="text-sm md:text-base text-slate-400 font-medium tracking-wide mt-1">ARCADE COMPETITIVO</p>
              </div>
            </div>
          </div>

          {/* Monedas */}
          <div className="flex justify-center">
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 backdrop-blur-md border border-slate-600/50 rounded-2xl px-8 py-4 flex items-center gap-6 shadow-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                  <Coins className="w-6 h-6 text-black font-bold" />
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-300 font-medium uppercase tracking-wider">Saldo</p>
                  <p className="text-2xl font-black text-yellow-100 tabular-nums">{coins.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <SoundLink href="/shop" className="bg-slate-600 hover:bg-yellow-500 hover:text-black text-white p-3 rounded-lg transition-all border border-slate-500/50">
                  <Plus className="w-5 h-5" />
                </SoundLink>
                <SoundLink href="/shop" className="bg-gradient-to-r from-emerald-600 to-teal-500 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg transition-all">
                  Tienda
                </SoundLink>
              </div>
            </div>
          </div>

          {/* Perfil y Acciones */}
          <div className="flex justify-center md:justify-end gap-4">
            <SoundLink href="/profile" className="flex items-center gap-4 bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600/50 rounded-xl px-6 py-3 hover:border-pink-500/50 transition-all group">
              <div className="w-12 h-12 bg-gradient-to-tr from-pink-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <User className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">{user?.displayName || 'Jugador'}</p>
                <p className="text-xs text-slate-400">Ver Perfil</p>
              </div>
            </SoundLink>
            
            <button 
              onClick={handleSignOut}
              className="bg-slate-800 hover:bg-red-600 text-white p-3 rounded-xl transition-all border border-slate-600/50"
              title="Cerrar Sesión"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* --- NAVEGACIÓN PRINCIPAL --- */}
      <nav className="w-full max-w-7xl mx-auto mb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Ranking */}
          <SoundLink href="/leaderboard" className="group bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600/50 rounded-2xl p-6 hover:border-amber-500/50 transition-all shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Trophy className="w-8 h-8 text-black font-bold" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Ranking Mundial</h3>
                  <p className="text-sm text-slate-300">Top jugadores globales</p>
                </div>
              </div>
              <ChevronRight className="w-8 h-8 text-slate-400 group-hover:text-amber-400 transition-colors" />
            </div>
          </SoundLink>

          {/* Desafiar Jugadores */}
          <SoundLink href="/chat" className="group bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600/50 rounded-2xl p-6 hover:border-cyan-500/50 transition-all shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Desafiar Jugadores</h3>
                  <p className="text-sm text-slate-300">Busca o crea salas</p>
                </div>
              </div>
              <ChevronRight className="w-8 h-8 text-slate-400 group-hover:text-cyan-400 transition-colors" />
            </div>
          </SoundLink>

          {/* Jugar contra IA */}
          <SoundLink href="#" className="group bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600/50 rounded-2xl p-6 hover:border-purple-500/50 transition-all shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Bot className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Jugar contra IA</h3>
                  <p className="text-sm text-slate-300">Entrena y mejora</p>
                </div>
              </div>
              <ChevronRight className="w-8 h-8 text-slate-400 group-hover:text-purple-400 transition-colors" />
            </div>
          </SoundLink>
        </div>
      </nav>

      {/* --- SECCIÓN DE JUEGOS --- */}
      <section className="w-full max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white">Catálogo de Juegos</h2>
            <p className="text-slate-400">Selecciona tu juego favorito y comienza a competir</p>
          </div>
          <div className="flex gap-4">
            <button className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-semibold transition-all border border-slate-600/50">
              Todos
            </button>
            <button className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-semibold transition-all border border-slate-600/50">
              Favoritos
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {GAMES.map((game) => (
            <SoundLink 
              key={game.id} 
              href={game.href}
              className={`group relative rounded-2xl border-2 ${game.border} bg-gradient-to-br from-slate-800 to-slate-700 p-6 flex flex-col items-center justify-center gap-4 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-2 hover:shadow-2xl ${game.shadow} overflow-hidden min-h-[200px] hover:border-slate-500/50`}
            >
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b ${game.bg} to-transparent pointer-events-none`}></div>
              
              <div className={`relative z-10 w-20 h-20 rounded-full border-2 ${game.border} flex items-center justify-center bg-slate-900/50 backdrop-blur-sm group-hover:shadow-[0_0_30px_currentColor] ${game.text} transition-all duration-300 group-hover:scale-110`}>
                <game.icon className="w-10 h-10" strokeWidth={1.5} />
              </div>

              <div className="relative z-10 text-center space-y-2 w-full">
                <h3 className={`text-xl font-bold text-white group-hover:tracking-wider transition-all duration-300 uppercase`}>
                  {game.title}
                </h3>
                <div className={`inline-block px-4 py-2 rounded-full border ${game.border} bg-slate-900/50 backdrop-blur-sm`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider ${game.text}`}>
                    {game.slogan}
                  </p>
                </div>
              </div>

              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <ArrowUpRight className="w-6 h-6 text-slate-400 group-hover:text-white" />
              </div>
            </SoundLink>
          ))}
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="w-full max-w-7xl mx-auto mt-16 mb-8 text-center text-slate-500 text-sm">
        <div className="flex justify-center items-center gap-8">
          <span>© 2024 Daytha Rivals. Todos los derechos reservados.</span>
          <div className="flex gap-4">
            <SoundLink href="/privacy" className="hover:text-white transition-colors">Privacidad</SoundLink>
            <SoundLink href="#" className="hover:text-white transition-colors">Términos</SoundLink>
            <SoundLink href="#" className="hover:text-white transition-colors">Soporte</SoundLink>
          </div>
        </div>
      </footer>
    </div>
  );
}