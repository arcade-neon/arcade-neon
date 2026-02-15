// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Trophy, Users, Play, RefreshCw, 
  Zap, Brain, Activity, Coins, MessageSquare, Hand, 
  Volume2, PlayCircle, X, ShieldAlert, Heart, Eye
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, onSnapshot, getDoc, serverTimestamp, setDoc, collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- CONFIGURACIÓN ---
const COLORS = ['green', 'red', 'yellow', 'blue'];
const COLOR_STYLES = {
    green: { base: 'bg-green-600', active: 'bg-green-400 shadow-[0_0_30px_#4ade80] scale-105', sound: 'simon1' },
    red: { base: 'bg-red-600', active: 'bg-red-400 shadow-[0_0_30px_#f87171] scale-105', sound: 'simon2' },
    yellow: { base: 'bg-yellow-600', active: 'bg-yellow-400 shadow-[0_0_30px_#facc15] scale-105', sound: 'simon3' },
    blue: { base: 'bg-blue-600', active: 'bg-blue-400 shadow-[0_0_30px_#60a5fa] scale-105', sound: 'simon4' }
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
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in backdrop-blur-xl">
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
  const [sequence, setSequence] = useState([]);
  const [playerInput, setPlayerInput] = useState([]);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [activeColor, setActiveColor] = useState(null);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState('idle'); // idle, playing, gameover
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
  const [showAd, setShowAd] = useState(false);
  const [adType, setAdType] = useState(null); // 'revive', 'hint'
  const rand = useRef(Math.random);

  const fetchLeaderboard = async () => {
    try { const q = query(collection(db, "scores_simon"), orderBy("score", "desc"), limit(5)); const s = await getDocs(q); setLeaderboard(s.docs.map(d=>d.data())); } catch(e){}
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ? { uid: u.uid, name: u.displayName || 'Sujeto' } : null));
    fetchLeaderboard();
    return () => unsub();
  }, []);

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
                    initGame('pvp', data.seed);
                }
            }
        });
        return () => { setTimeout(() => { if (unsubscribe) unsubscribe(); }, 0); };
    }
  }, [view, roomCode, isHost, gameState, sequence]);

  // --- MOTOR JUEGO ---
  const initGame = (mode, seed = null) => {
      if (seed) {
          rand.current = mulberry32(seed);
      } else {
          rand.current = Math.random;
      }
      
      setSequence([]);
      setPlayerInput([]);
      setScore(0);
      setLives(3);
      setCanRevive(true);
      setGameState('playing');
      setMessage('MEMORIZA');
      
      // Primera ronda
      setTimeout(() => nextRound([]), 1000);
  };

  const nextRound = (currentSeq) => {
      const nextColor = COLORS[Math.floor(rand.current() * 4)];
      const newSeq = [...currentSeq, nextColor];
      setSequence(newSeq);
      setPlayerInput([]);
      setMessage(`RONDA ${newSeq.length}`);
      playSequence(newSeq);
  };

  const playSequence = (seq) => {
      setIsPlayingSequence(true);
      let i = 0;
      const interval = setInterval(() => {
          if (i >= seq.length) {
              clearInterval(interval);
              setIsPlayingSequence(false);
              setMessage('TU TURNO');
              return;
          }
          flashButton(seq[i]);
          i++;
      }, 800); // Velocidad
  };

  const flashButton = (color) => {
      setActiveColor(color);
      playSound('simon_beep'); // Usar sonido genérico o mapeado
      setTimeout(() => setActiveColor(null), 400);
  };

  const handleColorClick = (color) => {
      if (gameState !== 'playing' || isPlayingSequence) return;

      flashButton(color);
      
      const expectedColor = sequence[playerInput.length];
      
      if (color === expectedColor) {
          const newInput = [...playerInput, color];
          setPlayerInput(newInput);
          
          if (newInput.length === sequence.length) {
              // Ronda completada
              const newScore = score + 1;
              setScore(newScore);
              playSound('powerup');
              setMessage('¡CORRECTO!');
              
              if (view === 'pvp_game') updateOnlineStatus(newScore, lives);
              
              setTimeout(() => nextRound(sequence), 1000);
          }
      } else {
          // Fallo
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
              playSequence(sequence);
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
          setCanRevive(false); // Solo una vez
          setGameState('playing');
          setMessage('SISTEMA REINICIADO');
          setTimeout(() => {
              setPlayerInput([]);
              playSequence(sequence);
          }, 1000);
      } else if (adType === 'hint') {
          setMessage('REPITIENDO SECUENCIA...');
          setTimeout(() => {
              playSequence(sequence);
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
          seed, betInfo: { type: betType, value: betAmount }, createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); setCurrentBetInfo({ type: betType, value: betAmount });
      initGame('pvp', seed); setView('pvp_game');
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

  const saveScore = async (s) => { 
      if(user) { 
          await addDoc(collection(db, "scores_simon"), { uid: user.uid, displayName: user.name, score: s, date: serverTimestamp() });
          fetchLeaderboard();
      } 
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono text-white select-none overflow-hidden touch-none">
        
        {/* FONDO */}
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#050b14] to-black opacity-80"></div>
        {showAd && <VideoAdOverlay onComplete={onAdCompleted} onCancel={() => setShowAd(false)} label={adType==='revive' ? "RECUPERAR SISTEMA" : "DECODIFICANDO PATRÓN"} />}

        {/* HEADER */}
        <div className="w-full max-w-lg flex justify-between items-center mb-6 z-10 mt-2">
            <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-cyan-500 transition shadow-lg"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
            <div className="text-center">
                <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 italic tracking-tighter">NEURAL SIMON</h1>
                <p className="text-[10px] text-cyan-500/50 font-bold tracking-[0.5em] uppercase">MEMORY HACK</p>
            </div>
            <div className="bg-slate-900/90 px-3 py-1.5 rounded-full border border-yellow-500/30 flex items-center gap-2 shadow-lg">
                <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center"><Coins className="w-3 h-3 text-black fill-current" /></div>
                <span className="text-xs font-black text-yellow-400 tabular-nums">{coins.toLocaleString()}</span>
            </div>
        </div>

        {view === 'menu' ? (
            <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-4 z-10 px-2">
                <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                    <h2 className="text-xl font-bold text-cyan-400 mb-4 flex gap-2 tracking-widest items-center"><Brain className="w-6 h-6"/> ENTRENAMIENTO</h2>
                    <button onClick={() => { setView('pve'); initGame('pve'); }} className="w-full py-4 bg-slate-950 border border-slate-700 hover:border-cyan-500 text-white font-black rounded-xl uppercase tracking-widest transition flex items-center justify-center gap-2 shadow-lg">
                        <Play className="w-4 h-4 text-cyan-400"/> INICIAR SECUENCIA
                    </button>
                </div>

                <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden">
                    <h2 className="text-xl font-bold text-purple-400 mb-4 flex gap-2 tracking-widest items-center"><Users className="w-6 h-6"/> DUELO NEURAL</h2>
                    <div className="flex gap-2 mb-4 bg-black/40 p-2 rounded-lg">
                        <button onClick={() => setBetType('money')} className={`flex-1 py-2 text-[10px] font-bold rounded uppercase ${betType==='money'?'bg-yellow-500 text-black':'text-slate-500'}`}>MONEDAS</button>
                        <button onClick={() => setBetType('text')} className={`flex-1 py-2 text-[10px] font-bold rounded uppercase ${betType==='text'?'bg-pink-500 text-white':'text-slate-500'}`}>RETO</button>
                    </div>
                    {betType === 'money' ? <input type="number" value={betAmount} onChange={(e)=>setBetAmount(Number(e.target.value))} className="w-full bg-black p-3 rounded-xl mb-4 text-yellow-400 font-bold text-center border border-slate-700 outline-none"/> : <input type="text" value={betText} onChange={(e)=>setBetText(e.target.value)} placeholder="Escribe el reto..." className="w-full bg-black p-3 rounded-xl mb-4 text-white text-center border border-slate-700 text-xs outline-none"/>}
                    
                    <div className="flex gap-3">
                        <button onClick={createRoom} className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold text-xs text-white shadow-lg">CREAR</button>
                        <input id="code" placeholder="CÓDIGO" className="w-24 bg-black border border-slate-700 rounded-xl text-center font-bold text-cyan-400 outline-none"/>
                        <button onClick={() => joinRoom(document.getElementById('code').value)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl font-bold text-xs text-white">UNIRSE</button>
                    </div>
                </div>

                {leaderboard.length > 0 && (
                    <div className="bg-black/40 p-6 rounded-3xl border border-white/5 mt-2">
                        <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-3 flex gap-2 items-center justify-center tracking-widest"><Trophy className="w-3 h-3 text-yellow-500"/> Mentes Brillantes</h3>
                        {leaderboard.map((s,i) => (
                            <div key={i} className="flex justify-between text-xs text-slate-400 border-b border-white/5 py-2 last:border-0">
                                <span className="font-bold text-white">#{i+1} {s.displayName}</span>
                                <span className="text-cyan-400 font-mono font-black">{s.score} PTS</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        ) : (
            <div className="w-full h-full flex flex-col items-center flex-grow z-10 relative justify-center overflow-auto">
                
                {/* HUD */}
                <div className="w-full max-w-sm mb-8 flex justify-between items-center bg-slate-900/80 px-6 py-3 rounded-full border border-slate-700 shadow-xl backdrop-blur-md">
                    <div className="flex flex-col items-center">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">PUNTUACIÓN</span>
                        <span className="text-2xl font-black text-cyan-400 font-mono">{score}</span>
                    </div>
                    {view === 'pvp_game' ? (
                        <div className="flex flex-col items-center border-l border-slate-700 pl-6">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest truncate max-w-[80px]">{opName}</span>
                            <div className="flex gap-2 items-center">
                                <span className="text-xl font-black text-purple-400 font-mono">{opScore}</span>
                                <div className="flex gap-0.5">{[...Array(opLives)].map((_,i)=><div key={i} className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>)}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center border-l border-slate-700 pl-6">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">VIDAS</span>
                            <div className="flex gap-1 mt-1">
                                {[...Array(3)].map((_,i) => <Heart key={i} className={`w-4 h-4 ${i < lives ? 'text-red-500 fill-red-500' : 'text-slate-700'}`}/>)}
                            </div>
                        </div>
                    )}
                </div>

                {/* TABLERO SIMON (ADAPTABLE) */}
                <div className="relative w-[300px] h-[300px] sm:w-[350px] sm:h-[350px] rounded-full border-8 border-slate-800 bg-slate-900 shadow-2xl flex flex-wrap overflow-hidden p-1 shrink-0">
                    {/* BOTONES */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 h-1/3 bg-slate-950 rounded-full z-20 border-4 border-slate-800 flex flex-col items-center justify-center shadow-lg">
                        <span className="text-[10px] text-slate-500 font-bold tracking-widest mb-1">{view==='pvp_game' && roomCode ? `ROOM: ${roomCode}` : 'NEURAL'}</span>
                        <span className={`text-xs font-black px-2 py-1 rounded ${gameState === 'playing' ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'}`}>{message}</span>
                    </div>

                    {COLORS.map((color, index) => (
                        <button
                            key={color}
                            onClick={() => handleColorClick(color)}
                            disabled={gameState !== 'playing' || isPlayingSequence}
                            className={`
                                w-1/2 h-1/2 transition-all duration-100 border-4 border-slate-900 relative
                                ${index === 0 ? 'rounded-tl-full' : ''} ${index === 1 ? 'rounded-tr-full' : ''}
                                ${index === 2 ? 'rounded-bl-full' : ''} ${index === 3 ? 'rounded-br-full' : ''}
                                ${activeColor === color ? COLOR_STYLES[color].active : COLOR_STYLES[color].base}
                                disabled:cursor-not-allowed active:scale-95
                            `}
                        >
                            {/* Brillo interior */}
                            <div className="absolute inset-0 bg-white opacity-0 hover:opacity-10 transition-opacity rounded-[inherit]"></div>
                        </button>
                    ))}
                </div>

                {/* BOTONES EXTRA (SOLO PVE) */}
                {view === 'pve' && gameState === 'playing' && (
                    <div className="mt-8 flex gap-4">
                        <button onClick={() => triggerAd('hint')} className="px-6 py-3 bg-slate-800 border border-slate-700 hover:border-cyan-500 rounded-xl flex items-center gap-2 text-xs font-bold text-cyan-400 transition shadow-lg">
                            <Eye className="w-4 h-4"/> VER PISTA (AD)
                        </button>
                    </div>
                )}

                {/* GAME OVER MODAL */}
                {gameState === 'gameover' && (
                    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50 animate-in zoom-in backdrop-blur-md rounded-xl p-6 text-center">
                        <ShieldAlert className="w-20 h-20 text-red-500 mb-4 animate-pulse"/>
                        <h2 className="text-4xl font-black text-white italic mb-2 tracking-tighter">FALLO DE SISTEMA</h2>
                        <p className="text-slate-400 text-sm uppercase tracking-widest mb-6">Puntuación Final: <span className="text-white font-bold">{score}</span></p>
                        
                        {view === 'pve' && canRevive ? (
                            <button onClick={() => triggerAd('revive')} className="w-full max-w-xs py-4 bg-gradient-to-r from-red-600 to-rose-600 rounded-xl font-black text-white shadow-lg shadow-red-900/50 mb-3 flex items-center justify-center gap-2 hover:scale-105 transition animate-pulse">
                                <Heart className="w-5 h-5 fill-current"/> REVIVIR (1 VIDA)
                            </button>
                        ) : null}
                        
                        <div className="flex gap-2 w-full max-w-xs">
                            <button onClick={() => initGame('pve')} className="flex-1 py-3 bg-white text-black font-bold rounded-lg text-xs hover:scale-105 transition">REINTENTAR</button>
                            <button onClick={() => setView('menu')} className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-lg text-xs border border-slate-600">SALIR</button>
                        </div>
                    </div>
                )}
            </div>
        )}

        <div className="mt-auto w-full max-w-md pt-4 opacity-75"><AdSpace type="banner" /><GameChat gameId={roomCode || "global_simon"} gameName="SIMON" /></div>
    </div>
  );
}