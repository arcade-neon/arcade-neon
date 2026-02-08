// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Zap, Eye, RotateCw, Slash, Plus, Layers, Crown, Sparkles, Trophy, Timer, AlertCircle, PlayCircle, BookOpen, Copy, Check, Cpu, Hand, Ban, RefreshCw } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, query, orderBy, limit, getDocs, setDoc, getDoc, arrayUnion } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useAudio } from '@/contexts/AudioContext';

// --- CONFIGURACIÓN ---
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
  const [view, setView] = useState('menu');
  const [user, setUser] = useState<any>(null);
  const { playSound } = useAudio();

  // ESTADO JUEGO
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

  // MULTI-SELECCIÓN Y ONLINE
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [myPlayerIndex, setMyPlayerIndex] = useState(-1);
  const [copied, setCopied] = useState(false);

  // USUARIO LOCAL
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [activeColorSelect, setActiveColorSelect] = useState(false);
  const tempWildCardRef = useRef<CardType | null>(null);

  // ADS
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 });
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // --- SYNC PVP ---
  useEffect(() => {
      if (gameMode === 'pvp' && roomCode) {
          const unsub = onSnapshot(doc(db, "matches_uno", roomCode), (docSnap) => {
              if (docSnap.exists()) {
                  const data = docSnap.data();
                  setPlayers(data.players);
                  const myIdx = data.players.findIndex((p:any) => p.uid === user?.uid);
                  setMyPlayerIndex(myIdx);

                  if (data.status === 'playing') {
                      if (view !== 'game') { setView('game'); playSound('start'); }
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

  // --- IA BOT (FIX CUELGUES) ---
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gameMode === 'pve' && view === 'game' && !winner && players[turnIndex]?.isBot) {
        timer = setTimeout(() => playBotTurn(), 1200);
    }
    return () => clearTimeout(timer);
  }, [turnIndex, view, winner, gameMode, deck.length]); 

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
          let card = validCards.find(c => c.color === 'black') || validCards.find(c => SPECIALS.includes(c.value)) || validCards[0];
          let nextColor = card.color;
          if (card.color === 'black') {
              const counts = { red:0, blue:0, green:0, yellow:0 };
              bot.hand.forEach((c:any) => { if(c.color!=='black') counts[c.color as keyof typeof counts]++ });
              nextColor = Object.keys(counts).reduce((a, b) => counts[a as keyof typeof counts] > counts[b as keyof typeof counts] ? a : b);
          }
          executePlay(bot.id, [card], nextColor);
      } else {
          executeDraw(bot.id);
      }
  };

  // --- LÓGICA DE JUEGO ---
  const initializeGameState = (initialDeck: CardType[], initialPlayers: any[]) => {
      let first = initialDeck.pop();
      while(first?.color === 'black') { initialDeck.unshift(first); first = initialDeck.pop(); }
      setDeck(initialDeck); setDiscard([first!]); setPlayers(initialPlayers);
      setCurrentColor(first!.color); setTurnIndex(0); setDirection(1); setWinner(null); setIsDrawPending(0);
      setMyPlayerIndex(0); setSelectedCardIds([]);
  };

  const isValidPlay = (card: CardType, isStackingCheck = false) => {
      const top = discard[discard.length-1];
      if (isDrawPending > 0) {
        if (top.value === 'draw2' && card.value === 'draw2') return true;
        if (top.value === 'draw4' && card.value === 'draw4') return true;
        return false;
      }
      if (isStackingCheck) return card.value === top.value; 
      return card.color === 'black' || card.color === currentColor || card.value === top.value;
  };

  const executePlay = async (playerId: string, cards: CardType[], chosenColor?: string) => {
      playSound('card');
      let newPlayers = [...players];
      let currentPlayerHand = newPlayers.find(p => p.id === playerId)!.hand;
      let newDiscard = [...discard];
      let lastPlayedCard = cards[0]; 
      let nextDir = direction;
      let nextSkip = false;
      let addDraw = 0;
      let actionLog = `${players[turnIndex].name} jugó`;

      cards.forEach((card) => {
          currentPlayerHand = currentPlayerHand.filter((c:any) => c.id !== card.id);
          newDiscard.push(card);
          lastPlayedCard = card;
          actionLog += ` ${card.value}`;
          if (card.value === 'reverse') { if (players.length === 2) nextSkip = !nextSkip; else nextDir *= -1; }
          if (card.value === 'skip') nextSkip = !nextSkip; 
          if (card.value === 'draw2') addDraw += 2;
          if (card.value === 'draw4') addDraw += 4;
      });

      newPlayers = newPlayers.map(p => p.id === playerId ? { ...p, hand: currentPlayerHand } : p);
      const newColor = chosenColor || lastPlayedCard.color;
      const newDrawPending = isDrawPending + addDraw;

      if (currentPlayerHand.length === 0) { handleWin(playerId, players.find(p=>p.id===playerId)?.name); return; }

      let nextIndex = (turnIndex + nextDir + players.length) % players.length;
      if (nextSkip) { actionLog += ` (Salto)`; nextIndex = (nextIndex + nextDir + players.length) % players.length; }

      updateGameState({ deck, discard: newDiscard, players: newPlayers, turnIndex: nextIndex, direction: nextDir, currentColor: newColor, isDrawPending: newDrawPending }, actionLog);
      setSelectedCardIds([]); 
  };

  const executeDraw = async (playerId: string, forcedAmount?: number) => {
      let currentDeck = [...deck];
      let currentDiscard = [...discard];
      const cardsToDraw = forcedAmount || 1;
      const drawnCards: CardType[] = [];

      for(let i=0; i<cardsToDraw; i++) {
          if (currentDeck.length === 0) {
              if (currentDiscard.length <= 1) { setLog("¡Mazo agotado!"); break; }
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

      if (forcedAmount) { newDrawPending = 0; } 
      else if (isDrawPending > 0) { return executeDraw(playerId, isDrawPending); } 

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

  // --- INTERACCIÓN USUARIO ---
  const handleCardClick = (card: CardType) => {
      if (turnIndex !== myPlayerIndex) return;
      if (card.color === 'black') {
          if (isValidPlay(card)) { tempWildCardRef.current = card; setActiveColorSelect(true); setSelectedCardIds([]); } 
          else { playSound('error'); }
          return;
      }
      setSelectedCardIds(prev => {
          if (prev.includes(card.id)) return prev.filter(id => id !== card.id);
          const firstSelected = players[myPlayerIndex].hand.find(c => c.id === prev[0]);
          if (prev.length === 0 || (firstSelected && card.value === firstSelected.value)) { playSound('click'); return [...prev, card.id]; }
          playSound('error'); return prev;
      });
  };

  const playSelectedCards = () => {
      if (selectedCardIds.length === 0) return;
      const hand = players[myPlayerIndex].hand;
      const cardsToPlay = selectedCardIds.map(id => hand.find(c => c.id === id)!);
      if (!isValidPlay(cardsToPlay[0])) { playSound('error'); setLog("¡Jugada no válida!"); return; }
      executePlay(players[myPlayerIndex].id, cardsToPlay);
  };

  const handleColorSelect = (color: string) => {
      setActiveColorSelect(false);
      if(tempWildCardRef.current) executePlay(players[myPlayerIndex].id, [tempWildCardRef.current], color);
  };
  
  const handleDeckClick = () => {
      if (turnIndex !== myPlayerIndex) return;
      if (isDrawPending > 0) executeDraw(players[myPlayerIndex].id, isDrawPending); 
      else executeDraw(players[myPlayerIndex].id); 
  };

  const handleWin = async (winnerId: string, winnerName: string) => {
      if (gameMode === 'pvp') { await updateDoc(doc(db, "matches_uno", roomCode), { status: 'finished', winner: { id: winnerId, name: winnerName } }); } 
      else { endGame(winnerId, winnerName); }
  };

  const endGame = (winnerId: string, winnerName: string) => {
      const isMe = winnerId === players[myPlayerIndex]?.id;
      playSound(isMe ? 'win' : 'lose');
      setWinner({ id: winnerId, name: winnerName });
      if (isMe) {
          let points = 0;
          players.forEach(p => { if(p.id !== winnerId) p.hand.forEach((c:any) => points += c.score); });
          setScore(s => s + points); saveScore(score + points);
      } else if (gameMode === 'pve') { setLives(l => l - 1); }
  };

  // --- ONLINE ---
  const createRoom = async () => {
      if (!user) return alert("Inicia sesión");
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const initialDeck = createDeck();
      const hostPlayer = { id: `p_${user.uid}`, name: user.name, hand: [], uid: user.uid, isHost: true };
      await setDoc(doc(db, "matches_uno", code), { hostId: user.uid, status: 'waiting', players: [hostPlayer], createdAt: serverTimestamp(), gameState: { deck: initialDeck.map(c=>JSON.stringify(c)), discard: [], turnIndex:0, direction:1, currentColor:'', isDrawPending:0 } });
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
      const initialGameState = { deck: deck.map((c:any)=>JSON.stringify(c)), discard: [JSON.stringify(first)], players: updatedPlayers, turnIndex: 0, direction: 1, currentColor: first.color, isDrawPending: 0 };
      await updateDoc(roomRef, { status: 'playing', gameState: initialGameState, players: updatedPlayers });
  };
  const copyCode = () => { navigator.clipboard.writeText(roomCode); setCopied(true); setTimeout(()=>setCopied(false), 2000); };

  // --- HELPERS ---
  const watchAd = (type: any) => { setAdState({ active: true, type, timer: 5 }); };
  useEffect(() => { let i:any; if (adState.active && adState.timer > 0) i = setInterval(() => setAdState(p => ({...p, timer: p.timer-1})), 1000); else if (adState.active) { clearInterval(i); setAdState({active:false, timer:5}); if(adState.type==='life') setLives(l=>l+1); setAdState(p=>({...p, active:false})); } return () => clearInterval(i); }, [adState.active]);
  const saveScore = async (s: number) => { if(user) await addDoc(collection(db, "scores_uno"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); fetchLeaderboard(); };
  const fetchLeaderboard = async () => { const q = query(collection(db, "scores_uno"), orderBy("score", "desc"), limit(5)); const s = await getDocs(q); setLeaderboard(s.docs.map(d=>d.data())); };

  // --- CARTA VISUAL (CORREGIDA: SÍMBOLOS CON BORDE NEGRO) ---
  const Card = ({ card, hidden = false, onClick, small = false, selectable = false, isSelected = false }: any) => {
      const baseClasses = "relative rounded-xl select-none transition-all duration-300 flex items-center justify-center overflow-hidden shadow-md hover:shadow-xl";
      const sizeClasses = small ? "w-12 h-16 text-base" : "w-28 h-40 text-5xl sm:w-32 sm:h-48 sm:text-6xl";
      const transformClasses = isSelected 
        ? "scale-110 -translate-y-6 z-30 shadow-[0_0_25px_rgba(255,255,255,0.5)]" 
        : selectable ? "cursor-pointer hover:scale-105 hover:-translate-y-3 z-10 hover:z-20" : "";
      
      let bgGradient = "bg-slate-800";
      // Ahora usamos text-color del mismo color que la carta para el efecto de borde
      let symbolColor = "text-white"; 
      let borderColor = "border-white/20";

      if (!hidden) {
          if (card.color === 'red') { bgGradient = "bg-[#f55555]"; symbolColor = "text-[#f55555]"; borderColor = "border-red-400/50"; }
          else if (card.color === 'blue') { bgGradient = "bg-[#088bd6]"; symbolColor = "text-[#088bd6]"; borderColor = "border-blue-400/50"; }
          else if (card.color === 'green') { bgGradient = "bg-[#55aa55]"; symbolColor = "text-[#55aa55]"; borderColor = "border-green-400/50"; }
          else if (card.color === 'yellow') { bgGradient = "bg-[#ffaa00]"; symbolColor = "text-[#ffaa00]"; borderColor = "border-yellow-300/50"; }
          else { bgGradient = "bg-black"; symbolColor = "text-black"; borderColor = "border-purple-500/50"; }
      }

      const innerContent = (val: string) => {
          // AHORA LOS ICONOS HEREDAN EL COLOR (text-current) Y TIENEN BORDE (drop-shadow)
          const strokeStyle = { filter: "drop-shadow(2px 2px 0px black) drop-shadow(-1px -1px 0px black)" };
          
          if (val === 'skip') return <Ban strokeWidth={3} className="w-full h-full p-2" style={strokeStyle}/>;
          if (val === 'reverse') return <RefreshCw strokeWidth={3} className="w-full h-full p-2" style={strokeStyle}/>;
          if (val === 'draw2') return <span className="flex items-center justify-center w-full h-full font-black text-5xl sm:text-6xl" style={{ WebkitTextStroke: '2px black', textShadow: '2px 2px 0 #000' }}>+2</span>;
          if (val === 'draw4') return <div className="relative w-full h-full flex items-center justify-center"><Layers className="w-full h-full p-2 text-green-500 absolute top-1 left-1 opacity-50"/><span className="relative z-10 font-black text-5xl sm:text-6xl text-white" style={{ WebkitTextStroke: '2px black', textShadow: '2px 2px 0 #000' }}>+4</span></div>;
          if (val === 'wild') return <Sparkles className="w-full h-full p-1 text-purple-600" style={strokeStyle}/>;
          
          // Números normales
          return <span className="flex items-center justify-center w-full h-full font-black text-6xl sm:text-7xl" style={{ WebkitTextStroke: '2px black', textShadow: '4px 4px 0 #000' }}>{val}</span>;
      };

      if (hidden) return (
          <div className={`${baseClasses} ${sizeClasses} bg-black border-[3px] border-white`}>
             <div className="absolute inset-1 bg-red-600 rounded flex items-center justify-center border border-red-500">
                 <span className="font-black italic text-yellow-400 text-2xl -rotate-12 drop-shadow-[2px_2px_0_rgba(0,0,0,1)]">UNO</span>
             </div>
          </div>
      );

      return (
          <div onClick={onClick} className={`${baseClasses} ${sizeClasses} ${bgGradient} border-[4px] border-white ${transformClasses} relative group`}>
              {/* Óvalo Blanco Inclinado */}
              <div className="absolute inset-1.5 bg-white rounded-[50%] rotate-[-15deg] shadow-[inset_0_2px_5px_rgba(0,0,0,0.2)] flex items-center justify-center z-10 overflow-hidden">
                   {/* Símbolo Central: TIENE EL COLOR DE LA CARTA + BORDE NEGRO */}
                   <div className={`flex items-center justify-center w-full h-full scale-110 ${symbolColor}`}>
                      {innerContent(card.value)}
                   </div>
              </div>
              
              {/* Esquinas (BLANCAS siempre) */}
              {!small && <div className="absolute top-1 left-1 text-lg text-white font-black drop-shadow-[1px_1px_0_#000]">
                  {card.value === 'draw2' ? '+2' : card.value === 'draw4' ? '+4' : card.value === 'wild' ? 'W' : card.value === 'skip' ? 'Ø' : card.value === 'reverse' ? '⇄' : card.value}
              </div>}
              {!small && <div className="absolute bottom-1 right-1 text-lg text-white font-black drop-shadow-[1px_1px_0_#000] rotate-180">
                  {card.value === 'draw2' ? '+2' : card.value === 'draw4' ? '+4' : card.value === 'wild' ? 'W' : card.value === 'skip' ? 'Ø' : card.value === 'reverse' ? '⇄' : card.value}
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
                <h1 className="text-3xl sm:text-5xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 tracking-tighter drop-shadow-xl">UNO PRO</h1>
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
                {leaderboard.length > 0 && (<div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 mt-2 backdrop-blur-sm"><h3 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Ranking Global</h3>{leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-xs py-2 border-b border-slate-800/50 text-slate-300 font-mono"><span>#{i+1} {s.displayName}</span><span className="text-yellow-500 font-bold">{s.score}</span></div>))}</div>)}
            </div>
        ) : view === 'lobby' ? (
            <div className="w-full max-w-md flex flex-col items-center justify-center flex-grow z-10 animate-in fade-in">
                <div className="bg-slate-900/80 p-8 rounded-3xl border border-green-500/50 text-center shadow-2xl backdrop-blur-md">
                    <h2 className="text-2xl font-black text-green-400 mb-2 uppercase tracking-widest">SALA ONLINE</h2>
                    <p className="text-slate-400 text-sm mb-6">Comparte el código</p>
                    <button onClick={copyCode} className="bg-black/50 border-2 border-dashed border-green-500/30 px-8 py-4 rounded-xl font-mono text-3xl font-bold text-white mb-6 flex items-center gap-4 hover:bg-black/70 transition group relative">{roomCode} <Copy className="w-6 h-6 text-green-500 group-hover:scale-110 transition"/>{copied && <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded">¡Copiado!</span>}</button>
                    <div className="w-full mb-8"><h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 text-left">Jugadores ({players.length}/4)</h3><div className="flex flex-col gap-2">{players.map((p, i) => (<div key={i} className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-lg border border-slate-700"><div className={`w-3 h-3 rounded-full ${p.isHost ? 'bg-yellow-500' : 'bg-green-500'} animate-pulse`}></div><span className="font-bold">{p.name} {p.uid === user?.uid && '(Tú)'}</span>{p.isHost && <Crown className="w-4 h-4 text-yellow-500 ml-auto"/>}</div>))}</div></div>
                    {isHost ? (<button onClick={startOnlineGame} disabled={players.length < 2} className={`w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg ${players.length >= 2 ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-500/30' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>INICIAR PARTIDA</button>) : (<p className="text-green-400 font-bold animate-pulse">Esperando al anfitrión...</p>)}
                </div>
            </div>
        ) : (
            <div className="w-full max-w-7xl flex flex-col items-center justify-between flex-grow relative z-10 pb-2 h-full">
                {/* RIVALES */}
                <div className="flex justify-around w-full mt-4 px-4">
                    {players.map((p, i) => {
                        if (i === myPlayerIndex) return null;
                        const isTurn = turnIndex === i;
                        let posClass = "flex-col items-center";
                        if (players.length === 4) {
                            const relativeIdx = (i - myPlayerIndex + players.length) % players.length;
                            if (relativeIdx === 1) posClass = "flex-col items-start absolute left-4 top-1/3"; 
                            if (relativeIdx === 2) posClass = "flex-col items-center"; 
                            if (relativeIdx === 3) posClass = "flex-col items-end absolute right-4 top-1/3"; 
                        }
                        return (
                            <div key={p.id} className={`flex ${posClass} transition-all p-3 rounded-2xl ${isTurn ? 'bg-white/10 scale-110 shadow-lg border border-white/20' : 'opacity-60 scale-90'}`}>
                                <div className="relative"><div className="w-12 h-12 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center mb-2 shadow-lg"><span className="text-lg font-black">{p.hand.length}</span></div>{isTurn && <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full animate-ping border-2 border-black"></div>}</div>
                                <span className="text-[10px] font-bold uppercase tracking-widest truncate max-w-[80px] bg-black/50 px-2 py-1 rounded-full">{p.name}</span>
                                <div className="flex -space-x-4 mt-2 scale-75 origin-top">{p.hand.slice(0, Math.min(p.hand.length, 5)).map((_:any, idx:number) => <Card key={idx} hidden small />)}</div>
                            </div>
                        )
                    })}
                </div>

                {/* MESA CENTRAL */}
                <div className="flex gap-8 items-center justify-center my-4 sm:my-8 relative z-10">
                    <div onClick={handleDeckClick} className={`cursor-pointer relative group transition-transform ${turnIndex===myPlayerIndex && isDrawPending===0 ? 'hover:scale-105' : ''}`}>
                        <Card hidden />
                        {turnIndex === myPlayerIndex && isDrawPending === 0 && (<div className="absolute inset-0 flex items-center justify-center bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="text-white w-10 h-10"/></div>)}
                    </div>
                    <div className="relative">
                        {discard.length > 0 && <Card card={discard[discard.length-1]} />}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><RotateCw strokeWidth={1} className={`w-32 h-32 text-white/5 transition-all duration-500 ${direction === 1 ? 'animate-[spin_4s_linear_infinite]' : 'animate-[spin_4s_linear_infinite_reverse]'}`}/></div>
                        <div className={`absolute -right-4 -top-4 w-8 h-8 rounded-full border-4 border-slate-900 shadow-xl z-20 ${currentColor === 'red' ? 'bg-red-600' : currentColor === 'blue' ? 'bg-blue-600' : currentColor === 'green' ? 'bg-green-600' : currentColor === 'yellow' ? 'bg-yellow-500' : 'bg-black'}`} title={`Color: ${currentColor.toUpperCase()}`}></div>
                    </div>
                </div>

                {/* LOG */}
                <div className="mb-4 text-center h-16 flex flex-col justify-end z-20">
                    <p className={`text-sm sm:text-base font-bold transition-all drop-shadow-md ${turnIndex===myPlayerIndex ? 'text-yellow-400 scale-105' : 'text-slate-300'}`}>{log}</p>
                    {isDrawPending > 0 && <p className="text-xs text-red-500 font-black mt-1 animate-pulse uppercase tracking-wider bg-red-950/50 px-3 py-1 rounded-full mx-auto inline-block border border-red-500/30">¡Acumulado +{isDrawPending}!</p>}
                    {turnIndex === myPlayerIndex && <p className="text-xs text-green-400 font-black mt-1 animate-bounce uppercase tracking-wider bg-green-950/50 px-3 py-1 rounded-full mx-auto inline-block border border-green-500/30">¡Tu Turno!</p>}
                </div>

                {/* MANO + BOTÓN JUGAR */}
                <div className="w-full px-4 pb-4 relative z-30 flex flex-col items-center gap-4">
                    {selectedCardIds.length > 0 && turnIndex === myPlayerIndex && (
                        <button onClick={playSelectedCards} className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black py-3 px-8 rounded-full shadow-lg hover:shadow-green-500/50 transition-all scale-105 active:scale-95 flex items-center gap-2 animate-in slide-in-from-bottom">
                            <Hand className="w-5 h-5"/> JUGAR {selectedCardIds.length} CARTA(S)
                        </button>
                    )}
                    <div className={`flex justify-center items-end -space-x-6 sm:-space-x-10 transition-all py-6 px-2 ${turnIndex !== myPlayerIndex ? 'opacity-70 grayscale-[0.3] pointer-events-none' : ''}`} style={{ perspective: '1000px' }}>
                        {players[myPlayerIndex]?.hand.map((card: CardType, i: number) => {
                            const total = players[myPlayerIndex].hand.length;
                            const rotate = (i - (total - 1) / 2) * 3; 
                            const translateY = Math.abs(i - (total - 1) / 2) * 4;
                            const isSelected = selectedCardIds.includes(card.id);
                            return (
                                <div key={card.id} style={{ transform: `rotate(${rotate}deg) translateY(${translateY}px)`, zIndex: i }} className="origin-bottom transition-all duration-300">
                                    <Card card={card} onClick={() => handleCardClick(card)} selectable={turnIndex === myPlayerIndex} isSelected={isSelected}/>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* MODALES */}
                {activeColorSelect && (
                    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center animate-in fade-in backdrop-blur-sm">
                        <div className="bg-slate-900 p-8 rounded-[2rem] border-2 border-slate-700 text-center shadow-2xl max-w-sm w-full mx-4">
                            <h3 className="text-2xl font-black mb-8 text-white italic uppercase bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600 animate-pulse">Elige Color</h3>
                            <div className="grid grid-cols-2 gap-6">
                                {COLORS.map(c => (<button key={c} onClick={() => handleColorSelect(c)} className={`w-full aspect-square rounded-2xl ${c==='red'?'bg-red-600':c==='blue'?'bg-blue-600':c==='green'?'bg-green-600':'bg-yellow-500'} hover:scale-105 active:scale-95 transition-all shadow-xl border-4 border-white/10`}></button>))}
                            </div>
                        </div>
                    </div>
                )}
                <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-40">
                    <button onClick={() => setShowRules(true)} className="p-3 bg-slate-900/90 rounded-full border border-slate-600 text-slate-300 hover:text-white hover:border-yellow-500 transition-all shadow-lg hover:scale-110 group relative" title="Reglas"><BookOpen className="w-5 h-5"/></button>
                </div>
                
                {/* MODAL DE REGLAS PROFESIONAL */}
                {showRules && (
                    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-md" onClick={()=>setShowRules(false)}>
                        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-700 max-w-2xl w-full shadow-2xl relative overflow-y-auto max-h-[85vh] text-left" onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>setShowRules(false)} className="absolute top-4 right-4 p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition"><ArrowLeft className="w-4 h-4"/></button>
                            
                            <h2 className="text-3xl font-black text-yellow-500 mb-6 uppercase italic flex items-center gap-3 border-b border-slate-700 pb-4">
                                <BookOpen className="w-8 h-8"/> Reglamento Oficial
                            </h2>

                            <div className="space-y-6 text-sm text-slate-300 font-sans leading-relaxed">
                                <section>
                                    <h3 className="text-white font-bold text-lg mb-2 uppercase tracking-wider flex items-center gap-2"><Trophy className="w-4 h-4 text-green-500"/> 1. Objetivo</h3>
                                    <p>Ser el primer jugador en quedarse sin cartas en la mano. Cuando te quede una sola carta, ¡el juego te avisará automáticamente!</p>
                                </section>

                                <section>
                                    <h3 className="text-white font-bold text-lg mb-2 uppercase tracking-wider flex items-center gap-2"><PlayCircle className="w-4 h-4 text-blue-500"/> 2. Cómo Jugar</h3>
                                    <p className="mb-2">En tu turno, debes jugar una carta que coincida con la carta superior del mazo de descarte en:</p>
                                    <ul className="list-disc pl-5 space-y-1 text-white">
                                        <li><strong className="text-yellow-500">COLOR</strong> (Ej: Azul con Azul)</li>
                                        <li><strong className="text-yellow-500">NÚMERO</strong> (Ej: 7 con 7)</li>
                                        <li><strong className="text-yellow-500">SÍMBOLO</strong> (Ej: +2 con +2)</li>
                                    </ul>
                                    <p className="mt-2 text-xs text-slate-400 bg-slate-800 p-2 rounded">💡 Si no tienes ninguna carta válida, debes pulsar el mazo para <strong>ROBAR</strong> una carta. Si la carta robada sirve, puedes jugarla inmediatamente.</p>
                                </section>

                                <section>
                                    <h3 className="text-white font-bold text-lg mb-2 uppercase tracking-wider flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500"/> 3. Cartas Especiales</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                                            <strong className="text-blue-400 flex items-center gap-2"><Ban className="w-4 h-4"/> Bloqueo / Salto</strong>
                                            <p className="text-xs mt-1">El siguiente jugador pierde su turno.</p>
                                        </div>
                                        <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                                            <strong className="text-green-400 flex items-center gap-2"><RefreshCw className="w-4 h-4"/> Reversa</strong>
                                            <p className="text-xs mt-1">Invierte el sentido del juego (de horario a antihorario).</p>
                                        </div>
                                        <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                                            <strong className="text-yellow-400 flex items-center gap-2"><Layers className="w-4 h-4"/> Toma Dos (+2)</strong>
                                            <p className="text-xs mt-1">El siguiente jugador roba 2 cartas y pierde el turno. ¡Son acumulables!</p>
                                        </div>
                                        <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                                            <strong className="text-purple-400 flex items-center gap-2"><Sparkles className="w-4 h-4"/> Comodín / +4</strong>
                                            <p className="text-xs mt-1">Cambia el color activo. El +4 además obliga al siguiente a robar 4 cartas.</p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                )}

                {winner && (
                    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center animate-in zoom-in p-4 backdrop-blur-md">
                        {winner.id === players[myPlayerIndex]?.id ? (
                            <div className="bg-gradient-to-br from-yellow-600/20 to-slate-900/50 p-12 rounded-[3rem] border-4 border-yellow-500 text-center shadow-[0_0_100px_rgba(234,179,8,0.5)]">
                                <Trophy className="w-32 h-32 text-yellow-400 animate-bounce mx-auto mb-6"/>
                                <h1 className="text-6xl font-black text-white italic tracking-tighter mb-2">¡VICTORIA!</h1>
                                <p className="text-yellow-200 font-mono tracking-widest text-lg mb-8">PUNTOS: <span className="font-black text-2xl">{score}</span></p>
                            </div>
                        ) : (
                            <div className="bg-gradient-to-br from-red-900/20 to-slate-900/50 p-12 rounded-[3rem] border-4 border-red-600 text-center shadow-[0_0_100px_rgba(220,38,38,0.5)]">
                                <AlertCircle className="w-32 h-32 text-red-600 animate-pulse mx-auto mb-6"/>
                                <h1 className="text-6xl font-black text-white italic tracking-tighter mb-2">DERROTA</h1>
                                <p className="text-red-300 font-mono tracking-widest text-lg mb-8">Ganó <span className="font-bold">{winner.name}</span>.</p>
                            </div>
                        )}
                        <button onClick={() => window.location.reload()} className="mt-12 px-12 py-5 bg-white text-black font-black rounded-full hover:scale-105 hover:bg-slate-200 transition uppercase tracking-widest shadow-2xl flex items-center gap-3 text-lg"><RotateCw className="w-6 h-6"/> JUGAR DE NUEVO</button>
                    </div>
                )}
            </div>
        )}
        <div className="mt-auto w-full max-w-md pt-4 opacity-60 relative z-10"><AdSpace type="banner" /><GameChat gameId={roomCode || "global_uno"} gameName="UNO PRO" /></div>
    </div>
  );
}