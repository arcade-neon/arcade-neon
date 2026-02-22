// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, RefreshCw, Trophy, Search, Cpu, Zap, Layers, Timer, 
  Share2, Medal, Cloud, Check, Globe, Edit3, Link as LinkIcon, MessageCircle, X, Loader2, Video, Target, Lightbulb, ChevronDown
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, getDoc, where } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';

// --- CONFIGURACIÓN ---
const LEVEL_CONFIG = {
  easy: { grid: 8, words: 5, name: 'FÁCIL' },
  medium: { grid: 10, words: 8, name: 'MEDIO' },
  hard: { grid: 14, words: 12, name: 'DIFÍCIL' }
};

// --- BASE DE DATOS DE TEMAS ---
const AI_THEMES_DB = {
  "default": { name: "PROGRAMACIÓN", words: ["REACT", "NEXTJS", "TYPESCRIPT", "TAILWIND", "VERCEL", "NODE", "DATABASE", "CLOUD", "CYBER", "CODE", "HTML", "PYTHON", "JAVA", "CSS", "FRONTEND", "BACKEND", "API", "SERVER", "GIT", "LINUX"] },
  "futbol": { name: "FÚTBOL MUNDIAL", words: ["GOL", "PORTERO", "PENALTI", "ARBITRO", "BALON", "ESTADIO", "FALTA", "LIGA", "MUNDIAL", "MESSI", "CRISTIANO", "MADRID", "BARCA", "CORNER", "DEFENSA", "DELANTERO", "CHAMPIONS", "COPA", "BOTA", "CESPED"] },
  "baloncesto": { name: "BALONCESTO NBA", words: ["CANASTA", "TRIPLE", "PIVOT", "REBOTE", "FALTA", "NBA", "JORDAN", "KOBE", "LEBRON", "LAKERS", "BULLS", "TAPON", "MATE", "CANCHA", "AROS", "BALON", "PASES", "TIRO", "DEFENSA", "ALERO"] },
  "tenis": { name: "TENIS PRO", words: ["RAQUETA", "SET", "MATCH", "PUNTO", "SAQUE", "NADAL", "FEDERER", "ALCARAZ", "PISTA", "RED", "WIMBLEDON", "ROLAND", "OPEN", "VOLEA", "REVES", "DRIVE", "GLOBO", "DEUCE", "TIEBREAK", "JUEZ"] },
  "motor": { name: "MOTOR Y F1", words: ["COCHE", "MOTO", "FERRARI", "MERCEDES", "RUEDA", "MOTOR", "PISTA", "CURVA", "ALONSO", "SAINZ", "VOLANTE", "FRENOS", "GASOLINA", "BOXES", "PODIO", "CARRERA", "RALLY", "TURBO", "KART", "CASCO"] },
  "harrypotter": { name: "MAGIA Y HOWGARTS", words: ["POTTER", "RON", "HERMIONE", "HOGWARTS", "MAGIA", "VARITA", "DUMBLEDORE", "SNAPE", "DOBBY", "DRACO", "SIRIUS", "VOLDEMORT", "MUGGLE", "GRYFFINDOR", "SLYTHERIN", "HAGRID", "LECHUZA", "QUIDDITCH", "SNITCH", "ESCOBA"] },
  "pokemon": { name: "POKÉMON", words: ["PIKACHU", "CHARIZARD", "MEWTWO", "EEVEE", "SNORLAX", "BULBASAUR", "SQUIRTLE", "GANGAR", "LUGIA", "ASH", "POKEBALL", "GIMNASIO", "MEDALLA", "BROCK", "MISTY", "ROCKET", "RAYQUAZA", "DITTO", "CELEBI", "EVOLUCION"] },
  "cine": { name: "CINE Y HOLLYWOOD", words: ["OSCAR", "ACTOR", "DRAMA", "ACCION", "COMEDIA", "TERROR", "GUION", "DIRECTOR", "NETFLIX", "CINE", "CAMARA", "ESCENA", "CORTE", "FOCO", "LUCES", "ESTRENO", "CARTELERA", "TICKET", "PALOMITAS", "PANTALLA"] },
  "marvel": { name: "HÉROES MARVEL", words: ["THOR", "HULK", "IRONMAN", "SPIDERMAN", "THANOS", "LOKI", "GROOT", "VISION", "WANDA", "HAWKEYE", "VENOM", "DEADPOOL", "CAPITAN", "FALCON", "STARK", "AVENGERS", "MUTANTE", "XMEN", "WOLVERINE", "MAGNETO"] },
  "paises": { name: "GEOGRAFÍA (PAÍSES)", words: ["ESPAÑA", "MEXICO", "ARGENTINA", "COLOMBIA", "PERU", "CHILE", "FRANCIA", "ITALIA", "JAPON", "BRASIL", "CANADA", "CHINA", "INDIA", "ALEMANIA", "RUSIA", "SUIZA", "SUECIA", "EGIPTO", "MARRUECOS", "CUBA"] },
  "comida": { name: "GASTRONOMÍA", words: ["PIZZA", "SUSHI", "PASTA", "HAMBURGUESA", "TACO", "PAELLA", "TORTILLA", "ENSALADA", "SOPA", "QUESO", "POLLO", "CARNE", "PESCADO", "ARROZ", "PAN", "FRUTA", "MANZANA", "PLATANO", "HELADO", "TARTA"] },
  "animales": { name: "REINO ANIMAL", words: ["PERRO", "GATO", "LEON", "TIGRE", "ELEFANTE", "JIRAFA", "MONO", "OSO", "LOBO", "ZORRO", "CABALLO", "VACA", "CERDO", "OVEJA", "PATO", "AGUILA", "HALCON", "TIBURON", "BALLENA", "DELFIN"] },
  "profesiones": { name: "PROFESIONES", words: ["MEDICO", "BOMBERO", "POLICIA", "PROFESOR", "INGENIERO", "ABOGADO", "JUEZ", "ACTOR", "PINTOR", "MUSICO", "CHEF", "PILOTO", "CONDUCTOR", "MECANICO", "ELECTRICISTA", "CARPINTERO", "ALBAÑIL", "FONTANERO", "CARTERO", "PANADERO"] },
  "cuerpo": { name: "CUERPO HUMANO", words: ["CABEZA", "BRAZO", "PIERNA", "MANO", "PIE", "DEDO", "OJO", "OREJA", "BOCA", "NARIZ", "CORAZON", "PULMON", "HIGADO", "ESTOMAGO", "CEREBRO", "HUESO", "SANGRE", "PIEL", "PELO", "UÑA"] },
  "naturaleza": { name: "NATURALEZA", words: ["ARBOL", "FLOR", "HOJA", "RAMA", "BOSQUE", "SELVA", "RIO", "LAGO", "MAR", "OCEANO", "MONTAÑA", "VOLCAN", "VALLE", "CUEVA", "DESIERTO", "PLAYA", "ARENA", "PIEDRA", "ROCA", "TIERRA"] }
};

function WordSearchContent() {
  const searchParams = useSearchParams();
  
  // Estados de Navegación
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'won' | 'loading' | 'create_challenge' | 'accept_challenge'>('menu');
  
  // Configuración Partida
  const [difficulty, setDifficulty] = useState('medium');
  const [selectedThemeKey, setSelectedThemeKey] = useState('default'); // NUEVO: Selector de tema
  const [currentThemeName, setCurrentThemeName] = useState('PROGRAMACIÓN');
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
  const [hintCell, setHintCell] = useState<{r: number, c: number} | null>(null); 

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

  // --- 2. RANKING (TOP 5 Filtrado en Cliente) ---
  const fetchLeaderboard = async () => {
    try {
      // 1. Pedimos a Firebase solo ordenado por tiempo (sin WHERE)
      const q = query(
          collection(db, "scores_wordsearch"), 
          orderBy("time", "asc"), 
          limit(50) 
      );
      const querySnapshot = await getDocs(q);
      const scores = querySnapshot.docs.map(doc => doc.data());
      
      // 2. Filtramos la dificultad nosotros en JS para que Firebase no pida el índice compuesto
      const filteredScores = scores.filter(s => s.difficulty === difficulty).slice(0, 5); // TOP 5 SIEMPRE
      setLeaderboard(filteredScores);
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
      const missingWords = words.filter(w => !found.includes(w));
      if (missingWords.length === 0) return;

      const targetWord = missingWords[0];
      const pos = wordPositions[targetWord];

      if (pos) {
          const confirmAd = confirm("¿Ver un vídeo corto para revelar la ubicación de una palabra?");
          if (confirmAd) {
              alert("🎥 Viendo anuncio publicitario..."); 
              setHintCell(pos.start); 
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
          
          // --- NUEVO: Selección de Tema por Selector ---
          const themeData = AI_THEMES_DB[selectedThemeKey];
          theme = themeData.name;
          const pool = themeData.words;
          
          // Extraer palabras aleatorias de la bolsa
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
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const target = document.elementFromPoint(clientX, clientY);
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
      if (w.length > 2 && w.length < 15 && !challengeWords.includes(w)) {
          if (challengeWords.length < 12) {
              setChallengeWords([...challengeWords, w]);
              setChallengeInput('');
          } else {
              alert("Máximo 12 palabras.");
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
            difficulty: difficulty, 
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
    if (hintCell && hintCell.r === r && hintCell.c === c) {
        return 'bg-yellow-400 text-black font-black animate-pulse shadow-[0_0_20px_#facc15] z-20 scale-110';
    }
    for (const word of found) {
      const pos = wordPositions[word];
      if (!pos) continue;
      if (isCellBetween(r, c, pos.start, pos.end)) return 'bg-emerald-500 text-black font-black scale-105 shadow-[0_0_15px_#10b981] z-10 transition-all duration-300';
    }
    if (selection.start && selection.current && isCellBetween(r, c, selection.start, selection.current, true)) return 'bg-cyan-500/50 text-white rounded-full';
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
    // CAMBIO 1: Eliminado "overflow-hidden" del padre para permitir Scroll normal en movil
    <div className="min-h-screen relative bg-[#020617] flex flex-col font-mono text-white p-4 select-none overflow-x-hidden overflow-y-auto pt-24 pb-40" 
    onPointerUp={handlePointerUp} onTouchEnd={handlePointerUp}> 
      
      {/* --- BOTÓN DE RETROCESO (FIJO Y ACTIVO) --- */}
      <div className="fixed top-6 left-6 z-[100]">
        <button 
          onClick={(e) => {
            e.stopPropagation(); 
            if (gameState === 'menu') window.location.href = '/'; 
            else setGameState('menu'); 
          }} 
          className="p-3 bg-slate-900/90 rounded-full hover:bg-slate-800 transition border border-slate-700 text-white shadow-lg cursor-pointer pointer-events-auto"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-500 drop-shadow-[0_0_20px_rgba(34,211,238,0.3)] mb-6 text-center italic tracking-tighter mx-auto w-full">
        SOPA DE LETRAS
      </h1>

      {/* --- MENÚ PRINCIPAL --- */}
      {gameState === 'menu' && (
        <div className="flex flex-col gap-6 w-full max-w-md mx-auto animate-in zoom-in duration-300">
          <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl"></div>
            
            <div className="mb-6">
              <h2 className="text-[10px] text-slate-400 tracking-[0.3em] font-bold uppercase mb-3 flex items-center gap-2"><Layers className="w-3 h-3 text-cyan-500" /> NIVEL DE ACCESO</h2>
              <div className="flex gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {Object.keys(LEVEL_CONFIG).map(level => (
                  <button key={level} onClick={() => setDifficulty(level)} className={`flex-1 py-2 rounded-lg font-bold text-xs tracking-wider transition-all ${difficulty === level ? 'bg-cyan-500 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}>{LEVEL_CONFIG[level].name}</button>
                ))}
              </div>
            </div>

            {/* --- NUEVO SELECTOR DE TEMA DESPLEGABLE --- */}
            <div className="mb-8">
              <h2 className="text-[10px] text-slate-400 tracking-[0.3em] font-bold uppercase mb-3 flex items-center gap-2"><Cpu className="w-3 h-3 text-emerald-500" /> CATEGORÍA TEMÁTICA</h2>
              <div className="relative group">
                 <select 
                    value={selectedThemeKey} 
                    onChange={(e) => setSelectedThemeKey(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-4 px-4 text-cyan-400 focus:outline-none focus:border-cyan-500/50 transition-all font-bold uppercase text-sm appearance-none cursor-pointer shadow-inner"
                 >
                    {Object.keys(AI_THEMES_DB).map(key => (
                        <option key={key} value={key} className="bg-slate-900 text-white font-bold py-2">
                            {AI_THEMES_DB[key].name}
                        </option>
                    ))}
                 </select>
                 <ChevronDown className="absolute right-4 top-4 w-5 h-5 text-slate-500 pointer-events-none" />
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

          <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800/50 backdrop-blur-sm">
               <h3 className="text-[10px] text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2 font-bold justify-between">
                   <span><Globe className="w-3 h-3 inline mr-1" /> TOP 5 MUNDIAL</span>
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
          <div className="bg-slate-900/90 p-8 rounded-3xl border border-slate-700 shadow-2xl w-full max-w-md mx-auto animate-in fade-in">
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
                            maxLength={15}
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
                        <button onClick={generateChallengeLink} disabled={challengeWords.length < 3} className="w-full py-3 bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-cyan-400 transition">
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
          <div className="bg-slate-900/90 p-8 rounded-3xl border-2 border-yellow-500 shadow-[0_0_40px_rgba(234,179,8,0.2)] w-full max-w-md mx-auto text-center animate-in zoom-in">
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
          </div>
      )}

      {/* --- PANTALLA CARGA --- */}
      {gameState === 'loading' && (
        <div className="flex flex-col items-center justify-center mx-auto animate-in fade-in mt-20">
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
          <h2 className="text-2xl font-black text-white italic tracking-tighter">HACKEANDO...</h2>
          <p className="text-cyan-400/60 text-xs tracking-[0.3em] mt-2 animate-pulse uppercase">{currentThemeName}</p>
        </div>
      )}

      {/* --- JUEGO (GRID + LATERAL RESPONSIVE) --- */}
      {(gameState === 'playing') && (
        // CAMBIO 2: Layout flexible. En móvil es columna (una cosa debajo de otra), en escritorio es fila (lado a lado).
        <div className="flex flex-col lg:flex-row items-start justify-center gap-8 w-full max-w-6xl mx-auto animate-in fade-in-up duration-500 relative"> 
          
          {/* COLUMNA IZQUIERDA: TABLERO Y HEADER DE JUEGO */}
          <div className="flex flex-col items-center w-full lg:w-auto">
              
              <div className="flex w-full justify-between items-center mb-4 px-2 max-w-[500px]">
                  <button 
                    onClick={watchAdForHint}
                    className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-400 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 hover:bg-yellow-500 hover:text-black transition-colors shadow-lg"
                  >
                      <Lightbulb size={14} /> PISTA AD
                  </button>
                  
                  <div className="flex items-center gap-2 bg-slate-900/90 px-4 py-2 rounded-full border border-slate-700 shadow-lg">
                     <Timer className="w-4 h-4 text-cyan-400" />
                     <span className="text-xl font-bold font-mono text-white">{formatTime(seconds)}</span>
                  </div>
              </div>

              {/* CAMBIO 3: touch-none SOLO EN EL TABLERO. Así puedes hacer scroll usando el fondo de la pantalla. */}
              <div 
                ref={gridRef} 
                className="bg-slate-900/80 p-3 rounded-2xl border border-slate-700 shadow-2xl backdrop-blur-md touch-none select-none relative overflow-hidden" 
                onPointerMove={handlePointerMove}
                onTouchMove={handlePointerMove}
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500"></div>
                <div className="grid gap-1 touch-none" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
                  {grid.map((row, r) => row.map((letter, c) => (
                    <div 
                      key={`${r}-${c}`} 
                      data-r={r}
                      data-c={c}
                      onPointerDown={(e) => handlePointerDown(r, c, e)}
                      onTouchStart={(e) => handlePointerDown(r, c, e)}
                      className={`w-7 h-7 sm:w-9 sm:h-9 lg:w-10 lg:h-10 flex items-center justify-center text-sm sm:text-base font-black rounded-lg cursor-pointer select-none touch-none ${getCellClass(r, c)}`}>
                      {letter}
                    </div>
                  )))}
                </div>
              </div>
          </div>
          
          {/* COLUMNA DERECHA/ABAJO: LISTA DE PALABRAS */}
          <div className="w-full lg:w-80 bg-slate-900/80 border border-slate-700 p-6 rounded-2xl shadow-xl backdrop-blur-md flex flex-col max-h-[500px]">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <Target className="w-4 h-4 text-cyan-500"/> OBJETIVOS ({found.length}/{words.length})
              </h3>
              
              <div className="flex flex-wrap lg:flex-col gap-2 overflow-y-auto custom-scrollbar pr-2 pb-4 content-start">
                {words.map((word) => {
                  const isFound = found.includes(word);
                  return (
                  <div key={word} className={`px-4 py-3 rounded-xl text-xs font-black tracking-wider border-2 transition-all duration-500 flex items-center justify-between ${isFound ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 line-through opacity-50' : 'bg-slate-950 border-slate-800 text-white shadow-inner'}`}>
                    <span>{word}</span>
                    {isFound && <Check size={14} className="text-emerald-500" strokeWidth={4}/>}
                  </div>
                  )
                })}
              </div>
          </div>

        </div>
      )}

      {/* --- VICTORIA --- */}
      {gameState === 'won' && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-xl z-[90] flex flex-col items-center justify-center animate-in zoom-in duration-300 px-6 pb-20">
          <Trophy className="w-24 h-24 text-yellow-400 mb-6 animate-bounce drop-shadow-[0_0_30px_rgba(250,204,21,0.5)]" />
          <h2 className="text-5xl font-black text-white mb-2 text-center italic tracking-tighter">¡MISIÓN CUMPLIDA!</h2>
          
          <div className="mb-8 flex items-center gap-2 text-xs font-bold tracking-widest bg-slate-900 px-4 py-2 rounded-full border border-slate-800">
            {saveStatus === 'saving' && <span className="text-cyan-400 animate-pulse flex items-center gap-2"><Cloud className="w-3 h-3" /> GUARDANDO...</span>}
            {saveStatus === 'saved' && <span className="text-emerald-500 flex items-center gap-2"><Check className="w-3 h-3" /> GUARDADO</span>}
            {saveStatus === 'error' && <span className="text-slate-500">OFFLINE MODE</span>}
          </div>
          
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl w-full max-w-sm mb-8 relative overflow-hidden shadow-2xl">
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
               MENÚ
            </button>
            <button onClick={() => startGame(!!challengeData)} className="flex-[2] py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition flex items-center justify-center gap-2 shadow-lg">
              <RefreshCw className="w-5 h-5" /> JUGAR OTRA
            </button>
          </div>
        </div>
      )}
      
      {/* --- PUBLICIDAD (FOOTER FIJO Y SEPARADO) --- */}
      {/* CAMBIO 4: La publicidad siempre se queda pegada al fondo del teléfono/pantalla */}
      <div className="fixed bottom-0 left-0 w-full z-[110] bg-[#020617] border-t border-slate-800 pb-safe pointer-events-auto">
         <AdSpace type="banner" />
      </div>

    </div>
  );
}

// --- EXPORTACIÓN PRINCIPAL ---
export default function WordSearchPage() {
    return (
        <Suspense fallback={<div className="h-screen bg-slate-950 flex items-center justify-center text-white">Cargando...</div>}>
            <WordSearchContent />
        </Suspense>
    );
}