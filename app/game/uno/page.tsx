// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
// IMPORTANTE: Aseguramos que todos los iconos estén aquí
import { ArrowLeft, Users, Zap, Eye, RotateCw, Slash, Plus, Layers, Crown, Sparkles, Trophy, Timer, AlertCircle, PlayCircle, BookOpen, Copy, Check, Cpu } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, query, orderBy, limit, getDocs, setDoc, getDoc, arrayUnion } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useAudio } from '@/contexts/AudioContext';

// --- CONFIGURACIÓN Y UTILIDADES ---
const COLORS = ['red', 'blue', 'green', 'yellow'];
const SPECIALS = ['skip', 'reverse', 'draw2'];
const WILDS = ['wild', 'draw4'];

type CardType = { id: string; color: string; value: string; score: number; };

const createDeck = () => {
  let deck: CardType[] = [];
  let id = 0;
  COLORS.forEach(c => {
    deck.push({ id: `c${id++}`, color: c, value: '0', score: 0 });
    for (let i = 1; i <= 9; i++) {
        deck.push({ id: `c${id++}`, color: c, value: `${i}`, score: i });
        deck.push({ id: `c${id++}`, color: c, value: `${i}`, score: i });
    }
    SPECIALS.forEach(s => {
        deck.push({ id: `c${id++}`, color: c, value: s, score: 20 });
        deck.push({ id: `c${id++}`, color: c, value: s, score: 20 });
    });
  });
  WILDS.forEach(w => {
      for(let i=0; i<4; i++) deck.push({ id: `w${id++}`, color: 'black', value: w, score: 50 });
  });
  return shuffle(deck);
};

const shuffle = (array: any[]) => array.sort(() => Math.random() - 0.5);

export default function ProUno() {
  const [view, setView] = useState('menu'); // menu, lobby, game
  const [user, setUser] = useState<any>(null);
  const { playSound } = useAudio();

  // ESTADO JUEGO (SYNC)
  const [gameMode, setGameMode] = useState<'pve' | 'pvp'>('pve');
  const [deck, setDeck] = useState<CardType[]>([]);
  const [discard, setDiscard] = useState<CardType[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [currentColor, setCurrentColor] = useState('');
  const [winner, setWinner] = useState<any>(null);
  const [isDrawPending, setIsDrawPending] = useState(0);
  const [log, setLog] = useState("Bienvenido a UNO PRO");

  // ONLINE PVP
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [myPlayerIndex, setMyPlayerIndex] = useState(-1);
  const [copied, setCopied] = useState(false);

  // ESTADO LOCAL USUARIO
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [activeColorSelect, setActiveColorSelect] = useState(false);
  const tempWildCardRef = useRef<CardType | null>(null);

  // ADS & DATA
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 });
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // --- SYNC ONLINE (PVP) ---
  useEffect(() => {
      if (gameMode === 'pvp' && roomCode) {
          const unsub = onSnapshot(doc(db, "matches_uno", roomCode), (docSnap) => {
              if (docSnap.exists()) {
                  const data = docSnap.data();
                  setPlayers(data.players);
                  
                  // Detectar mi índice
                  const myIdx = data.players.findIndex((p:any) => p.uid === user?.uid);
                  setMyPlayerIndex(myIdx);

                  if (data.status === 'playing') {
                      if (view !== 'game') { setView('game'); playSound('start'); }
                      // Sincronizar estado del juego
                      setDeck(data.gameState.deck.map((c:any) => JSON.parse(c)));
                      setDiscard(data.gameState.discard.map((c:any) => JSON.parse(c)));
                      setTurnIndex(data.gameState.turnIndex);
                      setDirection(data.gameState.direction);
                      setCurrentColor(data.gameState.currentColor);
                      setIsDrawPending(data.gameState.isDrawPending);
                      setLog(data.lastAction || 'Partida en curso');
                      if(data.winner) endGame(data.winner.id, data.winner.name);
                  }
              }
          });
          return () => unsub();
      }
  }, [gameMode, roomCode, view, user]);

  // --- LÓGICA PVE (BOTS) ---
  useEffect(() => {
      if (gameMode === 'pve' && view === 'game' && !winner && players[turnIndex]?.isBot) {
          const timer = setTimeout(() => playBotTurn(), 1500);
          return () => clearTimeout(timer);
      }
  }, [turnIndex, view, winner, gameMode]);

  const startPvE = (count: number) => {
      if (lives <= 0) { if(confirm("Sin vidas. ¿Ver anuncio?")) watchAd('life'); return; }
      setGameMode('pve');
      const newDeck = createDeck();
      const newPlayers = [{ id: 'player', name: 'Tú', hand: newDeck.splice(0, 7), isBot: false, uid: user?.uid }];
      for(let i=1; i<count; i++) newPlayers.push({ id: `bot_${i}`, name: `CPU ${i}`, hand: newDeck.splice(0, 7), isBot: true });
      
      initializeGameState(newDeck, newPlayers);
      setView('game'); playSound('start');
  };

  const playBotTurn = () => {
      const bot = players[turnIndex];
      const validCards = bot.hand.filter((c: CardType) => isValidPlay(c));
      if (validCards.length > 0) {
          const card = validCards[0]; // Simple AI
          let nextColor = card.color;
          if (card.color === 'black') {
              const counts = { red:0, blue:0, green:0, yellow:0 };
              bot.hand.forEach((c:any) => { if(c.color!=='black') counts[c.color as keyof typeof counts]++ });
              nextColor = Object.keys(counts).reduce((a, b) => counts[a as keyof typeof counts] > counts[b as keyof typeof counts] ? a : b);
          }
          executePlay(bot.id, card, nextColor);
      } else {
          executeDraw(bot.id);
      }
  };

  // --- LÓGICA COMÚN (PVE & PVP) ---
  const initializeGameState = (initialDeck: CardType[], initialPlayers: any[]) => {
      let first = initialDeck.pop();
      while(first?.color === 'black') { initialDeck.unshift(first); first = initialDeck.pop(); }
      setDeck(initialDeck); setDiscard([first!]); setPlayers(initialPlayers);
      setCurrentColor(first!.color); setTurnIndex(0); setDirection(1); setWinner(null); setIsDrawPending(0);
      setMyPlayerIndex(0); // En PVE siempre soy 0
  };

  const isValidPlay = (card: CardType) => {
      const top = discard[discard.length-1];
      if (isDrawPending > 0) {
        if (top.value === 'draw2' && card.value === 'draw2') return true;
        if (top.value === 'draw4' && card.value === 'draw4') return true;
        return false;
      }
      return card.color === 'black' || card.color === currentColor || card.value === top.value;
  };

  const executePlay = async (playerId: string, card: CardType, chosenColor?: string) => {
      playSound('card');
      let nextDir = direction; let nextSkip = false; let addDraw = 0;
      if (card.value === 'reverse') { if (players.length === 2) nextSkip = true; else nextDir *= -1; }
      if (card.value === 'skip') nextSkip = true;
      if (card.value === 'draw2') addDraw = 2;
      if (card.value === 'draw4') addDraw = 4;

      const newPlayers = players.map(p => p.id === playerId ? { ...p, hand: p.hand.filter((c:any) => c.id !== card.id) } : p);
      const newDiscard = [...discard, card];
      const newColor = chosenColor || card.color;
      const newDrawPending = isDrawPending + addDraw;

      let nextIndex = (turnIndex + nextDir + players.length) % players.length;
      let actionLog = `${players[turnIndex].name} jugó ${card.value}`;

      if (newPlayers.find(p => p.id === playerId)?.hand.length === 0) {
          handleWin(playerId, players.find(p=>p.id===playerId)?.name); return;
      }

      if (nextSkip) {
          actionLog += `. ${players[nextIndex].name} saltado.`;
          nextIndex = (nextIndex + nextDir + players.length) % players.length;
      }

      updateGameState({ deck, discard: newDiscard, players: newPlayers, turnIndex: nextIndex, direction: nextDir, currentColor: newColor, isDrawPending: newDrawPending }, actionLog);
  };

  const executeDraw = async (playerId: string, forcedAmount?: number) => {
      let currentDeck = [...deck];
      let currentDiscard = [...discard];
      const cardsToDraw = forcedAmount || 1;
      const drawnCards: CardType[] = [];

      for(let i=0; i<cardsToDraw; i++) {
          if (currentDeck.length === 0) {
              if(currentDiscard.length <= 1) break; // No more cards
              const top = currentDiscard.pop();
              currentDeck = shuffle(currentDiscard);
              currentDiscard = [top!];
          }
          drawnCards.push(currentDeck.pop()!);
      }
      
      const newPlayers = players.map(p => p.id === playerId ? { ...p, hand: [...p.hand, ...drawnCards] } : p);
      let nextIndex = (turnIndex + direction + players.length) % players.length;
      let newDrawPending = isDrawPending;
      let actionLog = `${players[turnIndex].name} robó ${drawnCards.length}`;

      if (forcedAmount) { 
          newDrawPending = 0; 
      } else if (isDrawPending > 0) {
         return executeDraw(playerId, isDrawPending);
      }

      updateGameState({ deck: currentDeck, discard: currentDiscard, players: newPlayers, turnIndex: nextIndex, direction, currentColor, isDrawPending: newDrawPending }, actionLog);
  };

  const updateGameState = async (newState: any, actionLog: string) => {
      if (gameMode === 'pve') {
          setDeck(newState.deck); setDiscard(newState.discard); setPlayers(newState.players);
          setTurnIndex(newState.turnIndex); setDirection(newState.direction); setCurrentColor(newState.currentColor); setIsDrawPending(newState.isDrawPending); setLog(actionLog);
      } else {
          const serializedState = {
              ...newState,
              deck: newState.deck.map((c:any) => JSON.stringify(c)),
              discard: newState.discard.map((c:any) => JSON.stringify(c)),
              players: newState.players.map((p:any) => ({...p, hand: p.hand.map((c:any)=>JSON.stringify(c))}))
          };
          await updateDoc(doc(db, "matches_uno", roomCode), { gameState: serializedState, lastAction: actionLog });
      }
  };

  // --- INTERACCIÓN JUGADOR ---
  const handleCardClick = (card: CardType) => {
      if (turnIndex !== myPlayerIndex) return;
      if (!isValidPlay(card)) { playSound('error'); return; }

      if (card.color === 'black') {
          tempWildCardRef.current = card;
          setActiveColorSelect(true);
      } else {
          executePlay(players[myPlayerIndex].id, card);
      }
  };
  const handleColorSelect = (color: string) => {
      setActiveColorSelect(false);
      if(tempWildCardRef.current) executePlay(players[myPlayerIndex].id, tempWildCardRef.current, color);
  };
  const handleDeckClick = () => {
      if (turnIndex !== myPlayerIndex) return;
      if (isDrawPending > 0) executeDraw(players[myPlayerIndex].id, isDrawPending); 
      else executeDraw(players[myPlayerIndex].id); 
  };

  // --- FINALIZACIÓN ---
  const handleWin = async (winnerId: string, winnerName: string) => {
      if (gameMode === 'pvp') {
          await updateDoc(doc(db, "matches_uno", roomCode), { status: 'finished', winner: { id: winnerId, name: winnerName } });
      } else {
          endGame(winnerId, winnerName);
      }
  };

  const endGame = (winnerId: string, winnerName: string) => {
      const isMe = winnerId === players[myPlayerIndex]?.id;
      playSound(isMe ? 'win' : 'lose');
      setWinner({ id: winnerId, name: winnerName });
      if (isMe) {
          let points = 0;
          players.forEach(p => { if(p.id !== winnerId) p.hand.forEach((c:any) => points += c.score); });
          setScore(s => s + points); saveScore(score + points);
      } else if (gameMode === 'pve') {
          setLives(l => l - 1);
      }
  };

  // --- ONLINE LOBBY ---
  const createRoom = async () => {
      if (!user) return alert("Inicia sesión");
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const initialDeck = createDeck();
      const hostPlayer = { id: `p_${user.uid}`, name: user.name, hand: [], uid: user.uid, isHost: true };
      
      await setDoc(doc(db, "matches_uno", code), {
          hostId: user.uid, status: 'waiting', players: [hostPlayer], createdAt: serverTimestamp(),
          gameState: { deck: initialDeck.map(c=>JSON.stringify(c)), discard: [], turnIndex:0, direction:1, currentColor:'', isDrawPending:0 }
      });
      setRoomCode(code); setIsHost(true); setGameMode('pvp'); setView('lobby');
  };
  
  const joinRoom = async (code: string) => {
      if (!user) return alert("Inicia sesión");
      const roomRef = doc(db, "matches_uno", code);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists() || roomSnap.data().status !== 'waiting') return alert("Sala no válida");
      if (roomSnap.data().players.length >= 4) return alert("Sala llena");
      
      const newPlayer = { id: `p_${user.uid}`, name: user.name, hand: [], uid: user.uid, isHost: false };
      await updateDoc(roomRef, { players: arrayUnion(newPlayer) });
      setRoomCode(code); setIsHost(false); setGameMode('pvp'); setView('lobby');
  };

  const startOnlineGame = async () => {
      if (players.length < 2) return alert("Mínimo 2 jugadores");
      const roomRef = doc(db, "matches_uno", roomCode);
      const roomData = (await getDoc(roomRef)).data();
      let deck = roomData.gameState.deck.map((c:any)=>JSON.parse(c));
      const updatedPlayers = players.map(p => ({ ...p, hand: deck.splice(0, 7).map((c:any)=>JSON.stringify(c)) }));
      
      let first = deck.pop();
      while(first?.color === 'black') { deck.unshift(first); first = deck.pop(); }

      const initialGameState = {
          deck: deck.map((c:any)=>JSON.stringify(c)), discard: [JSON.stringify(first)],
          players: updatedPlayers, turnIndex: 0, direction: 1, currentColor: first.color, isDrawPending: 0
      };
      await updateDoc(roomRef, { status: 'playing', gameState: initialGameState, players: updatedPlayers });
  };

  const copyCode = () => { navigator.clipboard.writeText(roomCode); setCopied(true); setTimeout(()=>setCopied(false), 2000); };

  // --- HELPERS & ADS ---
  const watchAd = (type: any) => { setAdState({ active: true, type, timer: 5 }); };
  useEffect(() => { let i:any; if (adState.active && adState.timer > 0) i = setInterval(() => setAdState(p => ({...p, timer: p.timer-1})), 1000); else if (adState.active) { clearInterval(i); setAdState({active:false, timer:5}); if(adState.type==='life') setLives(l=>l+1); setAdState(p=>({...p, active:false})); } return () => clearInterval(i); }, [adState.active]);
  const saveScore = async (s: number) => { if(user) await addDoc(collection(db, "scores_uno"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); fetchLeaderboard(); };
  const fetchLeaderboard = async () => { const q = query(collection(db, "scores_uno"), orderBy("score", "desc"), limit(5)); const s = await getDocs(q); setLeaderboard(s.docs.map(d=>d.data())); };

  // --- COMPONENTE CARTA REALISTA (FIXED COLORS) ---
  const Card = ({ card, hidden = false, onClick, small = false, selectable = false }: any) => {
      const baseClasses = "relative rounded-lg select-none transition-all duration-200 flex items-center justify-center overflow-hidden border shadow-md";
      const sizeClasses = small ? "w-10 h-14 text-sm border-white/20" : "w-24 h-36 text-4xl border-white/10";
      const hoverClasses = selectable ? "cursor-pointer hover:scale-105 hover:-translate-y-4 hover:shadow-2xl hover:z-20" : "";
      
      let bgClass = "bg-slate-800";
      let textClass = "text-black"; // El color del número dentro del óvalo
      
      if (!hidden) {
          if (card.color === 'red') { bgClass = "bg-[#ff5555]"; textClass = "text-[#ff5555]"; }
          else if (card.color === 'blue') { bgClass = "bg-[#5555ff]"; textClass = "text-[#5555ff]"; }
          else if (card.color === 'green') { bgClass = "bg-[#55aa55]"; textClass = "text-[#55aa55]"; }
          else if (card.color === 'yellow') { bgClass = "bg-[#ffaa00]"; textClass = "text-[#ffaa00]"; }
          else { bgClass = "bg-black"; textClass = "text-black"; } // Wild
      }

      const innerContent = (val: string) => {
          if (val === 'skip') return <Slash className="w-full h-full p-1"/>;
          if (val === 'reverse') return <RotateCw className="w-full h-full p-1"/>;
          if (val === 'draw2') return '+2';
          if (val === 'draw4') return '+4';
          if (val === 'wild') return <Sparkles className="w-full h-full p-1"/>;
          return val;
      };

      if (hidden) return (
          <div className={`${baseClasses} ${sizeClasses} bg-black border-2 border-white`}>
             <div className="absolute inset-1 bg-red-600 rounded flex items-center justify-center">
                 <span className="font-black italic text-yellow-400 text-xl -rotate-12 drop-shadow-md">UNO</span>
             </div>
          </div>
      );

      return (
          <div onClick={onClick} className={`${baseClasses} ${sizeClasses} ${bgClass} ${hoverClasses}`}>
              {/* Óvalo Blanco Central - ROTADO */}
              <div className="absolute inset-2 bg-white rounded-[50%] rotate-[-15deg] shadow-inner flex items-center justify-center">
                   {/* Texto/Icono Central - Con borde negro fuerte */}
                   <span className={`font-black italic ${textClass} drop-shadow-sm flex items-center justify-center w-full h-full`} 
                         style={{
                             textShadow: '2px 2px 0px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                         }}>
                      {innerContent(card.value)}
                   </span>
              </div>
              
              {/* Esquina Superior Izquierda (Blanco) */}
              {!small && <div className="absolute top-1 left-1 text-sm text-white font-black drop-shadow-md">
                  {card.value === 'draw2' ? '+2' : card.value === 'draw4' ? '+4' : card.value.charAt(0).toUpperCase()}
              </div>}
              
              {/* Esquina Inferior Derecha (Blanco - Invertido) */}
              {!small && <div className="absolute bottom-1 right-1 text-sm text-white font-black drop-shadow-md rotate-180">
                  {card.value === 'draw2' ? '+2' : card.value === 'draw4' ? '+4' : card.value.charAt(0).toUpperCase()}
              </div>}
          </div>
      );
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center p-2 font-mono text-white overflow-hidden relative">
        
        {adState.active && <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center flex-col"><Eye className="w-20 h-20 text-yellow-400 animate-pulse mb-4"/><h2 className="text-2xl font-bold">PUBLICIDAD: {adState.timer}s</h2></div>}

        {/* HEADER */}
        <div className="w-full max-w-7xl flex justify-between items-center mb-4 z-10 px-4 mt-4">
            <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-yellow-500 transition-all"><ArrowLeft className="w-5 h-5"/></button>
            <div className="text-center">
                <h1 className="text-3xl sm:text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 tracking-tighter drop-shadow-xl">UNO PRO</h1>
            </div>
            {view === 'game' ? (
                <div className="flex gap-2">
                    {gameMode==='pve' && <div className="flex items-center gap-1 bg-slate-900/80 px-3 py-1 rounded-full border border-red-500/50"><Zap className="w-3 h-3 text-red-500"/> {lives}</div>}
                    <div className="flex items-center gap-1 bg-slate-900/80 px-3 py-1 rounded-full border border-yellow-500/50">{score} PTS</div>
                </div>
            ) : <div className="w-20"></div>}
        </div>

        {view === 'menu' ? (
            <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-8 z-10">
                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 backdrop-blur-md">
                    <h2 className="text-sm font-bold text-yellow-500 mb-4 uppercase tracking-widest flex items-center gap-2"><Cpu className="w-4 h-4"/> Un Jugador (VS CPU)</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => startPvE(2)} className="py-4 bg-slate-800 hover:bg-blue-900/30 border border-slate-600 hover:border-blue-500 rounded-xl font-bold text-blue-300 transition-all flex flex-col items-center"><Users className="w-6 h-6 mb-1"/> 2 JUGADORES</button>
                        <button onClick={() => startPvE(4)} className="py-4 bg-slate-800 hover:bg-purple-900/30 border border-slate-600 hover:border-purple-500 rounded-xl font-bold text-purple-300 transition-all flex flex-col items-center"><Layers className="w-6 h-6 mb-1"/> 4 JUGADORES</button>
                    </div>
                </div>

                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-700 backdrop-blur-md shadow-xl">
                  <h2 className="text-sm font-bold text-green-500 mb-4 uppercase tracking-widest flex items-center gap-2"><Users className="w-4 h-4"/> Multijugador Online</h2>
                  <div className="flex gap-2">
                      <button onClick={createRoom} className="flex-1 py-3 bg-green-700 rounded-lg font-bold text-xs hover:bg-green-600 text-white shadow-[0_0_15px_rgba(34,197,94,0.3)]">CREAR SALA</button>
                      <input id="code" placeholder="CÓDIGO" className="w-24 bg-black/50 border border-slate-600 rounded-lg text-center font-mono text-green-400 font-bold focus:border-green-500 outline-none"/>
                      <button onClick={() => joinRoom((document.getElementById('code') as HTMLInputElement).value)} className="flex-1 py-3 bg-slate-800 rounded-lg font-bold text-xs border border-slate-600 hover:border-green-500 text-slate-300 transition-all">UNIRSE</button>
                  </div>
              </div>
                
                {leaderboard.length > 0 && (
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 mt-2 backdrop-blur-sm">
                        <h3 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Ranking Global</h3>
                        {leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-xs py-2 border-b border-slate-800/50 text-slate-300 font-mono"><span>#{i+1} {s.displayName}</span><span className="text-yellow-500 font-bold">{s.score}</span></div>))}
                    </div>
                )}
            </div>
        ) : view === 'lobby' ? (
            <div className="w-full max-w-md flex flex-col items-center justify-center flex-grow z-10 animate-in fade-in">
                <div className="bg-slate-900/80 p-8 rounded-3xl border border-green-500/50 text-center shadow-2xl backdrop-blur-md">
                    <h2 className="text-2xl font-black text-green-400 mb-2 uppercase tracking-widest">SALA ONLINE</h2>
                    <p className="text-slate-400 text-sm mb-6">Comparte el código para jugar</p>
                    
                    <button onClick={copyCode} className="bg-black/50 border-2 border-dashed border-green-500/30 px-8 py-4 rounded-xl font-mono text-3xl font-bold text-white mb-6 flex items-center gap-4 hover:bg-black/70 transition group relative">
                        {roomCode} <Copy className="w-6 h-6 text-green-500 group-hover:scale-110 transition"/>
                        {copied && <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded">¡Copiado!</span>}
                    </button>

                    <div className="w-full mb-8">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 text-left">Jugadores ({players.length}/4)</h3>
                        <div className="flex flex-col gap-2">
                            {players.map((p, i) => (
                                <div key={i} className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                                    <div className={`w-3 h-3 rounded-full ${p.isHost ? 'bg-yellow-500' : 'bg-green-500'} animate-pulse`}></div>
                                    <span className="font-bold">{p.name} {p.uid === user?.uid && '(Tú)'}</span>
                                    {p.isHost && <Crown className="w-4 h-4 text-yellow-500 ml-auto"/>}
                                </div>
                            ))}
                            {[...Array(4-players.length)].map((_,i) => <div key={i} className="bg-slate-800/20 p-3 rounded-lg border border-slate-700/30 text-slate-600 italic">Esperando jugador...</div>)}
                        </div>
                    </div>

                    {isHost ? (
                        <button onClick={startOnlineGame} disabled={players.length < 2} className={`w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg ${players.length >= 2 ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-500/30' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
                            INICIAR PARTIDA
                        </button>
                    ) : (
                        <p className="text-green-400 font-bold animate-pulse">Esperando al anfitrión...</p>
                    )}
                </div>
            </div>
        ) : (
            <div className="w-full max-w-7xl flex flex-col items-center justify-between flex-grow relative z-10 pb-2 h-full">
                
                {/* RIVALES (TOP & SIDES) */}
                <div className="flex justify-around w-full mt-2 px-4">
                    {players.map((p, i) => {
                        if (i === myPlayerIndex) return null;
                        const isTurn = turnIndex === i;
                        // Lógica simple para posicionar 3 rivales: Top, Left, Right (para 4 jugadores)
                        let posClass = "flex-col items-center";
                        if (players.length === 4) {
                            const relativeIdx = (i - myPlayerIndex + players.length) % players.length;
                            if (relativeIdx === 1) posClass = "flex-col items-start absolute left-4 top-1/3"; // Izquierda
                            if (relativeIdx === 2) posClass = "flex-col items-center"; // Arriba (Top)
                            if (relativeIdx === 3) posClass = "flex-col items-end absolute right-4 top-1/3"; // Derecha
                        }

                        return (
                            <div key={p.id} className={`flex ${posClass} transition-all p-2 rounded-xl ${isTurn ? 'bg-white/10 scale-105 shadow-lg border border-white/20' : 'opacity-70'}`}>
                                <div className="relative">
                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center mb-1 shadow-md">
                                        <span className="text-sm font-bold">{p.hand.length}</span>
                                    </div>
                                    {isTurn && <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full animate-ping"></div>}
                                </div>
                                <span className="text-[9px] sm:text-xs font-bold uppercase tracking-widest truncate max-w-[80px]">{p.name}</span>
                                <div className="flex -space-x-3 mt-1">
                                    {p.hand.slice(0, Math.min(p.hand.length, 5)).map((_:any, idx:number) => <Card key={idx} hidden small />)}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* MESA CENTRAL */}
                <div className="flex gap-6 items-center justify-center my-4 sm:my-8 relative">
                    {/* MAZO */}
                    <div onClick={handleDeckClick} className={`cursor-pointer relative group transition-transform ${turnIndex===myPlayerIndex && isDrawPending===0 ? 'hover:scale-105' : ''}`}>
                        <Card hidden />
                        {turnIndex === myPlayerIndex && isDrawPending === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="text-white"/></div>
                        )}
                        <span className="absolute -bottom-5 w-full text-center text-[9px] font-bold text-slate-500 tracking-widest">MAZO</span>
                    </div>

                    {/* DESCARTE Y COLOR */}
                    <div className="relative">
                        {discard.length > 0 && <Card card={discard[discard.length-1]} />}
                        {/* Indicador de Sentido */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                             <RotateCw className={`w-24 h-24 text-white/10 transition-all duration-500 ${direction === 1 ? 'animate-[spin_4s_linear_infinite]' : 'animate-[spin_4s_linear_infinite_reverse]'}`}/>
                        </div>
                        {/* Indicador Color Activo */}
                        <div className={`absolute -right-3 -top-3 w-6 h-6 rounded-full border-2 border-white shadow-lg z-20 ${
                            currentColor === 'red' ? 'bg-red-600' : currentColor === 'blue' ? 'bg-blue-600' : currentColor === 'green' ? 'bg-green-600' : currentColor === 'yellow' ? 'bg-yellow-500' : 'bg-black'
                        }`} title={`Color: ${currentColor.toUpperCase()}`}></div>
                    </div>
                </div>

                {/* LOG Y ALERTA */}
                <div className="mb-2 text-center h-12 flex flex-col justify-end">
                    <p className={`text-xs sm:text-sm font-bold transition-all ${turnIndex===myPlayerIndex ? 'text-yellow-400 scale-105' : 'text-slate-400'}`}>{log}</p>
                    {isDrawPending > 0 && <p className="text-[10px] text-red-500 font-black mt-0.5 animate-pulse">¡ACUMULADO +{isDrawPending}!</p>}
                    {turnIndex === myPlayerIndex && <p className="text-[10px] text-green-400 font-bold mt-0.5 animate-bounce">¡TU TURNO!</p>}
                </div>

                {/* MANO DEL JUGADOR */}
                <div className="w-full px-4 pb-2 relative z-20">
                    <div className={`flex justify-center items-end -space-x-5 sm:-space-x-8 transition-all ${turnIndex !== myPlayerIndex ? 'opacity-60 grayscale-[0.3] pointer-events-none' : ''}`} style={{ perspective: '1000px' }}>
                        {players[myPlayerIndex]?.hand.map((card: CardType, i: number) => {
                            const total = players[myPlayerIndex].hand.length;
                            const rotate = (i - (total - 1) / 2) * 3; // Ligera rotación en abanico
                            const translateY = Math.abs(i - (total - 1) / 2) * 2; // Arco sutil

                            return (
                                <div key={card.id} style={{ transform: `rotate(${rotate}deg) translateY(${translateY}px)`, zIndex: i }} className="transition-all duration-300 hover:!rotate-0 hover:!translate-y-[-20px] hover:z-50 origin-bottom">
                                    <Card card={card} onClick={() => handleCardClick(card)} selectable={turnIndex === myPlayerIndex && isValidPlay(card)} />
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* SELECTOR DE COLOR (MODAL) */}
                {activeColorSelect && (
                    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center animate-in fade-in backdrop-blur-sm">
                        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-700 text-center shadow-2xl">
                            <h3 className="text-xl font-black mb-6 text-white italic uppercase">ELIGE COLOR</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {COLORS.map(c => (
                                    <button key={c} onClick={() => handleColorSelect(c)} className={`w-20 h-20 rounded-2xl ${c==='red'?'bg-red-600':c==='blue'?'bg-blue-600':c==='green'?'bg-green-600':'bg-yellow-500'} hover:scale-110 transition-transform shadow-lg border-2 border-black/20`}></button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* BOTONES FLOTANTES (REGLAS) */}
                <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-40">
                    <button onClick={() => setShowRules(true)} className="p-3 bg-slate-900/90 rounded-full border border-slate-600 text-slate-300 hover:text-white hover:border-yellow-500 transition-all shadow-lg hover:scale-110 group relative" title="Reglas">
                        <BookOpen className="w-5 h-5"/>
                        <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-black/80 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none">Reglas</span>
                    </button>
                </div>

                {/* MODAL REGLAS */}
                {showRules && (
                    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-md" onClick={()=>setShowRules(false)}>
                        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 max-w-lg w-full shadow-2xl relative overflow-y-auto max-h-[80vh]" onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>setShowRules(false)} className="absolute top-4 right-4 p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition"><ArrowLeft className="w-4 h-4"/></button>
                            <h2 className="text-2xl font-black text-yellow-500 mb-4 uppercase italic flex items-center gap-2"><BookOpen className="w-6 h-6"/> Reglas del Juego</h2>
                            <div className="space-y-4 text-sm text-slate-300 font-sans">
                                <p><strong className="text-white">Objetivo:</strong> Ser el primero en quedarse sin cartas.</p>
                                <p><strong className="text-white">Cómo jugar:</strong> En tu turno, juega una carta que coincida en <strong className="text-white">COLOR</strong> o <strong className="text-white">VALOR</strong> con la del descarte.</p>
                                <ul className="list-disc pl-5 space-y-2">
                                    <li>Si no puedes jugar, debes <strong className="text-white">ROBAR</strong> del mazo. Si la que robas sirve, puedes jugarla.</li>
                                    <li><strong className="text-yellow-500">+2 / +4:</strong> El siguiente jugador roba esa cantidad y pierde el turno. ¡Se pueden acumular!</li>
                                    <li><strong className="text-blue-400">Salto (Ø):</strong> El siguiente jugador pierde el turno.</li>
                                    <li><strong className="text-green-400">Reversa (⟳):</strong> Cambia el sentido del juego.</li>
                                    <li><strong className="text-purple-400">Comodín (Wild):</strong> Cambia el color activo.</li>
                                </ul>
                                <p className="text-xs text-slate-500 mt-4 italic">Gana puntos al finalizar según las cartas que les queden a los rivales.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* PANTALLA FIN */}
                {winner && (
                    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center animate-in zoom-in p-4 backdrop-blur-md">
                        {winner.id === players[myPlayerIndex]?.id ? (
                            <div className="bg-gradient-to-br from-yellow-600/20 to-slate-900/50 p-10 rounded-3xl border-2 border-yellow-500 text-center shadow-[0_0_50px_rgba(234,179,8,0.3)] relative overflow-hidden">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-500/20 to-transparent animate-pulse"></div>
                                <Trophy className="w-24 h-24 text-yellow-400 animate-bounce mx-auto mb-4 relative z-10"/>
                                <h1 className="text-5xl font-black text-white italic tracking-tighter relative z-10 mb-2">¡VICTORIA!</h1>
                                <p className="text-yellow-200 font-mono tracking-widest text-sm relative z-10">PUNTOS GANADOS: <span className="font-bold text-lg">{score}</span></p>
                            </div>
                        ) : (
                            <div className="bg-gradient-to-br from-red-900/20 to-slate-900/50 p-10 rounded-3xl border-2 border-red-600 text-center shadow-[0_0_50px_rgba(220,38,38,0.3)]">
                                <AlertCircle className="w-24 h-24 text-red-600 animate-pulse mx-auto mb-4"/>
                                <h1 className="text-5xl font-black text-white italic tracking-tighter mb-2">DERROTA</h1>
                                <p className="text-red-300 font-mono tracking-widest text-sm">Ha ganado {winner.name}.</p>
                            </div>
                        )}
                        <button onClick={() => window.location.reload()} className="mt-8 px-10 py-4 bg-white text-black font-black rounded-full hover:scale-105 hover:bg-slate-200 transition uppercase tracking-widest shadow-xl z-10 flex items-center gap-2">
                            <RotateCw className="w-5 h-5"/> JUGAR DE NUEVO
                        </button>
                    </div>
                )}
            </div>
        )}
        <div className="mt-auto w-full max-w-md pt-2 opacity-50 relative z-10"><AdSpace type="banner" /><GameChat gameId={roomCode || "global_uno"} gameName="UNO PRO" /></div>
    </div>
  );
}