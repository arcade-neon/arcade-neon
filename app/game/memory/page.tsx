// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Brain, Clock, Coins, Users, MessageSquare, Hand, Trophy, 
  Play, Forward, BarChart3, AlertTriangle, Lock, Unlock,
  // Iconos del Juego
  Ghost, Skull, Zap, Shield, Cpu, Gem, Anchor, Bomb, 
  Aperture, Atom, Binary, Codesandbox, Database, Fingerprint, Globe, 
  Infinity, Radio, Target, Terminal, Wifi
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, onSnapshot, getDoc, serverTimestamp, setDoc, collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- 1. CONFIGURACIÓN DE ICONOS Y COLORES ---
const ICON_DEFS = [
    { Icon: Ghost, color: 'text-purple-400', shadow: '#c084fc' },
    { Icon: Skull, color: 'text-slate-200', shadow: '#e2e8f0' },
    { Icon: Zap, color: 'text-yellow-400', shadow: '#facc15' },
    { Icon: Shield, color: 'text-blue-400', shadow: '#60a5fa' },
    { Icon: Cpu, color: 'text-cyan-400', shadow: '#22d3ee' },
    { Icon: Gem, color: 'text-pink-400', shadow: '#f472b6' },
    { Icon: Anchor, color: 'text-teal-400', shadow: '#2dd4bf' },
    { Icon: Bomb, color: 'text-red-500', shadow: '#ef4444' },
    { Icon: Atom, color: 'text-indigo-400', shadow: '#818cf8' },
    { Icon: Binary, color: 'text-green-400', shadow: '#4ade80' },
    { Icon: Fingerprint, color: 'text-rose-400', shadow: '#fb7185' },
    { Icon: Globe, color: 'text-sky-400', shadow: '#38bdf8' },
    { Icon: Infinity, color: 'text-fuchsia-400', shadow: '#e879f9' },
    { Icon: Radio, color: 'text-orange-400', shadow: '#fb923c' },
    { Icon: Wifi, color: 'text-emerald-400', shadow: '#34d399' },
    { Icon: Target, color: 'text-red-400', shadow: '#f87171' },
    { Icon: Database, color: 'text-blue-300', shadow: '#93c5fd' },
    { Icon: Terminal, color: 'text-green-500', shadow: '#22c55e' },
    { Icon: Aperture, color: 'text-yellow-200', shadow: '#fef08a' },
    { Icon: Codesandbox, color: 'text-white', shadow: '#ffffff' }
];

// --- 2. NIVELES AMPLIADOS ---
const LEVELS = [
    { level: 1, pairs: 4, cols: 4, time: 40, bonus: 100, name: 'TUTORIAL' },   
    { level: 2, pairs: 6, cols: 4, time: 50, bonus: 150, name: 'NOVATO' },  
    { level: 3, pairs: 8, cols: 4, time: 60, bonus: 200, name: 'EXPERTO' },  
    { level: 4, pairs: 10, cols: 5, time: 90, bonus: 300, name: 'MAESTRO' }, 
    { level: 5, pairs: 12, cols: 6, time: 110, bonus: 400, name: 'LEYENDA' },
    { level: 6, pairs: 15, cols: 6, time: 140, bonus: 600, name: 'TITÁN' },
    { level: 7, pairs: 18, cols: 6, time: 180, bonus: 800, name: 'CIBERPUNK' },
    { level: 8, pairs: 20, cols: 5, time: 200, bonus: 1000, name: 'DIOS' } 
];

export default function MemoryPro() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);

  // VISTAS
  const [view, setView] = useState('menu'); 
  
  // ESTADO JUEGO
  const [currentLevelIdx, setCurrentLevelIdx] = useState(0); 
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]); 
  const [matched, setMatched] = useState([]); 
  const [timer, setTimer] = useState(60);
  const [mistakes, setMistakes] = useState(0); 
  
  const [gameActive, setGameActive] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [finalScore, setFinalScore] = useState(0);

  // DATA
  const [leaderboard, setLeaderboard] = useState([]);

  // ESTADO ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [turn, setTurn] = useState('host'); 
  const [scores, setScores] = useState({ host: 0, guest: 0 });
  const [opName, setOpName] = useState('Rival');
  
  // APUESTAS
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [currentBetInfo, setCurrentBetInfo] = useState(null);

  const timerRef = useRef(null);

  // --- INICIALIZACIÓN ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) setUser({ uid: u.uid, name: u.displayName || 'Hacker' });
        else setUser(null);
    });
    fetchLeaderboard();
    return () => unsubscribe();
  }, []);

  // --- NAVEGACIÓN INTELIGENTE ---
  const handleBack = () => {
      if (view === 'menu') {
          window.location.href = '/';
      } else {
          goToMenu();
      }
  };

  const goToMenu = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setGameActive(false);
      setGameOver(false);
      setGameWon(false);
      setFlipped([]);
      setMatched([]);
      setView('menu');
      fetchLeaderboard(); 
  };

  // --- SYNC ONLINE ---
  useEffect(() => {
    if (view === 'pvp_game' && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_memory", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.cards) setCards(data.cards);
                if (data.flipped) setFlipped(data.flipped);
                if (data.matched) setMatched(data.matched);
                if (data.turn) setTurn(data.turn);
                if (data.scores) setScores(data.scores);
                if (data.betInfo) setCurrentBetInfo(data.betInfo);
                
                if (isHost) setOpName(data.guestName || 'Esperando...');
                else setOpName(data.hostName || 'Host');

                if (data.matched.length === data.totalPairs) {
                    setGameActive(false);
                    setGameOver(true);
                }
            }
        });
        
        // FIX: Safe Unsubscribe
        return () => {
            setTimeout(() => {
                if (unsubscribe && typeof unsubscribe === 'function') unsubscribe();
            }, 0);
        };
    }
  }, [view, roomCode, isHost]);

  // --- LÓGICA DEL JUEGO ---
  const startLevel = (levelIndex) => {
      playSound('start');
      const config = LEVELS[levelIndex];
      setCurrentLevelIdx(levelIndex);
      setMistakes(0); 
      
      const levelIcons = ICON_DEFS.slice(0, config.pairs);
      const generated = [...levelIcons, ...levelIcons].map((def, i) => ({
          id: i, iconIndex: ICON_DEFS.indexOf(def), isMatched: false
      }));
      
      const deck = generated.sort(() => Math.random() - 0.5);

      setCards(deck);
      setFlipped([]);
      setMatched([]);
      setTimer(config.time);
      setGameActive(true);
      setGameOver(false);
      setGameWon(false);
      
      startTimer();
  };

  const startTimer = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
          setTimer((prev) => {
              if (prev <= 1) {
                  clearInterval(timerRef.current);
                  handleGameOver(false);
                  return 0;
              }
              return prev - 1;
          });
      }, 1000);
  };

  const handleCardClick = async (index) => {
      if (!gameActive || gameOver) return;
      if (cards[index].isMatched || flipped.includes(index)) return;
      
      if (view === 'pvp_game') {
          if (isHost && turn !== 'host') return;
          if (!isHost && turn !== 'guest') return;
      }

      if (flipped.length >= 2) return;

      playSound('card');

      const newFlipped = [...flipped, index];
      setFlipped(newFlipped);

      if (view === 'pvp_game') {
          await updateDoc(doc(db, "matches_memory", roomCode), { flipped: newFlipped });
      }

      if (newFlipped.length === 2) {
          const firstIndex = newFlipped[0];
          const secondIndex = newFlipped[1];
          
          if (cards[firstIndex].iconIndex === cards[secondIndex].iconIndex) {
              playSound('success');
              const newMatched = [...matched, cards[firstIndex].iconIndex];
              setMatched(newMatched);
              
              const newCards = [...cards];
              newCards[firstIndex].isMatched = true;
              newCards[secondIndex].isMatched = true;
              setCards(newCards);
              setFlipped([]);

              if (view === 'pvp_game') {
                  const role = isHost ? 'host' : 'guest';
                  const newScores = { ...scores, [role]: scores[role] + 1 };
                  await updateDoc(doc(db, "matches_memory", roomCode), { 
                      matched: newMatched, scores: newScores, cards: newCards, flipped: [] 
                  });
              }

              const pairsNeeded = view === 'pve' ? LEVELS[currentLevelIdx].pairs : LEVELS[2].pairs;
              if (newMatched.length === pairsNeeded) {
                  handleGameOver(true);
              }

          } else {
              if (view === 'pve') {
                  setMistakes(m => m + 1);
              }

              setTimeout(async () => {
                  setFlipped([]);
                  if (view === 'pvp_game') {
                      const nextTurn = turn === 'host' ? 'guest' : 'host';
                      await updateDoc(doc(db, "matches_memory", roomCode), { flipped: [], turn: nextTurn });
                  }
              }, 1000);
          }
      }
  };

  const handleGameOver = (win) => {
      clearInterval(timerRef.current);
      setGameActive(false);
      setGameOver(true);
      setGameWon(win);
      
      if (win) {
          playSound('win');
          if (view === 'pve') {
              const config = LEVELS[currentLevelIdx];
              const timeBonus = timer * 10;
              const penalty = mistakes * 15;
              const totalScore = Math.max(0, config.bonus + timeBonus - penalty);
              
              setFinalScore(totalScore);
              addCoins(totalScore, `Nivel ${config.level} Completado`);
              saveScore(totalScore);
          }
      } else {
          playSound('lose');
      }
  };

  const handleNextLevel = () => {
      if (currentLevelIdx < LEVELS.length - 1) {
          startLevel(currentLevelIdx + 1);
      } else {
          goToMenu();
      }
  };

  // --- ONLINE SETUP ---
  const handleCreateRoom = async () => {
      if (!user) return alert("Inicia sesión");
      if (betType === 'money') {
          if (coins < betAmount) return alert("Fondos insuficientes");
          await spendCoins(betAmount, "Apuesta Memory (Host)");
      }

      const betInfo = { type: betType, value: betType === 'money' ? betAmount : betText || 'Honor' };
      const config = LEVELS[2]; 
      
      const levelIcons = ICON_DEFS.slice(0, config.pairs);
      const generated = [...levelIcons, ...levelIcons].map((def, i) => ({
          id: i, iconIndex: ICON_DEFS.indexOf(def), isMatched: false
      }));
      const deck = generated.sort(() => Math.random() - 0.5);

      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_memory", code), {
          host: user.uid, hostName: user.name,
          guest: null, guestName: 'Esperando...',
          cards: deck, flipped: [], matched: [],
          turn: 'host', scores: { host: 0, guest: 0 },
          betInfo, totalPairs: config.pairs,
          createdAt: serverTimestamp()
      });

      setRoomCode(code); setIsHost(true); setCurrentBetInfo(betInfo);
      setCards(deck); setView('pvp_game'); setGameActive(true);
  };

  const joinRoom = async (inputCode) => {
      if (!user) return alert("Inicia sesión");
      const ref = doc(db, "matches_memory", inputCode);
      const snap = await getDoc(ref);
      if (!snap.exists()) return alert("Sala no encontrada");
      
      const data = snap.data();
      if (data.betInfo?.type === 'money') {
          if (coins < data.betInfo.value) return alert("Fondos insuficientes");
          await spendCoins(data.betInfo.value, "Apuesta Memory (Guest)");
      }

      await updateDoc(ref, { guest: user.uid, guestName: user.name });
      setRoomCode(inputCode); setIsHost(false); setCurrentBetInfo(data.betInfo);
      setCards(data.cards); setView('pvp_game'); setGameActive(true);
  };

  const saveScore = async (s) => {
      if(user) {
          try {
            await addDoc(collection(db, "scores_memory"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() });
          } catch(e) {}
      }
  };

  const fetchLeaderboard = async () => {
      try {
          const q = query(collection(db, "scores_memory"), orderBy("score", "desc"), limit(5));
          const s = await getDocs(q);
          setLeaderboard(s.docs.map(d => d.data()));
      } catch (e) { console.error(e); }
  };

  // --- RENDERIZADO 3D ---
  const renderCard = (card, index) => {
      const isFlipped = flipped.includes(index);
      const isMatched = matched.includes(card.iconIndex);
      const IconDef = ICON_DEFS[card.iconIndex];
      const Icon = IconDef.Icon;

      return (
          <div 
            key={index} 
            onClick={() => handleCardClick(index)} 
            className="relative aspect-[3/4] cursor-pointer group"
            style={{ perspective: '1000px' }}
          >
              <div 
                className="w-full h-full relative transition-transform duration-500"
                style={{ 
                    transformStyle: 'preserve-3d', 
                    transform: (isFlipped || isMatched) ? 'rotateY(180deg)' : 'rotateY(0deg)' 
                }}
              >
                  {/* FRENTE (CANDADO) */}
                  <div 
                    className="absolute inset-0 bg-slate-900 border-2 border-slate-700 rounded-xl flex items-center justify-center shadow-lg group-hover:border-fuchsia-500 transition-colors"
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }} 
                  >
                      <Lock className="w-8 h-8 text-slate-600 group-hover:text-fuchsia-500/50 transition-colors" />
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                  </div>

                  {/* DORSO (ICONO PRO) */}
                  <div 
                    className={`absolute inset-0 bg-slate-800 border-2 ${isMatched ? 'border-green-500 bg-green-900/20' : 'border-fuchsia-500 bg-slate-900'} rounded-xl flex items-center justify-center`}
                    style={{ 
                        backfaceVisibility: 'hidden', 
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)' 
                    }}
                  >
                      <Icon 
                        className={`w-12 h-12 md:w-14 md:h-14 ${IconDef.color} transition-all duration-300 ${isMatched ? 'drop-shadow-[0_0_15px_currentColor] scale-110' : ''}`} 
                        style={{ filter: `drop-shadow(0 0 5px ${IconDef.shadow})` }}
                      />
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono text-white select-none overflow-x-hidden">
        
        {/* FONDO */}
        <div className="fixed inset-0 pointer-events-none opacity-10 bg-[length:30px_30px] bg-[linear-gradient(0deg,transparent_24%,rgba(255,0,255,.3)_25%,rgba(255,0,255,.3)_26%,transparent_27%,transparent_74%,rgba(255,0,255,.3)_75%,rgba(255,0,255,.3)_76%,transparent_77%,transparent),linear-gradient(90deg,transparent_24%,rgba(255,0,255,.3)_25%,rgba(255,0,255,.3)_26%,transparent_27%,transparent_74%,rgba(255,0,255,.3)_75%,rgba(255,0,255,.3)_76%,transparent_77%,transparent)]"></div>

        {/* HEADER */}
        <div className="w-full max-w-lg flex justify-between items-center mb-6 z-10 mt-4">
            <button onClick={handleBack} className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:border-fuchsia-500 transition shadow-lg"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
            <div className="text-center">
                <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-purple-600 italic tracking-tighter uppercase drop-shadow-[0_0_10px_rgba(217,70,239,0.5)]">
                    MEMORY
                </h1>
                {view === 'pve' && <p className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-widest bg-fuchsia-950/30 px-2 py-1 rounded inline-block mt-1 border border-fuchsia-500/20">{LEVELS[currentLevelIdx].name}</p>}
            </div>
            <div className="bg-slate-900 px-3 py-1 rounded-full border border-slate-700 flex items-center gap-2 shadow-lg min-w-[80px] justify-center">
                <Clock className="w-4 h-4 text-fuchsia-500"/>
                <span className={`font-bold text-sm ${timer < 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{view === 'pve' ? timer : '∞'}</span>
            </div>
        </div>

        {/* MENU */}
        {view === 'menu' && (
            <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-6 z-10">
                <button onClick={() => { setView('pve'); startLevel(0); }} className="bg-slate-900/80 backdrop-blur-md p-6 rounded-3xl border border-slate-700 flex items-center gap-4 hover:border-fuchsia-500 transition group shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/10 rounded-bl-full -mr-8 -mt-8 transition-all group-hover:bg-fuchsia-500/20"></div>
                    <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 group-hover:bg-fuchsia-900/20 transition relative z-10"><Unlock className="w-8 h-8 text-fuchsia-400"/></div>
                    <div className="text-left relative z-10">
                        <h2 className="text-xl font-black text-white italic">CAMPAÑA HACKER</h2>
                        <p className="text-xs text-slate-400 uppercase tracking-wide">8 Niveles de Seguridad</p>
                    </div>
                </button>

                <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-3xl border border-slate-700 relative overflow-hidden group shadow-2xl">
                    <div className="flex items-center gap-4 mb-4 relative z-10">
                        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800"><Users className="w-8 h-8 text-blue-400"/></div>
                        <div className="text-left">
                            <h2 className="text-xl font-black text-white italic">DUELO MENTAL</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-wide">Multijugador con Apuestas</p>
                        </div>
                    </div>
                    <div className="flex gap-2 relative z-10">
                        <button onClick={() => setView('pvp_setup')} className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-xs hover:bg-blue-500 shadow-lg text-white transition hover:scale-105">CREAR</button>
                        <button onClick={() => setView('pvp_join')} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-600 text-slate-300 transition hover:scale-105">UNIRSE</button>
                    </div>
                </div>

                {/* RANKING INTEGRADO */}
                {leaderboard.length > 0 && (
                    <div className="bg-black/40 backdrop-blur-sm p-5 rounded-3xl border border-white/5 mt-4 shadow-xl">
                        <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-3 flex gap-2 items-center tracking-widest">
                            <BarChart3 className="w-3 h-3 text-fuchsia-500"/> Top Hackers
                        </h3>
                        {leaderboard.map((s,i) => (
                            <div key={i} className="flex justify-between items-center text-[11px] text-slate-300 border-b border-white/5 py-2 last:border-0 group">
                                <div className="flex items-center gap-3">
                                    <span className={`w-5 h-5 flex items-center justify-center rounded-full font-bold text-[9px] ${i===0?'bg-yellow-500 text-black':i===1?'bg-slate-400 text-black':i===2?'bg-orange-700 text-white':'bg-slate-800 text-slate-500'}`}>
                                        {i+1}
                                    </span>
                                    <span className="font-bold group-hover:text-white transition-colors">{s.displayName}</span>
                                </div>
                                <span className="text-fuchsia-400 font-mono font-black">{s.score} PTS</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* SETUP PVP */}
        {view === 'pvp_setup' && (
            <div className="w-full max-w-md bg-slate-900/90 border border-slate-700 p-6 rounded-3xl animate-in fade-in z-10 shadow-2xl backdrop-blur-md mt-10">
                <h2 className="text-xl font-black text-center mb-6 text-white uppercase italic tracking-widest">¿QUÉ APOSTAMOS?</h2>
                <div className="flex gap-2 mb-6">
                    <button onClick={() => setBetType('money')} className={`flex-1 py-4 rounded-2xl font-bold text-xs flex flex-col items-center gap-2 border-2 transition-all ${betType==='money' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}><Coins className="w-5 h-5"/> MONEDAS</button>
                    <button onClick={() => setBetType('text')} className={`flex-1 py-4 rounded-2xl font-bold text-xs flex flex-col items-center gap-2 border-2 transition-all ${betType==='text' ? 'bg-fuchsia-500/10 border-fuchsia-500 text-fuchsia-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}><MessageSquare className="w-5 h-5"/> RETO</button>
                </div>
                {betType === 'money' ? (
                    <div className="mb-6">
                        <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase mb-2"><span>Saldo: {coins}</span><span>Cantidad</span></div>
                        <input type="number" value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} className="w-full bg-black border-2 border-slate-700 rounded-xl p-4 text-center text-2xl font-black text-yellow-400 focus:border-yellow-500 outline-none"/>
                    </div>
                ) : (
                    <textarea value={betText} onChange={(e) => setBetText(e.target.value)} placeholder="Ej: El que pierda paga la cena..." className="w-full bg-black border-2 border-slate-700 rounded-xl p-4 text-sm font-bold text-white focus:border-fuchsia-500 outline-none h-24 resize-none mb-6"/>
                )}
                <button onClick={handleCreateRoom} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition shadow-[0_0_20px_rgba(255,255,255,0.3)] uppercase tracking-widest">CREAR SALA</button>
                <button onClick={goToMenu} className="w-full py-3 mt-2 text-slate-500 font-bold text-xs hover:text-white">CANCELAR</button>
            </div>
        )}

        {/* JOIN PVP */}
        {view === 'pvp_join' && (
            <div className="w-full max-w-md bg-slate-900 p-8 rounded-3xl border border-slate-700 animate-in fade-in mt-10 shadow-2xl z-10">
                <h2 className="text-sm font-bold mb-4 text-center text-slate-400 uppercase tracking-widest">CÓDIGO DE SALA</h2>
                <input type="number" id="code-input" placeholder="0000" className="w-full bg-black/50 border-2 border-slate-700 rounded-2xl p-6 text-center text-5xl font-black text-white mb-6 outline-none focus:border-fuchsia-500 tracking-[0.2em] transition-all"/>
                <button onClick={() => joinRoom(document.getElementById('code-input').value)} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition shadow-lg">ENTRAR</button>
                <button onClick={goToMenu} className="w-full mt-4 text-center text-xs text-slate-500 font-bold hover:text-white">VOLVER</button>
            </div>
        )}

        {/* JUEGO ACTIVO */}
        {(view === 'pve' || view === 'pvp_game') && (
            <div className="w-full max-w-3xl z-10 flex flex-col items-center flex-grow justify-center pb-20">
                
                {/* INFO SUPERIOR PVE: ERRORES */}
                {view === 'pve' && (
                    <div className="mb-4 flex gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest bg-black/40 px-4 py-1 rounded-full">
                        <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> {mistakes} Errores</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-green-400">Pares: {matched.length / 2} / {cards.length / 2}</span>
                    </div>
                )}

                {/* HUD PVP */}
                {view === 'pvp_game' && (
                    <div className="w-full flex justify-between items-center mb-6 bg-slate-900/80 p-4 rounded-2xl border border-slate-700 shadow-lg backdrop-blur-md max-w-md">
                        <div className={`text-center transition-all duration-300 ${turn === (isHost?'host':'guest') ? 'opacity-100 scale-110' : 'opacity-40 grayscale'}`}>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Tú</p>
                            <p className="text-3xl font-black text-fuchsia-400">{isHost ? scores.host : scores.guest}</p>
                        </div>
                        <div className="text-center">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${turn === (isHost?'host':'guest') ? 'bg-fuchsia-500 border-fuchsia-400 text-white shadow-[0_0_15px_#d946ef]' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
                                {turn === (isHost?'host':'guest') ? 'TU TURNO' : 'ESPERANDO...'}
                            </span>
                        </div>
                        <div className={`text-center transition-all duration-300 ${turn !== (isHost?'host':'guest') ? 'opacity-100 scale-110' : 'opacity-40 grayscale'}`}>
                            <p className="text-[10px] font-bold text-slate-400 truncate w-16 uppercase">{opName}</p>
                            <p className="text-3xl font-black text-blue-400">{isHost ? scores.guest : scores.host}</p>
                        </div>
                    </div>
                )}

                {/* GRID DINÁMICO */}
                <div 
                    className="grid gap-3 w-full animate-in zoom-in duration-500" 
                    style={{ gridTemplateColumns: `repeat(${view === 'pve' ? LEVELS[currentLevelIdx].cols : 4}, 1fr)` }}
                >
                    {cards.map((card, index) => renderCard(card, index))}
                </div>

                {view === 'pvp_game' && (
                    <div className="mt-6 text-xs font-bold text-slate-500 uppercase tracking-widest bg-black/40 px-6 py-2 rounded-full border border-slate-800 flex items-center gap-2">
                        SALA: <span className="text-white">{roomCode}</span> 
                        <span className="w-1 h-4 bg-slate-700 rounded-full mx-1"></span>
                        <span className="text-yellow-500 flex items-center gap-1"><Hand className="w-3 h-3"/> {currentBetInfo?.value}</span>
                    </div>
                )}
            </div>
        )}

        {/* MODAL FIN DE JUEGO */}
        {gameOver && (
            <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50 animate-in zoom-in backdrop-blur-md p-6">
                {view === 'pvp_game' ? (
                    <>
                        <h2 className="text-5xl font-black text-white italic mb-2 drop-shadow-lg text-center">
                            {(isHost && scores.host > scores.guest) || (!isHost && scores.guest > scores.host) ? '¡VICTORIA!' : scores.host === scores.guest ? 'EMPATE' : 'DERROTA'}
                        </h2>
                        <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl mb-6 text-center">
                            <p className="text-slate-400 text-xs font-bold uppercase mb-2">Castigo para el perdedor</p>
                            <p className="text-xl font-black text-fuchsia-400">{currentBetInfo?.value}</p>
                        </div>
                        <button onClick={goToMenu} className="px-10 py-4 bg-white text-black font-black rounded-full hover:scale-105 transition uppercase tracking-widest">SALIR</button>
                    </>
                ) : (
                    <>
                        {gameWon ? <Trophy className="w-24 h-24 text-yellow-400 mb-6 animate-bounce drop-shadow-[0_0_30px_rgba(234,179,8,0.5)]"/> : <Skull className="w-24 h-24 text-red-500 mb-6 drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]"/>}
                        <h2 className="text-4xl font-black text-white mb-2 text-center italic tracking-tighter">{gameWon ? '¡NIVEL COMPLETADO!' : 'HACKEO FALLIDO'}</h2>
                        
                        {gameWon ? (
                            <>
                                <div className="bg-slate-900/80 border border-slate-700 px-6 py-4 rounded-xl mb-8 text-center min-w-[200px]">
                                    <p className="text-xs text-slate-400 uppercase font-bold mb-1">Puntuación Total</p>
                                    <p className="text-3xl font-black text-white mb-2">{finalScore}</p>
                                    <p className="text-green-400 font-bold flex items-center justify-center gap-1 text-sm"><Coins className="w-4 h-4"/> +{finalScore} Monedas</p>
                                </div>
                                {currentLevelIdx < LEVELS.length - 1 ? (
                                    <button onClick={handleNextLevel} className="w-full max-w-xs px-8 py-4 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black rounded-xl shadow-[0_0_30px_rgba(217,70,239,0.4)] hover:scale-105 transition flex items-center justify-center gap-2 uppercase tracking-widest">
                                        SIGUIENTE NIVEL <Forward className="w-5 h-5"/>
                                    </button>
                                ) : (
                                    <div className="text-center w-full">
                                        <p className="text-xl font-black text-yellow-500 mb-6">¡ERES UNA LEYENDA!</p>
                                        <button onClick={goToMenu} className="w-full max-w-xs px-8 py-4 bg-slate-800 text-white font-bold rounded-xl border border-slate-600 hover:bg-slate-700">VOLVER AL MENÚ</button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <button onClick={() => startLevel(currentLevelIdx)} className="w-full max-w-xs px-8 py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition flex items-center justify-center gap-2 uppercase tracking-widest mt-4"><Play className="w-5 h-5 fill-current"/> REINTENTAR</button>
                        )}
                        
                        {!gameWon && <button onClick={goToMenu} className="mt-6 text-xs text-slate-500 font-bold hover:text-white uppercase tracking-widest">RENDIRSE</button>}
                    </>
                )}
            </div>
        )}

        <div className="mt-auto opacity-50"><AdSpace type="banner" /><GameChat gameId={view.includes('pvp') ? roomCode : "global_memory"} gameName="MEMORY" /></div>
    </div>
  );
}