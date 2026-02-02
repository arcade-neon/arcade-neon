// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Trophy, Share2, Globe, Zap, ArrowDown, RotateCw, ArrowLeft as ArrowLeftIcon, ArrowRight as ArrowRightIcon, LayoutGrid } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat'; // <--- ¡ESTA ES LA LÍNEA QUE FALTABA!

// --- CONFIGURACIÓN PIEZAS (NEÓN ELEGANTE Y NÍTIDO) ---
const TETROMINOS = {
  // Reducimos el blur de 20px a 10px para que se definan mejor los bordes
  I: { shape: [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]], color: 'bg-cyan-500', shadow: 'shadow-[0_0_10px_#06b6d4]' }, // Cyan más sólido
  J: { shape: [[0, 1, 0], [0, 1, 0], [1, 1, 0]], color: 'bg-blue-600', shadow: 'shadow-[0_0_10px_#2563eb]' },
  L: { shape: [[0, 1, 0], [0, 1, 0], [0, 1, 1]], color: 'bg-orange-500', shadow: 'shadow-[0_0_10px_#f97316]' },
  O: { shape: [[1, 1], [1, 1]], color: 'bg-yellow-400', shadow: 'shadow-[0_0_10px_#eab308]' },
  S: { shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: 'bg-green-500', shadow: 'shadow-[0_0_10px_#22c55e]' },
  T: { shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], color: 'bg-purple-600', shadow: 'shadow-[0_0_10px_#9333ea]' },
  Z: { shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: 'bg-red-600', shadow: 'shadow-[0_0_10px_#dc2626]' },
};

const ROWS = 20;
const COLS = 10;
const INITIAL_SPEED = 800;

// --- UTILIDADES ---
const createGrid = () => Array.from(Array(ROWS), () => Array(COLS).fill([0, 'clear']));
const randomTetromino = () => {
  const keys = Object.keys(TETROMINOS);
  const randKey = keys[Math.floor(Math.random() * keys.length)];
  return TETROMINOS[randKey];
};

export default function TetrixPro() {
  const [grid, setGrid] = useState(createGrid());
  const [player, setPlayer] = useState({ pos: { x: 0, y: 0 }, tetromino: TETROMINOS.I.shape, color: '', shadow: '', collided: false });
  // Inicializamos nextPiece inmediatamente
  const [nextPiece, setNextPiece] = useState(randomTetromino());
  
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [dropTime, setDropTime] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [saveStatus, setSaveStatus] = useState('idle');

  const movePlayer = (dir) => {
    if (!checkCollision(player, grid, { x: dir, y: 0 })) {
      setPlayer(prev => ({ ...prev, pos: { x: prev.pos.x + dir, y: prev.pos.y } }));
    }
  };

  const startGame = () => {
    setGrid(createGrid());
    setScore(0);
    setLevel(1);
    setGameOver(false);
    setSaveStatus('idle');
    
    // Al empezar, definimos la actual y la siguiente
    const first = randomTetromino();
    const next = randomTetromino();
    
    setPlayer({ 
      pos: { x: COLS / 2 - 2, y: 0 }, 
      tetromino: first.shape, 
      color: first.color, 
      shadow: first.shadow, 
      collided: false 
    });
    setNextPiece(next);
    setDropTime(INITIAL_SPEED);
  };

  const hardDrop = () => {
    let tempY = 0;
    while (!checkCollision(player, grid, { x: 0, y: tempY + 1 })) {
      tempY += 1;
    }
    const p = { ...player, pos: { x: player.pos.x, y: player.pos.y + tempY }, collided: true };
    setPlayer(p);
  };

  const drop = () => {
    if (gameOver) return;
    if (score > (level * 500)) {
      setLevel(prev => prev + 1);
      setDropTime(1000 / (level + 1) + 200);
    }
    if (!checkCollision(player, grid, { x: 0, y: 1 })) {
      setPlayer(prev => ({ ...prev, pos: { x: prev.pos.x, y: prev.pos.y + 1 } }));
    } else {
      if (player.pos.y < 1) {
        setGameOver(true);
        setDropTime(null);
        handleGameOver();
      }
      setPlayer(prev => ({ ...prev, collided: true }));
    }
  };

  useEffect(() => {
    if (player.collided) {
      const newGrid = grid.map(row => row.map(cell => cell));
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
      let rowsToClear = 0;
      const sweepGrid = newGrid.reduce((ack, row) => {
        if (row.findIndex(cell => cell[0] === 0) === -1) {
          rowsToClear += 1;
          ack.unshift(new Array(COLS).fill([0, 'clear']));
          return ack;
        }
        ack.push(row);
        return ack;
      }, []);
      if (rowsToClear > 0) setScore(prev => prev + (rowsToClear * 100 * level));
      setGrid(sweepGrid);

      // --- ASIGNAR SIGUIENTE PIEZA ---
      const newTetro = nextPiece; // Tomamos la que estaba en espera
      const upcoming = randomTetromino(); // Generamos una nueva para el futuro
      
      setPlayer({ 
        pos: { x: COLS / 2 - 2, y: 0 }, 
        tetromino: newTetro.shape, 
        color: newTetro.color, 
        shadow: newTetro.shadow,
        collided: false 
      });
      setNextPiece(upcoming); // Actualizamos el visor
    }
  }, [player.collided]);

  useEffect(() => {
    if (!dropTime) return;
    const interval = setInterval(() => drop(), dropTime);
    return () => clearInterval(interval);
  }, [dropTime, player, grid]);

  const checkCollision = (p, g, { x: moveX, y: moveY }) => {
    for (let y = 0; y < p.tetromino.length; y += 1) {
      for (let x = 0; x < p.tetromino[y].length; x += 1) {
        if (p.tetromino[y][x] !== 0) {
          if (!g[y + p.pos.y + moveY] || !g[y + p.pos.y + moveY][x + p.pos.x + moveX] || g[y + p.pos.y + moveY][x + p.pos.x + moveX][1] !== 'clear') return true;
        }
      }
    }
    return false;
  };

  const playerRotate = () => {
    const clonedPlayer = JSON.parse(JSON.stringify(player));
    clonedPlayer.tetromino = clonedPlayer.tetromino[0].map((_, index) => clonedPlayer.tetromino.map(col => col[index]).reverse());
    if (!checkCollision(clonedPlayer, grid, { x: 0, y: 0 })) setPlayer(clonedPlayer);
  };

  useEffect(() => {
    const move = ({ keyCode }) => {
      if (!gameOver) {
        if (keyCode === 37) movePlayer(-1); 
        if (keyCode === 39) movePlayer(1);
        if (keyCode === 40) drop();
        if (keyCode === 38) playerRotate();
        if (keyCode === 32) hardDrop();
      }
    };
    window.addEventListener('keydown', move);
    return () => window.removeEventListener('keydown', move);
  }, [player, gameOver, grid]);

  useEffect(() => { if (gameOver) fetchLeaderboard(); }, [gameOver]);
  const fetchLeaderboard = async () => {
    try {
      const q = query(collection(db, "scores_tetris"), orderBy("score", "desc"), limit(5));
      const s = await getDocs(q);
      setLeaderboard(s.docs.map(doc => doc.data()));
    } catch (e) {}
  };
  const handleGameOver = async () => {
    setSaveStatus('saving');
    try {
      const user = auth.currentUser;
      if (user) await addDoc(collection(db, "scores_tetris"), { uid: user.uid, displayName: user.displayName||'Anónimo', score, level, date: serverTimestamp() });
      setSaveStatus('saved');
      fetchLeaderboard();
    } catch (e) { setSaveStatus('error'); }
  };

  const displayGrid = grid.map(row => row.map(cell => cell));
  if (!gameOver && player.tetromino) {
    player.tetromino.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          const gy = y + player.pos.y;
          const gx = x + player.pos.x;
          if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) displayGrid[gy][gx] = [value, player.color, player.shadow];
        }
      });
    });
  }

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-2 font-mono text-white overflow-hidden touch-none select-none relative">
      
      {/* FONDO CON REJILLA SUTIL */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none"></div>
      
      <div className="w-full max-w-sm flex justify-between items-center mb-4 z-10">
        <Link href="/" className="p-2 bg-slate-900/50 rounded-full hover:bg-slate-800 transition border border-slate-700"><ArrowLeft className="w-5 h-5 text-slate-400"/></Link>
        <div className="flex gap-6 bg-slate-900/80 px-6 py-2 rounded-full border border-slate-700/50 backdrop-blur-md shadow-[0_0_20px_rgba(0,0,0,0.3)]">
           <div className="text-center">
             <p className="text-[9px] text-slate-500 tracking-widest">NIVEL</p>
             <p className="font-black text-yellow-400 text-lg leading-none drop-shadow-[0_0_5px_#facc15]">{level}</p>
           </div>
           <div className="w-[1px] bg-slate-700"></div>
           <div className="text-center">
             <p className="text-[9px] text-slate-500 tracking-widest">SCORE</p>
             <p className="font-black text-cyan-400 text-lg leading-none drop-shadow-[0_0_5px_#22d3ee]">{score}</p>
           </div>
        </div>
        <div className="w-9"></div>
      </div>

      <div className="flex gap-4 items-start w-full max-w-md justify-center">
        
        {/* TABLERO DE JUEGO */}
        <div className="relative border-4 border-slate-800 rounded-xl bg-slate-950/80 overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.2)] backdrop-blur-md">
          <div className="grid grid-cols-10 gap-[1px] bg-slate-900/30" style={{ width: 'min(70vw, 260px)', height: 'min(140vw, 520px)' }}>
            {displayGrid.map((row, y) => row.map((cell, x) => (
              <div key={`${y}-${x}`} className={`w-full h-full transition-colors duration-75 ${cell[1] === 'clear' ? 'bg-transparent' : `${cell[1]} ${cell[2] || ''}`}`}></div>
            ))) }
          </div>

          {/* PANTALLA INICIO */}
          {(!dropTime && !gameOver && score === 0) && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 backdrop-blur-sm">
               <LayoutGrid className="w-16 h-16 text-cyan-500 mb-4 animate-pulse drop-shadow-[0_0_10px_#22d3ee]" />
               <h1 className="text-4xl font-black text-white mb-6 tracking-tighter drop-shadow-[0_0_15px_rgba(168,85,247,0.8)]">
                 TETRIX
               </h1>
               <button onClick={startGame} className="px-8 py-3 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-full font-bold shadow-[0_0_25px_rgba(168,85,247,0.5)] hover:scale-105 transition border border-white/20">JUGAR</button>
             </div>
          )}

          {/* PANTALLA GAME OVER */}
          {gameOver && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-30 p-4">
               <Trophy className="w-16 h-16 text-yellow-400 mb-2 animate-bounce drop-shadow-[0_0_10px_#facc15]"/>
               <h2 className="text-3xl font-black text-white mb-1">GAME OVER</h2>
               <p className="text-slate-400 text-sm mb-6">FINAL SCORE: <span className="text-cyan-400 font-bold drop-shadow-[0_0_5px_#22d3ee]">{score}</span></p>
               
               <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 w-full mb-4">
                  <h3 className="text-[10px] text-slate-500 uppercase mb-3 flex items-center gap-1"><Globe className="w-3 h-3"/> RANKING GLOBAL</h3>
                  {leaderboard.map((s, i) => (
                    <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-800 last:border-0 text-slate-300">
                      <span>#{i+1} {s.displayName.substring(0,10)}</span>
                      <span className="text-yellow-400 font-mono">{s.score}</span>
                    </div>
                  ))}
               </div>
               <div className="flex gap-2 w-full">
                 <button onClick={() => {navigator.clipboard.writeText(`🧱 TETRIX: ${score} pts. ¿Puedes superarme?`); alert("Copiado!");}} className="flex-1 py-3 bg-slate-800 rounded-lg text-xs font-bold hover:bg-slate-700 flex justify-center gap-2 items-center"><Share2 className="w-4 h-4"/> RETAR</button>
                 <button onClick={startGame} className="flex-1 py-3 bg-white text-black rounded-lg text-xs font-bold hover:bg-slate-200 flex justify-center gap-2 items-center"><RefreshCw className="w-4 h-4"/> REINTENTAR</button>
               </div>
             </div>
          )}
        </div>

        {/* VISOR DE SIGUIENTE PIEZA (CORREGIDO Y FLEXIBLE) */}
        <div className="flex flex-col gap-2">
           <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-3 w-20 min-h-[6rem] flex flex-col items-center backdrop-blur-md shadow-[0_0_20px_rgba(0,0,0,0.3)]">
             <span className="text-[9px] text-slate-500 font-bold mb-3 tracking-wider">SIGUIENTE</span>
             
             {/* AQUÍ ESTÁ EL CAMBIO: Usamos Flexbox en lugar de Grid para que no se rompa la forma */}
             <div className="flex flex-col gap-1 items-center justify-center">
               {nextPiece && nextPiece.shape.map((row, i) => (
                 <div key={i} className="flex gap-1">
                   {row.map((cell, j) => (
                     <div 
                       key={`${i}-${j}`} 
                       className={`w-3 h-3 rounded-[1px] ${cell ? `${nextPiece.color} ${nextPiece.shadow}` : 'bg-transparent'}`}
                     ></div>
                   ))}
                 </div>
               ))}
             </div>

           </div>
           
           <button 
             onPointerDown={hardDrop}
             className="w-20 h-24 bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 rounded-xl flex flex-col items-center justify-center group active:border-cyan-500 active:shadow-[0_0_25px_rgba(6,182,212,0.5)] transition-all"
           >
             <Zap className="w-8 h-8 text-yellow-400 group-active:scale-90 transition-transform mb-1 drop-shadow-[0_0_5px_#facc15]" />
             <span className="text-[8px] text-slate-400 uppercase font-bold text-center leading-tight">CAÍDA<br/>RÁPIDA</span>
           </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 w-full max-w-sm mt-6 sm:hidden">
         <button onPointerDown={() => movePlayer(-1)} className="p-5 bg-slate-800/80 rounded-2xl active:bg-cyan-600/50 transition border border-slate-700 flex justify-center shadow-[0_0_10px_rgba(0,0,0,0.3)]"><ArrowLeftIcon className="text-white"/></button>
         <button onPointerDown={playerRotate} className="p-5 bg-slate-800/80 rounded-2xl active:bg-purple-600/50 transition border border-slate-700 flex justify-center shadow-[0_0_10px_rgba(0,0,0,0.3)]"><RotateCw className="text-white"/></button>
         <button onPointerDown={() => movePlayer(1)} className="p-5 bg-slate-800/80 rounded-2xl active:bg-cyan-600/50 transition border border-slate-700 flex justify-center shadow-[0_0_10px_rgba(0,0,0,0.3)]"><ArrowRightIcon className="text-white"/></button>
         <button onPointerDown={() => drop()} className="col-span-3 p-4 bg-slate-800/50 rounded-xl active:bg-slate-700 border border-slate-800 flex justify-center mt-1 shadow-[0_0_10px_rgba(0,0,0,0.3)]"><ArrowDown className="text-slate-500 w-4 h-4"/></button>
      </div>

      <div className="mt-4 hidden sm:block text-[10px] text-slate-600 tracking-widest uppercase">
        <span className="text-cyan-500 font-bold">ESPACIO</span> = CAÍDA RÁPIDA  •  <span className="text-cyan-500 font-bold">↑</span> = ROTAR
      </div>

      <div className="mt-6 opacity-75 scale-90 origin-bottom">
         <AdSpace type="banner" />
      </div>

      <GameChat gameId="global_tetris" gameName="TETRIX" />

    </div>
  );
}