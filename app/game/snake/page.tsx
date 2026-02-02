// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Trophy, Share2, Globe, Zap, Play, Loader2, Copy, AlertCircle, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Swords } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, onSnapshot, doc, setDoc, updateDoc, where } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- CONFIGURACIÓN ---
const GRID_SIZE = 20;
const INITIAL_SPEED = 150;
const MIN_SPEED = 60; // Máxima velocidad

const generateGameId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export default function NeonSnake() {
  // Estados Generales
  const [mode, setMode] = useState('menu'); // menu, lobby, playing_solo, playing_online
  const [user, setUser] = useState(null);
  
  // Juego
  const [snake, setSnake] = useState([{ x: 10, y: 10 }]);
  const [food, setFood] = useState({ x: 15, y: 5 });
  const [direction, setDirection] = useState({ x: 0, y: 0 }); // Quieto al principio
  const [nextDirection, setNextDirection] = useState({ x: 0, y: 0 }); // Buffer para evitar giros de 180 rapidos
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [speed, setSpeed] = useState(INITIAL_SPEED);
  const [gameState, setGameState] = useState('idle'); // idle, playing, over
  const [leaderboard, setLeaderboard] = useState([]);
  const [saveStatus, setSaveStatus] = useState('idle');

  // Online
  const [gameId, setGameId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [onlineData, setOnlineData] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [opponentScore, setOpponentScore] = useState(0);
  const [matchResult, setMatchResult] = useState(null); // win, lose, draw

  // Refs para loop de juego
  const gameLoopRef = useRef();

  // 1. Auth & Leaderboard
  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // 2. Control de Teclado
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'playing') return;
      switch (e.key) {
        case 'ArrowUp': if (direction.y === 0) setNextDirection({ x: 0, y: -1 }); break;
        case 'ArrowDown': if (direction.y === 0) setNextDirection({ x: 0, y: 1 }); break;
        case 'ArrowLeft': if (direction.x === 0) setNextDirection({ x: -1, y: 0 }); break;
        case 'ArrowRight': if (direction.x === 0) setNextDirection({ x: 1, y: 0 }); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [direction, gameState]);

  // 3. Game Loop
  useEffect(() => {
    if (gameState === 'playing') {
      gameLoopRef.current = setInterval(moveSnake, speed);
    } else {
      clearInterval(gameLoopRef.current);
    }
    return () => clearInterval(gameLoopRef.current);
  }, [gameState, snake, nextDirection, speed]);

  // 4. Listener Online
  useEffect(() => {
    if (mode !== 'playing_online' && mode !== 'lobby') return;
    if (!gameId) return;

    const unsubscribe = onSnapshot(doc(db, "matches_snake", gameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOnlineData(data);
        handleOnlineUpdate(data);
      }
    });
    return () => unsubscribe();
  }, [gameId, mode]);


  // --- MOTOR DEL JUEGO ---
  const moveSnake = () => {
    setDirection(nextDirection);
    const head = { x: snake[0].x + nextDirection.x, y: snake[0].y + nextDirection.y };

    // Si está quieto (inicio), no hacer nada
    if (nextDirection.x === 0 && nextDirection.y === 0) return;

    // Colisiones
    if (
      head.x < 0 || head.x >= GRID_SIZE || 
      head.y < 0 || head.y >= GRID_SIZE ||
      snake.some(segment => segment.x === head.x && segment.y === head.y)
    ) {
      gameOver();
      return;
    }

    const newSnake = [head, ...snake];

    // Comer
    if (head.x === food.x && head.y === food.y) {
      setScore(s => {
         const newScore = s + 10;
         if (mode === 'playing_online') updateOnlineScore(newScore); // Sync online
         return newScore;
      });
      setSpeed(s => Math.max(MIN_SPEED, s * 0.98)); // Aumentar velocidad
      spawnFood(newSnake);
    } else {
      newSnake.pop(); // Quitar cola si no come
    }

    setSnake(newSnake);
  };

  const spawnFood = (currentSnake) => {
    let newFood;
    while (true) {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE)
      };
      // Verificar que no aparezca dentro de la serpiente
      const collision = currentSnake.some(s => s.x === newFood.x && s.y === newFood.y);
      if (!collision) break;
    }
    setFood(newFood);
  };

  const gameOver = async () => {
    setGameState('over');
    if (mode === 'playing_solo') {
      if (score > highScore) setHighScore(score);
      saveScore();
    } else if (mode === 'playing_online') {
      // Notificar muerte en online
      await updateDoc(doc(db, "matches_snake", gameId), {
        [`${isHost() ? 'host' : 'guest'}.status`]: 'dead'
      });
    }
  };

  // --- LÓGICA ONLINE ---
  const isHost = () => onlineData && user && onlineData.host.uid === user.uid;

  const handleOnlineUpdate = (data) => {
    // Sincronizar puntuación rival
    if (user) {
       const imHost = data.host.uid === user.uid;
       const opp = imHost ? data.guest : data.host;
       if (opp) setOpponentScore(opp.score || 0);

       // Iniciar juego cuando ambos listos
       if (data.status === 'playing' && gameState === 'idle' && mode === 'lobby') {
          setScore(0);
          setSnake([{ x: 10, y: 10 }]);
          setDirection({ x: 0, y: 0 });
          setNextDirection({ x: 0, y: -1 }); // Empezar moviendo arriba
          setGameState('playing');
          setMode('playing_online');
       }

       // Finalizar juego (ambos muertos)
       if (data.host.status === 'dead' && data.guest?.status === 'dead' && !matchResult) {
          setGameState('over');
          // Calcular ganador
          const myScore = imHost ? data.host.score : data.guest.score;
          const theirScore = imHost ? data.guest.score : data.host.score;
          
          if (myScore > theirScore) setMatchResult('win');
          else if (myScore < theirScore) setMatchResult('lose');
          else setMatchResult('draw');
       }
    }
  };

  const updateOnlineScore = async (newScore) => {
    if (!gameId) return;
    const field = isHost() ? 'host.score' : 'guest.score';
    await updateDoc(doc(db, "matches_snake", gameId), { [field]: newScore });
  };

  const findPublicMatch = async () => {
    if (!user) return;
    setIsSearching(true);
    try {
      const q = query(collection(db, "matches_snake"), where("status", "==", "waiting"), where("public", "==", true), limit(1));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        // UNIRSE
        const match = snapshot.docs[0];
        if (match.data().host.uid === user.uid) { setGameId(match.id); setMode('lobby'); setIsSearching(false); return; } // Soy yo mismo
        
        await updateDoc(doc(db, "matches_snake", match.id), {
          guest: { uid: user.uid, name: user.name, score: 0, status: 'alive' },
          status: 'playing', // Empieza YA
          public: false
        });
        setGameId(match.id);
        setMode('playing_online'); // Salta directo
      } else {
        // CREAR
        const newId = generateGameId();
        await setDoc(doc(db, "matches_snake", newId), {
          host: { uid: user.uid, name: user.name, score: 0, status: 'alive' },
          status: 'waiting',
          public: true,
          createdAt: serverTimestamp()
        });
        setGameId(newId);
        setMode('lobby');
      }
    } catch (e) { console.error(e); }
    setIsSearching(false);
  };

  // --- PERSISTENCIA ---
  const saveScore = async () => {
    setSaveStatus('saving');
    try {
      if (user) {
        await addDoc(collection(db, "scores_snake"), {
          uid: user.uid,
          displayName: user.name,
          score: score,
          date: serverTimestamp()
        });
        setSaveStatus('saved');
        fetchLeaderboard();
      }
    } catch (e) { setSaveStatus('error'); }
  };

  const fetchLeaderboard = async () => {
    try {
      const q = query(collection(db, "scores_snake"), orderBy("score", "desc"), limit(5));
      const s = await getDocs(q);
      setLeaderboard(s.docs.map(doc => doc.data()));
    } catch (e) {}
  };

  // --- RENDERIZADO GRID ---
  const renderGrid = () => {
    const cells = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        let isSnake = false;
        let isHead = false;
        let isFood = (food.x === x && food.y === y);
        
        // Comprobar si es serpiente
        const index = snake.findIndex(s => s.x === x && s.y === y);
        if (index !== -1) {
          isSnake = true;
          if (index === 0) isHead = true;
        }

        cells.push(
          <div 
            key={`${x}-${y}`} 
            className={`
              w-full h-full rounded-[1px] transition-all duration-100
              ${isHead ? 'bg-white shadow-[0_0_15px_white] z-10' : 
                isSnake ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 
                isFood ? 'bg-purple-500 shadow-[0_0_15px_#a855f7] animate-pulse rounded-full scale-75' : 
                'bg-slate-900/30'}
            `}
          ></div>
        );
      }
    }
    return cells;
  };

  // --- VISTAS ---
  if (mode === 'menu') {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 font-mono text-white">
        <Link href="/" className="absolute top-6 left-6 p-3 bg-slate-800 rounded-full hover:bg-slate-700 transition"><ArrowLeft className="w-6 h-6" /></Link>
        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 mb-2 drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]">NEON SNAKE</h1>
        <p className="text-slate-500 text-xs tracking-[0.3em] uppercase mb-12">CAZADOR CIBERNÉTICO</p>

        <div className="grid gap-4 w-full max-w-sm mb-8">
          <button onClick={() => { setMode('playing_solo'); setGameState('playing'); setScore(0); setSnake([{x:10,y:10}]); setDirection({x:0,y:-1}); setNextDirection({x:0,y:-1}); }} className="p-6 bg-slate-900 border border-green-500/50 rounded-2xl hover:bg-green-500/10 transition group">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xl flex items-center gap-3 text-green-400"><Play className="fill-current"/> JUGAR SOLO</span>
              <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">RANKING</span>
            </div>
          </button>

          <button onClick={() => setMode('lobby')} className="p-6 bg-slate-900 border border-purple-500/50 rounded-2xl hover:bg-purple-500/10 transition group">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xl flex items-center gap-3 text-purple-400"><Swords /> DUELO ONLINE</span>
              <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">VS RIVAL</span>
            </div>
          </button>
        </div>

        {leaderboard.length > 0 && (
          <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 w-full max-w-sm">
             <h3 className="text-xs text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Globe className="w-4 h-4" /> TOP CAZADORES</h3>
             {leaderboard.map((s, i) => (
               <div key={i} className="flex justify-between text-sm border-b border-slate-800 py-2">
                 <span className="text-white">{s.displayName.substring(0,12)}</span>
                 <span className="text-green-400 font-mono">{s.score}</span>
               </div>
             ))}
          </div>
        )}
        <GameChat gameId="global_snake" gameName="SNAKE" />
      </div>
    );
  }

  if (mode === 'lobby') {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 font-mono text-white">
        <button onClick={() => { setMode('menu'); setGameId(''); }} className="absolute top-6 left-6 p-3 bg-slate-800 rounded-full"><ArrowLeft className="w-6 h-6" /></button>
        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold mb-8 text-green-400">SALA DE ESPERA</h2>
          {!gameId ? (
             <button onClick={findPublicMatch} disabled={isSearching} className="w-full py-6 bg-purple-600 rounded-xl font-bold text-lg mb-4 flex justify-center gap-2 items-center hover:bg-purple-500 transition shadow-[0_0_20px_rgba(168,85,247,0.4)]">
               {isSearching ? <Loader2 className="animate-spin" /> : <Globe />}
               {isSearching ? 'BUSCANDO...' : 'BUSCAR RIVAL'}
             </button>
          ) : (
             <div className="animate-in zoom-in">
               <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
               <h3 className="text-xl font-bold text-white mb-2">ESPERANDO OPONENTE...</h3>
               <div onClick={() => {navigator.clipboard.writeText(gameId); alert("Copiado!")}} className="bg-slate-950 p-4 rounded-xl border border-green-500/30 cursor-pointer mt-4">
                 <p className="text-4xl font-black text-green-400 tracking-widest">{gameId}</p>
                 <p className="text-[10px] text-slate-500 mt-2 uppercase flex justify-center gap-2"><Copy className="w-3 h-3"/> Copiar Código</p>
               </div>
             </div>
          )}
        </div>
      </div>
    );
  }

  // --- JUEGO (SOLO & ONLINE) ---
  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-2 font-mono text-white overflow-hidden touch-none select-none relative">
      
      {/* FONDO DE REJILLA */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none"></div>

      {/* HEADER SCORE */}
      <div className="w-full max-w-md flex justify-between items-center mb-4 z-10 px-4">
         <div className="text-center">
           <p className="text-[10px] text-slate-500 font-bold">SCORE</p>
           <p className="text-3xl font-black text-green-400 drop-shadow-[0_0_10px_#22c55e]">{score}</p>
         </div>
         {mode === 'playing_online' && (
           <div className="text-center opacity-70">
             <p className="text-[10px] text-slate-500 font-bold">RIVAL</p>
             <p className="text-xl font-bold text-red-400">{opponentScore}</p>
           </div>
         )}
      </div>

      {/* TABLERO */}
      <div className="relative p-1 bg-slate-900 border-2 border-slate-700 rounded-lg shadow-2xl">
         <div 
           className="grid gap-[1px] bg-slate-800"
           style={{ 
             gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, 
             width: 'min(90vw, 350px)', 
             height: 'min(90vw, 350px)' 
           }}
         >
           {renderGrid()}
         </div>

         {/* GAME OVER OVERLAY */}
         {gameState === 'over' && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
              <h2 className="text-3xl font-black text-white mb-2">GAME OVER</h2>
              {mode === 'playing_online' && matchResult && (
                 <p className={`text-xl font-bold mb-4 ${matchResult === 'win' ? 'text-green-400' : 'text-red-500'}`}>
                   {matchResult === 'win' ? '¡GANASTE EL DUELO!' : matchResult === 'lose' ? 'PERDISTE...' : 'EMPATE'}
                 </p>
              )}
              <p className="text-slate-400 mb-6">SCORE: {score}</p>
              <div className="flex gap-2">
                 <button onClick={() => { 
                   setGameState('playing'); setScore(0); setSnake([{x:10,y:10}]); setDirection({x:0,y:-1}); setNextDirection({x:0,y:-1}); setMatchResult(null);
                   if (mode === 'playing_online') setMode('lobby'); // En online volver al lobby
                 }} className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:scale-105 transition flex gap-2"><RefreshCw className="w-4 h-4"/> REINTENTAR</button>
                 <button onClick={() => { setMode('menu'); setGameState('idle'); }} className="px-6 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition">SALIR</button>
              </div>
            </div>
         )}
      </div>

      {/* CONTROLES MÓVILES (D-PAD) */}
      <div className="mt-8 grid grid-cols-3 gap-2 sm:hidden z-10">
         <div></div>
         <button onPointerDown={() => { if(direction.y===0) setNextDirection({x:0,y:-1}) }} className="w-16 h-16 bg-slate-800 rounded-xl flex items-center justify-center active:bg-green-600 transition shadow-lg border border-slate-700"><ChevronUp className="w-8 h-8"/></button>
         <div></div>
         <button onPointerDown={() => { if(direction.x===0) setNextDirection({x:-1,y:0}) }} className="w-16 h-16 bg-slate-800 rounded-xl flex items-center justify-center active:bg-green-600 transition shadow-lg border border-slate-700"><ChevronLeft className="w-8 h-8"/></button>
         <button onPointerDown={() => { if(direction.y===0) setNextDirection({x:0,y:1}) }} className="w-16 h-16 bg-slate-800 rounded-xl flex items-center justify-center active:bg-green-600 transition shadow-lg border border-slate-700"><ChevronDown className="w-8 h-8"/></button>
         <button onPointerDown={() => { if(direction.x===0) setNextDirection({x:1,y:0}) }} className="w-16 h-16 bg-slate-800 rounded-xl flex items-center justify-center active:bg-green-600 transition shadow-lg border border-slate-700"><ChevronRight className="w-8 h-8"/></button>
      </div>

      <div className="mt-6 hidden sm:block text-xs text-slate-500 tracking-widest">USA LAS FLECHAS DEL TECLADO</div>
      
      <div className="mt-4"><AdSpace type="banner" /></div>
      <GameChat gameId={mode === 'playing_online' ? gameId : "global_snake"} gameName="SNAKE" />

    </div>
  );
}