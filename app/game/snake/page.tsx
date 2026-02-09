// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Trophy, RefreshCw, Users, Cpu, Play, Skull, 
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Video, 
  Coins, MessageSquare, Hand
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth'; // Importante para detectar usuario real
import { doc, updateDoc, onSnapshot, getDoc, serverTimestamp, query, orderBy, limit, getDocs, setDoc, collection, addDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- CONFIGURACIÓN ---
const GRID_SIZE = 20;
const INITIAL_SPEED = 150;
const SPEED_INCREMENT = 2;

export default function NeonSnakePro() {
  const { addCoins } = useEconomy();
  const { playSound } = useAudio();
  
  // ESTADOS PRINCIPALES
  const [user, setUser] = useState(null);
  const [view, setView] = useState('menu'); 
  const [gameState, setGameState] = useState('menu'); // menu, playing, paused, gameover
  
  // ESTADO JUEGO VISUAL
  const [snake, setSnake] = useState([{x: 10, y: 10}]);
  const [food, setFood] = useState({x: 15, y: 5});
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  
  // ONLINE & APUESTAS
  const [roomCode, setRoomCode] = useState('');
  const [opName, setOpName] = useState('Rival');
  const [opScore, setOpScore] = useState(0);
  const [opStatus, setOpStatus] = useState('alive');
  const [isHost, setIsHost] = useState(false);
  
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [currentBetInfo, setCurrentBetInfo] = useState(null);

  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 }); 
  const [leaderboard, setLeaderboard] = useState([]);

  // --- REFS (MEMORIA TÉCNICA DEL JUEGO) ---
  // Usamos Refs para todo lo que cambia muy rápido para evitar re-renders innecesarios o bloqueos
  const snakeRef = useRef([{x: 10, y: 10}]);
  const foodRef = useRef({x: 15, y: 5}); 
  const dirRef = useRef({x: 0, y: 0});
  const nextDirRef = useRef({x: 0, y: 0}); // Buffer para evitar giros imposibles
  const scoreRef = useRef(0);
  const speedRef = useRef(INITIAL_SPEED);
  const gameStateRef = useRef('menu'); // Para acceso síncrono dentro del loop

  // --- 1. DETECCIÓN DE USUARIO Y RANKING ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
      } else {
        setUser(null);
      }
    });
    fetchLeaderboard();
    return () => unsubscribe();
  }, []);

  // --- 2. GAME LOOP (EL CORAZÓN DEL JUEGO) ---
  // Este useEffect gestiona el intervalo. Se reinicia solo si cambia el estado de juego.
  useEffect(() => {
    if (gameState !== 'playing') return;

    const tick = () => {
      moveSnake();
    };

    const intervalId = setInterval(tick, speed);
    return () => clearInterval(intervalId);
  }, [gameState, speed]); // Dependencias clave: si cambia el estado o la velocidad, el loop se actualiza.

  // --- 3. LÓGICA DE MOVIMIENTO ---
  const moveSnake = () => {
    // Sincronizar dirección
    dirRef.current = nextDirRef.current;
    
    const head = { 
        x: snakeRef.current[0].x + dirRef.current.x, 
        y: snakeRef.current[0].y + dirRef.current.y 
    };

    // CHOQUE PARED
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        handleGameOver(); return;
    }
    // CHOQUE CUERPO
    if (snakeRef.current.some(s => s.x === head.x && s.y === head.y)) {
        handleGameOver(); return;
    }

    const newSnake = [head, ...snakeRef.current];
    
    // COMER
    if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
        playSound('bit');
        const newScore = scoreRef.current + 10;
        
        // Actualizar refs y estado
        scoreRef.current = newScore;
        setScore(newScore);
        
        const newFood = randomPos();
        foodRef.current = newFood;
        setFood(newFood);
        
        // Aumentar velocidad
        const newSpeed = Math.max(50, INITIAL_SPEED - (newScore / 10 * SPEED_INCREMENT));
        setSpeed(newSpeed); // Esto reiniciará el intervalo automáticamente gracias al useEffect

        // Sync Online
        if (view.includes('pvp')) updateOnlineScore(newScore, 'alive');

    } else {
        newSnake.pop(); // Si no come, avanza (quita la cola)
    }

    // Actualizar Ref y Estado Visual
    snakeRef.current = newSnake;
    setSnake(newSnake);
  };

  // --- 4. INICIO DEL JUEGO ---
  const startGame = () => {
    playSound('start');
    const startPos = [{x: 10, y: 10}];
    const startFood = randomPos();
    
    // Reset Refs (Lógica inmediata)
    snakeRef.current = startPos;
    foodRef.current = startFood;
    dirRef.current = {x: 0, y: -1}; // Empieza moviendo arriba
    nextDirRef.current = {x: 0, y: -1};
    scoreRef.current = 0;
    speedRef.current = INITIAL_SPEED;
    gameStateRef.current = 'playing';

    // Reset Estado Visual (React)
    setSnake(startPos);
    setFood(startFood);
    setScore(0);
    setSpeed(INITIAL_SPEED);
    
    // Arrancar
    setGameState('playing');
  };

  const handleGameOver = () => {
      playSound('explosion');
      setGameState('gameover');
      gameStateRef.current = 'gameover';
      
      if (view.includes('pvp')) updateOnlineScore(scoreRef.current, 'dead');
      
      // GUARDAR PUNTUACIÓN Y MONEDAS
      if (view === 'pve') {
          saveScore(scoreRef.current);
          
          // Lógica de Monedas: 1 moneda por cada 10 puntos (1 manzana)
          const coinsEarned = Math.floor(scoreRef.current / 10);
          if (coinsEarned > 0) {
              addCoins(coinsEarned, 'Snake Record');
          }
      }
  };

  // --- UTILIDADES ---
  const randomPos = () => {
      let newPos;
      do {
          newPos = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
      } while (snakeRef.current.some(s => s.x === newPos.x && s.y === newPos.y));
      return newPos;
  };

  const changeDir = (x, y) => {
      // Evitar giro de 180 grados sobre el eje actual
      if (dirRef.current.x === -x && dirRef.current.y === -y) return;
      // Actualizamos el buffer "nextDir" para evitar cambios múltiples en el mismo tick
      nextDirRef.current = {x, y};
  };

  useEffect(() => {
      const handleKey = (e) => {
          if (gameState !== 'playing') return;
          if (e.key === 'ArrowUp') changeDir(0, -1);
          if (e.key === 'ArrowDown') changeDir(0, 1);
          if (e.key === 'ArrowLeft') changeDir(-1, 0);
          if (e.key === 'ArrowRight') changeDir(1, 0);
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [gameState]);

  // --- ONLINE ---
  useEffect(() => {
    if ((view === 'pvp_host' || view === 'pvp_guest') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_snake", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.betInfo) setCurrentBetInfo(data.betInfo);
                if (isHost) {
                    setOpName(data.guestName || 'Esperando...');
                    setOpScore(data.guestScore || 0);
                    setOpStatus(data.guestStatus || 'alive');
                } else {
                    setOpName(data.hostName || 'Host');
                    setOpScore(data.hostScore || 0);
                    setOpStatus(data.hostStatus || 'alive');
                }
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode, isHost]);

  const updateOnlineScore = async (s, status) => {
      if (!roomCode) return;
      const fieldScore = isHost ? 'hostScore' : 'guestScore';
      const fieldStatus = isHost ? 'hostStatus' : 'guestStatus';
      try {
          await updateDoc(doc(db, "matches_snake", roomCode), { [fieldScore]: s, [fieldStatus]: status });
      } catch (e) {}
  };

  // --- GESTIÓN DE SALAS Y APUESTAS ---
  const handleCreateRoom = async () => {
      if (!user) return alert("Inicia sesión para jugar.");
      
      // COBRAR APUESTA AL HOST
      if (betType === 'money') {
          if (betAmount <= 0) return alert("Apuesta válida requerida.");
          if (coins < betAmount) return alert("No tienes suficientes monedas.");
          const paid = await spendCoins(betAmount, "Apuesta Snake (Crear)");
          if (!paid) return;
      }

      const betInfo = { type: betType, value: betType === 'money' ? betAmount : betText || 'Honor' };
      setCurrentBetInfo(betInfo);

      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_snake", code), {
          host: user?.uid, hostName: user?.name, hostScore: 0, hostStatus: 'alive',
          guestScore: 0, guestStatus: 'alive', betInfo: betInfo, createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); setView('pvp_host'); startGame();
  };

  const joinRoom = async (c) => {
      if (!user) return alert("Inicia sesión primero.");
      const ref = doc(db, "matches_snake", c);
      const s = await getDoc(ref);
      
      if (!s.exists()) return alert("Sala no encontrada");
      
      // VALIDAR Y COBRAR APUESTA AL GUEST
      const data = s.data();
      if (data.betInfo && data.betInfo.type === 'money') {
          if (coins < data.betInfo.value) return alert(`Necesitas ${data.betInfo.value} monedas.`);
          const paid = await spendCoins(data.betInfo.value, "Apuesta Snake (Unirse)");
          if (!paid) return;
      }

      setCurrentBetInfo(data.betInfo);
      await updateDoc(ref, { guest: user?.uid, guestName: user?.name });
      setRoomCode(c); setOpName(data.hostName); setIsHost(false); setView('pvp_guest'); startGame();
  };

  // --- DB & RANKING ---
  const saveScore = async (s) => {
    if (user && s > 0) { 
        try { 
            await addDoc(collection(db, "scores_snake"), { 
                uid: user.uid, displayName: user.name, score: s, date: serverTimestamp() 
            }); 
            fetchLeaderboard(); 
        } catch (e) {
            console.error("Error guardando score:", e); // Mira la consola si falla
        }
    }
  };

  const fetchLeaderboard = async () => { 
      try { 
          const q = query(collection(db, "scores_snake"), orderBy("score", "desc"), limit(5)); 
          const s = await getDocs(q); 
          setLeaderboard(s.docs.map(d => d.data())); 
      } catch (e) { console.error("Error ranking:", e); } 
  };

  // --- ADS / REVIVIR ---
  const watchAd = () => { setAdState({ active: true, type: 'revive', timer: 5 }); };
  useEffect(() => {
    let interval = null;
    if (adState.active && adState.timer > 0) interval = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active && adState.timer === 0) { clearInterval(interval); finishAd(); }
    return () => clearInterval(interval);
  }, [adState.active, adState.timer]);

  const finishAd = () => {
      setAdState({ active: false, type: null, timer: 5 });
      // Revivir: quitar 3 trozos de cola y seguir
      const revivedSnake = snakeRef.current.slice(0, Math.max(1, snakeRef.current.length - 3));
      snakeRef.current = revivedSnake;
      setSnake(revivedSnake);
      setGameState('playing'); // Reactiva el loop automáticamente
  };

  // --- RENDER ---
  const renderGrid = () => {
    // Optimizamos renderizado creando solo un array visual
    const cells = [];
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        const x = i % GRID_SIZE;
        const y = Math.floor(i / GRID_SIZE);
        
        // Comprobar estado visual
        const isHead = snake[0].x === x && snake[0].y === y;
        const isBody = !isHead && snake.some(s => s.x === x && s.y === y);
        const isFood = food.x === x && food.y === y;
        
        let styleClass = 'bg-slate-900/30';
        if (isHead) styleClass = 'bg-white shadow-[0_0_15px_white] z-20 rounded-sm';
        else if (isBody) styleClass = 'bg-green-500 shadow-[0_0_5px_#22c55e] opacity-80 rounded-sm z-10';
        else if (isFood) styleClass = 'bg-purple-500 shadow-[0_0_15px_#a855f7] animate-pulse rounded-full scale-75 z-10';

        cells.push(<div key={i} className={`w-full h-full ${styleClass}`}></div>);
    }
    return cells;
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-2 font-mono text-white overflow-hidden touch-none select-none relative">
      
      <div className="fixed inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'linear-gradient(#22c55e 1px, transparent 1px), linear-gradient(90deg, #22c55e 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

      {adState.active && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-6 animate-in fade-in">
           <Video className="w-16 h-16 text-green-400 mb-4 animate-bounce" />
           <h2 className="text-2xl font-black mb-2 uppercase tracking-widest text-green-500">Reviviendo...</h2>
           <div className="text-4xl font-black text-white mb-6 animate-pulse">{adState.timer}s</div>
        </div>
      )}

      <div className="w-full max-w-md flex justify-between items-center mb-4 z-10 mt-4">
        <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 bg-slate-900/80 rounded-full border border-slate-700 hover:border-green-500 transition shadow-lg backdrop-blur-sm"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
        {view !== 'menu' && (
           <div className="flex gap-4 bg-slate-900/80 px-4 py-2 rounded-full border border-slate-700 backdrop-blur-sm shadow-lg">
               <div className="text-center">
                   <p className="text-[8px] text-slate-500 font-bold uppercase">Score</p>
                   <p className="text-xl font-black text-green-400 leading-none">{score}</p>
               </div>
               {view.includes('pvp') && (
                   <div className="text-center pl-4 border-l border-slate-700">
                       <p className="text-[8px] text-slate-500 font-bold uppercase">VS {opName}</p>
                       <p className={`text-xl font-black leading-none ${opStatus === 'dead' ? 'text-red-500 line-through' : 'text-slate-200'}`}>{opScore}</p>
                   </div>
               )}
           </div>
        )}
      </div>

      {/* MENÚ PRINCIPAL */}
      {view === 'menu' ? (
          <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-6 z-10">
              <div className="text-center mb-6">
                  <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 italic tracking-tighter drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]">JUEGO DE LA SERPIENTE</h1>
                  <p className="text-xs text-green-500/80 tracking-[0.4em] mt-1 uppercase font-bold">COMO EN TU NOKIA</p>
              </div>

              <button onClick={() => { setView('pve'); startGame(); }} className="bg-slate-900/80 backdrop-blur-sm p-6 rounded-3xl border border-slate-700 flex items-center gap-4 hover:border-green-500 transition group relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-bl-full -mr-8 -mt-8 transition-all group-hover:bg-green-500/20"></div>
                  <div className="p-4 bg-slate-950 rounded-2xl group-hover:bg-green-900/20 transition border border-slate-800"><Cpu className="w-8 h-8 text-green-400"/></div>
                  <div className="text-left z-10">
                      <h2 className="text-xl font-black text-white italic">1 JUGADOR</h2>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Ganar Monedas</p>
                  </div>
              </button>

              <div className="bg-slate-900/80 backdrop-blur-sm p-6 rounded-3xl border border-slate-700 relative overflow-hidden group shadow-2xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-bl-full -mr-8 -mt-8 transition-all group-hover:bg-blue-500/20"></div>
                  <div className="flex items-center gap-4 mb-4 z-10 relative">
                      <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800"><Users className="w-8 h-8 text-blue-400"/></div>
                      <div className="text-left">
                          <h2 className="text-xl font-black text-white italic">DUELO VS</h2>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">¡Apuesta algo!</p>
                      </div>
                  </div>
                  <div className="flex gap-2 z-10 relative">
                      <button onClick={() => setView('pvp_setup')} className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-xs hover:bg-blue-500 shadow-lg text-white">CREAR</button>
                      <button onClick={() => setView('pvp_join')} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-600 text-slate-300">UNIRSE</button>
                  </div>
              </div>

              {leaderboard.length > 0 && (
                <div className="bg-black/40 p-4 rounded-xl border border-white/5 mt-4 backdrop-blur-sm">
                    <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex gap-1 items-center"><Trophy className="w-3 h-3 text-yellow-500"/> Top Legends</h3>
                    {leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-[10px] text-slate-300 border-b border-white/5 py-1.5"><span>#{i+1} {s.displayName}</span><span className="text-green-400 font-black">{s.score}</span></div>))}
                </div>
               )}
          </div>
      ) : view === 'pvp_setup' ? (
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-700 p-6 rounded-3xl animate-in fade-in mt-10">
              <h2 className="text-xl font-black text-center mb-6 text-white uppercase italic">¿QUÉ NOS APOSTAMOS?</h2>
              
              <div className="flex gap-2 mb-6">
                  <button onClick={() => setBetType('money')} className={`flex-1 py-3 rounded-xl font-bold text-xs flex flex-col items-center gap-1 border-2 ${betType==='money' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                      <Coins className="w-5 h-5"/> MONEDAS
                  </button>
                  <button onClick={() => setBetType('text')} className={`flex-1 py-3 rounded-xl font-bold text-xs flex flex-col items-center gap-1 border-2 ${betType==='text' ? 'bg-pink-500/20 border-pink-500 text-pink-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                      <MessageSquare className="w-5 h-5"/> RETO
                  </button>
              </div>

              <div className="mb-8">
                  {betType === 'money' ? (
                      <div>
                          <div className="flex justify-between text-xs text-slate-400 mb-2 font-bold uppercase"><span>Saldo: {coins}</span> <span>Cantidad</span></div>
                          <input type="number" value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} className="w-full bg-black border-2 border-slate-700 rounded-xl p-4 text-center text-2xl font-black text-yellow-400 focus:border-yellow-500 outline-none"/>
                      </div>
                  ) : (
                      <div>
                          <p className="text-xs text-slate-400 mb-2 font-bold uppercase">Escribe el castigo/premio</p>
                          <textarea value={betText} onChange={(e) => setBetText(e.target.value)} placeholder="Ej: Quien pierda invita a cenar..." className="w-full bg-black border-2 border-slate-700 rounded-xl p-4 text-sm font-bold text-white focus:border-pink-500 outline-none h-24 resize-none"/>
                      </div>
                  )}
              </div>

              <button onClick={handleCreateRoom} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition shadow-lg uppercase tracking-widest">CREAR SALA Y JUGAR</button>
              <button onClick={() => setView('menu')} className="w-full mt-2 py-3 text-slate-500 font-bold text-xs hover:text-white">CANCELAR</button>
          </div>
      ) : view === 'pvp_join' ? (
          <div className="w-full max-w-md bg-slate-900 p-8 rounded-3xl border border-slate-700 animate-in fade-in mt-10 shadow-2xl">
              <h2 className="text-sm font-bold mb-4 text-center text-slate-400 uppercase tracking-widest">CÓDIGO DE SALA</h2>
              <input type="number" id="code-input" placeholder="0000" className="w-full bg-black/50 border-2 border-slate-700 rounded-2xl p-6 text-center text-5xl font-black text-white mb-6 outline-none focus:border-green-500 tracking-[0.2em] transition-all"/>
              <button onClick={() => joinRoom(document.getElementById('code-input').value)} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition shadow-[0_0_20px_rgba(255,255,255,0.3)]">ENTRAR</button>
              <button onClick={() => setView('menu')} className="w-full mt-2 text-center text-xs text-slate-500 font-bold">VOLVER</button>
          </div>
      ) : (
          <div className="w-full max-w-md flex flex-col items-center flex-grow z-10">
              
              {view.includes('pvp') && currentBetInfo && (
                  <div className="mb-2 px-4 py-1 bg-black/40 rounded-full border border-white/10 text-[10px] font-bold text-white flex items-center gap-2 animate-in slide-in-from-top">
                      <Hand className="w-3 h-3 text-yellow-500"/>
                      <span className="text-slate-400 uppercase">APUESTA:</span>
                      <span className={currentBetInfo.type === 'money' ? 'text-yellow-400' : 'text-pink-400'}>
                          {currentBetInfo.type === 'money' ? `${currentBetInfo.value} Monedas` : currentBetInfo.value}
                      </span>
                  </div>
              )}

              <div className="relative bg-slate-950 border-4 border-slate-800 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden" style={{ width: 'min(90vw, 350px)', height: 'min(90vw, 350px)' }}>
                  <div className="w-full h-full grid gap-[1px] bg-slate-900/20" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>{renderGrid()}</div>

                  {gameState === 'gameover' && (
                      <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center z-30 backdrop-blur-md animate-in zoom-in duration-200">
                          <Skull className="w-20 h-20 text-red-500 mb-4 animate-bounce drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]"/>
                          <h2 className="text-4xl font-black text-white mb-1 italic">GAME OVER</h2>
                          
                          {view === 'pve' && (
                              <div className="mb-6">
                                  <p className="text-3xl font-black text-green-400">{score}</p>
                                  <div className="mt-2 inline-flex items-center gap-2 bg-yellow-500/20 px-3 py-1 rounded-full border border-yellow-500/50">
                                      <Coins className="w-3 h-3 text-yellow-400"/>
                                      <span className="text-yellow-400 text-xs font-bold">+{Math.floor(score/10)} Monedas</span>
                                  </div>
                              </div>
                          )}
                          
                          {view === 'pve' && (
                              <button onClick={watchAd} className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-bold text-white text-xs flex items-center justify-center gap-2 hover:scale-105 transition mb-3 animate-pulse shadow-lg shadow-green-500/20">
                                  <Play className="w-4 h-4 fill-current"/> REVIVIR (VER VIDEO)
                              </button>
                          )}
                          <button onClick={() => setView('menu')} className="w-full py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-600 flex items-center justify-center gap-2 text-slate-300"><RefreshCw className="w-4 h-4"/> SALIR AL MENÚ</button>
                      </div>
                  )}
                  
                  {view.includes('pvp') && <div className="absolute top-2 left-2 bg-black/60 px-3 py-1 rounded-full text-[10px] font-bold text-white backdrop-blur-md border border-white/10 z-20 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> SALA: {roomCode}</div>}
              </div>

              {/* CONTROLES TÁCTILES */}
              <div className="mt-8 w-full max-w-[280px] grid grid-cols-3 gap-3">
                  <div className="col-start-2"><button onPointerDown={(e) => { e.preventDefault(); changeDir(0, -1); }} className="w-full h-16 bg-slate-800/90 rounded-2xl flex items-center justify-center active:bg-green-600 transition shadow-lg border-b-4 border-slate-950 active:border-b-0 active:translate-y-1"><ChevronUp className="w-8 h-8 text-slate-300"/></button></div>
                  <div className="col-start-1 row-start-2"><button onPointerDown={(e) => { e.preventDefault(); changeDir(-1, 0); }} className="w-full h-16 bg-slate-800/90 rounded-2xl flex items-center justify-center active:bg-green-600 transition shadow-lg border-b-4 border-slate-950 active:border-b-0 active:translate-y-1"><ChevronLeft className="w-8 h-8 text-slate-300"/></button></div>
                  <div className="col-start-2 row-start-2"><button onPointerDown={(e) => { e.preventDefault(); changeDir(0, 1); }} className="w-full h-16 bg-slate-800/90 rounded-2xl flex items-center justify-center active:bg-green-600 transition shadow-lg border-b-4 border-slate-950 active:border-b-0 active:translate-y-1"><ChevronDown className="w-8 h-8 text-slate-300"/></button></div>
                  <div className="col-start-3 row-start-2"><button onPointerDown={(e) => { e.preventDefault(); changeDir(1, 0); }} className="w-full h-16 bg-slate-800/90 rounded-2xl flex items-center justify-center active:bg-green-600 transition shadow-lg border-b-4 border-slate-950 active:border-b-0 active:translate-y-1"><ChevronRight className="w-8 h-8 text-slate-300"/></button></div>
              </div>
          </div>
      )}

      <div className="mt-auto w-full max-w-md pt-4 opacity-75 pointer-events-none"><AdSpace type="banner" /><GameChat gameId={view.includes('pvp') ? roomCode : "global_snake"} gameName="SNAKE" /></div>
    </div>
  );
}