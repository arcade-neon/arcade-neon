// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Trophy, Target, Zap, Brain, Crown, 
  Medal, Activity, Shield, Dna, Lock,
  Swords, Anchor, Layers, User, Bot, Ghost, Smile, Cpu, Fingerprint, Star,
  Edit3, Save, X, Loader2 // <--- AÑADIDOS ICONOS DE EDICIÓN
} from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'; // <--- AÑADIDOS DOC, GETDOC, SETDOC
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip 
} from 'recharts';
import AdSpace from '@/components/AdSpace';
import { useInventory } from '@/contexts/InventoryContext';

// --- CONFIGURACIÓN DE LOGROS ---
const ACHIEVEMENTS = [
  { id: 'first_win', title: 'PRIMERA SANGRE', desc: 'Gana tu primera partida', icon: Swords, color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
  { id: 'strategist', title: 'ALMIRANTE', desc: 'Gana en Naval Elite', icon: Anchor, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30' },
  { id: 'lucky', title: 'EL ELEGIDO', desc: 'Gana en UNO Pro', icon: Layers, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' },
  { id: 'veteran', title: 'VETERANO', desc: 'Juega más de 50 partidas', icon: Crown, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  { id: 'sniper', title: 'FRANCOTIRADOR', desc: 'Gana en 3 en Raya sin perder', icon: Target, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' },
  { id: 'genius', title: 'MENTE MAESTRA', desc: 'Completa Memory en < 30s', icon: Brain, color: 'text-pink-400', bg: 'bg-pink-400/10', border: 'border-pink-400/30' },
];

export default function ProfilePro() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { equipped } = useInventory();
  
  // --- ESTADOS PARA EL APODO (NUEVO) ---
  const [nickname, setNickname] = useState(''); // El nombre visible
  const [tempNickname, setTempNickname] = useState(''); // El input temporal
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Estado inicial de estadísticas
  const [stats, setStats] = useState({
    level: 1, 
    xp: 0, 
    nextLevelXp: 100,
    totalGames: 0, 
    wins: 0,
    winRate: 0,
    attributes: [
      { subject: 'Estrategia', A: 20, fullMark: 100 },
      { subject: 'Reflejos', A: 20, fullMark: 100 },
      { subject: 'Suerte', A: 20, fullMark: 100 },
      { subject: 'Memoria', A: 20, fullMark: 100 },
      { subject: 'Lógica', A: 20, fullMark: 100 },
    ]
  });

  const [unlockedMedals, setUnlockedMedals] = useState<string[]>([]);

  // --- 1. CARGA DE DATOS ---
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        await fetchUserData(u.uid);
        // NUEVO: Cargar el apodo real desde Firebase
        await fetchUserNickname(u.uid, u.displayName);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- FUNCIÓN PARA LEER EL APODO ---
  const fetchUserNickname = async (uid, defaultName) => {
      try {
          const docRef = doc(db, "users", uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && docSnap.data().nickname) {
              setNickname(docSnap.data().nickname);
              setTempNickname(docSnap.data().nickname);
          } else {
              setNickname(defaultName || 'Jugador');
              setTempNickname(defaultName || 'Jugador');
          }
      } catch (error) {
          console.error("Error loading nickname:", error);
      }
  };

  // --- FUNCIÓN PARA GUARDAR EL APODO ---
  const handleSaveNickname = async () => {
      if (!user || tempNickname.trim().length < 3) return;
      setIsSaving(true);
      try {
          await setDoc(doc(db, "users", user.uid), {
              nickname: tempNickname.trim(),
              email: user.email,
              updatedAt: new Date(),
              photoURL: user.photoURL
          }, { merge: true });
          
          setNickname(tempNickname.trim());
          setIsEditing(false);
      } catch (error) {
          console.error("Error saving nickname:", error);
      } finally {
          setIsSaving(false);
      }
  };

  // --- 2. LÓGICA DE CÁLCULO DE ESTADÍSTICAS ---
  const fetchUserData = async (uid) => {
    try {
        const qBattle = query(collection(db, "scores_battleship"), where("uid", "==", uid));
        const sBattle = await getDocs(qBattle);
        const battleWins = sBattle.size;

        const qUno = query(collection(db, "scores_uno"), where("uid", "==", uid));
        const sUno = await getDocs(qUno);
        const unoWins = sUno.size;

        const totalWins = battleWins + unoWins; 
        const totalGames = totalWins + Math.floor(totalWins * 0.5);

        const strategyScore = Math.min(100, 30 + (battleWins * 15));
        const luckScore = Math.min(100, 20 + (unoWins * 10)); 
        const logicScore = Math.min(100, 40 + (battleWins * 5)); 
        const reflexScore = Math.min(100, 30 + (totalWins * 2)); 
        const memoryScore = 50; 

        const currentLevel = Math.floor(totalWins / 5) + 1; 
        const currentXP = (totalWins % 5) * 20; 

        setStats({
            level: currentLevel,
            xp: currentXP,
            nextLevelXp: 100,
            totalGames: totalGames,
            wins: totalWins,
            winRate: totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0,
            attributes: [
                { subject: 'Estrategia', A: strategyScore, fullMark: 100 },
                { subject: 'Reflejos', A: reflexScore, fullMark: 100 },
                { subject: 'Suerte', A: luckScore, fullMark: 100 },
                { subject: 'Memoria', A: memoryScore, fullMark: 100 },
                { subject: 'Lógica', A: logicScore, fullMark: 100 },
            ]
        });

        const medals = [];
        if (totalWins >= 1) medals.push('first_win');
        if (battleWins >= 1) medals.push('strategist');
        if (unoWins >= 1) medals.push('lucky');
        if (totalGames >= 50) medals.push('veteran');
        setUnlockedMedals(medals);

    } catch (error) {
        console.error("Error cargando perfil:", error);
    } finally {
        setLoading(false);
    }
  };

  // --- 3. HELPERS VISUALES ---
  const getFrameStyle = () => {
      const frame = equipped?.frame || 'default';
      if (frame === 'frame_gold') return "border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.6)] bg-gradient-to-b from-yellow-900/50 to-black";
      if (frame === 'frame_neon') return "border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.8)] animate-pulse bg-black";
      if (frame === 'frame_magma') return "border-orange-500 shadow-[0_0_40px_rgba(249,115,22,0.8)] animate-pulse bg-black";
      if (frame === 'frame_glitch') return "border-white shadow-[0_0_20px_rgba(255,255,255,0.8)] animate-bounce bg-black";
      return "border-slate-700 bg-gradient-to-br from-slate-800 to-black"; 
  };

  const getTitleBadge = () => {
      const title = equipped?.title || 'default';
      if (title === 'title_boss') return <div className="mt-2 bg-red-600 text-white px-3 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-red-400 shadow-lg animate-bounce">THE BOSS</div>;
      if (title === 'title_whale') return <div className="mt-2 bg-gradient-to-r from-yellow-600 to-yellow-400 text-yellow-100 px-3 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-yellow-300 shadow-xl scale-110">LA BALLENA</div>;
      if (title === 'title_toxic') return <div className="mt-2 bg-green-500 text-black px-3 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-green-400 shadow-[0_0_15px_#4ade80]">TÓXICO</div>;
      return <div className="mt-2 text-[10px] text-cyan-400/80 font-bold uppercase tracking-widest border border-cyan-500/20 px-2 py-0.5 rounded bg-cyan-950/30">Novato</div>;
  };

  const getAvatarIcon = () => {
      if (!equipped?.avatar) return <span className="text-4xl font-black text-white drop-shadow-md">{user?.displayName ? user.displayName[0].toUpperCase() : 'U'}</span>;
      
      const iconProps = { className: "w-14 h-14" };
      switch (equipped.avatar) {
          case 'avatar_punk': return <Smile {...iconProps} className="w-14 h-14 text-cyan-400"/>;
          case 'avatar_bot': return <Bot {...iconProps} className="w-14 h-14 text-purple-400"/>;
          case 'avatar_demon': return <Ghost {...iconProps} className="w-14 h-14 text-green-400"/>;
          case 'avatar_hacker': return <Cpu {...iconProps} className="w-14 h-14 text-yellow-400"/>;
          case 'avatar_god': return <Fingerprint className="w-16 h-16 text-rose-500 animate-ping"/>;
          default: return <User {...iconProps} className="w-14 h-14 text-slate-400"/>;
      }
  };

  // --- 4. RENDERIZADO ---
  if (loading) return (
      <div className="min-h-screen bg-[#050b14] flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-cyan-500 font-mono animate-pulse text-sm tracking-widest">ANALIZANDO ADN...</p>
      </div>
  );

  if (!user) return (
      <div className="min-h-screen bg-[#050b14] flex flex-col items-center justify-center p-4 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 pointer-events-none"></div>
          <Shield className="w-24 h-24 text-slate-700 mb-6 opacity-50"/>
          <h1 className="text-3xl font-black text-white mb-2 tracking-tighter">ACCESO DENEGADO</h1>
          <p className="text-slate-400 mb-8 font-mono text-sm max-w-md">Identifícate para acceder a tu expediente de combate.</p>
          <Link href="/" className="px-8 py-4 bg-cyan-600 rounded-xl text-white font-bold hover:bg-cyan-500 transition shadow-[0_0_20px_rgba(8,145,178,0.4)] hover:shadow-[0_0_30px_rgba(8,145,178,0.6)] hover:-translate-y-1">VOLVER AL LOBBY</Link>
      </div>
  );

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono text-white select-none relative overflow-x-hidden pb-20">
        
        {/* FONDO ANIMADO */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 pointer-events-none fixed"></div>
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse delay-1000"></div>

        {/* HEADER */}
        <div className="w-full max-w-5xl flex justify-between items-center mb-10 z-10 pt-4">
            <Link href="/" className="p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-cyan-500 transition-all group hover:scale-110 active:scale-95 shadow-lg">
                <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-cyan-500"/>
            </Link>
            <div className="text-right">
                <h1 className="text-2xl md:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 drop-shadow-sm">EXPEDIENTE</h1>
                <div className="flex items-center justify-end gap-2 text-[10px] text-slate-500 font-bold tracking-[0.3em] uppercase">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    ID: {user.uid.substring(0,8).toUpperCase()}
                </div>
            </div>
        </div>

        {/* GRID PRINCIPAL */}
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 relative z-10">
            
            {/* COLUMNA 1: TARJETA DE JUGADOR (CON EDICIÓN DE APODO) */}
            <div className="md:col-span-1 bg-[#0f172a]/90 backdrop-blur-xl p-8 rounded-[2rem] border border-slate-700/50 flex flex-col items-center text-center shadow-2xl relative overflow-hidden group hover:border-cyan-500/30 transition-colors">
                
                {/* AVATAR + MARCO */}
                <div className={`w-32 h-32 rounded-full border-4 mb-6 flex items-center justify-center relative transition-transform duration-500 group-hover:scale-105 ${getFrameStyle()}`}>
                    {getAvatarIcon()}
                    <div className="absolute -bottom-4 bg-slate-950 border border-slate-700 rounded-full px-4 py-1 flex items-center gap-1 shadow-lg z-20">
                        <Star className="w-3 h-3 text-yellow-500 fill-current" />
                        <span className="text-xs font-black text-white">LVL {stats.level}</span>
                    </div>
                </div>
                
                {/* --- AQUÍ ESTÁ EL CAMBIO: SISTEMA DE APODO EDITABLE --- */}
                <div className="w-full mb-2 min-h-[40px] flex justify-center items-center">
                    {isEditing ? (
                        <div className="flex items-center gap-2 animate-in zoom-in">
                            <input 
                                type="text" 
                                value={tempNickname}
                                onChange={(e) => setTempNickname(e.target.value)}
                                className="bg-slate-900 border border-cyan-500 rounded-lg py-1 px-3 text-white text-center font-bold text-lg focus:outline-none w-32 uppercase"
                                maxLength={12}
                                autoFocus
                            />
                            <button onClick={handleSaveNickname} className="text-green-400 hover:scale-110 transition disabled:opacity-50" disabled={isSaving}>
                                {isSaving ? <Loader2 size={20} className="animate-spin"/> : <Save size={20}/>}
                            </button>
                            <button onClick={() => setIsEditing(false)} className="text-red-400 hover:scale-110 transition">
                                <X size={20}/>
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 group/nick cursor-pointer" onClick={() => setIsEditing(true)}>
                            <h2 className="text-2xl font-black text-white tracking-tight uppercase hover:text-cyan-400 transition-colors">
                                {nickname}
                            </h2>
                            <Edit3 size={16} className="text-slate-600 group-hover/nick:text-cyan-500 transition-colors opacity-0 group-hover/nick:opacity-100"/>
                        </div>
                    )}
                </div>
                
                {getTitleBadge()}

                {/* BARRA DE XP */}
                <div className="w-full mb-6 mt-8 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                    <div className="flex justify-between text-[10px] text-slate-400 mb-2 font-bold uppercase tracking-wider">
                        <span>Progreso de Nivel</span>
                        <span className="text-cyan-400">{stats.xp} / {stats.nextLevelXp} XP</span>
                    </div>
                    <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden shadow-inner relative">
                        <div className="absolute top-0 bottom-0 left-0 w-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.1)_50%,transparent_100%)] animate-[shimmer_2s_infinite]"></div>
                        <div className="h-full bg-gradient-to-r from-cyan-600 to-blue-500 shadow-[0_0_10px_#0ea5e9] transition-all duration-1000 ease-out" style={{ width: `${(stats.xp / stats.nextLevelXp) * 100}%` }}></div>
                    </div>
                </div>

                {/* MINI STATS */}
                <div className="grid grid-cols-2 gap-3 w-full">
                    <div className="bg-slate-800/40 p-3 rounded-2xl border border-slate-700/50 hover:bg-slate-800/80 transition-colors">
                        <Trophy className="w-5 h-5 text-yellow-400 mx-auto mb-1 drop-shadow-sm"/>
                        <span className="block text-2xl font-black text-white tracking-tighter">{stats.wins}</span>
                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Victorias</span>
                    </div>
                    <div className="bg-slate-800/40 p-3 rounded-2xl border border-slate-700/50 hover:bg-slate-800/80 transition-colors">
                        <Target className="w-5 h-5 text-red-400 mx-auto mb-1 drop-shadow-sm"/>
                        <span className="block text-2xl font-black text-white tracking-tighter">{stats.winRate}%</span>
                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Win Rate</span>
                    </div>
                </div>
            </div>

            {/* COLUMNA 2 Y 3: RADAR CHART + ATRIBUTOS (INTACTO) */}
            <div className="md:col-span-2 bg-[#0f172a]/90 backdrop-blur-xl p-8 rounded-[2rem] border border-slate-700/50 shadow-2xl flex flex-col md:flex-row items-center relative overflow-hidden group hover:border-purple-500/30 transition-colors">
                <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                    <Dna className="w-48 h-48 text-white"/>
                </div>
                
                {/* GRÁFICO DE RADAR */}
                <div className="w-full h-[300px] md:w-1/2 relative z-10">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 text-center md:text-left flex items-center gap-2">
                        <Activity className="w-4 h-4 text-purple-400"/> Análisis de Rendimiento
                    </h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={stats.attributes}>
                            <PolarGrid stroke="#334155" strokeDasharray="3 3" />
                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                            <Radar name="Habilidades" dataKey="A" stroke="#8b5cf6" strokeWidth={3} fill="#8b5cf6" fillOpacity={0.4} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }} 
                                itemStyle={{ color: '#c084fc', fontSize: '12px', fontWeight: 'bold' }} 
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>

                {/* BARRAS DE PROGRESO DE ATRIBUTOS */}
                <div className="w-full md:w-1/2 md:pl-8 mt-6 md:mt-0 relative z-10 space-y-5">
                    <h4 className="text-lg font-black text-white italic mb-6 border-b border-slate-800 pb-2">APTITUDES DE COMBATE</h4>
                    {stats.attributes.map((attr, idx) => (
                        <div key={idx} className="group">
                            <div className="flex justify-between text-[11px] font-bold text-slate-400 mb-1.5 group-hover:text-white transition-colors uppercase tracking-wider">
                                <span className="flex items-center gap-2">
                                    {/* Iconos dinámicos */}
                                    {attr.subject === 'Estrategia' && <Swords size={12} className="text-blue-500"/>}
                                    {attr.subject === 'Reflejos' && <Zap size={12} className="text-yellow-500"/>}
                                    {attr.subject === 'Suerte' && <Star size={12} className="text-orange-500"/>}
                                    {attr.subject === 'Memoria' && <Brain size={12} className="text-pink-500"/>}
                                    {attr.subject === 'Lógica' && <Cpu size={12} className="text-cyan-500"/>}
                                    {attr.subject}
                                </span>
                                <span className={attr.A > 80 ? 'text-green-400' : attr.A > 50 ? 'text-blue-400' : 'text-slate-500'}>{attr.A}/100</span>
                            </div>
                            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden shadow-inner">
                                <div 
                                    className={`h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden
                                        ${attr.subject === 'Estrategia' ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6]' : 
                                          attr.subject === 'Suerte' ? 'bg-orange-500 shadow-[0_0_10px_#f97316]' : 
                                          attr.subject === 'Reflejos' ? 'bg-yellow-500 shadow-[0_0_10px_#eab308]' : 
                                          attr.subject === 'Memoria' ? 'bg-pink-500 shadow-[0_0_10px_#ec4899]' : 
                                          'bg-cyan-500 shadow-[0_0_10px_#06b6d4]'}`} 
                                    style={{ width: `${attr.A}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 animate-[pulse_2s_infinite]"></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* SECCIÓN DE LOGROS (INTACTA) */}
        <div className="w-full max-w-5xl relative z-10 mb-8">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2 ml-2">
                <Medal className="w-4 h-4 text-purple-500"/> Condecoraciones
                <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px]">{unlockedMedals.length}/{ACHIEVEMENTS.length}</span>
            </h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {ACHIEVEMENTS.map((medal) => {
                    const isUnlocked = unlockedMedals.includes(medal.id);
                    const Icon = medal.icon;
                    return (
                        <div key={medal.id} className={`relative p-4 rounded-2xl border flex flex-col items-center text-center transition-all duration-300 group overflow-hidden
                            ${isUnlocked 
                                ? `bg-[#0f172a] ${medal.border} hover:scale-105 hover:shadow-lg` 
                                : 'bg-slate-900/40 border-slate-800 opacity-60 hover:opacity-100'}`}>
                            
                            {isUnlocked && <div className={`absolute inset-0 ${medal.bg} opacity-20 group-hover:opacity-30 transition-opacity`}></div>}

                            <div className={`w-12 h-12 rounded-xl mb-3 flex items-center justify-center relative z-10 transition-transform group-hover:rotate-6
                                ${isUnlocked ? 'bg-slate-900 shadow-md border border-slate-700' : 'bg-slate-800/50'}`}>
                                <Icon className={`w-6 h-6 ${isUnlocked ? medal.color : 'text-slate-600'}`}/>
                                {!isUnlocked && <Lock className="absolute w-4 h-4 text-slate-500/50"/>}
                            </div>
                            
                            <h4 className={`text-[10px] font-black uppercase mb-1 tracking-wider relative z-10 ${isUnlocked ? 'text-white' : 'text-slate-500'}`}>{medal.title}</h4>
                            <p className="text-[9px] text-slate-500 font-medium leading-tight relative z-10 hidden md:block group-hover:block transition-all">{medal.desc}</p>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* PUBLICIDAD INTEGRADA AL FONDO */}
        <div className="w-full max-w-5xl mt-4 opacity-40 hover:opacity-100 transition-opacity duration-500">
            <AdSpace type="banner" />
        </div>
    </div>
  );
}