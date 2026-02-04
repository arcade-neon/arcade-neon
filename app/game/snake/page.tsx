// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, RefreshCw, Users, Cpu, Play, Skull, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Video } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, getDoc, serverTimestamp, query, orderBy, limit, getDocs, setDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- CONFIGURACIÓN ---
const GRID_SIZE = 20;
const INITIAL_SPEED = 150;
const SPEED_INCREMENT = 2;

export default function NeonSnakePro() {
  const [view, setView] = useState('menu'); // menu, pve, pvp_menu, pvp_host, pvp_guest
  const [user, setUser] = useState(null);
  
  // ESTADO JUEGO VISUAL
  const [snake, setSnake] = useState([{x: 10, y: 10}]);
  const [food, setFood] = useState({x: 15, y: 5});
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  
  // ESTADO ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [opName, setOpName] = useState('Rival');
  const [opScore, setOpScore] = useState(0);
  const [opStatus, setOpStatus] = useState('alive');
  const [isHost, setIsHost] = useState(false);
  
  // MONETIZACIÓN & LOGROS
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 }); 
  const [leaderboard, setLeaderboard] = useState([]);

  // REFERENCIAS LÓGICAS (El cerebro del juego)
  // Usamos Refs para que el intervalo siempre lea el valor más reciente
  const snakeRef = useRef(snake);
  const foodRef = useRef(food); // <--- ESTO ARREGLA EL BUG
  const dirRef = useRef({x: 0, y: 0});
  const scoreRef = useRef(0);
  const gameInterval = useRef(null);

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // Sincronizar Refs con Estado Visual
  useEffect(() => { foodRef.current = food; }, [food]);

  // --- SINCRONIZACIÓN ONLINE ---
  useEffect(() => {
    if ((view === 'pvp_host' || view === 'pvp_guest') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_snake", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
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

  // --- GAME LOOP ---
  const startGame = () => {
    const startPos = [{x: 10, y: 10}];
    const startFood = randomPos();
    
    // Reset Visual
    setSnake(startPos);
    setFood(startFood);
    setScore(0);
    setSpeed(INITIAL_SPEED);
    setGameOver(false);
    
    // Reset Lógico (Refs)
    snakeRef.current = startPos;
    foodRef.current = startFood;
    dirRef.current = {x: 0, y: -1}; // Empieza moviendo arriba para que no esté quieto
    scoreRef.current = 0;
    
    if (gameInterval.current) clearInterval(gameInterval.current);
    gameInterval.current = setInterval(moveSnake, INITIAL_SPEED);
  };

  const moveSnake = () => {
    if (adState.active || gameOver) return;

    const head = { x: snakeRef.current[0].x + dirRef.current.x, y: snakeRef.current[0].y + dirRef.current.y };

    // CHOQUE PARED
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        handleGameOver();
        return;
    }

    // CHOQUE CUERPO
    if (snakeRef.current.some(s => s.x === head.x && s.y === head.y)) {
        handleGameOver();
        return;
    }

    const newSnake = [head, ...snakeRef.current];
    
    // COMER (Usamos foodRef.current para asegurar la posición real)
    if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
        // ACTUALIZAR PUNTOS
        const newScore = scoreRef.current + 10;
        setScore(newScore);
        scoreRef.current = newScore;
        
        // NUEVA COMIDA
        const newFood = randomPos();
        setFood(newFood);
        foodRef.current = newFood; // Actualizar ref inmediatamente
        
        // AUMENTAR VELOCIDAD
        // Nota: Reiniciamos el intervalo para aplicar la nueva velocidad
        clearInterval(gameInterval.current);
        const newSpeed = Math.max(50, INITIAL_SPEED - (newScore / 10 * SPEED_INCREMENT));
        setSpeed(newSpeed);
        gameInterval.current = setInterval(moveSnake, newSpeed);

        // SYNC ONLINE
        if (view.includes('pvp')) updateOnlineScore(newScore, 'alive');

    } else {
        // Si no come, quitamos la cola para que se mueva
        newSnake.pop();
    }

    setSnake(newSnake);
    snakeRef.current = newSnake;
  };

  const updateOnlineScore = async (s, status) => {
      if (!roomCode) return;
      const fieldScore = isHost ? 'hostScore' : 'guestScore';
      const fieldStatus = isHost ? 'hostStatus' : 'guestStatus';
      try {
          await updateDoc(doc(db, "matches_snake", roomCode), {
              [fieldScore]: s,
              [fieldStatus]: status
          });
      } catch (e) {}
  };

  const handleGameOver = () => {
      clearInterval(gameInterval.current);
      setGameOver(true);
      if (view.includes('pvp')) updateOnlineScore(scoreRef.current, 'dead');
      if (view === 'pve') saveScore(scoreRef.current);
  };

  const randomPos = () => {
      return {
          x: Math.floor(Math.random() * GRID_SIZE),
          y: Math.floor(Math.random() * GRID_SIZE)
      };
  };

  // --- CONTROLES ---
  const changeDir = (x, y) => {
      // Evitar giro de 180 grados sobre sí mismo
      if (dirRef.current.x === -x && dirRef.current.y === -y) return;
      // Actualizar ref inmediatamente para el siguiente tick
      dirRef.current = {x, y};
  };

  useEffect(() => {
      const handleKey = (e) => {
          if (view === 'menu' || gameOver) return;
          if (e.key === 'ArrowUp') changeDir(0, -1);
          if (e.key === 'ArrowDown') changeDir(0, 1);
          if (e.key === 'ArrowLeft') changeDir(-1, 0);
          if (e.key === 'ArrowRight') changeDir(1, 0);
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [view, gameOver]);

  // --- SALAS ---
  const createRoom = async () => {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_snake", code), {
          host: user?.uid, hostName: user?.name, hostScore: 0, hostStatus: 'alive',
          guestScore: 0, guestStatus: 'alive', createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); setView('pvp_host'); startGame();
  };

  const joinRoom = async (c) => {
      const ref = doc(db, "matches_snake", c);
      const s = await getDoc(ref);
      if (!s.exists()) return alert("Sala no encontrada");
      await updateDoc(ref, { guest: user?.uid, guestName: user?.name });
      setRoomCode(c); setOpName(s.data().hostName); setIsHost(false); setView('pvp_guest'); startGame();
  };

  // --- ADS ---
  const watchAd = () => { setAdState({ active: true, type: 'revive', timer: 5 }); };
  useEffect(() => {
    let interval = null;
    if (adState.active && adState.timer > 0) interval = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active && adState.timer === 0) { clearInterval(interval); finishAd(); }
    return () => clearInterval(interval);
  }, [adState.active, adState.timer]);

  const finishAd = () => {
      setAdState({ active: false, type: null, timer: 5 });
      setGameOver(false);
      // Revivir con menos cola para facilitar
      const revivedSnake = snakeRef.current.slice(0, Math.max(1, snakeRef.current.length - 3));
      setSnake(revivedSnake);
      snakeRef.current = revivedSnake;
      
      gameInterval.current = setInterval(moveSnake, speed);
      if (view.includes('pvp')) updateOnlineScore(scoreRef.current, 'alive');
  };

  // --- DB ---
  const saveScore = async (s) => {
    if (user && s > 0) { try { await addDoc(collection(db, "scores_snake"), { uid: user.uid, displayName: user.name, score: s, date: serverTimestamp() }); fetchLeaderboard(); } catch (e) {} }
  };
  const fetchLeaderboard = async () => { try { const q = query(collection(db, "scores_snake"), orderBy("score", "desc"), limit(5)); const s = await getDocs(q); setLeaderboard(s.docs.map(d => d.data())); } catch (e) {} };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-2 font-mono text-white overflow-hidden touch-none select-none relative">
      
      {/* AD MODAL */}
      {adState.active && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-6">
           <Video className="w-16 h-16 text-green-400 mb-4 animate-bounce" />
           <h2 className="text-2xl font-black mb-2">REVIVIENDO</h2>
           <div className="text-4xl font-black text-white mb-6">{adState.timer}s</div>
        </div>
      )}

      {/* HEADER */}
      <div className="w-full max-w-md flex justify-between items-center mb-4 z-10">
        <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:bg-slate-800 transition"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
        {view !== 'menu' && (
           <div className="flex gap-4">
               <div className="text-center">
                   <p className="text-[10px] text-slate-500 font-bold">SCORE</p>
                   <p className="text-xl font-black text-green-400 leading-none">{score}</p>
               </div>
               {view.includes('pvp') && (
                   <div className="text-center">
                       <p className="text-[10px] text-slate-500 font-bold">VS {opName}</p>
                       <p className={`text-xl font-black leading-none ${opStatus === 'dead' ? 'text-red-500 line-through' : 'text-slate-200'}`}>{opScore}</p>
                   </div>
               )}
           </div>
        )}
      </div>

      {view === 'menu' ? (
          <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-6">
              <div className="text-center mb-6">
                  <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 italic tracking-tighter">NEON SNAKE</h1>
                  <p className="text-xs text-slate-500 tracking-widest mt-2">SURVIVE THE GRID</p>
              </div>

              {/* 1 JUGADOR */}
              <button onClick={() => { setView('pve'); startGame(); }} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex items-center gap-4 hover:border-green-500/50 transition group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-bl-full -mr-6 -mt-6 transition-all group-hover:bg-green-500/20"></div>
                  <div className="p-4 bg-slate-950 rounded-xl group-hover:bg-green-900/20 transition"><Cpu className="w-8 h-8 text-green-400"/></div>
                  <div className="text-left z-10">
                      <h2 className="text-xl font-black text-white">1 JUGADOR</h2>
                      <p className="text-xs text-slate-400">Batir récord mundial.</p>
                  </div>
              </button>

              {/* 2 JUGADORES */}
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-bl-full -mr-6 -mt-6 transition-all group-hover:bg-blue-500/20"></div>
                  <div className="flex items-center gap-4 mb-4 z-10 relative">
                      <div className="p-4 bg-slate-950 rounded-xl"><Users className="w-8 h-8 text-blue-400"/></div>
                      <div className="text-left">
                          <h2 className="text-xl font-black text-white">DUELO ONLINE</h2>
                          <p className="text-xs text-slate-400">Crea una sala y reta.</p>
                      </div>
                  </div>
                  <div className="flex gap-2 z-10 relative">
                      <button onClick={createRoom} className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-xs hover:bg-blue-500 shadow-lg">CREAR SALA</button>
                      <button onClick={() => setView('pvp_menu')} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-700">UNIRSE</button>
                  </div>
              </div>

              {leaderboard.length > 0 && (
                <div className="bg-black/20 p-4 rounded-xl border border-white/5 mt-4">
                    <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex gap-1"><Trophy className="w-3 h-3"/> TOP CAZADORES</h3>
                    {leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-[10px] text-slate-400 border-b border-white/5 py-1"><span>#{i+1} {s.displayName}</span><span className="text-green-500">{s.score}</span></div>))}
                </div>
               )}
          </div>
      ) : view === 'pvp_menu' ? (
          <div className="w-full max-w-md bg-slate-900 p-6 rounded-2xl border border-slate-700 animate-in fade-in mt-20">
              <h2 className="text-lg font-bold mb-4">CÓDIGO DE SALA</h2>
              <input type="number" id="code-input" placeholder="0000" className="w-full bg-black border border-slate-700 rounded-xl p-4 text-center text-4xl font-black text-white mb-4 outline-none focus:border-green-500 tracking-[1em]"/>
              <button onClick={() => joinRoom(document.getElementById('code-input').value)} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition">ENTRAR</button>
          </div>
      ) : (
          <div className="w-full max-w-md flex flex-col items-center flex-grow">
              
              {/* TABLERO */}
              <div className="relative bg-slate-900 border-2 border-slate-800 rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.5)] overflow-hidden" 
                   style={{ width: 'min(90vw, 350px)', height: 'min(90vw, 350px)' }}>
                  
                  {/* FONDO REJILLA */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:17.5px_17.5px]"></div>

                  {/* GRID DE JUEGO */}
                  <div className="w-full h-full grid relative z-10" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
                      {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                          const x = i % GRID_SIZE;
                          const y = Math.floor(i / GRID_SIZE);
                          
                          // Lógica visual: Chequear si esta celda es serpiente o comida
                          const isSnake = snake.some(s => s.x === x && s.y === y);
                          const isHead = snake[0].x === x && snake[0].y === y;
                          const isFood = food.x === x && food.y === y;
                          
                          return (
                              <div key={i} className={`
                                  ${isHead ? 'bg-white shadow-[0_0_10px_white] z-10 rounded-sm' : ''}
                                  ${isSnake && !isHead ? 'bg-green-500 shadow-[0_0_5px_#22c55e] opacity-80 rounded-sm' : ''}
                                  ${isFood ? 'bg-purple-500 shadow-[0_0_10px_#a855f7] animate-pulse rounded-full scale-75' : ''}
                                  ${!isSnake && !isFood ? 'bg-transparent' : ''}
                              `}></div>
                          );
                      })}
                  </div>

                  {/* GAME OVER OVERLAY */}
                  {gameOver && (
                      <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center z-20 backdrop-blur-sm">
                          <Skull className="w-16 h-16 text-red-500 mb-2 animate-bounce"/>
                          <h2 className="text-3xl font-black text-white mb-2">GAME OVER</h2>
                          <p className="text-slate-400 mb-6">PUNTOS: <span className="text-green-400">{score}</span></p>
                          
                          {view === 'pve' && (
                              <button onClick={watchAd} className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-bold text-white text-xs flex items-center justify-center gap-2 hover:scale-105 transition mb-3 animate-pulse">
                                  <Play className="w-4 h-4 fill-current"/> REVIVIR (VER VIDEO)
                              </button>
                          )}
                          
                          <button onClick={() => setView('menu')} className="w-full py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-2">
                              <RefreshCw className="w-4 h-4"/> SALIR AL MENÚ
                          </button>
                      </div>
                  )}
                  
                  {/* ROOM INFO */}
                  {view.includes('pvp') && (
                      <div className="absolute top-2 left-2 bg-black/50 px-2 py-1 rounded text-[8px] text-white backdrop-blur-md border border-white/10 z-20">
                          SALA: {roomCode}
                      </div>
                  )}
              </div>

              {/* CONTROLES TÁCTILES */}
              <div className="mt-6 w-full max-w-[250px] grid grid-cols-3 grid-rows-2 gap-2 h-32">
                  <div></div>
                  <button onPointerDown={(e) => { e.preventDefault(); changeDir(0, -1); }} className="bg-slate-800/80 rounded-xl flex items-center justify-center active:bg-green-600 transition shadow-lg border-b-4 border-slate-900 active:border-b-0 active:translate-y-1"><ChevronUp className="w-8 h-8"/></button>
                  <div></div>
                  
                  <button onPointerDown={(e) => { e.preventDefault(); changeDir(-1, 0); }} className="bg-slate-800/80 rounded-xl flex items-center justify-center active:bg-green-600 transition shadow-lg border-b-4 border-slate-900 active:border-b-0 active:translate-y-1"><ChevronLeft className="w-8 h-8"/></button>
                  <button onPointerDown={(e) => { e.preventDefault(); changeDir(0, 1); }} className="bg-slate-800/80 rounded-xl flex items-center justify-center active:bg-green-600 transition shadow-lg border-b-4 border-slate-900 active:border-b-0 active:translate-y-1"><ChevronDown className="w-8 h-8"/></button>
                  <button onPointerDown={(e) => { e.preventDefault(); changeDir(1, 0); }} className="bg-slate-800/80 rounded-xl flex items-center justify-center active:bg-green-600 transition shadow-lg border-b-4 border-slate-900 active:border-b-0 active:translate-y-1"><ChevronRight className="w-8 h-8"/></button>
              </div>

          </div>
      )}

      <div className="mt-auto w-full max-w-md pt-4 opacity-75"><AdSpace type="banner" /><GameChat gameId={view.includes('pvp') ? roomCode : "global_snake"} gameName="SNAKE" /></div>
    </div>
  );
}