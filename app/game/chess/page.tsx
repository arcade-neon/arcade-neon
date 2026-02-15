// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Trophy, Users, Clock, 
  Cpu, Zap, Crown, Eye, Video, Swords, 
  Move, Coins, Activity, Settings, BookOpen, X, 
  ToggleLeft, ToggleRight, ChevronRight
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, onSnapshot, getDoc, serverTimestamp, setDoc, collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- PIEZAS STAUNTON HD ---
const PIECES = {
  'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
  'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
  'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
  'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
  'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
  'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
  'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
  'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
  'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
  'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
  'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
  'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg'
};

const INITIAL_BOARD = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  Array(8).fill(null), Array(8).fill(null), Array(8).fill(null), Array(8).fill(null),
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
];

const DIFFICULTIES = {
    easy: { label: 'NOVATO', bonus: 100, aggression: 0.1 },
    medium: { label: 'EXPERTO', bonus: 300, aggression: 0.5 },
    hard: { label: 'MAESTRO', bonus: 1000, aggression: 0.9 }
};

// --- COMPONENTE: PANEL DE AJUSTES (SIDEBAR) ---
const SettingsModal = ({ isOpen, onClose, settings, setSettings }) => {
    const [tab, setTab] = useState('settings'); 

    if (!isOpen) return null;

    const Toggle = ({ label, active, onClick }) => (
        <div onClick={onClick} className="flex justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800 cursor-pointer hover:border-emerald-500/50 transition mb-3 select-none">
            <span className="font-bold text-sm text-slate-200">{label}</span>
            {active ? <ToggleRight className="w-8 h-8 text-emerald-400"/> : <ToggleLeft className="w-8 h-8 text-slate-600"/>}
        </div>
    );

    return (
        <div className="fixed inset-0 z-[99999] flex justify-end">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            
            <div className="relative w-full max-w-sm h-full bg-[#0f172a] border-l border-slate-700 shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-300">
                <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                    <h2 className="text-xl font-black text-white flex items-center gap-2 uppercase tracking-wider">
                        {tab === 'settings' ? <><Settings className="w-5 h-5 text-emerald-400"/> Ajustes</> : <><BookOpen className="w-5 h-5 text-emerald-400"/> Reglas</>}
                    </h2>
                    <button onClick={onClose} className="p-2 bg-slate-900 rounded-full hover:bg-red-500 hover:text-white text-slate-400 transition"><X className="w-5 h-5"/></button>
                </div>

                {tab === 'settings' && (
                    <div className="space-y-6">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Visualización</p>
                            <Toggle label="Rastro de Movimiento" active={settings.showShadow} onClick={() => setSettings(s => ({...s, showShadow: !s.showShadow}))} />
                            <Toggle label="Ayudas (Puntos Verdes)" active={settings.showHints} onClick={() => setSettings(s => ({...s, showHints: !s.showHints}))} />
                            <Toggle label="Coordenadas (A-H, 1-8)" active={settings.showCoords} onClick={() => setSettings(s => ({...s, showCoords: !s.showCoords}))} />
                        </div>

                        <div className="pt-4 border-t border-slate-800">
                            <button onClick={() => setTab('rules')} className="w-full py-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500 rounded-xl font-bold text-white flex justify-between items-center px-4 transition group">
                                <span className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-emerald-500"/> Cómo Jugar</span>
                                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-500"/>
                            </button>
                        </div>
                        
                        <div className="mt-auto pt-8">
                            <button onClick={onClose} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl shadow-lg uppercase tracking-widest transition">
                                VOLVER AL JUEGO
                            </button>
                        </div>
                    </div>
                )}

                {tab === 'rules' && (
                    <div className="space-y-6 animate-in slide-in-from-right-10">
                        <button onClick={() => setTab('settings')} className="text-xs font-bold text-emerald-400 flex items-center gap-1 mb-4 hover:underline"><ArrowLeft className="w-3 h-3"/> VOLVER A AJUSTES</button>
                        <div className="space-y-4">
                            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                                <h3 className="font-bold text-white mb-1">Objetivo</h3>
                                <p className="text-sm text-slate-400">Capturar al Rey enemigo (Jaque Mate).</p>
                            </div>
                            <h3 className="font-bold text-white text-sm uppercase tracking-widest mt-6">Piezas</h3>
                            {[
                                {n: 'Peón', d: 'Avanza 1 (2 al inicio). Come diagonal.', i: PIECES['P']},
                                {n: 'Torre', d: 'Línea recta horizontal/vertical.', i: PIECES['R']},
                                {n: 'Caballo', d: 'Salta en forma de "L".', i: PIECES['N']},
                                {n: 'Alfil', d: 'Diagonales del mismo color.', i: PIECES['B']},
                                {n: 'Reina', d: 'Combina Torre y Alfil.', i: PIECES['Q']},
                                {n: 'Rey', d: '1 casilla cualquier dirección.', i: PIECES['K']},
                            ].map((p, i) => (
                                <div key={i} className="flex items-center gap-3 border-b border-slate-800 pb-3 last:border-0">
                                    <img src={p.i} className="w-8 h-8"/>
                                    <div><strong className="text-white text-sm block">{p.n}</strong><span className="text-xs text-slate-500">{p.d}</span></div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- COMPONENTE AD ---
const VideoAdOverlay = ({ onComplete, onCancel }) => {
    const [timer, setTimer] = useState(5);
    useEffect(() => {
        if(timer > 0) { const i = setInterval(() => setTimer(t => t - 1), 1000); return () => clearInterval(i); } 
        else { const t = setTimeout(onComplete, 500); return () => clearTimeout(t); }
    }, [timer, onComplete]);

    return (
        <div className="fixed inset-0 z-[100000] bg-black flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 rounded-3xl border border-slate-700 p-8 shadow-2xl text-center relative">
                <button onClick={onCancel} className="absolute top-4 right-4 text-white/50 hover:text-white"><X/></button>
                <Video className="w-16 h-16 text-emerald-500 mb-4 mx-auto animate-pulse"/>
                <h3 className="text-xl font-black text-white mb-2">ANALIZANDO JUGADA</h3>
                <div className="text-4xl font-mono font-black text-emerald-400 mb-4">{timer}s</div>
            </div>
        </div>
    );
};

export default function ChessPro() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);
  const [view, setView] = useState('menu'); 

  // ESTADO
  const [board, setBoard] = useState(INITIAL_BOARD);
  const boardRef = useRef(INITIAL_BOARD);
  const [turn, setTurn] = useState('white'); 
  const [selected, setSelected] = useState(null); 
  const [validMoves, setValidMoves] = useState([]);
  const [gameState, setGameState] = useState('idle'); 
  const [winner, setWinner] = useState(null);
  const [difficulty, setDifficulty] = useState('medium');
  const [lastMove, setLastMove] = useState(null);
  
  // CONFIGURACIÓN (Settings)
  const [settings, setSettings] = useState({ showShadow: true, showHints: true, showCoords: true });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // STATS
  const [moveCount, setMoveCount] = useState(0);
  const [gameTime, setGameTime] = useState(0);

  // ONLINE & ADS
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opName, setOpName] = useState('Rival');
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [currentBetInfo, setCurrentBetInfo] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [showAd, setShowAd] = useState(false);

  // --- INIT ---
  const fetchLeaderboard = async () => { try { const q = query(collection(db, "scores_chess"), orderBy("moves", "asc"), limit(5)); const s = await getDocs(q); setLeaderboard(s.docs.map(d=>d.data())); } catch(e){} };
  useEffect(() => { const u = onAuthStateChanged(auth, (u) => setUser(u ? { uid: u.uid, name: u.displayName || 'Jugador' } : null)); fetchLeaderboard(); return () => u(); }, []);
  useEffect(() => { let i; if (gameState === 'playing' || gameState === 'cpu_thinking') i = setInterval(() => setGameTime(t => t + 1), 1000); return () => clearInterval(i); }, [gameState]);

  // --- CPU ---
  useEffect(() => {
      if (view === 'pve' && turn === 'black' && gameState !== 'checkmate') {
          setGameState('cpu_thinking');
          const timer = setTimeout(() => { try { performCpuMove(); } catch (e) { setGameState('playing'); } }, 600);
          return () => clearTimeout(timer);
      }
  }, [turn, view, gameState]);

  // --- SYNC ONLINE ---
  useEffect(() => {
    if (view === 'pvp_game' && roomCode) {
        const unsub = onSnapshot(doc(db, "matches_chess", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.betInfo) setCurrentBetInfo(data.betInfo);
                if (isHost) setOpName(data.guestName || 'Esperando...');
                else setOpName(data.hostName || 'Host');
                if (data.boardStr) {
                    const newB = JSON.parse(data.boardStr);
                    setBoard(newB); boardRef.current = newB;
                    setTurn(data.turn);
                    if (data.winner) { setGameState('checkmate'); setWinner(data.winner); }
                }
            }
        });
        return () => { setTimeout(() => unsub && unsub(), 0); };
    }
  }, [view, roomCode]);

  // --- LOGIC ---
  const isWhite = (p) => p === p.toUpperCase();
  const getPieceColor = (p) => !p ? null : (isWhite(p) ? 'white' : 'black');

  const getValidMoves = (boardState, r, c) => {
      const piece = boardState[r][c];
      if (!piece) return [];
      const moves = [];
      const color = getPieceColor(piece);
      const type = piece.toLowerCase();
      const addMove = (nr, nc) => {
          if (nr>=0 && nr<8 && nc>=0 && nc<8) {
              const target = boardState[nr][nc];
              if (!target || getPieceColor(target) !== color) { moves.push({r: nr, c: nc}); return !target; }
          }
          return false;
      };
      if (type === 'p') {
          const dir = color === 'white' ? -1 : 1;
          const startRow = color === 'white' ? 6 : 1;
          if (boardState[r+dir] && !boardState[r+dir][c]) {
              moves.push({r: r+dir, c});
              if (r === startRow && !boardState[r+dir*2][c]) moves.push({r: r+dir*2, c});
          }
          [[dir, 1], [dir, -1]].forEach(([dr, dc]) => {
              if (boardState[r+dr] && boardState[r+dr][c+dc] && getPieceColor(boardState[r+dr][c+dc]) !== color) moves.push({r: r+dr, c: c+dc});
          });
      } else {
          const directions = {
              'n': [[-2,-1], [-2,1], [-1,-2], [-1,2], [1,-2], [1,2], [2,-1], [2,1]], 'b': [[-1,-1], [-1,1], [1,-1], [1,1]],
              'r': [[-1,0], [1,0], [0,-1], [0,1]], 'q': [[-1,-1], [-1,1], [1,-1], [1,1], [-1,0], [1,0], [0,-1], [0,1]],
              'k': [[-1,-1], [-1,1], [1,-1], [1,1], [-1,0], [1,0], [0,-1], [0,1]]
          };
          const isSliding = ['b', 'r', 'q'].includes(type);
          directions[type].forEach(([dr, dc]) => {
              let nr = r + dr, nc = c + dc;
              if (isSliding) { while (addMove(nr, nc)) { nr += dr; nc += dc; } } else { addMove(nr, nc); }
          });
      }
      return moves;
  };

  const handleSquareClick = (r, c) => {
      if (gameState !== 'playing') return;
      if (view === 'pvp_game' && turn !== (isHost ? 'white' : 'black')) return;
      if (view === 'pve' && turn === 'black') return; 

      const currentBoard = boardRef.current;
      const clickedPiece = currentBoard[r][c];
      const clickedColor = getPieceColor(clickedPiece);

      if (clickedColor === turn) {
          setSelected({r, c});
          setValidMoves(getValidMoves(currentBoard, r, c));
          playSound('click');
      } else if (selected) {
          const move = validMoves.find(m => m.r === r && m.c === c);
          if (move) executeMove(selected, {r, c});
          else { setSelected(null); setValidMoves([]); }
      }
  };

  const executeMove = (from, to, isCpu = false) => {
      const currentBoard = boardRef.current;
      const newBoard = currentBoard.map(row => [...row]);
      const piece = newBoard[from.r][from.c];
      const target = newBoard[to.r][to.c];

      newBoard[to.r][to.c] = piece;
      newBoard[from.r][from.c] = null;

      if (piece.toLowerCase() === 'p' && (to.r === 0 || to.r === 7)) {
          newBoard[to.r][to.c] = isWhite(piece) ? 'Q' : 'q';
          playSound('powerup');
      } else target ? playSound('capture') : playSound('move');

      setBoard(newBoard);
      boardRef.current = newBoard;
      setLastMove({from, to});
      setSelected(null);
      setValidMoves([]);
      
      if (!isCpu) setMoveCount(m => m + 1);

      if (target && target.toLowerCase() === 'k') { handleGameOver(turn); return; }

      const nextTurn = turn === 'white' ? 'black' : 'white';
      setTurn(nextTurn);
      if (isCpu) setGameState('playing');
      if (view === 'pvp_game') updateDoc(doc(db, "matches_chess", roomCode), { boardStr: JSON.stringify(newBoard), turn: nextTurn });
  };

  const performCpuMove = () => {
      const currentBoard = boardRef.current;
      const moves = [];
      for(let r=0; r<8; r++) {
          for(let c=0; c<8; c++) {
              if (currentBoard[r][c] && !isWhite(currentBoard[r][c])) {
                  const valids = getValidMoves(currentBoard, r, c);
                  valids.forEach(dest => moves.push({ from: {r,c}, to: dest }));
              }
          }
      }

      if (moves.length === 0) { setGameState('playing'); return; }

      let bestMove = moves[Math.floor(Math.random() * moves.length)];
      let bestScore = -Infinity;
      const aggression = DIFFICULTIES[difficulty].aggression;

      moves.forEach(move => {
          const target = currentBoard[move.to.r][move.to.c];
          let score = 0;
          if (target) {
              const val = { 'q':90, 'r':50, 'b':30, 'n':30, 'p':10, 'k':1000 }[target.toLowerCase()] || 0;
              score += val;
          }
          if (Math.random() < aggression && score > bestScore) { bestScore = score; bestMove = move; }
      });

      executeMove(bestMove.from, bestMove.to, true);
  };

  const handleGameOver = (w) => {
      setWinner(w);
      setGameState('checkmate');
      if (w === 'white' && view === 'pve') {
          playSound('win');
          const bonus = DIFFICULTIES[difficulty].bonus;
          addCoins(bonus, "Victoria Ajedrez");
          saveScore(moveCount, gameTime);
      } else playSound('lose');
      if (view === 'pvp_game') updateDoc(doc(db, "matches_chess", roomCode), { winner: w });
  };

  const saveScore = async(m, t) => { if(user) { await addDoc(collection(db, "scores_chess"), { uid:user.uid, displayName:user.name, moves: m, time: t, date:serverTimestamp() }); fetchLeaderboard(); }};
  const triggerAd = () => { setShowAd(true); };
  const onAdSuccess = () => {
      setShowAd(false);
      const currentBoard = boardRef.current;
      for(let r=0; r<8; r++) for(let c=0; c<8; c++) {
          if (currentBoard[r][c] && isWhite(currentBoard[r][c])) {
              const valids = getValidMoves(currentBoard, r, c);
              if (valids.length > 0) { setSelected({r,c}); setValidMoves(valids); playSound('simon_beep'); return; }
          }
      }
  };

  const initGame = () => {
      setBoard(INITIAL_BOARD);
      boardRef.current = INITIAL_BOARD;
      setTurn('white');
      setGameState('playing');
      setWinner(null);
      setLastMove(null);
      setMoveCount(0);
      setGameTime(0);
  };

  const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
  const createRoom = async () => { if (!user) return alert("Login"); if (betType === 'money' && coins < betAmount) return alert("Sin fondos"); if (betType === 'money') await spendCoins(betAmount, "Apuesta Ajedrez"); const code = Math.floor(1000+Math.random()*9000).toString(); await setDoc(doc(db, "matches_chess", code), { host: user.uid, hostName: user.name, guest: null, guestName: '...', boardStr: JSON.stringify(INITIAL_BOARD), turn: 'white', betInfo: { type: betType, value: betAmount }, createdAt: serverTimestamp() }); setRoomCode(code); setIsHost(true); setCurrentBetInfo({ type: betType, value: betAmount }); setView('pvp_game'); };
  const joinRoom = async (code) => { if (!user) return alert("Login"); const ref = doc(db, "matches_chess", code); const snap = await getDoc(ref); if (!snap.exists()) return alert("No existe"); const data = snap.data(); if (data.betInfo.type === 'money') await spendCoins(data.betInfo.value, "Apuesta Ajedrez"); await updateDoc(ref, { guest: user.uid, guestName: user.name }); setRoomCode(code); setIsHost(false); setCurrentBetInfo(data.betInfo); setView('pvp_game'); };

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center p-2 font-mono text-white select-none overflow-x-hidden relative z-0">
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#050b14] to-black opacity-80 -z-10"></div>
        {showAd && <VideoAdOverlay onComplete={onAdSuccess} onCancel={() => setShowAd(false)} />}
        
        {/* HEADER */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-4 z-10 mt-2 px-2 relative">
            <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:border-emerald-500 transition"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
            <div className="text-center">
                <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500 italic tracking-tighter">AJEDREZ</h1>
                <p className="text-[10px] text-emerald-500/80 font-bold tracking-[0.5em] uppercase">STAUNTON PRO</p>
            </div>
            
            <div className="flex items-center gap-2">
                {view !== 'menu' && (
                    <div className="bg-slate-900/90 px-3 py-1 rounded-full border border-slate-700 flex flex-col items-end mr-2">
                        <span className="text-[10px] font-bold text-slate-400 font-mono">{formatTime(gameTime)}</span>
                        <span className="text-[9px] text-slate-600">MOV: {moveCount}</span>
                    </div>
                )}
                {/* BOTÓN DE AJUSTES */}
                <button onClick={() => setIsSettingsOpen(true)} className="p-2 bg-slate-900 rounded-full border border-orange-500 hover:bg-orange-500/20 transition group relative shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                    <Settings className="w-5 h-5 text-orange-500 group-hover:text-orange-300 group-hover:rotate-90 transition-transform duration-500"/>
                </button>
            </div>
        </div>

        {view === 'menu' ? (
            <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-4 z-10">
                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 shadow-2xl">
                    <h2 className="text-lg font-bold text-emerald-400 mb-4 flex gap-2"><Cpu className="w-5 h-5"/> VS SISTEMA</h2>
                    <div className="flex gap-2 mb-4">
                        {Object.entries(DIFFICULTIES).map(([key, val]) => (
                            <button key={key} onClick={() => setDifficulty(key)} className={`flex-1 py-3 text-[9px] font-bold rounded-lg border transition-all ${difficulty===key ? 'bg-emerald-600 border-emerald-500 text-white scale-105 shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                                {val.label}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => { initGame(); setView('pve'); }} className="w-full py-4 bg-slate-950 border border-slate-700 hover:border-emerald-500 rounded-xl font-bold text-sm tracking-widest text-white transition shadow-lg flex items-center justify-center gap-2">
                        <Swords className="w-4 h-4"/> INICIAR PARTIDA
                    </button>
                </div>

                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 shadow-2xl">
                    <h2 className="text-lg font-bold text-purple-400 mb-4 flex gap-2"><Users className="w-5 h-5"/> DUELO ONLINE</h2>
                    <div className="flex gap-2 mb-4 bg-black/40 p-2 rounded-lg">
                        <button onClick={() => setBetType('money')} className={`flex-1 py-2 text-[10px] font-bold rounded ${betType==='money'?'bg-yellow-500 text-black':'text-slate-500'}`}>MONEDAS</button>
                        <button onClick={() => setBetType('text')} className={`flex-1 py-2 text-[10px] font-bold rounded ${betType==='text'?'bg-pink-500 text-white':'text-slate-500'}`}>RETO</button>
                    </div>
                    {betType === 'money' ? <input type="number" value={betAmount} onChange={(e)=>setBetAmount(Number(e.target.value))} className="w-full bg-black p-2 rounded mb-2 text-yellow-400 font-bold text-center border border-slate-700"/> : <input type="text" value={betText} onChange={(e)=>setBetText(e.target.value)} placeholder="Reto..." className="w-full bg-black p-2 rounded mb-2 text-white text-center border border-slate-700 text-xs"/>}
                    <div className="flex gap-2">
                        <button onClick={createRoom} className="flex-1 py-3 bg-purple-600 rounded-xl font-bold text-xs text-white shadow-lg">CREAR</button>
                        <input id="code" placeholder="CÓDIGO" className="w-24 bg-black border border-slate-700 rounded-xl text-center font-bold text-purple-400 outline-none"/>
                        <button onClick={() => joinRoom(document.getElementById('code').value)} className="flex-1 py-3 bg-slate-800 border border-slate-600 rounded-xl font-bold text-xs text-white">UNIRSE</button>
                    </div>
                </div>
                {leaderboard.length>0 && <div className="bg-black/30 p-4 rounded-xl border border-white/5"><h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex gap-1 justify-center"><Trophy className="w-3 h-3 text-yellow-500"/> Tabla de Maestros</h3>{leaderboard.map((s,i)=><div key={i} className="flex justify-between text-[10px] text-slate-400 border-b border-white/5 py-1"><span>#{i+1} {s.displayName}</span><span className="text-emerald-400 font-bold">{s.moves} Movs ({formatTime(s.time)})</span></div>)}</div>}
            </div>
        ) : (
            <div className="w-full max-w-xl flex flex-col items-center flex-grow z-10 relative justify-center">
                
                {/* HUD */}
                <div className="w-full flex justify-between items-center mb-6 px-4 bg-slate-900/50 py-3 rounded-full border border-white/5 backdrop-blur-md">
                    <div className="flex gap-2 text-slate-400 text-xs font-bold items-center">
                        {turn === 'white' ? <div className="w-3 h-3 bg-white rounded-full animate-pulse shadow-[0_0_10px_white]"></div> : <div className="w-3 h-3 border border-slate-500 rounded-full"></div>}
                        <span className={turn==='white'?'text-white':'text-slate-600'}>TU TURNO</span>
                    </div>
                    {view === 'pvp_game' && <div className="text-[10px] bg-black px-2 py-1 rounded text-slate-500 font-mono tracking-widest">SALA: {roomCode}</div>}
                    <div className="flex gap-2 text-slate-400 text-xs font-bold items-center">
                        <span className={turn==='black'?'text-white':'text-slate-600'}>{view==='pvp_game'?'RIVAL':'CPU'}</span>
                        {turn === 'black' ? <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_red]"></div> : <div className="w-3 h-3 border border-slate-500 rounded-full"></div>}
                    </div>
                </div>

                {/* TABLERO PROFESIONAL (CONTRASTE ALTO) */}
                <div className="relative aspect-square w-full max-w-[420px] bg-[#334155] border-8 border-slate-800 rounded-xl shadow-[0_0_60px_rgba(0,0,0,0.6)] p-1 overflow-hidden select-none">
                    <div className="grid grid-cols-8 grid-rows-8 w-full h-full relative">
                        {settings.showCoords && (
                            <>
                                <div className="absolute left-0.5 top-0.5 text-[8px] text-slate-500 font-bold">8</div>
                                <div className="absolute right-0.5 bottom-0.5 text-[8px] text-slate-300 font-bold">h</div>
                            </>
                        )}

                        {board.map((row, r) => row.map((piece, c) => {
                            const isDark = (r + c) % 2 === 1;
                            const isSelected = selected?.r === r && selected?.c === c;
                            const isLastMove = settings.showShadow && lastMove && ((lastMove.from.r===r && lastMove.from.c===c) || (lastMove.to.r===r && lastMove.to.c===c));
                            const isValid = validMoves.some(m => m.r === r && m.c === c);
                            
                            // COLOR DE FONDO DIRECTO (SIN CAPAS INTERMEDIAS PARA EVITAR OSCURIDAD)
                            let bgClass = isDark ? 'bg-slate-700' : 'bg-slate-400';
                            if (isSelected) bgClass = '!bg-emerald-500/80';
                            // AQUÍ ESTÁ EL CAMBIO CLAVE: Amarillo muy claro y sólido
                            else if (isLastMove) bgClass = '!bg-yellow-200/80'; 

                            return (
                                <div 
                                    key={`${r}-${c}`} 
                                    onClick={() => handleSquareClick(r, c)}
                                    className={`
                                        flex items-center justify-center relative
                                        ${bgClass}
                                    `}
                                >
                                    {/* Indicador de movimiento (CONDICIONAL) */}
                                    {settings.showHints && isValid && (
                                        <div className={`absolute w-4 h-4 rounded-full ${piece ? 'border-4 border-red-500 w-full h-full rounded-none opacity-50' : 'bg-black/30'}`}></div>
                                    )}
                                    
                                    {/* PIEZA STAUNTON HD */}
                                    {piece && (
                                        <img 
                                            src={PIECES[piece]} 
                                            alt={piece}
                                            className={`
                                                w-[92%] h-[92%] object-contain drop-shadow-xl transition-transform duration-200 select-none
                                                ${isSelected ? 'scale-110 -translate-y-2' : ''}
                                            `}
                                        />
                                    )}
                                </div>
                            )
                        }))}
                    </div>
                    
                    {/* ESTADO PENSANDO */}
                    {gameState === 'cpu_thinking' && (
                        <div className="absolute top-4 right-4 bg-black/80 px-4 py-2 rounded-xl flex items-center gap-3 border border-emerald-500/50 animate-pulse z-20 backdrop-blur-md shadow-xl">
                            <Activity className="w-4 h-4 text-emerald-400 animate-spin"/>
                            <span className="text-[10px] font-bold text-white tracking-widest">SISTEMA PENSANDO...</span>
                        </div>
                    )}

                    {/* GAME OVER OVERLAY */}
                    {gameState === 'checkmate' && (
                        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-30 backdrop-blur-sm animate-in zoom-in">
                            <Crown className="w-24 h-24 text-yellow-500 mb-4 animate-bounce drop-shadow-[0_0_30px_#eab308]"/>
                            <h2 className="text-4xl font-black text-white italic mb-2 tracking-tighter">JAQUE MATE</h2>
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Ganador: <span className={winner==='white'?'text-white':'text-red-500'}>{winner === 'white' ? 'BLANCAS' : 'NEGRAS'}</span></p>
                            <div className="flex gap-6 text-xs font-mono text-slate-500 mb-8 bg-slate-900/50 p-4 rounded-xl border border-white/10">
                                <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-emerald-400"/> {formatTime(gameTime)}</span>
                                <span className="flex items-center gap-2"><Move className="w-4 h-4 text-blue-400"/> {moveCount}</span>
                            </div>
                            <button onClick={() => setView('menu')} className="px-10 py-4 bg-white text-black font-black rounded-full hover:scale-105 transition shadow-2xl">VOLVER AL MENÚ</button>
                        </div>
                    )}
                </div>

                {/* CONTROLES EXTRA */}
                {view === 'pve' && gameState === 'playing' && (
                    <div className="mt-8 flex gap-4">
                        <button onClick={triggerAd} className="px-6 py-3 bg-slate-800 border border-slate-700 hover:border-emerald-500 rounded-xl flex items-center gap-2 text-[10px] font-bold text-emerald-400 uppercase tracking-widest shadow-lg active:scale-95 transition">
                            <Eye className="w-4 h-4"/> 💡 DAME UNA PISTA (VIDEO)
                        </button>
                    </div>
                )}
            </div>
        )}

        <div className="mt-auto w-full max-w-md pt-4 opacity-75"><AdSpace type="banner" /><GameChat gameId={roomCode || "global_chess"} gameName="AJEDREZ" /></div>
        
        {/* PANEL LATERAL DE AJUSTES (AQUÍ ESTÁ LA MAGIA DEL SIDEBAR) */}
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} setSettings={setSettings} />
    </div>
  );
}