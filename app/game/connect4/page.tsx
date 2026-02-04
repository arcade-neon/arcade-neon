// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Users, Cpu, Play, Undo2, Circle, Video, Brain, Shield, Swords } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, getDoc, serverTimestamp, query, orderBy, limit, getDocs, setDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

const COLS = 7;
const ROWS = 6;

// Configuraciones de IA
const DIFFICULTIES = {
  easy: { name: 'FÁCIL', color: 'text-green-400', border: 'border-green-500/50', bg: 'hover:bg-green-500/10' },
  medium: { name: 'NORMAL', color: 'text-yellow-400', border: 'border-yellow-500/50', bg: 'hover:bg-yellow-500/10' },
  hard: { name: 'DIFÍCIL', color: 'text-red-500', border: 'border-red-500/50', bg: 'hover:bg-red-500/10' }
};

export default function NeonConnect4() {
  const [view, setView] = useState('menu');
  const [user, setUser] = useState(null);
  
  // JUEGO
  const [board, setBoard] = useState(Array(ROWS).fill(null).map(() => Array(COLS).fill(null)));
  const [turn, setTurn] = useState('R'); // R (Red - Jugador) vs Y (Yellow - IA/Rival)
  const [winner, setWinner] = useState(null);
  const [lives, setLives] = useState(3); // "Undos"
  const [history, setHistory] = useState([]); 
  const [difficulty, setDifficulty] = useState('medium');
  const [winningCells, setWinningCells] = useState([]); // Para iluminar la línea ganadora

  // ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [opName, setOpName] = useState('Rival');
  const [isHost, setIsHost] = useState(false);

  // MONETIZACIÓN
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 });
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // --- SYNC ONLINE ---
  useEffect(() => {
    if (view.includes('pvp') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_connect4", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (isHost) setOpName(data.guestName || 'Esperando...');
                else setOpName(data.hostName || 'Host');

                if (data.board) setBoard(JSON.parse(data.board));
                if (data.turn) setTurn(data.turn);
                if (data.winner) {
                    setWinner(data.winner);
                    if(data.winningCells) setWinningCells(JSON.parse(data.winningCells));
                }
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode]);

  // --- LOGICA JUEGO ---
  const startGame = (mode, diff = 'medium') => {
      setBoard(Array(ROWS).fill(null).map(() => Array(COLS).fill(null)));
      setWinner(null);
      setWinningCells([]);
      setTurn('R');
      setLives(3);
      setHistory([]);
      setDifficulty(diff);
      setView(mode);
  };

  const dropPiece = async (colIndex) => {
      if (winner || (view === 'pvp_host' && turn !== 'R') || (view === 'pvp_guest' && turn !== 'Y') || (view === 'pve' && turn !== 'R')) return;

      // Encontrar fila vacía
      let rowIndex = -1;
      for (let r = ROWS - 1; r >= 0; r--) {
          if (!board[r][colIndex]) {
              rowIndex = r;
              break;
          }
      }

      if (rowIndex === -1) return; // Columna llena

      // Guardar historia para deshacer (Solo PvE)
      if (view === 'pve') setHistory([...history, board.map(row => [...row])]);

      const newBoard = board.map(row => [...row]);
      newBoard[rowIndex][colIndex] = turn;
      setBoard(newBoard);
      
      const winData = checkWin(newBoard, turn);

      if (winData) {
          setWinner(turn);
          setWinningCells(winData);
          if (view === 'pve') saveScore(difficulty === 'hard' ? 300 : difficulty === 'medium' ? 100 : 50);
          if (view.includes('pvp')) updateOnlineState(newBoard, turn, turn, winData);
      } else {
          const nextTurn = turn === 'R' ? 'Y' : 'R';
          setTurn(nextTurn);
          if (view.includes('pvp')) updateOnlineState(newBoard, nextTurn, null, []);
          else if (view === 'pve') setTimeout(() => playAi(newBoard, difficulty), 500);
      }
  };

  // --- IA MEJORADA POR NIVELES ---
  const playAi = (currentBoard, level) => {
      let col = -1;

      // 1. INTENTAR GANAR (Prioridad Máxima en todos los niveles menos Fácil)
      if (level !== 'easy') {
          col = findBestMove(currentBoard, 'Y');
      }

      // 2. BLOQUEAR AL JUGADOR (Si no puedo ganar, evito que gane él)
      if (col === -1 && level !== 'easy') {
          col = findBestMove(currentBoard, 'R');
      }

      // 3. ESTRATEGIA (Solo difícil: Priorizar centro)
      if (col === -1 && level === 'hard') {
          const center = 3;
          // Intentar centro si es válido
          if (!currentBoard[0][center]) col = center;
      }

      // 4. MOVIMIENTO ALEATORIO (Fallback)
      if (col === -1) {
          const validCols = [];
          for(let c=0; c<COLS; c++) if(!currentBoard[0][c]) validCols.push(c);
          if(validCols.length === 0) return;
          col = validCols[Math.floor(Math.random() * validCols.length)];
      }

      // EJECUTAR MOVIMIENTO IA
      const newBoard = currentBoard.map(row => [...row]);
      for (let r = ROWS - 1; r >= 0; r--) {
          if (!newBoard[r][col]) {
              newBoard[r][col] = 'Y';
              break;
          }
      }
      setBoard(newBoard);
      
      const winData = checkWin(newBoard, 'Y');
      if (winData) {
          setWinner('Y');
          setWinningCells(winData);
      } else {
          setTurn('R');
      }
  };

  // Simula si poner ficha en una columna lleva a victoria
  const findBestMove = (b, player) => {
      for (let c = 0; c < COLS; c++) {
          // Si columna llena, saltar
          if (b[0][c]) continue;
          
          // Simular caída
          let rIdx = -1;
          for (let r = ROWS - 1; r >= 0; r--) {
              if (!b[r][c]) { rIdx = r; break; }
          }
          
          // Probar victoria
          const tempBoard = b.map(row => [...row]);
          tempBoard[rIdx][c] = player;
          if (checkWin(tempBoard, player)) return c;
      }
      return -1;
  };

  const checkWin = (b, p) => {
      // Horizontal
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS - 3; c++)
          if (b[r][c]===p && b[r][c+1]===p && b[r][c+2]===p && b[r][c+3]===p) 
              return [[r,c], [r,c+1], [r,c+2], [r,c+3]];
      
      // Vertical
      for (let r = 0; r < ROWS - 3; r++)
        for (let c = 0; c < COLS; c++)
          if (b[r][c]===p && b[r+1][c]===p && b[r+2][c]===p && b[r+3][c]===p)
              return [[r,c], [r+1,c], [r+2,c], [r+3,c]];
      
      // Diagonal Descendente
      for (let r = 0; r < ROWS - 3; r++)
        for (let c = 0; c < COLS - 3; c++)
          if (b[r][c]===p && b[r+1][c+1]===p && b[r+2][c+2]===p && b[r+3][c+3]===p)
              return [[r,c], [r+1,c+1], [r+2,c+2], [r+3,c+3]];
      
      // Diagonal Ascendente
      for (let r = 3; r < ROWS; r++)
        for (let c = 0; c < COLS - 3; c++)
          if (b[r][c]===p && b[r-1][c+1]===p && b[r-2][c+2]===p && b[r-3][c+3]===p)
              return [[r,c], [r-1,c+1], [r-2,c+2], [r-3,c+3]];
              
      return null;
  };

  const undoMove = () => {
      if (lives > 0 && history.length > 0) {
          setLives(l => l - 1);
          setBoard(history[history.length - 1]);
          setHistory(h => h.slice(0, -1));
          setTurn('R');
          setWinner(null);
          setWinningCells([]);
      }
  };

  // --- ONLINE ---
  const updateOnlineState = async (b, t, w, wCells) => {
      await updateDoc(doc(db, "matches_connect4", roomCode), {
          board: JSON.stringify(b), turn: t, winner: w, winningCells: JSON.stringify(wCells)
      });
  };

  const createRoom = async () => {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_connect4", code), {
          host: user?.uid, hostName: user?.name,
          turn: 'R', winner: null, createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); setView('pvp_host');
  };

  const joinRoom = async (c) => {
      const ref = doc(db, "matches_connect4", c);
      await updateDoc(ref, { guest: user?.uid, guestName: user?.name });
      setRoomCode(c); setIsHost(false); setView('pvp_guest');
  };

  // --- ADS ---
  const watchAd = (type) => { setAdState({ active: true, type, timer: 5 }); };
  useEffect(() => {
    let interval = null;
    if (adState.active && adState.timer > 0) interval = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active && adState.timer === 0) { clearInterval(interval); finishAd(); }
    return () => clearInterval(interval);
  }, [adState.active]);

  const finishAd = () => {
      setAdState(p => ({ ...p, active: false }));
      if (adState.type === 'life') setLives(p => p + 2); 
  };

  const saveScore = async (s) => {
      if(user) { await addDoc(collection(db, "scores_connect4"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); fetchLeaderboard(); }
  };
  const fetchLeaderboard = async () => {
      const q = query(collection(db, "scores_connect4"), orderBy("score", "desc"), limit(5));
      const s = await getDocs(q); setLeaderboard(s.docs.map(d=>d.data()));
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-4 font-mono text-white select-none">
      {adState.active && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-6">
           <Video className="w-16 h-16 text-yellow-500 mb-4 animate-bounce" />
           <h2 className="text-2xl font-black mb-2">PUBLICIDAD</h2>
           <div className="text-4xl font-black text-white mb-6">{adState.timer}s</div>
        </div>
      )}

      {/* HEADER CORREGIDO */}
      <div className="w-full max-w-md flex justify-between items-center mb-6 z-10">
        <button 
            onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} 
            className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:bg-slate-800"
        >
            <ArrowLeft className="w-5 h-5 text-slate-400"/>
        </button>
        {view !== 'menu' && (
           <div className="flex gap-4 items-center">
               <div className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${turn === 'R' ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-500/50' : 'bg-slate-800 text-slate-500'}`}>ROJO (TÚ)</div>
               <div className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${turn === 'Y' ? 'bg-yellow-500 text-black scale-110 shadow-lg shadow-yellow-500/50' : 'bg-slate-800 text-slate-500'}`}>{view === 'pve' ? 'IA' : 'RIVAL'}</div>
           </div>
        )}
      </div>

      <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-yellow-500 mb-6 italic tracking-tighter">NEON CONNECT 4</h1>

      {view === 'menu' ? (
          <div className="w-full max-w-md grid gap-4 animate-in zoom-in">
              
              {/* IA SOLO CON NIVELES */}
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-2 mb-4">
                      <Cpu className="w-6 h-6 text-red-500"/>
                      <h2 className="text-xl font-black text-white">SOLO (IA)</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                      {Object.entries(DIFFICULTIES).map(([key, cfg]) => (
                          <button 
                            key={key} 
                            onClick={() => startGame('pve', key)} 
                            className={`py-3 bg-slate-950 rounded-xl text-[10px] font-bold border border-slate-800 transition-all ${cfg.color} ${cfg.bg} hover:border-current`}
                          >
                              {cfg.name}
                          </button>
                      ))}
                  </div>
              </div>

              {/* DUELO ONLINE */}
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2"><Swords className="w-5 h-5 text-yellow-500"/> DUELO ONLINE</h2>
                  <div className="flex gap-2">
                      <button onClick={createRoom} className="flex-1 py-3 bg-yellow-600 rounded-xl font-bold text-xs text-black hover:bg-yellow-500">CREAR</button>
                      <input id="code" placeholder="CÓDIGO" className="w-24 bg-black border border-slate-700 rounded-xl text-center font-bold"/>
                      <button onClick={() => joinRoom(document.getElementById('code').value)} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs border border-slate-700">UNIRSE</button>
                  </div>
              </div>

              {leaderboard.length > 0 && (
                <div className="bg-black/20 p-4 rounded-xl border border-white/5 mt-4">
                    <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2">TOP ESTRATEGAS</h3>
                    {leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-[10px] text-slate-400 border-b border-white/5 py-1"><span>#{i+1} {s.displayName}</span><span className="text-yellow-500">{s.score}</span></div>))}
                </div>
               )}
          </div>
      ) : (
          <div className="w-full max-w-md flex flex-col items-center flex-grow">
              {view.includes('pvp') && (
                  <div className="w-full mb-4 flex justify-between items-center px-4 bg-slate-900 py-2 rounded-lg">
                      <span className="text-xs text-slate-400">SALA: <span className="text-white font-bold">{roomCode}</span></span>
                      <span className="text-xs text-slate-500">VS {opName}</span>
                  </div>
              )}

              {/* TABLERO */}
              <div className="bg-blue-900/40 p-3 rounded-2xl shadow-[0_0_30px_rgba(30,58,138,0.3)] border border-blue-500/30 backdrop-blur-sm">
                  <div className="grid grid-cols-7 gap-2">
                      {board.map((row, r) => row.map((cell, c) => {
                          // Verificar si esta celda es parte de la línea ganadora
                          const isWinningCell = winningCells.some(([wr, wc]) => wr === r && wc === c);
                          
                          return (
                              <div 
                                key={`${r}-${c}`} 
                                onClick={() => dropPiece(c)} 
                                className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-slate-950 flex items-center justify-center cursor-pointer hover:bg-slate-900 transition-colors relative border border-slate-800 shadow-inner"
                              >
                                  {cell === 'R' && <div className={`w-full h-full bg-red-500 rounded-full shadow-[inset_0_-4px_4px_rgba(0,0,0,0.5),0_0_15px_#ef4444] ${isWinningCell ? 'animate-pulse brightness-125' : 'animate-in bounce-in duration-500'}`}></div>}
                                  {cell === 'Y' && <div className={`w-full h-full bg-yellow-400 rounded-full shadow-[inset_0_-4px_4px_rgba(0,0,0,0.5),0_0_15px_#facc15] ${isWinningCell ? 'animate-pulse brightness-125' : 'animate-in bounce-in duration-500'}`}></div>}
                              </div>
                          );
                      }))}
                  </div>
              </div>

              {/* CONTROLES */}
              <div className="flex gap-2 w-full mt-8 px-4">
                  {view === 'pve' && !winner && (
                      <button onClick={undoMove} disabled={lives <= 0 || history.length === 0} className="flex-1 py-4 bg-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 disabled:opacity-50 text-slate-300 hover:text-white hover:bg-slate-700 transition">
                          <Undo2 className="w-4 h-4"/> DESHACER ({lives})
                      </button>
                  )}
                  {view === 'pve' && lives < 5 && (
                      <button onClick={() => watchAd('life')} className="px-4 bg-green-900/20 rounded-xl border border-green-500/30 text-green-400 hover:bg-green-900/40 transition"><Video className="w-5 h-5"/></button>
                  )}
              </div>

              {winner && (
                  <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 animate-in zoom-in backdrop-blur-md">
                      <Trophy className={`w-24 h-24 mb-6 animate-bounce ${winner === 'R' ? 'text-red-500 drop-shadow-[0_0_20px_#ef4444]' : 'text-yellow-400 drop-shadow-[0_0_20px_#facc15]'}`}/>
                      <h2 className="text-4xl font-black text-white mb-8 italic tracking-tighter">{winner === 'R' ? '¡VICTORIA ROJA!' : 'GANA AMARILLO'}</h2>
                      <button onClick={() => setView('menu')} className="w-64 py-4 bg-slate-800 rounded-xl font-bold border border-slate-700 hover:bg-slate-700 transition">VOLVER AL MENÚ</button>
                  </div>
              )}
          </div>
      )}
      <div className="mt-auto w-full max-w-md pt-4 opacity-75"><AdSpace type="banner" /><GameChat gameId="global_connect4" gameName="CONNECT 4" /></div>
    </div>
  );
}