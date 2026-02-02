// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Cpu, Users, Loader2, Trophy, Swords, Zap, RefreshCw, Copy, Share2, AlertCircle, Globe } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp, collection, query, where, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat'; // <--- CHAT IMPORTADO

// --- UTILIDADES ---
const generateGameId = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const CHOICES = [
  { id: 'rock', emoji: '🪨', name: 'PIEDRA', beats: 'scissors' },
  { id: 'paper', emoji: '📄', name: 'PAPEL', beats: 'rock' },
  { id: 'scissors', emoji: '✂️', name: 'TIJERA', beats: 'paper' }
];

export default function PiedraPapelTijera() {
  const [mode, setMode] = useState('menu'); 
  const [user, setUser] = useState(null);
  
  // Juego
  const [myChoice, setMyChoice] = useState(null);
  const [opponentChoice, setOpponentChoice] = useState(null);
  const [result, setResult] = useState(null);
  const [score, setScore] = useState({ me: 0, opponent: 0 });
  const [round, setRound] = useState(1);
  const [isRevealing, setIsRevealing] = useState(false);

  // Online
  const [gameId, setGameId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [onlineData, setOnlineData] = useState(null);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false); // Nuevo estado para búsqueda

  // 1. Detectar usuario
  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
  }, []);

  // 2. Escuchar Firebase
  useEffect(() => {
    if (mode !== 'online' || !gameId) return;

    const unsubscribe = onSnapshot(doc(db, "matches_rps", gameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOnlineData(data);
        handleOnlineUpdate(data);
      }
    });
    return () => unsubscribe();
  }, [gameId, mode]);

  // --- LÓGICA MATCHMAKING (PASO 3) ---
  const findPublicMatch = async () => {
    if (!user) return setError("Inicia sesión primero.");
    setError('');
    setIsSearching(true);
    setStatusText('BUSCANDO SALA PÚBLICA...');

    try {
      // 1. Buscar una sala que esté esperando ('waiting') y sea pública
      const q = query(
        collection(db, "matches_rps"), 
        where("status", "==", "waiting"),
        where("public", "==", true),
        limit(1)
      );
      
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // --- ¡ENCONTRADA! UNIRSE ---
        const matchDoc = snapshot.docs[0];
        const matchId = matchDoc.id;
        
        // Evitar unirse a una sala creada por uno mismo (bug fix)
        if (matchDoc.data().host.uid === user.uid) {
           // Si soy yo mismo, solo entro a la sala esperando
           setGameId(matchId);
           setMode('online');
           setIsSearching(false);
           return;
        }

        await updateDoc(doc(db, "matches_rps", matchId), {
          guest: { ...user, choice: null, score: 0 },
          status: 'playing',
          public: false // Ya no es pública, está llena
        });
        
        setGameId(matchId);
        setMode('online');
      } else {
        // --- NO HAY SALAS: CREAR UNA NUEVA ---
        const newId = generateGameId();
        await setDoc(doc(db, "matches_rps", newId), {
          host: { ...user, choice: null, score: 0 },
          guest: null,
          round: 1,
          status: 'waiting',
          public: true, // <--- LA CLAVE: Marcada como pública
          createdAt: serverTimestamp()
        });
        setGameId(newId);
        setMode('online');
      }
    } catch (e) {
      console.error(e);
      setError("Error al buscar. Inténtalo de nuevo.");
    } finally {
      setIsSearching(false);
    }
  };

  // --- RESTO DE LÓGICA ---
  const playCpu = (choiceId) => {
    setMyChoice(choiceId);
    setOpponentChoice(null);
    setResult(null);
    setIsRevealing(true);
    setTimeout(() => {
      const randomChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
      setOpponentChoice(randomChoice.id);
      resolveRound(choiceId, randomChoice.id);
      setIsRevealing(false);
    }, 1000);
  };

  const createPrivateMatch = async () => {
    if (!user) return setError("Inicia sesión.");
    const newId = generateGameId();
    await setDoc(doc(db, "matches_rps", newId), {
      host: { ...user, choice: null, score: 0 },
      guest: null,
      round: 1,
      status: 'waiting',
      public: false, // Privada
      createdAt: serverTimestamp()
    });
    setGameId(newId);
    setMode('online');
    setStatusText('ESPERANDO AMIGO...');
  };

  const joinPrivateMatch = async () => {
    if (!user) return setError("Inicia sesión.");
    if (!joinId) return setError("Código inválido.");
    const ref = doc(db, "matches_rps", joinId.toUpperCase());
    const snap = await getDoc(ref);
    if (!snap.exists()) return setError("Sala no encontrada.");
    await updateDoc(ref, { guest: { ...user, choice: null, score: 0 }, status: 'playing' });
    setGameId(joinId.toUpperCase());
    setMode('online');
  };

  const playOnline = async (choiceId) => {
    if (!onlineData) return;
    setMyChoice(choiceId);
    setStatusText('ESPERANDO AL RIVAL...');
    const isHost = user.uid === onlineData.host.uid;
    const updateField = isHost ? 'host.choice' : 'guest.choice';
    await updateDoc(doc(db, "matches_rps", gameId), { [updateField]: choiceId });
  };

  const handleOnlineUpdate = (data) => {
    if (data.host.choice && data.guest.choice && data.status !== 'revealed') {
      setIsRevealing(true);
      setTimeout(() => {
         const isHost = user.uid === data.host.uid;
         const myMove = isHost ? data.host.choice : data.guest.choice;
         const oppMove = isHost ? data.guest.choice : data.host.choice;
         setMyChoice(myMove);
         setOpponentChoice(oppMove);
         resolveRound(myMove, oppMove);
         setIsRevealing(false);
         if (isHost) updateDoc(doc(db, "matches_rps", gameId), { status: 'revealed' });
      }, 1500);
    }
    if (data.status === 'playing' && (!data.host.choice && !data.guest.choice)) {
      setResult(null);
      setMyChoice(null);
      setOpponentChoice(null);
    }
  };

  const nextRoundOnline = async () => {
    if (onlineData && user.uid === onlineData.host.uid) {
      await updateDoc(doc(db, "matches_rps", gameId), {
        'host.choice': null, 'guest.choice': null, status: 'playing', round: onlineData.round + 1
      });
    } else {
      setStatusText('ESPERANDO AL ANFITRIÓN...');
    }
  };

  const resolveRound = (me, opp) => {
    if (me === opp) {
      setResult('draw');
    } else {
      const myMove = CHOICES.find(c => c.id === me);
      if (myMove.beats === opp) {
        setResult('win');
        setScore(s => ({ ...s, me: s.me + 1 }));
      } else {
        setResult('lose');
        setScore(s => ({ ...s, opponent: s.opponent + 1 }));
      }
    }
  };

  const resetCpuGame = () => {
    setScore({ me: 0, opponent: 0 });
    setRound(1);
    setMyChoice(null);
    setOpponentChoice(null);
    setResult(null);
  };

  // --- RENDERIZADO ---

  if (mode === 'menu') {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 font-mono text-white">
        <Link href="/" className="absolute top-6 left-6 p-3 bg-slate-800 rounded-full hover:bg-slate-700 transition border border-slate-600"><ArrowLeft className="w-6 h-6" /></Link>
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-600 mb-2 text-center">PIEDRA PAPEL TIJERA</h1>
        <p className="text-slate-500 text-xs tracking-[0.3em] uppercase mb-12">Elige tu destino</p>
        <div className="grid gap-4 w-full max-w-sm">
          <button onClick={() => setMode('cpu')} className="group relative p-6 bg-slate-900 border border-slate-700 rounded-2xl hover:border-pink-500 transition-all overflow-hidden">
            <div className="absolute inset-0 bg-pink-500/10 translate-y-full group-hover:translate-y-0 transition-transform"></div>
            <div className="relative flex items-center justify-between"><span className="font-bold text-xl flex items-center gap-3"><Cpu /> VS IA</span><span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">ENTRENAMIENTO</span></div>
          </button>
          <button onClick={() => setMode('lobby')} className="group relative p-6 bg-slate-900 border border-slate-700 rounded-2xl hover:border-purple-500 transition-all overflow-hidden">
            <div className="absolute inset-0 bg-purple-500/10 translate-y-full group-hover:translate-y-0 transition-transform"></div>
            <div className="relative flex items-center justify-between"><span className="font-bold text-xl flex items-center gap-3"><Users /> VS RIVAL</span><span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">ONLINE</span></div>
          </button>
        </div>
        <div className="mt-12 w-full max-w-sm"><AdSpace type="banner" /></div>
      </div>
    );
  }

  // --- LOBBY CON MATCHMAKING ---
  if (mode === 'lobby') {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 font-mono text-white">
        <button onClick={() => setMode('menu')} className="absolute top-6 left-6 p-3 bg-slate-800 rounded-full hover:bg-slate-700 transition"><ArrowLeft className="w-6 h-6" /></button>
        
        <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-700 w-full max-w-md backdrop-blur-md">
          <h2 className="text-2xl font-bold mb-6 text-center text-purple-400">ZONA DE COMBATE</h2>
          
          {/* BOTÓN GRANDE: BUSCAR RIVAL (MATCHMAKING) */}
          <button onClick={findPublicMatch} disabled={isSearching} className="w-full py-6 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-black text-xl mb-8 flex justify-center gap-3 items-center hover:scale-105 transition shadow-[0_0_20px_rgba(168,85,247,0.4)] disabled:opacity-50 disabled:scale-100">
            {isSearching ? <Loader2 className="animate-spin" /> : <Globe className="w-6 h-6" />}
            {isSearching ? 'BUSCANDO...' : 'BUSCAR RIVAL'}
          </button>

          <div className="flex items-center gap-4 text-xs text-slate-600 mb-8"><div className="h-[1px] bg-slate-800 flex-1"></div>O JUGAR CON AMIGO<div className="h-[1px] bg-slate-800 flex-1"></div></div>

          <div className="flex gap-2 mb-4">
            <button onClick={createPrivateMatch} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-slate-700"><Zap className="w-3 h-3"/> CREAR SALA</button>
          </div>

          <div className="flex gap-2">
            <input type="text" placeholder="CÓDIGO" value={joinId} onChange={(e) => setJoinId(e.target.value.toUpperCase())} className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 text-center font-bold text-lg uppercase focus:border-purple-500 outline-none" />
            <button onClick={joinPrivateMatch} className="px-6 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold">UNIRSE</button>
          </div>
          {error && <p className="text-red-400 text-xs mt-4 text-center flex items-center justify-center gap-2"><AlertCircle className="w-3 h-3"/> {error}</p>}
        </div>
      </div>
    );
  }

  // JUEGO ONLINE / CPU
  const isOnlineWaiting = mode === 'online' && onlineData?.status === 'waiting';
  
  if (isOnlineWaiting) {
     return (
       <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 font-mono text-white">
         <div className="text-center animate-in zoom-in">
           <Loader2 className="w-16 h-16 text-purple-500 animate-spin mx-auto mb-6" />
           <h2 className="text-3xl font-bold mb-2">BUSCANDO RIVAL...</h2>
           {onlineData?.public ? (
             <p className="text-slate-400 text-sm animate-pulse">Buscando jugadores en la red global...</p>
           ) : (
             <div onClick={() => {navigator.clipboard.writeText(gameId); alert("Copiado!")}} className="mt-4 p-4 bg-slate-900 border border-purple-500/50 rounded-xl cursor-pointer hover:bg-purple-500/10 transition">
               <span className="text-4xl font-black tracking-widest text-purple-400">{gameId}</span>
               <p className="text-[10px] text-slate-500 mt-2 uppercase flex justify-center gap-2"><Copy className="w-3 h-3"/> Comparte este código</p>
             </div>
           )}
           <button onClick={() => setMode('lobby')} className="mt-8 text-slate-500 text-xs hover:text-white underline">CANCELAR</button>
         </div>
       </div>
     );
  }

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-between p-4 font-mono text-white overflow-hidden">
      
      {/* HEADER SCORE */}
      <div className="w-full max-w-md flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800 mt-2">
        <div className="text-center"><p className="text-[10px] text-slate-500 font-bold">TÚ</p><p className="text-2xl font-black text-green-400">{score.me}</p></div>
        <div className="flex flex-col items-center"><span className="text-xs font-bold text-slate-600 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">RONDA {mode === 'online' ? onlineData?.round || 1 : round}</span></div>
        <div className="text-center"><p className="text-[10px] text-slate-500 font-bold">{mode === 'online' ? 'RIVAL' : 'CPU'}</p><p className="text-2xl font-black text-red-400">{score.opponent}</p></div>
      </div>

      {/* ARENA */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md relative">
        <div className={`transition-all duration-500 ${result ? 'scale-125' : 'scale-100'}`}>
          <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-red-500/20 flex items-center justify-center text-6xl shadow-[0_0_30px_rgba(239,68,68,0.1)] mb-4 relative">
            {isRevealing ? <span className="animate-spin">🎲</span> : opponentChoice ? CHOICES.find(c => c.id === opponentChoice)?.emoji : <span className="text-slate-700 text-4xl">?</span>}
            {mode === 'online' && !opponentChoice && onlineData?.guest?.choice && onlineData.host.choice && <div className="absolute inset-0 bg-green-500/20 rounded-full animate-pulse"></div>}
          </div>
        </div>
        <div className="h-16 flex items-center justify-center my-4 z-10">
          {result && <div className="bg-black/80 backdrop-blur-md px-8 py-2 rounded-full border border-white/10 animate-in zoom-in"><span className={`text-2xl font-black ${result === 'win' ? 'text-green-400' : result === 'lose' ? 'text-red-400' : 'text-yellow-400'}`}>{result === 'win' ? '¡VICTORIA!' : result === 'lose' ? 'DERROTA' : 'EMPATE'}</span></div>}
          {!result && statusText && <span className="text-xs text-slate-500 animate-pulse">{statusText}</span>}
        </div>
        <div className={`transition-all duration-500 ${result ? 'scale-125' : 'scale-100'}`}>
          <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-green-500/20 flex items-center justify-center text-6xl shadow-[0_0_30px_rgba(34,197,94,0.1)] mt-4">
            {myChoice ? CHOICES.find(c => c.id === myChoice)?.emoji : <span className="text-slate-700 text-4xl">?</span>}
          </div>
        </div>
      </div>

      {/* CONTROLES */}
      <div className="w-full max-w-md mb-6">
        {!result ? (
          <div className="grid grid-cols-3 gap-3">
            {CHOICES.map((choice) => (
              <button key={choice.id} onClick={() => mode === 'online' ? playOnline(choice.id) : playCpu(choice.id)} disabled={!!myChoice} className={`p-4 rounded-xl border-b-4 transition-all active:scale-95 flex flex-col items-center gap-2 ${myChoice === choice.id ? 'bg-slate-700 border-slate-900 translate-y-1' : 'bg-slate-800 border-slate-950 hover:bg-slate-700'}`}>
                <span className="text-3xl">{choice.emoji}</span>
                <span className="text-[10px] font-bold tracking-widest">{choice.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
             <button onClick={mode === 'online' ? nextRoundOnline : () => { resetCpuGame(); setRound(r => r + 1); }} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition flex items-center justify-center gap-2"><Swords className="w-5 h-5" /> SIGUIENTE RONDA</button>
             <div className="mt-2"><AdSpace type="banner" /></div>
             <button onClick={() => setMode('menu')} className="text-xs text-slate-500 hover:text-white mt-2">SALIR AL MENÚ</button>
          </div>
        )}
      </div>

      {/* --- CHAT FLOTANTE --- */}
      {mode === 'online' && gameId && (
         <GameChat gameId={gameId} gameName="DUELO" />
      )}

    </div>
  );
}