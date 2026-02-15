// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Trophy, RefreshCw, Users, Play, Skull, 
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, 
  Coins, Hand, Zap, PlayCircle, X, Loader2, MessageSquare
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, setDoc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- CONFIGURACIÓN ---
const GRID_SIZE = 20;
const INITIAL_SPEED = 150;
const SPEED_INCREMENT = 2;
const MIN_SPEED = 60;

const getRandomPos = (snakeBody = []) => {
  let newPos;
  while (true) {
    newPos = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
    const collision = snakeBody.some(s => s.x === newPos.x && s.y === newPos.y);
    if (!collision) break;
  }
  return newPos;
};

// --- COMPONENTE ANUNCIO DE REVIVIR ---
const ReviveOverlay = ({ onComplete, onCancel }) => {
    const [timer, setTimer] = useState(5);
    useEffect(() => {
        if(timer > 0) { const i = setInterval(() => setTimer(t => t - 1), 1000); return () => clearInterval(i); } 
        else { const t = setTimeout(onComplete, 500); return () => clearTimeout(t); }
    }, [timer, onComplete]);

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in backdrop-blur-xl">
            <div className="absolute top-6 right-6"><button onClick={onCancel} className="text-white/50 hover:text-white flex items-center gap-2 text-xs uppercase tracking-widest"><X className="w-4 h-4"/> Cancelar</button></div>
            <div className="w-full max-w-md aspect-video bg-slate-900 rounded-3xl border border-slate-700 relative overflow-hidden flex flex-col items-center justify-center p-8 shadow-2xl">
                <PlayCircle className="w-16 h-16 text-rose-500 mb-6 animate-pulse"/>
                <h3 className="text-xl font-black text-white mb-2 tracking-widest uppercase">SISTEMA DE EMERGENCIA</h3>
                <p className="text-slate-400 text-xs mb-8 text-center uppercase tracking-wide">Recargando núcleo...<br/><span className="text-rose-500 font-bold font-mono text-2xl mt-2 block">{timer}s</span></p>
                <div className="w-64 bg-slate-800 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-1000 ease-linear" style={{ width: `${((5-timer)/5)*100}%` }}></div></div>
            </div>
        </div>
    );
};

export default function SnakePro() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  
  const [user, setUser] = useState(null);
  const [view, setView] = useState('menu'); 
  const [gameState, setGameState] = useState('menu');
  
  const [snake, setSnake] = useState([{x: 10, y: 10}]);
  const [food, setFood] = useState({x: 15, y: 5});
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  const [hasRevived, setHasRevived] = useState(false);
  
  const [roomCode, setRoomCode] = useState('');
  const [opName, setOpName] = useState('Rival');
  const [opScore, setOpScore] = useState(0);
  const [opStatus, setOpStatus] = useState('alive');
  const [isHost, setIsHost] = useState(false);
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [currentBetInfo, setCurrentBetInfo] = useState(null);

  const [showAd, setShowAd] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingRank, setLoadingRank] = useState(true);

  // REFS
  const snakeRef = useRef([{x: 10, y: 10}]);
  const foodRef = useRef({x: 15, y: 5}); 
  const dirRef = useRef({x: 0, y: -1}); 
  const nextDirRef = useRef({x: 0, y: -1});
  const scoreRef = useRef(0);
  const gameLoopRef = useRef(null);

  // FIX: Definimos fetchLeaderboard ANTES del useEffect para evitar errores
  const fetchLeaderboard = async () => {
    setLoadingRank(true); 
    try {
        const q = query(collection(db, "scores_snake"), orderBy("score", "desc"), limit(5));
        const s = await getDocs(q);
        const data = s.docs.map(d => d.data());
        setLeaderboard(data);
    } catch (e) {
        console.error("ERROR CRÍTICO RANKING:", e);
        setLeaderboard([]); 
    } finally {
        setLoadingRank(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u ? { uid: u.uid, name: u.displayName || 'Hacker' } : null);
    });
    fetchLeaderboard(); // Cargar ranking al inicio
    return () => unsubscribe();
  }, []);

  // --- GAME LOOP ---
  useEffect(() => {
    if (gameState === 'playing') {
      gameLoopRef.current = setInterval(moveSnake, speed);
    } else {
      clearInterval(gameLoopRef.current);
    }
    return () => clearInterval(gameLoopRef.current);
  }, [gameState, speed]);

  const moveSnake = () => {
    dirRef.current = nextDirRef.current;
    const head = { x: snakeRef.current[0].x + dirRef.current.x, y: snakeRef.current[0].y + dirRef.current.y };

    // Colisión con paredes
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) { handleGameOver(); return; }
    // Colisión con uno mismo
    if (snakeRef.current.some(s => s.x === head.x && s.y === head.y)) { handleGameOver(); return; }

    const newSnake = [head, ...snakeRef.current];
    
    // Comer Manzana
    if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
        playSound('powerup');
        const newScore = scoreRef.current + 10;
        scoreRef.current = newScore;
        setScore(newScore);
        
        const newFood = getRandomPos(newSnake);
        foodRef.current = newFood;
        setFood(newFood);
        
        // Aumentar velocidad progresivamente
        const newSpeed = Math.max(MIN_SPEED, INITIAL_SPEED - (Math.floor(newScore / 50) * 10));
        setSpeed(newSpeed);
        
        if (view.includes('pvp')) updateOnlineScore(newScore, 'alive');
    } else {
        newSnake.pop(); 
    }
    snakeRef.current = newSnake;
    setSnake(newSnake);
  };

  const changeDirection = (x, y) => {
      // Evitar giro de 180 grados (suicidio)
      if (dirRef.current.x === -x && dirRef.current.y === -y) return;
      nextDirRef.current = {x, y};
  };

  useEffect(() => {
      const handleKey = (e) => {
          if (gameState !== 'playing') return;
          if (e.key === 'ArrowUp') changeDirection(0, -1);
          if (e.key === 'ArrowDown') changeDirection(0, 1);
          if (e.key === 'ArrowLeft') changeDirection(-1, 0);
          if (e.key === 'ArrowRight') changeDirection(1, 0);
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [gameState]);

  const startGame = () => {
    playSound('start');
    const startPos = [{x: 10, y: 10}, {x: 10, y: 11}, {x: 10, y: 12}]; 
    const startFood = getRandomPos(startPos);
    snakeRef.current = startPos; foodRef.current = startFood; dirRef.current = {x: 0, y: -1}; nextDirRef.current = {x: 0, y: -1}; scoreRef.current = 0;
    setSnake(startPos); setFood(startFood); setScore(0); setSpeed(INITIAL_SPEED); setHasRevived(false); setGameState('playing');
  };

  const handleGameOver = () => {
      playSound('explosion');
      setGameState('gameover');
      if (view.includes('pvp')) { updateOnlineScore(scoreRef.current, 'dead'); }
      else if (hasRevived) { saveFinalScore(); }
  };

  const saveFinalScore = async () => {
      if (view === 'pve' && user && scoreRef.current > 0) {
          try {
              await addDoc(collection(db, "scores_snake"), { 
                  uid: user.uid, displayName: user.name, score: scoreRef.current, date: serverTimestamp() 
              });
              addCoins(Math.floor(scoreRef.current / 10), "Snake Run");
              fetchLeaderboard(); // Recargar ranking
          } catch(e) { console.error("Error guardando:", e); }
      }
  };

  const watchReviveAd = () => { setShowAd(true); };
  const onAdSuccess = () => {
      setShowAd(false); setHasRevived(true);
      // Revivir cortando la cola a la mitad y centrando la serpiente
      const halfSnake = snakeRef.current.slice(0, Math.max(3, Math.floor(snakeRef.current.length / 2)));
      const centerSafe = []; for(let i=0; i<halfSnake.length; i++) centerSafe.push({x: 10, y: 10 + i});
      snakeRef.current = centerSafe; setSnake(centerSafe); dirRef.current = {x: 0, y: -1}; nextDirRef.current = {x: 0, y: -1};
      setGameState('playing'); playSound('powerup');
  };

  // --- ONLINE ---
  const handleCreateRoom = async () => {
      if (!user) return alert("Inicia sesión para jugar online");
      if (betType === 'money' && coins < betAmount) return alert("Fondos insuficientes");
      if (betType === 'money') await spendCoins(betAmount, "Apuesta Snake");
      
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const betInfo = { type: betType, value: betType==='money' ? betAmount : betText };
      setCurrentBetInfo(betInfo);
      
      await setDoc(doc(db, "matches_snake", code), { 
          host: user.uid, hostName: user.name, hostScore: 0, hostStatus: 'alive', 
          guestScore: 0, guestStatus: 'alive', betInfo, createdAt: serverTimestamp() 
      });
      
      setRoomCode(code); setIsHost(true); setView('pvp_host'); startGame();
  };

  const joinRoom = async (c) => {
      if (!user) return alert("Inicia sesión para jugar online");
      const ref = doc(db, "matches_snake", c); const snap = await getDoc(ref);
      if (!snap.exists()) return alert("Sala no existe");
      
      const data = snap.data();
      if (data.betInfo?.type === 'money') { 
          if (coins < data.betInfo.value) return alert("Fondos insuficientes para esta mesa"); 
          await spendCoins(data.betInfo.value, "Apuesta Snake"); 
      }
      
      setCurrentBetInfo(data.betInfo); 
      await updateDoc(ref, { guest: user.uid, guestName: user.name });
      setRoomCode(c); setOpName(data.hostName); setIsHost(false); setView('pvp_guest'); startGame();
  };

  // FIX: Safe Unsubscribe para el modo Online
  useEffect(() => {
      if (!roomCode) return;
      const unsub = onSnapshot(doc(db, "matches_snake", roomCode), (docSnap) => {
          if (docSnap.exists()) {
              const data = docSnap.data();
              if (isHost) { setOpName(data.guestName || 'Esperando...'); setOpScore(data.guestScore || 0); setOpStatus(data.guestStatus || 'alive'); } 
              else { setOpName(data.hostName || 'Host'); setOpScore(data.hostScore || 0); setOpStatus(data.hostStatus || 'alive'); }
          }
      });
      
      return () => {
          setTimeout(() => {
              if (unsub && typeof unsub === 'function') {
                  unsub();
              }
          }, 0);
      };
  }, [roomCode, isHost]);

  const updateOnlineScore = (s, status) => { if(roomCode) updateDoc(doc(db, "matches_snake", roomCode), { [`${isHost?'host':'guest'}Score`]: s, [`${isHost?'host':'guest'}Status`]: status }); };

  // --- RENDER GRID ---
  const renderGrid = () => {
      return Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
          const x = i % GRID_SIZE; const y = Math.floor(i / GRID_SIZE);
          let className = "bg-slate-900/30"; 
          // Cabeza
          if (snake[0].x === x && snake[0].y === y) className = "bg-white shadow-[0_0_15px_white] z-20 rounded-sm";
          // Cuerpo
          else if (snake.some(s => s.x === x && s.y === y)) className = "bg-emerald-500 shadow-[0_0_5px_#10b981] opacity-90 rounded-sm";
          // Comida
          else if (food.x === x && food.y === y) className = "bg-rose-500 shadow-[0_0_15px_#f43f5e] rounded-full scale-75 animate-pulse";
          
          return <div key={i} className={`w-full h-full ${className} transition-colors duration-100`}></div>;
      });
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-2 font-mono text-white select-none overflow-hidden touch-none">
        
        <div className="fixed inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'linear-gradient(#10b981 1px, transparent 1px), linear-gradient(90deg, #10b981 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        {showAd && <ReviveOverlay onComplete={onAdSuccess} onCancel={() => { setShowAd(false); saveFinalScore(); }} />}

        {/* HEADER */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-4 z-10 mt-2 px-2">
            <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 bg-slate-900/80 rounded-full border border-slate-700 hover:border-emerald-500 transition shadow-lg"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
            <div className="text-center"><h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 tracking-tighter italic">SNAKE</h1></div>
            {view !== 'menu' && (
               <div className="bg-slate-900/80 px-4 py-1 rounded-full border border-emerald-500/30 flex gap-4">
                   <div className="text-center"><span className="text-[9px] text-slate-500 uppercase font-bold">SCORE</span><p className="text-lg font-black text-emerald-400 leading-none">{score}</p></div>
                   {view.includes('pvp') && <div className="text-center border-l border-white/10 pl-4"><span className="text-[9px] text-slate-500 uppercase font-bold">VS {opName}</span><p className={`text-lg font-black leading-none ${opStatus==='dead'?'text-red-500 line-through':'text-slate-300'}`}>{opScore}</p></div>}
               </div>
            )}
            {view === 'menu' && (
                <div className="bg-slate-900/90 px-3 py-1.5 rounded-full border border-yellow-500/30 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center shadow-md"><Coins className="w-3 h-3 text-black fill-current" /></div>
                    <span className="text-xs font-black text-yellow-400 tabular-nums">{coins.toLocaleString()}</span>
                </div>
            )}
        </div>

        {view === 'menu' ? (
            <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-4 z-10 px-2 flex-grow overflow-y-auto no-scrollbar pb-4">
                <button onClick={() => { setView('pve'); startGame(); }} className="bg-slate-900/80 p-6 rounded-3xl border border-slate-700 flex items-center gap-4 hover:border-emerald-500 transition group relative overflow-hidden shadow-2xl active:scale-95">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-bl-full -mr-8 -mt-8 transition-all group-hover:bg-emerald-500/20"></div>
                    <Play className="w-10 h-10 text-emerald-400 z-10"/>
                    <div className="text-left z-10"><h2 className="text-xl font-black text-white italic">1 JUGADOR</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Modo Clásico</p></div>
                </button>

                <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-700 relative overflow-hidden group shadow-2xl">
                    <div className="flex items-center gap-4 mb-4 z-10 relative">
                        <Users className="w-8 h-8 text-blue-400"/>
                        <div className="text-left"><h2 className="text-xl font-black text-white italic">DUELO VS</h2><p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Apuesta y Gana</p></div>
                    </div>
                    <div className="flex gap-2 z-10 relative">
                        <button onClick={() => setView('pvp_setup')} className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-xs hover:bg-blue-500 text-white shadow-lg active:scale-95 transition">CREAR</button>
                        <button onClick={() => setView('pvp_join')} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-600 text-slate-300 active:scale-95 transition">UNIRSE</button>
                    </div>
                </div>

                {/* RANKING SIEMPRE VISIBLE */}
                <div className="bg-black/40 p-4 rounded-xl border border-white/5 mt-2 backdrop-blur-sm">
                    <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex gap-1 items-center justify-center tracking-widest"><Trophy className="w-3 h-3 text-yellow-500"/> Ranking Global</h3>
                    {loadingRank ? (
                        <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 text-emerald-500 animate-spin"/></div>
                    ) : leaderboard.length > 0 ? (
                        leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-[10px] text-slate-300 border-b border-white/5 py-1.5 last:border-0"><span>#{i+1} {s.displayName}</span><span className="text-emerald-400 font-black">{s.score} PTS</span></div>))
                    ) : (
                        <p className="text-[10px] text-slate-500 text-center py-2">No hay récords. ¡Sé el primero!</p>
                    )}
                </div>
            </div>
        ) : view === 'pvp_setup' ? (
            <div className="w-full max-w-md bg-slate-900/90 border border-slate-700 p-6 rounded-3xl animate-in fade-in mt-10 shadow-2xl mx-4">
                <h2 className="text-xl font-black text-center mb-6 text-white uppercase italic tracking-widest">Configurar Apuesta</h2>
                <div className="flex gap-2 mb-6">
                    <button onClick={() => setBetType('money')} className={`flex-1 py-3 rounded-xl font-bold text-xs flex flex-col items-center gap-1 border-2 transition-all ${betType==='money' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}><Coins className="w-5 h-5"/> MONEDAS</button>
                    <button onClick={() => setBetType('text')} className={`flex-1 py-3 rounded-xl font-bold text-xs flex flex-col items-center gap-1 border-2 transition-all ${betType==='text' ? 'bg-pink-500/20 border-pink-500 text-pink-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}><MessageSquare className="w-5 h-5"/> RETO</button>
                </div>
                <div className="mb-8">
                    {betType === 'money' ? (
                        <div><div className="flex justify-between text-xs text-slate-400 mb-2 font-bold uppercase"><span>Saldo: {coins}</span> <span>Cantidad</span></div><input type="number" value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} className="w-full bg-black border-2 border-slate-700 rounded-xl p-4 text-center text-2xl font-black text-yellow-400 focus:border-yellow-500 outline-none transition-colors"/></div>
                    ) : (
                        <div><p className="text-xs text-slate-400 mb-2 font-bold uppercase">Escribe el castigo</p><textarea value={betText} onChange={(e) => setBetText(e.target.value)} placeholder="Ej: Paga la cena..." className="w-full bg-black border-2 border-slate-700 rounded-xl p-4 text-sm font-bold text-white focus:border-pink-500 outline-none h-24 resize-none transition-colors"/></div>
                    )}
                </div>
                <button onClick={handleCreateRoom} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition shadow-lg uppercase tracking-widest active:scale-95">CREAR SALA</button>
                <button onClick={() => setView('menu')} className="w-full mt-2 py-3 text-slate-500 font-bold text-xs hover:text-white uppercase tracking-widest">CANCELAR</button>
            </div>
        ) : view === 'pvp_join' ? (
            <div className="w-full max-w-md bg-slate-900 p-8 rounded-3xl border border-slate-700 animate-in fade-in mt-10 shadow-2xl mx-4">
                <h2 className="text-sm font-bold mb-4 text-center text-slate-400 uppercase tracking-widest">CÓDIGO DE SALA</h2>
                <input type="number" id="code-input" placeholder="0000" className="w-full bg-black/50 border-2 border-slate-700 rounded-2xl p-6 text-center text-5xl font-black text-white mb-6 outline-none focus:border-emerald-500 tracking-[0.2em] transition-all"/>
                <button onClick={() => joinRoom(document.getElementById('code-input').value)} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95 uppercase tracking-widest">ENTRAR</button>
                <button onClick={() => setView('menu')} className="w-full mt-2 text-center text-xs text-slate-500 font-bold uppercase tracking-widest hover:text-white py-2">VOLVER</button>
            </div>
        ) : (
            <div className="w-full max-w-md flex flex-col items-center flex-grow z-10 relative">
                
                {view.includes('pvp') && currentBetInfo && (
                    <div className="mb-2 px-4 py-1 bg-black/40 rounded-full border border-white/10 text-[10px] font-bold text-white flex items-center gap-2">
                        <Hand className="w-3 h-3 text-yellow-500"/>
                        <span className="text-slate-400 uppercase">JUGANDO POR:</span>
                        <span className={currentBetInfo.type === 'money' ? 'text-yellow-400' : 'text-pink-400'}>{currentBetInfo.type === 'money' ? `${currentBetInfo.value} Monedas` : currentBetInfo.value}</span>
                    </div>
                )}

                <div className="relative bg-slate-950 border-4 border-slate-800 rounded-xl shadow-2xl overflow-hidden" style={{ width: 'min(90vw, 350px)', height: 'min(90vw, 350px)' }}>
                    <div className="w-full h-full grid" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
                        {renderGrid()}
                    </div>

                    {gameState === 'gameover' && (
                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center z-30 backdrop-blur-md animate-in zoom-in">
                            <Skull className="w-16 h-16 text-red-500 mb-2 animate-bounce"/>
                            <h2 className="text-3xl font-black text-white italic mb-1">GAME OVER</h2>
                            <p className="text-emerald-400 font-bold text-xl mb-4">{score} PUNTOS</p>
                            
                            {!hasRevived && view === 'pve' ? (
                                <button onClick={watchReviveAd} className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl font-bold text-white text-xs flex items-center justify-center gap-2 hover:scale-105 transition mb-3 animate-pulse shadow-lg">
                                    <PlayCircle className="w-4 h-4"/> REVIVIR (VIDEO)
                                </button>
                            ) : null}
                            
                            <div className="flex gap-2 w-full">
                                <button onClick={() => { saveFinalScore(); startGame(); }} className="flex-1 py-3 bg-white text-black font-bold rounded-lg text-xs hover:scale-105 transition"><RefreshCw className="w-4 h-4 mx-auto"/></button>
                                <button onClick={() => { saveFinalScore(); setView('menu'); }} className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-lg text-xs border border-slate-600">SALIR</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* CONTROLES TÁCTILES */}
                <div className="mt-6 grid grid-cols-3 gap-2 w-48 h-32 md:hidden touch-none select-none pb-4">
                    <div></div>
                    <button onPointerDown={(e) => { e.preventDefault(); changeDirection(0, -1); }} className="w-full h-14 bg-slate-800/80 rounded-xl border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 active:bg-emerald-600 flex items-center justify-center shadow-lg transition-colors"><ChevronUp className="w-8 h-8 text-white"/></button>
                    <div></div>
                    <button onPointerDown={(e) => { e.preventDefault(); changeDirection(-1, 0); }} className="w-full h-14 bg-slate-800/80 rounded-xl border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 active:bg-emerald-600 flex items-center justify-center shadow-lg transition-colors"><ChevronLeft className="w-8 h-8 text-white"/></button>
                    <div className="flex items-center justify-center"><div className="w-3 h-3 bg-emerald-500/20 rounded-full"></div></div>
                    <button onPointerDown={(e) => { e.preventDefault(); changeDirection(1, 0); }} className="w-full h-14 bg-slate-800/80 rounded-xl border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 active:bg-emerald-600 flex items-center justify-center shadow-lg transition-colors"><ChevronRight className="w-8 h-8 text-white"/></button>
                    <div></div>
                    <button onPointerDown={(e) => { e.preventDefault(); changeDirection(0, 1); }} className="w-full h-14 bg-slate-800/80 rounded-xl border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 active:bg-emerald-600 flex items-center justify-center shadow-lg transition-colors"><ChevronDown className="w-8 h-8 text-white"/></button>
                    <div></div>
                </div>
            </div>
        )}

        <div className="mt-auto opacity-75 w-full max-w-md pt-4 relative z-10 mb-2"><AdSpace type="banner" /><GameChat gameId={roomCode || "global_snake"} gameName="SNAKE" /></div>
    </div>
  );
}