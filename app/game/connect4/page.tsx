// @ts-nocheck
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, Trophy, Users, Cpu, Zap, ArrowDown, Brain, Crown, RotateCcw, 
  Coins, Activity, BarChart3, ShieldCheck, Loader2, Play
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, onSnapshot, serverTimestamp, setDoc, collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- CONSTANTES ---
const ROWS = 6;
const COLS = 7;
const P1 = 1; // Jugador (1)
const P2 = 2; // CPU (2)
const EMPTY = 0;

// --- MOTOR DE IA (MINIMAX + HEURÍSTICA) ---
const scorePosition = (board, piece) => {
    let score = 0;
    const centerArray = [];
    for (let r = 0; r < ROWS; r++) centerArray.push(board[r][3]);
    const centerCount = centerArray.filter(x => x === piece).length;
    score += centerCount * 3; // Priorizar centro

    // Horizontal
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            const window = [board[r][c], board[r][c+1], board[r][c+2], board[r][c+3]];
            score += evaluateWindow(window, piece);
        }
    }
    // Vertical
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS - 3; r++) {
            const window = [board[r][c], board[r+1][c], board[r+2][c], board[r+3][c]];
            score += evaluateWindow(window, piece);
        }
    }
    // Diagonal /
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            const window = [board[r][c], board[r+1][c+1], board[r+2][c+2], board[r+3][c+3]];
            score += evaluateWindow(window, piece);
        }
    }
    // Diagonal \
    for (let r = 0; r < ROWS - 3; r++) {
        for (let c = 0; c < COLS - 3; c++) {
            const window = [board[r+3][c], board[r+2][c+1], board[r+1][c+2], board[r][c+3]];
            score += evaluateWindow(window, piece);
        }
    }
    return score;
};

const evaluateWindow = (window, piece) => {
    let score = 0;
    const oppPiece = piece === P1 ? P2 : P1;
    const count = window.filter(x => x === piece).length;
    const empty = window.filter(x => x === EMPTY).length;
    const oppCount = window.filter(x => x === oppPiece).length;

    if (count === 4) score += 100;
    else if (count === 3 && empty === 1) score += 5;
    else if (count === 2 && empty === 2) score += 2;

    if (oppCount === 3 && empty === 1) score -= 4; // Bloquear es prioritario

    return score;
};

const getValidLocations = (board) => {
    const valid = [];
    for (let c = 0; c < COLS; c++) {
        if (board[0][c] === EMPTY) valid.push(c);
    }
    return valid;
};

const pickBestMove = (board, piece, difficulty) => {
    const validMoves = getValidLocations(board);
    
    // Nivel Fácil: Mucho azar
    if (difficulty === 1) {
        if (Math.random() < 0.4) return validMoves[Math.floor(Math.random() * validMoves.length)];
    }

    // Nivel Medio/Difícil: Minimax
    const depth = difficulty === 5 ? 4 : 2; // Profundidad de pensamiento
    let bestScore = -Infinity;
    let bestMove = validMoves[Math.floor(Math.random() * validMoves.length)];

    // Ordenar movimientos (Centro primero)
    validMoves.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));

    for (let col of validMoves) {
        const tempBoard = board.map(row => [...row]);
        dropPiece(tempBoard, col, piece);
        const score = minimax(tempBoard, depth, -Infinity, Infinity, false, piece);
        if (score > bestScore) {
            bestScore = score;
            bestMove = col;
        }
    }
    return bestMove;
};

const minimax = (board, depth, alpha, beta, maximizingPlayer, piece) => {
    const validMoves = getValidLocations(board);
    const oppPiece = piece === P1 ? P2 : P1;

    // Terminal nodes
    if (checkWinningMove(board, piece)) return 1000000; // Gané
    if (checkWinningMove(board, oppPiece)) return -1000000; // Perdí
    if (validMoves.length === 0) return 0; // Empate
    if (depth === 0) return scorePosition(board, piece); // Heurística

    if (maximizingPlayer) {
        let value = -Infinity;
        for (let col of validMoves) {
            const tempBoard = board.map(row => [...row]);
            dropPiece(tempBoard, col, piece);
            value = Math.max(value, minimax(tempBoard, depth - 1, alpha, beta, false, piece));
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break;
        }
        return value;
    } else {
        let value = Infinity;
        for (let col of validMoves) {
            const tempBoard = board.map(row => [...row]);
            dropPiece(tempBoard, col, oppPiece);
            value = Math.min(value, minimax(tempBoard, depth - 1, alpha, beta, true, piece));
            beta = Math.min(beta, value);
            if (beta <= alpha) break;
        }
        return value;
    }
};

const dropPiece = (board, col, piece) => {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === EMPTY) {
            board[r][col] = piece;
            return r;
        }
    }
    return -1;
};

const checkWinningMove = (board, piece) => {
    // Horizontal
    for (let c = 0; c < COLS - 3; c++)
        for (let r = 0; r < ROWS; r++)
            if (board[r][c] == piece && board[r][c+1] == piece && board[r][c+2] == piece && board[r][c+3] == piece) return true;
    // Vertical
    for (let c = 0; c < COLS; c++)
        for (let r = 0; r < ROWS - 3; r++)
            if (board[r][c] == piece && board[r+1][c] == piece && board[r+2][c] == piece && board[r+3][c] == piece) return true;
    // Diagonales
    for (let c = 0; c < COLS - 3; c++)
        for (let r = 0; r < ROWS - 3; r++) {
            if (board[r][c] == piece && board[r+1][c+1] == piece && board[r+2][c+2] == piece && board[r+3][c+3] == piece) return true;
            if (board[r][c+3] == piece && board[r+1][c+2] == piece && board[r+2][c+1] == piece && board[r+3][c] == piece) return true;
        }
    return false;
};

export default function Connect4Pro() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);
  const [view, setView] = useState('menu');

  // GAME STATES
  const [board, setBoard] = useState(Array(ROWS).fill(Array(COLS).fill(EMPTY)));
  const [turn, setTurn] = useState(P1);
  const [winner, setWinner] = useState(null);
  const [difficulty, setDifficulty] = useState(3);
  const [lastMove, setLastMove] = useState(null); // {r, c}
  const [isProcessing, setIsProcessing] = useState(false);
  
  // RANKING & ONLINE
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingRank, setLoadingRank] = useState(true);
  const [roomCode, setRoomCode] = useState('');
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opName, setOpName] = useState('Rival');
  const [currentBetInfo, setCurrentBetInfo] = useState(null);

  const fetchLeaderboard = async () => {
      setLoadingRank(true);
      try {
          const q = query(collection(db, "scores_connect4"), orderBy("score", "desc"), limit(5));
          const s = await getDocs(q);
          setLeaderboard(s.docs.map(d => d.data()));
      } catch (e) { console.error("Error ranking", e); }
      finally { setLoadingRank(false); }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    fetchLeaderboard();
    return () => unsubscribe();
  }, []);

  // --- MOTOR IA (GAME LOOP) ---
  useEffect(() => {
      if (view === 'pve' && turn === P2 && !winner && !isProcessing) {
          setIsProcessing(true); // Lock UI
          
          setTimeout(() => {
              const cpuMoveCol = pickBestMove(board, P2, difficulty);
              executeMove(cpuMoveCol, P2);
              setIsProcessing(false); // Unlock UI
          }, 600); // Ritmo de juego
      }
  }, [turn, view, winner, board]);

  // --- ONLINE SYNC ---
  useEffect(() => {
      if (view === 'pvp_game' && roomCode) {
          const unsubscribe = onSnapshot(doc(db, "matches_connect4", roomCode), (docSnap) => {
              if(docSnap.exists()) {
                  const data = docSnap.data();
                  if(data.boardStr) setBoard(JSON.parse(data.boardStr));
                  if(data.turn) setTurn(data.turn);
                  if(data.lastMove) setLastMove(data.lastMove);
                  if(data.winner) setWinner(data.winner);
                  if(data.betInfo) setCurrentBetInfo(data.betInfo);
                  if(isHost) setOpName(data.guestName || 'Esperando...');
                  else setOpName(data.hostName || 'Host');
              }
          });
          
          // FIX: Safe unsubscribe
          return () => {
              setTimeout(() => {
                  if (unsubscribe && typeof unsubscribe === 'function') unsubscribe();
              }, 0);
          };
      }
  }, [view, roomCode]);

  // --- LÓGICA JUEGO ---
  const initGame = (mode, diff = 3) => {
      setBoard(Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY)));
      setTurn(P1);
      setWinner(null);
      setLastMove(null);
      setDifficulty(diff);
      setIsProcessing(false);
      setView(mode === 'pve' ? 'pve' : 'pvp_game');
      playSound('start');
  };

  const handleColumnClick = (col) => {
      if (winner || isProcessing) return;
      if (view === 'pve' && turn !== P1) return;
      if (view === 'pvp_game') {
          const myId = isHost ? P1 : P2;
          if (turn !== myId) return;
      }
      
      executeMove(col, turn);
  };

  const executeMove = (col, player) => {
      // Buscar fila válida
      let row = -1;
      for (let r = ROWS - 1; r >= 0; r--) {
          if (board[r][col] === EMPTY) {
              row = r;
              break;
          }
      }

      if (row === -1) return; // Columna llena

      // Crear nuevo tablero
      const newBoard = board.map(arr => [...arr]);
      newBoard[row][col] = player;
      
      setBoard(newBoard);
      setLastMove({ r: row, c: col });
      playSound('drop');

      // Check Win
      if (checkWinningMove(newBoard, player)) {
          handleWin(player, newBoard);
      } else if (newBoard.every(r => r.every(c => c !== EMPTY))) {
          setWinner('draw');
          if (view === 'pvp_game') syncOnline(newBoard, 'draw', { r: row, c: col }, 'draw');
      } else {
          // Next Turn
          const nextTurn = player === P1 ? P2 : P1;
          setTurn(nextTurn);
          if (view === 'pvp_game') syncOnline(newBoard, nextTurn, { r: row, c: col }, null);
      }
  };

  const handleWin = (player, finalBoard) => {
      setWinner(player);
      if (player === P1) { // Ganaste tú (siempre eres P1 en PVE, en PVP eres host)
          // Nota: En PVP si eres guest (P2), player será P2. 
          const amIWinner = (view === 'pve') || (isHost && player === P1) || (!isHost && player === P2);
          
          if (amIWinner) {
              playSound('win');
              const reward = view === 'pve' ? 100 * difficulty : (currentBetInfo?.value * 2 || 200);
              addCoins(reward, view === 'pve' ? `Victoria Nivel ${difficulty}` : 'Victoria PvP');
              saveScore(1000 + (difficulty * 100)); // Score base + bonus dificultad
          } else {
              playSound('lose');
          }
      } else {
          // Ganó el rival
          const amIWinner = (!isHost && player === P2); // Si soy guest y ganó P2
           if (amIWinner) {
              playSound('win');
              const reward = currentBetInfo?.value * 2 || 200;
              addCoins(reward, 'Victoria PvP');
              saveScore(1000); 
          } else {
              playSound('lose');
          }
      }

      if (view === 'pvp_game' && (isHost || player === (isHost ? P1 : P2))) syncOnline(finalBoard, player, lastMove, player);
  };

  const syncOnline = (b, t, m, w) => {
      updateDoc(doc(db, "matches_connect4", roomCode), {
          boardStr: JSON.stringify(b),
          turn: t,
          lastMove: m,
          winner: w
      });
  };

  // --- DB & RANKING ---
  const saveScore = async (score) => {
      if (user) {
          try {
            await addDoc(collection(db, "scores_connect4"), { 
                uid: user.uid, displayName: user.name, score, date: serverTimestamp() 
            });
            fetchLeaderboard();
          } catch(e) {}
      }
  };

  const handleCreateRoom = async () => {
      if (!user) return alert("Inicia sesión");
      if (betType === 'money' && coins < betAmount) return alert("Fondos insuficientes");
      if (betType === 'money') await spendCoins(betAmount, "Apuesta Connect");

      const betInfo = { type: betType, value: betType === 'money' ? betAmount : betText || 'Honor' };
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_connect4", code), {
          host: user.uid, hostName: user.name, guest: null, guestName: 'Esperando...',
          turn: P1, betInfo, createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); setCurrentBetInfo(betInfo); initGame('pvp_game');
  };

  const joinRoom = async (c) => {
      if (!user) return alert("Inicia sesión");
      const ref = doc(db, "matches_connect4", c); const snap = await getDoc(ref);
      if (!snap.exists()) return alert("Sala no encontrada");
      const data = snap.data();
      if (data.betInfo?.type === 'money') { 
          if (coins < data.betInfo.value) return alert("Fondos insuficientes"); 
          await spendCoins(data.betInfo.value, "Apuesta Connect"); 
      }
      await updateDoc(ref, { guest: user.uid, guestName: user.name });
      setRoomCode(c); setIsHost(false); setCurrentBetInfo(data.betInfo); setView('pvp_game');
  };

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono text-white select-none overflow-hidden relative">
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-black to-black"></div>

        {/* HEADER */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-6 z-10">
            <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-cyan-500 transition shadow-lg"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
            <div className="text-center">
                <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 italic tracking-tighter">CONNECT 4</h1>
                <p className="text-[10px] text-cyan-500/80 font-bold tracking-[0.5em] uppercase">NEON LEAGUE</p>
            </div>
            <div className={`px-4 py-2 rounded-full border flex items-center gap-2 text-xs font-bold ${turn === P1 ? 'border-cyan-500 text-cyan-400 bg-cyan-950/30' : 'border-rose-500 text-rose-400 bg-rose-950/30'}`}>
                {turn === P1 ? <Zap className="w-4 h-4 animate-pulse"/> : <Brain className="w-4 h-4"/>} 
                {turn === P1 ? 'TU TURNO' : 'RIVAL'}
            </div>
        </div>

        {view === 'menu' ? (
            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 animate-in zoom-in z-10">
                {/* MENÚ JUEGO */}
                <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md">
                    <h2 className="text-xl font-bold text-cyan-400 mb-6 flex gap-2 tracking-widest items-center"><Cpu/> MODO SOLITARIO</h2>
                    <div className="space-y-3">
                        <button onClick={() => initGame('pve', 1)} className="w-full py-4 bg-slate-800 border border-slate-600 hover:border-green-500 text-white font-bold rounded-xl transition flex justify-between px-6"><span>NOVATO</span><span className="text-green-500">FÁCIL</span></button>
                        <button onClick={() => initGame('pve', 3)} className="w-full py-4 bg-slate-800 border border-slate-600 hover:border-yellow-500 text-white font-bold rounded-xl transition flex justify-between px-6"><span>VETERANO</span><span className="text-yellow-500">MEDIO</span></button>
                        <button onClick={() => initGame('pve', 5)} className="w-full py-4 bg-gradient-to-r from-purple-900 to-slate-900 border border-purple-500 text-white font-black rounded-xl transition flex justify-between px-6 shadow-lg shadow-purple-900/20"><span>MAESTRO</span><span className="text-purple-400">DIFÍCIL</span></button>
                    </div>
                </div>

                {/* ONLINE & RANKING */}
                <div className="flex flex-col gap-4">
                    <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md">
                        <h2 className="text-xl font-bold text-rose-400 mb-6 flex gap-2 tracking-widest items-center"><Users/> ONLINE PVP</h2>
                        <div className="bg-black/40 p-4 rounded-xl mb-4 border border-slate-800">
                            <div className="flex gap-2 mb-4">
                                <button onClick={() => setBetType('money')} className={`flex-1 py-2 text-xs font-bold rounded ${betType==='money'?'bg-yellow-500 text-black':'bg-slate-800 text-slate-400'}`}>MONEDAS</button>
                                <button onClick={() => setBetType('text')} className={`flex-1 py-2 text-xs font-bold rounded ${betType==='text'?'bg-pink-500 text-white':'bg-slate-800 text-slate-400'}`}>RETO</button>
                            </div>
                            {betType === 'money' && <input type="number" value={betAmount} onChange={(e)=>setBetAmount(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-center text-yellow-400 font-bold"/>}
                            {betType === 'text' && <input type="text" value={betText} onChange={(e)=>setBetText(e.target.value)} placeholder="Reto..." className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-center text-white text-xs"/>}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleCreateRoom} className="flex-1 py-4 bg-slate-800 border border-slate-600 hover:border-cyan-500 font-bold rounded-xl text-xs text-white">CREAR</button>
                            <input id="code" placeholder="CÓDIGO" className="w-24 bg-black border border-slate-600 rounded-xl text-center font-bold outline-none text-white"/>
                            <button onClick={() => joinRoom(document.getElementById('code').value)} className="flex-1 py-4 bg-slate-800 border border-slate-600 hover:border-rose-500 font-bold rounded-xl text-xs text-white">UNIRSE</button>
                        </div>
                    </div>

                    <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-sm flex-grow">
                        <h3 className="text-center text-xs text-slate-500 font-bold uppercase tracking-widest mb-4 flex items-center justify-center gap-2"><Trophy className="w-3 h-3 text-yellow-500"/> Ranking Global</h3>
                        {loadingRank ? <Loader2 className="w-4 h-4 animate-spin text-cyan-500 mx-auto"/> : leaderboard.map((s,i) => (
                            <div key={i} className="flex justify-between items-center text-xs py-2 border-b border-slate-800/50 last:border-0 text-slate-300">
                                <span className="font-bold">#{i+1} {s.displayName}</span>
                                <span className="text-cyan-400 font-mono font-black">{s.score} PTS</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        ) : (
            <div className="w-full flex flex-col items-center flex-grow z-10 relative">
                
                {/* TABLERO PRO */}
                <div className="relative p-3 sm:p-4 rounded-[2rem] bg-[#1e293b] border-8 border-[#334155] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] mt-6 select-none">
                    
                    {/* Tornillería */}
                    <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-slate-600 shadow-inner border border-black/50"></div>
                    <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-slate-600 shadow-inner border border-black/50"></div>

                    {/* Indicadores Columna */}
                    <div className="absolute -top-10 left-4 right-4 flex justify-between px-3">
                        {[...Array(COLS)].map((_, c) => (
                            <div key={c} className="w-10 sm:w-14 flex justify-center cursor-pointer" onClick={() => handleColumnClick(c)}>
                                <div className={`w-8 h-8 rounded-full border-2 border-white/20 transition-all duration-300 hover:bg-white/10 flex items-center justify-center ${turn === P1 ? 'hover:border-cyan-400' : ''}`}>
                                    <ArrowDown className={`w-4 h-4 ${turn === P1 ? 'text-cyan-400' : 'text-slate-600'}`}/>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Rejilla */}
                    <div className="bg-[#0f172a] rounded-xl p-2 sm:p-3 shadow-[inset_0_0_40px_rgba(0,0,0,1)] border-2 border-slate-900 relative overflow-hidden">
                        {/* Brillo Cristal */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none z-10 rounded-xl"></div>

                        {board.map((row, r) => (
                            <div key={r} className="flex gap-2 sm:gap-4 mb-2 sm:mb-4 last:mb-0">
                                {row.map((cell, c) => {
                                    const isLast = lastMove?.r === r && lastMove?.c === c;
                                    return (
                                        <div 
                                            key={c}
                                            onClick={() => handleColumnClick(c)}
                                            className="relative w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full bg-black/40 shadow-[inset_0_4px_8px_rgba(0,0,0,1)] flex items-center justify-center cursor-pointer group border border-white/5 hover:border-white/20 transition-all"
                                        >
                                            {/* Ficha */}
                                            {cell !== EMPTY && (
                                                <div className={`w-[85%] h-[85%] rounded-full shadow-lg relative ${isLast ? 'animate-bounce' : ''}`}>
                                                    <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${cell === P1 ? 'from-cyan-400 to-cyan-900' : 'from-rose-400 to-rose-900'}`}></div>
                                                    <div className="absolute inset-0 rounded-full border-2 border-white/20"></div>
                                                    <div className="absolute top-[10%] left-[20%] w-[60%] h-[30%] bg-gradient-to-b from-white/80 to-transparent rounded-full opacity-50 blur-[1px]"></div>
                                                    <div className={`absolute inset-[35%] rounded-full bg-gradient-to-tr ${cell === P1 ? 'from-cyan-200 to-white' : 'from-rose-200 to-white'} opacity-80 blur-[2px]`}></div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                    
                    {/* Patas */}
                    <div className="absolute -bottom-8 -left-4 w-6 h-24 bg-slate-600 rounded-full -z-10 rotate-12 border-r-4 border-black"></div>
                    <div className="absolute -bottom-8 -right-4 w-6 h-24 bg-slate-600 rounded-full -z-10 -rotate-12 border-l-4 border-black"></div>
                </div>

                {/* GAME OVER */}
                {winner && (
                    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50 animate-in zoom-in backdrop-blur-md rounded-3xl p-6 text-center">
                        <Trophy className="w-24 h-24 text-yellow-500 mb-6 animate-bounce drop-shadow-[0_0_30px_rgba(234,179,8,0.6)]"/>
                        <h2 className="text-5xl font-black text-white italic mb-4">{winner === 'draw' ? 'EMPATE' : (winner === P1 ? '¡VICTORIA!' : 'DERROTA')}</h2>
                        {winner === P1 && view === 'pve' && (
                            <div className="bg-yellow-900/20 border border-yellow-500/30 px-8 py-3 rounded-2xl mb-8 flex items-center gap-3 animate-pulse">
                                <Coins className="w-6 h-6 text-yellow-400"/>
                                <span className="text-xl font-bold text-yellow-100">+{100 * difficulty} MONEDAS</span>
                            </div>
                        )}
                        <div className="flex gap-4">
                            <button onClick={() => initGame(view, difficulty)} className="px-8 py-3 bg-white text-black font-black rounded-xl hover:scale-105 transition flex items-center gap-2"><RotateCcw className="w-4 h-4"/> REPETIR</button>
                            <button onClick={() => setView('menu')} className="px-8 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition">SALIR</button>
                        </div>
                    </div>
                )}
            </div>
        )}
        
        <div className="mt-auto opacity-50 w-full max-w-md pt-4 relative z-10"><AdSpace type="banner" /><GameChat gameId={view.includes('pvp') ? roomCode : "global_connect4"} gameName="CONNECT 4" /></div>
    </div>
  );
}