// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Medal, Star, Zap, Clock, Crown, Shield, Activity, Grid3X3, Ghost, Hash, Lock, Share2, AlertTriangle } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';

const TROPHIES = [
  { id: 'snake_50', title: 'Cazador Novato', desc: 'Snake: 50 pts', icon: <Activity />, condition: (s) => s >= 50 },
  { id: 'snake_100', title: 'Víbora Letal', desc: 'Snake: 100 pts', icon: <Activity />, condition: (s) => s >= 100 },
  { id: 'sudoku_fast', title: 'Mente Maestra', desc: 'Sudoku: < 5 min', icon: <Grid3X3 />, condition: (s) => s > 0 && s < 300 },
  { id: 'mines_survivor', title: 'Tedax', desc: 'Buscaminas: 1000 pts', icon: <Shield />, condition: (s) => s >= 1000 },
];

export default function UserProfile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalXp: 0,
    level: 1,
    gamesPlayed: 0,
    bestSnake: 0,
    bestSudoku: 0,
    bestMine: 0,
    unlockedTrophies: []
  });

  useEffect(() => {
    // Seguridad: Si en 3 segundos no ha cargado, forzar parada del loading
    const timer = setTimeout(() => setLoading(false), 3000);

    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        try {
            await fetchUserData(u.uid);
        } catch (e) {
            console.error("Error cargando perfil:", e);
        }
      }
      setLoading(false);
      clearTimeout(timer);
    });
    return () => {
        unsubscribe();
        clearTimeout(timer);
    };
  }, []);

  const fetchUserData = async (uid) => {
    // Intentamos leer datos. Si falta el índice de Firebase, capturamos el error para no colgar la app.
    let bestSnake = 0, bestSudoku = 0, bestMine = 0;
    
    try {
        const qSnake = query(collection(db, "scores_snake"), where("uid", "==", uid), orderBy("score", "desc"), limit(1));
        const sSnake = await getDocs(qSnake);
        if (!sSnake.empty) bestSnake = sSnake.docs[0].data().score;
    } catch(e) { console.log("Falta índice Snake"); }

    try {
        const qSudoku = query(collection(db, "scores_sudoku"), where("uid", "==", uid), orderBy("time", "asc"), limit(1));
        const sSudoku = await getDocs(qSudoku);
        if (!sSudoku.empty) bestSudoku = sSudoku.docs[0].data().time;
    } catch(e) { console.log("Falta índice Sudoku"); }

    try {
        const qMine = query(collection(db, "scores_minesweeper"), where("uid", "==", uid), orderBy("score", "desc"), limit(1));
        const sMine = await getDocs(qMine);
        if (!sMine.empty) bestMine = sMine.docs[0].data().score;
    } catch(e) { console.log("Falta índice Buscaminas"); }

    const xp = bestSnake + (bestMine / 10) + (bestSudoku > 0 ? 500 : 0);
    const level = Math.max(1, Math.floor(Math.sqrt(xp) / 5) + 1);

    const unlocked = TROPHIES.filter(t => {
        if (t.id.includes('snake')) return t.condition(bestSnake);
        if (t.id.includes('sudoku')) return t.condition(bestSudoku);
        if (t.id.includes('mines')) return t.condition(bestMine);
        return false;
    }).map(t => t.id);

    setStats({
        totalXp: Math.floor(xp),
        level,
        gamesPlayed: 0, // Simplificado para evitar errores
        bestSnake,
        bestSudoku,
        bestMine,
        unlockedTrophies: unlocked
    });
  };

  const getLevelTitle = (lvl) => {
      if (lvl < 5) return "NOVATO";
      if (lvl < 10) return "JUGADOR";
      if (lvl < 20) return "EXPERTO";
      return "LEYENDA";
  };

  if (loading) return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-pink-500"></div>
      </div>
  );

  if (!user) return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-center text-white">
          <Ghost className="w-20 h-20 text-slate-700 mb-4"/>
          <h2 className="text-2xl font-bold mb-2">PERFIL FANTASMA</h2>
          <p className="text-slate-400 mb-6">Inicia sesión para guardar tu progreso.</p>
          <Link href="/" className="px-6 py-3 bg-pink-600 rounded-xl font-bold">VOLVER AL INICIO</Link>
      </div>
  );

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-4 font-mono text-white select-none">
      
      {/* HEADER */}
      <div className="w-full max-w-md flex justify-between items-center mb-8">
        <Link href="/" className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:bg-slate-800 transition"><ArrowLeft className="w-5 h-5 text-slate-400"/></Link>
        <button className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:bg-slate-800 transition"><Share2 className="w-5 h-5 text-slate-400"/></button>
      </div>

      <div className="w-full max-w-md animate-in zoom-in space-y-6">
          
          {/* TARJETA DE PERFIL */}
          <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-bl-full -mr-10 -mt-10"></div>
              
              <div className="flex items-center gap-4 relative z-10 mb-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center text-3xl font-black shadow-lg shadow-pink-500/20 text-white">
                      {user.displayName ? user.displayName[0].toUpperCase() : 'U'}
                  </div>
                  <div>
                      <h2 className="text-2xl font-black text-white">{user.displayName || 'Jugador'}</h2>
                      <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded border border-yellow-500/20 flex items-center gap-1">
                              <Crown className="w-3 h-3 fill-current"/> {getLevelTitle(stats.level)}
                          </span>
                          <span className="text-xs text-slate-500">NIVEL {stats.level}</span>
                      </div>
                  </div>
              </div>

              {/* BARRA DE XP */}
              <div className="relative z-10">
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                      <span>XP ACTUAL</span>
                      <span>{stats.totalXp} / {stats.level * 500}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500" style={{ width: `${Math.min(100, (stats.totalXp / (stats.level * 500)) * 100)}%` }}></div>
                  </div>
              </div>
          </div>

          {/* ESTADÍSTICAS RÁPIDAS */}
          <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-800 text-center">
                  <Trophy className="w-6 h-6 text-yellow-400 mx-auto mb-1"/>
                  <span className="block text-xl font-black text-white">{stats.unlockedTrophies.length}</span>
                  <span className="text-[9px] text-slate-500 uppercase font-bold">TROFEOS</span>
              </div>
              <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-800 text-center">
                  <Zap className="w-6 h-6 text-pink-400 mx-auto mb-1"/>
                  <span className="block text-xl font-black text-white">{stats.bestSnake}</span>
                  <span className="text-[9px] text-slate-500 uppercase font-bold">RECORD SNAKE</span>
              </div>
              <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-800 text-center">
                  <Clock className="w-6 h-6 text-cyan-400 mx-auto mb-1"/>
                  <span className="block text-xl font-black text-white">{stats.bestSudoku ? Math.floor(stats.bestSudoku/60)+'m' : '-'}</span>
                  <span className="text-[9px] text-slate-500 uppercase font-bold">SUDOKU FAST</span>
              </div>
          </div>

          {/* VITRINA DE TROFEOS */}
          <div>
              <h3 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2"><Medal className="w-4 h-4"/> VITRINA DE TROFEOS</h3>
              <div className="grid grid-cols-1 gap-2">
                  {TROPHIES.map((trophy) => {
                      const isUnlocked = stats.unlockedTrophies.includes(trophy.id);
                      return (
                          <div key={trophy.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${isUnlocked ? 'bg-slate-900 border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.1)]' : 'bg-slate-950 border-slate-800 opacity-60'}`}>
                              <div className={`p-3 rounded-full ${isUnlocked ? 'bg-pink-500/20 text-pink-400' : 'bg-slate-900 text-slate-700'}`}>
                                  {isUnlocked ? trophy.icon : <Lock className="w-6 h-6"/>}
                              </div>
                              <div>
                                  <h4 className={`font-bold text-sm ${isUnlocked ? 'text-white' : 'text-slate-600'}`}>{trophy.title}</h4>
                                  <p className="text-xs text-slate-500">{trophy.desc}</p>
                              </div>
                              {isUnlocked && <div className="ml-auto text-yellow-400"><Star className="w-4 h-4 fill-current"/></div>}
                          </div>
                      );
                  })}
              </div>
          </div>

          <div className="mt-8 pb-8 opacity-50"><AdSpace type="banner" /></div>
      </div>
    </div>
  );
}