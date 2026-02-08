// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Trophy, Target, Zap, Brain, Crown, 
  Medal, TrendingUp, Activity, Shield, Dna 
} from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip 
} from 'recharts';
import AdSpace from '@/components/AdSpace';

// --- CONFIGURACIÓN DE MEDALLAS ---
const ACHIEVEMENTS = [
  { id: 'first_win', title: 'Primera Sangre', desc: 'Gana tu primera partida', icon: Swords, color: 'text-red-500' },
  { id: 'strategist', title: 'Almirante', desc: 'Gana en Naval Elite', icon: Anchor, color: 'text-blue-400' },
  { id: 'lucky', title: 'El Elegido', desc: 'Gana en UNO Pro', icon: Layers, color: 'text-yellow-400' },
  { id: 'veteran', title: 'Veterano', desc: 'Juega más de 50 partidas', icon: Crown, color: 'text-purple-500' },
];

// Iconos temporales para importación (si no tienes los componentes específicos, usa genéricos)
import { Swords, Anchor, Layers } from 'lucide-react';

export default function ProfilePro() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // ESTADÍSTICAS DEL JUGADOR
  const [stats, setStats] = useState({
    level: 1,
    xp: 0,
    totalGames: 0,
    wins: 0,
    attributes: [
      { subject: 'Estrategia', A: 50, fullMark: 100 }, // Naval Elite, Connect 4
      { subject: 'Reflejos', A: 50, fullMark: 100 },   // Snake, Tetris
      { subject: 'Suerte', A: 50, fullMark: 100 },     // UNO, Slots
      { subject: 'Memoria', A: 50, fullMark: 100 },    // Memory
      { subject: 'Lógica', A: 50, fullMark: 100 },     // Sudoku
    ]
  });

  const [unlockedMedals, setUnlockedMedals] = useState([]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        await fetchUserData(u.uid);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- CÁLCULO DE ESTADÍSTICAS REALES ---
  const fetchUserData = async (uid) => {
    try {
        // 1. Obtener puntuaciones de Naval Elite (Estrategia)
        const qBattle = query(collection(db, "scores_battleship"), where("uid", "==", uid));
        const sBattle = await getDocs(qBattle);
        const battleWins = sBattle.size; // Simplificado: usamos número de entradas como victorias/partidas

        // 2. Obtener puntuaciones de UNO (Suerte/Estrategia)
        const qUno = query(collection(db, "scores_uno"), where("uid", "==", uid));
        const sUno = await getDocs(qUno);
        const unoWins = sUno.size;

        // --- CÁLCULO DE ATRIBUTOS (Algoritmo de Nivelación) ---
        // Base 30 + (Victorias * Multiplicador). Tope 100.
        const strategyScore = Math.min(100, 30 + (battleWins * 10) + (unoWins * 2));
        const luckScore = Math.min(100, 30 + (unoWins * 8)); 
        const logicScore = Math.min(100, 30 + (battleWins * 5)); // Naval elite requiere lógica
        const reflexScore = 40; // Placeholder hasta tener juegos de reflejos
        const memoryScore = 40; // Placeholder

        const totalWins = battleWins + unoWins;
        const currentLevel = Math.floor(totalWins / 5) + 1; // Sube de nivel cada 5 victorias
        const currentXP = (totalWins % 5) * 20; // % de barra

        setStats({
            level: currentLevel,
            xp: currentXP,
            totalGames: totalWins * 2, // Estimación: ganas el 50%
            wins: totalWins,
            attributes: [
                { subject: 'Estrategia', A: strategyScore, fullMark: 100 },
                { subject: 'Reflejos', A: reflexScore, fullMark: 100 },
                { subject: 'Suerte', A: luckScore, fullMark: 100 },
                { subject: 'Memoria', A: memoryScore, fullMark: 100 },
                { subject: 'Lógica', A: logicScore, fullMark: 100 },
            ]
        });

        // --- DESBLOQUEO DE MEDALLAS ---
        const medals = [];
        if (totalWins >= 1) medals.push('first_win');
        if (battleWins >= 1) medals.push('strategist');
        if (unoWins >= 1) medals.push('lucky');
        if (totalWins >= 50) medals.push('veteran');
        setUnlockedMedals(medals);

    } catch (error) {
        console.error("Error cargando perfil:", error);
    } finally {
        setLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#050b14] flex items-center justify-center text-cyan-500 animate-pulse">CARGANDO PERFIL...</div>;

  if (!user) return (
      <div className="min-h-screen bg-[#050b14] flex flex-col items-center justify-center p-4 text-center">
          <Shield className="w-20 h-20 text-slate-700 mb-4"/>
          <h1 className="text-2xl font-bold text-white mb-2">ACCESO DENEGADO</h1>
          <p className="text-slate-400 mb-6">Debes iniciar sesión para ver tu expediente.</p>
          <Link href="/" className="px-8 py-3 bg-cyan-600 rounded-full text-white font-bold hover:bg-cyan-500 transition">VOLVER AL LOBBY</Link>
      </div>
  );

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono text-white select-none relative overflow-x-hidden">
        
        {/* FONDO ANIMADO */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 pointer-events-none"></div>
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"></div>

        {/* HEADER */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-8 z-10">
            <Link href="/" className="p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-cyan-500 transition-all group">
                <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-cyan-500"/>
            </Link>
            <div className="text-right">
                <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">EXPEDIENTE DE JUGADOR</h1>
                <p className="text-[10px] text-slate-500 font-bold tracking-[0.3em]">ID: {user.uid.substring(0,8).toUpperCase()}</p>
            </div>
        </div>

        {/* TARJETA PRINCIPAL */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 relative z-10">
            
            {/* COLUMNA 1: INFO USUARIO */}
            <div className="md:col-span-1 bg-slate-900/80 backdrop-blur-md p-6 rounded-3xl border border-slate-700 flex flex-col items-center text-center shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-slate-800 to-black border-4 border-cyan-500/50 mb-4 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.3)] relative">
                    <span className="text-4xl font-black text-cyan-500">{user.displayName ? user.displayName[0].toUpperCase() : 'U'}</span>
                    <div className="absolute -bottom-2 px-3 py-1 bg-cyan-600 rounded-full text-[10px] font-bold text-white shadow-md">LVL {stats.level}</div>
                </div>
                
                <h2 className="text-xl font-bold text-white mb-1">{user.displayName || 'Comandante'}</h2>
                <p className="text-xs text-cyan-400 font-bold uppercase tracking-widest mb-6">Jugador Pro</p>

                {/* BARRA DE XP */}
                <div className="w-full mb-4">
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-bold">
                        <span>XP ACTUAL</span>
                        <span>{stats.xp}/100</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-1000" style={{ width: `${stats.xp}%` }}></div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 w-full">
                    <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                        <Trophy className="w-5 h-5 text-yellow-500 mx-auto mb-1"/>
                        <span className="block text-xl font-black text-white">{stats.wins}</span>
                        <span className="text-[9px] text-slate-500 uppercase font-bold">Victorias</span>
                    </div>
                    <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                        <Target className="w-5 h-5 text-red-500 mx-auto mb-1"/>
                        <span className="block text-xl font-black text-white">{(stats.wins / (stats.totalGames || 1) * 100).toFixed(0)}%</span>
                        <span className="text-[9px] text-slate-500 uppercase font-bold">Win Rate</span>
                    </div>
                </div>
            </div>

            {/* COLUMNA 2 & 3: RADAR CHART Y ATRIBUTOS */}
            <div className="md:col-span-2 bg-slate-900/80 backdrop-blur-md p-6 rounded-3xl border border-slate-700 shadow-2xl flex flex-col md:flex-row items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-50">
                    <Dna className="w-24 h-24 text-slate-800"/>
                </div>
                
                {/* GRÁFICO */}
                <div className="w-full h-[250px] md:w-1/2 relative z-10">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 text-center md:text-left flex items-center gap-2">
                        <Activity className="w-4 h-4 text-cyan-500"/> Análisis de Rendimiento
                    </h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={stats.attributes}>
                            <PolarGrid stroke="#334155" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                            <Radar
                                name="Habilidades"
                                dataKey="A"
                                stroke="#06b6d4"
                                strokeWidth={2}
                                fill="#06b6d4"
                                fillOpacity={0.3}
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px' }}
                                itemStyle={{ color: '#22d3ee', fontSize: '12px', fontWeight: 'bold' }}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>

                {/* DETALLE TEXTO */}
                <div className="w-full md:w-1/2 md:pl-6 mt-4 md:mt-0 relative z-10">
                    <h4 className="text-lg font-black text-white italic mb-4">APTITUDES DE COMBATE</h4>
                    <div className="space-y-3">
                        {stats.attributes.map((attr, idx) => (
                            <div key={idx} className="group">
                                <div className="flex justify-between text-xs font-bold text-slate-400 mb-1 group-hover:text-white transition-colors">
                                    <span>{attr.subject}</span>
                                    <span className={attr.A > 70 ? 'text-green-400' : attr.A > 40 ? 'text-yellow-400' : 'text-red-400'}>{attr.A}/100</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-1000 ${
                                            attr.subject === 'Estrategia' ? 'bg-blue-500' : 
                                            attr.subject === 'Suerte' ? 'bg-yellow-500' : 
                                            attr.subject === 'Reflejos' ? 'bg-purple-500' : 'bg-cyan-500'
                                        }`} 
                                        style={{ width: `${attr.A}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* SECCIÓN MEDALLAS */}
        <div className="w-full max-w-4xl relative z-10">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Medal className="w-4 h-4 text-purple-500"/> Logros y Condecoraciones
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {ACHIEVEMENTS.map((medal) => {
                    const isUnlocked = unlockedMedals.includes(medal.id);
                    const Icon = medal.icon;
                    
                    return (
                        <div key={medal.id} className={`p-4 rounded-2xl border flex flex-col items-center text-center transition-all duration-300 group ${isUnlocked ? 'bg-slate-900/80 border-slate-700 hover:border-cyan-500 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]' : 'bg-slate-900/40 border-slate-800 opacity-50 grayscale'}`}>
                            <div className={`w-12 h-12 rounded-full mb-3 flex items-center justify-center ${isUnlocked ? 'bg-slate-800 shadow-inner' : 'bg-slate-800/50'}`}>
                                <Icon className={`w-6 h-6 ${isUnlocked ? medal.color : 'text-slate-600'} ${isUnlocked ? 'group-hover:scale-110 transition-transform' : ''}`}/>
                            </div>
                            <h4 className={`text-xs font-black uppercase mb-1 ${isUnlocked ? 'text-white' : 'text-slate-600'}`}>{medal.title}</h4>
                            <p className="text-[10px] text-slate-500 font-medium leading-tight">{medal.desc}</p>
                            {!isUnlocked && <div className="mt-2 text-[9px] text-red-500/50 font-bold uppercase border border-red-900/30 px-2 py-0.5 rounded-full">Bloqueado</div>}
                        </div>
                    );
                })}
            </div>
        </div>

        <div className="mt-12 opacity-50 w-full max-w-4xl"><AdSpace type="banner" /></div>
    </div>
  );
}