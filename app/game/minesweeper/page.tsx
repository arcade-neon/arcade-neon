// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart, Play, Trophy, RefreshCw, Bomb, Flag, Users, Cpu, Eye, Lightbulb, Video, Zap, ShieldAlert, Skull, Coins, TrendingUp, Hand, Wallet } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, setDoc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- INTEGRACIÓN ECOSISTEMA ---
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- CONFIGURACIÓN DE DIFICULTAD ---
// Multiplier: Cuánto multiplica tu apuesta si completas el tablero
const DIFFICULTIES = {
  easy: { rows: 8, cols: 8, mines: 10, name: 'POCO TÓXICA', multiplier: 1.5 },
  medium: { rows: 10, cols: 10, mines: 20, name: 'CELOSA', multiplier: 2.0 },
  hard: { rows: 12, cols: 12, mines: 30, name: 'DRAMA QUEEN', multiplier: 3.5 }
};

// --- UTILIDADES ---
const createEmptyGrid = (rows, cols) => {
  return Array(rows).fill(0).map(() => Array(cols).fill({
    isMine: false, isRevealed: false, isFlagged: false, neighborCount: 0
  }));
};

const getNeighbors = (r, c, rows, cols) => {
  const neighbors = [];
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      const newR = r + i;
      const newC = c + j;
      if (newR >= 0 && newR < rows && newC >= 0 && newC < cols) {
        neighbors.push({ r: newR, c: newC });
      }
    }
  }
  return neighbors;
};

export default function ChamiLaToxicaGame() {
  // HOOKS
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();

  // ESTADOS VISTA
  const [view, setView] = useState('menu'); // menu, betting, playing_ai, playing_online...
  const [user, setUser] = useState(null);

  // ESTADOS APUESTA
  const [bet, setBet] = useState(100);
  const [currentCashout, setCurrentCashout] = useState(0);

  // ESTADOS JUEGO
  const [grid, setGrid] = useState([]);
  const [config, setConfig] = useState(DIFFICULTIES.medium);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [flagMode, setFlagMode] = useState(false); 
  const [minesLeft, setMinesLeft] = useState(0);
  const [safeCellsTotal, setSafeCellsTotal] = useState(0); // Para calcular progreso

  // ESTADOS ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [opStatus, setOpStatus] = useState('Esperando...');

  // EXTRAS
  const [leaderboard, setLeaderboard] = useState([]);
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 });

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // --- LÓGICA ONLINE ---
  useEffect(() => {
    if ((view === 'playing_online_host' || view === 'playing_online_guest') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_minesweeper", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (view === 'playing_online_host') setOpStatus(data.guestStatus || 'Jugando...');
                else setOpStatus(data.hostStatus || 'Jugando...');
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode]);

  // --- PREPARACIÓN DEL JUEGO (Paso 1: Seleccionar Dificultad) ---
  const selectDifficulty = (diffKey) => {
    const conf = DIFFICULTIES[diffKey];
    setConfig(conf);
    setBet(100); // Reset apuesta por defecto
    setView('betting'); // Vamos a la pantalla de apuestas
  };

  // --- INICIAR CON APUESTA (Paso 2: Pagar y Jugar) ---
  const confirmStartGame = async () => {
    if (bet > coins) return alert("No tienes suficientes monedas.");
    if (bet < 10) return alert("Apuesta mínima 10 monedas.");

    const success = await spendCoins(bet, `Apuesta Chami (${config.name})`);
    if (!success) return;

    playSound('start');
    initBoard(config);
    setLives(3);
    setScore(0);
    setGameOver(false);
    setFlagMode(false);
    setCurrentCashout(bet); // Empiezas recuperando lo puesto (si te retiras al instante pierdes fee o nada)
    setView('playing_ai');
  };

  // --- ONLINE (Sin apuestas por ahora, o lógica simple) ---
  const createRoom = async (diffKey) => {
    const conf = DIFFICULTIES[diffKey];
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    await setDoc(doc(db, "matches_minesweeper", code), {
        host: user?.name || 'Anónimo', difficulty: diffKey, hostStatus: 'playing', guestStatus: 'waiting', createdAt: serverTimestamp()
    });
    setConfig(conf); initBoard(conf); setLives(1); setRoomCode(code); setView('playing_online_host');
  };
  const joinRoom = async (codeInput) => {
    const ref = doc(db, "matches_minesweeper", codeInput);
    const snap = await getDoc(ref);
    if (!snap.exists()) return alert("Sala no encontrada");
    const diffKey = snap.data().difficulty;
    const conf = DIFFICULTIES[diffKey];
    await updateDoc(ref, { guest: user?.name || 'Invitado', guestStatus: 'playing' });
    setConfig(conf); initBoard(conf); setLives(1); setRoomCode(codeInput); setView('playing_online_guest');
  };

  // --- CORE BUSCAMINAS ---
  const initBoard = (conf) => {
    let newGrid = createEmptyGrid(conf.rows, conf.cols);
    let minesPlaced = 0;
    while (minesPlaced < conf.mines) {
      const r = Math.floor(Math.random() * conf.rows);
      const c = Math.floor(Math.random() * conf.cols);
      if (!newGrid[r][c].isMine) {
        newGrid[r][c] = { ...newGrid[r][c], isMine: true };
        minesPlaced++;
      }
    }
    for (let r = 0; r < conf.rows; r++) {
      for (let c = 0; c < conf.cols; c++) {
        if (newGrid[r][c].isMine) continue;
        const neighbors = getNeighbors(r, c, conf.rows, conf.cols);
        const count = neighbors.reduce((acc, n) => acc + (newGrid[n.r][n.c].isMine ? 1 : 0), 0);
        newGrid[r][c] = { ...newGrid[r][c], neighborCount: count };
      }
    }
    setGrid(newGrid);
    setMinesLeft(conf.mines);
    setSafeCellsTotal((conf.rows * conf.cols) - conf.mines);
    setGameOver(false);
  };

  const handleCellClick = (r, c) => {
    if (gameOver || grid[r][c].isRevealed) return;
    if (!flagMode && !grid[r][c].isFlagged) playSound('click');
    if (flagMode) { toggleFlag(r, c); return; }
    if (grid[r][c].isFlagged) return;
    if (grid[r][c].isMine) triggerMine(r, c);
    else revealCell(r, c);
  };

  const toggleFlag = (r, c) => {
    if (grid[r][c].isRevealed) return;
    const newGrid = [...grid];
    newGrid[r][c] = { ...newGrid[r][c], isFlagged: !newGrid[r][c].isFlagged };
    setGrid(newGrid);
    setMinesLeft(prev => newGrid[r][c].isFlagged ? prev - 1 : prev + 1);
  };

  const triggerMine = async (r, c) => {
    playSound('explosion');
    const newLives = lives - 1;
    setLives(newLives);
    const newGrid = [...grid];
    newGrid[r][c] = { ...newGrid[r][c], isRevealed: true, exploded: true };
    setGrid(newGrid);
    
    // Penalización visual al valor de retiro (opcional, aqui solo bajamos vidas)
    if (newLives <= 0) handleGameEnd(false); // Perdiste todo
    else if (navigator.vibrate) navigator.vibrate(200);
  };

  const revealCell = (r, c, currentGrid = null) => {
    let workingGrid = currentGrid || [...grid];
    if (workingGrid[r][c].isRevealed || workingGrid[r][c].isFlagged) return workingGrid;
    
    workingGrid[r][c] = { ...workingGrid[r][c], isRevealed: true };
    
    // Expansión recursiva si es 0
    if (workingGrid[r][c].neighborCount === 0 && !workingGrid[r][c].isMine) {
      const neighbors = getNeighbors(r, c, config.rows, config.cols);
      neighbors.forEach(n => { workingGrid = revealCell(n.r, n.c, workingGrid); });
    }

    if (!currentGrid) { 
        setGrid(workingGrid); 
        // CALCULAR NUEVO VALOR DE RETIRO
        calculateCashoutValue(workingGrid);
        checkWin(workingGrid); 
    }
    return workingGrid;
  };

  // --- CÁLCULO DE GANANCIAS ---
  const calculateCashoutValue = (currentGrid) => {
      let revealedCount = 0;
      for (let r = 0; r < config.rows; r++) { for (let c = 0; c < config.cols; c++) { if (currentGrid[r][c].isRevealed && !currentGrid[r][c].isMine) revealedCount++; } }
      
      // Fórmula: Apuesta + (Apuesta * (Progreso * Multiplicador))
      // Si completas el 100%, ganas Bet * Multiplier
      const progress = revealedCount / safeCellsTotal; 
      const profit = bet * (config.multiplier - 1) * progress;
      const totalValue = Math.floor(bet + profit);
      
      setCurrentCashout(totalValue);
  };

  const handleManualCashout = () => {
      handleGameEnd(true, true); // true = win, true = isCashout
  };

  const checkWin = (currentGrid) => {
    let revealedCount = 0;
    for (let r = 0; r < config.rows; r++) { for (let c = 0; c < config.cols; c++) { if (currentGrid[r][c].isRevealed) revealedCount++; } }
    if (revealedCount === safeCellsTotal) handleGameEnd(true, false); // Victoria completa
  };

  const handleGameEnd = async (win, isCashout = false) => {
    setGameOver(true);
    setView(win ? 'game_over_won' : 'game_over_lost');
    
    if (win) playSound('win'); else playSound('lose');

    // Revelar todo
    const finalGrid = grid.map(row => row.map(cell => cell.isMine ? { ...cell, isRevealed: true } : cell));
    setGrid(finalGrid);
    
    // Online logic
    if (view.includes('online')) {
        const field = view === 'playing_online_host' ? 'hostStatus' : 'guestStatus';
        await updateDoc(doc(db, "matches_minesweeper", roomCode), { [field]: win ? 'won' : 'lost' });
    }

    // Single Player Logic (Pagos)
    if (view === 'playing_ai') {
        if (win) {
            // Si es cashout manual, pagamos lo acumulado. Si es victoria total, pagamos el Max.
            const finalPrize = isCashout ? currentCashout : Math.floor(bet * config.multiplier);
            addCoins(finalPrize, isCashout ? `Retirada Táctica (${config.name})` : `Victoria Total (${config.name})`);
            setScore(finalPrize); // Usamos el score para mostrar ganancia
            saveScore(finalPrize); // Guardar en ranking
        } else {
            // Perdiste todo
            setScore(0);
        }
    }
  };

  // --- ADS & EXTRAS ---
  const watchAd = (type) => { setAdState({ active: true, type, timer: 5 }); };
  useEffect(() => {
    let interval = null;
    if (adState.active && adState.timer > 0) interval = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active && adState.timer === 0) { clearInterval(interval); finishAd(); }
    return () => clearInterval(interval);
  }, [adState.active, adState.timer]);

  const finishAd = () => {
    setAdState(p => ({ ...p, active: false }));
    if (adState.type === 'life') {
      setLives(p => p + 1);
      if (view === 'game_over_lost') {
        // Revivir (Hack sucio pero funcional: ocultar minas explotadas)
        const resetGrid = grid.map(row => row.map(cell => cell.isMine ? { ...cell, isRevealed: false, exploded: false } : cell));
        setGrid(resetGrid);
        setGameOver(false);
        setView('playing_ai');
      }
    } else if (adState.type === 'hint') {
        // Logic hint...
    }
  };

  const saveScore = async (finalScore) => {
    if (user) { try { await addDoc(collection(db, "scores_minesweeper"), { uid: user.uid, displayName: user.name, score: finalScore, difficulty: config.name, date: serverTimestamp() }); fetchLeaderboard(); } catch (e) {} }
  };
  const fetchLeaderboard = async () => { try { const q = query(collection(db, "scores_minesweeper"), orderBy("score", "desc"), limit(5)); const s = await getDocs(q); setLeaderboard(s.docs.map(doc => doc.data())); } catch (e) {} };

  const renderCell = (cell, r, c) => {
    if (!cell.isRevealed) return cell.isFlagged ? <Flag className="w-5 h-5 text-red-500" /> : null;
    if (cell.isMine) return <Bomb className={`w-6 h-6 ${cell.exploded ? 'text-red-500 animate-pulse' : 'text-slate-800'}`} />;
    if (cell.neighborCount > 0) {
        const colors = ['text-blue-400', 'text-green-400', 'text-red-400', 'text-purple-400', 'text-yellow-400', 'text-cyan-400', 'text-pink-400', 'text-slate-400'];
        return <span className={`font-black text-lg ${colors[cell.neighborCount-1]}`}>{cell.neighborCount}</span>;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-4 font-mono text-white select-none">
      
      {/* --- PUBLICIDAD --- */}
      {adState.active && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-6">
           <Video className="w-16 h-16 text-cyan-400 mb-4 animate-bounce" />
           <h2 className="text-2xl font-black mb-2">PUBLICIDAD</h2>
           <div className="text-4xl font-black text-yellow-400 mb-6">{adState.timer}s</div>
        </div>
      )}

      {/* --- HEADER --- */}
      <div className="w-full max-w-md flex justify-between items-center mb-6 z-10">
        <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:bg-slate-800 transition">
             <ArrowLeft className="w-5 h-5 text-slate-400"/>
        </button>
        
        {view === 'playing_ai' && (
            <div className="flex gap-4 items-center bg-slate-900/90 px-4 py-2 rounded-full border border-slate-700 shadow-lg">
                <div className="flex items-center gap-1 mr-2 border-r border-slate-700 pr-4">
                    {[...Array(lives)].map((_, i) => <Heart key={i} className="w-4 h-4 text-red-500 fill-red-500" />)}
                </div>
                <div className="flex items-center gap-2 text-green-400 font-bold">
                    <TrendingUp className="w-4 h-4"/> {currentCashout} ₵
                </div>
            </div>
        )}
      </div>

      <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-pink-500 to-purple-500 mb-4 text-center tracking-tighter italic drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">
        CHAMI LA TÓXICA
      </h1>

      {/* --- VISTA: MENÚ --- */}
      {view === 'menu' && (
        <div className="w-full max-w-md grid gap-4 animate-in zoom-in">
           {/* SOLO PLAYER */}
           <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group">
              <Skull className="absolute top-2 right-2 w-20 h-20 text-pink-900/20 group-hover:text-pink-500/20 transition"/>
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Cpu className="w-5 h-5 text-pink-400"/> MODO APUESTAS</h2>
              <p className="text-xs text-slate-400 mb-4">Elige dificultad, apuesta tus monedas y retírate antes de explotar.</p>
              <div className="flex gap-2">
                 {Object.keys(DIFFICULTIES).map(key => (
                     <button key={key} onClick={() => selectDifficulty(key)} className={`flex-1 py-3 rounded-lg text-[9px] font-bold border transition uppercase ${key === 'hard' ? 'bg-red-900/30 border-red-500/50 text-red-400' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}>
                        {DIFFICULTIES[key].name} (x{DIFFICULTIES[key].multiplier})
                     </button>
                 ))}
              </div>
           </div>
           
           {/* MULTIPLAYER */}
           <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group">
              <Users className="absolute top-2 right-2 w-20 h-20 text-blue-900/20 group-hover:text-blue-500/20 transition"/>
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Users className="w-5 h-5 text-blue-400"/> DUELO ONLINE</h2>
              <p className="text-xs text-slate-400 mb-4">Sin apuestas. Solo honor.</p>
              <div className="flex gap-2">
                 <button onClick={() => createRoom('medium')} className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-xs hover:bg-blue-500 shadow-lg">CREAR</button>
                 <button onClick={() => joinRoom(document.getElementById('roomInput').value)} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-700">UNIRSE</button>
              </div>
              <input type="number" id="roomInput" placeholder="CÓDIGO DE SALA" className="w-full mt-2 bg-black border border-slate-700 rounded-xl px-4 py-2 text-center text-sm font-bold outline-none focus:border-blue-500"/>
           </div>
           
           {leaderboard.length > 0 && (
             <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex gap-1"><Trophy className="w-3 h-3"/> TOP GANADORES</h3>
                {leaderboard.map((s,i) => (
                    <div key={i} className="flex justify-between text-[10px] text-slate-400 border-b border-white/5 py-1"><span>#{i+1} {s.displayName}</span><span className="text-green-500 font-bold">+{s.score} ₵</span></div>
                ))}
             </div>
           )}
        </div>
      )}

      {/* --- VISTA: PANTALLA DE APUESTA (NUEVO) --- */}
      {view === 'betting' && (
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-6 rounded-3xl animate-in slide-in-from-right">
              <h2 className="text-xl font-black text-center mb-6 uppercase tracking-widest text-pink-500">REALIZA TU APUESTA</h2>
              
              <div className="bg-black/40 p-4 rounded-xl mb-6 text-center border border-slate-700">
                  <p className="text-xs text-slate-500 uppercase font-bold mb-2">Saldo Disponible</p>
                  <p className="text-3xl font-black text-white flex justify-center gap-2 items-center"><Wallet className="w-6 h-6 text-slate-400"/> {coins}</p>
              </div>

              <div className="mb-8">
                  <div className="flex justify-between text-xs font-bold text-slate-400 mb-2">
                      <span>Cantidad a Apostar</span>
                      <span className="text-yellow-500">Max Win: {Math.floor(bet * config.multiplier)} ₵</span>
                  </div>
                  <input 
                      type="number" 
                      value={bet} 
                      onChange={(e) => setBet(Number(e.target.value))}
                      className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl py-4 text-center text-2xl font-black text-white focus:border-pink-500 outline-none mb-4"
                  />
                  <div className="flex gap-2">
                      <button onClick={() => setBet(100)} className="flex-1 py-2 bg-slate-800 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-700">100</button>
                      <button onClick={() => setBet(500)} className="flex-1 py-2 bg-slate-800 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-700">500</button>
                      <button onClick={() => setBet(Math.floor(coins))} className="flex-1 py-2 bg-slate-800 rounded-lg text-xs font-bold text-yellow-500 hover:bg-slate-700">ALL IN</button>
                  </div>
              </div>

              <button onClick={confirmStartGame} className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-black text-lg uppercase tracking-widest shadow-lg hover:scale-[1.02] transition-transform flex items-center justify-center gap-2">
                  <Play className="w-5 h-5 fill-current"/> JUGAR AHORA
              </button>
          </div>
      )}

      {/* --- VISTA: JUGANDO --- */}
      {view.includes('playing') && (
        <div className="w-full max-w-md flex flex-col items-center animate-in zoom-in">
           {/* BOTÓN CASHOUT MANUAL (NUEVO) */}
           {view === 'playing_ai' && !gameOver && (
               <button 
                  onClick={handleManualCashout}
                  className="w-full mb-4 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-black text-white uppercase tracking-widest shadow-[0_0_20px_rgba(34,197,94,0.4)] flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
               >
                   <Hand className="w-5 h-5"/> ME PLANTO: +{currentCashout} ₵
               </button>
           )}

           <div className="flex gap-2 w-full mb-4">
               <button onClick={() => setFlagMode(!flagMode)} className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition border ${flagMode ? 'bg-red-500 text-white border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                   <Flag className="w-4 h-4"/> {flagMode ? 'BANDERA' : 'REVELAR'}
               </button>
           </div>

           <div className="bg-slate-900 p-2 rounded-xl border border-slate-700 shadow-2xl inline-block">
               <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${config.cols}, 1fr)` }}>
                   {grid.map((row, r) => row.map((cell, c) => (
                       <button
                           key={`${r}-${c}`}
                           onClick={() => handleCellClick(r, c)}
                           onContextMenu={(e) => { e.preventDefault(); toggleFlag(r, c); }}
                           className={`w-8 h-8 sm:w-10 sm:h-10 rounded-md flex items-center justify-center text-sm font-bold transition-all active:scale-95
                               ${!cell.isRevealed ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700' : 'bg-slate-950 border border-slate-900'}
                               ${cell.isRevealed && cell.isMine ? 'bg-red-900/50' : ''}
                           `}
                       >
                           {renderCell(cell, r, c)}
                       </button>
                   )))}
               </div>
           </div>
        </div>
      )}

      {/* --- VISTA: GAME OVER --- */}
      {(view === 'game_over_won' || view === 'game_over_lost') && (
             <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl flex flex-col items-center w-full max-w-sm text-center">
                   {view === 'game_over_won' ? <Trophy className="w-20 h-20 text-yellow-400 mb-4 animate-bounce"/> : <Bomb className="w-20 h-20 text-red-500 mb-4 animate-pulse"/>}
                   <h2 className="text-3xl font-black text-white mb-2">{view === 'game_over_won' ? '¡DINERO ASEGURADO!' : '¡LO PERDISTE TODO!'}</h2>
                   
                   {view === 'game_over_won' && view === 'playing_ai' && (
                       <div className="mb-6 bg-green-900/20 p-4 rounded-xl border border-green-500/30 w-full">
                           <p className="text-green-400 text-sm font-bold uppercase mb-1">Ganancia Total</p>
                           <p className="text-4xl font-black text-white flex justify-center gap-2 items-center">
                               +{score} <Coins className="w-6 h-6 text-yellow-500"/>
                           </p>
                       </div>
                   )}
                   
                   {view === 'game_over_lost' && (
                        <p className="text-slate-400 mb-6">Perdiste tu apuesta de {bet} monedas.</p>
                   )}

                   <div className="flex flex-col gap-2 w-full">
                        {view === 'game_over_lost' && view === 'playing_ai' && lives <= 0 && (
                            <button onClick={() => watchAd('life')} className="w-full py-3 bg-pink-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-pink-500 animate-pulse">
                                <Play className="w-4 h-4 fill-current"/> REVIVIR (VIDEO)
                            </button>
                        )}
                      <button onClick={() => setView('menu')} className="w-full py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4"/> VOLVER AL MENÚ
                      </button>
                   </div>
                </div>
             </div>
      )}

      <div className="mt-auto w-full max-w-md pt-4 opacity-75"><AdSpace type="banner" /><GameChat gameId="global_chami" gameName="CHAMI LA TÓXICA" /></div>
    </div>
  );
}