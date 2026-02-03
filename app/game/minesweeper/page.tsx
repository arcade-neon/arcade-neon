// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart, Play, Trophy, RefreshCw, Bomb, Flag, Users, Cpu, Eye, Lightbulb, Video, Zap, ShieldAlert, Skull } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, setDoc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- CONFIGURACIÓN DE DIFICULTAD ---
const DIFFICULTIES = {
  easy: { rows: 8, cols: 8, mines: 10, name: 'POCO TÓXICA' },
  medium: { rows: 10, cols: 10, mines: 20, name: 'CELOSA' },
  hard: { rows: 12, cols: 12, mines: 30, name: 'DRAMA QUEEN' }
};

// --- UTILIDADES DEL BUSCAMINAS ---
const createEmptyGrid = (rows, cols) => {
  return Array(rows).fill(0).map(() => Array(cols).fill({
    isMine: false, isRevealed: false, isFlagged: false, neighborCount: 0
  }));
};

const getNeighbors = (r, c, rows, cols) => {
  const neighbors = [];
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      const newR = r + i;
      const newC = c + j;
      if (newR >= 0 && newR < rows && newC >= 0 && newC < cols) {
        neighbors.push({ r: newR, c: newC });
      }
    }
  }
  return neighbors;
};

export default function ChamiLaToxicaGame() {
  // ESTADOS VISTA
  const [view, setView] = useState('menu');
  const [user, setUser] = useState(null);

  // ESTADOS JUEGO
  const [grid, setGrid] = useState([]);
  const [config, setConfig] = useState(DIFFICULTIES.medium);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [flagMode, setFlagMode] = useState(false); 
  const [minesLeft, setMinesLeft] = useState(0);

  // ESTADOS ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [opStatus, setOpStatus] = useState('Esperando...');

  // RANKING Y ADS
  const [leaderboard, setLeaderboard] = useState([]);
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 });

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // --- LÓGICA ONLINE ---
  useEffect(() => {
    if ((view === 'playing_online_host' || view === 'playing_online_guest') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_minesweeper", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (view === 'playing_online_host') setOpStatus(data.guestStatus || 'Jugando...');
                else setOpStatus(data.hostStatus || 'Jugando...');
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode]);

  // --- INICIAR JUEGO ---
  const startAiGame = (diffKey) => {
    const conf = DIFFICULTIES[diffKey];
    setConfig(conf);
    initBoard(conf);
    setLives(3);
    setScore(0);
    setGameOver(false);
    setFlagMode(false);
    setView('playing_ai');
  };

  const createRoom = async (diffKey) => {
    const conf = DIFFICULTIES[diffKey];
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    await setDoc(doc(db, "matches_minesweeper", code), {
        host: user?.name || 'Anónimo',
        difficulty: diffKey,
        hostStatus: 'playing',
        guestStatus: 'waiting',
        createdAt: serverTimestamp()
    });
    setConfig(conf);
    initBoard(conf);
    setLives(1); 
    setRoomCode(code);
    setView('playing_online_host');
  };

  const joinRoom = async (codeInput) => {
    const ref = doc(db, "matches_minesweeper", codeInput);
    const snap = await getDoc(ref);
    if (!snap.exists()) return alert("Sala no encontrada");
    const diffKey = snap.data().difficulty;
    const conf = DIFFICULTIES[diffKey];
    await updateDoc(ref, { guest: user?.name || 'Invitado', guestStatus: 'playing' });
    setConfig(conf);
    initBoard(conf);
    setLives(1);
    setRoomCode(codeInput);
    setView('playing_online_guest');
  };

  // --- CORE BUSCAMINAS ---
  const initBoard = (conf) => {
    let newGrid = createEmptyGrid(conf.rows, conf.cols);
    let minesPlaced = 0;
    while (minesPlaced < conf.mines) {
      const r = Math.floor(Math.random() * conf.rows);
      const c = Math.floor(Math.random() * conf.cols);
      if (!newGrid[r][c].isMine) {
        newGrid[r][c] = { ...newGrid[r][c], isMine: true };
        minesPlaced++;
      }
    }
    for (let r = 0; r < conf.rows; r++) {
      for (let c = 0; c < conf.cols; c++) {
        if (newGrid[r][c].isMine) continue;
        const neighbors = getNeighbors(r, c, conf.rows, conf.cols);
        const count = neighbors.reduce((acc, n) => acc + (newGrid[n.r][n.c].isMine ? 1 : 0), 0);
        newGrid[r][c] = { ...newGrid[r][c], neighborCount: count };
      }
    }
    setGrid(newGrid);
    setMinesLeft(conf.mines);
    setGameOver(false);
  };

  const handleCellClick = (r, c) => {
    if (gameOver || grid[r][c].isRevealed) return;
    if (flagMode) { toggleFlag(r, c); return; }
    if (grid[r][c].isFlagged) return;
    if (grid[r][c].isMine) triggerMine(r, c);
    else revealCell(r, c);
  };

  const toggleFlag = (r, c) => {
    if (grid[r][c].isRevealed) return;
    const newGrid = [...grid];
    newGrid[r][c] = { ...newGrid[r][c], isFlagged: !newGrid[r][c].isFlagged };
    setGrid(newGrid);
    setMinesLeft(prev => newGrid[r][c].isFlagged ? prev - 1 : prev + 1);
  };

  const triggerMine = async (r, c) => {
    const newLives = lives - 1;
    setLives(newLives);
    const newGrid = [...grid];
    newGrid[r][c] = { ...newGrid[r][c], isRevealed: true, exploded: true };
    setGrid(newGrid);
    if (newLives <= 0) handleGameEnd(false);
    else if (navigator.vibrate) navigator.vibrate(200);
  };

  const revealCell = (r, c, currentGrid = null) => {
    let workingGrid = currentGrid || [...grid];
    if (workingGrid[r][c].isRevealed || workingGrid[r][c].isFlagged) return workingGrid;
    workingGrid[r][c] = { ...workingGrid[r][c], isRevealed: true };
    if (workingGrid[r][c].neighborCount === 0 && !workingGrid[r][c].isMine) {
      const neighbors = getNeighbors(r, c, config.rows, config.cols);
      neighbors.forEach(n => { workingGrid = revealCell(n.r, n.c, workingGrid); });
    }
    if (!currentGrid) { setGrid(workingGrid); checkWin(workingGrid); }
    return workingGrid;
  };

  const checkWin = (currentGrid) => {
    let revealedCount = 0;
    for (let r = 0; r < config.rows; r++) { for (let c = 0; c < config.cols; c++) { if (currentGrid[r][c].isRevealed) revealedCount++; } }
    if (revealedCount === (config.rows * config.cols) - config.mines) handleGameEnd(true);
  };

  const handleGameEnd = async (win) => {
    setGameOver(true);
    setView(win ? 'game_over_won' : 'game_over_lost');
    const finalGrid = grid.map(row => row.map(cell => cell.isMine ? { ...cell, isRevealed: true } : cell));
    setGrid(finalGrid);
    if (view.includes('online')) {
        const field = view === 'playing_online_host' ? 'hostStatus' : 'guestStatus';
        await updateDoc(doc(db, "matches_minesweeper", roomCode), { [field]: win ? 'won' : 'lost' });
    }
    if (win && view === 'playing_ai') {
        const totalScore = (config.mines * 50) + (lives * 200);
        setScore(totalScore);
        saveScore(totalScore);
    }
  };

  // --- ADS & DB ---
  const watchAd = (type) => { setAdState({ active: true, type, timer: 5 }); };
  useEffect(() => {
    let interval = null;
    if (adState.active && adState.timer > 0) interval = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active && adState.timer === 0) { clearInterval(interval); finishAd(); }
    return () => clearInterval(interval);
  }, [adState.active, adState.timer]);

  const finishAd = () => {
    setAdState(p => ({ ...p, active: false }));
    if (adState.type === 'life') {
      setLives(p => p + 1);
      if (view === 'game_over_lost') {
        const resetGrid = grid.map(row => row.map(cell => cell.isMine ? { ...cell, isRevealed: false, exploded: false } : cell));
        setGrid(resetGrid);
        setGameOver(false);
        setView('playing_ai');
      }
    } 
    else if (adState.type === 'hint') {
      const safeSpots = [];
      grid.forEach((row, r) => row.forEach((cell, c) => { if (!cell.isMine && !cell.isRevealed && !cell.isFlagged) safeSpots.push({r, c}); }));
      if (safeSpots.length > 0) {
          const randomSpot = safeSpots[Math.floor(Math.random() * safeSpots.length)];
          revealCell(randomSpot.r, randomSpot.c);
      }
    }
  };

  const saveScore = async (finalScore) => {
    if (user) {
      try { await addDoc(collection(db, "scores_minesweeper"), { uid: user.uid, displayName: user.name, score: finalScore, difficulty: config.name, date: serverTimestamp() }); fetchLeaderboard(); } catch (e) {}
    }
  };
  const fetchLeaderboard = async () => {
    try { const q = query(collection(db, "scores_minesweeper"), orderBy("score", "desc"), limit(5)); const s = await getDocs(q); setLeaderboard(s.docs.map(doc => doc.data())); } catch (e) {}
  };

  const renderCell = (cell, r, c) => {
    if (!cell.isRevealed) return cell.isFlagged ? <Flag className="w-5 h-5 text-red-500" /> : null;
    if (cell.isMine) return <Bomb className={`w-6 h-6 ${cell.exploded ? 'text-red-500 animate-pulse' : 'text-slate-800'}`} />;
    if (cell.neighborCount > 0) {
        const colors = ['text-blue-400', 'text-green-400', 'text-red-400', 'text-purple-400', 'text-yellow-400', 'text-cyan-400', 'text-pink-400', 'text-slate-400'];
        return <span className={`font-black text-lg ${colors[cell.neighborCount-1]}`}>{cell.neighborCount}</span>;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-4 font-mono text-white select-none">
      
      {adState.active && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-6">
           <Video className="w-16 h-16 text-cyan-400 mb-4 animate-bounce" />
           <h2 className="text-2xl font-black mb-2">PUBLICIDAD</h2>
           <p className="text-sm text-slate-400 mb-4">Calmando a Chami...</p>
           <div className="text-4xl font-black text-yellow-400 mb-6">{adState.timer}s</div>
        </div>
      )}

      <div className="w-full max-w-md flex justify-between items-center mb-6 z-10">
        <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:bg-slate-800 transition">
             <ArrowLeft className="w-5 h-5 text-slate-400"/>
        </button>
        
        {view.includes('playing') && (
            <div className="flex gap-4 items-center bg-slate-900/80 px-4 py-2 rounded-full border border-slate-700">
                {view === 'playing_ai' && (
                    <div className="flex items-center gap-1 mr-2 border-r border-slate-700 pr-4">
                        {[...Array(lives)].map((_, i) => <Heart key={i} className="w-4 h-4 text-red-500 fill-red-500" />)}
                        {lives < 3 && !gameOver && <button onClick={() => watchAd('life')} className="ml-1 p-1 bg-green-500/20 rounded-full"><Play className="w-3 h-3 text-green-500 fill-current"/></button>}
                    </div>
                )}
                <div className="flex items-center gap-2 text-yellow-400 font-bold">
                    <Flag className="w-4 h-4"/> {minesLeft}
                </div>
            </div>
        )}
      </div>

      <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-pink-500 to-purple-500 mb-2 text-center tracking-tighter italic drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">
        CHAMI LA TÓXICA
      </h1>

      {view === 'menu' && (
        <div className="w-full max-w-md grid gap-4 animate-in zoom-in">
           <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group">
              <Skull className="absolute top-2 right-2 w-20 h-20 text-pink-900/20 group-hover:text-pink-500/20 transition"/>
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Cpu className="w-5 h-5 text-pink-400"/> MODO 1 JUGADOR</h2>
              <p className="text-xs text-slate-400 mb-4">¿Podrás desactivar todas las bombas sin que Chami se enfade?</p>
              <div className="flex gap-2">
                 {Object.keys(DIFFICULTIES).map(key => (
                     <button key={key} onClick={() => startAiGame(key)} className={`flex-1 py-2 rounded-lg text-[9px] font-bold border transition ${key === 'hard' ? 'bg-red-900/30 border-red-500/50 text-red-400' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>{DIFFICULTIES[key].name}</button>
                 ))}
              </div>
           </div>

           <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group">
              <Users className="absolute top-2 right-2 w-20 h-20 text-blue-900/20 group-hover:text-blue-500/20 transition"/>
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Users className="w-5 h-5 text-blue-400"/> DUELO DE TÓXICOS</h2>
              <p className="text-xs text-slate-400 mb-4">Reta a un amigo. 1 sola vida. El que explote pierde.</p>
              <div className="flex gap-2 mb-2">
                 <button onClick={() => createRoom('medium')} className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-xs hover:bg-blue-500 shadow-lg">CREAR SALA</button>
              </div>
              <div className="flex gap-2">
                 <input type="number" id="roomInput" placeholder="CÓDIGO..." className="flex-1 bg-black border border-slate-700 rounded-xl px-4 text-center text-sm font-bold outline-none focus:border-blue-500"/>
                 <button onClick={() => joinRoom(document.getElementById('roomInput').value)} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-700">UNIRSE</button>
              </div>
           </div>
           
           {leaderboard.length > 0 && (
             <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex gap-1"><Trophy className="w-3 h-3"/> SUPERVIVIENTES</h3>
                {leaderboard.map((s,i) => (
                    <div key={i} className="flex justify-between text-[10px] text-slate-400 border-b border-white/5 py-1"><span>#{i+1} {s.displayName}</span><span className="text-pink-500">{s.score}</span></div>
                ))}
             </div>
           )}
        </div>
      )}

      {view.includes('playing') && (
        <div className="w-full max-w-md flex flex-col items-center animate-in zoom-in">
           {view === 'playing_online_host' && (
               <div className="mb-4 bg-blue-500/10 text-blue-400 px-4 py-2 rounded-lg border border-blue-500/30 text-center w-full">
                   <p className="text-[10px] font-bold uppercase">CÓDIGO SALA: <span className="text-xl font-black text-white ml-2 select-all">{roomCode}</span></p>
               </div>
           )}

           <div className="flex gap-2 w-full mb-4">
               {view === 'playing_ai' && !gameOver && (
                   <button onClick={() => watchAd('hint')} className="flex-1 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-500 text-xs font-bold flex items-center justify-center gap-1 hover:bg-yellow-500/20 transition">
                       <Lightbulb className="w-4 h-4"/> PISTA (VIDEO)
                   </button>
               )}
               <button onClick={() => setFlagMode(!flagMode)} className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition border ${flagMode ? 'bg-red-500 text-white border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                   <Flag className="w-4 h-4"/> {flagMode ? 'BANDERA ACTIVADA' : 'REVELAR'}
               </button>
           </div>

           <div className="bg-slate-900 p-2 rounded-xl border border-slate-700 shadow-2xl inline-block">
               <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${config.cols}, 1fr)` }}>
                   {grid.map((row, r) => row.map((cell, c) => (
                       <button
                           key={`${r}-${c}`}
                           onClick={() => handleCellClick(r, c)}
                           onContextMenu={(e) => { e.preventDefault(); toggleFlag(r, c); }}
                           className={`w-8 h-8 sm:w-10 sm:h-10 rounded-md flex items-center justify-center text-sm font-bold transition-all active:scale-95
                               ${!cell.isRevealed ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700' : 'bg-slate-950 border border-slate-900'}
                               ${cell.isRevealed && cell.isMine ? 'bg-red-900/50' : ''}
                           `}
                       >
                           {renderCell(cell, r, c)}
                       </button>
                   )))}
               </div>
           </div>
        </div>
      )}

      {(view === 'game_over_won' || view === 'game_over_lost') && (
             <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl flex flex-col items-center w-full max-w-sm text-center">
                   {view === 'game_over_won' ? <Trophy className="w-20 h-20 text-yellow-400 mb-4 animate-bounce"/> : <Bomb className="w-20 h-20 text-red-500 mb-4 animate-pulse"/>}
                   <h2 className="text-3xl font-black text-white mb-2">{view === 'game_over_won' ? '¡SOBREVIVISTE!' : '¡TE INTOXICASTE!'}</h2>
                   
                   {view === 'game_over_won' && view === 'playing_ai' && (
                       <div className="mb-6">
                           <span className="text-slate-400 text-sm">Puntuación: </span>
                           <span className="text-2xl font-black text-yellow-400">{score}</span>
                       </div>
                   )}
                   
                   {view === 'game_over_lost' && (
                        <p className="text-slate-400 mb-6">Chami te ha montado un drama...</p>
                   )}

                   <div className="flex flex-col gap-2 w-full">
                        {view === 'game_over_lost' && view === 'playing_ai' && lives <= 0 && (
                            <button onClick={() => watchAd('life')} className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-green-500 animate-pulse">
                                <Play className="w-4 h-4 fill-current"/> PEDIR PERDÓN (VER VIDEO)
                            </button>
                        )}
                      <button onClick={() => setView('menu')} className="w-full py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4"/> VOLVER AL MENÚ
                      </button>
                   </div>
                </div>
             </div>
      )}

      <div className="mt-auto w-full max-w-md pt-4 opacity-75"><AdSpace type="banner" /><GameChat gameId="global_chami" gameName="CHAMI LA TÓXICA" /></div>
    </div>
  );
}