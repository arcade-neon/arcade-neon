// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Trophy, Users, Play, RefreshCw, 
  Zap, Brain, Activity, Coins, MessageSquare, Hand, 
  Volume2, PlayCircle, X, ShieldAlert, Heart, Eye, Layers, User
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, onSnapshot, getDoc, serverTimestamp, setDoc, collection, addDoc, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- CONFIGURACIÓN ---
const COLORS = ['green', 'red', 'yellow', 'blue'];
const COLOR_STYLES = {
    green: { base: 'bg-green-600', active: 'bg-green-400 shadow-[0_0_40px_#4ade80] scale-105 z-10', sound: 'simon1' },
    red: { base: 'bg-red-600', active: 'bg-red-400 shadow-[0_0_40px_#f87171] scale-105 z-10', sound: 'simon2' },
    yellow: { base: 'bg-yellow-600', active: 'bg-yellow-400 shadow-[0_0_40px_#facc15] scale-105 z-10', sound: 'simon3' },
    blue: { base: 'bg-blue-600', active: 'bg-blue-400 shadow-[0_0_40px_#60a5fa] scale-105 z-10', sound: 'simon4' }
};

// NIVELES DE DIFICULTAD
const DIFFICULTY_LEVELS = {
    normal: { name: 'NORMAL', speedBase: 800, minSpeed: 400, label: 'Ritmo Constante' },
    extreme: { name: 'EXTREMO', speedBase: 500, minSpeed: 250, label: 'Modo Frenético' }
};

// --- UTILS (RNG SINCRONIZADO) ---
const mulberry32 = (a) => {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// --- COMPONENTE VIDEO AD ---
const VideoAdOverlay = ({ onComplete, onCancel, label }) => {
    const [timer, setTimer] = useState(5);
    useEffect(() => {
        if(timer > 0) { const i = setInterval(() => setTimer(t => t - 1), 1000); return () => clearInterval(i); } 
        else { const t = setTimeout(onComplete, 500); return () => clearTimeout(t); }
    }, [timer, onComplete]);

    return (
        <div className="fixed inset-0 z-[1000] bg-black/95 flex flex-col items-center justify-center animate-in fade-in backdrop-blur-xl">
            <div className="absolute top-6 right-6"><button onClick={onCancel} className="text-white/50 hover:text-white flex items-center gap-2 text-xs uppercase tracking-widest"><X className="w-4 h-4"/> Cerrar</button></div>
            <div className="w-full max-w-md aspect-video bg-slate-900 rounded-3xl border border-slate-700 relative overflow-hidden flex flex-col items-center justify-center p-8 shadow-2xl">
                <PlayCircle className="w-16 h-16 text-cyan-400 mb-6 animate-pulse"/>
                <h3 className="text-xl font-black text-white mb-2 tracking-widest uppercase">PUBLICIDAD</h3>
                <p className="text-slate-400 text-xs mb-8 text-center uppercase tracking-wide">{label || "Cargando recompensa..."}<br/><span className="text-cyan-400 font-bold font-mono text-2xl mt-2 block">{timer}s</span></p>
                <div className="w-64 bg-slate-800 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-1000 ease-linear" style={{ width: `${((5-timer)/5)*100}%` }}></div></div>
            </div>
        </div>
    );
};

export default function SimonPro() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);
  
  // VISTAS
  const [view, setView] = useState('menu'); 
  
  // ESTADO JUEGO
  const [difficulty, setDifficulty] = useState('normal');
  const [sequence, setSequence] = useState([]);
  const [playerInput, setPlayerInput] = useState([]);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [activeColor, setActiveColor] = useState(null);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(800);
  const [gameState, setGameState] = useState('idle'); 
  const [message, setMessage] = useState('ESPERANDO...');
  const [canRevive, setCanRevive] = useState(true);

  // ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opName, setOpName] = useState('Rival');
  const [opScore, setOpScore] = useState(0);
  const [opLives, setOpLives] = useState(3);
  
  // APUESTAS
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [currentBetInfo, setCurrentBetInfo] = useState(null);

  // EXTRAS
  const [leaderboard, setLeaderboard] = useState([]);
  const [rankTab, setRankTab] = useState('normal'); 
  const [showAd, setShowAd] = useState(false);
  const [adType, setAdType] = useState(null); 
  const rand = useRef(Math.random);

  // --- OBTENER RANKING POR DIFICULTAD ---
  const fetchLeaderboard = async () => {
    try { 
        const q = query(collection(db, "scores_simon"), orderBy("score", "desc"), limit(50)); 
        const s = await getDocs(q); 
        const scores = s.docs.map(d=>d.data());
        
        const filteredScores = scores.filter(score => score.difficulty === rankTab).slice(0, 5);
        setLeaderboard(filteredScores); 
    } catch(e) { console.error("Error cargando ranking:", e); }
  };

  // --- CARGAR USUARIO Y SU APODO REAL ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
        if (u) {
            try {
                // Consultamos el apodo configurado en la base de datos
                const userDoc = await getDoc(doc(db, "users", u.uid));
                const apodo = (userDoc.exists() && userDoc.data().nickname) ? userDoc.data().nickname : (u.displayName || 'Jugador');
                setUser({ uid: u.uid, name: apodo });
            } catch (e) {
                console.error("Error obteniendo apodo:", e);
                setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
            }
        } else {
            setUser(null);
        }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
      fetchLeaderboard();
  }, [rankTab]);

  // --- SYNC ONLINE ---
  useEffect(() => {
    if (view === 'pvp_game' && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_simon", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.betInfo) setCurrentBetInfo(data.betInfo);
                
                if (isHost) {
                    setOpName(data.guestName || 'Esperando...');
                    setOpScore(data.guestScore || 0);
                    setOpLives(data.guestLives !== undefined ? data.guestLives : 3);
                } else {
                    setOpName(data.hostName || 'Host');
                    setOpScore(data.hostScore || 0);
                    setOpLives(data.hostLives !== undefined ? data.hostLives : 3);
                }

                if (!isHost && data.seed && sequence.length === 0 && gameState === 'idle') {
                    setDifficulty(data.difficulty || 'normal');
                    initGame('pvp', data.seed, data.difficulty || 'normal');
                }
            }
        });
        return () => { setTimeout(() => { if (unsubscribe) unsubscribe(); }, 0); };
    }
  }, [view, roomCode, isHost, gameState, sequence]);

  // --- MOTOR JUEGO ---
  const initGame = (mode, seed = null, forcedDifficulty = null) => {
      if (seed) {
          rand.current = mulberry32(seed);
      } else {
          rand.current = Math.random;
      }
      
      const diffToUse = forcedDifficulty || difficulty;
      const startSpeed = DIFFICULTY_LEVELS[diffToUse].speedBase;

      setSequence([]);
      setPlayerInput([]);
      setScore(0);
      setLives(3);
      setCanRevive(true);
      setCurrentSpeed(startSpeed);
      setGameState('playing');
      setMessage('MEMORIZA');
      
      setTimeout(() => nextRound([], startSpeed, diffToUse), 1000);
  };

  const nextRound = (currentSeq, currentSpd, currentDiff) => {
      const nextColor = COLORS[Math.floor(rand.current() * 4)];
      const newSeq = [...currentSeq, nextColor];
      
      const minSpd = DIFFICULTY_LEVELS[currentDiff].minSpeed;
      const newSpeed = Math.max(minSpd, currentSpd - 20);

      setSequence(newSeq);
      setPlayerInput([]);
      setCurrentSpeed(newSpeed);
      setMessage(`RONDA ${newSeq.length}`);
      
      playSequence(newSeq, newSpeed);
  };

  const playSequence = (seq, speed) => {
      setIsPlayingSequence(true);
      let i = 0;
      
      // Separación garantizada para evitar parpadeos invisibles
      const flashTime = speed - 80; 

      const interval = setInterval(() => {
          if (i >= seq.length) {
              clearInterval(interval);
              setIsPlayingSequence(false);
              setMessage('TU TURNO');
              return;
          }
          flashButton(seq[i], flashTime);
          i++;
      }, speed); 
  };

  const flashButton = (color, duration = 300) => {
      setActiveColor(color);
      playSound('simon_beep'); 
      setTimeout(() => setActiveColor(null), duration);
  };

  const handleColorClick = (color) => {
      if (gameState !== 'playing' || isPlayingSequence) return;

      flashButton(color, 150); 
      
      const expectedColor = sequence[playerInput.length];
      
      if (color === expectedColor) {
          const newInput = [...playerInput, color];
          setPlayerInput(newInput);
          
          if (newInput.length === sequence.length) {
              const newScore = score + 1;
              setScore(newScore);
              playSound('powerup');
              setMessage('¡CORRECTO!');
              
              if (view === 'pvp_game') updateOnlineStatus(newScore, lives);
              
              setTimeout(() => nextRound(sequence, currentSpeed, difficulty), 1000);
          }
      } else {
          playSound('error');
          handleLifeLost();
      }
  };

  const handleLifeLost = () => {
      const newLives = lives - 1;
      setLives(newLives);
      
      if (view === 'pvp_game') updateOnlineStatus(score, newLives);

      if (newLives > 0) {
          setMessage('¡FALLO! REPITIENDO...');
          setTimeout(() => {
              setPlayerInput([]);
              playSequence(sequence, currentSpeed);
          }, 1500);
      } else {
          setGameState('gameover');
          setMessage('SISTEMA FALLIDO');
          playSound('explosion');
          if (view === 'pve') saveScore(score);
      }
  };

  // --- AD SYSTEM ---
  const triggerAd = (type) => {
      setAdType(type);
      setShowAd(true);
  };

  const onAdCompleted = () => {
      setShowAd(false);
      if (adType === 'revive') {
          setLives(1);
          setCanRevive(false);
          setGameState('playing');
          setMessage('SISTEMA REINICIADO');
          setTimeout(() => {
              setPlayerInput([]);
              playSequence(sequence, currentSpeed);
          }, 1000);
      } else if (adType === 'hint') {
          setMessage('REPITIENDO SECUENCIA...');
          setTimeout(() => {
              playSequence(sequence, currentSpeed);
          }, 500);
      }
  };

  // --- ONLINE ---
  const updateOnlineStatus = async (s, l) => {
      if (!roomCode) return;
      const data = isHost ? { hostScore: s, hostLives: l } : { guestScore: s, guestLives: l };
      await updateDoc(doc(db, "matches_simon", roomCode), data);
  };

  const createRoom = async () => {
      if (!user) return alert("Inicia sesión");
      if (betType === 'money' && coins < betAmount) return alert("Sin fondos");
      if (betType === 'money') await spendCoins(betAmount, "Apuesta Simon");

      const seed = Math.floor(Math.random() * 1000000);
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      
      await setDoc(doc(db, "matches_simon", code), {
          host: user.uid, hostName: user.name, hostScore: 0, hostLives: 3,
          guest: null, guestName: '...', guestScore: 0, guestLives: 3,
          difficulty: difficulty,
          seed, betInfo: { type: betType, value: betAmount }, createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); setCurrentBetInfo({ type: betType, value: betAmount });
      initGame('pvp', seed, difficulty); 
      setView('pvp_game');
  };

  const joinRoom = async (code) => {
      if (!user) return alert("Inicia sesión");
      const ref = doc(db, "matches_simon", code);
      const snap = await getDoc(ref);
      if (!snap.exists()) return alert("Sala no existe");
      const data = snap.data();
      
      if (data.betInfo.type === 'money') {
          if (coins < data.betInfo.value) return alert("Sin fondos");
          await spendCoins(data.betInfo.value, "Apuesta Simon");
      }

      await updateDoc(ref, { guest: user.uid, guestName: user.name });
      setRoomCode(code); setIsHost(false); setCurrentBetInfo(data.betInfo);
      setView('pvp_game');
  };

  // GUARDAR SCORE ASEGURANDO QUE USE EL APODO REAL
  const saveScore = async (s) => { 
      if(user && s > 0) { 
          await addDoc(collection(db, "scores_simon"), { 
              uid: user.uid, 
              displayName: user.name, // Esto ahora viene del user.nickname configurado
              nickname: user.name,
              score: s, 
              difficulty: difficulty, 
              speedReached: currentSpeed, 
              date: serverTimestamp() 
          });
          fetchLeaderboard();
      } 
  };

  // --- FORMATO DE NOMBRE SEGURO ---
  const formatPlayerName = (scoreObj) => {
      let name = scoreObj.nickname || scoreObj.displayName || 'Anónimo';
      // Evitar correos por privacidad
      if (name.includes('@')) {
          name = name.split('@')[0];
      }
      return name;
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-[#020617] flex flex-col font-mono text-white select-none overflow-y-auto overflow-x-hidden relative pb-48">
        
        {/* FONDO */}
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#050b14] to-black opacity-80 z-0"></div>
        
        {showAd && <VideoAdOverlay onComplete={onAdCompleted} onCancel={() => setShowAd(false)} label={adType==='revive' ? "RECUPERAR SISTEMA" : "DECODIFICANDO PATRÓN"} />}

        {/* HEADER RESPONSIVO */}
        <div className="w-full max-w-5xl mx-auto flex justify-between items-center z-10 mt-6 px-4 mb-4">
            
            <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-cyan-500 transition shadow-lg shrink-0 group">
                <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-cyan-400"/>
            </button>
            
            <div className="text-center flex-1 mx-2">
                <h1 className="text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 italic tracking-tighter truncate">
                    SIMON DICE
                </h1>
            </div>
            
            <div className="bg-slate-900/90 px-3 py-1.5 rounded-full border border-yellow-500/30 flex items-center gap-2 shadow-lg shrink-0">
                <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center"><Coins className="w-3 h-3 text-black fill-current" /></div>
                <span className="text-xs font-black text-yellow-400 tabular-nums">{coins.toLocaleString()}</span>
            </div>
        </div>

        {/* CONTENIDO PRINCIPAL */}
        <div className="flex-1 w-full flex flex-col items-center z-10 px-4">
            
            {view === 'menu' ? (
                // LEYOUT MODIFICADO: Columna izquierda (Configuración + PVE), Columna derecha (PVP + Ranking)
                <div className="w-full max-w-5xl flex flex-col lg:flex-row items-start justify-center gap-6 lg:gap-8 animate-in zoom-in mt-4">
                    
                    {/* --- LADO IZQUIERDO (CONTROLES Y ENTRENAMIENTO) --- */}
                    <div className="w-full max-w-md flex flex-col gap-6 mx-auto lg:mx-0">
                        {/* SELECTOR DIFICULTAD GLOBAl */}
                        <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-700 shadow-xl backdrop-blur-md">
                            <h3 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400"/> Configuración del Sistema</h3>
                            <div className="flex gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                                {Object.keys(DIFFICULTY_LEVELS).map(level => (
                                <button 
                                    key={level} 
                                    onClick={() => setDifficulty(level)} 
                                    className={`flex-1 py-3 rounded-lg font-black text-xs tracking-widest transition-all uppercase flex flex-col items-center gap-1 ${difficulty === level ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'text-slate-500 hover:text-white'}`}
                                >
                                    <span>{DIFFICULTY_LEVELS[level].name}</span>
                                    <span className={`text-[8px] ${difficulty === level ? 'text-slate-800 font-bold' : 'text-slate-600 font-normal'}`}>{DIFFICULTY_LEVELS[level].label}</span>
                                </button>
                                ))}
                            </div>
                        </div>

                        {/* PVE */}
                        <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden group backdrop-blur-md">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                            <h2 className="text-xl font-bold text-cyan-400 mb-4 flex gap-2 tracking-widest items-center"><Brain className="w-6 h-6"/> ENTRENAMIENTO</h2>
                            <button onClick={() => { setView('pve'); initGame('pve'); }} className="w-full py-4 bg-slate-950 border border-slate-700 hover:border-cyan-500 text-white font-black rounded-xl uppercase tracking-widest transition flex items-center justify-center gap-2 shadow-lg">
                                <Play className="w-4 h-4 text-cyan-400"/> INICIAR SECUENCIA
                            </button>
                        </div>
                    </div>

                    {/* --- LADO DERECHO (PVP Y RANKING) --- */}
                    <div className="w-full max-w-md lg:w-[400px] flex flex-col gap-6 mx-auto lg:mx-0">
                        {/* PVP */}
                        <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden backdrop-blur-md">
                            <h2 className="text-xl font-bold text-purple-400 mb-4 flex gap-2 tracking-widest items-center"><Users className="w-6 h-6"/> DUELO MULTIJUGADOR</h2>
                            <div className="flex gap-2 mb-4 bg-black/40 p-2 rounded-lg border border-slate-800">
                                <button onClick={() => setBetType('money')} className={`flex-1 py-2 text-[10px] font-bold rounded uppercase transition-colors ${betType==='money'?'bg-yellow-500 text-black shadow-md':'text-slate-500 hover:text-white'}`}>MONEDAS</button>
                                <button onClick={() => setBetType('text')} className={`flex-1 py-2 text-[10px] font-bold rounded uppercase transition-colors ${betType==='text'?'bg-pink-500 text-white shadow-md':'text-slate-500 hover:text-white'}`}>RETO</button>
                            </div>
                            {betType === 'money' ? <input type="number" value={betAmount} onChange={(e)=>setBetAmount(Number(e.target.value))} className="w-full bg-black p-3 rounded-xl mb-4 text-yellow-400 font-bold text-center border border-slate-700 outline-none focus:border-yellow-500 transition-colors"/> : <input type="text" value={betText} onChange={(e)=>setBetText(e.target.value)} placeholder="Escribe el reto..." className="w-full bg-black p-3 rounded-xl mb-4 text-white text-center border border-slate-700 text-xs outline-none focus:border-pink-500 transition-colors"/>}
                            
                            <div className="flex gap-3">
                                <button onClick={createRoom} className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold text-xs text-white shadow-lg transition-colors">CREAR</button>
                                <input id="code" placeholder="CÓDIGO" className="w-24 bg-black border border-slate-700 rounded-xl text-center font-bold text-cyan-400 outline-none focus:border-cyan-500 transition-colors"/>
                                <button onClick={() => joinRoom(document.getElementById('code').value)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl font-bold text-xs text-white transition-colors">UNIRSE</button>
                            </div>
                        </div>

                        {/* RANKING DEBAJO DEL PVP */}
                        <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800/50 backdrop-blur-sm">
                            <div className="flex flex-col items-center justify-between mb-6 gap-4 border-b border-slate-800 pb-4">
                                <h3 className="text-[10px] text-slate-400 uppercase font-bold flex gap-2 items-center tracking-widest"><Trophy className="w-4 h-4 text-yellow-500"/> Mentes Brillantes</h3>
                                <div className="flex gap-1 bg-slate-950 p-1 rounded-xl w-full">
                                     {Object.keys(DIFFICULTY_LEVELS).map(level => (
                                         <button 
                                            key={`rank-${level}`} 
                                            onClick={() => setRankTab(level)} 
                                            className={`flex-1 px-2 py-2 text-[10px] font-bold rounded-lg uppercase transition-all ${rankTab === level ? 'bg-cyan-500 text-black shadow-md' : 'text-slate-500 hover:text-white'}`}
                                         >
                                            {DIFFICULTY_LEVELS[level].name}
                                         </button>
                                     ))}
                                </div>
                            </div>
                            
                            {leaderboard.length > 0 ? (
                                <div className="space-y-3">
                                    {leaderboard.map((s,i) => (
                                        <div key={i} className="flex justify-between items-center text-xs text-slate-400 border-b border-white/5 pb-3 last:border-0 last:pb-0">
                                            <div className="flex items-center gap-3">
                                                <span className={`font-black w-5 h-5 flex items-center justify-center rounded-full ${i===0 ? 'bg-yellow-500 text-black shadow-[0_0_10px_rgba(234,179,8,0.4)]' : i===1 ? 'bg-slate-300 text-black' : i===2 ? 'bg-orange-700 text-white' : 'bg-slate-800 text-slate-500'}`}>{i+1}</span>
                                                <span className="font-bold text-white truncate max-w-[100px]">{formatPlayerName(s)}</span>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-cyan-400 font-mono font-black">{s.score} PTS</span>
                                                <span className="text-[9px] text-slate-600 font-mono mt-0.5"><Zap className="inline w-2 h-2 text-yellow-500"/> {s.speedReached}ms</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-slate-600 text-xs italic py-10">Ningún jugador ha dominado este nivel.</div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="w-full max-w-md flex flex-col items-center justify-start flex-grow mt-2 md:mt-10">
                    
                    {/* HUD IN-GAME */}
                    <div className="w-full flex justify-between items-center bg-slate-900/80 px-6 py-4 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md mb-8">
                        {/* Nombre y Puntuación (Izquierda) */}
                        <div className="flex flex-col items-start">
                            <span className="text-[9px] text-cyan-500 font-bold uppercase tracking-widest flex items-center gap-1"><User className="w-3 h-3"/> {user?.name || 'Sujeto'}</span>
                            <div className="flex items-baseline gap-1 mt-1">
                                <span className="text-3xl font-black text-white font-mono leading-none">{score}</span>
                                <span className="text-[10px] text-slate-500 font-bold">PTS</span>
                            </div>
                        </div>

                        {/* Vidas o Info Rival (Derecha) */}
                        {view === 'pvp_game' ? (
                            <div className="flex flex-col items-end border-l border-slate-700 pl-4">
                                <span className="text-[9px] text-red-400 font-bold uppercase tracking-widest flex items-center gap-1 truncate max-w-[100px]">{opName} <User className="w-3 h-3"/></span>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xl font-black text-white font-mono">{opScore}</span>
                                    <div className="flex gap-0.5">{[...Array(opLives)].map((_,i)=><div key={`opL-${i}`} className="w-1.5 h-1.5 bg-red-500 rounded-full shadow-[0_0_5px_red]"></div>)}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-end border-l border-slate-700 pl-4">
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">ESTADO VITAL</span>
                                <div className="flex gap-1.5 mt-2">
                                    {[...Array(3)].map((_,i) => <Heart key={`l-${i}`} className={`w-5 h-5 ${i < lives ? 'text-red-500 fill-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'text-slate-800'}`}/>)}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* MENSAJE DE ESTADO */}
                    <div className="mb-6 h-8 flex items-center justify-center">
                        <span className={`text-sm sm:text-base font-black px-6 py-2 rounded-full border backdrop-blur-sm shadow-lg tracking-widest uppercase transition-all duration-300 ${gameState === 'playing' ? (isPlayingSequence ? 'text-yellow-400 bg-yellow-900/30 border-yellow-500/50 animate-pulse' : 'text-green-400 bg-green-900/30 border-green-500/50') : 'text-red-400 bg-red-900/30 border-red-500/50'}`}>
                            {message}
                        </span>
                    </div>

                    {/* TABLERO SIMON (TÁCTIL Y ADAPTABLE) */}
                    {/* touch-none solo aquí para que no haga scroll al pulsar un botón */}
                    <div className="relative w-[280px] h-[280px] sm:w-[350px] sm:h-[350px] rounded-full border-[12px] border-slate-800 bg-slate-950 shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-wrap overflow-hidden p-1.5 shrink-0 touch-none">
                        
                        {/* CENTRO NEGRO */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35%] h-[35%] bg-slate-900 rounded-full z-20 border-8 border-slate-800 flex flex-col items-center justify-center shadow-inner">
                            <span className="text-[8px] sm:text-[10px] text-slate-500 font-bold tracking-widest mb-0.5">{view==='pvp_game' && roomCode ? `ROOM` : 'LVL'}</span>
                            <span className="text-xs sm:text-sm font-black text-slate-300">{view==='pvp_game' && roomCode ? roomCode : DIFFICULTY_LEVELS[difficulty].name}</span>
                        </div>

                        {/* BOTONES COLORES */}
                        {COLORS.map((color, index) => (
                            <button
                                key={color}
                                onPointerDown={(e) => { e.preventDefault(); handleColorClick(color); }}
                                disabled={gameState !== 'playing' || isPlayingSequence}
                                className={`
                                    w-1/2 h-1/2 transition-all duration-100 border-[6px] border-slate-950 relative
                                    ${index === 0 ? 'rounded-tl-full' : ''} ${index === 1 ? 'rounded-tr-full' : ''}
                                    ${index === 2 ? 'rounded-bl-full' : ''} ${index === 3 ? 'rounded-br-full' : ''}
                                    ${activeColor === color ? COLOR_STYLES[color].active : COLOR_STYLES[color].base}
                                    disabled:cursor-not-allowed active:scale-95
                                `}
                            >
                                {/* Reflejo cristalino */}
                                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity rounded-[inherit] pointer-events-none"></div>
                            </button>
                        ))}
                    </div>

                    {/* BOTONES EXTRA (SOLO PVE) */}
                    {view === 'pve' && gameState === 'playing' && (
                        <div className="mt-12 flex gap-4 w-full max-w-[280px] sm:max-w-[350px]">
                            <button onClick={() => triggerAd('hint')} className="w-full py-4 bg-slate-800 border border-slate-700 hover:border-cyan-500 hover:bg-slate-700 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-cyan-400 transition shadow-lg">
                                <Eye className="w-5 h-5"/> VER PISTA (AD)
                            </button>
                        </div>
                    )}

                    {/* GAME OVER MODAL */}
                    {gameState === 'gameover' && (
                        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50 animate-in zoom-in backdrop-blur-xl p-6 text-center">
                            <ShieldAlert className="w-24 h-24 text-red-500 mb-6 animate-pulse drop-shadow-[0_0_30px_red]"/>
                            <h2 className="text-4xl sm:text-5xl font-black text-white italic mb-2 tracking-tighter">FALLO DE SISTEMA</h2>
                            
                            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl mb-8 mt-4 w-full max-w-sm">
                                <p className="text-slate-500 text-xs uppercase tracking-widest mb-1 font-bold">Patrones decodificados</p>
                                <p className="text-6xl font-mono font-black text-cyan-400">{score}</p>
                            </div>
                            
                            {view === 'pve' && canRevive ? (
                                <button onClick={() => triggerAd('revive')} className="w-full max-w-sm py-5 bg-gradient-to-r from-red-600 to-rose-600 border-2 border-red-400 rounded-2xl font-black text-white shadow-[0_0_30px_rgba(225,29,72,0.5)] mb-4 flex items-center justify-center gap-3 hover:scale-105 transition hover:brightness-110">
                                    <Heart className="w-6 h-6 fill-current animate-bounce"/> RECUPERAR SISTEMA (1 VIDA)
                                </button>
                            ) : null}
                            
                            <div className="flex gap-3 w-full max-w-sm">
                                <button onClick={() => setView('menu')} className="flex-1 py-4 bg-slate-800 text-white font-bold rounded-xl text-xs border border-slate-700 hover:bg-slate-700 transition uppercase tracking-widest">SALIR</button>
                                <button onClick={() => initGame(view === 'pvp_game' ? 'pvp' : 'pve')} className="flex-[2] py-4 bg-white text-black font-black rounded-xl text-sm hover:scale-105 transition shadow-lg flex items-center justify-center gap-2 uppercase tracking-widest"><RefreshCw className="w-4 h-4"/> REINTENTAR</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* CONTENEDOR PUBLICIDAD FIJO */}
        <div className="fixed bottom-0 w-full z-50 pointer-events-auto bg-[#020617]/90 backdrop-blur-sm border-t border-slate-800 pb-safe">
            <AdSpace type="banner" />
        </div>
    </div>
  );
}