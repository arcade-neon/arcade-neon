// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Trophy, Timer, Eraser, Globe, Users, Loader2, Star, 
  Copy, Play, Lightbulb, PlayCircle, X, AlertTriangle, LayoutGrid, CheckCircle2, Coins
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';

// --- CONFIGURACIÓN ---
const BLANK = 0;
const MAX_MISTAKES = 3; // Lo bajé a 3 para hacerlo más desafiante, estilo arcade

// --- LÓGICA SUDOKU (CORE DEL USUARIO) ---
const isValid = (board, row, col, num) => {
  for (let x = 0; x < 9; x++) if (board[row][x] === num || board[x][col] === num) return false;
  const startRow = row - (row % 3), startCol = col - (col % 3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[i + startRow][j + startCol] === num) return false;
  return true;
};

const solveSudoku = (board) => {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === BLANK) {
        for (let num = 1; num <= 9; num++) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num;
            if (solveSudoku(board)) return true;
            board[row][col] = BLANK;
          }
        }
        return false;
      }
    }
  }
  return true;
};

const generateBoard = (difficulty) => {
  const board = Array(9).fill().map(() => Array(9).fill(BLANK));
  for (let i = 0; i < 9; i = i + 3) fillBox(board, i, i);
  solveSudoku(board);
  const solution = board.map(row => [...row]);
  
  let attempts;
  switch(difficulty) {
      case 'easy': attempts = 30; break;
      case 'medium': attempts = 45; break;
      case 'hard': attempts = 55; break;
      case 'expert': attempts = 64; break; 
      default: attempts = 45;
  }

  let count = attempts;
  while (count > 0) {
    let r = Math.floor(Math.random() * 9);
    let c = Math.floor(Math.random() * 9);
    if (board[r][c] !== BLANK) {
      board[r][c] = BLANK;
      count--;
    }
  }
  return { initial: board, solution, emptyCells: attempts };
};

const fillBox = (board, row, col) => {
  let num;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      do { num = Math.floor(Math.random() * 9) + 1; } while (!isSafeInBox(board, row, col, num));
      board[row + i][col + j] = num;
    }
  }
};

const isSafeInBox = (board, rowStart, colStart, num) => {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (board[rowStart + i][colStart + j] === num) return false;
  return true;
};

const generateGameId = () => Math.random().toString(36).substring(2, 6).toUpperCase();

const LEVELS = {
  easy: { id: 'easy', label: 'NIVEL 1', sub: 'NOVATO', bonus: 5000, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/50' },
  medium: { id: 'medium', label: 'NIVEL 2', sub: 'AVANZADO', bonus: 10000, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/50' },
  hard: { id: 'hard', label: 'NIVEL 3', sub: 'MAESTRO', bonus: 20000, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/50' },
  expert: { id: 'expert', label: 'NIVEL 4', sub: 'LEYENDA', bonus: 30000, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/50' }
};

// --- SIMULADOR DE ANUNCIO ---
const VideoAdOverlay = ({ onComplete }) => {
    const [timer, setTimer] = useState(5);
    useEffect(() => {
        if(timer > 0) {
            const i = setInterval(() => setTimer(t => t - 1), 1000);
            return () => clearInterval(i);
        } else {
            setTimeout(onComplete, 500);
        }
    }, [timer, onComplete]);

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in">
            <div className="w-full max-w-md aspect-video bg-slate-900 rounded-2xl border border-cyan-500/30 relative overflow-hidden flex flex-col items-center justify-center p-8 shadow-[0_0_50px_rgba(6,182,212,0.2)]">
                <PlayCircle className="w-16 h-16 text-cyan-500 mb-4 animate-pulse"/>
                <h3 className="text-xl font-black italic text-white mb-2 tracking-widest">PATROCINADOR</h3>
                <p className="text-cyan-400/80 text-sm mb-6 font-bold uppercase tracking-widest">Decodificando pista...</p>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-cyan-500 transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(6,182,212,0.8)]" style={{ width: `${((5-timer)/5)*100}%` }}></div>
                </div>
                <div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded-full text-[10px] uppercase font-bold text-white border border-white/10">
                    {timer > 0 ? `Cerrar en ${timer}s` : 'Recompensa Lista'}
                </div>
            </div>
        </div>
    );
};

export default function SudokuUltimate() {
  const [user, setUser] = useState(null);
  const { coins, addCoins } = useEconomy();
  
  const [view, setView] = useState('menu'); 
  const [gameMode, setGameMode] = useState('solo'); 

  const [board, setBoard] = useState([]);
  const [initialBoard, setInitialBoard] = useState([]);
  const [solution, setSolution] = useState([]);
  const [difficulty, setDifficulty] = useState('medium');
  const [emptyCellsTotal, setEmptyCellsTotal] = useState(0);
  const [selected, setSelected] = useState(null); 
  const [mistakes, setMistakes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [gameStatus, setGameStatus] = useState('idle'); 
  const [showAd, setShowAd] = useState(false);
  
  // MULTIJUGADOR
  const [gameId, setGameId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [opponentName, setOpponentName] = useState('Esperando...');
  const [opponentProgress, setOpponentProgress] = useState(0); // 0-100%
  const [isHost, setIsHost] = useState(false);
  
  const [leaderboard, setLeaderboard] = useState([]);
const [loadingRank, setLoadingRank] = useState(true);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUser(u ? { uid: u.uid, name: u.displayName || 'Maestro' } : null));
    fetchLeaderboard();
    return () => unsub();
  }, []);

  useEffect(() => {
    let interval = null;
    if (gameStatus === 'active' && !showAd) interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [gameStatus, showAd]);

  // SINC INTERFAZ ONLINE
  useEffect(() => {
    if (view !== 'lobby' && view !== 'playing') return;
    if (!gameId) return;

    const unsub = onSnapshot(doc(db, "matches_sudoku", gameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        if (isHost) {
            setOpponentName(data.guest?.name || 'Rival');
            setOpponentProgress(data.guestProgress || 0);
        } else {
            setOpponentName(data.host?.name || 'Creador');
            setOpponentProgress(data.hostProgress || 0);
        }

        if (data.status === 'playing' && gameStatus === 'idle' && data.boardStr) {
            try {
                const initial = JSON.parse(data.boardStr);
                const sol = JSON.parse(data.solutionStr);
                setBoard(initial.map(r => [...r]));
                setInitialBoard(initial.map(r => [...r]));
                setSolution(sol);
                setDifficulty('medium');
                
                // Contar celdas vacías para el progreso online
                let emptyCount = 0;
                initial.forEach(r => r.forEach(c => { if(c === BLANK) emptyCount++; }));
                setEmptyCellsTotal(emptyCount);

                setSeconds(0);
                setMistakes(0);
                setGameStatus('active');
                setGameMode('online');
                setView('playing');
            } catch (e) { console.error("Error sync board", e); }
        }

        if (data.winner) {
            setGameStatus(data.winner === user?.uid ? 'won' : 'lost');
        }
      }
    });
    return () => unsub();
  }, [gameId, view, gameStatus, user, isHost]);

  // ACTUALIZAR PROGRESO ONLINE
  const updateOnlineProgress = (currentBoard) => {
      if (gameMode !== 'online' || !gameId) return;
      let filled = 0;
      currentBoard.forEach((r, i) => r.forEach((c, j) => {
          if (initialBoard[i][j] === BLANK && c !== BLANK) filled++;
      }));
      const progress = Math.min(100, Math.floor((filled / emptyCellsTotal) * 100));
      updateDoc(doc(db, "matches_sudoku", gameId), { [isHost ? 'hostProgress' : 'guestProgress']: progress });
  };

  const startSoloGame = (diff) => {
      const { initial, solution, emptyCells } = generateBoard(diff);
      setBoard(initial.map(r => [...r]));
      setInitialBoard(initial.map(r => [...r]));
      setSolution(solution);
      setDifficulty(diff);
      setEmptyCellsTotal(emptyCells);
      setSeconds(0);
      setMistakes(0);
      setGameStatus('active');
      setGameMode('solo');
      setView('playing');
  };

  const handleCellInput = (num) => {
      if (gameStatus !== 'active' || !selected) return;
      const [r, c] = selected;
      
      if (num === 0) { 
          if (initialBoard[r][c] === BLANK) {
              const newBoard = [...board];
              newBoard[r][c] = BLANK;
              setBoard(newBoard);
          }
          return;
      }

      if (initialBoard[r][c] !== BLANK || board[r][c] !== BLANK) return;

      if (num === solution[r][c]) {
          const newBoard = [...board];
          newBoard[r][c] = num;
          setBoard(newBoard);
          updateOnlineProgress(newBoard);
          checkCompletion(newBoard);
      } else {
          const newMistakes = mistakes + 1;
          setMistakes(newMistakes);
          if (newMistakes >= MAX_MISTAKES) {
              setGameStatus('lost');
              if (gameMode === 'online') {
                  // Si tú pierdes por errores, el rival gana automáticamente
                  updateDoc(doc(db, "matches_sudoku", gameId), { winner: isHost ? 'guest_win' : 'host_win' });
              }
          }
      }
  };

  const checkCompletion = (currentBoard) => {
      let isFull = true;
      for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) if (currentBoard[i][j] === BLANK) isFull = false;
      
      if (isFull) {
          if (gameMode === 'online') {
              updateDoc(doc(db, "matches_sudoku", gameId), { winner: user.uid, [isHost ? 'hostProgress' : 'guestProgress']: 100 });
              setGameStatus('won');
          } else {
              const bonus = LEVELS[difficulty].bonus;
              const score = Math.max(0, bonus - (seconds * 5) - (mistakes * 200));
              setFinalScore(score);
              setGameStatus('won');
              saveScore(score);
              addCoins(Math.floor(score / 100), "Sudoku");
          }
      }
  };

  const requestHint = () => {
      if (gameStatus !== 'active') return;
      let target = selected;
      if (!target || board[target[0]][target[1]] !== BLANK) {
          for(let i=0; i<9; i++) {
              for(let j=0; j<9; j++) {
                  if(board[i][j] === BLANK) { target = [i, j]; setSelected([i, j]); break; }
              }
              if(target) break;
          }
      }
      if(target) setShowAd(true);
  };

  const onAdReward = () => {
      setShowAd(false);
      if (selected) {
          const [r, c] = selected;
          const num = solution[r][c];
          const newBoard = [...board];
          newBoard[r][c] = num;
          setBoard(newBoard);
          updateOnlineProgress(newBoard);
          checkCompletion(newBoard);
      }
  };

  const createMatch = async () => {
      if (!user) return alert("Inicia sesión primero");
      const id = generateGameId();
      await setDoc(doc(db, "matches_sudoku", id), {
          host: user, hostProgress: 0, guestProgress: 0, guest: null, status: 'waiting', createdAt: serverTimestamp()
      });
      setGameId(id);
      setIsHost(true);
      setView('lobby');
  };

  const joinMatch = async () => {
      if (!user) return alert("Inicia sesión");
      if (!joinId) return;
      const ref = doc(db, "matches_sudoku", joinId);
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data().status === 'waiting') {
          await updateDoc(ref, { guest: user, status: 'ready' });
          setGameId(joinId);
          setIsHost(false);
          setView('lobby');
      } else {
          alert("Sala no encontrada o en juego.");
      }
  };

  const startOnlineMatch = async () => {
      const { initial, solution, emptyCells } = generateBoard('medium');
      await updateDoc(doc(db, "matches_sudoku", gameId), {
          boardStr: JSON.stringify(initial), solutionStr: JSON.stringify(solution), status: 'playing'
      });
  };

  useEffect(() => {
      if (view === 'lobby' && gameId && user && isHost) {
          const unsub = onSnapshot(doc(db, "matches_sudoku", gameId), (snap) => {
              const d = snap.data();
              if (d && d.status === 'ready' && d.host.uid === user.uid) startOnlineMatch();
          });
          return () => unsub();
      }
  }, [view, gameId, isHost]);

  const saveScore = async (s) => {
      if(user) {
          await addDoc(collection(db, "scores_sudoku"), {
              uid: user.uid, displayName: user.name, score: s, difficulty, mistakes, time: seconds, date: serverTimestamp()
          });
          fetchLeaderboard();
      }
  };
  
const fetchLeaderboard = async () => {
    setLoadingRank(true);
    try {
        const q = query(collection(db, "scores_sudoku"), orderBy("score", "desc"), limit(5));
        const s = await getDocs(q);
        setLeaderboard(s.docs.map(d => d.data()));
    } catch (error) {
        console.error("Error al cargar ranking:", error);
    } finally {
        setLoadingRank(false);
    }
};

  const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-2 font-mono text-slate-200 select-none overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.05)_0%,transparent_100%)] pointer-events-none"></div>

        {showAd && <VideoAdOverlay onComplete={onAdReward} />}

{/* HEADER */}
        <div className="w-full max-w-lg flex justify-between items-center py-4 px-2 shrink-0 z-10 relative mt-2">
            <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 sm:p-3 bg-slate-900/50 rounded-full border border-slate-700 hover:border-cyan-500 transition shadow-lg"><ArrowLeft className="w-5 h-5"/></button>
            <div className="text-center">
                <h1 className="text-2xl sm:text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 tracking-tighter drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]">SUDOKU</h1>
                <p className="text-[8px] sm:text-[10px] text-cyan-500/80 font-bold tracking-[0.5em] uppercase">Lógica Digital</p>
            </div>
            
            <div className="bg-slate-900/90 backdrop-blur-md px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-yellow-500/30 flex items-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.1)]">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-md">
                    <Coins className="w-3 h-3 text-black fill-current" />
                </div>
                <span className="text-xs sm:text-sm font-black text-yellow-400 tabular-nums">{coins.toLocaleString()}</span>
            </div>
        </div>

        {/* VISTAS */}
        {view === 'menu' ? (
            <div className="w-full max-w-sm grid gap-4 animate-in fade-in zoom-in duration-300 z-10 px-2 py-4 flex-grow overflow-y-auto scrollbar-hide">
                <div className="bg-slate-900/80 backdrop-blur-xl p-5 rounded-[2rem] border border-cyan-500/20 shadow-2xl">
                    <h2 className="text-[10px] font-bold text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest"><Trophy className="w-3 h-3 text-yellow-500"/> Un Jugador</h2>
                    <div className="space-y-2">
                        {Object.values(LEVELS).map((lvl) => (
                            <button key={lvl.id} onClick={() => startSoloGame(lvl.id)} className={`w-full group relative overflow-hidden p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border-2 ${lvl.border} flex justify-between items-center transition-all shadow-lg active:scale-95`}>
                                <div className="text-left z-10">
                                    <span className={`block font-black text-sm italic ${lvl.color}`}>{lvl.label}</span>
                                    <span className="text-[8px] text-slate-500 font-bold tracking-widest uppercase">{lvl.sub}</span>
                                </div>
                                <div className="text-right z-10">
                                    <span className="block text-[8px] font-mono text-white opacity-40 uppercase tracking-widest">Recompensa</span>
                                    <span className="block font-bold text-yellow-500">{lvl.bonus.toLocaleString()}</span>
                                </div>
                                <div className={`absolute right-0 top-0 bottom-0 w-24 ${lvl.bg} skew-x-12 translate-x-4 group-hover:translate-x-0 transition-transform`}></div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-900/80 backdrop-blur-xl p-5 rounded-[2rem] border border-blue-500/20 shadow-2xl">
                    <h2 className="text-[10px] font-bold text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest"><Users className="w-3 h-3 text-blue-500"/> Duelo Online</h2>
                    <div className="flex flex-col gap-3">
                        <button onClick={createMatch} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-900/20 transition active:scale-95 flex justify-center items-center gap-2"><Globe className="w-4 h-4"/> CREAR SALA</button>
                        <div className="flex gap-2">
                            <input onChange={(e) => setJoinId(e.target.value.toUpperCase())} placeholder="CÓDIGO" maxLength={4} className="flex-1 bg-slate-950 border border-slate-700 rounded-xl text-center text-sm font-bold tracking-widest outline-none focus:border-blue-500 text-white"/>
                            <button onClick={joinMatch} className="px-5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-colors"><Play className="w-4 h-4 fill-current"/></button>
                        </div>
                    </div>
                </div>

<div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
    <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-3 text-center tracking-widest">Ranking Global</h3>
    {loadingRank ? (
        <Loader2 className="w-4 h-4 animate-spin text-cyan-500 mx-auto"/>
    ) : leaderboard.length > 0 ? (
        leaderboard.map((s, i) => (
            <div key={i} className="flex justify-between items-center text-[10px] py-1.5 border-b border-white/5 last:border-0 text-slate-400">
                <span className="font-bold text-white flex gap-2"><span>#{i+1}</span> {s.displayName}</span>
                <span className="font-black text-cyan-400">{s.score.toLocaleString()} PTS</span>
            </div>
        ))
    ) : (
        <p className="text-[10px] text-slate-500 text-center italic">Sé el primero en puntuar.</p>
    )}
</div>
            </div>
        ) : view === 'lobby' ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 z-10 animate-in fade-in w-full max-w-sm px-4">
                <div className="w-full bg-slate-900/80 backdrop-blur-xl p-8 rounded-[2.5rem] border border-cyan-500/30 text-center shadow-[0_0_30px_rgba(6,182,212,0.1)]">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-2 tracking-widest">Código de Duelo</p>
                    <h2 className="text-6xl font-black text-white tracking-[0.2em] mb-4 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">{gameId}</h2>
                    <button onClick={() => {navigator.clipboard.writeText(gameId); alert("Copiado");}} className="bg-cyan-500/10 px-6 py-2 rounded-full text-cyan-400 text-xs font-bold flex items-center gap-2 mx-auto border border-cyan-500/20 hover:bg-cyan-500/20 active:scale-95 transition-all"><Copy className="w-4 h-4"/> COPIAR</button>
                </div>
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-cyan-500"/>
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Esperando rival...</h2>
                </div>
            </div>
        ) : (
            <div className="w-full max-w-lg flex flex-col items-center flex-grow z-10 px-2 justify-center">
                
                {/* HUD DEL TABLERO */}
                <div className="w-full flex justify-between items-end mb-4 px-2 max-w-[420px]">
                    <div className="flex flex-col">
                        <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mb-1 flex items-center gap-1"><Timer className="w-3 h-3"/> TIEMPO</span>
                        <span className="text-xl font-black text-cyan-400 tabular-nums">{formatTime(seconds)}</span>
                    </div>
                    
                    {gameMode === 'online' ? (
                        <div className="flex flex-col items-end w-32">
                            <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">VS {opponentName.substring(0,8)}</span>
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                                <div className="h-full bg-blue-500 transition-all duration-300" style={{width: `${opponentProgress}%`}}></div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] text-slate-500 font-bold uppercase mb-1 tracking-widest flex items-center gap-1">ERRORES <AlertTriangle className="w-3 h-3 text-red-500"/></span>
                            <div className="flex gap-1.5 mt-1">
                                {[...Array(MAX_MISTAKES)].map((_, i) => (
                                    <div key={i} className={`w-2.5 h-2.5 rounded-sm ${i < mistakes ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]' : 'bg-slate-800'}`}></div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* TABLERO */}
                <div className="w-full max-w-[420px] aspect-square bg-[#0a0f1a] rounded-2xl border-4 border-[#1e293b] shadow-[0_0_50px_rgba(6,182,212,0.1)] p-1.5 relative overflow-hidden">
                    <div className="w-full h-full grid grid-cols-9 grid-rows-9 gap-px bg-[#1e293b] rounded-lg overflow-hidden border border-[#334155]">
                        {board.map((row, r) => row.map((cell, c) => {
                            const isInit = initialBoard[r][c] !== BLANK;
                            const isSel = selected && selected[0] === r && selected[1] === c;
                            const isRel = selected && !isSel && (selected[0] === r || selected[1] === c || (Math.floor(selected[0]/3)===Math.floor(r/3) && Math.floor(selected[1]/3)===Math.floor(c/3)));
                            const isSame = selected && cell !== BLANK && board[selected[0]][selected[1]] === cell && !isSel;
                            
                            // Bordes gruesos para definir los cuadrantes 3x3
                            let classes = "flex items-center justify-center text-xl sm:text-2xl cursor-pointer transition-colors select-none ";
                            if (c === 2 || c === 5) classes += "border-r-[3px] border-r-[#334155] ";
                            if (r === 2 || r === 5) classes += "border-b-[3px] border-b-[#334155] ";
                            
                            // Colores de interacción (Glassmorphism & Neon)
                            if (isSel) classes += "bg-cyan-600 text-white font-black shadow-[inset_0_0_15px_rgba(0,0,0,0.3)] z-10 ";
                            else if (isSame) classes += "bg-cyan-900/60 text-cyan-300 font-bold ";
                            else if (isRel) classes += "bg-slate-800/80 ";
                            else classes += "bg-[#0f172a] hover:bg-slate-800 ";

                            return (
                                <div key={`${r}-${c}`} onClick={() => { if(gameStatus==='active') setSelected([r,c]) }} className={classes}>
                                    <span className={isInit ? 'text-slate-400 font-bold' : isSel ? 'text-white' : 'text-cyan-400 font-black'}>{cell !== BLANK ? cell : ''}</span>
                                </div>
                            );
                        }))}
                    </div>
                </div>

                {/* BOTÓN PISTA (SOLO PVE) */}
                {gameMode === 'solo' && gameStatus === 'active' && (
                    <div className="w-full max-w-[420px] mt-4 mb-1">
                        <button onClick={requestHint} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900/80 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold tracking-widest uppercase hover:bg-yellow-900/30 active:scale-95 transition">
                            <Lightbulb className="w-4 h-4"/> Ver anuncio para 1 Pista
                        </button>
                    </div>
                )}

                {/* TECLADO NUMÉRICO PRO */}
                <div className="w-full max-w-[420px] mt-3">
                    <div className="grid grid-cols-5 gap-2 sm:gap-3 mb-2 sm:mb-3">
                        {[1, 2, 3, 4, 5].map(num => (
                            <button key={num} onPointerDown={(e) => {e.preventDefault(); handleCellInput(num)}} className="aspect-[4/3] sm:aspect-square bg-slate-800 hover:bg-cyan-900/50 border-b-4 border-slate-950 rounded-xl text-2xl font-black text-white active:border-b-0 active:translate-y-1 transition-all touch-manipulation shadow-lg active:bg-cyan-700">{num}</button>
                        ))}
                    </div>
                    <div className="grid grid-cols-5 gap-2 sm:gap-3">
                        {[6, 7, 8, 9].map(num => (
                            <button key={num} onPointerDown={(e) => {e.preventDefault(); handleCellInput(num)}} className="aspect-[4/3] sm:aspect-square bg-slate-800 hover:bg-cyan-900/50 border-b-4 border-slate-950 rounded-xl text-2xl font-black text-white active:border-b-0 active:translate-y-1 transition-all touch-manipulation shadow-lg active:bg-cyan-700">{num}</button>
                        ))}
                        <button onPointerDown={(e) => {e.preventDefault(); handleCellInput(0)}} className="aspect-[4/3] sm:aspect-square bg-rose-950/50 border border-rose-900/50 rounded-xl flex items-center justify-center text-rose-500 active:scale-90 transition-all touch-manipulation shadow-lg hover:bg-rose-900/50"><Eraser className="w-6 h-6"/></button>
                    </div>
                </div>

                {/* PANTALLA FIN DE PARTIDA */}
                {(gameStatus === 'won' || gameStatus === 'lost') && (
                    <div className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center animate-in zoom-in backdrop-blur-md px-4">
                        <div className={`p-8 rounded-full bg-gradient-to-br ${gameStatus==='won' ? 'from-yellow-500/20' : 'from-rose-500/20'} to-transparent mb-6 border ${gameStatus==='won' ? 'border-yellow-500/30' : 'border-rose-500/30'} shadow-2xl`}>
                            {gameStatus === 'won' ? <CheckCircle2 className="w-16 h-16 text-yellow-400 animate-bounce"/> : <AlertTriangle className="w-16 h-16 text-rose-500"/>}
                        </div>
                        <h2 className="text-5xl font-black text-white italic tracking-tighter mb-2 drop-shadow-lg">{gameStatus==='won' ? 'VICTORIA' : 'DERROTA'}</h2>
                        
                        {gameStatus === 'won' && gameMode === 'solo' ? (
                            <div className="text-center mb-10 bg-slate-900/50 p-6 rounded-2xl border border-white/10 w-full max-w-xs">
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Puntuación Final</p>
                                <p className="text-5xl font-black text-cyan-400 mb-2">{finalScore.toLocaleString()}</p>
                                <p className="text-xs text-yellow-500 font-bold flex items-center justify-center gap-1"><Coins className="w-3 h-3"/> +{Math.floor(finalScore/100)} Monedas</p>
                            </div>
                        ) : (
                            <div className="text-center mb-10"><p className="text-rose-400 font-bold uppercase tracking-widest">{gameMode === 'online' && gameStatus === 'lost' ? 'El rival terminó antes' : 'Demasiados errores'}</p></div>
                        )}
                        
                        <div className="flex flex-col gap-3 w-full max-w-xs">
                            <button onClick={() => { setView('menu'); setGameStatus('idle'); setBoard([]); setGameId(''); }} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 active:scale-95 transition shadow-lg text-sm">MENÚ PRINCIPAL</button>
                        </div>
                    </div>
                )}
            </div>
        )}

        <div className="mt-auto w-full max-w-md pt-4 opacity-50 relative z-10 mb-2">
            <AdSpace type="banner" />
            <GameChat gameId={gameMode === 'online' ? gameId : "global_sudoku"} gameName="SUDOKU" />
        </div>
    </div>
  );
}