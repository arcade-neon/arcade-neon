// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Trophy, Users, Play, GripHorizontal, 
  Coins, MessageSquare, Hand, Box, Layers, Cpu, Radio, ShieldCheck, Loader2
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, onSnapshot, getDoc, serverTimestamp, setDoc, collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- CONFIGURACIÓN VISUAL ---
const TILE_COLORS = [
    'text-slate-500', // 0
    'text-cyan-400',  // 1
    'text-emerald-400', // 2
    'text-rose-500',    // 3
    'text-blue-400',    // 4
    'text-yellow-400',  // 5
    'text-fuchsia-500'  // 6
];

export default function DominoPro() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);

  const [view, setView] = useState('menu'); 
  
  // ESTADO JUEGO
  const [board, setBoard] = useState([]);
  const [playerHand, setPlayerHand] = useState([]);
  const [enemyHand, setEnemyHand] = useState([]); 
  const [boneyard, setBoneyard] = useState([]); 
  
  const [turn, setTurn] = useState(null); 
  const [endpoints, setEndpoints] = useState({ left: -1, right: -1 });
  const [gameStatus, setGameStatus] = useState('setup'); 
  const [winner, setWinner] = useState(null);
  const [lastAction, setLastAction] = useState('SISTEMA ONLINE');

  // DATA & ONLINE
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingRank, setLoadingRank] = useState(true);
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opName, setOpName] = useState('Rival');
  
  // APUESTAS
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [currentBetInfo, setCurrentBetInfo] = useState(null);

  // REFS PARA LÓGICA DE CPU SIN RE-RENDER
  const stateRef = useRef({
      board: [],
      endpoints: { left: -1, right: -1 },
      boneyard: [],
      enemyHand: [],
      gameStatus: 'setup'
  });

  const fetchLeaderboard = async () => {
      setLoadingRank(true);
      try {
          const q = query(collection(db, "scores_domino"), orderBy("score", "desc"), limit(5));
          const s = await getDocs(q);
          setLeaderboard(s.docs.map(d => d.data()));
      } catch (e) { console.error("Ranking Error", e); }
      finally { setLoadingRank(false); }
  };

  // --- INICIALIZACIÓN ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) setUser({ uid: u.uid, name: u.displayName || 'Operador' });
    });
    fetchLeaderboard();
    return () => unsubscribe();
  }, []);

  // Sincronizar Refs
  useEffect(() => {
      stateRef.current.board = board;
      stateRef.current.endpoints = endpoints;
      stateRef.current.boneyard = boneyard;
      stateRef.current.enemyHand = enemyHand;
      stateRef.current.gameStatus = gameStatus;
  }, [board, endpoints, boneyard, enemyHand, gameStatus]);

  // --- SYNC ONLINE ---
  useEffect(() => {
    if (view === 'pvp_game' && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_domino", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.betInfo) setCurrentBetInfo(data.betInfo);
                
                if (isHost) setOpName(data.guestName || 'Esperando...');
                else setOpName(data.hostName || 'Host');

                if (data.board) {
                    setBoard(data.board);
                    if(data.board.length > 0) {
                        const first = data.board[0];
                        const last = data.board[data.board.length-1];
                        setEndpoints({ left: first.left, right: last.right });
                    }
                }
                
                if (data.turn) setTurn(data.turn);
                
                if (isHost) {
                    if (data.guestHandCount !== undefined) setEnemyHand(Array(data.guestHandCount).fill(null));
                } else {
                    if (data.hostHandCount !== undefined) setEnemyHand(Array(data.hostHandCount).fill(null));
                }

                if (!isHost && data.guestHandStart && playerHand.length === 0) {
                    setPlayerHand(data.guestHandStart);
                    setGameStatus('playing');
                }
                
                if (data.winner) {
                    setGameStatus('finished');
                    setWinner(data.winner);
                }
                
                if (data.lastAction) setLastAction(data.lastAction);
            }
        });
        
        // FIX: Safe Unsubscribe
        return () => {
            setTimeout(() => {
                if (unsubscribe && typeof unsubscribe === 'function') unsubscribe();
            }, 0);
        };
    }
  }, [view, roomCode, isHost, playerHand]);

  // --- LOGICA DE JUEGO ---
  const generateTiles = () => {
      const tiles = [];
      for(let i=0; i<=6; i++) {
          for(let j=i; j<=6; j++) {
              tiles.push({ left: i, right: j, id: `${i}-${j}` });
          }
      }
      return tiles.sort(() => Math.random() - 0.5);
  };

  const initGame = (mode) => {
      playSound('shuffle');
      const tiles = generateTiles();
      const p1Hand = tiles.slice(0, 7);
      const p2Hand = tiles.slice(7, 14);
      const pool = tiles.slice(14);

      setPlayerHand(p1Hand);
      setEnemyHand(p2Hand);
      setBoneyard(pool);
      setBoard([]);
      setEndpoints({ left: -1, right: -1 });
      setGameStatus('playing');
      setWinner(null);
      setLastAction('ENLACE ESTABLECIDO. INICIANDO PARTIDA.');

      // Determinar turno inicial (Doble más alto o ficha más alta)
      const p1Doubles = p1Hand.filter(t => t.left === t.right).map(t => t.left);
      const p2Doubles = p2Hand.filter(t => t.left === t.right).map(t => t.left);
      
      const p1Max = p1Doubles.length > 0 ? Math.max(...p1Doubles) : -1;
      const p2Max = p2Doubles.length > 0 ? Math.max(...p2Doubles) : -1;
      
      let startingTurn = 'player';
      if (p1Max === -1 && p2Max === -1) {
           const p1Sum = Math.max(...p1Hand.map(t => t.left + t.right));
           const p2Sum = Math.max(...p2Hand.map(t => t.left + t.right));
           startingTurn = p1Sum >= p2Sum ? 'player' : 'enemy';
      } else {
           startingTurn = p1Max >= p2Max ? 'player' : 'enemy';
      }
      
      setTurn(startingTurn);
      setView(mode === 'pve' ? 'pve' : 'pvp_game');

      if (mode === 'pve' && startingTurn === 'enemy') {
          setTimeout(cpuTurn, 1500);
      }
  };

  // --- MOTOR TÁCTICO (CPU) ---
  const cpuTurn = () => {
      if (stateRef.current.gameStatus !== 'playing') return;

      const currentHand = [...stateRef.current.enemyHand];
      const currentEnds = stateRef.current.endpoints;
      const currentBoard = stateRef.current.board;
      let pool = [...stateRef.current.boneyard];

      let matchIdx = -1;
      let side = null;

      if (currentBoard.length === 0) {
          const doubles = currentHand.map((t, i) => ({...t, idx: i})).filter(t => t.left === t.right);
          if (doubles.length > 0) {
              doubles.sort((a,b) => b.left - a.left);
              matchIdx = doubles[0].idx;
          } else {
              matchIdx = 0; 
          }
          side = 'left';
      } else {
          for (let i = 0; i < currentHand.length; i++) {
              const t = currentHand[i];
              if (t.left === currentEnds.left || t.right === currentEnds.left) { matchIdx = i; side = 'left'; break; }
              if (t.left === currentEnds.right || t.right === currentEnds.right) { matchIdx = i; side = 'right'; break; }
          }
      }

      if (matchIdx !== -1) {
          const tileToPlay = currentHand[matchIdx];
          currentHand.splice(matchIdx, 1);
          setEnemyHand(currentHand);
          placeTileOnBoard(tileToPlay, side, 'enemy');
          
          if (currentHand.length === 0) handleGameOver('enemy');
          else setTurn('player');
      } else {
          if (pool.length > 0) {
              const draw = pool.shift();
              setBoneyard(pool);
              setEnemyHand([...currentHand, draw]);
              setLastAction("SISTEMA adquiere datos...");
              playSound('card');
              setTimeout(cpuTurn, 1000);
          } else {
              setLastAction("SISTEMA sin movimientos válidos.");
              setTurn('player');
              checkBlockedGame();
          }
      }
  };

  // --- ACCIONES JUGADOR ---
  const handleTileClick = (tile) => {
      if (gameStatus !== 'playing' || turn !== 'player') return;

      let canLeft = false; 
      let canRight = false;

      if (board.length === 0) {
          canLeft = true; 
      } else {
          if (tile.left === endpoints.left || tile.right === endpoints.left) canLeft = true;
          if (tile.left === endpoints.right || tile.right === endpoints.right) canRight = true;
      }

      if (!canLeft && !canRight) {
          playSound('error');
          return;
      }

      const side = canRight ? 'right' : 'left'; 
      
      const newHand = playerHand.filter(t => t.id !== tile.id);
      setPlayerHand(newHand);
      placeTileOnBoard(tile, side, 'player');

      if (newHand.length === 0) {
          handleGameOver('player');
      } else {
          setTurn('enemy');
          if (view === 'pve') {
              setTimeout(cpuTurn, 1500);
          } else if (view === 'pvp_game') {
              updateOnlineTurn(newHand.length, tile);
          }
      }
  };

  const placeTileOnBoard = (tile, side, who) => {
      playSound('clack'); 
      
      setBoard(prev => {
          let newBoard = [...prev];
          let newEnds = { ...endpoints };
          let placedTile = { ...tile };

          if (prev.length === 0) {
              newEnds = { left: tile.left, right: tile.right };
              newBoard = [tile];
          } else {
              if (side === 'left') {
                  if (placedTile.right !== newEnds.left) {
                      if (placedTile.left === newEnds.left) {
                          placedTile = { ...tile, left: tile.right, right: tile.left, rotated: true };
                      }
                  }
                  newBoard.unshift(placedTile);
                  newEnds.left = placedTile.left; 
              } else {
                  if (placedTile.left !== newEnds.right) {
                      if (placedTile.right === newEnds.right) {
                          placedTile = { ...tile, left: tile.right, right: tile.left, rotated: true };
                      }
                  }
                  newBoard.push(placedTile);
                  newEnds.right = placedTile.right;
              }
          }
          
          setEndpoints(newEnds);
          const actor = who === 'player' ? 'Has colocado' : 'SISTEMA coloca';
          setLastAction(`${actor} [${tile.left}|${tile.right}]`);
          
          if (view === 'pvp_game' && who === 'player') {
              updateDoc(doc(db, "matches_domino", roomCode), { board: newBoard, endpoints: newEnds });
          }
          
          return newBoard;
      });
  };

  const drawTile = () => {
      if (boneyard.length === 0) {
          setLastAction("POZO VACÍO. Transmisión finalizada.");
          setTurn('enemy');
          if (view === 'pve') setTimeout(cpuTurn, 1500);
          return;
      }
      const tile = boneyard[0];
      const newPool = boneyard.slice(1);
      setBoneyard(newPool);
      setPlayerHand([...playerHand, tile]);
      playSound('card');
      setLastAction("Datos adquiridos del pozo.");
  };

  const checkBlockedGame = () => {
      if (boneyard.length === 0) {
          const pPoints = playerHand.reduce((a,b)=>a+b.left+b.right, 0);
          const ePoints = enemyHand.reduce((a,b)=>a+b.left+b.right, 0);
          
          if (pPoints < ePoints) handleGameOver('player');
          else handleGameOver('enemy');
      }
  };

  const handleGameOver = (winnerId) => {
      setGameStatus('finished');
      setWinner(winnerId === 'player' ? user.uid : 'opponent');
      if (winnerId === 'player') {
          playSound('win');
          const reward = currentBetInfo?.type === 'money' ? currentBetInfo.value * 2 : 100;
          if (view === 'pve') addCoins(150, "Victoria Dominó");
          saveScore(100);
      } else {
          playSound('lose');
      }
  };

  // --- ONLINE ---
  const handleCreateRoom = async () => {
      if (!user) return alert("Inicia sesión");
      if (betType === 'money' && coins < betAmount) return alert("Fondos insuficientes");
      if (betType === 'money') await spendCoins(betAmount, "Apuesta Dominó");

      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const tiles = generateTiles();
      const hostHand = tiles.slice(0, 7);
      const guestHand = tiles.slice(7, 14);
      
      const betInfo = { type: betType, value: betType === 'money' ? betAmount : betText || 'Honor' };
      
      await setDoc(doc(db, "matches_domino", code), {
          host: user.uid, hostName: user.name, hostHandCount: 7,
          guest: null, guestName: 'Esperando...', guestHandCount: 7, guestHandStart: guestHand,
          turn: 'host', board: [], endpoints: {left:-1, right:-1}, boneyardCount: 14,
          betInfo, createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); setPlayerHand(hostHand); setCurrentBetInfo(betInfo); setView('pvp_game');
  };

  const joinRoom = async (c) => {
      if (!user) return alert("Inicia sesión");
      const ref = doc(db, "matches_domino", c);
      const snap = await getDoc(ref);
      if (!snap.exists()) return alert("Sala no encontrada");
      
      const data = snap.data();
      if (data.betInfo.type === 'money') {
          if (coins < data.betInfo.value) return alert("Fondos insuficientes");
          await spendCoins(data.betInfo.value, "Apuesta Dominó");
      }

      await updateDoc(ref, { guest: user.uid, guestName: user.name });
      setRoomCode(c); setIsHost(false); setCurrentBetInfo(data.betInfo); setView('pvp_game');
  };

  const updateOnlineTurn = (handCount, lastTile) => {
      const fieldCount = isHost ? 'hostHandCount' : 'guestHandCount';
      const nextTurn = isHost ? 'guest' : 'host';
      updateDoc(doc(db, "matches_domino", roomCode), {
          [fieldCount]: handCount,
          turn: nextTurn,
          lastAction: `${user.name} juega [${lastTile.left}|${lastTile.right}]`
      });
  };

  const saveScore = async (s) => { 
      if(user) {
          try {
            await addDoc(collection(db, "scores_domino"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); 
            fetchLeaderboard(); 
          } catch(e){}
      }
  };

  const handleBack = () => {
      if (view === 'menu') window.location.href = '/';
      else {
          setView('menu');
          setGameStatus('setup');
          setBoard([]);
      }
  };

  // --- RENDERIZADO DE FICHAS PROFESIONALES ---
  const Tile = ({ left, right, vertical = false, small = false, onClick }) => (
      <div 
        onClick={onClick}
        className={`
            relative bg-slate-900 border border-slate-700 rounded-lg flex shadow-lg cursor-pointer transition-all duration-200 
            ${onClick ? 'hover:border-yellow-400 hover:-translate-y-1 hover:shadow-yellow-500/20' : ''}
            ${vertical ? 'flex-col w-10 h-20 sm:w-12 sm:h-24' : 'flex-row w-20 h-10 sm:w-24 sm:h-12'}
            ${small ? 'w-6 h-12 sm:w-8 sm:h-16 !border-slate-800 opacity-80' : ''}
        `}
      >
          {/* Parte 1 */}
          <div className={`flex-1 flex items-center justify-center relative overflow-hidden ${vertical ? 'border-b border-slate-800' : 'border-r border-slate-800'}`}>
              <span className={`font-mono font-black text-xl sm:text-2xl z-10 ${TILE_COLORS[left]} drop-shadow-[0_0_5px_currentColor]`}>{left}</span>
          </div>
          {/* Parte 2 */}
          <div className="flex-1 flex items-center justify-center relative overflow-hidden">
              <span className={`font-mono font-black text-xl sm:text-2xl z-10 ${TILE_COLORS[right]} drop-shadow-[0_0_5px_currentColor]`}>{right}</span>
          </div>
          {/* Separador */}
          <div className={`absolute bg-slate-600/50 ${vertical ? 'h-[1px] w-full top-1/2' : 'w-[1px] h-full left-1/2'}`}></div>
      </div>
  );

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-2 font-mono text-white select-none overflow-hidden relative">
      
      {/* FONDO HEXAGONAL */}
      <div className="fixed inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

      {/* HEADER */}
      <div className="w-full max-w-6xl flex justify-between items-center mb-4 z-10 mt-4 px-4">
        <button onClick={handleBack} className="p-2 sm:p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-yellow-500 transition shadow-lg group"><ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-yellow-500"/></button>
        <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 italic tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(234,179,8,0.3)]">DOMINO</h1>
            <p className="text-[8px] sm:text-[10px] text-yellow-500/80 font-bold tracking-[0.5em] uppercase">GOLPE EN LA MESA</p>
        </div>
        <div className={`bg-slate-900 px-4 py-2 rounded-full border border-slate-700 flex items-center gap-2 ${turn==='player' ? 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)] animate-pulse' : ''}`}>
            <Hand className="w-4 h-4 text-yellow-500"/>
            <span className="font-bold text-xs sm:text-sm text-yellow-100">{turn === 'player' ? 'TU TURNO' : 'SISTEMA...'}</span>
        </div>
      </div>

      {view === 'menu' ? (
          <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-10 z-10 px-2 flex-grow overflow-y-auto no-scrollbar pb-4">
              <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md relative overflow-hidden group hover:border-yellow-500/50 transition-all">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                  <h2 className="text-xl font-bold text-yellow-400 mb-4 flex gap-2 tracking-widest items-center"><GripHorizontal/> MODO CLÁSICO</h2>
                  <button onClick={() => initGame('pve')} className="w-full py-4 bg-yellow-600 hover:bg-yellow-500 text-black font-black rounded-xl uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-2 group-hover:scale-105 active:scale-95">
                      <Cpu className="w-5 h-5"/> ENTRENAMIENTO TÁCTICO
                  </button>
              </div>
              
              <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md">
                  <h2 className="text-xl font-bold text-blue-400 mb-4 flex gap-2 tracking-widest items-center"><Users/> ONLINE PVP</h2>
                  <div className="mb-4 bg-black/40 p-4 rounded-xl border border-white/5">
                      <div className="flex gap-2 mb-2">
                          <button onClick={() => setBetType('money')} className={`flex-1 py-2 text-xs font-bold rounded ${betType==='money'?'bg-yellow-500 text-black':'bg-slate-800 text-slate-400'}`}>MONEDAS</button>
                          <button onClick={() => setBetType('text')} className={`flex-1 py-2 text-xs font-bold rounded ${betType==='text'?'bg-pink-500 text-white':'bg-slate-800 text-slate-400'}`}>RETO</button>
                      </div>
                      {betType === 'money' ? (
                          <div className="relative">
                              <Coins className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500"/>
                              <input type="number" value={betAmount} onChange={(e)=>setBetAmount(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 pl-10 text-yellow-400 font-black outline-none focus:border-yellow-500 transition-colors"/>
                          </div>
                      ) : (
                          <input type="text" value={betText} onChange={(e)=>setBetText(e.target.value)} placeholder="Ej: Paga la cena" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-center text-white text-xs font-bold outline-none focus:border-pink-500 transition-colors"/>
                      )}
                  </div>
                  <div className="flex gap-2 flex-col sm:flex-row">
                      <button onClick={handleCreateRoom} className="w-full sm:flex-1 py-4 bg-blue-600 hover:bg-blue-500 font-bold rounded-xl uppercase text-xs tracking-widest shadow-lg text-white active:scale-95 transition-all">CREAR SALA</button>
                      <div className="flex w-full sm:flex-1 gap-2">
                          <input id="code" placeholder="CÓDIGO" className="flex-1 bg-black border border-slate-600 rounded-xl text-center font-bold outline-none focus:border-blue-500 text-cyan-400"/>
                          <button onClick={() => joinRoom(document.getElementById('code').value)} className="px-4 bg-slate-800 border border-slate-600 hover:border-blue-500 font-bold rounded-xl uppercase text-xs tracking-widest text-slate-300 active:scale-95 transition-all">UNIRSE</button>
                      </div>
                  </div>
              </div>
              
              {leaderboard.length > 0 && (
                  <div className="mt-4 bg-black/40 p-4 rounded-xl border border-white/5">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 justify-center">
                          <Trophy className="w-3 h-3 text-yellow-500"/> Top Jugadores
                      </div>
                      {loadingRank ? <Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto"/> : leaderboard.map((s,i) => (
                          <div key={i} className="flex justify-between text-xs py-1 border-b border-white/5 last:border-0 text-slate-300">
                              <span>#{i+1} {s.displayName}</span>
                              <span className="text-yellow-500 font-mono font-bold">{s.score}</span>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      ) : (
          <div className="w-full max-w-6xl flex flex-col items-center flex-grow z-10 relative">
              
              {/* MANO RIVAL (SUPERIOR) */}
              <div className="flex justify-center gap-1 mb-2 opacity-80 scale-75 sm:scale-100">
                  {enemyHand.map((_, i) => (
                      <Tile key={i} left="?" right="?" vertical={true} small={true} />
                  ))}
                  <div className="flex items-center justify-center ml-4">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-black/50 px-3 py-1 rounded-full border border-slate-800 flex items-center gap-2">
                          <ShieldCheck className="w-3 h-3"/> {opName} ({enemyHand.length})
                      </span>
                  </div>
              </div>

              {/* TABLERO DE JUEGO (SCROLLABLE) */}
              <div className="w-full flex-grow bg-slate-900/40 border-y border-slate-800/50 relative flex items-center overflow-x-auto scrollbar-hide py-10 px-8 min-h-[300px] shadow-inner backdrop-blur-sm">
                  <div className="flex items-center gap-1 mx-auto min-w-max transition-all duration-500 p-4">
                      {board.length === 0 && (
                          <div className="flex flex-col items-center gap-2 text-slate-600 animate-pulse border-2 border-dashed border-slate-700 p-8 rounded-xl">
                              <Box className="w-10 h-10 opacity-50"/>
                              <span className="font-bold uppercase tracking-widest text-sm">Esperando primera ficha...</span>
                          </div>
                      )}
                      {board.map((tile, i) => (
                          <Tile 
                            key={i} 
                            left={tile.left} 
                            right={tile.right} 
                            vertical={tile.left === tile.right} 
                          />
                      ))}
                  </div>
              </div>

              {/* BARRA DE ACCIÓN (HUD) */}
              <div className="w-full max-w-5xl flex justify-between items-center px-4 sm:px-6 py-4 bg-black/80 backdrop-blur-md border-t border-slate-800 mt-auto">
                  <div className="text-[10px] sm:text-xs font-mono flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${turn==='player' ? 'bg-green-500 animate-ping' : 'bg-red-500'}`}></span>
                      <span className="text-cyan-400 uppercase tracking-wider truncate max-w-[150px] sm:max-w-none">{lastAction}</span>
                  </div>
                  <div className="flex gap-4">
                      <button 
                        onClick={drawTile} 
                        disabled={boneyard.length===0 || turn !== 'player'} 
                        className="px-4 sm:px-6 py-3 bg-slate-800 rounded-lg text-[10px] sm:text-xs font-bold border border-slate-600 hover:border-yellow-500 hover:text-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-wider flex items-center gap-2 shadow-lg active:scale-95"
                      >
                          <Layers className="w-4 h-4"/> ROBAR ({boneyard.length})
                      </button>
                  </div>
              </div>

              {/* TU MANO (INFERIOR) */}
              <div className="w-full overflow-x-auto pb-4 sm:pb-8 pt-4 sm:pt-6 px-4 bg-gradient-to-t from-black via-[#050b14] to-transparent">
                  <div className="flex justify-center gap-2 sm:gap-4 min-w-max px-4 sm:px-8">
                      {playerHand.map((tile, i) => (
                          <Tile 
                            key={tile.id} 
                            left={tile.left} 
                            right={tile.right} 
                            vertical={true}
                            onClick={() => handleTileClick(tile)}
                          />
                      ))}
                  </div>
              </div>

              {/* GAME OVER MODAL */}
              {winner && (
                  <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-50 animate-in zoom-in backdrop-blur-sm p-4 text-center">
                      <Trophy className="w-20 h-20 sm:w-24 sm:h-24 text-yellow-500 mb-6 animate-bounce drop-shadow-[0_0_30px_rgba(234,179,8,0.6)]"/>
                      <h2 className="text-4xl sm:text-5xl font-black text-white italic mb-2 tracking-tighter">{winner === user?.uid ? '¡VICTORIA!' : 'DERROTA'}</h2>
                      <p className="text-slate-400 text-xs sm:text-sm uppercase tracking-[0.5em] mb-8">Partida Finalizada</p>
                      
                      {winner === user?.uid && (
                          <div className="bg-yellow-900/20 border border-yellow-500/30 px-8 py-3 rounded-xl mb-8 flex items-center gap-3">
                              <Coins className="w-6 h-6 text-yellow-400"/>
                              <span className="text-xl font-bold text-yellow-100">+150 MONEDAS</span>
                          </div>
                      )}

                      <button onClick={() => setView('menu')} className="w-full max-w-xs px-10 py-4 bg-white text-black font-black rounded-full hover:scale-105 transition uppercase tracking-widest shadow-lg">VOLVER AL LOBBY</button>
                  </div>
              )}
          </div>
      )}
      <div className="mt-auto opacity-50 w-full max-w-md pt-2"><AdSpace type="banner" /><GameChat gameId={view.includes('pvp') ? roomCode : "global_domino"} gameName="DOMINO" /></div>
    </div>
  );
}