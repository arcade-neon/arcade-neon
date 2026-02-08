// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Users, Cpu, Anchor, Crosshair, RotateCw, Skull, Radar, Ship, Zap, Target, AlertTriangle, ShieldAlert, Shield } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, getDoc, serverTimestamp, query, orderBy, limit, getDocs, setDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';

// --- CONFIGURACIÓN ---
const BOARD_SIZE = 10;
const COLS = ['A','B','C','D','E','F','G','H','I','J'];
const ROWS = ['1','2','3','4','5','6','7','8','9','10'];

const SHIP_TYPES = [
  { name: 'PORTAAVIONES', size: 5, id: 'carrier' },
  { name: 'ACORAZADO', size: 4, id: 'battleship' },
  { name: 'DESTRUCTOR', size: 3, id: 'destroyer' },
  { name: 'SUBMARINO', size: 3, id: 'submarine' },
  { name: 'PATRULLERO', size: 2, id: 'patrol' },
];

const CELL = { WATER: 0, SHIP: 1, MISS: 2, HIT: 3, SUNK: 4 };

const createEmptyBoard = () => Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(CELL.WATER));

export default function NavalElitePro() {
  const [view, setView] = useState('menu');
  const [user, setUser] = useState(null);
  const { playSound } = useAudio();
  const { addCoins } = useEconomy(); // <--- IMPORTAMOS LA ECONOMÍA
  
  // ESTADO JUEGO
  const [phase, setPhase] = useState('placement'); 
  const [myBoard, setMyBoard] = useState(createEmptyBoard());
  const [opBoard, setOpBoard] = useState(createEmptyBoard());
  
  const [myShips, setMyShips] = useState([]); 
  const [opShips, setOpShips] = useState([]); 
  
  // Placement UI
  const [selectedShipIdx, setSelectedShipIdx] = useState(0);
  const [orientation, setOrientation] = useState('H'); 
  const [placedCount, setPlacedCount] = useState(0);

  const [turn, setTurn] = useState('player');
  const [winner, setWinner] = useState(null);
  const [log, setLog] = useState("Sistema iniciado. Esperando órdenes.");
  const [difficulty, setDifficulty] = useState('medium');

  // EFECTOS VISUALES
  const [sunkAlert, setSunkAlert] = useState(null); // { shipName, isEnemy }
  const [shake, setShake] = useState(false);

  // IA Táctica
  const [aiTargetStack, setAiTargetStack] = useState([]);

  // ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [opName, setOpName] = useState('Hostil');
  const [isHost, setIsHost] = useState(false);
  const [opReady, setOpReady] = useState(false);
  const [amReady, setAmReady] = useState(false);
  const [secretOpBoard, setSecretOpBoard] = useState(null); 

  // EXTRAS
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 });
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Comandante' });
    fetchLeaderboard();
  }, []);

  // --- SYNC ONLINE ---
  useEffect(() => {
    if (view.includes('pvp') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_battleship", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const imHost = isHost;

                if (imHost) {
                    setOpName(data.guestName || 'Esperando...');
                    setOpReady(data.guestReady || false);
                    if(data.guestBoardStr && !secretOpBoard) {
                        const parsed = JSON.parse(data.guestBoardStr);
                        setSecretOpBoard(parsed.board);
                        setOpShips(parsed.ships);
                    }
                } else {
                    setOpName(data.hostName || 'Host');
                    setOpReady(data.hostReady || false);
                    if(data.hostBoardStr && !secretOpBoard) {
                        const parsed = JSON.parse(data.hostBoardStr);
                        setSecretOpBoard(parsed.board);
                        setOpShips(parsed.ships);
                    }
                }

                if (data.hostReady && data.guestReady && phase === 'placement') {
                    setPhase('battle');
                    setTurn(data.turn === 'host' ? (imHost ? 'player' : 'opponent') : (imHost ? 'opponent' : 'player'));
                    setLog("¡Enlace establecido! Combate inminente.");
                }

                const lastShot = data.lastShot; 
                if (lastShot && lastShot.shooterId !== user?.uid && phase === 'battle') {
                    if (myBoard[lastShot.r][lastShot.c] !== CELL.HIT && myBoard[lastShot.r][lastShot.c] !== CELL.MISS) {
                        receiveAttack(lastShot.r, lastShot.c);
                    }
                }

                if (data.winner) setWinner(data.winner);
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode, phase, secretOpBoard]);

  // --- IA Y COMBATE ---
  const aiTurn = () => {
      if (winner) return;
      let r, c;
      if (difficulty !== 'easy' && aiTargetStack.length > 0) {
          const target = aiTargetStack.pop();
          r = target.r; c = target.c;
      } else {
          let valid = false; let attempts = 0;
          while (!valid && attempts < 100) {
              r = Math.floor(Math.random() * BOARD_SIZE);
              c = Math.floor(Math.random() * BOARD_SIZE);
              if (difficulty === 'hard') { if ((r + c) % 2 !== 0) continue; }
              if (myBoard[r][c] === CELL.WATER || myBoard[r][c] === CELL.SHIP) valid = true;
              attempts++;
          }
          if (!valid) { do { r = Math.floor(Math.random() * BOARD_SIZE); c = Math.floor(Math.random() * BOARD_SIZE); } while (myBoard[r][c] !== CELL.WATER && myBoard[r][c] !== CELL.SHIP); }
      }
      receiveAttack(r, c);
  };

  const checkShipSunk = (board, ships, r, c, isMyShip) => {
      const shipIndex = ships.findIndex(s => s.coords.some(coord => coord.r === r && coord.c === c));
      if (shipIndex === -1) return false;

      const ship = ships[shipIndex];
      const isSunk = ship.coords.every(coord => 
          (coord.r === r && coord.c === c) || 
          board[coord.r][coord.c] === CELL.HIT || 
          board[coord.r][coord.c] === CELL.SUNK
      );

      if (isSunk) {
          triggerSunkAlert(ship.name, isMyShip);
          return true;
      }
      return false;
  };

  const receiveAttack = (r, c) => {
      const newMyBoard = myBoard.map(row => [...row]);
      const hit = newMyBoard[r][c] === CELL.SHIP;
      newMyBoard[r][c] = hit ? CELL.HIT : CELL.MISS;
      setMyBoard(newMyBoard);

      if (hit) {
         setLog(`¡ALERTA! Impacto recibido en [${COLS[c]}${ROWS[r]}]`);
         triggerShake();
         checkShipSunk(myBoard, myShips, r, c, true);

         if (view === 'pve' && difficulty !== 'easy') {
             const neighbors = [{r:r-1,c}, {r:r+1,c}, {r,c:c-1}, {r,c:c+1}];
             const validNeighbors = neighbors.filter(n => n.r >= 0 && n.r < BOARD_SIZE && n.c >= 0 && n.c < BOARD_SIZE && (newMyBoard[n.r][n.c] === CELL.WATER || newMyBoard[n.r][n.c] === CELL.SHIP));
             setAiTargetStack(prev => [...prev, ...validNeighbors.sort(() => Math.random() - 0.5)]);
         }
         checkGameOver(newMyBoard, 'opponent');
      } else {
         setLog(`Proyectil enemigo al agua.`);
      }
      if (view === 'pve') setTurn('player'); 
  };

  const handleAttackClick = async (r, c) => {
      if (phase !== 'battle' || turn !== 'player' || winner || opBoard[r][c] !== CELL.WATER) return;
      const targetBoardReal = secretOpBoard; 
      if (!targetBoardReal) return;

      const hit = targetBoardReal[r][c] === CELL.SHIP;
      const newOpBoard = opBoard.map(row => [...row]);
      newOpBoard[r][c] = hit ? CELL.HIT : CELL.MISS;
      setOpBoard(newOpBoard);

      if (hit) {
          setLog(`¡IMPACTO CONFIRMADO! Coordenadas [${COLS[c]}${ROWS[r]}]`);
          triggerShake();
          checkShipSunk(targetBoardReal, opShips, r, c, false);
          checkGameOver(newOpBoard, 'player');
      } else {
          setLog("Objetivo fallido. Solo agua.");
      }
      
      if (view.includes('pvp')) {
          await updateDoc(doc(db, "matches_battleship", roomCode), { lastShot: {r, c, shooterId: user.uid, timestamp: Date.now()}, turn: isHost ? 'guest' : 'host' });
      } else {
          setTurn('opponent');
          const delay = difficulty === 'hard' ? 800 : 1500;
          setTimeout(aiTurn, delay);
      }
  };

// --- CORRECCIÓN EN CHECK GAMEOVER ---
  const checkGameOver = (boardToCheck, potentialWinner) => {
      const totalHits = boardToCheck.flat().filter(cell => cell === CELL.HIT || cell === CELL.SUNK).length;
      const totalShipParts = SHIP_TYPES.reduce((sum, s) => sum + s.size, 0);
      if (totalHits >= totalShipParts) {
         const winnerId = potentialWinner === 'player' ? user?.uid : 'opponent';
         setWinner(winnerId);
         
         if (potentialWinner === 'player') {
             saveScore(difficulty === 'hard' ? 2000 : 1000);
             addCoins(100, "Victoria Naval Elite"); // <--- ¡AÑADE ESTA LÍNEA AQUÍ! 💰
         }
         
         if (view.includes('pvp') && potentialWinner === 'player') updateDoc(doc(db, "matches_battleship", roomCode), { winner: user.uid });
      }
  };

  // --- PREPARACIÓN ---
  const startPlacement = (mode, diff = 'medium') => {
    setMyBoard(createEmptyBoard()); setOpBoard(createEmptyBoard());
    setMyShips(SHIP_TYPES.map(s => ({...s, coords: []})));
    setOpShips(SHIP_TYPES.map(s => ({...s, coords: []}))); 
    setPlacedCount(0); setSelectedShipIdx(0); setPhase('placement');
    setWinner(null); setOpReady(false); setAmReady(false); setSecretOpBoard(null);
    setDifficulty(diff); setAiTargetStack([]);
    setView(mode);
    setLog("Iniciando despliegue de flota. Seleccione coordenadas.");
    if(mode === 'pve') placeOpShipsRandomly();
  };

  const canPlaceShip = (boardCheck, r, c, size, orient) => {
    if (orient === 'H') {
        if (c + size > BOARD_SIZE) return false;
        for (let i = 0; i < size; i++) if (boardCheck[r][c + i] !== CELL.WATER) return false;
    } else {
        if (r + size > BOARD_SIZE) return false;
        for (let i = 0; i < size; i++) if (boardCheck[r + i][c] !== CELL.WATER) return false;
    }
    return true;
  };

  const handlePlaceClick = (r, c) => {
      if (phase !== 'placement' || placedCount >= SHIP_TYPES.length) return;
      const shipInfo = myShips[selectedShipIdx];
      if (canPlaceShip(myBoard, r, c, shipInfo.size, orientation)) {
          const newBoard = myBoard.map(row => [...row]);
          const newShips = [...myShips];
          const coords = [];
          for (let i = 0; i < shipInfo.size; i++) {
              const curR = orientation === 'V' ? r + i : r;
              const curC = orientation === 'H' ? c + i : c;
              newBoard[curR][curC] = CELL.SHIP;
              coords.push({r: curR, c: curC});
          }
          newShips[selectedShipIdx].coords = coords;
          setMyBoard(newBoard); setMyShips(newShips);
          setPlacedCount(pc => pc + 1); setSelectedShipIdx(si => si + 1);
      }
  };

  const finalizePlacement = async () => {
      setAmReady(true);
      if (view === 'pve') { setPhase('battle'); setTurn('player'); setLog("¡Combate iniciado!"); }
      else if (view.includes('pvp')) {
          setLog("Esperando enlace de datos...");
          const payload = JSON.stringify({ board: myBoard, ships: myShips });
          const updateData = isHost ? { hostReady: true, hostBoardStr: payload } : { guestReady: true, guestBoardStr: payload };
          await updateDoc(doc(db, "matches_battleship", roomCode), updateData);
      }
  };

  const placeOpShipsRandomly = () => {
      const aiBoard = createEmptyBoard();
      const aiShips = JSON.parse(JSON.stringify(SHIP_TYPES)).map(s => ({...s, coords: []})); 

      aiShips.forEach((ship, idx) => {
          let placed = false;
          while (!placed) {
              const r = Math.floor(Math.random() * BOARD_SIZE);
              const c = Math.floor(Math.random() * BOARD_SIZE);
              const orient = Math.random() > 0.5 ? 'H' : 'V';
              if (canPlaceShip(aiBoard, r, c, ship.size, orient)) {
                  const coords = [];
                  for (let i = 0; i < ship.size; i++) {
                      if (orient === 'H') { aiBoard[r][c + i] = CELL.SHIP; coords.push({r, c:c+i}); }
                      else { aiBoard[r + i][c] = CELL.SHIP; coords.push({r:r+i, c}); }
                  }
                  aiShips[idx].coords = coords;
                  placed = true;
              }
          }
      });
      setSecretOpBoard(aiBoard);
      setOpShips(aiShips);
  };

  // --- PODERES Y ADS ---
  const watchAd = (type) => { setAdState({ active: true, type, timer: 5 }); };
  useEffect(() => {
    let i;
    if (adState.active && adState.timer > 0) i = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active) { clearInterval(i); setAdState({active:false, timer:5}); executePower(adState.type); } 
    return () => clearInterval(i);
  }, [adState.active]);

  const executePower = (type) => {
      if (!secretOpBoard) return;
      const newOpBoard = opBoard.map(row => [...row]);
      if (type === 'radar') {
          let r = Math.floor(Math.random() * (BOARD_SIZE-2));
          let c = Math.floor(Math.random() * (BOARD_SIZE-2));
          let found = 0;
          for(let i=0; i<3; i++) {
              for(let j=0; j<3; j++) {
                  if(secretOpBoard[r+i][c+j] === CELL.SHIP && newOpBoard[r+i][c+j] === CELL.WATER) {
                      newOpBoard[r+i][c+j] = CELL.HIT; found++;
                  } else if (newOpBoard[r+i][c+j] === CELL.WATER) { newOpBoard[r+i][c+j] = CELL.MISS; }
              }
          }
          setOpBoard(newOpBoard); setLog(`Radar: Detectadas ${found} firmas térmicas en [${COLS[c]}${ROWS[r]}].`);
      }
      if (type === 'airstrike') {
          let hits = 0;
          for(let k=0; k<3; k++) {
              const r = Math.floor(Math.random() * BOARD_SIZE); const c = Math.floor(Math.random() * BOARD_SIZE);
              if(newOpBoard[r][c] === CELL.WATER) {
                  const hit = secretOpBoard[r][c] === CELL.SHIP;
                  newOpBoard[r][c] = hit ? CELL.HIT : CELL.MISS;
                  if(hit) hits++;
              }
          }
          setOpBoard(newOpBoard); setLog(`Ataque Aéreo: ${hits} detonaciones confirmadas.`);
          checkGameOver(newOpBoard, 'player');
      }
  };

  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 500); };
  
  const triggerSunkAlert = (shipName, isMyShip) => {
      setSunkAlert({ shipName, isEnemy: !isMyShip });
      setTimeout(() => setSunkAlert(null), 2500);
  };

  const createRoom = async () => {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_battleship", code), {
          host: user?.uid, hostName: user?.name, hostReady: false, guestReady: false,
          turn: 'host', createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); startPlacement('pvp_host', 'medium');
  };
  const joinRoom = async (c) => {
      await updateDoc(doc(db, "matches_battleship", c), { guest: user?.uid, guestName: user?.name });
      setRoomCode(c); setIsHost(false); startPlacement('pvp_guest', 'medium');
  };

  const saveScore = async (s) => { if(user) await addDoc(collection(db, "scores_battleship"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); fetchLeaderboard(); };
  const fetchLeaderboard = async () => { const q = query(collection(db, "scores_battleship"), orderBy("score", "desc"), limit(5)); const s = await getDocs(q); setLeaderboard(s.docs.map(d=>d.data())); };

  // --- RENDER VISUALS ---
  const getShipCellStyle = (r, c) => {
    if (myBoard[r][c] !== CELL.SHIP && myBoard[r][c] !== CELL.HIT) return "";
    const ship = myShips.find(s => s.coords.some(coord => coord.r === r && coord.c === c));
    if (!ship) return "bg-slate-600 rounded-sm"; 
    const index = ship.coords.findIndex(coord => coord.r === r && coord.c === c);
    const isHead = index === 0;
    const isTail = index === ship.coords.length - 1;
    const isHorizontal = ship.coords.length > 1 && ship.coords[0].r === ship.coords[1].r;
    let roundedClass = "rounded-sm"; 
    if (isHorizontal) { if (isHead) roundedClass = "rounded-l-full"; if (isTail) roundedClass = "rounded-r-full"; } 
    else { if (isHead) roundedClass = "rounded-t-full"; if (isTail) roundedClass = "rounded-b-full"; }
    return `${roundedClass} bg-gradient-to-br from-slate-500 to-slate-700 border border-slate-400/50 shadow-sm`;
  };

  const renderCell = (cell, r, c, isMyBoard) => {
      let content = null;
      let bg = "bg-[#0f172a]/60"; 
      let shipStyle = "";

      if (isMyBoard && (cell === CELL.SHIP || cell === CELL.HIT)) {
          shipStyle = getShipCellStyle(r, c);
          bg = ""; 
      }
      if (cell === CELL.MISS) { content = <div className="w-2 h-2 rounded-full bg-slate-400/40 animate-pulse"></div>; }
      if (cell === CELL.HIT) { 
          content = <AlertTriangle className="w-5 h-5 text-red-500 animate-ping relative z-10"/>;
          if (!isMyBoard) bg = "bg-red-900/30"; 
      }
      if (phase === 'placement' && isMyBoard) {
          const ship = myShips[selectedShipIdx];
          if (ship) {
            const isHovering = orientation === 'H' ? r === hoverR && c >= hoverC && c < hoverC + ship.size : c === hoverC && r >= hoverR && r < hoverR + ship.size;
            if (isHovering) {
                 const can = canPlaceShip(myBoard, hoverR, hoverC, ship.size, orientation);
                 bg = can ? "bg-cyan-500/40 border-cyan-400" : "bg-red-500/40 border-red-400";
            }
          }
      }
      return (
          <div key={`${r}-${c}`} 
               onClick={() => isMyBoard ? handlePlaceClick(r,c) : handleAttackClick(r,c)}
               onMouseEnter={() => { setHoverR(r); setHoverC(c); }}
               className={`relative w-8 h-8 sm:w-10 sm:h-10 border border-slate-700/30 flex items-center justify-center cursor-pointer transition-all group ${bg} ${shipStyle}`}>
              {content}
              {!isMyBoard && phase === 'battle' && cell === CELL.WATER && (<div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>)}
          </div>
      );
  };
  const [hoverR, setHoverR] = useState(-1); const [hoverC, setHoverC] = useState(-1);

  // --- COMPONENTES AUXILIARES ---
  const BoardWithCoordinates = ({ isMyBoard, boardData, title, owner }) => (
      <div className="flex flex-col items-center">
          <div className="flex justify-between w-full mb-2 px-2">
              <h3 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${isMyBoard ? 'text-cyan-400' : 'text-red-400'}`}>{isMyBoard ? <Ship className="w-4 h-4"/> : <Crosshair className="w-4 h-4"/>} {title}</h3>
              {phase === 'placement' && isMyBoard && <span className="text-xs font-mono text-cyan-400">{placedCount}/5</span>}
              {!isMyBoard && <span className="text-xs font-mono text-red-500">{owner}</span>}
          </div>
          <div className={`p-3 bg-slate-900/80 rounded-xl border backdrop-blur-md shadow-2xl ${isMyBoard ? 'border-slate-700 shadow-cyan-900/20' : 'border-red-900/30 shadow-red-900/20'}`}>
              <div className="flex mb-1"><div className="w-6 sm:w-8"></div>{COLS.map(col => <div key={col} className="w-8 h-6 sm:w-10 sm:h-8 flex items-center justify-center text-[10px] sm:text-xs font-mono font-bold text-slate-500">{col}</div>)}</div>
              {boardData.map((row, r) => (
                  <div key={r} className="flex">
                      <div className="w-6 h-8 sm:w-8 sm:h-10 flex items-center justify-center text-[10px] sm:text-xs font-mono font-bold text-slate-500 mr-1">{ROWS[r]}</div>
                      <div className="grid grid-cols-10 gap-px bg-slate-800/50 border border-slate-700/50 overflow-hidden rounded-sm relative">
                          {row.map((cell, c) => renderCell(cell, r, c, isMyBoard))}
                      </div>
                  </div>
              ))}
          </div>
          {phase === 'placement' && isMyBoard && (
              <div className="mt-4 flex gap-4 w-full justify-center animate-in slide-in-from-bottom">
                  {placedCount < SHIP_TYPES.length ? (
                      <button onClick={() => setOrientation(o => o === 'H' ? 'V' : 'H')} className="px-6 py-3 bg-slate-800 border border-slate-600 rounded-lg text-xs font-bold hover:bg-slate-700 flex items-center gap-2 hover:border-cyan-500 transition-all shadow-lg"><RotateCw className="w-4 h-4"/> ROTAR ({orientation})</button>
                  ) : !amReady ? (
                      <button onClick={finalizePlacement} className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg text-xs font-black uppercase tracking-widest shadow-lg shadow-green-900/30 transition-all scale-105">CONFIRMAR DESPLIEGUE</button>
                  ) : <span className="text-xs text-cyan-500 animate-pulse font-mono bg-slate-900/50 px-4 py-2 rounded-full">Esperando sincronización...</span>}
              </div>
          )}
      </div>
  );

  const FleetStatus = ({ ships, board, isEnemy }) => {
      // Función para verificar si un barco está hundido
      const isSunk = (ship) => {
          if (!ship || !ship.coords || ship.coords.length === 0) return false;
          const targetBoard = isEnemy ? secretOpBoard : myBoard;
          if (!targetBoard) return false;
          return ship.coords.every(c => targetBoard[c.r][c.c] === CELL.HIT || targetBoard[c.r][c.c] === CELL.SUNK);
      };

      return (
          <div className="bg-slate-900/90 border border-slate-700 p-4 rounded-xl backdrop-blur-md w-full md:w-48 shadow-lg">
              <h4 className={`text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-slate-700 pb-2 ${isEnemy ? 'text-red-400' : 'text-cyan-400'}`}>
                  {isEnemy ? 'INTELIGENCIA' : 'ESTADO FLOTA'}
              </h4>
              <div className="flex flex-col gap-3">
                  {ships.map((ship, i) => {
                      const sunk = isSunk(ship);
                      return (
                          <div key={i} className={`flex items-center justify-between transition-all ${sunk ? 'opacity-40 grayscale' : 'opacity-100'}`}>
                              <div className="flex flex-col">
                                  <span className={`text-[9px] font-bold uppercase ${sunk ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{ship.name}</span>
                                  <div className="flex gap-0.5 mt-1">
                                      {[...Array(ship.size)].map((_, j) => (
                                          <div key={j} className={`w-2 h-2 rounded-sm ${sunk ? 'bg-red-900' : (isEnemy ? 'bg-red-500' : 'bg-cyan-500')}`}></div>
                                      ))}
                                  </div>
                              </div>
                              {sunk && <Skull className="w-4 h-4 text-red-600"/>}
                          </div>
                      );
                  })}
              </div>
          </div>
      );
  };

  return (
    <div className={`min-h-screen bg-[#020617] flex flex-col items-center p-2 font-sans text-slate-200 select-none overflow-hidden relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#0a1120] via-[#020617] to-black ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
      
      {adState.active && <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center flex-col backdrop-blur-md"><Radar className="w-20 h-20 text-green-500 animate-spin mb-4"/><h2 className="text-2xl font-bold tracking-widest text-green-400">ENLACE SATELITAL: {adState.timer}s</h2></div>}

      {/* ALERTA HUNDIDO */}
      {sunkAlert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="bg-red-600/90 text-white px-8 py-6 rounded-lg shadow-[0_0_50px_rgba(220,38,38,0.8)] animate-in zoom-in duration-300 flex flex-col items-center">
                  <ShieldAlert className="w-16 h-16 mb-2 animate-bounce"/>
                  <h2 className="text-3xl font-black uppercase tracking-tighter italic text-center">¡{sunkAlert.shipName} {sunkAlert.isEnemy ? 'ENEMIGO ELIMINADO' : 'ALIADO PERDIDO'}!</h2>
              </div>
          </div>
      )}

      {/* HEADER TÁCTICO */}
      <div className="w-full max-w-7xl flex justify-between items-center mb-4 z-10 px-4 mt-4">
        <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-cyan-500 transition-all group"><ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-cyan-500"/></button>
        <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 tracking-[0.2em] uppercase drop-shadow-2xl filter">NAVAL ELITE</h1>
            <p className="text-[10px] text-cyan-500 font-bold tracking-[0.5em] uppercase">Tactical Warfare V2</p>
        </div>
        {view !== 'menu' && (
            <div className={`px-5 py-2 rounded-full border-2 font-bold text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg backdrop-blur-md ${turn==='player' ? 'bg-cyan-950/50 border-cyan-500 text-cyan-400 shadow-cyan-500/20 animate-pulse' : 'bg-red-950/50 border-red-500 text-red-400 shadow-red-500/20'}`}>
                {turn==='player' ? <Target className="w-4 h-4"/> : <Shield className="w-4 h-4"/>} {turn==='player' ? 'TU TURNO' : 'CPU TURNO'}
            </div>
        )}
      </div>

      {view === 'menu' ? (
          <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-8 z-10">
              <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 backdrop-blur-md shadow-xl">
                  <h2 className="text-sm font-bold text-cyan-400 mb-4 uppercase tracking-widest flex items-center gap-2"><Cpu className="w-4 h-4"/> Simulación de Combate (CPU)</h2>
                  <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => startPlacement('pve', 'easy')} className="py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-bold text-slate-300 transition-all">CADETE</button>
                      <button onClick={() => startPlacement('pve', 'medium')} className="py-3 bg-slate-800 hover:bg-cyan-900/30 border border-slate-600 hover:border-cyan-500 rounded-lg text-xs font-bold text-cyan-300 transition-all">CAPITÁN</button>
                      <button onClick={() => startPlacement('pve', 'hard')} className="py-3 bg-slate-800 hover:bg-red-900/30 border border-slate-600 hover:border-red-500 rounded-lg text-xs font-bold text-red-400 transition-all">ALMIRANTE</button>
                  </div>
              </div>

              <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 backdrop-blur-md shadow-xl">
                  <h2 className="text-sm font-bold text-cyan-400 mb-4 uppercase tracking-widest flex items-center gap-2"><Users className="w-4 h-4"/> Multijugador Online</h2>
                  <div className="flex gap-2">
                      <button onClick={createRoom} className="flex-1 py-3 bg-cyan-700 rounded-lg font-bold text-xs hover:bg-cyan-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]">CREAR SALA</button>
                      <input id="code" placeholder="CÓDIGO" className="w-24 bg-black/50 border border-slate-600 rounded-lg text-center font-mono text-cyan-400 font-bold focus:border-cyan-500 outline-none"/>
                      <button onClick={() => joinRoom(document.getElementById('code').value)} className="flex-1 py-3 bg-slate-800 rounded-lg font-bold text-xs border border-slate-600 hover:border-cyan-500 text-slate-300 transition-all">UNIRSE</button>
                  </div>
              </div>
              
              {leaderboard.length > 0 && <div className="mt-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm"><div className="flex justify-between text-[10px] text-slate-500 mb-2 font-bold uppercase tracking-widest"><span>Rango Global</span><span>Puntuación</span></div>{leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-xs text-slate-300 border-b border-slate-800/50 py-2 font-mono"><span>#{i+1} {s.displayName}</span><span className="text-cyan-500 font-bold">{s.score}</span></div>))}</div>}
          </div>
      ) : (
          <div className="w-full max-w-7xl flex flex-col items-center flex-grow relative z-10 pb-4">
              
              {/* LOG TÁCTICO */}
              <div className="w-full max-w-3xl bg-black/60 border-x border-cyan-500/30 p-2 mb-4 text-center rounded-sm backdrop-blur-md relative overflow-hidden">
                  <div className="absolute inset-0 bg-cyan-500/5 animate-pulse pointer-events-none"></div>
                  <p className="font-mono text-sm text-cyan-300 relative z-10 flex items-center justify-center gap-2"><span className="inline-block w-2 h-2 bg-cyan-500 rounded-full animate-ping"></span>{log}</p>
              </div>

              {/* DASHBOARD PRINCIPAL */}
              <div className="flex flex-col xl:flex-row gap-6 items-start justify-center w-full px-2">
                  
                  {/* PANEL IZQUIERDO: FLOTA PROPIA */}
                  <div className="hidden md:block">
                      <FleetStatus ships={myShips} board={myBoard} isEnemy={false} />
                  </div>

                  {/* TABLEROS CENTRALES */}
                  <div className="flex flex-col md:flex-row gap-8 items-start justify-center">
                      <BoardWithCoordinates isMyBoard={true} boardData={myBoard} title="SECTOR ALIADO" />
                      
                      {phase === 'battle' && (
                          <div className="flex flex-col items-center animate-in slide-in-from-right duration-700">
                              <BoardWithCoordinates isMyBoard={false} boardData={opBoard} title="SECTOR HOSTIL" owner={opName} />
                              
                              {/* Botones de Habilidad (Solo PvE) */}
                              {turn === 'player' && view === 'pve' && (
                                  <div className="flex gap-3 mt-4">
                                      <button onClick={() => watchAd('radar')} className="px-4 py-2 bg-slate-800/80 border border-green-500/30 rounded flex items-center gap-2 text-[10px] font-bold text-green-400 hover:bg-green-900/30 hover:border-green-500 transition-all shadow-lg group"><Radar className="w-3 h-3 group-hover:animate-spin"/> ESCÁNER (VIDEO)</button>
                                      <button onClick={() => watchAd('airstrike')} className="px-4 py-2 bg-slate-800/80 border border-orange-500/30 rounded flex items-center gap-2 text-[10px] font-bold text-orange-400 hover:bg-orange-900/30 hover:border-orange-500 transition-all shadow-lg group"><Zap className="w-3 h-3 group-hover:animate-bounce"/> ATAQUE AÉREO (VIDEO)</button>
                                  </div>
                              )}
                          </div>
                      )}
                  </div>

                  {/* PANEL DERECHO: FLOTA ENEMIGA */}
                  {phase === 'battle' && (
                      <div className="hidden md:block animate-in fade-in">
                          <FleetStatus ships={opShips} board={opBoard} isEnemy={true} />
                      </div>
                  )}
              </div>

              {/* VISIBILIDAD MÓVIL DE PANELES */}
              <div className="md:hidden flex gap-4 mt-6 w-full px-4">
                  <FleetStatus ships={myShips} board={myBoard} isEnemy={false} />
                  {phase === 'battle' && <FleetStatus ships={opShips} board={opBoard} isEnemy={true} />}
              </div>

              {/* OVERLAY VICTORIA/DERROTA */}
              {winner && (
                  <div className="absolute inset-0 bg-[#020617]/95 flex flex-col items-center justify-center z-50 animate-in zoom-in backdrop-blur-xl p-4">
                      <div className={`p-8 rounded-3xl border-2 ${winner === user?.uid ? 'border-cyan-500 bg-cyan-950/30' : 'border-red-600 bg-red-950/30'} text-center shadow-2xl max-w-md w-full relative overflow-hidden`}>
                          <div className={`absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] ${winner === user?.uid ? 'from-cyan-500' : 'from-red-600'} to-transparent scale-150 animate-pulse`}></div>
                          {winner === user?.uid ? (
                              <>
                                  <Trophy className="w-28 h-28 text-cyan-400 mx-auto mb-6 animate-bounce drop-shadow-[0_0_40px_rgba(34,211,238,0.6)] relative z-10"/>
                                  <h2 className="text-6xl font-black text-white italic tracking-tighter mb-2 relative z-10">¡VICTORIA!</h2>
                                  <div className="h-1 w-32 bg-cyan-500 mx-auto mb-4 rounded-full relative z-10"></div>
                                  <p className="text-cyan-200 font-mono tracking-widest text-sm mb-8 uppercase relative z-10">Control del sector asegurado.</p>
                              </>
                          ) : (
                              <>
                                  <Skull className="w-28 h-28 text-red-600 mx-auto mb-6 drop-shadow-[0_0_40px_rgba(220,38,38,0.6)] relative z-10 animate-pulse"/>
                                  <h2 className="text-6xl font-black text-white italic tracking-tighter mb-2 relative z-10">DERROTA</h2>
                                  <div className="h-1 w-32 bg-red-600 mx-auto mb-4 rounded-full relative z-10"></div>
                                  <p className="text-red-300 font-mono tracking-widest text-sm mb-8 uppercase relative z-10">Señal de la flota perdida.</p>
                              </>
                          )}
                          <button onClick={() => setView('menu')} className={`px-10 py-4 ${winner === user?.uid ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-red-700 hover:bg-red-600'} text-white font-black rounded-xl hover:scale-105 transition uppercase tracking-widest shadow-lg relative z-10`}>Regresar a la Base</button>
                      </div>
                  </div>
              )}
          </div>
      )}
      <div className="mt-auto w-full max-w-md pt-4 opacity-60 relative z-10"><AdSpace type="banner" /><GameChat gameId={view.includes('pvp') ? roomCode : "global_battleship"} gameName="NAVAL ELITE" /></div>
    </div>
  );
}