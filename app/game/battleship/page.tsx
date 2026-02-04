// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Users, Cpu, Anchor, Crosshair, RotateCw, Waves, Skull, Radar, Ship } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, getDoc, serverTimestamp, query, orderBy, limit, getDocs, setDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- CONFIGURACIÓN ---
const BOARD_SIZE = 10;
const SHIP_TYPES = [
  { name: 'Portaaviones', size: 5, id: 'S5' },
  { name: 'Acorazado', size: 4, id: 'S4' },
  { name: 'Destructor', size: 3, id: 'S3' },
  { name: 'Submarino', size: 3, id: 'S2' },
  { name: 'Patrullero', size: 2, id: 'S1' },
];

// Estados de celda: 0=Agua, 1=Barco(oculto), 2=Agua(fallo), 3=Tocado(barco), 4=Hundido
const CELL = { WATER: 0, SHIP: 1, MISS: 2, HIT: 3, SUNK: 4 };

const createEmptyBoard = () => Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(CELL.WATER));

export default function ThaniaBattleship() {
  const [view, setView] = useState('menu'); // menu, placement, playing_pve, playing_pvp
  const [user, setUser] = useState(null);
  
  // ESTADO JUEGO
  const [phase, setPhase] = useState('placement'); // placement, battle
  const [myBoard, setMyBoard] = useState(createEmptyBoard());
  const [opBoard, setOpBoard] = useState(createEmptyBoard()); // Tablero de seguimiento (mis disparos)
  const [myShips, setMyShips] = useState([]); // [{id, size, hits, coords:[]}]
  const [opShipsSunk, setOpShipsSunk] = useState(0);
  
  // Placement UI
  const [selectedShipIdx, setSelectedShipIdx] = useState(0);
  const [orientation, setOrientation] = useState('H'); // H, V
  const [placedCount, setPlacedCount] = useState(0);

  const [turn, setTurn] = useState('player');
  const [winner, setWinner] = useState(null);
  const [log, setLog] = useState("¡Bienvenido a la cantina! Coloca tu flota.");

  // ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [opName, setOpName] = useState('Rival');
  const [isHost, setIsHost] = useState(false);
  const [opReady, setOpReady] = useState(false);
  const [amReady, setAmReady] = useState(false);
  // En online, guardamos el tablero REAL del oponente para verificar hits localmente (simplificación arcade)
  const [secretOpBoard, setSecretOpBoard] = useState(null); 

  // EXTRAS
  const [adState, setAdState] = useState({ active: false, timer: 5 });
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Capitán' });
    fetchLeaderboard();
  }, []);

  // --- SYNC ONLINE ---
  useEffect(() => {
    if (view.includes('pvp') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_battleship", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const imHost = isHost;

                // Nombres y estado de "Listo"
                if (imHost) {
                    setOpName(data.guestName || 'Esperando...');
                    setOpReady(data.guestReady || false);
                    if(data.guestBoardStr && !secretOpBoard) setSecretOpBoard(JSON.parse(data.guestBoardStr));
                } else {
                    setOpName(data.hostName || 'Host');
                    setOpReady(data.hostReady || false);
                    if(data.hostBoardStr && !secretOpBoard) setSecretOpBoard(JSON.parse(data.hostBoardStr));
                }

                // Iniciar batalla cuando ambos listos
                if (data.hostReady && data.guestReady && phase === 'placement') {
                    setPhase('battle');
                    setTurn(data.turn === 'host' ? (imHost ? 'player' : 'opponent') : (imHost ? 'opponent' : 'player'));
                    setLog("¡Ambas flotas listas! ¡FUEGO!");
                }

                // Sincronizar disparos (Si el rival disparó)
                const lastShot = data.lastShot; // {r, c, shooterId}
                if (lastShot && lastShot.shooterId !== user.uid && phase === 'battle') {
                    receiveAttack(lastShot.r, lastShot.c);
                }

                if (data.winner) setWinner(data.winner);
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode, phase, secretOpBoard]);

  // --- LÓGICA DE COLOCACIÓN ---
  const startPlacement = (mode) => {
    setMyBoard(createEmptyBoard()); setOpBoard(createEmptyBoard());
    setMyShips(SHIP_TYPES.map(s => ({...s, hits: 0, coords: [], sunk: false})));
    setPlacedCount(0); setSelectedShipIdx(0); setPhase('placement');
    setWinner(null); setOpReady(false); setAmReady(false); setSecretOpBoard(null);
    setView(mode);
    setLog("Coloca tus barcos. Pulsa rotar para cambiar orientación.");
    if(mode === 'pve') placeOpShipsRandomly(); // La IA coloca los suyos instantáneamente
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
          setMyBoard(newBoard);
          setMyShips(newShips);
          setPlacedCount(pc => pc + 1);
          setSelectedShipIdx(si => si + 1);

          if (placedCount + 1 === SHIP_TYPES.length) {
              setLog("¡Flota colocada! Pulsa LISTO para combatir.");
          }
      }
  };

  const finalizePlacement = async () => {
      setAmReady(true);
      setLog("Esperando al rival...");
      if (view === 'pve') {
          setPhase('battle'); setTurn('player'); setLog("¡A la batalla! Tu turno.");
      } else if (view.includes('pvp')) {
          const updateData = isHost ? { hostReady: true, hostBoardStr: JSON.stringify(myBoard) } : { guestReady: true, guestBoardStr: JSON.stringify(myBoard) };
          await updateDoc(doc(db, "matches_battleship", roomCode), updateData);
      }
  };

  // --- LÓGICA DE BATALLA (DISPARAR) ---
  const handleAttackClick = async (r, c) => {
      if (phase !== 'battle' || turn !== 'player' || winner || opBoard[r][c] !== CELL.WATER) return;

      // DETERMINAR RESULTADO (En PVE usamos el tablero real de la IA, en PVP el secreto sincronizado)
      const targetBoardReal = view === 'pve' ? secretOpBoard : secretOpBoard; 
      if (!targetBoardReal) return; // Seguridad

      const hit = targetBoardReal[r][c] === CELL.SHIP;
      const newOpBoard = opBoard.map(row => [...row]);
      newOpBoard[r][c] = hit ? CELL.HIT : CELL.MISS;
      setOpBoard(newOpBoard);

      let logMsg = hit ? "¡BOOM! Impacto confirmado." : "Agua... trago de ron.";
      if (hit) {
          // Verificar hundimiento (Lógica simplificada para arcade: contar hits totales)
          // Una implementación real verificaría qué barco específico se hundió.
          const totalHits = newOpBoard.flat().filter(cell => cell === CELL.HIT || cell === CELL.SUNK).length;
          const totalShipParts = SHIP_TYPES.reduce((sum, s) => sum + s.size, 0);
          if (totalHits === totalShipParts) {
             setWinner('player');
             saveScore(1000 - (opShipsSunk * 100)); // Puntos ejemplo
             if(view.includes('pvp')) await updateDoc(doc(db, "matches_battleship", roomCode), { winner: user.uid });
             return;
          }
      }

      setLog(logMsg);
      
      // PASAR TURNO
      if (view.includes('pvp')) {
          // Enviar el disparo al rival para que él actualice SU tablero y pase turno
          await updateDoc(doc(db, "matches_battleship", roomCode), { 
              lastShot: {r, c, shooterId: user.uid, timestamp: Date.now()},
              turn: isHost ? 'guest' : 'host'
          });
      } else {
          setTurn('opponent');
          setTimeout(aiTurn, 1000);
      }
  };

  // --- LÓGICA DE BATALLA (RECIBIR DISPARO) ---
  const receiveAttack = (r, c) => {
      const newMyBoard = myBoard.map(row => [...row]);
      const hit = newMyBoard[r][c] === CELL.SHIP;
      newMyBoard[r][c] = hit ? CELL.HIT : CELL.MISS;
      setMyBoard(newMyBoard);

      if (hit) {
         setLog(`¡Nos han dado en [${r},${c}]!`);
         // Check derrota
         const totalHits = newMyBoard.flat().filter(cell => cell === CELL.HIT || cell === CELL.SUNK).length;
         const totalShipParts = SHIP_TYPES.reduce((sum, s) => sum + s.size, 0);
         if (totalHits === totalShipParts) {
            setWinner('opponent');
         }
      } else {
         setLog(`El rival disparó al agua en [${r},${c}].`);
      }
      if (view !== 'pve') setTurn('player'); // En PvP el turno se cambia por la sincronización del 'lastShot'
  };


  // --- IA (CANTINERA BOT) ---
  const placeOpShipsRandomly = () => {
      const aiBoard = createEmptyBoard();
      SHIP_TYPES.forEach(ship => {
          let placed = false;
          while (!placed) {
              const r = Math.floor(Math.random() * BOARD_SIZE);
              const c = Math.floor(Math.random() * BOARD_SIZE);
              const orient = Math.random() > 0.5 ? 'H' : 'V';
              if (canPlaceShip(aiBoard, r, c, ship.size, orient)) {
                  for (let i = 0; i < ship.size; i++) {
                      if (orient === 'H') aiBoard[r][c + i] = CELL.SHIP; else aiBoard[r + i][c] = CELL.SHIP;
                  }
                  placed = true;
              }
          }
      });
      setSecretOpBoard(aiBoard);
  };

  const aiTurn = () => {
      if (winner) return;
      // IA Simple: Dispara al azar a casillas no disparadas
      let r, c, valid = false;
      while (!valid) {
          r = Math.floor(Math.random() * BOARD_SIZE);
          c = Math.floor(Math.random() * BOARD_SIZE);
          // Verificamos en NUESTRO tablero si esa casilla ya fue disparada (MISS o HIT)
          if (myBoard[r][c] === CELL.WATER || myBoard[r][c] === CELL.SHIP) valid = true;
      }
      receiveAttack(r, c);
      if (!winner) setTurn('player');
  };

  // --- HELPERS ONLINE & ADS ---
  const createRoom = async () => {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_battleship", code), {
          host: user?.uid, hostName: user?.name, hostReady: false, guestReady: false,
          turn: 'host', createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); startPlacement('pvp_host');
  };
  const joinRoom = async (c) => {
      await updateDoc(doc(db, "matches_battleship", c), { guest: user?.uid, guestName: user?.name });
      setRoomCode(c); setIsHost(false); startPlacement('pvp_guest');
  };

  const watchAd = () => { setAdState({ active: true, timer: 5 }); };
  useEffect(() => {
    let i;
    if (adState.active && adState.timer > 0) i = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active) { clearInterval(i); setAdState({active:false, timer:5}); activateSonar(); } 
    return () => clearInterval(i);
  }, [adState.active]);

  const activateSonar = () => {
      // Power-up: Revela una casilla de barco del rival no golpeada
      if (!secretOpBoard) return;
      let r, c, found = false;
      let attempts = 0;
      while (!found && attempts < 100) {
          r = Math.floor(Math.random() * BOARD_SIZE);
          c = Math.floor(Math.random() * BOARD_SIZE);
          if (secretOpBoard[r][c] === CELL.SHIP && opBoard[r][c] === CELL.WATER) {
              const newOpBoard = opBoard.map(row => [...row]);
              newOpBoard[r][c] = CELL.HIT; // Lo marcamos como hit visualmente (cheat)
              setOpBoard(newOpBoard);
              setLog(`¡SONAR ACTIVO! Objetivo detectado en [${r},${c}]`);
              found = true;
          }
          attempts++;
      }
  };

  const saveScore = async (s) => { if(user) await addDoc(collection(db, "scores_battleship"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); fetchLeaderboard(); };
  const fetchLeaderboard = async () => { const q = query(collection(db, "scores_battleship"), orderBy("score", "desc"), limit(5)); const s = await getDocs(q); setLeaderboard(s.docs.map(d=>d.data())); };

  // --- RENDER ---
  const renderCell = (cellState, r, c, isMyBoard) => {
      let bg = 'bg-blue-950'; let content = null;
      if (cellState === CELL.Water) bg = 'bg-blue-950 hover:bg-blue-900';
      // Si es mi tablero, muestro mis barcos. Si es el del rival, solo si he acertado.
      if (isMyBoard && cellState === CELL.SHIP) bg = 'bg-slate-700 border-cyan-500/50 border'; 
      
      if (cellState === CELL.MISS) { bg = 'bg-blue-900/50'; content = <Waves className="w-3 h-3 text-blue-400 opacity-50"/>; }
      if (cellState === CELL.HIT) { bg = 'bg-red-900/50'; content = <Crosshair className="w-4 h-4 text-red-500 animate-pulse"/>; }
      if (cellState === CELL.SUNK) { bg = 'bg-red-950'; content = <Skull className="w-4 h-4 text-red-600"/>; }

      // Hover para placement
      if (phase === 'placement' && isMyBoard) {
          const ship = myShips[selectedShipIdx];
          if (ship) {
              let isHover = false;
              if (orientation === 'H' && r === hoverRow && c >= hoverCol && c < hoverCol + ship.size) isHover = true;
              if (orientation === 'V' && c === hoverCol && r >= hoverRow && r < hoverRow + ship.size) isHover = true;
              if (isHover) bg = canPlaceShip(myBoard, hoverRow, hoverCol, ship.size, orientation) ? 'bg-cyan-500/30' : 'bg-red-500/30';
          }
      }

      return (
        <div key={`${r}-${c}`} 
             onClick={() => isMyBoard ? handlePlaceClick(r,c) : handleAttackClick(r,c)}
             onMouseEnter={() => { if(phase==='placement') { setHoverRow(r); setHoverCol(c); }}}
             className={`w-6 h-6 sm:w-8 sm:h-8 border border-blue-900/30 flex items-center justify-center cursor-pointer transition-all relative ${bg}`}>
             {content}
        </div>
      );
  };
  const [hoverRow, setHoverRow] = useState(-1); const [hoverCol, setHoverCol] = useState(-1);

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-2 font-mono text-white select-none overflow-hidden relative bg-[url('/assets/water-texture.png')] bg-cover bg-blend-overlay">
      {/* FONDO DE AGUA ANIMADO (Opcional si tienes la imagen, si no, se ve azul oscuro) */}
      <div className="absolute inset-0 bg-blue-900/20 pointer-events-none"></div>
      
      {adState.active && <div className="fixed inset-0 bg-black z-50 flex items-center justify-center flex-col"><Radar className="w-16 h-16 text-cyan-500 animate-spin mb-4"/><h2 className="text-xl text-cyan-400">CALIBRANDO SONAR ({adState.timer}s)</h2></div>}

      {/* HEADER */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-4 mt-2 px-4 relative z-10">
        <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 bg-blue-950 rounded-full border border-blue-800 hover:border-cyan-500 transition"><ArrowLeft className="w-5 h-5 text-cyan-400"/></button>
        <div className="text-center">
            <h1 className="text-xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 tracking-tighter flex items-center justify-center gap-2"><Anchor className="w-5 h-5"/> THANIA LA CANTINERA</h1>
            <p className="text-[10px] text-blue-400 tracking-[0.3em]">NEON BATTLESHIP</p>
        </div>
        {view !== 'menu' && <div className={`text-xs font-bold px-3 py-1 rounded-full border ${turn==='player' ? 'bg-cyan-900/50 border-cyan-500 text-cyan-400 animate-pulse' : 'bg-red-900/50 border-red-500 text-red-400'}`}>{turn==='player' ? 'TU TURNO' : 'TURNO RIVAL'}</div>}
      </div>

      {view === 'menu' ? (
          <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-8 relative z-10">
              <button onClick={() => startPlacement('pve')} className="bg-blue-950 p-6 rounded-3xl border border-blue-900 flex items-center gap-4 hover:border-cyan-500/50 transition group">
                  <div className="p-3 bg-blue-900 rounded-xl"><Cpu className="w-8 h-8 text-cyan-400 group-hover:scale-110 transition"/></div>
                  <div><h2 className="text-xl font-black text-white">VS CANTINERA BOT</h2><p className="text-xs text-blue-400">Entrenamiento táctico.</p></div>
              </button>
              <div className="bg-blue-950 p-6 rounded-2xl border border-blue-900">
                  <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-blue-400"/> DUELO NAVAL ONLINE</h2>
                  <div className="flex gap-2">
                      <button onClick={createRoom} className="flex-1 py-3 bg-cyan-700 rounded-xl font-bold text-xs hover:bg-cyan-600">CREAR</button>
                      <input id="code" placeholder="CÓDIGO" className="w-24 bg-blue-900 border border-blue-800 rounded-xl text-center font-bold text-cyan-400"/>
                      <button onClick={() => joinRoom(document.getElementById('code').value)} className="flex-1 py-3 bg-blue-900 rounded-xl font-bold text-xs border border-blue-800 hover:border-cyan-500">UNIRSE</button>
                  </div>
              </div>
              {leaderboard.length > 0 && <div className="bg-blue-950/50 p-4 rounded-xl border border-blue-900/50 mt-4"><h3 className="text-[10px] text-blue-400 uppercase font-bold mb-2">TOP ALMIRANTES</h3>{leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-[10px] text-blue-300 border-b border-blue-900/30 py-1"><span>#{i+1} {s.displayName}</span><span className="text-cyan-400">{s.score}</span></div>))}</div>}
          </div>
      ) : (
          <div className="w-full max-w-4xl flex flex-col items-center flex-grow h-full justify-start pb-4 relative z-10">
              
              {/* LOG & CONTROLES FASE */}
              <div className="w-full bg-blue-950/80 p-3 rounded-xl border border-blue-900 mb-4 flex justify-between items-center backdrop-blur-sm">
                  <div className="text-xs text-cyan-300 font-mono overflow-hidden text-ellipsis whitespace-nowrap max-w-[60%]">
                      <span className="text-blue-500 mr-2">Isla Tortuga &gt;</span>{log}
                  </div>
                  {phase === 'placement' && placedCount < SHIP_TYPES.length && (
                      <button onClick={() => setOrientation(o => o === 'H' ? 'V' : 'H')} className="flex items-center gap-1 px-3 py-1 bg-blue-900 rounded-lg text-[10px] font-bold border border-blue-800 hover:border-cyan-500 transition">
                          ROTAR <RotateCw className={`w-3 h-3 transition-transform ${orientation==='V'?'rotate-90':''}`}/>
                      </button>
                  )}
                  {phase === 'placement' && placedCount === SHIP_TYPES.length && !amReady && (
                      <button onClick={finalizePlacement} className="px-4 py-2 bg-cyan-600 rounded-lg text-xs font-bold hover:bg-cyan-500 animate-pulse">
                          ¡LISTO PARA COMBATE!
                      </button>
                  )}
                  {phase === 'battle' && turn === 'player' && view === 'pve' && (
                      <button onClick={watchAd} className="flex items-center gap-1 px-3 py-1 bg-purple-900/50 rounded-lg text-[10px] font-bold border border-purple-500/50 hover:bg-purple-900 transition text-purple-300">
                          <Radar className="w-3 h-3"/> SONAR (VIDEO)
                      </button>
                  )}
              </div>

              {/* ÁREA DE JUEGO - DOBLE TABLERO EN BATALLA */}
              <div className={`flex flex-col md:flex-row gap-4 md:gap-8 items-center justify-center w-full ${phase==='placement' ? '' : 'mt-4'}`}>
                  
                  {/* MI TABLERO (Siempre visible, para colocar o ver mis daños) */}
                  <div className="flex flex-col items-center">
                      <h3 className="text-xs font-bold text-blue-400 mb-2 flex items-center gap-2"><Ship className="w-4 h-4"/> MI FLOTA {phase==='placement' && `(${placedCount}/${SHIP_TYPES.length})`}</h3>
                      <div className="bg-blue-950 p-2 rounded-xl border border-blue-900 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
                          <div className="grid grid-cols-10 gap-[1px] bg-blue-900/50 border border-blue-800">
                              {myBoard.map((row, r) => row.map((cell, c) => renderCell(cell, r, c, true)))}
                          </div>
                      </div>
                  </div>

                  {/* TABLERO RIVAL (Solo visible en batalla) */}
                  {phase === 'battle' && (
                      <div className="flex flex-col items-center animate-in slide-in-from-right">
                          <h3 className="text-xs font-bold text-red-400 mb-2 flex items-center gap-2"><Crosshair className="w-4 h-4"/> ZONA OBJETIVO ({opName})</h3>
                          <div className={`bg-blue-950 p-2 rounded-xl border ${turn==='player'?'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)] cursor-crosshair':'border-blue-900'} transition-all`}>
                              <div className="grid grid-cols-10 gap-[1px] bg-blue-900/50 border border-blue-800">
                                  {opBoard.map((row, r) => row.map((cell, c) => renderCell(cell, r, c, false)))}
                              </div>
                          </div>
                      </div>
                  )}
              </div>
              
              {/* OVERLAY GANADOR */}
              {winner && (
                  <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50 animate-in zoom-in backdrop-blur-sm">
                      {winner === user?.uid ? <Trophy className="w-24 h-24 text-cyan-400 mb-6 animate-bounce drop-shadow-[0_0_20px_#22d3ee]"/> : <Skull className="w-24 h-24 text-red-600 mb-6 drop-shadow-[0_0_20px_#dc2626]"/>}
                      <h2 className="text-4xl font-black text-white mb-2 italic tracking-tighter">{winner === user?.uid ? '¡VICTORIA NAVAL!' : 'FLOTA HUNDIDA'}</h2>
                      <p className="text-blue-400 mb-8">Thania te invita a la próxima ronda.</p>
                      <button onClick={() => setView('menu')} className="px-8 py-4 bg-cyan-700 rounded-xl font-black hover:bg-cyan-600 transition">VOLVER AL PUERTO</button>
                  </div>
              )}
          </div>
      )}
      <div className="mt-auto w-full max-w-md pt-2 opacity-50 relative z-10"><AdSpace type="banner" /><GameChat gameId={view.includes('pvp') ? roomCode : "global_battleship"} gameName="BATTLESHIP" /></div>
    </div>
  );
}