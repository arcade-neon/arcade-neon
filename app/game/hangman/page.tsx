// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart, Play, Trophy, RefreshCw, Lock, Video, Users, Cpu, Eye, Lightbulb } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, setDoc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- BASE DE DATOS DE PALABRAS (AMPLIADA) ---
const CATEGORIES = {
  "TECNOLOGIA": ["PYTHON", "REACT", "FIREBASE", "SERVIDOR", "HACKER", "ROBOT", "CIBERNETICA", "ALGORITMO", "DATOS", "WIFI", "BINARIO", "SATELLITE", "INTELIGENCIA", "HARDWARE", "SOFTWARE"],
  "VIDEOJUEGOS": ["MARIO", "ZELDA", "FORTNITE", "MINECRAFT", "SONIC", "NINTENDO", "STEAM", "PLAYSTATION", "PIXEL", "BOSS", "KRATOS", "PIKACHU", "AMONGUS", "ROBLOX", "TETRIS"],
  "PELICULAS": ["AVATAR", "TITANIC", "MATRIX", "ALIEN", "ROCKY", "GLADIADOR", "BATMAN", "JOKER", "STARWARS", "SHREK", "TERMINATOR", "GODZILLA", "FROZEN", "SPIDERMAN", "INCEPTION"],
  "DEPORTES": ["FUTBOL", "TENIS", "BOXEO", "KARATE", "NATACION", "GOLF", "RUGBY", "MESSI", "JORDAN", "ESTADIO", "OLIMPIADAS", "BALONCESTO", "ATLETISMO", "CICLISMO", "SURF"],
  "ANIMALES": ["AGUILA", "TIBURON", "LEON", "PANTERA", "LOBO", "COBRA", "GORILA", "TIGRE", "HALCON", "DRAGON", "BALLENA", "DELFIN", "ELEFANTE", "JIRAFA", "PINGUINO"],
  "MUSICA": ["GUITARRA", "PIANO", "VIOLIN", "MOZART", "BEETHOVEN", "ROCK", "JAZZ", "OPERA", "SALSA", "CANTANTE", "CONCIERTO", "BATERIA", "METALLICA", "SHAKIRA", "QUEEN"],
  "CIENCIA": ["ATOMO", "CELULA", "GRAVEDAD", "QUIMICA", "FISICA", "GALAXIA", "PLANETA", "MICROSCOPIO", "ADN", "EINSTEIN", "ROBOTICA", "ENERGIA", "FOSIL", "VOLCAN", "MAGNETISMO"],
  "HISTORIA": ["ROMA", "EGIPTO", "PIRAMIDE", "VIKINGO", "SAMURAI", "IMPERIO", "GUERRA", "NAPOLEON", "COLON", "AZTECA", "MAYA", "CASTILLO", "REVOLUCION", "FARAON", "CABALLERO"],
  "GEOGRAFIA": ["ESPAÑA", "JAPON", "BRASIL", "EVEREST", "AMAZONAS", "DESIERTO", "OCEANO", "VOLCAN", "ISLA", "CONTINENTE", "CAPITAL", "FRONTERA", "MAPA", "BRUJULA", "TROPICO"]
};

const ALPHABET = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split('');

export default function ElAhorcadoGame() {
  // ESTADOS PRINCIPALES
  // menu, playing_ai, playing_online_host, playing_online_guest, create_room, join_room, game_over_won, game_over_lost
  const [view, setView] = useState('menu'); 
  
  // DATOS JUEGO
  const [word, setWord] = useState('');
  const [guessed, setGuessed] = useState([]);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0); 
  const [category, setCategory] = useState('TECNOLOGIA'); // Pista actual

  // DATOS MULTIJUGADOR
  const [roomCode, setRoomCode] = useState('');
  const [customWord, setCustomWord] = useState('');
  const [customHint, setCustomHint] = useState(''); // <--- NUEVA PISTA PERSONALIZADA
  const [opponentName, setOpponentName] = useState('Esperando...');
  
  // DATOS USUARIO
  const [leaderboard, setLeaderboard] = useState([]);
  const [user, setUser] = useState(null);
  
  // MONETIZACIÓN
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 }); 

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // --- LÓGICA ONLINE (REALTIME) ---
  useEffect(() => {
    if ((view === 'playing_online_host' || view === 'playing_online_guest') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_hangman", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (view === 'playing_online_host') {
                    setGuessed(data.guessed || []);
                    setLives(data.lives);
                    setOpponentName(data.guestName || 'Conectado');
                } 
                // Si eres invitado, actualizamos la pista por si acaso
                if (view === 'playing_online_guest') {
                    setCategory(data.hint || 'SALA PRIVADA');
                }
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode]);


  // --- FUNCIONES JUEGO IA ---
  const startAiGame = (cat) => {
    const pool = CATEGORIES[cat];
    const randomWord = pool[Math.floor(Math.random() * pool.length)];
    setWord(randomWord);
    setCategory(cat);
    setGuessed([]);
    setLives(3); 
    setView('playing_ai');
  };

  // --- FUNCIONES MULTIJUGADOR ---
  const createRoom = async () => {
    if (!customWord || customWord.length < 3) return alert("Escribe una palabra válida");
    const hintToSend = customHint.trim().toUpperCase() || "SIN PISTA"; // <--- PISTA POR DEFECTO

    const code = Math.floor(1000 + Math.random() * 9000).toString(); // Código 4 dígitos
    
    await setDoc(doc(db, "matches_hangman", code), {
        host: user?.name || 'Anónimo',
        word: customWord.toUpperCase(),
        hint: hintToSend, // <--- GUARDAMOS LA PISTA
        guessed: [],
        lives: 3,
        status: 'waiting',
        createdAt: serverTimestamp()
    });
    
    setWord(customWord.toUpperCase());
    setCategory(hintToSend); // Host ve su propia pista
    setRoomCode(code);
    setGuessed([]);
    setLives(3);
    setView('playing_online_host');
  };

  const joinRoom = async () => {
    if (!roomCode) return alert("Introduce un código");
    const roomRef = doc(db, "matches_hangman", roomCode);
    const roomSnap = await getDoc(roomRef);
    
    if (!roomSnap.exists()) return alert("Sala no encontrada");
    const data = roomSnap.data();
    
    // Unirse
    await updateDoc(roomRef, {
        guest: user?.uid || 'guest',
        guestName: user?.name || 'Invitado',
        status: 'playing'
    });

    setWord(data.word);
    setCategory(data.hint || 'SALA PRIVADA'); // <--- CARGAMOS LA PISTA DEL HOST
    setGuessed(data.guessed || []);
    setLives(data.lives);
    setView('playing_online_guest');
  };

  // --- LÓGICA DE JUEGO ---
  const handleGuess = async (letter) => {
    if (view === 'playing_online_host') return;
    if (guessed.includes(letter)) return;

    const newGuessed = [...guessed, letter];
    setGuessed(newGuessed);

    let newLives = lives;
    let gameOver = false;
    let isWin = false;

    if (!word.includes(letter)) {
      newLives = lives - 1;
      setLives(newLives);
      if (newLives <= 0) {
          gameOver = true;
          isWin = false;
      }
    } else {
      isWin = word.split('').every(l => newGuessed.includes(l));
      if (isWin) gameOver = true;
    }

    if (view === 'playing_online_guest') {
        await updateDoc(doc(db, "matches_hangman", roomCode), {
            guessed: newGuessed,
            lives: newLives,
            status: gameOver ? (isWin ? 'won' : 'lost') : 'playing'
        });
    }

    if (gameOver) handleGameOver(isWin);
  };

  const handleGameOver = async (win) => {
    if (win) {
      setView('game_over_won');
      if (view === 'playing_ai') {
          const points = (lives * 100) + (streak * 50);
          setScore(s => s + points);
          setStreak(s => s + 1);
          saveScore(score + points);
      }
    } else {
      setView('game_over_lost');
      if (view === 'playing_ai') setStreak(0);
    }
  };

  const saveScore = async (finalScore) => {
    if (user) {
      try {
        await addDoc(collection(db, "scores_hangman"), {
          uid: user.uid,
          displayName: user.name,
          score: finalScore,
          streak: streak + 1,
          date: serverTimestamp()
        });
        fetchLeaderboard();
      } catch (e) {}
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const q = query(collection(db, "scores_hangman"), orderBy("score", "desc"), limit(5));
      const s = await getDocs(q);
      setLeaderboard(s.docs.map(doc => doc.data()));
    } catch (e) {}
  };

  // --- MONETIZACIÓN ---
  const watchAd = (type) => { setAdState({ active: true, type, timer: 5 }); };
  useEffect(() => {
    let interval = null;
    if (adState.active && adState.timer > 0) interval = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active && adState.timer === 0) { clearInterval(interval); finishAd(); }
    return () => clearInterval(interval);
  }, [adState.active, adState.timer]);

  const finishAd = async () => {
    setAdState(p => ({ ...p, active: false }));
    if (adState.type === 'life') {
      setLives(p => p + 1);
      if (view === 'game_over_lost') setView(view.startsWith('playing_online') ? 'playing_online_guest' : 'playing_ai');
      if (view.startsWith('playing_online')) await updateDoc(doc(db, "matches_hangman", roomCode), { lives: lives + 1, status: 'playing' });
    } 
    else if (adState.type === 'hint') {
      const hidden = word.split('').filter(l => !guessed.includes(l));
      if (hidden.length > 0) handleGuess(hidden[Math.floor(Math.random() * hidden.length)]);
    }
  };

  // --- NAVEGACIÓN INTELIGENTE (VOLVER ATRÁS) ---
  const handleBack = () => {
    if (view === 'menu') {
      // Si estamos en el menú, volvemos a la HOME (Link nativo)
      window.location.href = '/'; 
    } else {
      // Si estamos jugando, volvemos al MENÚ DEL JUEGO
      setView('menu');
      setRoomCode(''); // Limpiar sala si salimos
    }
  };

  // --- RENDERIZADO ---
  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-4 font-mono text-white select-none">
      
      {/* AD MODAL */}
      {adState.active && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-6">
           <Video className="w-16 h-16 text-cyan-400 mb-4 animate-bounce" />
           <h2 className="text-2xl font-black mb-2">PUBLICIDAD</h2>
           <div className="text-4xl font-black text-yellow-400 mb-6">{adState.timer}s</div>
        </div>
      )}

      {/* HEADER: BOTÓN ATRÁS INTELIGENTE */}
      <div className="w-full max-w-md flex justify-between items-center mb-6 z-10">
        
        {view === 'menu' ? (
           <Link href="/" className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:bg-slate-800 transition">
             <ArrowLeft className="w-5 h-5 text-slate-400"/>
           </Link>
        ) : (
           <button onClick={handleBack} className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:bg-slate-800 transition">
             <ArrowLeft className="w-5 h-5 text-slate-400"/>
           </button>
        )}

        <div className="flex gap-4">
           {view === 'playing_ai' && (
               <div className="flex flex-col items-end">
                 <span className="text-[9px] text-slate-500 font-bold uppercase">PUNTOS</span>
                 <span className="text-cyan-400 font-bold">{score}</span>
               </div>
           )}
           {view.includes('online') && (
               <div className="flex items-center gap-2 bg-pink-900/20 px-3 py-1 rounded-full border border-pink-500/30">
                 <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse"></div>
                 <span className="text-[10px] text-pink-400 font-bold">EN VIVO</span>
               </div>
           )}
        </div>
      </div>

      <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-cyan-500 mb-2 text-center tracking-tighter">EL AHORCADO</h1>
      
      {/* VISTA: MENÚ PRINCIPAL */}
      {view === 'menu' && (
        <div className="w-full max-w-md grid gap-4 animate-in zoom-in">
           
           {/* MODO IA */}
           <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition"><Cpu className="w-24 h-24"/></div>
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Cpu className="w-5 h-5 text-cyan-400"/> 1 JUGADOR (IA)</h2>
              <p className="text-xs text-slate-400 mb-4">Elige tema y desafía al sistema.</p>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                 {Object.keys(CATEGORIES).map(cat => (
                     <button key={cat} onClick={() => startAiGame(cat)} className="py-2 bg-slate-800 rounded-lg text-[10px] font-bold hover:bg-cyan-900/50 hover:text-cyan-400 transition border border-slate-700">{cat}</button>
                 ))}
              </div>
           </div>

           {/* MODO ONLINE */}
           <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition"><Users className="w-24 h-24 text-pink-500"/></div>
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2"><Users className="w-5 h-5 text-pink-500"/> 2 JUGADORES</h2>
              <p className="text-xs text-slate-400 mb-4">Crea una sala y reta a un amigo con tu palabra y pista.</p>
              <div className="flex gap-2">
                 <button onClick={() => setView('create_room')} className="flex-1 py-3 bg-pink-600 rounded-xl font-bold text-xs hover:bg-pink-500 shadow-lg shadow-pink-900/20">CREAR SALA</button>
                 <button onClick={() => setView('join_room')} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-700">UNIRSE</button>
              </div>
           </div>
           
           {/* RANKING MINI */}
           {leaderboard.length > 0 && (
             <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2">TOP JUGADORES</h3>
                {leaderboard.slice(0,3).map((s,i) => (
                    <div key={i} className="flex justify-between text-[10px] text-slate-400 border-b border-white/5 py-1"><span>#{i+1} {s.displayName}</span><span className="text-yellow-500">{s.score}</span></div>
                ))}
             </div>
           )}
        </div>
      )}

      {/* VISTA: CREAR SALA (CON PISTA) */}
      {view === 'create_room' && (
         <div className="w-full max-w-md bg-slate-900 p-6 rounded-2xl border border-slate-700 animate-in fade-in">
            <h2 className="text-lg font-bold mb-4 flex gap-2"><Lock className="w-5 h-5 text-pink-500"/> SALA PRIVADA</h2>
            
            <p className="text-xs text-slate-400 mb-2 mt-2">1. PALABRA SECRETA:</p>
            <input 
              type="text" 
              maxLength={12}
              value={customWord}
              onChange={(e) => setCustomWord(e.target.value.toUpperCase().replace(/[^A-ZÑ]/g, ''))}
              placeholder="EJ: ORDENADOR" 
              className="w-full bg-black border border-slate-700 rounded-xl p-3 text-center text-xl font-black text-white mb-2 focus:border-pink-500 outline-none tracking-widest"
            />

            <p className="text-xs text-slate-400 mb-2 mt-4">2. PISTA (Opcional):</p>
            <input 
              type="text" 
              maxLength={20}
              value={customHint}
              onChange={(e) => setCustomHint(e.target.value.toUpperCase())}
              placeholder="EJ: OBJETOS DE OFICINA" 
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-center text-sm font-bold text-cyan-400 mb-6 focus:border-cyan-500 outline-none"
            />

            <button onClick={createRoom} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition">GENERAR CÓDIGO</button>
         </div>
      )}

      {/* VISTA: UNIRSE SALA */}
      {view === 'join_room' && (
         <div className="w-full max-w-md bg-slate-900 p-6 rounded-2xl border border-slate-700 animate-in fade-in">
            <h2 className="text-lg font-bold mb-4 flex gap-2"><Users className="w-5 h-5 text-cyan-400"/> UNIRSE A RETO</h2>
            <p className="text-xs text-slate-400 mb-2">Introduce el código de tu amigo:</p>
            <input 
              type="number" 
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="0000" 
              className="w-full bg-black border border-slate-700 rounded-xl p-4 text-center text-4xl font-black text-cyan-400 mb-4 focus:border-cyan-500 outline-none tracking-[1em]"
            />
            <button onClick={joinRoom} className="w-full py-4 bg-cyan-600 text-white font-black rounded-xl hover:scale-105 transition">ENTRAR</button>
         </div>
      )}

      {/* VISTA: JUGANDO */}
      {(view.startsWith('playing') || view.startsWith('game_over')) && (
        <div className="w-full max-w-md flex flex-col items-center animate-in zoom-in w-full">
           
           {/* HEADER HOST */}
           {view === 'playing_online_host' && (
              <div className="mb-4 bg-yellow-500/10 text-yellow-500 px-4 py-2 rounded-lg border border-yellow-500/30 text-center w-full">
                  <p className="text-[10px] font-bold uppercase mb-1">CÓDIGO DE SALA</p>
                  <p className="text-3xl font-black tracking-widest bg-black/50 rounded py-1 mb-2 select-text">{roomCode}</p>
                  <div className="flex items-center justify-center gap-2 text-xs">
                      <Eye className="w-4 h-4"/> ESPECTADOR: {opponentName}
                  </div>
              </div>
           )}

           {/* PISTA / CATEGORÍA */}
           <div className="bg-slate-800/50 px-4 py-1 rounded-full border border-slate-700 mb-6 flex items-center gap-2">
              <Lightbulb className="w-3 h-3 text-yellow-400" />
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">{category}</span>
           </div>

           {/* VIDAS */}
           <div className="flex gap-2 mb-6">
            {[1,2,3,4,5].map(i => {
               if (i > lives) return <Heart key={i} className="w-6 h-6 text-slate-800 fill-slate-800" />;
               return <Heart key={i} className="w-6 h-6 text-pink-500 fill-pink-500 drop-shadow-[0_0_8px_#ec4899] animate-pulse" />;
            })}
            {(view === 'playing_ai' || view === 'playing_online_guest') && (
                <button onClick={() => watchAd('life')} className="ml-2 px-2 py-0.5 bg-slate-800 rounded text-[9px] text-green-400 border border-green-500/30 flex items-center gap-1 hover:bg-slate-700 transition"><Play className="w-2 h-2 fill-current" /> +VIDA</button>
            )}
           </div>

           {/* PALABRA */}
           <div className="flex flex-wrap justify-center gap-2 mb-8 min-h-[40px] px-2 w-full">
            {word.split('').map((letter, i) => (
              <div key={i} className={`
                w-8 h-10 sm:w-10 sm:h-12 border-b-4 flex items-center justify-center text-xl sm:text-2xl font-black transition-all
                ${guessed.includes(letter) ? 'border-cyan-500 text-white drop-shadow-[0_0_10px_#22d3ee] animate-in zoom-in' : 'border-slate-700 text-transparent'}
                ${(view === 'game_over_lost' || view === 'playing_online_host') && !guessed.includes(letter) ? 'text-slate-600 border-slate-800' : ''}
              `}>
                {guessed.includes(letter) || view.startsWith('game_over') || view === 'playing_online_host' ? letter : ''}
              </div>
            ))}
           </div>

           {/* TECLADO */}
           <div className="flex flex-wrap justify-center gap-1.5 w-full">
              {ALPHABET.map((char) => {
                const isGuessed = guessed.includes(char);
                let btnClass = "bg-slate-800 text-slate-300 border-slate-700";
                if (isGuessed) {
                   if (word.includes(char)) btnClass = "bg-cyan-900/50 text-cyan-500 border-cyan-500/50 opacity-50";
                   else btnClass = "bg-red-900/30 text-red-500 border-red-500/30 opacity-30";
                }
                if (view === 'playing_online_host') btnClass += " opacity-50 cursor-not-allowed";

                return (
                  <button key={char} disabled={isGuessed || view === 'playing_online_host' || view.startsWith('game_over')} onClick={() => handleGuess(char)} className={`w-8 h-10 sm:w-10 sm:h-12 rounded-lg border font-bold text-sm sm:text-base transition-all active:scale-95 ${btnClass}`}>{char}</button>
                )
              })}
           </div>

           {/* MODAL GAME OVER */}
           {view.startsWith('game_over') && (
             <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl flex flex-col items-center w-full max-w-sm">
                   {view === 'game_over_won' ? <Trophy className="w-16 h-16 text-yellow-400 mb-2 animate-bounce"/> : <Lock className="w-16 h-16 text-red-500 mb-2"/>}
                   <h2 className="text-2xl font-black text-white mb-2">{view === 'game_over_won' ? '¡VICTORIA!' : 'DERROTA'}</h2>
                   <p className="text-slate-400 mb-6 text-sm">Palabra: <span className="text-white font-bold">{word}</span></p>
                   
                   <div className="flex gap-2 w-full">
                      <button onClick={() => setView('menu')} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs">MENÚ</button>
                      {view === 'game_over_lost' && <button onClick={() => watchAd('life')} className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2"><Play className="w-3 h-3 fill-current"/> REVIVIR</button>}
                   </div>
                </div>
             </div>
           )}
        </div>
      )}

      <div className="mt-auto w-full max-w-md pt-4 opacity-75"><AdSpace type="banner" /><GameChat gameId="global_hangman" gameName="AHORCADO" /></div>
    </div>
  );
}