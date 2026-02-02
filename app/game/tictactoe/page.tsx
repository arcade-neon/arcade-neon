// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, Cpu, Gamepad2, Users, Loader2, Trophy, AlertCircle, Share2, Circle, X } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace'; // <--- 1. IMPORTAMOS PUBLICIDAD

// --- UTILIDAD: Generar ID aleatorio de 6 caracteres ---
const generateGameId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export default function TicTacToeOnline() {
  const [user, setUser] = useState(null);
  const [gameId, setGameId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [gameData, setGameData] = useState(null);
  const [status, setStatus] = useState('lobby'); // lobby, creating, joining, waiting, playing, finished
  const [error, setError] = useState('');

  // 1. Detectar usuario actual
  useEffect(() => {
    const u = auth.currentUser;
    if (u) {
      setUser({
        uid: u.uid,
        name: u.displayName || 'Jugador Anónimo',
        photo: u.photoURL
      });
    }
  }, []);

  // 2. Escuchar cambios en la partida
  useEffect(() => {
    if (!gameId) return;

    const unsubscribe = onSnapshot(doc(db, "matches_tictactoe", gameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGameData(data);
        if (data.status === 'playing') setStatus('playing');
        if (data.status === 'finished') setStatus('finished');
      } else {
        setError("La partida ha sido borrada.");
        setStatus('lobby');
      }
    });

    return () => unsubscribe();
  }, [gameId]);

  // --- ACCIONES ---

  const createMatch = async () => {
    if (!user) return setError("Debes iniciar sesión primero.");
    setStatus('creating');
    const newId = generateGameId();
    
    try {
      await setDoc(doc(db, "matches_tictactoe", newId), {
        host: user,
        guest: null,
        board: Array(9).fill(null),
        turn: 'X',
        winner: null,
        status: 'waiting',
        createdAt: serverTimestamp()
      });
      setGameId(newId);
      setStatus('waiting');
    } catch (err) {
      console.error(err);
      setError("Error al crear la sala.");
      setStatus('lobby');
    }
  };

  const joinMatch = async () => {
    if (!user) return setError("Debes iniciar sesión.");
    if (!joinId) return setError("Introduce un código válido.");
    setStatus('joining');

    try {
      const matchRef = doc(db, "matches_tictactoe", joinId.toUpperCase());
      const matchSnap = await getDoc(matchRef);

      if (!matchSnap.exists()) throw new Error("Sala no encontrada.");
      const data = matchSnap.data();
      if (data.status !== 'waiting') throw new Error("La partida ya está llena o terminada.");

      await updateDoc(matchRef, {
        guest: user,
        status: 'playing'
      });
      setGameId(joinId.toUpperCase());
      
    } catch (err: any) {
      setError(err.message);
      setStatus('lobby');
    }
  };

  const handleMove = async (index) => {
    if (!gameData || gameData.status !== 'playing') return;
    const isHost = user.uid === gameData.host.uid;
    const mySymbol = isHost ? 'X' : 'O';
    if (gameData.turn !== mySymbol) return; 
    if (gameData.board[index]) return; 

    const newBoard = [...gameData.board];
    newBoard[index] = mySymbol;

    const winner = checkWinner(newBoard);
    const isDraw = !newBoard.includes(null) && !winner;

    const matchRef = doc(db, "matches_tictactoe", gameId);
    await updateDoc(matchRef, {
      board: newBoard,
      turn: mySymbol === 'X' ? 'O' : 'X',
      winner: winner,
      status: (winner || isDraw) ? 'finished' : 'playing'
    });
  };

  const checkWinner = (squares) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return squares[a];
      }
    }
    return null;
  };

  const copyCode = () => {
    navigator.clipboard.writeText(gameId);
    alert("Código copiado: " + gameId);
  };

  // --- RENDERIZADO ---

  if (status === 'lobby' || status === 'creating' || status === 'joining') {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 font-mono text-white">
        <Link href="/" className="absolute top-6 left-6 p-3 bg-slate-800 rounded-full hover:bg-slate-700 transition z-20 border border-slate-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>

        <div className="max-w-md w-full bg-slate-900/80 p-8 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-md">
          <h1 className="text-4xl font-black text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            ONLINE ARENA
          </h1>
          <p className="text-center text-slate-500 text-xs tracking-[0.3em] uppercase mb-10">Conexión Global Establecida</p>

          <div className="space-y-6">
            <button 
              onClick={createMatch}
              disabled={status !== 'lobby'}
              className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl font-bold flex items-center justify-center gap-3 hover:scale-105 transition shadow-[0_0_20px_rgba(6,182,212,0.3)]"
            >
              {status === 'creating' ? <Loader2 className="animate-spin" /> : <Cpu />}
              CREAR SALA
            </button>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <div className="h-[1px] bg-slate-800 flex-1"></div>O<div className="h-[1px] bg-slate-800 flex-1"></div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase tracking-widest font-bold ml-1">Código de Acceso</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value.toUpperCase())}
                  placeholder="Ej: X7B9..."
                  maxLength={6}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 text-center tracking-[0.5em] font-bold text-lg focus:outline-none focus:border-cyan-500 uppercase text-white"
                />
                <button 
                  onClick={joinMatch}
                  disabled={status !== 'lobby' || joinId.length < 4}
                  className="px-6 bg-slate-800 hover:bg-purple-600 rounded-xl transition-colors disabled:opacity-50"
                >
                  <Gamepad2 />
                </button>
              </div>
            </div>
          </div>
          {error && (
            <div className="mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 font-mono text-white">
        <div className="max-w-md w-full bg-slate-900/80 p-8 rounded-3xl border border-slate-700 text-center animate-in zoom-in">
          <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-2">ESPERANDO RIVAL...</h2>
          <p className="text-slate-400 text-sm mb-8">Comparte este código con tu amigo:</p>
          <button 
            onClick={copyCode}
            className="w-full bg-black/50 border border-cyan-500/50 rounded-xl p-6 mb-6 flex flex-col items-center justify-center gap-2 hover:bg-cyan-500/10 transition cursor-pointer group"
          >
            <span className="text-4xl font-black tracking-[0.2em] text-cyan-400 group-hover:scale-110 transition-transform">{gameId}</span>
            <span className="text-[10px] text-slate-500 uppercase flex items-center gap-1"><Copy className="w-3 h-3" /> Clic para copiar</span>
          </button>
          <button onClick={() => setStatus('lobby')} className="text-slate-500 text-xs hover:text-white underline">Cancelar</button>
        </div>
      </div>
    );
  }

  if (status === 'playing' || status === 'finished') {
    if (!gameData) {
      return (
        <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center font-mono text-white">
           <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
           <p className="text-xs tracking-widest animate-pulse">SINCRONIZANDO NEURAL LINK...</p>
        </div>
      );
    }

    const isHost = user?.uid === gameData?.host?.uid;
    const mySymbol = isHost ? 'X' : 'O';
    const isMyTurn = gameData.turn === mySymbol;

    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 font-mono text-white">
        
        {/* CABECERA */}
        <div className="flex justify-between items-center w-full max-w-md mb-8 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
          <div className={`flex flex-col items-center ${gameData.turn === 'X' ? 'opacity-100 scale-110' : 'opacity-50'} transition-all`}>
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-1 border border-cyan-500 text-cyan-500 font-black">X</div>
            <span className="text-[10px] max-w-[80px] truncate">{gameData.host?.name}</span>
          </div>
          <div className="text-xs font-black tracking-widest text-slate-600">VS</div>
          <div className={`flex flex-col items-center ${gameData.turn === 'O' ? 'opacity-100 scale-110' : 'opacity-50'} transition-all`}>
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-1 border border-purple-500 text-purple-500 font-black">O</div>
            <span className="text-[10px] max-w-[80px] truncate">{gameData.guest?.name}</span>
          </div>
        </div>

        {/* TABLERO */}
        <div className="relative p-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl mb-8">
          <div className="grid grid-cols-3 gap-3">
            {gameData.board.map((cell, i) => (
              <button
                key={i}
                onClick={() => handleMove(i)}
                disabled={!!cell || status === 'finished' || !isMyTurn}
                className={`w-20 h-20 sm:w-24 sm:h-24 rounded-xl text-5xl flex items-center justify-center transition-all duration-200
                  ${!cell && isMyTurn ? 'bg-slate-950 hover:bg-slate-800 cursor-pointer' : 'bg-slate-950'}
                  ${cell === 'X' ? 'bg-slate-900 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : ''}
                  ${cell === 'O' ? 'bg-slate-900 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : ''}
                `}
              >
                {cell === 'X' && <X className="w-12 h-12 text-cyan-400 animate-in zoom-in" />}
                {cell === 'O' && <Circle className="w-10 h-10 text-purple-500 animate-in zoom-in" />}
              </button>
            ))}
          </div>
        </div>

        {/* STATUS BAR & RESULTADO & PUBLICIDAD */}
        <div className="text-center w-full max-w-md">
          {status === 'playing' && (
             <div className={`px-6 py-2 rounded-full text-sm font-bold tracking-widest border animate-pulse ${isMyTurn ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
               {isMyTurn ? "TU TURNO" : "ESPERANDO RIVAL..."}
             </div>
          )}
          
          {status === 'finished' && (
            <div className="animate-in zoom-in w-full">
              {gameData.winner ? (
                <div className="text-center">
                   <h2 className="text-3xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                     {gameData.winner === mySymbol ? '¡VICTORIA!' : 'DERROTA'}
                   </h2>
                </div>
              ) : (
                <div className="text-center">
                   <h2 className="text-3xl font-black mb-2 text-slate-400">EMPATE</h2>
                </div>
              )}

              <Link href="/" className="inline-block mt-4 px-6 py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition mb-6">
                 VOLVER AL MENÚ
              </Link>

              {/* 💰 PUBLICIDAD AL FINAL DE LA PARTIDA 💰 */}
              <div className="w-full opacity-90 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                 <AdSpace type="square" />
              </div>

            </div>
          )}
        </div>
      </div>
    );
  }

  return <div className="min-h-screen bg-[#020617] flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>;
}