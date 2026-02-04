// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, RefreshCw, Users, Cpu, Copy, Hash, X as XIcon, Circle, History } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, getDoc, serverTimestamp, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- CONFIGURACIÓN ---
const WIN_TARGET = 5; 
const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export default function NeonTicTacToe() {
  const [view, setView] = useState('menu'); 
  const [user, setUser] = useState(null);
  
  // ESTADO JUEGO
  const [board, setBoard] = useState(Array(9).fill(null));
  const [turn, setTurn] = useState('X');
  const [myScore, setMyScore] = useState(0);
  const [opScore, setOpScore] = useState(0);
  const [winner, setWinner] = useState(null);
  const [winningLine, setWinningLine] = useState([]);
  
  // ESTADO ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [opName, setOpName] = useState('Esperando...');
  const [opId, setOpId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  
  // ESTADÍSTICAS AVANZADAS
  const [rawHistory, setRawHistory] = useState([]); 
  const [statsTimeframe, setStatsTimeframe] = useState('all'); 
  const [displayedStats, setDisplayedStats] = useState({ wins: 0, losses: 0, draws: 0 });

  // RANKING
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // --- ESTADÍSTICAS ---
  useEffect(() => {
      if (rawHistory.length === 0) return;
      const now = new Date();
      let wins = 0, losses = 0, draws = 0;

      rawHistory.forEach(game => {
          if (!game.date) return;
          const gameDate = game.date.toDate();
          let include = false;
          if (statsTimeframe === 'all') include = true;
          else if (statsTimeframe === 'month') include = (gameDate.getMonth() === now.getMonth() && gameDate.getFullYear() === now.getFullYear());
          else if (statsTimeframe === 'week') {
              const diffTime = Math.abs(now - gameDate);
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
              include = diffDays <= 7;
          } else if (statsTimeframe === 'day') include = (gameDate.getDate() === now.getDate() && gameDate.getMonth() === now.getMonth() && gameDate.getFullYear() === now.getFullYear());

          if (include) {
              if (game.winner === user?.uid) wins++;
              else if (game.winner === 'draw') draws++;
              else losses++;
          }
      });
      setDisplayedStats({ wins, losses, draws });
  }, [rawHistory, statsTimeframe, user]);

  const fetchRivalryHistory = async (opponentId) => {
      if (!user || !opponentId) return;
      try {
        const historyRef = collection(db, "history_tictactoe");
        const q1 = query(historyRef, where("p1", "==", user.uid), where("p2", "==", opponentId));
        const q2 = query(historyRef, where("p1", "==", opponentId), where("p2", "==", user.uid));
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const games = [];
        snap1.forEach(doc => games.push(doc.data()));
        snap2.forEach(doc => games.push(doc.data()));
        setRawHistory(games);
      } catch (e) { console.error("Error stats:", e); }
  };

  // --- ONLINE SYNC ---
  useEffect(() => {
    if ((view === 'pvp_host' || view === 'pvp_guest') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_tictactoe", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (isHost) {
                    if (data.guestName && data.guestName !== opName) {
                        setOpName(data.guestName); setOpId(data.guest); fetchRivalryHistory(data.guest);
                    }
                } else {
                    if (data.hostName && data.hostName !== opName) {
                        setOpName(data.hostName); setOpId(data.host); fetchRivalryHistory(data.host);
                    }
                    setMyScore(data.guestScore); setOpScore(data.hostScore);
                }
                setBoard(data.board);
                setTurn(data.turn);
                if (data.winner) { setWinner(data.winner); setWinningLine(data.winningLine || []); }
                else { if (winner && !data.winner) { setWinner(null); setWinningLine([]); } }
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode]);

  const recordGameResult = async (winnerId) => {
      if (!isHost || !opId) return;
      try {
          await addDoc(collection(db, "history_tictactoe"), {
              p1: user.uid, p2: opId,
              winner: winnerId === 'X' ? user.uid : (winnerId === 'O' ? opId : 'draw'),
              date: serverTimestamp(), gameType: 'tictactoe'
          });
          fetchRivalryHistory(opId);
      } catch (e) {}
  };

  // --- GAMEPLAY CORREGIDO ---
  const handleCellClick = (index) => {
      if (board[index] || winner) return;
      if (view === 'pvp_host' && turn !== 'X') return;
      if (view === 'pvp_guest' && turn !== 'O') return;
      if (view === 'pve' && turn !== 'X') return; // Bloquear si no es turno del jugador
      
      // Pasamos 'board' actual explícitamente
      makeMove(index, turn, board);
  };

  // CORRECCIÓN CLAVE: Añadido parámetro 'currentBoard'
  const makeMove = async (index, player, currentBoard) => {
      const newBoard = [...currentBoard]; 
      newBoard[index] = player; 
      setBoard(newBoard); // Actualizamos estado visual
      
      const winInfo = checkWinner(newBoard);
      
      if (winInfo) {
          setWinner(winInfo.winner); setWinningLine(winInfo.line);
          let newMy = myScore, newOp = opScore;
          if (winInfo.winner === 'X') (view==='pve'||isHost) ? newMy++ : newOp++;
          else if (winInfo.winner === 'O') (view==='pve'||isHost) ? newOp++ : newMy++;
          
          setMyScore(newMy); setOpScore(newOp);

          if (view.includes('pvp')) {
              if (isHost) {
                  await updateDoc(doc(db, "matches_tictactoe", roomCode), { board: newBoard, winner: winInfo.winner, winningLine: winInfo.line, hostScore: newMy, guestScore: newOp });
                  recordGameResult(winInfo.winner);
              }
          }
          checkMatchEnd(newMy, newOp);
      } else {
          const nextTurn = player==='X'?'O':'X'; 
          setTurn(nextTurn);
          
          if (view.includes('pvp')) {
              await updateDoc(doc(db, "matches_tictactoe", roomCode), { board: newBoard, turn: nextTurn });
          } 
          else if (view === 'pve' && nextTurn === 'O') {
              // CORRECCIÓN: Pasamos el 'newBoard' actualizado a la IA
              setTimeout(() => playAi(newBoard), 500);
          }
      }
  };

  const playAi = (boardForAi) => {
      if (winner) return;

      const empty = boardForAi.map((v, i) => v === null ? i : null).filter(v => v !== null);
      if (empty.length === 0) return;
      
      let move = null;
      // 1. Ganar
      for (let i of empty) { const t=[...boardForAi]; t[i]='O'; if(checkWinner(t)){move=i;break;}}
      // 2. Bloquear
      if (move === null) { for (let i of empty) { const t=[...boardForAi]; t[i]='X'; if(checkWinner(t)){move=i;break;}} }
      // 3. Centro/Random
      if (move === null && boardForAi[4]===null) move=4;
      if (move === null) move=empty[Math.floor(Math.random()*empty.length)];
      
      // CORRECCIÓN: La IA usa el tablero actualizado para hacer su movimiento
      makeMove(move, 'O', boardForAi);
  };

  const checkWinner = (sq) => {
      for (let i=0; i<WIN_PATTERNS.length; i++) {
          const [a,b,c] = WIN_PATTERNS[i];
          if (sq[a] && sq[a]===sq[b] && sq[a]===sq[c]) return {winner:sq[a], line:WIN_PATTERNS[i]};
      }
      if (!sq.includes(null)) return {winner:'draw', line:[]};
      return null;
  };

  const checkMatchEnd = (p, o) => { if ((p>=WIN_TARGET || o>=WIN_TARGET) && view==='pve' && p>=WIN_TARGET) saveScore(p*100); };

  const nextRound = async () => {
      setBoard(Array(9).fill(null)); setWinner(null); setWinningLine([]); setTurn('X');
      if (view.includes('pvp') && isHost) await updateDoc(doc(db, "matches_tictactoe", roomCode), { board: Array(9).fill(null), winner: null, winningLine: [], turn: 'X' });
  };

  const createRoom = async () => {
      const code = Math.floor(1000+Math.random()*9000).toString();
      await setDoc(doc(db, "matches_tictactoe", code), { host: user?.uid, hostName: user?.name, hostScore:0, guestScore:0, board:Array(9).fill(null), turn:'X', status:'playing', createdAt:serverTimestamp() });
      setRoomCode(code); setIsHost(true); resetGame(); setView('pvp_host');
  };
  const joinRoom = async (c) => {
      const r = doc(db, "matches_tictactoe", c); const s = await getDoc(r);
      if(!s.exists()) return alert("Error");
      await updateDoc(r, { guest: user?.uid, guestName: user?.name });
      setRoomCode(c); setOpName(s.data().hostName); setOpId(s.data().host); fetchRivalryHistory(s.data().host);
      setIsHost(false); resetGame(); setView('pvp_guest');
  };
  const resetGame = () => { setMyScore(0); setOpScore(0); setBoard(Array(9).fill(null)); setWinner(null); setWinningLine([]); setTurn('X'); };

  const saveScore = async (s) => { if(user) { try { await addDoc(collection(db, "scores_tictactoe"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); fetchLeaderboard(); } catch(e){} } };
  const fetchLeaderboard = async () => { try{ const q=query(collection(db,"scores_tictactoe"),orderBy("score","desc"),limit(5)); const s=await getDocs(q); setLeaderboard(s.docs.map(d=>d.data())); }catch(e){} };

  const isMatchOver = myScore >= WIN_TARGET || opScore >= WIN_TARGET;

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-4 font-mono text-white select-none">
      
      <div className="w-full max-w-md flex justify-between items-center mb-6 z-10">
        <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:bg-slate-800 transition"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
        {view !== 'menu' && (
           <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-full border border-slate-700">
               <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
               <span className="text-[10px] font-bold text-slate-400">{view.includes('pvp') ? 'ONLINE' : 'VS IA'}</span>
           </div>
        )}
      </div>

      <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-500 mb-2 text-center italic tracking-tighter">NEON 3 EN RAYA</h1>

      {view === 'menu' && (
          <div className="w-full max-w-md grid gap-4 animate-in zoom-in">
              <button onClick={() => { resetGame(); setView('pve'); }} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex items-center gap-4 hover:border-cyan-500/50 transition group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-bl-full -mr-6 -mt-6 transition-all group-hover:bg-cyan-500/20"></div>
                  <div className="p-4 bg-slate-950 rounded-xl group-hover:bg-cyan-900/20 transition"><Cpu className="w-8 h-8 text-cyan-400"/></div>
                  <div className="text-left z-10">
                      <h2 className="text-xl font-black text-white">1 JUGADOR</h2>
                      <p className="text-xs text-slate-400">Entrena contra la máquina.</p>
                  </div>
              </button>
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/10 rounded-bl-full -mr-6 -mt-6 transition-all group-hover:bg-pink-500/20"></div>
                  <div className="flex items-center gap-4 mb-4 z-10 relative">
                      <div className="p-4 bg-slate-950 rounded-xl"><Users className="w-8 h-8 text-pink-500"/></div>
                      <div className="text-left">
                          <h2 className="text-xl font-black text-white">2 JUGADORES</h2>
                          <p className="text-xs text-slate-400">Crea sala. Carrera a {WIN_TARGET}.</p>
                      </div>
                  </div>
                  <div className="flex gap-2 z-10 relative">
                      <button onClick={createRoom} className="flex-1 py-3 bg-pink-600 rounded-xl font-bold text-xs hover:bg-pink-500 shadow-lg">CREAR SALA</button>
                      <button onClick={() => setView('pvp_menu')} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-700">UNIRSE</button>
                  </div>
              </div>
              {leaderboard.length > 0 && (
                <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                    <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex gap-1"><Trophy className="w-3 h-3"/> CAMPEONES</h3>
                    {leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-[10px] text-slate-400 border-b border-white/5 py-1"><span>#{i+1} {s.displayName}</span><span className="text-cyan-500">{s.score} pts</span></div>))}
                </div>
               )}
          </div>
      )}

      {view === 'pvp_menu' && (
          <div className="w-full max-w-md bg-slate-900 p-6 rounded-2xl border border-slate-700 animate-in fade-in">
              <h2 className="text-lg font-bold mb-4">CÓDIGO DE SALA</h2>
              <input type="number" id="code-input" placeholder="0000" className="w-full bg-black border border-slate-700 rounded-xl p-4 text-center text-4xl font-black text-white mb-4 outline-none focus:border-pink-500 tracking-[1em]"/>
              <button onClick={() => joinRoom(document.getElementById('code-input').value)} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition">ENTRAR</button>
          </div>
      )}

      {view.includes('p') && view !== 'pvp_menu' && (
          <div className="w-full max-w-md flex flex-col items-center animate-in zoom-in w-full">
              
              {view.includes('pvp') && (
                  <div className="w-full mb-6">
                       <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700">
                                <span className="text-[10px] text-slate-400">SALA: <b className="text-white select-all">{roomCode}</b></span>
                                {isHost && <Copy className="w-3 h-3 text-slate-500 cursor-pointer" onClick={() => navigator.clipboard.writeText(roomCode)}/>}
                            </div>
                            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500">
                                <History className="w-3 h-3" /> HISTORIAL
                            </div>
                       </div>
                       <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                           <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-1">
                               <div className="flex gap-1">
                                   {['all', 'month', 'week', 'day'].map((t) => (
                                       <button key={t} onClick={() => setStatsTimeframe(t)} className={`px-2 py-1 rounded text-[9px] font-bold transition ${statsTimeframe === t ? 'bg-cyan-900 text-cyan-400' : 'text-slate-500 hover:text-white'}`}>{t === 'all' ? 'TOTAL' : t === 'month' ? 'MES' : t === 'week' ? 'SEM' : 'HOY'}</button>
                                   ))}
                               </div>
                               <span className="text-[10px] font-bold text-slate-300 truncate max-w-[100px]">VS {opName}</span>
                           </div>
                           <div className="flex justify-around text-xs font-bold">
                               <div className="text-center"><span className="text-green-400">{displayedStats.wins}</span><br/><span className="text-[8px] text-slate-500">VICTORIAS</span></div>
                               <div className="text-center"><span className="text-slate-400">{displayedStats.draws}</span><br/><span className="text-[8px] text-slate-500">EMPATES</span></div>
                               <div className="text-center"><span className="text-red-400">{displayedStats.losses}</span><br/><span className="text-[8px] text-slate-500">DERROTAS</span></div>
                           </div>
                       </div>
                  </div>
              )}

              {/* MARCADOR ACTUAL */}
              <div className="flex justify-between items-end w-full px-4 mb-8">
                  <div className="text-center w-1/3">
                      <p className="text-[10px] font-bold text-cyan-400 mb-1 truncate">{view === 'pvp_guest' ? 'O (TÚ)' : 'X (TÚ)'}</p>
                      <div className="text-5xl font-black text-white drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">{myScore}</div>
                  </div>
                  <div className="text-center w-1/3 pb-2 flex flex-col items-center">
                      <p className="text-[10px] font-bold text-slate-500 tracking-[0.2em] mb-1">META: {WIN_TARGET}</p>
                      <div className="text-xs font-bold text-white bg-slate-800 px-2 py-1 rounded">
                          {winner ? (winner === 'draw' ? 'EMPATE' : '¡PUNTO!') : (turn === 'X' ? 'TURNO X' : 'TURNO O')}
                      </div>
                  </div>
                  <div className="text-center w-1/3">
                      <p className="text-[10px] font-bold text-pink-500 mb-1 truncate">{view === 'pve' ? 'CPU' : (view === 'pvp_guest' ? 'X (HOST)' : 'O (GUEST)')}</p>
                      <div className="text-5xl font-black text-white drop-shadow-[0_0_10px_rgba(236,72,153,0.5)]">{opScore}</div>
                  </div>
              </div>

              {/* GRID */}
              <div className={`grid grid-cols-3 gap-2 p-2 bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl mb-6 ${isMatchOver ? 'opacity-50 pointer-events-none' : ''}`}>
                  {board.map((cell, i) => (
                      <button key={i} onClick={() => handleCellClick(i)} className={`w-20 h-20 sm:w-24 sm:h-24 bg-slate-950 rounded-xl flex items-center justify-center text-5xl font-black transition-all active:scale-95 ${winningLine.includes(i) ? 'bg-slate-800 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]' : ''} ${!cell && !winner && ((turn==='X' && (view==='pve' || view==='pvp_host')) || (turn==='O' && view==='pvp_guest')) ? 'hover:bg-slate-900' : ''}`}>
                          {cell === 'X' && <XIcon className={`w-12 h-12 text-cyan-400 ${winningLine.includes(i) ? 'animate-bounce drop-shadow-[0_0_10px_#22d3ee]' : ''}`}/>}
                          {cell === 'O' && <Circle className={`w-10 h-10 text-pink-500 ${winningLine.includes(i) ? 'animate-bounce drop-shadow-[0_0_10px_#ec4899]' : ''}`}/>}
                      </button>
                  ))}
              </div>

              {!isMatchOver ? (
                  winner && (
                      <div className="animate-in fade-in slide-in-from-bottom-4 text-center">
                          <p className="text-xl font-bold text-white mb-2">{winner === 'draw' ? '¡EMPATE!' : `¡PUNTO PARA ${winner}!`}</p>
                          {(view === 'pve' || isHost) && (
                              <button onClick={nextRound} className="px-6 py-2 bg-white text-black font-bold rounded-full hover:scale-105 transition flex items-center gap-2 mx-auto">SIGUIENTE RONDA <ArrowLeft className="w-4 h-4 rotate-180"/></button>
                          )}
                          {view === 'pvp_guest' && <p className="text-xs text-slate-500 animate-pulse">Esperando al Host...</p>}
                      </div>
                  )
              ) : (
                  <div className="w-full bg-slate-900 border border-slate-700 p-6 rounded-2xl text-center animate-in zoom-in">
                      {myScore >= WIN_TARGET ? <><Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-2 animate-bounce"/><h2 className="text-3xl font-black text-white mb-2">¡VICTORIA!</h2></> : <><div className="text-6xl mb-2">💀</div><h2 className="text-3xl font-black text-white mb-2">DERROTA</h2></>}
                      <button onClick={() => setView('menu')} className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:scale-105 transition flex items-center justify-center gap-2 mx-auto"><RefreshCw className="w-4 h-4"/> VOLVER AL MENÚ</button>
                  </div>
              )}
          </div>
      )}
      <div className="mt-auto w-full max-w-md pt-4 opacity-75"><AdSpace type="banner" /><GameChat gameId="global_tictactoe" gameName="3 EN RAYA" /></div>
    </div>
  );
}