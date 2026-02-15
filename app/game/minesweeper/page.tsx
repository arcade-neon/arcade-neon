// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Bomb, Flag, Timer, Trophy, RefreshCw, 
  Skull, Users, Coins, Copy, PlayCircle, Lightbulb, X, ShieldAlert, CheckCircle2, Loader2, AlertCircle
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- CONFIGURACIÓN DE NIVELES ---
const LEVELS = {
  training: { 
    id: 'training', label: 'NIVEL 1', sub: 'NOVATO', 
    rows: 9, cols: 9, mines: 10, scoreBase: 5000, 
    color: 'text-emerald-400', border: 'border-emerald-500', bg_grad: 'from-emerald-500/10 to-emerald-900/5' 
  },
  tactical: { 
    id: 'tactical', label: 'NIVEL 2', sub: 'AVANZADO', 
    rows: 16, cols: 16, mines: 40, scoreBase: 15000, 
    color: 'text-blue-400', border: 'border-blue-500', bg_grad: 'from-blue-500/10 to-blue-900/5' 
  },
  expert: { 
    id: 'expert', label: 'NIVEL 3', sub: 'MAESTRO', 
    rows: 16, cols: 30, mines: 99, scoreBase: 30000, 
    color: 'text-amber-400', border: 'border-amber-500', bg_grad: 'from-amber-500/10 to-amber-900/5' 
  },
  master: { 
    id: 'master', label: 'NIVEL 4', sub: 'LEYENDA', 
    rows: 20, cols: 30, mines: 145, scoreBase: 50000, 
    color: 'text-purple-400', border: 'border-purple-500', bg_grad: 'from-purple-500/10 to-purple-900/5' 
  },
  nightmare: { 
    id: 'nightmare', label: 'NIVEL 5', sub: 'IMPOSIBLE', 
    rows: 24, cols: 30, mines: 170, scoreBase: 75000, 
    color: 'text-rose-500', border: 'border-rose-500', bg_grad: 'from-rose-500/10 to-rose-900/5' 
  }
};

const NUM_COLORS = [
  '', 
  'text-blue-400 font-black drop-shadow-md',    
  'text-emerald-400 font-black drop-shadow-md', 
  'text-red-500 font-black drop-shadow-md',      
  'text-violet-400 font-black drop-shadow-md',  
  'text-amber-500 font-black drop-shadow-md',   
  'text-cyan-400 font-black drop-shadow-md',    
  'text-white font-black drop-shadow-md',       
  'text-gray-500 font-black drop-shadow-md'     
];

const MAX_LIVES = 5;

// --- UTILS (Generador de Aleatoriedad Sincronizada) ---
const mulberry32 = (a) => {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// --- COMPONENTE VIDEO AD ---
const VideoAdOverlay = ({ onComplete, onCancel }) => {
    const [timer, setTimer] = useState(5);
    useEffect(() => {
        if(timer > 0) {
            const i = setInterval(() => setTimer(t => t - 1), 1000);
            return () => clearInterval(i);
        } else {
            const t = setTimeout(onComplete, 500);
            return () => clearTimeout(t);
        }
    }, [timer, onComplete]);

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in backdrop-blur-xl">
            <div className="absolute top-6 right-6">
                <button onClick={onCancel} className="text-white/50 hover:text-white flex items-center gap-2 text-xs uppercase tracking-widest"><X className="w-4 h-4"/> Cancelar</button>
            </div>
            <div className="w-full max-w-md aspect-video bg-slate-900 rounded-3xl border border-slate-700 relative overflow-hidden flex flex-col items-center justify-center p-8 shadow-2xl">
                <PlayCircle className="w-16 h-16 text-yellow-400 mb-6 animate-pulse"/>
                <h3 className="text-xl font-black text-white mb-2 tracking-widest uppercase">Publicidad</h3>
                <p className="text-slate-400 text-xs mb-8 text-center uppercase tracking-wide">Desencriptando sector...<br/><span className="text-cyan-400 font-bold font-mono text-2xl mt-2 block">{timer}s</span></p>
                <div className="w-64 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 transition-all duration-1000 ease-linear" style={{ width: `${((5-timer)/5)*100}%` }}></div>
                </div>
            </div>
        </div>
    );
};

export default function MinesweeperPro() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);
  
  // ESTADOS
  const [view, setView] = useState('menu'); 
  const [currentLevel, setCurrentLevel] = useState(LEVELS.training);
  const [grid, setGrid] = useState([]); 
  const [gameState, setGameState] = useState('idle');
  const [gameMode, setGameMode] = useState('solo'); 
  const [flagMode, setFlagMode] = useState(false);
  
  // METRICAS
  const [timer, setTimer] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [flagsCount, setFlagsCount] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [isFirstClick, setIsFirstClick] = useState(true);
  
  // RANKING STATUS
  const [saveStatus, setSaveStatus] = useState('idle'); // idle, saving, success, error, no-user
  
  // ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [opName, setOpName] = useState('Rival');
  
  // EXTRAS
  const [leaderboard, setLeaderboard] = useState([]);
  const [showAd, setShowAd] = useState(false);
  const [shake, setShake] = useState(false);
  
  // FIX: Referencia para el generador de números aleatorios (Sincronización PvP)
  const rand = useRef(Math.random);

  const fetchLeaderboard = async () => { 
      try { 
          const q = query(collection(db, "scores_minesweeper"), orderBy("score", "desc"), limit(5)); 
          const s = await getDocs(q); 
          setLeaderboard(s.docs.map(d=>d.data())); 
      } catch(e) { console.error("Error leyendo ranking:", e); } 
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ? { uid: u.uid, name: u.displayName || 'Agente' } : null));
    fetchLeaderboard();
    return () => unsub();
  }, []);

  useEffect(() => {
    let interval;
    if (gameState === 'playing' && !showAd) interval = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [gameState, showAd]);

  // --- ONLINE SYNC ---
  useEffect(() => {
      if (view !== 'lobby' && view !== 'playing') return;
      if (!roomCode) return;

      const unsub = onSnapshot(doc(db, "matches_minesweeper", roomCode), (docSnap) => {
          if (docSnap.exists()) {
              const data = docSnap.data();
              if (isHost) setOpName(data.guestName || 'Esperando...');
              else setOpName(data.hostName || 'Host');

              if (data.status === 'playing' && gameState === 'idle') {
                  initGame('tactical', data.seed);
              }
              if (data.winner) {
                  setGameState(data.winner === user?.uid ? 'won' : 'lost');
              }
          }
      });
      
      // FIX: Estabilidad al salir del chat/juego
      return () => {
          setTimeout(() => {
              if (unsub && typeof unsub === 'function') {
                  unsub();
              }
          }, 0);
      };
  }, [view, roomCode, isHost, gameState]);

  // --- FUNCIÓN DE GUARDADO ROBUSTA ---
  const saveScore = async (scoreToSave) => { 
      if (!user) {
          setSaveStatus('no-user');
          return;
      }
      
      setSaveStatus('saving'); 
      try {
          await addDoc(collection(db, "scores_minesweeper"), { 
              uid: user.uid, 
              displayName: user.name, 
              score: scoreToSave, 
              difficulty: currentLevel.id, 
              time: timer, 
              date: serverTimestamp() 
          }); 
          
          setSaveStatus('success'); 
          setTimeout(() => fetchLeaderboard(), 1000); 
      } catch(e) {
          console.error("Error guardando record:", e);
          setSaveStatus('error'); 
      }
  };

  // --- GAMEPLAY ---
  const initGame = (levelKey, seed = null) => {
      const lvl = LEVELS[levelKey];
      setCurrentLevel(lvl);
      setGameMode(seed ? 'online' : 'solo');
      
      // FIX: Configurar el generador aleatorio (Semilla compartida o Aleatorio local)
      if (seed) {
          rand.current = mulberry32(seed);
      } else {
          rand.current = Math.random;
      }
      
      const rows = lvl.rows; const cols = lvl.cols;
      const newGrid = Array(rows).fill().map(() => Array(cols).fill({ isMine: false, isOpen: false, isFlagged: false, count: 0, exploded: false }));
      
      setGrid(newGrid);
      setLives(MAX_LIVES);
      setTimer(0);
      setFlagsCount(lvl.mines);
      setIsFirstClick(true);
      setFlagMode(false);
      setSaveStatus('idle'); 
      setGameState('playing');
      setView('playing');
      playSound('start');
  };

  const placeMines = (startR, startC) => {
      const { rows, cols, mines } = currentLevel;
      let newGrid = JSON.parse(JSON.stringify(grid));
      
      let positions = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (Math.abs(r - startR) <= 1 && Math.abs(c - startC) <= 1) continue; else positions.push({ r, c });
      
      // FIX: Usar rand.current() en lugar de Math.random() para sincronización online
      for (let i = positions.length - 1; i > 0; i--) { 
          const j = Math.floor(rand.current() * (i + 1)); 
          [positions[i], positions[j]] = [positions[j], positions[i]]; 
      }
      
      for (let i = 0; i < mines; i++) if (positions[i]) newGrid[positions[i].r][positions[i].c].isMine = true;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!newGrid[r][c].isMine) { let count = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (r+i>=0 && r+i<rows && c+j>=0 && c+j<cols && newGrid[r+i][c+j].isMine) count++; newGrid[r][c].count = count; }
      return newGrid;
  };

  const handleInteraction = (r, c) => {
      if (flagMode) toggleFlag(null, r, c); else handleCellClick(r, c);
  };

  const handleCellClick = (r, c) => {
      if (gameState !== 'playing' || grid[r][c].isFlagged || grid[r][c].isOpen) return;

      let currentGrid = [...grid];
      if (isFirstClick) { currentGrid = placeMines(r, c); setIsFirstClick(false); }

      if (currentGrid[r][c].isMine) {
          triggerShake();
          if (lives > 1) {
              setLives(l => l - 1);
              currentGrid[r][c].isOpen = true;
              currentGrid[r][c].exploded = true;
              setGrid(currentGrid);
              playSound('error');
          } else {
              setLives(0);
              revealAll(currentGrid);
              handleGameOver(false);
          }
          return;
      }

      revealRecursive(currentGrid, r, c);
      setGrid(currentGrid);
      playSound('click');
      checkWin(currentGrid);
  };

  const revealRecursive = (board, r, c) => {
      if (r<0 || r>=currentLevel.rows || c<0 || c>=currentLevel.cols || board[r][c].isOpen || board[r][c].isFlagged) return;
      board[r][c].isOpen = true;
      if (board[r][c].count === 0) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) revealRecursive(board, r+i, c+j);
  };

  const toggleFlag = (e, r, c) => {
      if (e) e.preventDefault();
      if (gameState !== 'playing' || grid[r][c].isOpen) return;
      const newGrid = [...grid];
      if (newGrid[r][c].isFlagged) { newGrid[r][c].isFlagged = false; setFlagsCount(f => f + 1); } 
      else { newGrid[r][c].isFlagged = true; setFlagsCount(f => f - 1); playSound('flag'); }
      setGrid(newGrid);
  };

  const revealAll = (board) => {
      board.forEach(row => row.forEach(cell => { if (cell.isMine) cell.isOpen = true; }));
      setGrid(board);
  };

  const checkWin = (board) => {
      let opened = 0;
      board.forEach(row => row.forEach(cell => { if(cell.isOpen && !cell.isMine) opened++; }));
      if (opened === (currentLevel.rows * currentLevel.cols - currentLevel.mines)) {
          handleGameOver(true);
      }
  };

  // --- FIN DE JUEGO & TRIGGER GUARDADO ---
  const handleGameOver = (won) => {
      setGameState(won ? 'won' : 'lost');
      playSound(won ? 'win' : 'explosion');
      
      const score = Math.max(100, currentLevel.scoreBase - (timer * 5) - ((MAX_LIVES - lives) * 200));
      setFinalScore(score);

      // GUARDADO AUTOMÁTICO SI GANAS EN MODO SOLO
      if (gameMode === 'solo' && won) {
          addCoins(currentLevel.scoreBase / 100, "Misión Cumplida");
          saveScore(score); 
      } else if (gameMode === 'online') {
          const updateData = { [`${isHost?'host':'guest'}Score`]: score };
          if (won) updateData.winner = user.uid; 
          updateDoc(doc(db, "matches_minesweeper", roomCode), updateData);
      }
  };

  const requestHint = () => { if(gameState === 'playing') setShowAd(true); };
  const onAdCompleted = () => { setShowAd(false); let newGrid = [...grid]; let actionDone = false; for (let r = 0; r < currentLevel.rows; r++) { for (let c = 0; c < currentLevel.cols; c++) { if (!newGrid[r][c].isMine && !newGrid[r][c].isOpen && newGrid[r][c].count === 0) { revealRecursive(newGrid, r, c); actionDone = true; break; } } if(actionDone) break; } if (!actionDone) { for (let i = 0; i < 100; i++) { const r = Math.floor(Math.random() * currentLevel.rows); const c = Math.floor(Math.random() * currentLevel.cols); if (!newGrid[r][c].isMine && !newGrid[r][c].isOpen) { revealRecursive(newGrid, r, c); actionDone = true; break; } } } if (actionDone) { setGrid(newGrid); playSound('powerup'); checkWin(newGrid); } };
  
  const createRoom = async () => { if (!user) return alert("Inicia sesión"); if (betType === 'money' && coins < betAmount) return alert("Fondos insuficientes"); await spendCoins(betAmount, "Apuesta Minesweeper"); const seed = Math.floor(Math.random() * 1000000); const code = Math.floor(1000 + Math.random() * 9000).toString(); await setDoc(doc(db, "matches_minesweeper", code), { host: user.uid, hostName: user.name, guest: null, guestName: '...', seed, status: 'waiting', betInfo: { type: betType, value: betType==='money'?betAmount:betText }, createdAt: serverTimestamp() }); setRoomCode(code); setIsHost(true); setView('lobby'); };
  const joinRoom = async (c) => { if (!user) return alert("Inicia sesión"); const ref = doc(db, "matches_minesweeper", c); const snap = await getDoc(ref); if (!snap.exists()) return alert("Sala no encontrada"); const data = snap.data(); if (data.betInfo?.type === 'money' && coins < data.betInfo.value) return alert("Fondos insuficientes"); if (data.betInfo?.type === 'money') await spendCoins(data.betInfo.value, "Apuesta Minesweeper"); await updateDoc(ref, { guest: user.uid, guestName: user.name }); setRoomCode(c); setIsHost(false); setView('lobby'); };
  const startMatch = async () => { await updateDoc(doc(db, "matches_minesweeper", roomCode), { status: 'playing' }); };
  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 500); };
  const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;

  return (
    <div className={`min-h-screen bg-[#020617] flex flex-col items-center p-2 font-mono text-white select-none overflow-hidden relative ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-black"></div>
        <div className="fixed inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#0ea5e9 1px, transparent 1px), linear-gradient(90deg, #0ea5e9 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        {showAd && <VideoAdOverlay onComplete={onAdCompleted} onCancel={() => setShowAd(false)} />}

        {/* HEADER */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-6 z-10 mt-4 px-2">
            <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-cyan-500 transition shadow-lg"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
            <div className="text-center">
                <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 tracking-tighter drop-shadow-lg italic">BUSCAMINAS</h1>
                <p className="text-[10px] text-cyan-500/50 font-bold tracking-[0.5em] uppercase">PRO EDITION</p>
            </div>
            <div className="w-10"></div>
        </div>

        {view === 'menu' ? (
            <div className="w-full max-w-md grid gap-6 animate-in zoom-in z-10 px-2 mt-4">
                <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-2xl">
                    <h2 className="text-xs font-bold text-slate-400 mb-6 flex gap-2 items-center tracking-widest uppercase"><ShieldAlert className="w-4 h-4 text-emerald-500"/> Selección de Nivel</h2>
                    <div className="space-y-3">
                        {Object.entries(LEVELS).map(([key, lvl]) => (
                            <button key={key} onClick={() => initGame(key)} className={`w-full group relative overflow-hidden p-4 bg-slate-800/60 hover:bg-slate-800 rounded-xl border-l-4 ${lvl.border} flex justify-between items-center transition-all hover:scale-[1.02] shadow-lg`}>
                                <div className="text-left z-10"><span className={`block font-black text-sm ${lvl.color}`}>{lvl.label}</span><span className="text-[10px] text-slate-500 font-mono">{lvl.sub}</span></div>
                                <div className="text-right z-10"><span className="block text-[10px] text-slate-500 uppercase">Máx Pts</span><span className="font-bold text-white font-mono">{lvl.scoreBase.toLocaleString()}</span></div>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-2xl">
                    <h2 className="text-xs font-bold text-slate-400 mb-4 flex gap-2 items-center tracking-widest uppercase"><Users className="w-4 h-4 text-cyan-500"/> Duelo Online</h2>
                    <div className="flex gap-2 mb-4 bg-black/40 p-2 rounded-lg items-center justify-between px-4"><span className="text-xs font-bold text-slate-400">APUESTA:</span><input type="number" value={betAmount} onChange={(e)=>setBetAmount(Number(e.target.value))} className="w-24 bg-transparent text-right font-black text-yellow-400 outline-none border-b border-white/20"/><Coins className="w-4 h-4 text-yellow-500"/></div>
                    <div className="flex gap-2"><button onClick={createRoom} className="flex-1 py-3 bg-cyan-700 rounded-lg font-bold text-xs hover:bg-cyan-600 text-white shadow-lg">CREAR</button><input id="code" placeholder="CÓDIGO" className="w-24 bg-black/50 border border-slate-600 rounded-lg text-center font-mono text-cyan-400 font-bold focus:border-cyan-500 outline-none"/><button onClick={() => joinRoom(document.getElementById('code').value)} className="flex-1 py-3 bg-slate-800 rounded-lg font-bold text-xs border border-slate-600 hover:border-white text-slate-300">UNIRSE</button></div>
                </div>
                {leaderboard.length > 0 && <div className="bg-black/30 p-6 rounded-2xl border border-white/5"><h3 className="text-[10px] text-slate-500 uppercase font-bold mb-4 text-center tracking-widest flex justify-center gap-2"><Trophy className="w-3 h-3 text-yellow-500"/> Ranking</h3>{leaderboard.map((s, i) => (<div key={i} className="flex justify-between items-center text-xs py-2 border-b border-white/5 last:border-0 text-slate-400 font-mono"><span className="font-bold text-white flex gap-3"><span className={`${i===0?'text-yellow-400':i===1?'text-gray-300':'text-orange-400'}`}>#{i+1}</span> {s.displayName}</span><span className="text-cyan-400">{s.score.toLocaleString()}</span></div>))}</div>}
            </div>
        ) : view === 'lobby' ? (
            <div className="w-full max-w-sm bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 text-center shadow-2xl animate-in zoom-in z-10">
                <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto mb-6"/><h2 className="text-xl font-bold text-white mb-2">ESPERANDO RIVAL</h2>
                <div onClick={() => navigator.clipboard.writeText(roomCode)} className="bg-black/40 border border-dashed border-white/20 p-4 rounded-xl cursor-pointer hover:bg-black/60 transition group relative mb-6"><span className="text-4xl font-mono font-black text-cyan-400 tracking-[0.2em]">{roomCode}</span><div className="absolute -bottom-6 left-0 right-0 text-[10px] text-slate-500 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition"><Copy className="w-3 h-3"/> COPIAR</div></div>
                {isHost && <button onClick={startMatch} className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition">INICIAR MISIÓN</button>}
            </div>
        ) : (
            <div className="w-full flex flex-col items-center flex-grow z-10 pb-4 overflow-hidden relative">
                {/* HUD */}
                <div className="w-full max-w-4xl flex justify-between items-center mb-4 px-4 bg-slate-900/90 backdrop-blur-md py-3 rounded-2xl border border-slate-700 shadow-lg relative z-20">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center"><span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Tiempo</span><div className="text-xl font-mono font-bold text-white flex gap-1"><Timer className="w-4 h-4 mt-1 text-cyan-500"/> {formatTime(timer)}</div></div>
                        <div className="w-[1px] h-8 bg-slate-700"></div>
                        <div className="flex flex-col items-center"><span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Blindaje</span><div className="flex gap-1 mt-1">{[...Array(MAX_LIVES)].map((_, i) => <div key={i} className={`w-3 h-3 rounded-sm transform rotate-45 border ${i < lives ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_5px_#10b981]' : 'bg-slate-800 border-slate-700'}`}></div>)}</div></div>
                    </div>
                    {gameMode==='online' && <div className="text-xs font-bold text-slate-400 uppercase border border-white/10 px-3 py-1 rounded bg-black/40">VS {opName}</div>}
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end"><span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Minas</span><div className="text-xl font-mono font-bold text-rose-400 flex gap-1">{flagsCount} <Bomb className="w-4 h-4 mt-1"/></div></div>
                    </div>
                </div>

                {/* BOTONES DE ACCIÓN */}
                <div className="w-full max-w-4xl flex justify-center gap-4 mb-4 px-2">
                    <button onClick={requestHint} className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-6 py-3 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-lg active:scale-95"><Lightbulb className="w-4 h-4"/> PISTA (VIDEO AD)</button>
                    <button onClick={() => setFlagMode(!flagMode)} className={`px-6 py-3 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-lg active:scale-95 border ${flagMode ? 'bg-yellow-500 text-black border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.4)] animate-pulse' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}`}><Flag className={`w-4 h-4 ${flagMode ? 'fill-black' : ''}`}/> {flagMode ? 'MODO BANDERA: ON' : 'MODO BANDERA: OFF'}</button>
                </div>

                {/* GRID */}
                <div className="flex-grow w-full overflow-auto flex justify-center items-start px-2 scrollbar-hide pb-20">
                    <div className="grid gap-[2px] bg-slate-900 border-4 border-slate-800 shadow-2xl p-2 rounded-xl select-none" style={{ gridTemplateColumns: `repeat(${currentLevel.cols}, minmax(0, 1fr))` }} onContextMenu={(e) => e.preventDefault()}>
                        {grid.map((row, r) => row.map((cell, c) => (
                            <div key={`${r}-${c}`} onClick={() => handleInteraction(r, c)} onContextMenu={(e) => toggleFlag(e, r, c)} className={`w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-md flex items-center justify-center text-lg cursor-pointer transition-all duration-100 relative shadow-sm ${cell.isOpen ? (cell.isMine ? (cell.exploded ? 'bg-red-600 text-white animate-pulse z-10 scale-110 shadow-lg border border-red-400' : 'bg-slate-800 border border-slate-700') : 'bg-[#0f172a] shadow-inner') : 'bg-gradient-to-b from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 border-t border-white/10 active:translate-y-[1px]'}`}>
                                {cell.isOpen ? (cell.isMine ? <Bomb className="w-5 h-5 text-white fill-current"/> : (cell.count > 0 && <span className={NUM_COLORS[cell.count]}>{cell.count}</span>)) : (cell.isFlagged && <Flag className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-md"/>)}
                            </div>
                        )))}
                    </div>
                </div>

                {/* GAME OVER MODAL */}
                {(gameState === 'won' || gameState === 'lost') && (
                    <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center animate-in zoom-in p-4 backdrop-blur-md">
                        <div className={`p-6 rounded-full border-4 mb-6 ${gameState==='won' ? 'border-yellow-500 bg-yellow-500/10' : 'border-red-600 bg-red-600/10'}`}>{gameState === 'won' ? <Trophy className="w-16 h-16 text-yellow-500 animate-bounce"/> : <Skull className="w-16 h-16 text-red-600"/>}</div>
                        <h2 className="text-5xl font-black text-white italic mb-2 tracking-tighter uppercase">{gameState === 'won' ? 'MISIÓN CUMPLIDA' : 'K.I.A.'}</h2>
                        
                        {gameState === 'won' ? (
                            <div className="text-center mb-8 bg-slate-900/50 p-6 rounded-2xl border border-white/10 w-full max-w-xs relative overflow-hidden">
                                <div className="flex justify-between text-xs text-slate-400 mb-2"><span>TIEMPO</span> <span className="text-white">{formatTime(timer)}</span></div>
                                <div className="flex justify-between text-xs text-slate-400 mb-2"><span>BLINDAJE</span> <span className="text-emerald-400">{lives}/{MAX_LIVES}</span></div>
                                <div className="border-t border-white/10 my-2"></div>
                                <div className="flex justify-between text-sm font-bold text-yellow-400 items-center">
                                    <span>PUNTUACIÓN</span> 
                                    <span className="flex items-center gap-2">
                                        {finalScore}
                                        {saveStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin text-blue-400"/>}
                                        {saveStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-green-400"/>}
                                        {saveStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-400"/>}
                                        {saveStatus === 'no-user' && <span className="text-xs text-red-400">(Guest)</span>}
                                    </span>
                                </div>
                                {saveStatus === 'saving' && <div className="mt-2 text-xs text-blue-400 animate-pulse bg-blue-900/20 py-1 rounded">Guardando datos en la red...</div>}
                                {saveStatus === 'success' && <div className="mt-2 text-xs text-green-400 bg-green-900/20 py-1 rounded">¡Récord Registrado!</div>}
                                {saveStatus === 'no-user' && <div className="mt-2 text-xs text-orange-400 bg-orange-900/20 py-1 rounded">Inicia sesión para guardar</div>}
                            </div>
                        ) : (<p className="text-red-400 font-mono mb-8 uppercase tracking-widest">DETONACIÓN CONFIRMADA</p>)}
                        
                        <div className="flex gap-4">
                            <button onClick={() => initGame(currentLevel.id)} disabled={saveStatus==='saving'} className="px-8 py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition flex items-center gap-2 uppercase tracking-widest text-sm shadow-lg disabled:opacity-50"><RefreshCw className="w-4 h-4"/> REINTENTAR</button>
                            <button onClick={() => setView('menu')} disabled={saveStatus==='saving'} className="px-8 py-4 bg-slate-800 text-white font-bold rounded-xl border border-slate-600 hover:bg-slate-700 transition uppercase tracking-widest text-sm disabled:opacity-50">ABORTAR</button>
                        </div>
                    </div>
                )}
            </div>
        )}
        <div className="mt-auto opacity-50 w-full max-w-md pt-4 relative z-10"><AdSpace type="banner" /><GameChat gameId={roomCode || "global_mines"} gameName="MINESWEEPER" /></div>
    </div>
  );
}