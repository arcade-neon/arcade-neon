// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Crown, Medal, TrendingUp, User, Coins, Shield } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';

// Helper para renderizar los marcos y avatares (reutilizamos lógica visual)
const AvatarDisplay = ({ equipped, name, size = "md" }) => {
    const s = size === "lg" ? "w-24 h-24 text-4xl" : size === "md" ? "w-16 h-16 text-2xl" : "w-10 h-10 text-xs";
    
    // Estilos de Marcos (Copiados de la tienda para consistencia)
    let frameStyle = "border-slate-700 bg-slate-800";
    if (equipped?.frame === 'frame_gold') frameStyle = "border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.6)] bg-gradient-to-b from-yellow-900 to-black";
    if (equipped?.frame === 'frame_neon') frameStyle = "border-cyan-400 shadow-[0_0_20px_cyan] animate-pulse bg-black";
    if (equipped?.frame === 'frame_magma') frameStyle = "border-orange-500 shadow-[0_0_20px_orange] bg-black";
    if (equipped?.frame === 'frame_glitch') frameStyle = "border-white shadow-[0_0_10px_white] animate-bounce bg-black";

    return (
        <div className={`${s} rounded-full border-2 flex items-center justify-center relative ${frameStyle}`}>
            <span className="font-black text-white">{name ? name[0].toUpperCase() : '?'}</span>
            {equipped?.title === 'title_boss' && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-[8px] px-2 py-0.5 rounded text-white font-bold whitespace-nowrap animate-pulse">BOSS</div>}
            {equipped?.title === 'title_whale' && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow-500 text-[8px] px-2 py-0.5 rounded text-black font-bold whitespace-nowrap">BALLENA</div>}
        </div>
    );
};

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaders = async () => {
      try {
        // Obtenemos los usuarios ordenados por monedas
        const q = query(collection(db, "users"), orderBy("coins", "desc"), limit(10));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLeaders(data);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaders();
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-4 font-mono text-white relative overflow-hidden">
        
        {/* FONDO */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-30 pointer-events-none"></div>
        <div className="absolute top-0 w-full h-64 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none"></div>

        {/* HEADER */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-12 z-10 mt-6">
            <Link href="/" className="p-3 bg-slate-900/50 rounded-full border border-slate-700 hover:border-blue-500 transition-all group">
                <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-blue-500"/>
            </Link>
            <div className="text-center">
                <h1 className="text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                    WALL OF FAME
                </h1>
                <p className="text-[10px] text-blue-400/60 font-bold tracking-[0.5em] uppercase">Los más buscados</p>
            </div>
            <div className="w-10"></div>
        </div>

        {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-blue-400 text-xs animate-pulse tracking-widest">CALCULANDO RIQUEZA...</p>
            </div>
        ) : (
            <div className="w-full max-w-4xl relative z-10">
                
                {/* PODIO (TOP 3) */}
                {leaders.length >= 3 && (
                    <div className="flex justify-center items-end gap-4 mb-16 px-4">
                        {/* 2ND PLACE */}
                        <div className="flex flex-col items-center animate-in slide-in-from-bottom duration-700 delay-100">
                            <AvatarDisplay equipped={leaders[1]?.equipped} name={leaders[1]?.displayName || 'Anónimo'} size="md" />
                            <div className="h-32 w-24 bg-gradient-to-t from-slate-800 to-slate-700 rounded-t-lg border-x border-t border-slate-600 flex flex-col items-center justify-end pb-4 mt-4 relative shadow-lg">
                                <span className="text-4xl font-black text-slate-500/50 absolute top-2">2</span>
                                <p className="text-xs font-bold text-slate-300 truncate w-full text-center px-1">{leaders[1]?.displayName || 'Jugador'}</p>
                                <p className="text-[10px] text-yellow-500 font-mono">{leaders[1]?.coins?.toLocaleString()} ₵</p>
                            </div>
                        </div>

                        {/* 1ST PLACE */}
                        <div className="flex flex-col items-center animate-in slide-in-from-bottom duration-700 z-10">
                            <Crown className="w-8 h-8 text-yellow-400 mb-2 animate-bounce"/>
                            <AvatarDisplay equipped={leaders[0]?.equipped} name={leaders[0]?.displayName || 'King'} size="lg" />
                            <div className="h-44 w-28 bg-gradient-to-t from-yellow-900/80 to-yellow-600/20 rounded-t-lg border-x border-t border-yellow-500 flex flex-col items-center justify-end pb-4 mt-4 relative shadow-[0_0_50px_rgba(234,179,8,0.2)]">
                                <span className="text-5xl font-black text-yellow-500/50 absolute top-2">1</span>
                                <p className="text-sm font-black text-yellow-100 truncate w-full text-center px-1">{leaders[0]?.displayName || 'Líder'}</p>
                                <p className="text-xs text-yellow-400 font-mono font-bold">{leaders[0]?.coins?.toLocaleString()} ₵</p>
                            </div>
                        </div>

                        {/* 3RD PLACE */}
                        <div className="flex flex-col items-center animate-in slide-in-from-bottom duration-700 delay-200">
                            <AvatarDisplay equipped={leaders[2]?.equipped} name={leaders[2]?.displayName || 'Anónimo'} size="md" />
                            <div className="h-24 w-24 bg-gradient-to-t from-slate-800 to-slate-700 rounded-t-lg border-x border-t border-slate-600 flex flex-col items-center justify-end pb-4 mt-4 relative shadow-lg">
                                <span className="text-4xl font-black text-slate-500/50 absolute top-2">3</span>
                                <p className="text-xs font-bold text-slate-300 truncate w-full text-center px-1">{leaders[2]?.displayName || 'Jugador'}</p>
                                <p className="text-[10px] text-yellow-500 font-mono">{leaders[2]?.coins?.toLocaleString()} ₵</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* LISTA DEL RESTO (4-10) */}
                <div className="bg-slate-900/50 backdrop-blur-md rounded-3xl border border-slate-800 overflow-hidden">
                    {leaders.slice(3).map((player, index) => (
                        <div key={player.id} className="flex items-center justify-between p-4 border-b border-slate-800 hover:bg-white/5 transition-colors group">
                            <div className="flex items-center gap-4">
                                <span className="text-slate-500 font-black text-lg w-6 text-center">{index + 4}</span>
                                <AvatarDisplay equipped={player.equipped} name={player.displayName} size="xs" />
                                <div>
                                    <p className="font-bold text-slate-200 text-sm">{player.displayName || 'Jugador Anónimo'}</p>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Rango: {player.coins > 10000 ? 'Tycoon' : player.coins > 1000 ? 'Mercenario' : 'Novato'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-full border border-slate-800 group-hover:border-yellow-500/50 transition-colors">
                                <Coins className="w-3 h-3 text-yellow-500"/>
                                <span className="text-yellow-400 font-mono font-bold text-sm">{player.coins?.toLocaleString()}</span>
                            </div>
                        </div>
                    ))}
                    {leaders.length === 0 && <div className="p-8 text-center text-slate-500">No hay datos suficientes aún.</div>}
                </div>

            </div>
        )}

        <div className="mt-auto w-full max-w-4xl opacity-50 relative z-10 pt-8"><AdSpace type="banner" /></div>
    </div>
  );
}