// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Trophy, Users, Cpu, Crown, 
  Coins, Swords, Clock, Footprints, Brain, 
  Play, MessageSquare, Loader2, Target
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, onSnapshot, getDoc, serverTimestamp, setDoc, collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- CONSTANTES ---
const BOARD_SIZE = 8;
const PLAYER_ONE = 'cyan'; // Jugador (Abajo)
const PLAYER_TWO = 'rose'; // CPU/Rival (Arriba)

// --- UTILIDADES IA (Minimax & Heurística) ---
const cloneBoard = (board) => board.map(row => row.map(cell => cell ? { ...cell } : null));

const evaluateBoard = (board) => {
    let score = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const p = board[r][c];
            if (!p) continue;
            let val = p.isKing ? 30 : 10;
            if (c > 1 && c < 6 && r > 1 && r < 6) val += 2; 
            if (p.player === PLAYER_TWO && r === 0) val += 5;
            if (p.player === PLAYER_ONE && r === 7) val += 5;
            score += p.player === PLAYER_TWO ? val : -val;
        }
    }
    return score;
};

const getAllMoves = (board, player) => {
    let moves = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c]?.player === player) {
                const dirs = [];
                if (board[r][c].isKing || player === PLAYER_ONE) dirs.push([-1, -1], [-1, 1]);
                if (board[r][c].isKing || player === PLAYER_TWO) dirs.push([1, -1], [1, 1]);

                dirs.forEach(([dr, dc]) => {
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && !board[nr][nc]) {
                        moves.push({ from: {r,c}, to: {r:nr, c:nc}, isJump: false });
                    }
                    const jr = r + dr * 2, jc = c + dc * 2;
                    if (jr >= 0 && jr < BOARD_SIZE && jc >= 0 && jc < BOARD_SIZE) {
                        const mid = board[nr]?.[nc];
                        if (mid && mid.player !== player && !board[jr][jc]) {
                            moves.push({ from: {r,c}, to: {r:jr, c:jc}, isJump: true, kill: {r:nr, c:nc} });
                        }
                    }
                });
            }
        }
    }
    const captures = moves.filter(m => m.isJump);
    return captures.length > 0 ? captures : moves;
};

const minimax = (board, depth, maximizing) => {
    if (depth === 0) return evaluateBoard(board);

    const moves = getAllMoves(board, maximizing ? PLAYER_TWO : PLAYER_ONE);
    if (moves.length === 0) return maximizing ? -1000 : 1000; 

    if (maximizing) {
        let maxEval = -Infinity;
        for (let move of moves) {
            const newBoard = cloneBoard(board);
            newBoard[move.to.r][move.to.c] = newBoard[move.from.r][move.from.c];
            newBoard[move.from.r][move.from.c] = null;
            if (move.isJump) newBoard[move.kill.r][move.kill.c] = null;
            if (move.to.r === BOARD_SIZE - 1) newBoard[move.to.r][move.to.c].isKing = true;

            const evalScore = minimax(newBoard, depth - 1, false);
            maxEval = Math.max(maxEval, evalScore);
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (let move of moves) {
            const newBoard = cloneBoard(board);
            newBoard[move.to.r][move.to.c] = newBoard[move.from.r][move.from.c];
            newBoard[move.from.r][move.from.c] = null;
            if (move.isJump) newBoard[move.kill.r][move.kill.c] = null;
            if (move.to.r === 0) newBoard[move.to.r][move.to.c].isKing = true;

            const evalScore = minimax(newBoard, depth - 1, true);
            minEval = Math.min(minEval, evalScore);
        }
        return minEval;
    }
};

export default function CheckersPro() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);

  const [view, setView] = useState('menu'); 
  
  // ESTADO DE JUEGO
  const [board, setBoard] = useState([]);
  const [turn, setTurn] = useState(PLAYER_ONE); 
  const [selectedPiece, setSelectedPiece] = useState(null); 
  const [validMoves, setValidMoves] = useState([]); 
  
  const [scores, setScores] = useState({ cyan: 12, rose: 12 });
  const [winner, setWinner] = useState(null);
  const [lastAction, setLastAction] = useState("Tablero desplegado");
  const [difficulty, setDifficulty] = useState(3); 

  // STATS
  const [startTime, setStartTime] = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const [finalStats, setFinalStats] = useState({ score: 0, time: 0, moves: 0 });

  // ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opName, setOpName] = useState('Rival');
  
  // APUESTAS
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [currentBetInfo, setCurrentBetInfo] = useState(null);

  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingRank, setLoadingRank] = useState(true);

  // --- FIX: DECLARAMOS LA FUNCIÓN ARRIBA ANTES DE USARLA ---
  const fetchLeaderboard = async () => { 
      setLoadingRank(true);
      try { 
          const q = query(collection(db, "scores_checkers"), orderBy("score", "desc"), limit(5)); 
          const s = await getDocs(q); 
          setLeaderboard(s.docs.map(d=>d.data())); 
      } catch (e) { console.error(e); } finally { setLoadingRank(false); }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) setUser({ uid: u.uid, name: u.displayName || 'Estratega' });
    });
    fetchLeaderboard(); // Ahora se llama sin dar error
    return () => unsubscribe();
  }, []);

  // --- SYNC ONLINE ---
  useEffect(() => {
    if (view === 'pvp_game' && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_checkers", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.betInfo) setCurrentBetInfo(data.betInfo);
                
                if (isHost) setOpName(data.guestName || 'Esperando...');
                else setOpName(data.hostName || 'Host');

                if (data.boardStr) {
                    const parsedBoard = JSON.parse(data.boardStr);
                    if (JSON.stringify(parsedBoard) !== JSON.stringify(board)) {
                        setBoard(parsedBoard);
                        countPieces(parsedBoard);
                    }
                }
                
                if (data.turn) setTurn(data.turn);
                if (data.lastAction) setLastAction(data.lastAction);
                if (data.winner) setWinner(data.winner);
            }
        });
        return () => {
            setTimeout(() => {
                if (unsubscribe && typeof unsubscribe === 'function') {
                    unsubscribe();
                }
            }, 0);
        };
    }
  }, [view, roomCode, isHost]);

  // --- INIT ---
  const initGame = (mode, diff = 3) => {
      playSound('click');
      const newBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
      for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
              if ((r + c) % 2 === 1) {
                  if (r < 3) newBoard[r][c] = { player: PLAYER_TWO, isKing: false };
                  if (r > 4) newBoard[r][c] = { player: PLAYER_ONE, isKing: false };
              }
          }
      }

      setBoard(newBoard);
      setScores({ cyan: 12, rose: 12 });
      setTurn(PLAYER_ONE);
      setWinner(null);
      setValidMoves([]);
      setSelectedPiece(null);
      setLastAction("Combate Iniciado. Tu turno.");
      setDifficulty(diff);
      
      setStartTime(Date.now());
      setMoveCount(0);
      setFinalStats({ score: 0, time: 0, moves: 0 });
      
      setView(mode === 'pve' ? 'pve' : 'pvp_game');
      playSound('start');
  };

  const countPieces = (currentBoard) => {
      let c = 0, r = 0;
      currentBoard.forEach(row => row.forEach(cell => {
          if (cell?.player === PLAYER_ONE) c++;
          if (cell?.player === PLAYER_TWO) r++;
      }));
      setScores({ cyan: c, rose: r });
      if (c === 0) handleGameOver(PLAYER_TWO);
      if (r === 0) handleGameOver(PLAYER_ONE);
  };

  // --- MOVIMIENTO PLAYER ---
  const getValidMoves = (r, c, boardState, player) => {
      const moves = [];
      const piece = boardState[r][c];
      if (!piece) return [];

      const directions = [];
      if (piece.player === PLAYER_ONE || piece.isKing) directions.push([-1, -1], [-1, 1]);
      if (piece.player === PLAYER_TWO || piece.isKing) directions.push([1, -1], [1, 1]);

      directions.forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
              if (!boardState[nr][nc]) {
                  moves.push({ r: nr, c: nc, isJump: false });
              } else if (boardState[nr][nc].player !== player) {
                  const jr = nr + dr, jc = nc + dc;
                  if (jr >= 0 && jr < BOARD_SIZE && jc >= 0 && jc < BOARD_SIZE && !boardState[jr][jc]) {
                      moves.push({ r: jr, c: jc, isJump: true, killR: nr, killC: nc });
                  }
              }
          }
      });
      return moves;
  };

  const handleCellClick = (r, c) => {
      const myColor = (view === 'pve' || isHost) ? PLAYER_ONE : PLAYER_TWO;
      if (view === 'pve' && turn !== PLAYER_ONE) return; 
      if (view === 'pvp_game' && turn !== myColor) return;
      if (winner) return;

      if (board[r][c]?.player === turn) {
          const moves = getValidMoves(r, c, board, turn);
          setSelectedPiece({ r, c });
          setValidMoves(moves);
          playSound('hover');
          return;
      }

      const move = validMoves.find(m => m.r === r && m.c === c);
      if (move) executeMove(selectedPiece, move);
      else { setSelectedPiece(null); setValidMoves([]); }
  };

  const executeMove = (from, move) => {
      const newBoard = cloneBoard(board);
      const piece = newBoard[from.r][from.c];
      
      newBoard[move.r][move.c] = piece;
      newBoard[from.r][from.c] = null;

      let captured = false;
      if (move.isJump) {
          newBoard[move.killR][move.killC] = null;
          captured = true;
          playSound('explosion');
      } else playSound('drop');

      let promoted = false;
      if ((piece.player === PLAYER_ONE && move.r === 0) || (piece.player === PLAYER_TWO && move.r === BOARD_SIZE - 1)) {
          if (!piece.isKing) { piece.isKing = true; promoted = true; playSound('powerup'); }
      }

      if (turn === PLAYER_ONE) setMoveCount(prev => prev + 1);

      setBoard(newBoard);
      countPieces(newBoard);
      setValidMoves([]);
      setSelectedPiece(null);

      const logMsg = `${turn === PLAYER_ONE ? 'Jugador' : 'Rival'} ${captured ? 'captura una pieza' : 'avanza'}${promoted ? ' y CORONA' : ''}.`;
      setLastAction(logMsg);

      const nextTurn = turn === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
      setTurn(nextTurn);

      if (view === 'pvp_game') {
          updateDoc(doc(db, "matches_checkers", roomCode), { boardStr: JSON.stringify(newBoard), turn: nextTurn, lastAction: logMsg });
      } else if (view === 'pve') {
          setTimeout(() => cpuTurnLogic(newBoard), 800);
      }
  };

  // --- MOTOR IA ---
  const cpuTurnLogic = (currentBoard) => {
      if (winner) return;

      const allMoves = getAllMoves(currentBoard, PLAYER_TWO);
      if (allMoves.length === 0) { handleGameOver(PLAYER_ONE); return; }

      let selectedMove = null;

      if (difficulty === 1) { 
          selectedMove = allMoves[Math.floor(Math.random() * allMoves.length)];
      } 
      else if (difficulty === 2) { 
          const captures = allMoves.filter(m => m.isJump);
          selectedMove = captures.length > 0 
              ? captures[Math.floor(Math.random() * captures.length)] 
              : allMoves[Math.floor(Math.random() * allMoves.length)];
      }
      else if (difficulty === 3) { 
          const captures = allMoves.filter(m => m.isJump);
          if (captures.length > 0) selectedMove = captures[Math.floor(Math.random() * captures.length)];
          else {
              selectedMove = allMoves[0]; // Simplificado
          }
      }
      else if (difficulty >= 4) { 
          let bestVal = -Infinity;
          let bestMoves = [];
          const depth = difficulty === 4 ? 2 : 4; 

          const captures = allMoves.filter(m => m.isJump);
          const movesToEval = captures.length > 0 ? captures : allMoves;

          for (let move of movesToEval) {
              const simBoard = cloneBoard(currentBoard);
              simBoard[move.to.r][move.to.c] = simBoard[move.from.r][move.from.c];
              simBoard[move.from.r][move.from.c] = null;
              if (move.isJump) simBoard[move.kill.r][move.kill.c] = null;
              if (move.to.r === BOARD_SIZE - 1) simBoard[move.to.r][move.to.c].isKing = true;

              const val = minimax(simBoard, depth, false);
              if (val > bestVal) {
                  bestVal = val;
                  bestMoves = [move];
              } else if (val === bestVal) {
                  bestMoves.push(move);
              }
          }
          selectedMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
      }

      if (!selectedMove) selectedMove = allMoves[0]; 

      const newBoard = cloneBoard(currentBoard);
      const piece = newBoard[selectedMove.from.r][selectedMove.from.c];
      newBoard[selectedMove.to.r][selectedMove.to.c] = piece;
      newBoard[selectedMove.from.r][selectedMove.from.c] = null;

      let captured = false;
      if (selectedMove.isJump) {
          newBoard[selectedMove.kill.r][selectedMove.kill.c] = null;
          captured = true;
          playSound('explosion');
      } else playSound('drop');

      if (selectedMove.to.r === BOARD_SIZE - 1) piece.isKing = true;

      setBoard(newBoard);
      countPieces(newBoard);
      setLastAction(`CPU ${captured ? 'captura tu pieza' : 'mueve'}.`);
      setTurn(PLAYER_ONE);
  };

  const handleGameOver = (winnerId) => {
      setWinner(winnerId);
      if (winnerId === PLAYER_ONE) { 
          playSound('win');
          const endTime = Date.now();
          const durationSeconds = Math.floor((endTime - startTime) / 1000);
          
          const baseScore = 1000;
          const timeBonus = Math.max(0, 500 - (durationSeconds * 2));
          const moveBonus = Math.max(0, 500 - (moveCount * 5));
          const difficultyMult = difficulty * 0.5; 
          const totalScore = Math.floor((baseScore + timeBonus + moveBonus) * (1 + difficultyMult));

          setFinalStats({ score: totalScore, time: durationSeconds, moves: moveCount });

          if (view === 'pve') {
              addCoins(100 * difficulty, `Victoria Nivel ${difficulty}`);
              saveScore(totalScore, durationSeconds, moveCount); // Guarda en Solitario
          } else {
              const amIWinner = (isHost && winnerId === PLAYER_ONE) || (!isHost && winnerId === PLAYER_TWO);
              if (amIWinner) {
                  addCoins(currentBetInfo?.value * 2 || 200, "Victoria Damas PVP");
                  saveScore(totalScore, durationSeconds, moveCount); // AHORA TAMBIÉN GUARDA EN ONLINE
              }
          }
      } else {
          playSound('lose');
      }
      
      if (view === 'pvp_game' && isHost) updateDoc(doc(db, "matches_checkers", roomCode), { winner: winnerId });
  };

  // --- DB & ONLINE ---
  const saveScore = async (score, time, moves) => { 
      if (user) {
          try {
              await addDoc(collection(db, "scores_checkers"), { 
                  uid: user.uid, 
                  displayName: user.name, 
                  score: score, 
                  time: time, 
                  moves: moves, 
                  date: serverTimestamp() 
              }); 
              fetchLeaderboard(); // Actualiza el ranking automáticamente
          } catch (error) {
              console.error("Error rojo al guardar ranking:", error);
          }
      } else {
          alert("Aviso: No estás logueado. Inicia sesión para guardar tu récord.");
      }
  };

  const createRoom = async () => {
      if (!user) return alert("Inicia sesión para jugar online");
      if (betType === 'money' && coins < betAmount) return alert("Fondos insuficientes");
      if (betType === 'money') await spendCoins(betAmount, "Apuesta Damas");
      
      playSound('click');
      const betInfo = { type: betType, value: betType === 'money' ? betAmount : betText || 'Honor' };
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_checkers", code), { host: user.uid, hostName: user.name, guest: null, guestName: 'Esperando...', turn: PLAYER_ONE, betInfo, createdAt: serverTimestamp() });
      setRoomCode(code); setIsHost(true); setCurrentBetInfo(betInfo); initGame('pvp_game');
  };

  const joinRoom = async (c) => {
      if (!user) return alert("Inicia sesión para jugar online");
      if (!c) return;
      playSound('click');

      const ref = doc(db, "matches_checkers", c); const snap = await getDoc(ref);
      if (!snap.exists()) return alert("Sala no encontrada");
      
      const data = snap.data();
      if (data.betInfo?.type === 'money') { 
          if (coins < data.betInfo.value) return alert("Fondos insuficientes para esta mesa"); 
          await spendCoins(data.betInfo.value, "Apuesta Damas"); 
      }
      
      await updateDoc(ref, { guest: user.uid, guestName: user.name });
      setRoomCode(c); setIsHost(false); setCurrentBetInfo(data.betInfo); setView('pvp_game');
  };

  const handleBack = () => { 
      if (view === 'menu') window.location.href = '/'; 
      else { 
          setView('menu'); 
          setBoard([]); 
          setWinner(null);
      } 
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-2 font-mono text-white select-none overflow-hidden relative">
      
      {/* FONDO */}
      <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.05)_0%,transparent_100%)]"></div>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
      </div>

      {/* HEADER */}
      <div className="w-full max-w-5xl flex justify-between items-center py-4 px-2 sm:px-4 z-10 relative mt-2">
        <button onClick={handleBack} className="p-2 sm:p-3 bg-slate-900/50 rounded-full border border-slate-700 hover:border-cyan-400 transition shadow-lg backdrop-blur-md"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
        
        <div className="text-center">
            <h1 className="text-2xl sm:text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 tracking-tighter drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]">DAMAS</h1>
            <p className="text-[8px] sm:text-[10px] text-cyan-500/80 font-bold tracking-[0.5em] uppercase mt-1">Estrategia Digital</p>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-md px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-yellow-500/30 flex items-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.1)]">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-md">
                <Coins className="w-3 h-3 text-black fill-current" />
            </div>
            <span className="text-xs sm:text-sm font-black text-yellow-400 tabular-nums">{coins.toLocaleString()}</span>
        </div>
      </div>

      {view === 'menu' ? (
          <div className="w-full max-w-md grid gap-4 animate-in fade-in zoom-in mt-6 z-10 px-2 flex-grow overflow-y-auto no-scrollbar pb-4">
              
              <div className="bg-slate-900/80 p-6 rounded-[2rem] border border-cyan-500/20 shadow-2xl backdrop-blur-md">
                  <h2 className="text-[10px] font-bold text-slate-400 mb-4 flex gap-2 tracking-widest items-center uppercase"><Cpu className="w-4 h-4 text-cyan-400"/> Entrenamiento (VS IA)</h2>
                  <div className="grid grid-cols-1 gap-2.5">
                      <button onClick={() => initGame('pve', 1)} className="py-3 sm:py-4 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs sm:text-sm font-bold border-2 border-slate-800 flex justify-between px-5 transition-all active:scale-95 shadow-lg">
                          <span>NIVEL 1: NOVATO</span> <span className="text-green-500">FÁCIL</span>
                      </button>
                      <button onClick={() => initGame('pve', 2)} className="py-3 sm:py-4 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs sm:text-sm font-bold border-2 border-slate-800 flex justify-between px-5 transition-all active:scale-95 shadow-lg">
                          <span>NIVEL 2: AFICIONADO</span> <span className="text-green-400">NORMAL</span>
                      </button>
                      <button onClick={() => initGame('pve', 3)} className="py-3 sm:py-4 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs sm:text-sm font-bold border-2 border-slate-800 flex justify-between px-5 transition-all active:scale-95 shadow-lg">
                          <span>NIVEL 3: VETERANO</span> <span className="text-yellow-500">MEDIO</span>
                      </button>
                      <button onClick={() => initGame('pve', 4)} className="py-3 sm:py-4 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold border-2 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)] flex justify-between px-5 transition-all active:scale-95">
                          <span>NIVEL 4: MAESTRO</span> <span className="text-cyan-400 animate-pulse">DIFÍCIL</span>
                      </button>
                      <button onClick={() => initGame('pve', 5)} className="py-3 sm:py-4 bg-gradient-to-r from-rose-900 to-slate-900 hover:from-rose-800 hover:to-slate-800 text-white rounded-xl text-xs sm:text-sm font-black border-2 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)] flex justify-between px-5 transition-all active:scale-95">
                          <span className="flex items-center gap-2"><Brain className="w-4 h-4"/> GRAN MAESTRO</span> <span className="text-rose-400">EXTREMO</span>
                      </button>
                  </div>
              </div>
              
              <div className="bg-slate-900/80 p-6 rounded-[2rem] border border-blue-500/20 shadow-2xl backdrop-blur-md">
                  <h2 className="text-[10px] font-bold text-slate-400 mb-4 flex gap-2 tracking-widest items-center uppercase"><Users className="w-4 h-4 text-blue-400"/> Duelo Online</h2>
                  
                  <div className="mb-4 bg-black/40 p-4 rounded-2xl border border-white/5">
                      <div className="flex gap-2 mb-3 bg-slate-950 p-1 rounded-lg">
                          <button onClick={() => setBetType('money')} className={`flex-1 py-2 text-[10px] font-black tracking-widest rounded uppercase transition-colors ${betType==='money'?'bg-yellow-500 text-black':'text-slate-500 hover:text-white'}`}>Monedas</button>
                          <button onClick={() => setBetType('text')} className={`flex-1 py-2 text-[10px] font-black tracking-widest rounded uppercase transition-colors ${betType==='text'?'bg-pink-500 text-black':'text-slate-500 hover:text-white'}`}>Reto Libre</button>
                      </div>
                      {betType === 'money' ? (
                          <div className="relative">
                              <Coins className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500"/>
                              <input type="number" value={betAmount} onChange={(e)=>setBetAmount(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pl-10 text-yellow-400 font-black outline-none focus:border-yellow-500 transition-colors"/>
                          </div>
                      ) : (
                          <input type="text" value={betText} onChange={(e)=>setBetText(e.target.value)} placeholder="Ej: Paga la cena" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-center text-white text-xs font-bold outline-none focus:border-pink-500 transition-colors"/>
                      )}
                  </div>

                  <div className="flex gap-2 flex-col sm:flex-row">
                      <button onClick={createRoom} className="w-full sm:flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all border border-blue-400/50">CREAR SALA</button>
                      <div className="flex w-full sm:flex-1 gap-2">
                          <input id="code" placeholder="CODE" maxLength={4} className="flex-1 bg-slate-950 border border-slate-700 rounded-xl text-center font-black outline-none focus:border-blue-500 uppercase"/>
                          <button onClick={() => joinRoom(document.getElementById('code').value.toUpperCase())} className="px-4 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-colors active:scale-95 text-white"><Play className="w-4 h-4 fill-current"/></button>
                      </div>
                  </div>
              </div>
              
              <div className="bg-slate-900/50 p-5 rounded-[2rem] border border-slate-800 mb-2">
                  <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-3 text-center tracking-widest">Ranking Global</h3>
                  {loadingRank ? <Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto"/> : leaderboard.length > 0 ? leaderboard.map((s,i) => (
                      <div key={i} className="flex justify-between items-center text-[10px] py-2 border-b border-white/5 last:border-0 text-slate-300">
                          <span className="font-bold text-white flex gap-2"><span>#{i+1}</span> {s.displayName}</span>
                          <span className="text-cyan-400 font-black">{s.score} PTS</span>
                      </div>
                  )) : <p className="text-[10px] text-slate-600 text-center">Sin récords</p>}
              </div>
          </div>
      ) : (
          <div className="w-full max-w-2xl flex flex-col items-center flex-grow z-10 relative px-2">
              
              {/* HUD / MARCADORES */}
              <div className="w-full max-w-[480px] flex justify-between items-center mb-6 mt-2">
                  
                  {/* CPU / RIVAL */}
                  <div className={`flex items-center gap-3 bg-slate-900/80 px-4 py-2 rounded-2xl border border-slate-700 backdrop-blur-md transition-all ${turn === PLAYER_TWO ? 'shadow-[0_0_15px_rgba(244,63,94,0.3)] border-rose-500/50 scale-105' : 'opacity-70'}`}>
                      <div className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"></div>
                      <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{opName}</span>
                          <span className="text-xl font-black text-rose-400 leading-none">{scores.rose}</span>
                      </div>
                  </div>

                  {/* LOG CENTRAL */}
                  <div className="flex-1 px-2 text-center hidden sm:block">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-black/40 px-3 py-1 rounded-full inline-block border border-white/5">{lastAction}</p>
                  </div>

                  {/* JUGADOR */}
                  <div className={`flex items-center gap-3 bg-slate-900/80 px-4 py-2 rounded-2xl border border-slate-700 backdrop-blur-md transition-all ${turn === PLAYER_ONE ? 'shadow-[0_0_15px_rgba(34,211,238,0.3)] border-cyan-500/50 scale-105' : 'opacity-70'}`}>
                      <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TÚ</span>
                          <span className="text-xl font-black text-cyan-400 leading-none">{scores.cyan}</span>
                      </div>
                      <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
                  </div>
              </div>
              
              <div className="w-full text-center sm:hidden mb-4">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-black/40 px-4 py-1.5 rounded-full inline-block border border-white/5">{lastAction}</p>
              </div>

              {/* TABLERO */}
              <div className="w-full max-w-[480px] aspect-square bg-[#0a0f1a] border-[6px] sm:border-[8px] border-slate-800 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] p-1.5 sm:p-2 relative">
                  <div className="w-full h-full grid grid-cols-8 grid-rows-8 border border-slate-700/50 rounded-xl overflow-hidden bg-slate-900">
                      {board.map((row, r) => row.map((cell, c) => {
                          const isBlack = (r + c) % 2 === 1;
                          const isSelected = selectedPiece?.r === r && selectedPiece?.c === c;
                          const isValidMove = validMoves.some(m => m.r === r && m.c === c);
                          
                          return (
                              <div 
                                key={`${r}-${c}`} 
                                onClick={() => handleCellClick(r, c)}
                                className={`relative flex items-center justify-center transition-colors
                                    ${isBlack ? 'bg-black/60' : 'bg-[#1e293b]'} 
                                    ${isValidMove ? 'cursor-pointer hover:bg-slate-700' : ''}
                                `}
                              >
                                  {/* Indicador de movimiento posible */}
                                  {isValidMove && <div className="absolute inset-0 m-2 sm:m-3 border-2 sm:border-[3px] border-green-500/50 rounded-full animate-pulse shadow-[inset_0_0_10px_rgba(34,197,94,0.3)]"></div>}
                                  
                                  {/* Pieza */}
                                  {cell && (
                                      <div className={`
                                          w-[75%] h-[75%] rounded-full shadow-lg flex items-center justify-center transition-all duration-300 relative
                                          ${cell.player === PLAYER_ONE ? 'bg-gradient-to-br from-cyan-400 to-blue-600 border-2 sm:border-[3px] border-cyan-200 shadow-[0_4px_10px_rgba(34,211,238,0.5)]' : 'bg-gradient-to-br from-rose-400 to-red-600 border-2 sm:border-[3px] border-rose-200 shadow-[0_4px_10px_rgba(244,63,94,0.5)]'} 
                                          ${isSelected ? 'scale-110 ring-4 ring-white z-10 animate-pulse' : 'hover:scale-105'} 
                                      `}>
                                          {/* Reflejo estilo cristal */}
                                          <div className="absolute top-[10%] left-[10%] w-[30%] h-[30%] bg-white/40 rounded-full blur-[1px]"></div>
                                          
                                          {/* Corona */}
                                          {cell.isKing && <Crown className={`w-[60%] h-[60%] ${cell.player === PLAYER_ONE ? 'text-white' : 'text-yellow-300'} drop-shadow-md z-10`}/>}
                                      </div>
                                  )}
                              </div>
                          );
                      }))}
                  </div>
              </div>

              {/* OVERLAY VICTORIA/DERROTA */}
              {winner && (
                  <div className="absolute inset-0 bg-[#020617]/95 flex flex-col items-center justify-center z-50 animate-in zoom-in backdrop-blur-sm p-4 text-center">
                      <div className={`p-8 rounded-[2.5rem] border-2 ${winner === PLAYER_ONE ? 'border-cyan-500 bg-cyan-950/30 shadow-[0_0_50px_rgba(6,182,212,0.3)]' : 'border-rose-600 bg-rose-950/30 shadow-[0_0_50px_rgba(244,63,94,0.3)]'} text-center max-w-md w-full relative overflow-hidden`}>
                          <div className={`absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] ${winner === PLAYER_ONE ? 'from-cyan-500' : 'from-rose-600'} to-transparent scale-150 animate-pulse`}></div>
                          <Trophy className={`w-24 h-24 mx-auto mb-6 animate-bounce relative z-10 ${winner === PLAYER_ONE ? 'text-yellow-400 drop-shadow-[0_0_30px_rgba(234,179,8,0.6)]' : 'text-slate-500'}`}/>
                          <h2 className="text-4xl font-black text-white italic mb-2 tracking-tighter uppercase relative z-10">{winner === PLAYER_ONE ? '¡VICTORIA ABSOLUTA!' : 'DERROTA TÁCTICA'}</h2>
                          
                          {winner === PLAYER_ONE ? (
                              <div className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-4 mb-6 relative z-10">
                                  <div className="flex justify-between items-center border-b border-slate-700/50 pb-2 mb-2">
                                      <span className="text-xs text-slate-400 uppercase font-bold flex items-center gap-2"><Clock className="w-3 h-3"/> Tiempo</span>
                                      <span className="text-white font-mono">{finalStats.time}s</span>
                                  </div>
                                  <div className="flex justify-between items-center border-b border-slate-700/50 pb-2 mb-2">
                                      <span className="text-xs text-slate-400 uppercase font-bold flex items-center gap-2"><Footprints className="w-3 h-3"/> Movimientos</span>
                                      <span className="text-white font-mono">{finalStats.moves}</span>
                                  </div>
                                  <div className="flex justify-between items-center mt-2">
                                      <span className="text-xs text-yellow-500 uppercase font-bold">Puntuación</span>
                                      <span className="text-2xl text-yellow-400 font-black font-mono">{finalStats.score}</span>
                                  </div>
                                  
                                  <div className="mt-4 bg-yellow-900/20 border border-yellow-500/30 px-4 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg">
                                      <Coins className="w-5 h-5 text-yellow-400"/>
                                      <span className="text-sm font-black text-yellow-100 uppercase tracking-widest">+{view === 'pve' ? 100 * difficulty : currentBetInfo?.value * 2 || 200} MONEDAS</span>
                                  </div>
                              </div>
                          ) : (
                              <p className="text-rose-300 text-xs uppercase tracking-[0.3em] mb-8 font-bold relative z-10">El tablero ha sido dominado</p>
                          )}

                          <button onClick={() => { setView('menu'); setBoard([]); setWinner(null); }} className={`w-full py-4 ${winner === PLAYER_ONE ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500' : 'bg-rose-700 hover:bg-rose-600'} text-white font-black rounded-xl hover:scale-105 active:scale-95 transition-all uppercase tracking-widest shadow-2xl relative z-10 text-sm border ${winner === PLAYER_ONE ? 'border-cyan-400' : 'border-rose-500'}`}>VOLVER AL MENÚ</button>
                      </div>
                  </div>
              )}
          </div>
      )}
      <div className="mt-auto opacity-80 w-full max-w-md pt-2 mb-2"><AdSpace type="banner" /><GameChat gameId={view.includes('pvp') ? roomCode : "global_checkers"} gameName="DAMAS" /></div>
    </div>
  );
}