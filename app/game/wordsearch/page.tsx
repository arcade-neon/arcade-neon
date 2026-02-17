// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, RefreshCw, Trophy, Search, Cpu, Zap, Layers, Timer, 
  Share2, Medal, Cloud, Check, Globe, Edit3, Link as LinkIcon, MessageCircle, X, Loader2, Lightbulb, Video
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, getDoc, where } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';

// --- CONFIGURACIÓN ---
const LEVEL_CONFIG = {
  easy: { grid: 8, words: 5, name: 'FÁCIL' },
  medium: { grid: 10, words: 8, name: 'MEDIO' },
  hard: { grid: 12, words: 12, name: 'DIFÍCIL' }
};

const AI_THEMES_DB = {
  "default": ["REACT", "NEXTJS", "TYPESCRIPT", "TAILWIND", "VERCEL", "NODE", "DATABASE", "CLOUD", "CYBER", "CODE"],
  "futbol": ["GOL", "PORTERO", "PENALTI", "ARBITRO", "BALON", "ESTADIO", "FALTA", "LIGA", "MUNDIAL", "MESSI"],
  "harrypotter": ["POTTER", "RON", "HERMIONE", "HOGWARTS", "MAGIA", "VARITA", "DUMBLEDORE", "SNAPE", "DOBBY", "DRACO"],
  "pokemon": ["PIKACHU", "CHARIZARD", "MEWTWO", "EEVEE", "SNORLAX", "BULBASAUR", "SQUIRTLE", "GANGAR", "LUGIA", "ASH"],
  "cine": ["OSCAR", "ACTOR", "DRAMA", "ACCION", "COMEDIA", "TERROR", "GUION", "DIRECTOR", "NETFLIX", "CINE"],
  "marvel": ["THOR", "HULK", "IRONMAN", "SPIDERMAN", "THANOS", "LOKI", "GROOT", "VISION", "WANDA", "HAWKEYE"],
  "paises": ["ESPAÑA", "MEXICO", "ARGENTINA", "COLOMBIA", "PERU", "CHILE", "FRANCIA", "ITALIA", "JAPON", "BRASIL"],
  "musica": ["GUITARRA", "PIANO", "CANTANTE", "CONCIERTO", "JAZZ", "ROCK", "SALSA", "POP", "DISCO", "BATERIA"]
};

function WordSearchContent() {
  const searchParams = useSearchParams();
  
  // Estados de Navegación
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'won' | 'loading' | 'create_challenge' | 'accept_challenge'>('menu');
  
  // Configuración Partida
  const [difficulty, setDifficulty] = useState('medium');
  const [customThemeInput, setCustomThemeInput] = useState('');
  const [currentThemeName, setCurrentThemeName] = useState('TECH');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [leaderboard, setLeaderboard] = useState([]);
  
  // Usuario
  const [user, setUser] = useState<any>(null);
  const [userNickname, setUserNickname] = useState('Jugador');

  // Retos
  const [challengeWords, setChallengeWords] = useState<string[]>([]);
  const [challengeInput, setChallengeInput] = useState('');
  const [challengeData, setChallengeData] = useState<{challenger: string, words: string[]} | null>(null);
  const [shareUrl, setShareUrl] = useState('');

  // Crono y Juego
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [achievements, setAchievements] = useState<string[]>([]);

  // Pistas
  const [hintCell, setHintCell] = useState<{r: number, c: number} | null>(null); // Celda a iluminar

  // Tablero
  const [grid, setGrid] = useState<string[][]>([]);
  const [gridSize, setGridSize] = useState(10);
  const [words, setWords] = useState<string[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [wordPositions, setWordPositions] = useState<any>({});
  const [selection, setSelection] = useState({ start: null, end: null, current: null });
  const gridRef = useRef<HTMLDivElement>(null);

  // --- 1. INICIALIZACIÓN ---
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
        if (u) {
            setUser(u);
            const docSnap = await getDoc(doc(db, "users", u.uid));
            if (docSnap.exists() && docSnap.data().nickname) setUserNickname(docSnap.data().nickname);
        }
    });

    const challengeParam = searchParams.get('challenge');
    const challengerParam = searchParams.get('challenger');

    if (challengeParam) {
        try {
            const decoded = atob(challengeParam);
            const wordsList = decoded.split(',');
            setChallengeData({
                challenger: challengerParam || 'Anónimo',
                words: wordsList
            });
            setGameState('accept_challenge');
        } catch (e) {
            console.error("Error leyendo reto", e);
        }
    }
    
    return () => unsub();
  }, [searchParams]);

  // Actualizar Ranking al cambiar dificultad o entrar al menú
  useEffect(() => {
      if (gameState === 'menu' || gameState === 'won') {
          fetchLeaderboard();
      }
  }, [difficulty, gameState]);

  // --- 2. RANKING FILTRADO POR DIFICULTAD ---
  const fetchLeaderboard = async () => {
    try {
      // Importante: Firestore requiere un índice compuesto para 'difficulty' + 'time'.
      // Si falla en consola, crea el índice siguiendo el enlace que da Firebase.
      const q = query(
          collection(db, "scores_wordsearch"), 
          where("difficulty", "==", difficulty), // Filtrar por nivel actual
          orderBy("time", "asc"), 
          limit(5)
      );
      const querySnapshot = await getDocs(q);
      const scores = querySnapshot.docs.map(doc => doc.data());
      setLeaderboard(scores);
    } catch (error) { console.error("Error ranking:", error); }
  };

  // --- 3. CRONÓMETRO ---
  useEffect(() => {
    let interval = null;
    if (isActive) {
      interval = setInterval(() => setSeconds(s => s + 1), 1000);
    } else if (!isActive && seconds !== 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, seconds]);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- 4. SISTEMA DE PISTAS (ADS) ---
  const watchAdForHint = () => {
      if (gameState !== 'playing') return;
      
      // Buscar una palabra que NO esté encontrada
      const missingWords = words.filter(w => !found.includes(w));
      if (missingWords.length === 0) return;

      // Elegir una al azar
      const targetWord = missingWords[0]; // Cogemos la primera para simplificar
      const pos = wordPositions[targetWord];

      if (pos) {
          // Simular Anuncio
          const confirmAd = confirm("¿Ver un vídeo corto para revelar la ubicación de una palabra?");
          if (confirmAd) {
              // Aquí iría la llamada real al proveedor de anuncios
              alert("🎥 Viendo anuncio publicitario..."); 
              
              // RECOMPENSA: Iluminar la primera letra
              setHintCell(pos.start); 
              
              // Quitar la pista después de 5 segundos
              setTimeout(() => setHintCell(null), 5000);
          }
      }
  };

  // --- 5. LOGICA DE JUEGO ---
  const startGame = (isChallenge = false) => {
    setGameState('loading');
    setSeconds(0);
    setAchievements([]);
    setSaveStatus('idle');
    setHintCell(null);
    
    setTimeout(() => {
      let selectedWords = [];
      let size = 10;
      let theme = "ALEATORIO";

      if (isChallenge && challengeData) {
          selectedWords = challengeData.words.map(w => w.toUpperCase());
          const longest = Math.max(...selectedWords.map(w => w.length));
          size = Math.max(10, longest + 2);
          theme = `RETO DE ${challengeData.challenger.toUpperCase()}`;
          setGridSize(size);
      } else {
          const config = LEVEL_CONFIG[difficulty];
          setGridSize(config.grid);
          size = config.grid;
          
          let themeKey = "default";
          const input = customThemeInput.trim().toLowerCase();
          if (input) {
            const foundKey = Object.keys(AI_THEMES_DB).find(key => input.includes(key) || key.includes(input));
            themeKey = foundKey || "default";
            theme = themeKey === "default" ? input.toUpperCase() : themeKey.toUpperCase();
          } else {
             theme = "TECNOLOGÍA";
          }
          
          const pool = AI_THEMES_DB[themeKey] || AI_THEMES_DB["default"];
          selectedWords = [...pool].sort(() => 0.5 - Math.random()).slice(0, config.words);
      }
      
      setCurrentThemeName(theme);
      initGrid(selectedWords, size);
      setGameState('playing');
      setIsActive(true);
    }, 1000);
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
        if (newGrid[i][j] === '') newGrid[i][j] = letters.charAt(Math.floor(Math.random() * letters.length));
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

  // --- INTERACCIÓN ---
  const handlePointerDown = (r, c, e) => {
    if (gameState !== 'playing') return;
    e.preventDefault(); 
    setSelection({ start: { r, c }, current: { r, c }, end: null });
  };

  const handlePointerMove = (e) => {
    if (!selection.start || gameState !== 'playing') return;
    e.preventDefault();
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const r = target?.getAttribute('data-r');
    const c = target?.getAttribute('data-c');
    if (r !== null && c !== null) {
      setSelection(prev => ({ ...prev, current: { r: Number(r), c: Number(c) } }));
    }
  };

  const handlePointerUp = () => {
    if (selection.start && selection.current) checkSelection(selection.start, selection.current);
    setSelection({ start: null, end: null, current: null });
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

  // --- CREAR RETO ---
  const handleAddChallengeWord = () => {
      const w = challengeInput.trim().toUpperCase().replace(/[^A-Z]/g, '');
      if (w.length > 2 && w.length < 13 && !challengeWords.includes(w)) {
          if (challengeWords.length < 10) {
              setChallengeWords([...challengeWords, w]);
              setChallengeInput('');
          } else {
              alert("Máximo 10 palabras.");
          }
      }
  };

  const generateChallengeLink = () => {
      if (challengeWords.length < 3) return alert("Añade al menos 3 palabras.");
      const wordsString = challengeWords.join(',');
      const encodedWords = btoa(wordsString);
      const currentUrl = window.location.origin + window.location.pathname;
      const url = `${currentUrl}?challenge=${encodedWords}&challenger=${encodeURIComponent(userNickname)}`;
      setShareUrl(url);
  };

  const sendToWhatsApp = () => {
      const text = `🕵️ *DESAFÍO SOPA DE LETRAS* \n\nHe escondido ${challengeWords.length} palabras secretas. \n¿Puedes encontrarlas todas? \n\nJuega aquí: ${shareUrl}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  // --- VICTORIA ---
  const winGame = async () => {
    setIsActive(false);
    setGameState('won');
    
    const earned = [];
    if (difficulty === 'hard' && !challengeData) earned.push("HACKER SUPREMO 🏆");
    if (seconds < 40) earned.push("VELOCIDAD LUZ ⚡");
    if (challengeData) earned.push("RETADOR ⚔️");
    setAchievements(earned);

    if (!challengeData) { 
        setSaveStatus('saving');
        try {
        const user = auth.currentUser;
        if (user) {
            await addDoc(collection(db, "scores_wordsearch"), {
            uid: user.uid,
            displayName: userNickname,
            photoURL: user.photoURL || null,
            time: seconds,
            difficulty: difficulty, // Importante para el filtro
            theme: currentThemeName,
            date: serverTimestamp(),
            achievements: earned
            });
            setSaveStatus('saved');
            fetchLeaderboard(); 
        } else {
            setSaveStatus('error');
        }
        } catch (error) { setSaveStatus('error'); }
    }
  };

  const getCellClass = (r, c) => {
    // 1. Pista activa
    if (hintCell && hintCell.r === r && hintCell.c === c) {
        return 'bg-yellow-400 text-black font-black animate-pulse shadow-[0_0_20px_#facc15] z-20 scale-110';
    }

    // 2. Palabras encontradas
    for (const word of found) {
      const pos = wordPositions[word];
      if (!pos) continue;
      if (isCellBetween(r, c, pos.start, pos.end)) return 'bg-emerald-500 text-black font-black scale-105 shadow-[0_0_15px_#10b981] z-10 transition-all duration-300';
    }

    // 3. Selección actual
    if (selection.start && selection.current && isCellBetween(r, c, selection.start, selection.current, true)) return 'bg-cyan-500/50 text-white rounded-full';
    
    // 4. Default
    return 'bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors duration-200';
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
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center font-mono text-white p-4 select-none overflow-hidden touch-none" 
    onPointerUp={handlePointerUp}> 
      
      {/* --- HEADER --- */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-20 pointer-events-none">
        <Link href="/" className="pointer-events-auto p-3 bg-slate-900/80 rounded-full hover:bg-slate-800 transition border border-slate-700 text-white">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        {gameState === 'playing' && (
          <div className="flex items-center gap-4 bg-slate-900/80 px-4 py-2 rounded-full border border-slate-700 backdrop-blur-md">
             <Timer className="w-4 h-4 text-cyan-400" />
             <span className="text-xl font-bold font-mono text-white">{formatTime(seconds)}</span>
          </div>
        )}
      </div>

      <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-500 drop-shadow-[0_0_20px_rgba(34,211,238,0.3)] mb-2 mt-16 text-center italic tracking-tighter">
        SOPA DE LETRAS
      </h1>

      {/* --- MENÚ PRINCIPAL --- */}
      {gameState === 'menu' && (
        <div className="flex flex-col gap-6 w-full max-w-md animate-in zoom-in duration-300 pb-20">
          <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl"></div>
            
            {/* DIFICULTAD */}
            <div className="mb-6">
              <h2 className="text-[10px] text-slate-400 tracking-[0.3em] font-bold uppercase mb-3 flex items-center gap-2"><Layers className="w-3 h-3 text-cyan-500" /> NIVEL DE ACCESO</h2>
              <div className="flex gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {Object.keys(LEVEL_CONFIG).map(level => (
                  <button key={level} onClick={() => setDifficulty(level)} className={`flex-1 py-2 rounded-lg font-bold text-xs tracking-wider transition-all ${difficulty === level ? 'bg-cyan-500 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}>{LEVEL_CONFIG[level].name}</button>
                ))}
              </div>
            </div>

            {/* TEMA */}
            <div className="mb-8">
              <h2 className="text-[10px] text-slate-400 tracking-[0.3em] font-bold uppercase mb-3 flex items-center gap-2"><Cpu className="w-3 h-3 text-emerald-500" /> DATABASE TEMA</h2>
              <div className="relative group">
                 <input type="text" value={customThemeInput} onChange={(e) => setCustomThemeInput(e.target.value)} placeholder="Ej: Harry Potter, Marvel..." className="w-full bg-slate-950 border border-slate-800 rounded-xl py-4 px-4 text-cyan-400 placeholder-slate-700 focus:outline-none focus:border-cyan-500/50 transition-all font-bold uppercase text-sm" />
                  <Search className="absolute right-4 top-4 w-5 h-5 text-slate-700 group-focus-within:text-cyan-500 transition-colors" />
              </div>
            </div>

            <div className="space-y-3">
                <button onClick={() => startGame(false)} className="w-full py-4 bg-gradient-to-r from-cyan-600 to-cyan-500 rounded-xl font-black text-white text-lg flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                <Zap className="w-5 h-5 fill-current" /> JUGAR AHORA
                </button>
                <button onClick={() => setGameState('create_challenge')} className="w-full py-4 bg-slate-800 border border-slate-700 rounded-xl font-bold text-slate-300 text-sm flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors">
                <Edit3 className="w-4 h-4" /> CREAR RETO PERSONALIZADO
                </button>
            </div>
          </div>

          {/* RANKING (FILTRADO POR NIVEL ACTUAL) */}
          <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800/50 backdrop-blur-sm">
               <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2 font-bold justify-between">
                   <span><Globe className="w-3 h-3 inline mr-1" /> MEJORES TIEMPOS</span>
                   <span className="text-cyan-500">NIVEL {LEVEL_CONFIG[difficulty].name}</span>
               </h3>
               {leaderboard.length > 0 ? (
                   <div className="space-y-2">
                     {leaderboard.map((score, i) => (
                       <div key={i} className="flex justify-between items-center text-xs border-b border-slate-800/50 pb-2 last:border-0">
                         <div className="flex items-center gap-3">
                           <span className={`font-black w-4 text-center ${i===0 ? 'text-yellow-400 text-sm' : 'text-slate-600'}`}>{i+1}</span>
                           <span className="text-slate-300 font-bold">{score.displayName?.substring(0, 12)}</span>
                         </div>
                         <span className="font-mono text-emerald-400 font-bold">{formatTime(score.time)}</span>
                       </div>
                     ))}
                   </div>
               ) : (
                   <div className="text-slate-600 text-xs italic text-center py-2">Sin récords en este nivel aún.</div>
               )}
          </div>
        </div>
      )}

      {/* --- CREAR RETO --- */}
      {gameState === 'create_challenge' && (
          <div className="bg-slate-900/90 p-8 rounded-3xl border border-slate-700 shadow-2xl w-full max-w-md animate-in fade-in">
              <h2 className="text-xl font-black text-white mb-1 uppercase italic">Diseñar Desafío</h2>
              <p className="text-slate-400 text-xs mb-6">Añade palabras ocultas para retar a tus amigos.</p>

              {!shareUrl ? (
                  <>
                    <div className="flex gap-2 mb-4">
                        <input 
                            value={challengeInput}
                            onChange={(e) => setChallengeInput(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddChallengeWord()}
                            placeholder="PALABRA..."
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-700 focus:border-emerald-500 outline-none font-bold uppercase"
                            maxLength={12}
                        />
                        <button onClick={handleAddChallengeWord} className="bg-emerald-500 text-black font-bold px-4 rounded-xl hover:bg-emerald-400 transition">+</button>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-8 min-h-[100px] content-start bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                        {challengeWords.length === 0 && <span className="text-slate-600 text-xs italic">Tus palabras aparecerán aquí...</span>}
                        {challengeWords.map((w, i) => (
                            <span key={i} className="bg-slate-800 text-cyan-400 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 border border-slate-700">
                                {w} <button onClick={() => setChallengeWords(prev => prev.filter(word => word !== w))} className="hover:text-red-400"><X size={12}/></button>
                            </span>
                        ))}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={() => setGameState('menu')} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-slate-400 text-xs">VOLVER</button>
                        <button onClick={generateChallengeLink} disabled={challengeWords.length < 3} className="flex-[2] py-3 bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-cyan-400 transition">
                            <LinkIcon size={16}/> GENERAR LINK
                        </button>
                    </div>
                  </>
              ) : (
                  <div className="text-center space-y-4">
                      <div className="bg-emerald-500/10 border border-emerald-500/50 p-4 rounded-xl text-emerald-400 text-sm mb-4">
                          ¡Enlace generado con éxito!
                      </div>
                      <button onClick={sendToWhatsApp} className="w-full py-4 bg-[#25D366] hover:bg-[#20bd5a] text-white font-black rounded-xl flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-105">
                          <MessageCircle size={24} fill="white" /> ENVIAR POR WHATSAPP
                      </button>
                      <button onClick={() => {setShareUrl(''); setGameState('menu'); setChallengeWords([])}} className="text-slate-500 text-xs font-bold hover:text-white mt-4">
                          Crear otro reto
                      </button>
                  </div>
              )}
          </div>
      )}

      {/* --- ACEPTAR RETO --- */}
      {gameState === 'accept_challenge' && challengeData && (
          <div className="bg-slate-900/90 p-8 rounded-3xl border-2 border-yellow-500 shadow-[0_0_40px_rgba(234,179,8,0.2)] w-full max-w-md text-center animate-in zoom-in">
              <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4 animate-bounce" />
              <h2 className="text-2xl font-black text-white uppercase italic">Has sido desafiado</h2>
              <p className="text-slate-400 text-sm mb-6">por <span className="text-yellow-400 font-bold">{challengeData.challenger}</span></p>
              
              <div className="bg-black/40 p-4 rounded-xl mb-8">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">OBJETIVO</p>
                  <p className="text-xl font-bold text-white">ENCONTRAR {challengeData.words.length} PALABRAS</p>
              </div>

              <button onClick={() => startGame(true)} className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl text-lg shadow-lg hover:scale-105 transition-transform">
                  ACEPTAR DESAFÍO
              </button>
              <button onClick={() => setGameState('menu')} className="mt-4 text-slate-500 text-xs font-bold hover:text-white">RECHAZAR</button>
          </div>
      )}

      {/* --- PANTALLA CARGA --- */}
      {gameState === 'loading' && (
        <div className="flex flex-col items-center justify-center animate-in fade-in">
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
          <h2 className="text-2xl font-black text-white italic tracking-tighter">HACKEANDO...</h2>
          <p className="text-cyan-400/60 text-xs tracking-[0.3em] mt-2 animate-pulse uppercase">{currentThemeName}</p>
        </div>
      )}

      {/* --- JUEGO (GRID) --- */}
      {(gameState === 'playing' || gameState === 'won') && (
        <div className="flex flex-col items-center z-10 w-full max-w-xl animate-in fade-in-up duration-500 pb-32"> {/* pb-32 para evitar overlap con ads */}
          
          {/* BOTÓN PISTA */}
          {gameState === 'playing' && (
              <button 
                onClick={watchAdForHint}
                className="mb-4 bg-yellow-500/10 border border-yellow-500/50 text-yellow-400 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 hover:bg-yellow-500 hover:text-black transition-colors"
              >
                  <Video size={14} /> PISTA (VIDEO)
              </button>
          )}

          {/* GRID */}
          <div 
            ref={gridRef} 
            className="bg-slate-900/80 p-3 rounded-2xl border border-slate-700 shadow-2xl backdrop-blur-md mb-6 touch-none select-none relative overflow-hidden" 
            onPointerMove={handlePointerMove}
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500"></div>
            <div className="grid gap-1 touch-none" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
              {grid.map((row, r) => row.map((letter, c) => (
                <div 
                  key={`${r}-${c}`} 
                  data-r={r}
                  data-c={c}
                  onPointerDown={(e) => handlePointerDown(r, c, e)}
                  className={`w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 flex items-center justify-center text-sm sm:text-base font-black rounded-lg cursor-pointer select-none touch-none ${getCellClass(r, c)}`}>
                  {letter}
                </div>
              )))}
            </div>
          </div>
          
          {/* LISTA PALABRAS */}
          <div className="flex flex-wrap justify-center gap-2 w-full px-2">
            {words.map((word) => (
              <div key={word} className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-wider border-2 transition-all duration-500 flex items-center gap-1 ${found.includes(word) ? 'bg-emerald-500 text-black border-emerald-500 shadow-[0_0_15px_#10b981] scale-105 opacity-50' : 'bg-slate-900/80 border-slate-800 text-slate-400'}`}>
                {found.includes(word) && <Check size={10} strokeWidth={4}/>} {word}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- VICTORIA --- */}
      {gameState === 'won' && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center animate-in zoom-in duration-300 px-6 pb-20">
          <Trophy className="w-24 h-24 text-yellow-400 mb-6 animate-bounce drop-shadow-[0_0_30px_rgba(250,204,21,0.5)]" />
          <h2 className="text-5xl font-black text-white mb-2 text-center italic tracking-tighter">¡MISIÓN CUMPLIDA!</h2>
          
          <div className="mb-8 flex items-center gap-2 text-xs font-bold tracking-widest bg-slate-900 px-4 py-2 rounded-full border border-slate-800">
            {saveStatus === 'saving' && <span className="text-cyan-400 animate-pulse flex items-center gap-2"><Cloud className="w-3 h-3" /> GUARDANDO...</span>}
            {saveStatus === 'saved' && <span className="text-emerald-500 flex items-center gap-2"><Check className="w-3 h-3" /> GUARDADO</span>}
            {saveStatus === 'error' && <span className="text-slate-500">OFFLINE MODE</span>}
          </div>
          
          {/* STATS CARD */}
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl w-full max-w-sm mb-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl"></div>
              <div className="flex justify-between items-end mb-6 border-b border-slate-800 pb-6">
                <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">TIEMPO FINAL</p>
                    <p className="text-4xl font-mono font-black text-white mt-1">{formatTime(seconds)}</p>
                </div>
                <Medal className="w-10 h-10 text-slate-700" />
              </div>
              <div className="flex flex-wrap gap-2">
                 {achievements.map((ach, i) => <span key={i} className="bg-yellow-500/10 text-yellow-400 text-[10px] font-bold px-2 py-1 rounded border border-yellow-500/20">{ach}</span>)}
              </div>
          </div>

          <div className="flex gap-4 w-full max-w-sm">
            <button onClick={() => setGameState('menu')} className="flex-1 py-4 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition flex items-center justify-center gap-2 border border-slate-700">
              <ArrowLeft className="w-5 h-5" /> SALIR
            </button>
            <button onClick={() => startGame(!!challengeData)} className="flex-[2] py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition flex items-center justify-center gap-2 shadow-lg">
              <RefreshCw className="w-5 h-5" /> JUGAR OTRA
            </button>
          </div>
        </div>
      )}
      
      {/* --- PUBLICIDAD (FOOTER) --- */}
      <div className="absolute bottom-0 left-0 w-full z-10">
         <AdSpace />
      </div>

    </div>
  );
}

export default function SopaLetrasPage() {
    return (
        <Suspense fallback={<div className="h-screen bg-slate-950 flex items-center justify-center text-white">Cargando Sistema...</div>}>
            <WordSearchContent />
        </Suspense>
    );
}