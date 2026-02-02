'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';
// IMPORTAMOS TODOS LOS ICONOS NECESARIOS
import { Grid3X3, Search, LogOut, Share2, User, Trophy, Scissors, LayoutGrid, Activity } from 'lucide-react';
import AdSpace from '@/components/AdSpace';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push('/login');
      } else {
        setUser(currentUser);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#020617] text-white font-mono p-6 relative overflow-hidden">
      
      {/* FONDO ANIMADO */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* HEADER: PERFIL */}
      <header className="flex justify-between items-center mb-8 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-400 to-purple-500 p-[2px]">
            <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center overflow-hidden">
              {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-slate-400" />
              )}
            </div>
          </div>
          <div>
            <h2 className="font-bold text-white text-lg">
              {user.displayName || 'Invitado Cyberpunk'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              ONLINE
            </div>
          </div>
        </div>

        <button 
          onClick={handleLogout}
          className="p-2 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* 💰 ESPACIO PUBLICITARIO 1 (BANNER) */}
      <div className="mb-8">
        <AdSpace type="banner" />
      </div>

      {/* SECCIÓN: RETOS */}
      <div className="mb-12">
        <div className="flex justify-between items-end mb-4">
          <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            ZONA DE RETOS
          </h3>
          <button className="text-xs bg-slate-800 px-3 py-1 rounded-full flex items-center gap-2 hover:bg-slate-700 transition">
            <Share2 className="w-3 h-3" /> CREAR SALA
          </button>
        </div>
        
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs mb-1 uppercase tracking-widest">TU NIVEL ACTUAL</p>
            <p className="text-3xl font-black text-white">NOVATO</p>
          </div>
          <Trophy className="w-16 h-16 text-slate-700" />
        </div>
      </div>

      {/* JUEGOS ARCADE (NUEVO ESTILO NEÓN PRO) */}
      <h3 className="text-sm font-bold text-slate-500 mb-6 uppercase tracking-widest pl-2">ARCADE DISPONIBLE</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
        
        {/* 1. PIEDRA PAPEL TIJERA (ROSA NEÓN) */}
        <Link href="/game/rps" className="group relative">
          <div className="h-48 bg-slate-900/80 border border-pink-500/30 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 transition-all hover:border-pink-500 hover:shadow-[0_0_30px_rgba(236,72,153,0.3)] hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            {/* Icono con relleno y brillo permanente */}
            <Scissors className="w-16 h-16 text-pink-400 fill-pink-500/20 drop-shadow-[0_0_10px_rgba(236,72,153,0.8)] transition-transform group-hover:scale-110" strokeWidth={1.5} />
            <h2 className="font-black text-white tracking-wider text-lg group-hover:text-pink-300">PIEDRA PAPEL TIJERA</h2>
            <div className="absolute top-4 right-4 bg-pink-900/50 text-[10px] px-3 py-1 rounded-full text-pink-300 font-bold border border-pink-500/20">VS CPU/ONLINE</div>
          </div>
        </Link>

        {/* 2. TRES EN RAYA (CYAN NEÓN) */}
        <Link href="/game/tictactoe" className="group relative">
          <div className="h-48 bg-slate-900/80 border border-cyan-500/30 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 transition-all hover:border-cyan-500 hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <Grid3X3 className="w-16 h-16 text-cyan-400 fill-cyan-500/20 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)] transition-transform group-hover:scale-110" strokeWidth={1.5} />
            <h2 className="font-black text-white tracking-wider text-lg group-hover:text-cyan-300">TRES EN RAYA</h2>
            <div className="absolute top-4 right-4 bg-cyan-900/50 text-[10px] px-3 py-1 rounded-full text-cyan-300 font-bold border border-cyan-500/20">ONLINE</div>
          </div>
        </Link>

        {/* 3. NEON SNAKE (VERDE NEÓN) */}
        <Link href="/game/snake" className="group relative">
          <div className="h-48 bg-slate-900/80 border border-emerald-500/30 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 transition-all hover:border-emerald-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <Activity className="w-16 h-16 text-emerald-400 fill-emerald-500/20 drop-shadow-[0_0_10px_rgba(16,185,129,0.8)] transition-transform group-hover:scale-110" strokeWidth={1.5} />
            <h2 className="font-black text-white tracking-wider text-lg group-hover:text-emerald-300">NEON SNAKE</h2>
            <div className="absolute top-4 right-4 bg-emerald-900/50 text-[10px] px-3 py-1 rounded-full text-emerald-300 font-bold border border-emerald-500/20">RANKING</div>
          </div>
        </Link>

{/* 4. SOPA DE LETRAS (AZUL NEÓN) */}
        <Link href="/game/wordsearch" className="group relative">
          <div className="h-48 bg-slate-900/80 border border-blue-500/30 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 transition-all hover:border-blue-500 hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <Search className="w-16 h-16 text-blue-400 fill-blue-500/20 drop-shadow-[0_0_10px_rgba(59,130,246,0.8)] transition-transform group-hover:scale-110" strokeWidth={1.5} />
            <h2 className="font-black text-white tracking-wider text-lg group-hover:text-blue-300">SOPA DE LETRAS</h2>
            <div className="absolute top-4 right-4 bg-blue-900/50 text-[10px] px-3 py-1 rounded-full text-blue-300 font-bold border border-blue-500/20">RANKING</div>
          </div>
        </Link>

        {/* 5. SUDOKU (ÍNDIGO NEÓN) */}
        <Link href="/game/sudoku" className="group relative">
          <div className="h-48 bg-slate-900/80 border border-indigo-500/30 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 transition-all hover:border-indigo-500 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <Grid3X3 className="w-16 h-16 text-indigo-400 fill-indigo-500/20 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)] transition-transform group-hover:scale-110" strokeWidth={1.5} />
            <h2 className="font-black text-white tracking-wider text-lg group-hover:text-indigo-300">SUDOKU</h2>
            <div className="absolute top-4 right-4 bg-indigo-900/50 text-[10px] px-3 py-1 rounded-full text-indigo-300 font-bold border border-indigo-500/20">RANKING</div>
          </div>
        </Link>

        {/* 6. TETRIX (VIOLETA NEÓN) */}
        <Link href="/game/tetris" className="group relative">
          <div className="h-48 bg-slate-900/80 border border-purple-500/30 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 transition-all hover:border-purple-500 hover:shadow-[0_0_30px_rgba(168,85,247,0.3)] hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <LayoutGrid className="w-16 h-16 text-purple-400 fill-purple-500/20 drop-shadow-[0_0_10px_rgba(168,85,247,0.8)] transition-transform group-hover:scale-110" strokeWidth={1.5} />
            <h2 className="font-black text-white tracking-wider text-lg group-hover:text-purple-300">TETRIX</h2>
            <div className="absolute top-4 right-4 bg-purple-900/50 text-[10px] px-3 py-1 rounded-full text-purple-300 font-bold border border-purple-500/20">RANKING</div>
          </div>
        </Link>

      </div>
    </main>
  );
}