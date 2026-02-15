// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Heart, Play, Trophy, RefreshCw, Lock, Video, 
  Users, Cpu, Eye, Lightbulb, ShieldAlert, Coins, Skull, Zap, 
  Wifi, Keyboard, CheckCircle2, AlertTriangle, Key
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, doc, setDoc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- BASE DE DATOS ---
const CATEGORIES = {
  "TECNOLOGIA": ["PYTHON", "REACT", "FIREBASE", "SERVIDOR", "HACKER", "ROBOT", "CIBERNETICA", "ALGORITMO", "DATOS", "WIFI", "BINARIO", "SATELLITE", "INTELIGENCIA", "HARDWARE", "SOFTWARE"],
  "CINE": ["AVATAR", "TITANIC", "MATRIX", "ALIEN", "ROCKY", "GLADIADOR", "BATMAN", "JOKER", "STARWARS", "SHREK", "TERMINATOR", "GODZILLA", "FROZEN", "SPIDERMAN", "INCEPTION"],
  "DEPORTES": ["FUTBOL", "TENIS", "BOXEO", "KARATE", "NATACION", "GOLF", "RUGBY", "MESSI", "JORDAN", "ESTADIO", "OLIMPIADAS", "BALONCESTO", "ATLETISMO", "CICLISMO", "SURF"],
  "NATURALEZA": ["AGUILA", "TIBURON", "LEON", "PANTERA", "LOBO", "COBRA", "GORILA", "TIGRE", "HALCON", "DRAGON", "BALLENA", "DELFIN", "ELEFANTE", "JIRAFA", "PINGUINO"],
  "CIENCIA": ["ATOMO", "CELULA", "GRAVEDAD", "QUIMICA", "FISICA", "GALAXIA", "PLANETA", "MICROSCOPIO", "ADN", "EINSTEIN", "ROBOTICA", "ENERGIA", "FOSIL", "VOLCAN", "MAGNETISMO"],
  "HISTORIA": ["ROMA", "EGIPTO", "PIRAMIDE", "VIKINGO", "SAMURAI", "IMPERIO", "GUERRA", "NAPOLEON", "COLON", "AZTECA", "MAYA", "CASTILLO", "REVOLUCION", "FARAON", "CABALLERO"]
};

const ALPHABET = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split('');
const MAX_LIVES = 6; // Aumentado para dar juego visual

export default function HangmanPro() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);

  // ESTADOS
  const [view, setView] = useState('menu'); 
  const [word, setWord] = useState('');
  const [guessed, setGuessed] = useState([]);
  const [lives, setLives] = useState(MAX_LIVES);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0); 
  const [category, setCategory] = useState('SISTEMA');

  // MULTIJUGADOR
  const [roomCode, setRoomCode] = useState('');
  const [customWord, setCustomWord] = useState('');
  const [customHint, setCustomHint] = useState('');
  const [opponentName, setOpponentName] = useState('Esperando...');
  
  // APUESTAS
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  
  const [leaderboard, setLeaderboard] = useState([]);
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 }); 

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ? { uid: u.uid, name: u.displayName || 'Hacker' } : null));
    fetchLeaderboard();
    return () => unsub();
  }, []);

  // --- ONLINE SYNC (CON FIX DE ESTABILIDAD) ---
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
                if (view === 'playing_online_guest') {
                    setCategory(data.hint || 'SALA PRIVADA');
                    // Sincronizar estado final
                    if(data.status === 'won') handleGameOver(true);
                    if(data.status === 'lost') handleGameOver(false);
                }
            }
        });
        
        // FIX: Micro-retraso para evitar crash de Firebase al desmontar
        return () => {
            setTimeout(() => {
                if (unsubscribe && typeof unsubscribe === 'function') unsubscribe();
            }, 0);
        };
    }
  }, [view, roomCode]);

  // --- JUEGO IA ---
  const startAiGame = (cat) => {
    const pool = CATEGORIES[cat];
    const randomWord = pool[Math.floor(Math.random() * pool.length)];
    setWord(randomWord);
    setCategory(cat);
    setGuessed([]);
    setLives(MAX_LIVES); 
    setView('playing_ai');
    playSound('start');
  };

  // --- ONLINE ---
  const createRoom = async () => {
    if (!user) return alert("Inicia sesión");
    if (!customWord || customWord.length < 3) return alert("Palabra muy corta");
    if (betType === 'money' && coins < betAmount) return alert("Fondos insuficientes");
    
    if (betType === 'money') await spendCoins(betAmount, "Apuesta Ahorcado");

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const hintToSend = customHint.trim().toUpperCase() || "SIN PISTA";

    await setDoc(doc(db, "matches_hangman", code), {
        host: user.name,
        word: customWord.toUpperCase(),
        hint: hintToSend,
        guessed: [],
        lives: MAX_LIVES,
        status: 'waiting',
        bet: { type: betType, amount: betAmount },
        createdAt: serverTimestamp()
    });
    
    setWord(customWord.toUpperCase());
    setCategory(hintToSend);
    setRoomCode(code);
    setGuessed([]);
    setLives(MAX_LIVES);
    setView('playing_online_host');
  };

  const joinRoom = async (inputCode) => {
    if (!user) return alert("Inicia sesión");
    const roomRef = doc(db, "matches_hangman", inputCode || roomCode);
    const roomSnap = await getDoc(roomRef);
    
    if (!roomSnap.exists()) return alert("Sala no encontrada");
    const data = roomSnap.data();
    
    if (data.bet?.type === 'money') {
        if (coins < data.bet.amount) return alert("Fondos insuficientes para esta apuesta");
        await spendCoins(data.bet.amount, "Apuesta Ahorcado");
    }
    
    await updateDoc(roomRef, {
        guest: user.uid,
        guestName: user.name,
        status: 'playing'
    });

    setWord(data.word);
    setCategory(data.hint || 'SALA PRIVADA');
    setGuessed(data.guessed || []);
    setLives(data.lives);
    setRoomCode(inputCode || roomCode);
    setView('playing_online_guest');
  };

  // --- LÓGICA CORE ---
  const handleGuess = async (letter) => {
    if (view === 'playing_online_host' || view.startsWith('game_over')) return;
    if (guessed.includes(letter)) return;

    const newGuessed = [...guessed, letter];
    setGuessed(newGuessed);

    let newLives = lives;
    let isGameOver = false;
    let isWin = false;

    if (!word.includes(letter)) {
      newLives = lives - 1;
      setLives(newLives);
      playSound('error');
      if (newLives <= 0) { isGameOver = true; isWin = false; }
    } else {
      playSound('click');
      isWin = word.split('').every(l => newGuessed.includes(l));
      if (isWin) isGameOver = true;
    }

    if (view === 'playing_online_guest') {
        await updateDoc(doc(db, "matches_hangman", roomCode), {
            guessed: newGuessed,
            lives: newLives,
            status: isGameOver ? (isWin ? 'won' : 'lost') : 'playing'
        });
    }

    if (isGameOver) handleGameOver(isWin);
  };

  const handleGameOver = async (win) => {
    if (win) {
      playSound('win');
      setView('game_over_won');
      if (view === 'playing_ai') {
          const points = (lives * 100) + (streak * 50);
          setScore(s => s + points);
          setStreak(s => s + 1);
          saveScore(score + points);
      } else if (view === 'playing_online_guest') {
          const roomRef = doc(db, "matches_hangman", roomCode);
          const snap = await getDoc(roomRef);
          const data = snap.data();
          if (data.bet?.type === 'money') addCoins(data.bet.amount * 2, "Victoria Ahorcado");
      }
    } else {
      playSound('lose');
      setView('game_over_lost');
      if (view === 'playing_ai') setStreak(0);
    }
  };

  const saveScore = async (s) => {
    if (user) {
      await addDoc(collection(db, "scores_hangman"), { uid: user.uid, displayName: user.name, score: s, streak: streak + 1, date: serverTimestamp() });
      fetchLeaderboard();
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const q = query(collection(db, "scores_hangman"), orderBy("score", "desc"), limit(5));
      const s = await getDocs(q);
      setLeaderboard(s.docs.map(doc => doc.data()));
    } catch (e) {}
  };

  // --- AD SYSTEM ---
  const watchAd = (type) => { setAdState({ active: true, type, timer: 5 }); };
  useEffect(() => {
    let interval = null;
    if (adState.active && adState.timer > 0) interval = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active && adState.timer === 0) { clearInterval(interval); finishAd(); }
    return () => clearInterval(interval);
  }, [adState.active, adState.timer]);

  const finishAd = async () => {
    setAdState(p => ({ ...p, active: false }));
    playSound('powerup');
    if (adState.type === 'life') {
      setLives(p => Math.min(p + 2, MAX_LIVES));
      if (view === 'game_over_lost') setView(view.startsWith('playing_online') ? 'playing_online_guest' : 'playing_ai');
      if (view.startsWith('playing_online')) await updateDoc(doc(db, "matches_hangman", roomCode), { lives: lives + 2, status: 'playing' });
    } else if (adState.type === 'hint') {
      const hidden = word.split('').filter(l => !guessed.includes(l));
      if (hidden.length > 0) handleGuess(hidden[Math.floor(Math.random() * hidden.length)]);
    }
  };

  const handleBack = () => { if (view === 'menu') window.location.href = '/'; else { setView('menu'); setRoomCode(''); } };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-2 font-mono text-white select-none overflow-hidden relative">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#020617] to-black"></div>
      
      {adState.active && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center backdrop-blur-xl">
           <Video className="w-20 h-20 text-cyan-400 mb-6 animate-bounce" />
           <h2 className="text-2xl font-black mb-2 tracking-widest">TRANSMISIÓN SEGURA</h2>
           <div className="text-5xl font-black text-white mb-8">{adState.timer}s</div>
           <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-cyan-500 transition-all duration-1000" style={{width: `${(5-adState.timer)*20}%`}}></div></div>
        </div>
      )}

      {/* HEADER */}
      <div className="w-full max-w-2xl flex justify-between items-center mb-6 z-10 mt-4 px-2">
        <button onClick={handleBack} className="p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-cyan-500 transition shadow-lg"><ArrowLeft className="w-5 h-5 text-slate-400"/></button>
        <div className="text-center">
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-cyan-500 tracking-tighter italic">AHORCADO</h1>
            <p className="text-[10px] text-cyan-500/50 font-bold tracking-[0.5em] uppercase">SYSTEM HACK</p>
        </div>
        <div className="bg-slate-900/90 px-3 py-1.5 rounded-full border border-yellow-500/30 flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center shadow-md"><Coins className="w-3 h-3 text-black fill-current" /></div>
            <span className="text-xs font-black text-yellow-400 tabular-nums">{coins.toLocaleString()}</span>
        </div>
      </div>

      {view === 'menu' ? (
        <div className="w-full max-w-md grid gap-6 animate-in zoom-in z-10 px-2 mt-4 flex-grow overflow-y-auto no-scrollbar pb-4">
           
           {/* IA MODE */}
           <div className="bg-slate-900/80 p-6 rounded-[2rem] border border-slate-700 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
              <h2 className="text-sm font-bold text-cyan-400 mb-4 flex gap-2 tracking-widest items-center uppercase"><Cpu className="w-4 h-4"/> Hackear Sistema (IA)</h2>
              <div className="grid grid-cols-2 gap-2">
                 {Object.keys(CATEGORIES).map(cat => (
                     <button key={cat} onClick={() => startAiGame(cat)} className="py-3 bg-slate-950 hover:bg-cyan-900/40 text-slate-400 hover:text-cyan-300 rounded-xl text-[10px] font-bold border border-slate-800 hover:border-cyan-500/50 transition-all active:scale-95">{cat}</button>
                 ))}
              </div>
           </div>

           {/* ONLINE MODE */}
           <div className="bg-slate-900/80 p-6 rounded-[2rem] border border-slate-700 shadow-2xl relative overflow-hidden">
              <h2 className="text-sm font-bold text-pink-400 mb-4 flex gap-2 tracking-widest items-center uppercase"><Users className="w-4 h-4"/> Duelo Privado</h2>
              <div className="flex gap-2">
                 <button onClick={() => setView('create_room')} className="flex-1 py-4 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 rounded-xl font-black text-xs text-white shadow-lg shadow-pink-900/20 active:scale-95 transition-all">CREAR SALA</button>
                 <button onClick={() => setView('join_room')} className="flex-1 py-4 bg-slate-950 border border-slate-700 hover:border-pink-500 rounded-xl font-bold text-xs text-slate-300 active:scale-95 transition-all">UNIRSE</button>
              </div>
           </div>
           
           {/* RANKING */}
           {leaderboard.length > 0 && (
             <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex items-center justify-center gap-2"><Trophy className="w-3 h-3 text-yellow-500"/> Top Hackers</h3>
                {leaderboard.slice(0,3).map((s,i) => (
                    <div key={i} className="flex justify-between text-[10px] text-slate-400 border-b border-white/5 py-1.5 last:border-0"><span>#{i+1} {s.displayName}</span><span className="text-yellow-500 font-mono">{s.score}</span></div>
                ))}
             </div>
           )}
        </div>
      ) : (view === 'create_room' || view === 'join_room') ? (
         <div className="w-full max-w-md bg-slate-900/90 p-8 rounded-[2rem] border border-slate-700 animate-in zoom-in mt-10 shadow-2xl">
            <h2 className="text-lg font-black mb-6 flex gap-2 uppercase tracking-widest text-white"><Lock className="w-5 h-5 text-pink-500"/> {view === 'create_room' ? 'CONFIGURAR SALA' : 'ACCESO REMOTO'}</h2>
            
            {view === 'create_room' ? (
                <>
                    <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Palabra Clave</label>
                        <input type="text" maxLength={12} value={customWord} onChange={(e) => setCustomWord(e.target.value.toUpperCase().replace(/[^A-ZÑ]/g, ''))} placeholder="SECRET" className="w-full bg-black border border-slate-700 rounded-xl p-3 text-center text-lg font-mono font-bold text-white focus:border-pink-500 outline-none tracking-widest uppercase"/>
                    </div>
                    <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Pista (Opcional)</label>
                        <input type="text" maxLength={20} value={customHint} onChange={(e) => setCustomHint(e.target.value.toUpperCase())} placeholder="EJ: ANIMAL" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-center text-xs font-bold text-cyan-400 focus:border-cyan-500 outline-none"/>
                    </div>
                    <div className="mb-6">
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Apuesta (Monedas)</label>
                        <input type="number" value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-center text-sm font-bold text-yellow-400 focus:border-yellow-500 outline-none"/>
                    </div>
                    <button onClick={createRoom} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition shadow-lg text-sm">GENERAR CÓDIGO</button>
                </>
            ) : (
                <>
                    <input type="number" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="0000" className="w-full bg-black border border-slate-700 rounded-xl p-6 text-center text-4xl font-black text-cyan-400 mb-6 focus:border-cyan-500 outline-none tracking-[0.2em]"/>
                    <button onClick={() => joinRoom()} className="w-full py-4 bg-cyan-600 text-white font-black rounded-xl hover:scale-105 transition shadow-lg shadow-cyan-900/20 text-sm">INICIAR HACKEO</button>
                </>
            )}
         </div>
      ) : (
        <div className="w-full max-w-xl flex flex-col items-center animate-in zoom-in w-full flex-grow relative pb-4">
           
           {/* ONLINE HOST WAITING UI */}
           {view === 'playing_online_host' && (
              <div className="absolute inset-0 z-20 bg-slate-900/95 flex flex-col items-center justify-center p-8 text-center backdrop-blur-md rounded-xl border border-slate-700">
                  <div className="bg-yellow-500/10 text-yellow-500 px-6 py-3 rounded-xl border border-yellow-500/30 mb-6">
                      <p className="text-[10px] font-bold uppercase mb-2 tracking-widest">CÓDIGO DE ACCESO</p>
                      <p className="text-5xl font-black tracking-widest select-text">{roomCode}</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm font-bold text-slate-300 animate-pulse">
                      <Eye className="w-5 h-5 text-cyan-400"/> {opponentName}
                  </div>
                  <p className="mt-8 text-xs text-slate-500 max-w-xs">Comparte el código. El juego comenzará cuando el rival se conecte.</p>
              </div>
           )}

           {/* BARRA INTEGRIDAD (VIDAS) */}
           <div className="w-full max-w-md mb-6 px-4">
                <div className="flex justify-between items-end mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex gap-2"><ShieldAlert className="w-3 h-3"/> INTEGRIDAD DEL SISTEMA</span>
                    <span className={`text-xs font-black ${lives < 3 ? 'text-red-500' : 'text-emerald-400'}`}>{Math.round((lives/MAX_LIVES)*100)}%</span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div className={`h-full transition-all duration-500 ${lives > 3 ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : lives > 1 ? 'bg-yellow-500 shadow-[0_0_10px_#eab308]' : 'bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse'}`} style={{ width: `${(lives/MAX_LIVES)*100}%` }}></div>
                </div>
           </div>

           {/* PISTA */}
           <div className="bg-slate-900/80 px-6 py-2 rounded-full border border-slate-700 mb-8 flex items-center gap-2 shadow-lg">
              <Zap className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">{category}</span>
           </div>

           {/* PALABRA (CAJAS DE CÓDIGO) */}
           <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-10 min-h-[60px] px-2 w-full max-w-2xl">
            {word.split('').map((letter, i) => (
              <div key={i} className={`
                w-10 h-12 sm:w-12 sm:h-14 rounded-lg flex items-center justify-center text-2xl sm:text-3xl font-black transition-all duration-300 border-2
                ${guessed.includes(letter) 
                    ? 'bg-cyan-900/20 border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)] scale-105' 
                    : 'bg-slate-900 border-slate-800 text-transparent'}
                ${(view === 'game_over_lost') && !guessed.includes(letter) ? 'text-red-500 border-red-900/50 opacity-60' : ''}
              `}>
                {guessed.includes(letter) || view.startsWith('game_over') ? letter : ''}
              </div>
            ))}
           </div>

           {/* TECLADO QWERTY */}
           <div className="w-full max-w-2xl px-2">
              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                  {ALPHABET.map((char) => {
                    const isGuessed = guessed.includes(char);
                    let btnClass = "bg-slate-800 text-slate-400 border-b-4 border-slate-950"; // Default
                    
                    if (isGuessed) {
                       if (word.includes(char)) btnClass = "bg-emerald-600/20 text-emerald-500 border-emerald-900/50 border-b-0 translate-y-1 shadow-[inset_0_0_10px_rgba(16,185,129,0.2)]"; // Correcto
                       else btnClass = "bg-slate-900 text-slate-700 border-slate-800 border-b-0 translate-y-1 opacity-50"; // Incorrecto
                    } else {
                        btnClass += " hover:bg-slate-700 hover:text-white active:border-b-0 active:translate-y-1 transition-all";
                    }

                    return (
                      <button 
                        key={char} 
                        disabled={isGuessed || view.startsWith('game_over')} 
                        onClick={() => handleGuess(char)} 
                        className={`w-8 h-10 sm:w-10 sm:h-12 rounded-lg font-black text-sm sm:text-base ${btnClass}`}
                      >
                        {char}
                      </button>
                    )
                  })}
              </div>
           </div>

           {/* BOTÓN PISTA (SOLO GUEST O IA) */}
           {(!view.includes('host') && !view.startsWith('game_over')) && (
               <div className="mt-8">
                   <button onClick={() => watchAd('hint')} className="px-6 py-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-yellow-500/20 transition flex items-center gap-2">
                       <Lightbulb className="w-3 h-3"/> Revelar Letra (Video)
                   </button>
               </div>
           )}

           {/* MODAL GAME OVER */}
           {view.startsWith('game_over') && (
             <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in zoom-in duration-300">
                <div className={`p-8 rounded-[2rem] border-2 shadow-2xl flex flex-col items-center w-full max-w-sm relative overflow-hidden ${view === 'game_over_won' ? 'border-emerald-500 bg-emerald-950/20' : 'border-red-600 bg-red-950/20'}`}>
                   {/* Background Glow */}
                   <div className={`absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] ${view === 'game_over_won' ? 'from-emerald-500' : 'from-red-600'} to-transparent scale-150`}></div>
                   
                   {view === 'game_over_won' ? <CheckCircle2 className="w-20 h-20 text-emerald-400 mb-4 animate-bounce relative z-10"/> : <Skull className="w-20 h-20 text-red-500 mb-4 relative z-10"/>}
                   
                   <h2 className="text-4xl font-black text-white mb-2 italic tracking-tighter relative z-10">{view === 'game_over_won' ? 'ACCESO CONCEDIDO' : 'ACCESO DENEGADO'}</h2>
                   
                   <div className="bg-black/40 px-6 py-3 rounded-xl border border-white/10 mb-8 relative z-10 text-center">
                       <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">PASSWORD</p>
                       <p className="text-2xl font-mono font-black text-white tracking-widest">{word}</p>
                   </div>
                   
                   <div className="flex gap-3 w-full relative z-10">
                      <button onClick={() => setView('menu')} className="flex-1 py-4 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition text-xs">MENÚ</button>
                      {view === 'game_over_lost' && view === 'playing_ai' && <button onClick={() => watchAd('life')} className="flex-1 py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/50"><Video className="w-4 h-4"/> REINTENTAR</button>}
                   </div>
                </div>
             </div>
           )}
        </div>
      )}

      <div className="mt-auto w-full max-w-md pt-4 opacity-75 relative z-10"><AdSpace type="banner" /><GameChat gameId={roomCode || "global_hangman"} gameName="AHORCADO" /></div>
    </div>
  );
}