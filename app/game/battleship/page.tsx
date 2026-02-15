// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Crosshair, Target, Shield, Anchor, Zap, 
  RotateCw, Play, Trophy, Users, Coins, MessageSquare, 
  Skull, Radar, AlertTriangle, ShieldAlert, Copy, Loader2
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, onSnapshot, getDoc, serverTimestamp, setDoc, collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';
import Link from 'next/link';

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

export default function BattleshipPro() {
  const [view, setView] = useState('menu');
  const [user, setUser] = useState(null);
  const { playSound } = useAudio();
  const { coins, spendCoins, addCoins } = useEconomy();
  
  // ESTADO JUEGO
  const [phase, setPhase] = useState('placement'); 
  const [myBoard, setMyBoard] = useState(createEmptyBoard());
  const [opBoard, setOpBoard] = useState(createEmptyBoard());
  
  const [myShips, setMyShips] = useState([]); 
  const [opShips, setOpShips] = useState([]); 
  
  // UI DE DESPLIEGUE
  const [selectedShipIdx, setSelectedShipIdx] = useState(0);
  const [orientation, setOrientation] = useState('H'); 
  const [placedCount, setPlacedCount] = useState(0);
  const [hoverR, setHoverR] = useState(-1); 
  const [hoverC, setHoverC] = useState(-1);

  const [turn, setTurn] = useState('player');
  const [winner, setWinner] = useState(null);
  const [log, setLog] = useState("Sistema iniciado. Esperando órdenes.");
  const [difficulty, setDifficulty] = useState('medium');

  // EFECTOS VISUALES
  const [sunkAlert, setSunkAlert] = useState(null); 
  const [shake, setShake] = useState(false);

  // IA TÁCTICA
  const [aiTargetStack, setAiTargetStack] = useState([]);

  // ONLINE PVP
  const [roomCode, setRoomCode] = useState('');
  const [opName, setOpName] = useState('Hostil');
  const [isHost, setIsHost] = useState(false);
  const [opReady, setOpReady] = useState(false);
  const [amReady, setAmReady] = useState(false);
  const [secretOpBoard, setSecretOpBoard] = useState(null); 

  // APUESTAS
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [currentBetInfo, setCurrentBetInfo] = useState(null);

  // EXTRAS
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 });
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingRank, setLoadingRank] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) setUser({ uid: u.uid, name: u.displayName || 'Comandante' });
    });
    fetchLeaderboard();
    return () => unsubscribe();
  }, []);

  // --- SYNC ONLINE ---
  useEffect(() => {
    if (view.includes('pvp') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_battleship", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const imHost = isHost;

                if (data.betInfo) setCurrentBetInfo(data.betInfo);

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
                    playSound('start');
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
          setLog("Objetivo fallido. Proyectil al agua.");
      }
      
      if (view.includes('pvp')) {
          await updateDoc(doc(db, "matches_battleship", roomCode), { lastShot: {r, c, shooterId: user.uid, timestamp: Date.now()}, turn: isHost ? 'guest' : 'host' });
      } else {
          setTurn('opponent');
          const delay = difficulty === 'hard' ? 800 : 1500;
          setTimeout(aiTurn, delay);
      }
  };

  const checkGameOver = (boardToCheck, potentialWinner) => {
      const totalHits = boardToCheck.flat().filter(cell => cell === CELL.HIT || cell === CELL.SUNK).length;
      const totalShipParts = SHIP_TYPES.reduce((sum, s) => sum + s.size, 0);
      
      if (totalHits >= totalShipParts) {
         const winnerId = potentialWinner === 'player' ? user?.uid : 'opponent';
         setWinner(winnerId);
         
         if (potentialWinner === 'player') {
             if (view === 'pve') {
                 const reward = difficulty === 'hard' ? 300 : (difficulty === 'medium' ? 150 : 50);
                 addCoins(reward, `Victoria Naval (${difficulty})`);
                 saveScore(reward * 10);
             } else {
                 if (currentBetInfo?.type === 'money') {
                     addCoins(currentBetInfo.value * 2, "Apuesta Batalla Naval");
                 }
                 saveScore(1000);
             }
         }
         
         if (view.includes('pvp') && potentialWinner === 'player') {
             updateDoc(doc(db, "matches_battleship", roomCode), { winner: user.uid });
         }
      }
  };

  // --- PREPARACIÓN ---
  const startPlacement = (mode, diff = 'medium') => {
    playSound('click');
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
          playSound('click');
      } else {
          playSound('error');
      }
  };

  const finalizePlacement = async () => {
      playSound('start');
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
      playSound('explosion');
      setSunkAlert({ shipName, isEnemy: !isMyShip });
      setTimeout(() => setSunkAlert(null), 2500);
  };

  // --- ONLINE ROOMS ---
  const handleCreateRoom = async () => {
      if (!user) return alert("Inicia sesión para jugar online");
      if (betType === 'money') {
          if (coins < betAmount) return alert("Fondos insuficientes. Gana monedas en PVE o en la tienda.");
          await spendCoins(betAmount, "Apuesta Batalla Naval (Host)");
      }

      playSound('click');
      const betInfo = { type: betType, value: betType === 'money' ? betAmount : betText || 'Honor' };
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_battleship", code), {
          host: user.uid, hostName: user.name, hostReady: false, guestReady: false,
          turn: 'host', betInfo, createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); setCurrentBetInfo(betInfo); startPlacement('pvp_host', 'medium');
  };

  const joinRoom = async (c) => {
      if (!user) return alert("Inicia sesión para jugar online");
      if (!c) return;
      playSound('click');

      const ref = doc(db, "matches_battleship", c);
      const snap = await getDoc(ref);
      if (!snap.exists()) return alert("Sala no encontrada");
      
      const data = snap.data();
      if (data.betInfo?.type === 'money') {
          if (coins < data.betInfo.value) return alert("Fondos insuficientes para entrar en esta sala.");
          await spendCoins(data.betInfo.value, "Apuesta Batalla Naval (Guest)");
      }

      await updateDoc(ref, { guest: user.uid, guestName: user.name });
      setRoomCode(c); setIsHost(false); setCurrentBetInfo(data.betInfo); startPlacement('pvp_guest', 'medium');
  };

  const saveScore = async (s) => { 
      if(user) {
          await addDoc(collection(db, "scores_battleship"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); 
          fetchLeaderboard(); 
      }
  };
  
  const fetchLeaderboard = async () => { 
      setLoadingRank(true);
      try {
          const q = query(collection(db, "scores_battleship"), orderBy("score", "desc"), limit(5)); 
          const s = await getDocs(q); 
          setLeaderboard(s.docs.map(d=>d.data())); 
      } catch (e) { console.error(e); } finally { setLoadingRank(false); }
  };

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
    if (isHorizontal) { if (isHead) roundedClass = "rounded-l-full border-l-2"; if (isTail) roundedClass = "rounded-r-full border-r-2"; } 
    else { if (isHead) roundedClass = "rounded-t-full border-t-2"; if (isTail) roundedClass = "rounded-b-full border-b-2"; }
    
    return `${roundedClass} bg-gradient-to-br from-cyan-600 to-slate-800 border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.3)] z-10`;
  };

  const renderCell = (cell, r, c, isMyBoard) => {
      let content = null;
      let bg = "bg-[#0f172a]/60 hover:bg-[#1e293b]"; 
      let shipStyle = "";

      if (isMyBoard && (cell === CELL.SHIP || cell === CELL.HIT)) {
          shipStyle = getShipCellStyle(r, c);
          bg = ""; 
      }
      if (cell === CELL.MISS) { 
          content = <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-slate-400/50"></div>; 
      }
      if (cell === CELL.HIT) { 
          content = <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 animate-pulse relative z-20 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]"/>;
          if (!isMyBoard) bg = "bg-red-900/30 border-red-500/30 shadow-[inset_0_0_15px_rgba(220,38,38,0.2)]"; 
      }
      
      // Hover Effect de Posicionamiento
      if (phase === 'placement' && isMyBoard) {
          const ship = myShips[selectedShipIdx];
          if (ship) {
            const isHovering = orientation === 'H' ? r === hoverR && c >= hoverC && c < hoverC + ship.size : c === hoverC && r >= hoverR && r < hoverR + ship.size;
            if (isHovering) {
                 const can = canPlaceShip(myBoard, hoverR, hoverC, ship.size, orientation);
                 bg = can ? "bg-cyan-500/40 border-cyan-400 shadow-[0_0_15px_cyan]" : "bg-red-500/40 border-red-400";
            }
          }
      }
      
      return (
          <div key={`${r}-${c}`} 
               // MODIFICADO: onPointerDown es mucho más rápido y directo que onClick para evitar el "doble click" en móviles por el hover
               onPointerDown={() => isMyBoard ? handlePlaceClick(r,c) : handleAttackClick(r,c)}
               onMouseEnter={() => { setHoverR(r); setHoverC(c); }}
               className={`relative w-7 h-7 sm:w-10 sm:h-10 border border-slate-700/30 flex items-center justify-center cursor-pointer transition-all duration-150 group overflow-hidden ${bg} ${shipStyle}`}>
              
              <div className="absolute inset-0 border-[0.5px] border-cyan-900/10 pointer-events-none"></div>
              {content}
              
              {/* Radar Hover Effect Enemy Board */}
              {!isMyBoard && phase === 'battle' && cell === CELL.WATER && (
                  <div className="absolute inset-0 bg-cyan-400/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                      <Crosshair className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400 drop-shadow-[0_0_5px_cyan]"/>
                  </div>
              )}
          </div>
      );
  };

  const BoardWithCoordinates = ({ isMyBoard, boardData, title, owner }) => (
      <div className="flex flex-col items-center relative group">
          
          {/* Radar Scan Overlay */}
          {!isMyBoard && phase === 'battle' && !winner && (
              <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(6,182,212,0.1)_50%,transparent_100%)] bg-[length:100%_200%] animate-[scan_3s_linear_infinite] pointer-events-none rounded-xl z-0"></div>
          )}

          <div className="flex justify-between w-full mb-2 px-2 relative z-10 items-end">
              <h3 className={`text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 ${isMyBoard ? 'text-cyan-400 drop-shadow-[0_0_5px_cyan]' : 'text-red-400 drop-shadow-[0_0_5px_red]'}`}>
                  {isMyBoard ? <Anchor className="w-4 h-4"/> : <Crosshair className="w-4 h-4"/>} {title}
              </h3>
              {phase === 'placement' && isMyBoard && <span className="text-[10px] sm:text-xs font-mono text-cyan-300 bg-cyan-950 px-3 py-1 rounded-lg border border-cyan-800">{placedCount}/5 NAVES</span>}
              {!isMyBoard && <span className="text-[10px] sm:text-xs font-mono text-red-500 animate-pulse bg-red-950/50 px-2 py-0.5 rounded border border-red-900">{owner}</span>}
          </div>
          
          <div className={`p-1.5 sm:p-2 bg-slate-900/80 rounded-2xl border-2 backdrop-blur-xl shadow-2xl relative z-10 ${isMyBoard ? 'border-cyan-900/50 shadow-cyan-500/10' : 'border-red-900/50 shadow-red-500/10'}`}>
              <div className="flex mb-0.5"><div className="w-5 sm:w-8"></div>{COLS.map(col => <div key={col} className="w-7 h-5 sm:w-10 sm:h-8 flex items-center justify-center text-[8px] sm:text-[10px] font-mono font-bold text-slate-500">{col}</div>)}</div>
              {boardData.map((row, r) => (
                  <div key={r} className="flex">
                      <div className="w-5 h-7 sm:w-8 sm:h-10 flex items-center justify-center text-[8px] sm:text-[10px] font-mono font-bold text-slate-500 mr-0.5">{ROWS[r]}</div>
                      <div className="grid grid-cols-10 gap-px bg-slate-800/50 border border-slate-700/50 rounded-md relative overflow-hidden">
                          {row.map((cell, c) => renderCell(cell, r, c, isMyBoard))}
                      </div>
                  </div>
              ))}
          </div>

          {/* Placement Controls */}
          {phase === 'placement' && isMyBoard && (
              <div className="mt-4 flex flex-col sm:flex-row gap-3 w-full justify-center animate-in slide-in-from-bottom px-2">
                  {placedCount < SHIP_TYPES.length ? (
                      <button onClick={() => setOrientation(o => o === 'H' ? 'V' : 'H')} className="w-full sm:w-auto px-6 py-3 bg-slate-800 border border-slate-600 rounded-xl text-xs font-bold hover:bg-slate-700 flex items-center justify-center gap-2 hover:border-cyan-500 transition-all shadow-lg active:scale-95"><RotateCw className="w-4 h-4"/> ROTAR ({orientation})</button>
                  ) : !amReady ? (
                      <button onClick={finalizePlacement} className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl text-xs font-black uppercase tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all active:scale-95 animate-pulse text-white border border-cyan-400">DESPLEGAR FLOTA</button>
                  ) : <span className="text-xs text-cyan-500 animate-pulse font-mono bg-slate-900/80 px-6 py-3 rounded-xl border border-cyan-500/30 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> ESPERANDO ENLACE...</span>}
              </div>
          )}
      </div>
  );

  const FleetStatus = ({ ships, board, isEnemy }) => {
      const isSunk = (ship) => {
          if (!ship || !ship.coords || ship.coords.length === 0) return false;
          const targetBoard = isEnemy ? secretOpBoard : myBoard;
          if (!targetBoard) return false;
          return ship.coords.every(c => targetBoard[c.r][c.c] === CELL.HIT || targetBoard[c.r][c.c] === CELL.SUNK);
      };

      return (
          <div className="bg-slate-900/80 border border-slate-700/50 p-4 rounded-2xl backdrop-blur-md w-full md:w-56 shadow-xl">
              <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 border-b border-white/5 pb-2 flex items-center gap-2 ${isEnemy ? 'text-red-400' : 'text-cyan-400'}`}>
                  {isEnemy ? <Radar className="w-4 h-4"/> : <Shield className="w-4 h-4"/>}
                  {isEnemy ? 'FLOTA ENEMIGA' : 'MI FLOTA'}
              </h4>
              <div className="flex flex-col gap-3">
                  {ships.map((ship, i) => {
                      const sunk = isSunk(ship);
                      return (
                          <div key={i} className={`flex items-center justify-between transition-all duration-500 ${sunk ? 'opacity-30 grayscale blur-[0.5px]' : 'opacity-100'}`}>
                              <div className="flex flex-col">
                                  <span className={`text-[9px] font-bold uppercase tracking-wider ${sunk ? 'text-red-500 line-through' : 'text-slate-300'}`}>{ship.name}</span>
                                  <div className="flex gap-1 mt-1.5">
                                      {[...Array(ship.size)].map((_, j) => (
                                          <div key={j} className={`w-3 h-1.5 rounded-full ${sunk ? 'bg-red-900' : (isEnemy ? 'bg-red-500/80' : 'bg-cyan-500/80')} shadow-sm`}></div>
                                      ))}
                                  </div>
                              </div>
                              {sunk && <Skull className="w-4 h-4 text-red-600 drop-shadow-[0_0_5px_red]"/>}
                          </div>
                      );
                  })}
              </div>
          </div>
      );
  };

  const handleBack = () => {
    setPhase('placement'); 
    setView('menu'); 
    setWinner(null); 
    setMyBoard(createEmptyBoard());
  };

  return (
    <div className={`min-h-screen bg-[#020617] flex flex-col items-center p-2 font-sans text-slate-200 select-none overflow-hidden relative ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
      
      {/* FONDO MILITAR */}
      <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:30px_30px] sm:bg-[size:40px_40px]"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020617_100%)]"></div>
      </div>

      {adState.active && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center flex-col backdrop-blur-md">
            <div className="p-8 rounded-full bg-cyan-900/20 border border-cyan-500/30 animate-pulse mb-6">
                <Radar className="w-20 h-20 text-cyan-500 animate-spin"/>
            </div>
            <h2 className="text-2xl font-black tracking-widest text-cyan-400 uppercase italic">Conectando Satélite... {adState.timer}s</h2>
        </div>
      )}

      {/* ALERTA BARCO HUNDIDO */}
      {sunkAlert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="bg-black/90 border-y-4 border-red-500 text-white px-8 sm:px-16 py-8 shadow-[0_0_100px_rgba(220,38,38,0.6)] animate-in zoom-in duration-300 flex flex-col items-center backdrop-blur-xl w-full max-w-lg">
                  <ShieldAlert className="w-16 h-16 sm:w-20 sm:h-20 mb-4 text-red-500 animate-bounce"/>
                  <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter italic text-center drop-shadow-lg text-red-100">
                      {sunkAlert.shipName} <br/><span className="text-red-500 drop-shadow-[0_0_10px_red]">{sunkAlert.isEnemy ? 'DESTRUIDO' : 'PERDIDO'}</span>
                  </h2>
              </div>
          </div>
      )}

      {/* HEADER */}
      <div className="w-full max-w-7xl flex justify-between items-center py-4 px-2 sm:px-4 z-10 relative mt-2">
        <button onClick={() => { if(view==='menu') window.location.href='/'; else { handleBack(); } }} className="p-2 sm:p-3 bg-slate-900/50 rounded-full border border-slate-700 hover:border-cyan-500 transition-all shadow-lg"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
        
        <div className="text-center">
            <h1 className="text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 tracking-[0.1em] sm:tracking-[0.2em] uppercase drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]">HUNDIR LA FLOTA</h1>
            <p className="text-[8px] sm:text-[10px] text-cyan-500/80 font-bold tracking-[0.5em] uppercase mt-1">Tactical Warfare</p>
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
          <div className="w-full max-w-md grid gap-4 animate-in fade-in zoom-in mt-6 z-10 px-2 flex-grow overflow-y-auto no-scrollbar pb-4">
              
              {/* PVE */}
              <div className="bg-slate-900/80 p-6 rounded-[2rem] border border-slate-700 backdrop-blur-md shadow-2xl">
                  <h2 className="text-[10px] font-bold text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-2"><Target className="w-4 h-4 text-cyan-500"/> Misiones de Combate</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button onClick={() => startPlacement('pve', 'easy')} className="py-4 bg-slate-950 hover:bg-slate-800 border-2 border-slate-700 rounded-xl font-bold text-slate-300 transition-all active:scale-95 shadow-lg text-xs">CADETE</button>
                      <button onClick={() => startPlacement('pve', 'medium')} className="py-4 bg-slate-950 hover:bg-cyan-900/30 border-2 border-cyan-800/50 hover:border-cyan-500 rounded-xl font-bold text-cyan-400 transition-all active:scale-95 shadow-lg text-xs">CAPITÁN</button>
                      <button onClick={() => startPlacement('pve', 'hard')} className="py-4 bg-slate-950 hover:bg-red-900/30 border-2 border-red-800/50 hover:border-red-500 rounded-xl font-bold text-red-400 transition-all active:scale-95 shadow-lg text-xs">ALMIRANTE</button>
                  </div>
              </div>

              {/* PVP */}
              <div className="bg-slate-900/80 p-6 rounded-[2rem] border border-slate-700 backdrop-blur-md shadow-2xl">
                  <h2 className="text-[10px] font-bold text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-2"><Users className="w-4 h-4 text-blue-500"/> Combate Multijugador</h2>
                  
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
                      <button onClick={handleCreateRoom} className="w-full sm:flex-1 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl font-black text-xs uppercase tracking-widest shadow-[0_0_15px_rgba(6,182,212,0.4)] text-white active:scale-95 transition-all border border-cyan-400/50">CREAR SALA</button>
                      <div className="flex w-full sm:flex-1 gap-2">
                          <input id="code" placeholder="CODE" maxLength={4} className="flex-1 bg-slate-950 border border-slate-700 rounded-xl text-center font-black outline-none focus:border-cyan-500 uppercase text-white"/>
                          <button onClick={() => joinRoom(document.getElementById('code').value.toUpperCase())} className="px-4 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-colors active:scale-95 text-white"><Play className="w-4 h-4 fill-current"/></button>
                      </div>
                  </div>
              </div>
              
              {/* RANKING */}
              <div className="bg-slate-900/50 p-5 rounded-[2rem] border border-slate-800 mb-2">
                  <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-3 text-center tracking-widest">Ranking Global</h3>
                  {loadingRank ? <Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto"/> : leaderboard.length > 0 ? leaderboard.map((s,i) => (
                      <div key={i} className="flex justify-between items-center text-[10px] py-2 border-b border-white/5 last:border-0 text-slate-300">
                          <span className="font-bold text-white flex gap-2"><span>#{i+1}</span> {s.displayName}</span>
                          <span className="text-cyan-400 font-black">{s.score} PTS</span>
                      </div>
                  )) : <p className="text-[10px] text-slate-600 text-center">Sin registros tácticos</p>}
              </div>
          </div>
      ) : (
          <div className="w-full max-w-7xl flex flex-col items-center flex-grow relative z-10 pb-4 overflow-y-auto no-scrollbar">
              
              {/* TOP BAR: LOG & TURN */}
              <div className="w-full flex flex-col sm:flex-row items-center justify-between px-4 mb-4 gap-4">
                  {phase === 'battle' && !winner && (
                      <div className={`px-6 py-2 rounded-full border-2 font-black text-[10px] sm:text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg backdrop-blur-md ${turn==='player' ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)] animate-pulse' : 'bg-red-950/80 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]'}`}>
                          {turn==='player' ? <Target className="w-4 h-4"/> : <Shield className="w-4 h-4"/>} {turn==='player' ? 'TU TURNO PARA ATACAR' : 'EL ENEMIGO ESTÁ ATACANDO'}
                      </div>
                  )}
                  
                  <div className="flex-1 max-w-xl bg-black/60 border border-slate-700 p-2 rounded-xl backdrop-blur-md relative overflow-hidden flex items-center justify-center min-h-[40px]">
                      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(6,182,212,0.1),transparent)] animate-[scan_2s_linear_infinite] pointer-events-none"></div>
                      <p className="font-mono text-xs sm:text-sm text-slate-300 relative z-10 flex items-center justify-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full animate-ping ${log.includes('IMPACTO')||log.includes('ALERTA') ? 'bg-red-500' : 'bg-cyan-500'}`}></span>
                          {log}
                      </p>
                  </div>
              </div>

              {/* DASHBOARD PRINCIPAL */}
              <div className="flex flex-col xl:flex-row gap-6 items-start justify-center w-full px-2">
                  
                  {/* PANEL IZQUIERDO: MI FLOTA (Desktop) */}
                  <div className="hidden xl:block">
                      <FleetStatus ships={myShips} board={myBoard} isEnemy={false} />
                  </div>

                  {/* TABLEROS CENTRALES */}
                  <div className="flex flex-col md:flex-row gap-6 sm:gap-10 items-center justify-center">
                      <BoardWithCoordinates isMyBoard={true} boardData={myBoard} title="SECTOR ALIADO" />
                      
                      {phase === 'battle' && (
                          <div className="flex flex-col items-center animate-in slide-in-from-right duration-500">
                              <BoardWithCoordinates isMyBoard={false} boardData={opBoard} title="SECTOR HOSTIL" owner={opName} />
                              
                              {/* Habilidades Especiales (Solo PvE) */}
                              {turn === 'player' && view === 'pve' && (
                                  <div className="flex gap-2 sm:gap-4 mt-4 w-full">
                                      <button onClick={() => watchAd('radar')} className="flex-1 py-3 bg-slate-900 border border-green-500/30 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold text-green-400 hover:bg-green-900/50 hover:border-green-400 transition-all shadow-lg active:scale-95"><Radar className="w-4 h-4"/> ESCÁNER</button>
                                      <button onClick={() => watchAd('airstrike')} className="flex-1 py-3 bg-slate-900 border border-orange-500/30 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold text-orange-400 hover:bg-orange-900/50 hover:border-orange-400 transition-all shadow-lg active:scale-95"><Zap className="w-4 h-4"/> BOMBARDEO</button>
                                  </div>
                              )}
                          </div>
                      )}
                  </div>

                  {/* PANEL DERECHO: FLOTA ENEMIGA (Desktop) */}
                  {phase === 'battle' && (
                      <div className="hidden xl:block animate-in fade-in">
                          <FleetStatus ships={opShips} board={opBoard} isEnemy={true} />
                      </div>
                  )}
              </div>

              {/* ESTADO FLOTAS MÓVIL */}
              <div className="xl:hidden flex gap-4 mt-6 w-full px-4 justify-center">
                  <FleetStatus ships={myShips} board={myBoard} isEnemy={false} />
                  {phase === 'battle' && <FleetStatus ships={opShips} board={opBoard} isEnemy={true} />}
              </div>

              {/* OVERLAY VICTORIA/DERROTA */}
              {winner && (
                  <div className="fixed inset-0 bg-[#020617]/95 flex flex-col items-center justify-center z-50 animate-in zoom-in backdrop-blur-xl p-4">
                      <div className={`p-8 rounded-[2.5rem] border-2 ${winner === user?.uid ? 'border-cyan-500 bg-cyan-950/30 shadow-[0_0_50px_rgba(6,182,212,0.3)]' : 'border-red-600 bg-red-950/30 shadow-[0_0_50px_rgba(220,38,38,0.3)]'} text-center max-w-md w-full relative overflow-hidden`}>
                          <div className={`absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] ${winner === user?.uid ? 'from-cyan-500' : 'from-red-600'} to-transparent scale-150 animate-pulse`}></div>
                          
                          {winner === user?.uid ? (
                              <>
                                  <Trophy className="w-24 h-24 sm:w-32 sm:h-32 text-cyan-400 mx-auto mb-6 animate-bounce drop-shadow-[0_0_40px_rgba(34,211,238,0.6)] relative z-10"/>
                                  <h2 className="text-5xl sm:text-6xl font-black text-white italic tracking-tighter mb-2 relative z-10">¡VICTORIA!</h2>
                                  <div className="h-1 w-24 bg-cyan-500 mx-auto mb-4 rounded-full relative z-10"></div>
                                  <p className="text-cyan-200 font-mono tracking-widest text-xs sm:text-sm mb-8 uppercase relative z-10">Sector asegurado con éxito.</p>
                              </>
                          ) : (
                              <>
                                  <Skull className="w-24 h-24 sm:w-32 sm:h-32 text-red-500 mx-auto mb-6 drop-shadow-[0_0_40px_rgba(220,38,38,0.6)] relative z-10"/>
                                  <h2 className="text-5xl sm:text-6xl font-black text-white italic tracking-tighter mb-2 relative z-10">DERROTA</h2>
                                  <div className="h-1 w-24 bg-red-600 mx-auto mb-4 rounded-full relative z-10"></div>
                                  <p className="text-red-300 font-mono tracking-widest text-xs sm:text-sm mb-8 uppercase relative z-10">Flota destruida. Misión fallida.</p>
                              </>
                          )}
                          
                          {winner === user?.uid && view === 'pve' && (
                              <div className="bg-slate-900/80 text-yellow-400 px-6 py-3 rounded-2xl font-black mb-8 flex flex-col items-center gap-1 border border-yellow-500/30 shadow-lg relative z-10">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-widest">Recompensa</span>
                                  <span className="flex items-center gap-2 text-xl"><Coins className="w-5 h-5"/> +{difficulty === 'hard' ? 300 : (difficulty === 'medium' ? 150 : 50)}</span>
                              </div>
                          )}

                          <button onClick={handleBack} className={`w-full py-4 ${winner === user?.uid ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500' : 'bg-red-700 hover:bg-red-600'} text-white font-black rounded-xl hover:scale-105 active:scale-95 transition-all uppercase tracking-widest shadow-2xl relative z-10 text-sm border ${winner === user?.uid ? 'border-cyan-400' : 'border-red-500'}`}>Regresar a la Base</button>
                      </div>
                  </div>
              )}
          </div>
      )}
      
      {/* FOOTER */}
      <div className="mt-auto w-full max-w-md pt-2 opacity-80 relative z-10 mb-2">
          <AdSpace type="banner" />
          <GameChat gameId={view.includes('pvp') ? roomCode : "global_battleship"} gameName="NAVAL" />
      </div>
      
      <style jsx global>{`
        @keyframes scan {
          0% { transform: translateY(-100%) skewY(0deg); }
          100% { transform: translateY(200%) skewY(0deg); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px) rotate(-1deg); }
          50% { transform: translateX(5px) rotate(1deg); }
          75% { transform: translateX(-5px) rotate(-1deg); }
        }
      `}</style>
    </div>
  );
}