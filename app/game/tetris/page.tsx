// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  ArrowLeft, Trophy, RefreshCw, Zap, Skull, 
  ChevronLeft, ChevronRight, ChevronDown, 
  ArrowDownToLine, Copy, Swords, LogIn, RotateCw,
  Move, Settings2, Loader2, Play 
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, setDoc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- CONFIGURACIÓN DE PIEZAS ---
const TETROMINOS = {
  I: { shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], color: 'bg-cyan-500', shadow: 'shadow-[0_0_15px_#06b6d4]' },
  J: { shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], color: 'bg-blue-600', shadow: 'shadow-[0_0_15px_#2563eb]' },
  L: { shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], color: 'bg-orange-500', shadow: 'shadow-[0_0_15px_#f97316]' },
  O: { shape: [[1, 1], [1, 1]], color: 'bg-yellow-400', shadow: 'shadow-[0_0_15px_#eab308]' },
  S: { shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: 'bg-green-500', shadow: 'shadow-[0_0_15px_#22c55e]' },
  T: { shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], color: 'bg-purple-600', shadow: 'shadow-[0_0_15px_#9333ea]' },
  Z: { shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: 'bg-red-600', shadow: 'shadow-[0_0_15px_#dc2626]' },
};

const ROWS = 20;
const COLS = 10;

const LEVELS = {
  novato: { id: 'novato', label: 'NOVATO', speed: 800, multiplier: 1, color: 'text-emerald-400', border: 'border-emerald-500' },
  maestro: { id: 'maestro', label: 'MAESTRO', speed: 400, multiplier: 2, color: 'text-blue-400', border: 'border-blue-500' },
  pesadilla: { id: 'pesadilla', label: 'PESADILLA', speed: 150, multiplier: 5, color: 'text-rose-500', border: 'border-rose-500' }
};

const createGrid = () => Array.from(Array(ROWS), () => Array(COLS).fill([0, 'clear']));

export default function NeonTetrixPro() {
  const { coins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);

  // ESTADOS DEL JUEGO
  const [view, setView] = useState('menu'); 
  const [grid, setGrid] = useState(createGrid());
  const [player, setPlayer] = useState({ pos: { x: 0, y: 0 }, tetromino: null, color: '', shadow: '', collided: false });
  const [nextPiece, setNextPiece] = useState(null);
  const [score, setScore] = useState(0);
  const [currentDifficulty, setCurrentDifficulty] = useState(LEVELS.novato);
  const [gameOver, setGameOver] = useState(false);
  const [dropTime, setDropTime] = useState(null);
  
  // RANKING Y ONLINE
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingRank, setLoadingRank] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opName, setOpName] = useState('Rival');
  const [opScore, setOpScore] = useState(0);
  const [opStatus, setOpStatus] = useState('alive');

  // CONTROL DE UI (ARRASTRAR PANTALLA)
  const [uiLocked, setUiLocked] = useState(true);
  const [boardOffset, setBoardOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ? { uid: u.uid, name: u.displayName || 'Agente' } : null));
    fetchLeaderboard();
    return () => unsub();
  }, []);

  // --- 1. LÓGICA DE MOVIMIENTO ---
  const getRandomTetromino = useCallback(() => {
    const keys = Object.keys(TETROMINOS);
    return TETROMINOS[keys[Math.floor(Math.random() * keys.length)]];
  }, []);

  const checkCollision = (p, g, { x: moveX, y: moveY }, customShape = null) => {
    const shape = customShape || p.tetromino;
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x] !== 0) {
          const nextY = y + p.pos.y + moveY;
          const nextX = x + p.pos.x + moveX;
          if (!g[nextY] || g[nextY][nextX] === undefined || g[nextY][nextX][1] !== 'clear') return true;
        }
      }
    }
    return false;
  };

  const startGame = (diff = LEVELS.novato, isPvp = false) => {
    playSound('start');
    setGrid(createGrid());
    setScore(0);
    setCurrentDifficulty(diff);
    setGameOver(false);
    setOpStatus('alive');
    setOpScore(0);
    setUiLocked(true); // Bloquear pantalla al empezar
    
    const first = getRandomTetromino();
    const next = getRandomTetromino();
    
    setPlayer({ pos: { x: COLS / 2 - 2, y: 0 }, tetromino: first.shape, color: first.color, shadow: first.shadow, collided: false });
    setNextPiece(next);
    setDropTime(diff.speed);
    setView(isPvp ? 'pvp' : 'pve');
  };

  const movePlayer = (dir) => {
    if (!checkCollision(player, grid, { x: dir, y: 0 })) {
      setPlayer(prev => ({ ...prev, pos: { x: prev.pos.x + dir, y: prev.pos.y } }));
      playSound('hover'); 
    }
  };

  const rotatePlayer = () => {
    const rotated = player.tetromino[0].map((_, i) => player.tetromino.map(col => col[i]).reverse());
    // Wall kick simple (intentar mover si choca)
    const kicks = [0, 1, -1, 2, -2];
    for (let k of kicks) {
        if (!checkCollision(player, grid, { x: k, y: 0 }, rotated)) {
            setPlayer(prev => ({ ...prev, pos: { ...prev.pos, x: prev.pos.x + k }, tetromino: rotated }));
            playSound('click');
            return;
        }
    }
  };

  const drop = () => {
    if (gameOver) return;
    if (!checkCollision(player, grid, { x: 0, y: 1 })) {
      setPlayer(prev => ({ ...prev, pos: { ...prev.pos, y: prev.pos.y + 1 } }));
    } else {
      setPlayer(prev => ({ ...prev, collided: true }));
    }
  };

  const hardDrop = () => {
    if (!player.tetromino || gameOver) return;
    let tempY = 0;
    while (!checkCollision(player, grid, { x: 0, y: tempY + 1 })) tempY++;
    setPlayer(prev => ({ ...prev, pos: { ...prev.pos, y: prev.pos.y + tempY }, collided: true }));
    playSound('powerup');
  };

  // --- 2. CONTROLES DE TECLADO (PC) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
        if (gameOver || (view !== 'pve' && view !== 'pvp')) return;
        
        if (e.key === 'ArrowLeft') movePlayer(-1);
        else if (e.key === 'ArrowRight') movePlayer(1);
        else if (e.key === 'ArrowDown') drop();
        else if (e.key === 'ArrowUp') rotatePlayer();
        else if (e.code === 'Space') hardDrop();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [player, grid, gameOver, view]); // Dependencias para que no pierda el estado

  // --- 3. BUCLE DE JUEGO ---
  useEffect(() => {
    if (player.collided && !gameOver) {
      const newGrid = grid.map(row => [...row]);
      player.tetromino.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            const gy = y + player.pos.y;
            const gx = x + player.pos.x;
            if(gy >= 0 && gy < ROWS && gx >=0 && gx < COLS) {
               newGrid[gy][gx] = [value, player.color, player.shadow];
            }
          }
        });
      });

      let rows = 0;
      const sweptGrid = newGrid.reduce((acc, row) => {
        if (row.every(cell => cell[0] !== 0)) {
          rows++;
          acc.unshift(new Array(COLS).fill([0, 'clear']));
          return acc;
        }
        acc.push(row);
        return acc;
      }, []);

      if (rows > 0) {
        const points = [0, 100, 300, 500, 1200][rows] * currentDifficulty.multiplier;
        setScore(prev => {
           const newS = prev + points;
           if(view === 'pvp') updateOnlineScore(newS, 'alive');
           return newS;
        });
        playSound('powerup');
      }

      setGrid(sweptGrid);
      const next = nextPiece;
      
      if (checkCollision({ pos: { x: COLS/2-2, y:0 }, tetromino: next.shape }, sweptGrid, {x:0,y:0})) {
          setGameOver(true);
          setDropTime(null);
          handleEndGame();
      } else {
          setPlayer({ pos: { x: COLS / 2 - 2, y: 0 }, tetromino: next.shape, color: next.color, shadow: next.shadow, collided: false });
          setNextPiece(getRandomTetromino());
      }
    }
  }, [player.collided]);

  useEffect(() => {
    if (!dropTime || gameOver) return;
    const interval = setInterval(drop, dropTime);
    return () => clearInterval(interval);
  }, [dropTime, player, gameOver]);

  // --- 4. GHOST PIECE (SOMBRA) ---
  const ghostPos = useMemo(() => {
    if (!player.tetromino || gameOver) return null;
    let tempY = 0;
    while (!checkCollision(player, grid, { x: 0, y: tempY + 1 })) tempY++;
    return { x: player.pos.x, y: player.pos.y + tempY };
  }, [player, grid]);

  // --- 5. LÓGICA DRAG & DROP (MOVER PANTALLA) ---
  const handleDragStart = (e) => {
    if (uiLocked) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
  };
  const handleDragEnd = (e) => {
    if (uiLocked) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setBoardOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };
  const handleTouchStart = (e) => {
      if (uiLocked) return;
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e) => {
      if (uiLocked) return;
      const dx = e.changedTouches[0].clientX - dragStart.current.x;
      const dy = e.changedTouches[0].clientY - dragStart.current.y;
      setBoardOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  // --- ONLINE ---
  const createRoom = async () => {
    if (!user) return alert("Inicia sesión primero");
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    await setDoc(doc(db, "matches_tetris", code), {
      host: user.uid, hostName: user.name, hostScore: 0, hostStatus: 'alive',
      guest: null, guestName: '...', guestScore: 0, guestStatus: 'alive',
      status: 'waiting', createdAt: serverTimestamp()
    });
    setRoomCode(code); setIsHost(true); setView('lobby');
  };

  const joinRoom = async () => {
    if (!user) return alert("Inicia sesión primero");
    if (!joinCode || joinCode.length !== 4) return alert("Código inválido");
    const ref = doc(db, "matches_tetris", joinCode);
    const snap = await getDoc(ref);
    if (!snap.exists()) return alert("Sala no existe");
    await updateDoc(ref, { guest: user.uid, guestName: user.name, status: 'playing' });
    setRoomCode(joinCode); setIsHost(false); setView('pvp'); startGame(LEVELS.maestro, true);
  };

  useEffect(() => {
    if (!roomCode) return;
    const unsub = onSnapshot(doc(db, "matches_tetris", roomCode), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (isHost) {
          setOpName(data.guestName); setOpScore(data.guestScore); setOpStatus(data.guestStatus);
          if (data.status === 'playing' && view === 'lobby') startGame(LEVELS.maestro, true);
        } else {
          setOpName(data.hostName); setOpScore(data.hostScore); setOpStatus(data.hostStatus);
        }
      }
    });
    return () => unsub();
  }, [roomCode, isHost, view]);

  const updateOnlineScore = async (s, status) => {
    if (roomCode) await updateDoc(doc(db, "matches_tetris", roomCode), { 
       [isHost ? 'hostScore' : 'guestScore']: s,
       [isHost ? 'hostStatus' : 'guestStatus']: status
    });
  };

  // --- RANKING ---
  const fetchLeaderboard = async () => {
    setLoadingRank(true);
    try {
      const q = query(collection(db, "scores_tetris"), orderBy("score", "desc"), limit(5));
      const s = await getDocs(q);
      setLeaderboard(s.docs.map(d => d.data()));
    } catch (e) { console.error(e); } finally { setLoadingRank(false); }
  };

  const handleEndGame = async () => {
    playSound('explosion');
    if (view === 'pvp') updateOnlineScore(score, 'dead');
    if (user && score > 0) {
        await addDoc(collection(db, "scores_tetris"), { uid: user.uid, displayName: user.name, score, date: serverTimestamp() });
        addCoins(Math.floor(score / 100), "Tetrix");
        fetchLeaderboard();
    }
  };

  // --- RENDER ---
  const displayGrid = useMemo(() => {
    const g = grid.map(row => row.map(cell => [...cell]));
    // Ghost
    if (ghostPos && !gameOver) {
       player.tetromino.forEach((row, y) => row.forEach((val, x) => {
          if (val) {
             const gy = y + ghostPos.y;
             if (gy>=0 && gy<ROWS) g[gy][x+ghostPos.x] = [1, 'bg-white/5 border border-white/20', ''];
          }
       }));
    }
    // Player
    if (!gameOver && player.tetromino) {
       player.tetromino.forEach((row, y) => row.forEach((val, x) => {
          if (val) {
             const gy = y + player.pos.y;
             if (gy>=0 && gy<ROWS) g[gy][x+player.pos.x] = [val, player.color, player.shadow];
          }
       }));
    }
    return g;
  }, [grid, player, ghostPos]);

  return (
    <div className="h-[100dvh] w-full bg-[#020617] flex flex-col items-center justify-between p-2 font-mono text-white overflow-hidden touch-none select-none relative">
      <div className="absolute inset-0 bg-[radial-gradient(rgba(168,85,247,0.05)_1px,transparent_1px)] [background-size:30px_30px] pointer-events-none"></div>

      {/* HEADER */}
      <div className="w-full max-w-sm flex justify-between items-center py-2 shrink-0 z-10 px-2 relative">
        <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 bg-slate-900/50 rounded-full border border-slate-700 hover:border-purple-500 transition"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
        
        <div className="flex gap-4 bg-slate-900/80 px-4 py-1 rounded-full border border-purple-700/30 backdrop-blur-md shadow-lg">
           <div className="text-center">
             <p className="text-[8px] text-slate-500 font-bold uppercase">Score</p>
             <p className="font-black text-purple-400 text-lg leading-none">{score.toLocaleString()}</p>
           </div>
           {view === 'pvp' && (
             <>
               <div className="w-[1px] bg-slate-700"></div>
               <div className="text-center">
                 <p className="text-[8px] text-rose-500 font-bold uppercase">VS</p>
                 <p className="font-black text-rose-400 text-lg leading-none">{opScore.toLocaleString()}</p>
               </div>
             </>
           )}
        </div>

        {/* BOTÓN AJUSTE DE PANTALLA (Solo visible en juego) */}
        {(view === 'pve' || view === 'pvp') && (
            <button 
                onClick={() => setUiLocked(!uiLocked)} 
                className={`p-2 rounded-full border transition ${uiLocked ? 'bg-slate-900/50 border-slate-700 text-slate-400' : 'bg-yellow-500/20 border-yellow-500 text-yellow-400 animate-pulse'}`}
            >
                {uiLocked ? <Settings2 className="w-5 h-5"/> : <Move className="w-5 h-5"/>}
            </button>
        )}
      </div>

      {/* VISTAS */}
      {view === 'menu' ? (
        <div className="flex-1 w-full max-w-sm flex flex-col gap-3 justify-center items-center z-10 overflow-y-auto py-2">
          <div className="text-center mb-2">
             <h1 className="text-5xl font-black italic tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-fuchsia-600">NEON TETRIX</h1>
             <p className="text-[10px] text-purple-500/60 font-bold tracking-widest uppercase">Arcade Pro Edition</p>
          </div>

          <div className="grid grid-cols-1 gap-2 w-full">
            {Object.values(LEVELS).map((lvl) => (
              <button key={lvl.id} onClick={() => startGame(lvl)} className={`bg-slate-900/80 p-4 rounded-2xl border-2 ${lvl.border} hover:scale-[1.02] transition-all flex justify-between items-center group`}>
                 <div className="text-left">
                    <p className={`font-black text-lg italic ${lvl.color}`}>{lvl.label}</p>
                    <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">x{lvl.multiplier} Puntos</p>
                 </div>
                 <Zap className={`w-5 h-5 ${lvl.color} animate-pulse`} />
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
              <button onClick={createRoom} className="bg-slate-900/80 p-4 rounded-2xl border-2 border-cyan-500 hover:scale-[1.02] transition-all flex flex-col items-center gap-2">
                    <Swords className="w-6 h-6 text-cyan-400"/>
                    <p className="font-black text-xs italic text-cyan-400">CREAR SALA</p>
              </button>
              <div className="bg-slate-900/80 p-4 rounded-2xl border-2 border-fuchsia-500 flex flex-col gap-2">
                 <div className="flex gap-1">
                    <input type="text" maxLength={4} placeholder="CODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} className="w-full bg-slate-950 border border-fuchsia-500/30 rounded px-1 text-center text-xs font-bold text-white outline-none"/>
                    <button onClick={joinRoom} className="bg-fuchsia-600 p-1 rounded hover:bg-fuchsia-500"><LogIn className="w-4 h-4 text-white"/></button>
                 </div>
                 <p className="font-black text-[10px] italic text-fuchsia-400 text-center uppercase">Unirse</p>
              </div>
          </div>
          
          <div className="w-full bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
             <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex items-center gap-2"><Trophy className="w-3 h-3 text-yellow-500"/> Ranking Global</h3>
             {loadingRank ? <Loader2 className="w-4 h-4 animate-spin text-purple-500 mx-auto"/> : leaderboard.length > 0 ? leaderboard.map((s,i) => (
               <div key={i} className="flex justify-between text-[10px] py-1 border-b border-white/5 last:border-0">
                 <span className="text-slate-300">#{i+1} {s.displayName}</span>
                 <span className="text-purple-400 font-black">{s.score.toLocaleString()}</span>
               </div>
             )) : <p className="text-[10px] text-slate-500 text-center">Sin récords</p>}
          </div>
        </div>
      ) : view === 'lobby' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 z-10 animate-in fade-in">
          <div className="p-8 bg-slate-900 rounded-[2.5rem] border-2 border-dashed border-purple-500/50 text-center shadow-2xl">
             <p className="text-xs text-slate-500 font-bold uppercase mb-2">Código de Sala</p>
             <h2 className="text-6xl font-black text-white tracking-[0.2em] mb-4">{roomCode}</h2>
             <button onClick={() => {navigator.clipboard.writeText(roomCode); alert("Copiado");}} className="bg-purple-500/10 px-4 py-2 rounded-full text-purple-400 text-xs font-bold flex gap-2 mx-auto border border-purple-500/20"><Copy className="w-4 h-4"/> COPIAR</button>
          </div>
          <div className="flex flex-col items-center gap-2">
             <Loader2 className="w-8 h-8 animate-spin text-purple-500"/>
             <p className="text-sm font-bold uppercase tracking-[0.3em] animate-pulse">Esperando rival...</p>
          </div>
          <button onClick={() => setView('menu')} className="text-slate-500 text-xs font-bold uppercase hover:text-white transition">Cancelar</button>
        </div>
      ) : (
        <div 
            className={`flex-1 w-full max-w-md flex gap-3 items-center justify-center min-h-0 py-1 z-10 relative transition-transform duration-100 ${!uiLocked ? 'cursor-move scale-95 ring-2 ring-yellow-500/50 rounded-3xl' : ''}`}
            style={{ transform: `translate(${boardOffset.x}px, ${boardOffset.y}px)` }}
            onMouseDown={handleDragStart}
            onMouseUp={handleDragEnd}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
          {!uiLocked && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 rounded-3xl backdrop-blur-sm pointer-events-none">
                  <div className="bg-yellow-500 text-black font-bold px-4 py-2 rounded-full text-xs shadow-lg animate-pulse flex items-center gap-2">
                      <Move className="w-4 h-4"/> ARRASTRA PARA MOVER
                  </div>
              </div>
          )}

          {/* TABLERO */}
          <div className="relative border-4 border-slate-800 rounded-3xl bg-slate-950/90 overflow-hidden shadow-[0_0_50px_rgba(168,85,247,0.2)] h-full aspect-[10/20] max-h-full">
            <div className="grid grid-cols-10 gap-[1px] bg-white/5 w-full h-full">
              {displayGrid.map((row, y) => row.map((cell, x) => (
                <div key={`${y}-${x}`} className={`w-full h-full ${cell[1]} ${cell[2]} ${cell[1] === 'clear' ? 'bg-transparent' : 'border border-white/10'}`}></div>
              ))) }
            </div>

            {gameOver && (
               <div className="absolute inset-0 bg-black/90 z-30 flex flex-col items-center justify-center p-6 backdrop-blur-md animate-in zoom-in">
                 <Skull className="w-16 h-16 text-rose-500 mb-4 animate-bounce"/>
                 <h2 className="text-4xl font-black italic mb-2 text-white">GAME OVER</h2>
                 <p className="text-purple-400 font-black text-3xl mb-8">{score.toLocaleString()} PTS</p>
                 <div className="flex flex-col gap-3 w-full">
                    <button onClick={() => startGame(currentDifficulty, view === 'pvp')} className="py-4 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5"/> REINTENTAR</button>
                    <button onClick={() => setView('menu')} className="py-4 bg-slate-800 text-slate-400 font-bold rounded-2xl border border-slate-700 active:scale-95 transition-all">MENÚ PRINCIPAL</button>
                 </div>
               </div>
            )}
          </div>

          {/* HUD LATERAL */}
          <div className="flex flex-col gap-4 h-full justify-start py-4">
             <div className="bg-slate-900/80 border border-purple-500/20 rounded-2xl p-3 w-20 flex flex-col items-center backdrop-blur-md">
               <span className="text-[9px] text-slate-500 font-bold mb-3 tracking-widest">NEXT</span>
               <div className="scale-75">
                 {nextPiece && nextPiece.shape.map((row, i) => (
                   <div key={i} className="flex gap-[1.5px]">
                     {row.map((cell, j) => (
                       <div key={`${i}-${j}`} className={`w-3.5 h-3.5 rounded-sm ${cell ? `${nextPiece.color} ${nextPiece.shadow}` : 'bg-transparent'}`}></div>
                     ))}
                   </div>
                 ))}
               </div>
             </div>
          </div>
        </div>
      )}

      {/* CONTROLES MÓVIL (SIEMPRE VISIBLES SI NO ES GAME OVER) */}
      {(view === 'pve' || view === 'pvp') && !gameOver && (
        <div className="grid grid-cols-2 gap-4 w-full max-w-md shrink-0 pb-6 px-4 z-20">
           
           {/* PAD IZQUIERDO (MOVIMIENTO) */}
           <div className="grid grid-cols-3 gap-2 bg-slate-900/50 p-2 rounded-3xl border border-white/10 backdrop-blur-sm">
               <div className="col-start-2"></div>
               <button onPointerDown={(e) => {e.preventDefault(); movePlayer(-1)}} className="h-14 bg-slate-800 rounded-xl flex items-center justify-center border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 transition-all shadow-lg active:bg-cyan-600/50"><ChevronLeft className="w-6 h-6 text-white"/></button>
               <button onPointerDown={(e) => {e.preventDefault(); drop()}} className="h-14 bg-slate-800 rounded-xl flex items-center justify-center border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 transition-all shadow-lg active:bg-cyan-600/50"><ChevronDown className="w-6 h-6 text-white"/></button>
               <button onPointerDown={(e) => {e.preventDefault(); movePlayer(1)}} className="h-14 bg-slate-800 rounded-xl flex items-center justify-center border-b-4 border-slate-950 active:border-b-0 active:translate-y-1 transition-all shadow-lg active:bg-cyan-600/50"><ChevronRight className="w-6 h-6 text-white"/></button>
           </div>

           {/* PAD DERECHO (ACCIÓN) */}
           <div className="grid grid-cols-2 gap-2 bg-slate-900/50 p-2 rounded-3xl border border-white/10 backdrop-blur-sm">
                <button onPointerDown={(e) => {e.preventDefault(); rotatePlayer()}} className="h-14 col-span-2 bg-purple-600 rounded-xl flex items-center justify-center gap-2 border-b-4 border-purple-900 active:border-b-0 active:translate-y-1 transition-all shadow-[0_0_15px_rgba(168,85,247,0.4)] active:bg-purple-500">
                    <RotateCw className="w-6 h-6 text-white"/> <span className="text-[10px] font-black uppercase">Rotar</span>
                </button>
                <button onPointerDown={(e) => {e.preventDefault(); hardDrop()}} className="h-14 col-span-2 bg-rose-600 rounded-xl flex items-center justify-center gap-2 border-b-4 border-rose-900 active:border-b-0 active:translate-y-1 transition-all shadow-lg active:bg-rose-500">
                    <ArrowDownToLine className="w-6 h-6 text-white"/> <span className="text-[10px] font-black uppercase">Caer</span>
                </button>
           </div>
        </div>
      )}

      <div className="w-full shrink-0 flex flex-col items-center opacity-70 scale-90 origin-bottom">
         <div className="h-8 overflow-hidden w-full"><AdSpace type="banner" /></div>
         <GameChat gameId={roomCode || "global_tetris"} gameName="TETRIX" />
      </div>
    </div>
  );
}