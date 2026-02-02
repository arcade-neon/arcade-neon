// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Trophy, Search, Cpu, Zap, Layers, Timer, Share2, Medal, Cloud, Check, Globe } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
// IMPORTAMOS EL ANUNCIO
import AdSpace from '@/components/AdSpace';

// --- CONFIGURACIÓN ---
const LEVEL_CONFIG = {
  easy: { grid: 8, words: 5, name: 'FÁCIL' },
  medium: { grid: 10, words: 8, name: 'MEDIO' },
  hard: { grid: 12, words: 12, name: 'DIFÍCIL' }
};

const AI_THEMES_DB = {
  "default": ["REACT", "NEXTJS", "TYPESCRIPT", "TAILWIND", "VERCEL", "NODE", "DATABASE", "CLOUD", "CYBER", "CODE", "ALGORITMO", "API"],
  "futbol": ["GOL", "PORTERO", "PENALTI", "ARBITRO", "BALON", "ESTADIO", "FALTA", "LIGA", "MUNDIAL", "MESSI", "CR7", "CORNER"],
  "deportes": ["TENIS", "BALONCESTO", "NATACION", "ATLETISMO", "GOLF", "BOXEO", "RUGBY", "JUDO", "SURF", "SKATE"],
  "cine": ["OSCAR", "ACTOR", "DRAMA", "ACCION", "COMEDIA", "TERROR", "GUION", "DIRECTOR", "NETFLIX", "CINE", "PALOMITAS"],
  "marvel": ["THOR", "HULK", "IRONMAN", "SPIDERMAN", "THANOS", "LOKI", "GROOT", "VISION", "WANDA", "HAWKEYE"],
  "videojuegos": ["MARIO", "ZELDA", "SONIC", "FORTNITE", "MINECRAFT", "LOL", "STEAM", "XBOX", "PLAYSTATION", "NINTENDO"],
  "animales": ["LEON", "TIGRE", "ELEFANTE", "JIRAFA", "DELFIN", "AGUILA", "LOBO", "OSO", "PANDA", "ZORRO", "TIBURON"],
  "espacio": ["PLANETA", "ESTRELLA", "GALAXIA", "MARTE", "LUNA", "SOL", "COMETA", "ASTEROIDE", "NEBULA", "AGUJERO"],
  "comida": ["PIZZA", "SUSHI", "PASTA", "ENSALADA", "FRUTA", "CHOCOLATE", "HELADO", "TACOS", "PAN", "QUESO", "BURRITO"],
  "paises": ["ESPAÑA", "MEXICO", "ARGENTINA", "COLOMBIA", "PERU", "CHILE", "FRANCIA", "ITALIA", "JAPON", "CHINA", "BRASIL"],
  "colores": ["ROJO", "AZUL", "VERDE", "AMARILLO", "NEGRO", "BLANCO", "MORADO", "NARANJA", "ROSA", "GRIS", "CYAN"]
};

export default function SopaLetrasPro() {
  // Estado Juego
  const [gameState, setGameState] = useState('menu'); 
  const [difficulty, setDifficulty] = useState('medium');
  const [customThemeInput, setCustomThemeInput] = useState('');
  const [currentThemeName, setCurrentThemeName] = useState('TECH');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [leaderboard, setLeaderboard] = useState([]);
  
  // Crono y Logros
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [achievements, setAchievements] = useState([]);

  // Tablero
  const [grid, setGrid] = useState([]);
  const [gridSize, setGridSize] = useState(10);
  const [words, setWords] = useState([]);
  const [found, setFound] = useState([]);
  const [wordPositions, setWordPositions] = useState({});
  const [selection, setSelection] = useState({ start: null, end: null, current: null });
  const gridRef = useRef(null);

  // --- CARGAR RANKING ---
  useEffect(() => {
    if (gameState === 'menu' || gameState === 'won') {
      fetchLeaderboard();
    }
  }, [gameState]);

  const fetchLeaderboard = async () => {
    try {
      const q = query(collection(db, "scores_wordsearch"), orderBy("time", "asc"), limit(5));
      const querySnapshot = await getDocs(q);
      const scores = querySnapshot.docs.map(doc => doc.data());
      setLeaderboard(scores);
    } catch (error) {
      console.error("Error cargando ranking:", error);
    }
  };

  // --- CRONÓMETRO ---
  useEffect(() => {
    let interval = null;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else if (!isActive && seconds !== 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, seconds]);

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- LOGICA DE JUEGO (IA Y GRID) ---
  const startAIGeneration = () => {
    setGameState('loading');
    setSeconds(0);
    setAchievements([]);
    setSaveStatus('idle');
    
    setTimeout(() => {
      const config = LEVEL_CONFIG[difficulty];
      setGridSize(config.grid);
      
      let themeKey = "default";
      let themeName = "SISTEMA";
      const input = customThemeInput.trim().toLowerCase();
      
      if (input) {
        const foundKey = Object.keys(AI_THEMES_DB).find(key => input.includes(key) || key.includes(input));
        if (foundKey) {
          themeKey = foundKey;
          themeName = foundKey.toUpperCase();
        } else {
          if (input.includes('juego') || input.includes('game')) { themeKey = 'videojuegos'; themeName = 'GAMING'; }
          else if (input.includes('peli') || input.includes('film')) { themeKey = 'cine'; themeName = 'CINE'; }
          else if (input.includes('com') || input.includes('food')) { themeKey = 'comida'; themeName = 'GASTRONOMÍA'; }
          else { themeName = input.toUpperCase() + " (?)"; }
        }
      }
      
      setCurrentThemeName(themeName);
      const pool = AI_THEMES_DB[themeKey] || AI_THEMES_DB["default"];
      const shuffled = [...pool].sort(() => 0.5 - Math.random());
      const selectedWords = shuffled.slice(0, config.words);
      
      initGrid(selectedWords, config.grid);
      setGameState('playing');
      setIsActive(true);
    }, 1500);
  };

  const initGrid = (gameWords, size) => {
    const newGrid = Array(size).fill(null).map(() => Array(size).fill(''));
    const placedWords = [];
    const positions = {};

    for (const word of gameWords) {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 200) {
        const dir = Math.floor(Math.random() * 4);
        const r = Math.floor(Math.random() * size);
        const c = Math.floor(Math.random() * size);
        if (canPlace(newGrid, word, r, c, dir, size)) {
          const endPos = place(newGrid, word, r, c, dir);
          positions[word] = { start: { r, c }, end: endPos };
          placedWords.push(word);
          placed = true;
        }
        attempts++;
      }
    }

    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (newGrid[i][j] === '') {
          newGrid[i][j] = letters.charAt(Math.floor(Math.random() * letters.length));
        }
      }
    }
    setGrid(newGrid);
    setWords(placedWords);
    setWordPositions(positions);
    setFound([]);
    setSelection({ start: null, end: null, current: null });
  };

  const getStep = (dir) => {
    switch(dir) {
      case 0: return { dr: 0, dc: 1 };
      case 1: return { dr: 1, dc: 0 };
      case 2: return { dr: 1, dc: 1 };
      case 3: return { dr: -1, dc: 1 };
      default: return { dr: 0, dc: 1 };
    }
  }

  const canPlace = (g, word, r, c, dir, size) => {
    const { dr, dc } = getStep(dir);
    if (r + dr * (word.length - 1) < 0 || r + dr * (word.length - 1) >= size) return false;
    if (c + dc * (word.length - 1) < 0 || c + dc * (word.length - 1) >= size) return false;
    for (let i = 0; i < word.length; i++) {
      const cr = r + dr * i;
      const cc = c + dc * i;
      if (g[cr][cc] !== '' && g[cr][cc] !== word[i]) return false;
    }
    return true;
  };

  const place = (g, word, r, c, dir) => {
    const { dr, dc } = getStep(dir);
    let lastR = r, lastC = c;
    for (let i = 0; i < word.length; i++) {
      g[r + dr * i][c + dc * i] = word[i];
      lastR = r + dr * i;
      lastC = c + dc * i;
    }
    return { r: lastR, c: lastC };
  };

  useEffect(() => {
    const handleMouseUp = () => {
      if (selection.start && selection.current) checkSelection(selection.start, selection.current);
      setSelection({ start: null, end: null, current: null });
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [selection, words, found]);

  const handleMouseDown = (r, c) => {
    if (gameState !== 'playing') return;
    setSelection({ start: { r, c }, current: { r, c }, end: null });
  };
  const handleMouseEnter = (r, c) => {
    if (selection.start) setSelection({ ...selection, current: { r, c } });
  };

  const checkSelection = (start, end) => {
    let selectedWord = "";
    const dr = end.r - start.r;
    const dc = end.c - start.c;
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    if (steps === 0) return;
    const stepR = dr === 0 ? 0 : dr / Math.abs(dr);
    const stepC = dc === 0 ? 0 : dc / Math.abs(dc);
    if (Math.abs(dr) !== Math.abs(dc) && dr !== 0 && dc !== 0) return;
    for (let i = 0; i <= steps; i++) {
      selectedWord += grid[start.r + stepR * i][start.c + stepC * i];
    }
    const reversed = selectedWord.split('').reverse().join('');
    let match = null;
    if (words.includes(selectedWord) && !found.includes(selectedWord)) match = selectedWord;
    else if (words.includes(reversed) && !found.includes(reversed)) match = reversed;
    if (match) {
      const newFound = [...found, match];
      setFound(newFound);
      if (newFound.length === words.length) winGame();
    }
  };

  // --- VICTORIA Y GUARDADO ---
  const winGame = async () => {
    setIsActive(false);
    setGameState('won');
    
    const earned = [];
    if (difficulty === 'hard') earned.push("HACKER SUPREMO 🏆");
    if (seconds < 30) earned.push("VELOCIDAD LUZ ⚡");
    if (seconds < 60 && difficulty !== 'easy') earned.push("MENTE ÁGIL 🧠");
    if (currentThemeName !== 'SISTEMA') earned.push("EXPLORADOR 🧭");
    if (earned.length === 0) earned.push("MISIÓN CUMPLIDA ✅");
    setAchievements(earned);

    setSaveStatus('saving');
    try {
      const user = auth.currentUser;
      if (user) {
        await addDoc(collection(db, "scores_wordsearch"), {
          uid: user.uid,
          displayName: user.displayName || 'Anónimo',
          photoURL: user.photoURL || null,
          time: seconds,
          difficulty: difficulty,
          theme: currentThemeName,
          date: serverTimestamp(),
          achievements: earned
        });
        setSaveStatus('saved');
        fetchLeaderboard(); // Actualizar ranking al guardar
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      console.error("Error al guardar:", error);
      setSaveStatus('error');
    }
  };

  const shareResult = () => {
    const text = `🕵️ SOPA NEURAL COMPLETA\n\n📊 Dificultad: ${LEVEL_CONFIG[difficulty].name}\n⏱️ Tiempo: ${formatTime(seconds)}\n📝 Tema: ${currentThemeName}\n\n¿Puedes superarme?`;
    navigator.clipboard.writeText(text);
    alert("¡Resultado copiado! Pégalo en WhatsApp.");
  };

  const getCellClass = (r, c) => {
    for (const word of found) {
      const pos = wordPositions[word];
      if (!pos) continue;
      if (isCellBetween(r, c, pos.start, pos.end)) return 'bg-green-500/80 text-black shadow-[0_0_10px_#22c55e] z-10 font-black transition-all duration-500 scale-105';
    }
    if (selection.start && selection.current && isCellBetween(r, c, selection.start, selection.current, true)) return 'bg-cyan-500/50 text-white scale-105 transition-none rounded-full';
    return 'bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-white transition-all duration-200';
  };

  const isCellBetween = (r, c, start, end, strictDiag = false) => {
    const dr = end.r - start.r;
    const dc = end.c - start.c;
    if (strictDiag && Math.abs(dr) !== Math.abs(dc) && dr !== 0 && dc !== 0) return false;
    const crossProduct = (c - start.c) * (end.r - start.r) - (r - start.r) * (end.c - start.c);
    if (crossProduct !== 0) return false;
    const dotProduct = (c - start.c) * (end.c - start.c) + (r - start.r) * (end.r - start.r);
    if (dotProduct < 0) return false;
    const squaredLength = (end.c - start.c)*(end.c - start.c) + (end.r - start.r)*(end.r - start.r);
    if (dotProduct > squaredLength) return false;
    return true;
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center font-mono text-white p-4 select-none overflow-hidden">
      
      {/* Header */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-20">
        <Link href="/" className="p-3 bg-slate-800 rounded-full hover:bg-slate-700 transition border border-slate-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        {gameState === 'playing' && (
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
               <span className="text-[10px] text-slate-500 tracking-widest uppercase">TIEMPO</span>
               <span className="text-xl font-bold font-mono text-cyan-400 flex items-center gap-2">
                 <Timer className="w-4 h-4" /> {formatTime(seconds)}
               </span>
            </div>
            <button onClick={() => setGameState('menu')} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-slate-400 transition">
              <Layers className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] mb-2 mt-16 text-center">
        SOPA NEURAL
      </h1>

      {/* MENÚ */}
      {gameState === 'menu' && (
        <div className="flex flex-col gap-6 w-full max-w-md animate-in zoom-in">
          <div className="bg-slate-900/80 p-8 rounded-2xl border border-slate-700 shadow-2xl backdrop-blur-md">
            <div className="mb-8">
              <h2 className="text-sm text-slate-400 tracking-[0.2em] mb-4 flex items-center gap-2"><Layers className="w-4 h-4" /> DIFICULTAD</h2>
              <div className="flex gap-2">
                {Object.keys(LEVEL_CONFIG).map(level => (
                  <button key={level} onClick={() => setDifficulty(level)} className={`flex-1 py-2 rounded-lg font-bold text-xs tracking-wider transition-all ${difficulty === level ? 'bg-cyan-500 text-black shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>{LEVEL_CONFIG[level].name}</button>
                ))}
              </div>
            </div>
            <div className="mb-8">
              <h2 className="text-sm text-slate-400 tracking-[0.2em] mb-4 flex items-center gap-2"><Cpu className="w-4 h-4" /> TEMA</h2>
              <div className="relative">
                 <input type="text" value={customThemeInput} onChange={(e) => setCustomThemeInput(e.target.value)} placeholder="Ej: Futbol, Cine, Comida..." className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 px-4 text-cyan-400 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors uppercase" />
                  <Search className="absolute right-4 top-3.5 w-5 h-5 text-slate-600" />
              </div>
            </div>
            <button onClick={startAIGeneration} className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-black text-xl flex items-center justify-center gap-2 hover:scale-105 transition-transform shadow-[0_0_20px_rgba(6,182,212,0.4)]">
              <Zap className="w-6 h-6 fill-current" /> INICIAR SISTEMA
            </button>
          </div>

          {/* RANKING EN EL MENÚ */}
          {leaderboard.length > 0 && (
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
               <h3 className="text-xs text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Globe className="w-4 h-4" /> TOP 5 MUNDIAL</h3>
               <div className="space-y-3">
                 {leaderboard.map((score, i) => (
                   <div key={i} className="flex justify-between items-center text-sm border-b border-slate-800 pb-2 last:border-0">
                     <div className="flex items-center gap-3">
                       <span className={`font-black ${i===0 ? 'text-yellow-400' : 'text-slate-500'}`}>#{i+1}</span>
                       <span className="text-white font-bold">{score.displayName.substring(0, 15)}</span>
                     </div>
                     <span className="font-mono text-cyan-400">{formatTime(score.time)}</span>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>
      )}

      {/* PANTALLA CARGA */}
      {gameState === 'loading' && (
        <div className="flex flex-col items-center justify-center animate-in fade-in">
          <div className="w-24 h-24 relative">
             <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
             <div className="absolute inset-0 border-4 border-t-cyan-500 rounded-full animate-spin"></div>
          </div>
          <h2 className="text-2xl font-bold mt-8 text-white">GENERANDO {currentThemeName}...</h2>
          <p className="text-slate-400 text-sm tracking-widest mt-2 animate-pulse">CARGANDO DICCIONARIO</p>
        </div>
      )}

      {/* JUEGO */}
      {(gameState === 'playing' || gameState === 'won') && (
        <div className="flex flex-col items-center z-10 w-full max-w-xl animate-in fade-in-up">
          <div ref={gridRef} className="bg-slate-900/80 p-2 rounded-xl border border-slate-700 shadow-2xl backdrop-blur-md mb-6 touch-none" onMouseLeave={() => setSelection({ ...selection, current: null })}>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
              {grid.map((row, r) => row.map((letter, c) => (
                <div key={`${r}-${c}`} onMouseDown={() => handleMouseDown(r, c)} onMouseEnter={() => handleMouseEnter(r, c)} className={`w-8 h-8 sm:w-10 sm:h-10 lg:w-11 lg:h-11 flex items-center justify-center text-base sm:text-lg lg:text-xl font-bold rounded-md cursor-pointer select-none ${getCellClass(r, c)}`}>
                  {letter}
                </div>
              )))}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2 w-full px-4">
            {words.map((word) => (
              <div key={word} className={`px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-bold tracking-wider border transition-all duration-500 ${found.includes(word) ? 'bg-green-500 text-black border-green-500 shadow-lg scale-105' : 'bg-slate-900/50 border-slate-700 text-slate-500'}`}>
                {word}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PANTALLA VICTORIA */}
      {gameState === 'won' && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center animate-in zoom-in duration-300 px-4 overflow-y-auto py-10">
          <Trophy className="w-20 h-20 text-yellow-400 mb-6 animate-bounce drop-shadow-[0_0_20px_rgba(250,204,21,0.6)] flex-shrink-0" />
          <h2 className="text-4xl font-black text-white mb-1 text-center flex-shrink-0">¡COMPLETADO!</h2>
          
          <div className="mb-6 flex items-center gap-2 text-sm font-bold tracking-widest flex-shrink-0">
            {saveStatus === 'saving' && <span className="text-cyan-400 animate-pulse flex items-center gap-2"><Cloud className="w-4 h-4" /> GUARDANDO...</span>}
            {saveStatus === 'saved' && <span className="text-green-500 flex items-center gap-2"><Check className="w-4 h-4" /> RÉCORD GUARDADO</span>}
            {saveStatus === 'error' && <span className="text-red-500">ERROR DE CONEXIÓN</span>}
          </div>
          
          <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl justify-center items-start mb-8">
            {/* ESTADÍSTICAS */}
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-sm">
              <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
                <span className="text-slate-400 text-xs uppercase">TIEMPO FINAL</span>
                <span className="text-2xl font-mono font-bold text-cyan-400">{formatTime(seconds)}</span>
              </div>
              <div className="space-y-3">
                 <h3 className="text-xs text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Medal className="w-3 h-3" /> LOGROS</h3>
                 {achievements.map((ach, i) => <div key={i} className="bg-slate-800/50 p-2 rounded text-sm text-yellow-100 flex items-center gap-2">{ach}</div>)}
              </div>
            </div>

            {/* RANKING GLOBAL */}
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-sm">
               <h3 className="text-xs text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Globe className="w-4 h-4" /> RANKING MUNDIAL</h3>
               <div className="space-y-2">
                 {leaderboard.map((score, i) => (
                   <div key={i} className="flex justify-between items-center text-sm border-b border-slate-800 pb-2 last:border-0">
                     <div className="flex items-center gap-2">
                       <span className={`font-black w-4 ${i===0 ? 'text-yellow-400' : 'text-slate-500'}`}>{i+1}</span>
                       <span className="text-white font-bold truncate max-w-[100px]">{score.displayName}</span>
                     </div>
                     <span className="font-mono text-cyan-400">{formatTime(score.time)}</span>
                   </div>
                 ))}
               </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm mb-8 flex-shrink-0">
            <button onClick={shareResult} className="flex-1 py-4 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition flex items-center justify-center gap-2 border border-slate-600">
              <Share2 className="w-5 h-5" /> RETAR
            </button>
            <button onClick={() => setGameState('menu')} className="flex-1 py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5" /> REINICIAR
            </button>
          </div>

          {/* 💰 PUBLICIDAD NO INTRUSIVA */}
          {/* Está al final del todo. Si el usuario quiere salir, ya ha visto los botones arriba. */}
          <div className="w-full max-w-sm flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity">
            <AdSpace type="banner" />
          </div>

        </div>
      )}
    </div>
  );
}