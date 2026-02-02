// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Trophy, Grid3X3, Timer, Eraser, Check, Globe, Share2, Users, Cpu, Loader2, Zap, AlertCircle, Copy, Play } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, onSnapshot, doc, setDoc, updateDoc, where } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- UTILIDADES DE GENERACIÓN SUDOKU ---
const BLANK = 0;
const isValid = (board, row, col, num) => {
  for (let x = 0; x < 9; x++) if (board[row][x] === num || board[x][col] === num) return false;
  const startRow = row - (row % 3), startCol = col - (col % 3);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (board[i + startRow][j + startCol] === num) return false;
  return true;
};

const solveSudoku = (board) => {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === BLANK) {
        for (let num = 1; num <= 9; num++) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num;
            if (solveSudoku(board)) return true;
            board[row][col] = BLANK;
          }
        }
        return false;
      }
    }
  }
  return true;
};

const generateBoard = (difficulty) => {
  const board = Array(9).fill().map(() => Array(9).fill(BLANK));
  for (let i = 0; i < 9; i = i + 3) fillBox(board, i, i);
  solveSudoku(board);
  const solution = board.map(row => [...row]);
  
  const attempts = difficulty === 'easy' ? 30 : difficulty === 'medium' ? 45 : 55;
  let count = attempts;
  while (count > 0) {
    let r = Math.floor(Math.random() * 9);
    let c = Math.floor(Math.random() * 9);
    if (board[r][c] !== BLANK) {
      board[r][c] = BLANK;
      count--;
    }
  }
  // Aplanamos arrays para guardar fácil en Firebase si es necesario
  return { initial: board, solution };
};

const fillBox = (board, row, col) => {
  let num;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      do { num = Math.floor(Math.random() * 9) + 1; } 
      while (!isSafeInBox(board, row, col, num));
      board[row + i][col + j] = num;
    }
  }
};

const isSafeInBox = (board, rowStart, colStart, num) => {
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (board[rowStart + i][colStart + j] === num) return false;
  return true;
};

const generateGameId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export default function SudokuBattle() {
  // Estados Generales
  const [mode, setMode] = useState('menu'); // menu, lobby, playing_solo, playing_online
  const [user, setUser] = useState(null);
  
  // Juego
  const [board, setBoard] = useState([]);
  const [initialBoard, setInitialBoard] = useState([]);
  const [solution, setSolution] = useState([]);
  const [difficulty, setDifficulty] = useState('medium');
  const [selected, setSelected] = useState(null);
  const [mistakes, setMistakes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [gameState, setGameState] = useState('idle'); // idle, playing, won, lost
  const [saveStatus, setSaveStatus] = useState('idle');
  const [leaderboard, setLeaderboard] = useState([]);

  // Online / Matchmaking
  const [gameId, setGameId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [onlineData, setOnlineData] = useState(null);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // 1. Auth
  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // 2. Cronómetro
  useEffect(() => {
    let interval = null;
    if (gameState === 'playing') interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [gameState]);

  // 3. Listener Online (Sincronización)
  useEffect(() => {
    if (mode !== 'playing_online' && mode !== 'lobby') return;
    if (!gameId) return;

    const unsubscribe = onSnapshot(doc(db, "matches_sudoku", gameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOnlineData(data);
        handleOnlineUpdate(data);
      }
    });
    return () => unsubscribe();
  }, [gameId, mode]);

  // --- LÓGICA ONLINE ---
  const handleOnlineUpdate = (data) => {
    // Si entramos y el juego ya tiene tablero generado (por el host), cargarlo
    if (data.status === 'playing' && gameState === 'idle' && data.boardInitial) {
       // Cargar tablero desde la nube (parsear JSON si es necesario o directo)
       const initial = JSON.parse(data.boardInitial);
       const sol = JSON.parse(data.boardSolution);
       
       setBoard(initial.map(row => [...row]));
       setInitialBoard(initial.map(row => [...row]));
       setSolution(sol);
       setDifficulty(data.difficulty);
       setSeconds(0);
       setMistakes(0);
       setGameState('playing');
       setMode('playing_online');
    }

    // Detectar si alguien ganó
    if (data.winner) {
      setGameState(data.winner === user?.uid ? 'won' : 'lost');
    }
  };

  const findPublicMatch = async () => {
    if (!user) return setError("Inicia sesión.");
    setError('');
    setIsSearching(true);
    setStatusText('BUSCANDO RIVAL...');

    try {
      const q = query(
        collection(db, "matches_sudoku"), 
        where("status", "==", "waiting"),
        where("public", "==", true),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // UNIRSE
        const matchDoc = snapshot.docs[0];
        if (matchDoc.data().host.uid === user.uid) {
           setGameId(matchDoc.id); setMode('lobby'); setIsSearching(false); return;
        }
        await updateDoc(doc(db, "matches_sudoku", matchDoc.id), {
          guest: user,
          status: 'ready_to_start', // Señal para que el host genere el tablero
          public: false
        });
        setGameId(matchDoc.id);
        setMode('lobby'); // Esperamos a que el host inicie
      } else {
        // CREAR
        const newId = generateGameId();
        await setDoc(doc(db, "matches_sudoku", newId), {
          host: user,
          guest: null,
          status: 'waiting',
          public: true,
          createdAt: serverTimestamp()
        });
        setGameId(newId);
        setMode('lobby');
      }
    } catch (e) { setError("Error al buscar."); }
    setIsSearching(false);
  };

  const startOnlineMatch = async () => {
    // Solo el host genera el tablero y lo sube
    if (!onlineData || onlineData.host.uid !== user.uid) return;
    
    const { initial, solution } = generateBoard('medium'); // Dificultad estándar para duelo
    
    await updateDoc(doc(db, "matches_sudoku", gameId), {
      boardInitial: JSON.stringify(initial),
      boardSolution: JSON.stringify(solution),
      difficulty: 'medium',
      status: 'playing',
      startTime: serverTimestamp()
    });
  };

  // Efecto: Si soy Host y veo que entra un Guest (status 'ready_to_start'), inicio la partida auto
  useEffect(() => {
    if (onlineData && onlineData.status === 'ready_to_start' && onlineData.host.uid === user?.uid) {
      startOnlineMatch();
    }
  }, [onlineData]);


  // --- LÓGICA JUEGO (COMÚN) ---
  const startGameSolo = (diff) => {
    const { initial, solution } = generateBoard(diff);
    setBoard(initial.map(row => [...row]));
    setInitialBoard(initial.map(row => [...row]));
    setSolution(solution);
    setDifficulty(diff);
    setMistakes(0);
    setSeconds(0);
    setGameState('playing');
    setMode('playing_solo');
  };

  const handleInput = (num) => {
    if (!selected || gameState !== 'playing') return;
    const [r, c] = selected;
    if (initialBoard[r][c] !== BLANK) return;

    if (num === solution[r][c]) {
      const newBoard = [...board];
      newBoard[r][c] = num;
      setBoard(newBoard);
      checkWin(newBoard);
    } else {
      setMistakes(m => m + 1);
    }
  };

  const checkWin = (currentBoard) => {
    let isFull = true;
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if (currentBoard[i][j] === BLANK) isFull = false;
      }
    }
    if (isFull) handleWin();
  };

  const handleWin = async () => {
    if (mode === 'playing_online') {
       // Declararse ganador en la nube
       await updateDoc(doc(db, "matches_sudoku", gameId), { winner: user.uid });
       setGameState('won');
    } else {
       // Solo Mode
       setGameState('won');
       saveScore();
    }
  };

  const saveScore = async () => {
    setSaveStatus('saving');
    try {
      if (user) {
        await addDoc(collection(db, "scores_sudoku"), {
          uid: user.uid,
          displayName: user.name,
          time: seconds,
          difficulty: difficulty,
          date: serverTimestamp()
        });
        setSaveStatus('saved');
        fetchLeaderboard();
      }
    } catch (e) { setSaveStatus('error'); }
  };

  const fetchLeaderboard = async () => {
    try {
      const q = query(collection(db, "scores_sudoku"), orderBy("time", "asc"), limit(5));
      const s = await getDocs(q);
      setLeaderboard(s.docs.map(doc => doc.data()));
    } catch (e) {}
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // --- RENDERIZADO ---

  // 1. MENÚ PRINCIPAL
  if (mode === 'menu') {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 font-mono text-white">
        <Link href="/" className="absolute top-6 left-6 p-3 bg-slate-800 rounded-full hover:bg-slate-700 transition"><ArrowLeft className="w-6 h-6" /></Link>
        <h1 className="text-5xl font-black text-white mb-2 tracking-tighter drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]">SUDOKU</h1>
        <p className="text-slate-500 text-xs tracking-[0.3em] uppercase mb-12">BRAIN TRAINING</p>

        <div className="grid gap-4 w-full max-w-sm mb-8">
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
             <h3 className="text-center font-bold text-indigo-400 mb-4 flex items-center justify-center gap-2"><Cpu /> VS IA (SOLO)</h3>
             <div className="flex gap-2">
                <button onClick={() => startGameSolo('easy')} className="flex-1 py-3 bg-slate-800 hover:bg-green-900/30 text-green-400 rounded-lg text-xs font-bold border border-slate-700">FÁCIL</button>
                <button onClick={() => startGameSolo('medium')} className="flex-1 py-3 bg-slate-800 hover:bg-yellow-900/30 text-yellow-400 rounded-lg text-xs font-bold border border-slate-700">MEDIO</button>
                <button onClick={() => startGameSolo('hard')} className="flex-1 py-3 bg-slate-800 hover:bg-red-900/30 text-red-400 rounded-lg text-xs font-bold border border-slate-700">DIFÍCIL</button>
             </div>
          </div>

          <button onClick={() => setMode('lobby')} className="group relative p-6 bg-gradient-to-r from-indigo-900 to-purple-900 border border-indigo-500 rounded-2xl hover:scale-[1.02] transition-all overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.3)]">
            <div className="relative flex items-center justify-between">
              <span className="font-bold text-xl flex items-center gap-3 text-white"><Users /> VS RIVAL</span>
              <span className="text-xs bg-white text-black px-2 py-1 rounded font-bold">ONLINE</span>
            </div>
            <p className="text-xs text-indigo-200 mt-2 opacity-80">Compite en tiempo real. El mismo tablero.</p>
          </button>
        </div>

        {leaderboard.length > 0 && (
          <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 w-full max-w-sm">
             <h3 className="text-xs text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Globe className="w-4 h-4" /> TOP TIEMPOS (SOLO)</h3>
             {leaderboard.map((s, i) => (
               <div key={i} className="flex justify-between text-sm border-b border-slate-800 py-2">
                 <span className="text-white">{s.displayName.substring(0,12)}</span>
                 <span className="text-blue-400 font-mono">{formatTime(s.time)}</span>
               </div>
             ))}
          </div>
        )}
        <GameChat gameId="global_sudoku" gameName="SUDOKU" />
      </div>
    );
  }

  // 2. LOBBY ONLINE
  if (mode === 'lobby') {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 font-mono text-white">
        <button onClick={() => { setMode('menu'); setGameId(''); }} className="absolute top-6 left-6 p-3 bg-slate-800 rounded-full"><ArrowLeft className="w-6 h-6" /></button>
        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 w-full max-w-md text-center">
          <h2 className="text-2xl font-bold mb-8 text-indigo-400">LOBBY ONLINE</h2>
          
          {!gameId ? (
             <>
               <button onClick={findPublicMatch} disabled={isSearching} className="w-full py-6 bg-indigo-600 rounded-xl font-bold text-lg mb-4 flex justify-center gap-2 items-center hover:bg-indigo-500 transition">
                 {isSearching ? <Loader2 className="animate-spin" /> : <Globe />}
                 {isSearching ? 'BUSCANDO...' : 'BUSCAR RIVAL'}
               </button>
               <div className="relative my-6"><div className="border-t border-slate-700"></div><span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 px-2 text-xs text-slate-500">O PRIVADO</span></div>
               <div className="flex gap-2">
                 <button onClick={async () => { const id = generateGameId(); await setDoc(doc(db,"matches_sudoku",id),{host:user,status:'waiting',public:false}); setGameId(id); }} className="flex-1 py-3 bg-slate-800 rounded-lg text-xs font-bold">CREAR</button>
                 <input placeholder="CÓDIGO" className="w-24 bg-slate-950 border border-slate-700 rounded-lg text-center font-bold uppercase" onChange={(e)=>setJoinId(e.target.value.toUpperCase())} />
                 <button onClick={async () => { if(!joinId)return; await updateDoc(doc(db,"matches_sudoku",joinId),{guest:user,status:'ready_to_start'}); setGameId(joinId); }} className="flex-1 py-3 bg-slate-800 rounded-lg text-xs font-bold">UNIRSE</button>
               </div>
             </>
          ) : (
             <div className="animate-in zoom-in">
               <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
               <h3 className="text-xl font-bold text-white mb-2">ESPERANDO OPONENTE...</h3>
               {onlineData?.public ? <p className="text-slate-500 text-sm">Buscando jugador aleatorio...</p> : (
                 <div onClick={() => {navigator.clipboard.writeText(gameId); alert("Copiado!")}} className="bg-slate-950 p-4 rounded-xl border border-indigo-500/30 cursor-pointer mt-4">
                   <p className="text-4xl font-black text-indigo-400 tracking-widest">{gameId}</p>
                   <p className="text-[10px] text-slate-500 mt-2 uppercase flex justify-center gap-2"><Copy className="w-3 h-3"/> Copiar Código</p>
                 </div>
               )}
             </div>
          )}
        </div>
      </div>
    );
  }

  // 3. PANTALLA DE JUEGO (SOLO Y ONLINE)
  if (gameState === 'won' || gameState === 'lost') {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 font-mono text-white">
        {gameState === 'won' ? <Trophy className="w-24 h-24 text-yellow-400 mb-6 animate-bounce" /> : <AlertCircle className="w-24 h-24 text-red-500 mb-6" />}
        <h2 className={`text-4xl font-black mb-2 ${gameState==='won'?'text-white':'text-red-500'}`}>{gameState === 'won' ? '¡VICTORIA!' : '¡DERROTA!'}</h2>
        <p className="text-slate-400 mb-8 tracking-widest uppercase">
           {mode === 'playing_online' ? (gameState === 'won' ? 'HAS GANADO EL DUELO' : 'TU RIVAL FUE MÁS RÁPIDO') : `TIEMPO FINAL: ${formatTime(seconds)}`}
        </p>
        <div className="flex gap-4">
           <button onClick={() => {setMode('menu'); setGameState('idle'); setBoard([]); setGameId('');}} className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:scale-105 transition">VOLVER AL MENÚ</button>
        </div>
        <div className="mt-8"><AdSpace type="banner" /></div>
        <GameChat gameId={mode === 'playing_online' ? gameId : "global_sudoku"} gameName="SUDOKU" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-2 font-mono text-white select-none">
       {/* HEADER */}
       <div className="w-full max-w-md flex justify-between items-center mb-6 mt-4">
         <button onClick={() => { if(confirm("¿Salir de la partida?")) { setMode('menu'); setGameState('idle'); setGameId(''); } }} className="p-2 bg-slate-800 rounded-full"><ArrowLeft className="w-5 h-5"/></button>
         
         {mode === 'playing_online' ? (
            <div className="bg-indigo-900/50 px-4 py-1 rounded-full border border-indigo-500/50 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-bold text-indigo-300">DUELO EN VIVO</span>
            </div>
         ) : (
            <div className="flex flex-col items-center"><span className="text-[10px] text-slate-500">ERRORES</span><span className={`font-bold ${mistakes > 2 ? 'text-red-500' : 'text-white'}`}>{mistakes}/3</span></div>
         )}
         
         <div className="flex flex-col items-center"><span className="text-[10px] text-slate-500">TIEMPO</span><span className="font-bold text-blue-400 text-xl">{formatTime(seconds)}</span></div>
       </div>

       {/* TABLERO */}
       <div className="bg-slate-900 p-1 rounded-lg border border-slate-700 shadow-2xl mb-6 relative">
         {/* Overlay si esperamos al rival (solo visual, la logica ya maneja start) */}
         {mode === 'playing_online' && !board.length && <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10 text-white font-bold">Sincronizando...</div>}
         
         <div className="grid grid-cols-9 gap-[1px] bg-slate-700 border-2 border-slate-700">
           {board.map((row, r) => row.map((cell, c) => {
             const isInitial = initialBoard[r][c] !== BLANK;
             const isSelected = selected && selected[0] === r && selected[1] === c;
             const isRelated = selected && (selected[0] === r || selected[1] === c);
             const isSameNum = selected && cell !== BLANK && board[selected[0]][selected[1]] === cell;
             
             let borderClass = "";
             if ((c + 1) % 3 === 0 && c !== 8) borderClass += " border-r-2 border-r-slate-500";
             if ((r + 1) % 3 === 0 && r !== 8) borderClass += " border-b-2 border-b-slate-500";

             return (
               <div 
                 key={`${r}-${c}`}
                 onClick={() => setSelected([r, c])}
                 className={`
                   w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-lg sm:text-xl font-bold cursor-pointer transition-colors
                   ${borderClass}
                   ${isSelected ? 'bg-indigo-600 text-white' : 
                     isSameNum ? 'bg-indigo-900 text-indigo-200' :
                     isRelated ? 'bg-slate-800' : 'bg-slate-900'}
                   ${isInitial ? 'text-slate-500' : 'text-cyan-400'}
                 `}
               >
                 {cell !== BLANK ? cell : ''}
               </div>
             );
           }))}
         </div>
       </div>

       {/* TECLADO */}
       <div className="grid grid-cols-5 gap-2 w-full max-w-md px-4">
         {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
           <button 
             key={num} 
             onClick={() => handleInput(num)}
             className="h-12 bg-slate-800 rounded-lg font-bold text-xl hover:bg-indigo-600 transition active:scale-95 border border-slate-700 text-indigo-200"
           >
             {num}
           </button>
         ))}
         <button className="h-12 bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 hover:text-white border border-slate-700 col-span-1" onClick={() => {}}><Eraser className="w-5 h-5"/></button>
       </div>
       
       <div className="mt-8 opacity-50"><AdSpace type="banner" /></div>

       {/* CHAT INTELIGENTE: Si es duelo, chat privado. Si es solo, chat global. */}
       <GameChat gameId={mode === 'playing_online' ? gameId : "global_sudoku"} gameName={mode === 'playing_online' ? "DUELO" : "GLOBAL"} />
    </div>
  );
}