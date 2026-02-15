// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Users, Zap, RotateCw, Layers, Crown, Sparkles, Trophy, 
  Ban, RefreshCw, PlusSquare, Palette, PlayCircle, AlertOctagon, Copy, Hand,
  Coins, Loader2, Play
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, onSnapshot, serverTimestamp, setDoc, collection, addDoc, query, orderBy, limit, getDocs, arrayUnion } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';
import Link from 'next/link';

// --- CONFIGURACIÓN ---
const COLORS = ['red', 'blue', 'green', 'yellow'];
const SPECIALS = ['skip', 'reverse', 'draw2'];
const WILDS = ['wild', 'draw4'];

// --- UTILIDADES ---
const createDeck = () => {
  const deck = [];
  let id = 0;
  COLORS.forEach(color => {
    deck.push({ id: `c${id++}`, color, type: 'number', value: '0', score: 0 });
    for (let i = 1; i <= 9; i++) {
        deck.push({ id: `c${id++}`, color, type: 'number', value: `${i}`, score: i });
        deck.push({ id: `c${id++}`, color, type: 'number', value: `${i}`, score: i });
    }
    SPECIALS.forEach(type => {
        deck.push({ id: `c${id++}`, color, type, value: type, score: 20 });
        deck.push({ id: `c${id++}`, color, type, value: type, score: 20 });
    });
  });
  WILDS.forEach(type => {
      for(let i=0; i<4; i++) deck.push({ id: `w${id++}`, color: 'black', type, value: type, score: 50 });
  });
  return deck.sort(() => Math.random() - 0.5);
};

// --- COMPONENTE CARTA PRO ---
const Card = ({ card, onClick, playable, hidden, small, isSelected }) => {
    
    if (hidden) {
        return (
            <div className={`${small ? 'w-10 h-14 border-2' : 'w-24 h-36 sm:w-28 sm:h-44 border-[5px]'} rounded-xl bg-slate-950 border-white shadow-[0_10px_20px_rgba(0,0,0,0.5)] flex items-center justify-center relative overflow-hidden group select-none`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,0,0,0.4),transparent)]"></div>
                <div className="w-[85%] h-[65%] bg-red-600 rounded-[50%] transform -rotate-[20deg] flex items-center justify-center border-2 sm:border-4 border-white shadow-inner">
                    <span className={`font-black italic text-yellow-400 ${small ? 'text-sm' : 'text-3xl sm:text-4xl'} drop-shadow-[2px_2px_0px_black]`} style={{textShadow: '2px 2px 0px #000'}}>UNO</span>
                </div>
            </div>
        );
    }

    const getColorClass = (c) => {
        switch(c) {
            case 'red': return 'bg-[#ef4444]'; // Tailwind red-500
            case 'blue': return 'bg-[#3b82f6]'; // Tailwind blue-500
            case 'green': return 'bg-[#22c55e]'; // Tailwind green-500
            case 'yellow': return 'bg-[#eab308]'; // Tailwind yellow-500
            default: return 'bg-slate-900'; 
        }
    };

    const getTextClass = (c) => {
        switch(c) {
            case 'red': return 'text-[#ef4444]';
            case 'blue': return 'text-[#3b82f6]';
            case 'green': return 'text-[#22c55e]';
            case 'yellow': return 'text-[#d97706]'; // Darker yellow for white bg
            default: return 'text-slate-900';
        }
    };

    const bgClass = getColorClass(card.color);
    const textClass = getTextClass(card.color);
    
    const getInnerContent = () => {
        const shadowStyle = { filter: "drop-shadow(1.5px 1.5px 0px black)" };
        const numStyle = { textShadow: '2px 2px 0px #000, -1px -1px 0px #000' };

        if (card.type === 'number') 
            return <span className={`text-6xl sm:text-7xl font-black italic ${textClass}`} style={numStyle}>{card.value}</span>;
        
        if (card.value === 'skip') 
            return <Ban className={`w-12 h-12 sm:w-16 sm:h-16 ${textClass}`} strokeWidth={3} style={shadowStyle}/>;
        
        if (card.value === 'reverse') 
            return <RefreshCw className={`w-12 h-12 sm:w-16 sm:h-16 ${textClass}`} strokeWidth={3} style={shadowStyle}/>;
        
        if (card.value === 'draw2') 
            return <div className={`flex items-center leading-none ${textClass}`} style={numStyle}><PlusSquare className="w-8 h-8 mr-[-5px] fill-current"/><span className="font-black text-5xl italic">+2</span></div>;
        
        if (card.value === 'draw4') 
            return (
                <div className="flex flex-col items-center justify-center">
                    <div className="flex -space-x-3 mb-1">
                        <div className="w-4 h-6 bg-red-500 border border-white rounded-sm shadow-sm"></div>
                        <div className="w-4 h-6 bg-blue-500 border border-white rounded-sm mt-2 shadow-sm"></div>
                        <div className="w-4 h-6 bg-green-500 border border-white rounded-sm shadow-sm"></div>
                        <div className="w-4 h-6 bg-yellow-500 border border-white rounded-sm mt-2 shadow-sm"></div>
                    </div>
                    <span className="font-black text-4xl text-white italic drop-shadow-[2px_2px_0px_black]" style={{textShadow: '2px 2px 0px #000'}}>+4</span>
                </div>
            );

        if (card.value === 'wild') 
            return (
                <div className="grid grid-cols-2 gap-0.5 rotate-45 w-12 h-12 sm:w-14 sm:h-14">
                    <div className="w-full h-full bg-red-500 rounded-tl-full shadow-inner"></div>
                    <div className="w-full h-full bg-blue-500 rounded-tr-full shadow-inner"></div>
                    <div className="w-full h-full bg-yellow-500 rounded-bl-full shadow-inner"></div>
                    <div className="w-full h-full bg-green-500 rounded-br-full shadow-inner"></div>
                </div>
            );
        return null;
    };

    const getCornerContent = () => {
        if (card.type === 'number') return card.value;
        if (card.value === 'draw2') return '+2';
        if (card.value === 'draw4') return '+4';
        if (card.value === 'wild') return 'W'; 
        if (card.value === 'skip') return 'Ø';
        if (card.value === 'reverse') return '⇄';
        return '';
    };

    return (
        <div 
            onClick={playable ? onClick : undefined}
            className={`
                relative rounded-xl flex flex-col items-center justify-center shadow-lg transition-all duration-200 select-none
                ${small ? 'w-10 h-14 border-2' : 'w-24 h-36 sm:w-28 sm:h-44 border-[5px] sm:border-[6px]'}
                ${bgClass} border-white
                ${playable ? 'cursor-pointer hover:-translate-y-6 hover:shadow-2xl hover:z-50' : ''}
                ${isSelected ? '-translate-y-8 z-40 ring-4 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)]' : ''}
            `}
        >
            <div className="absolute inset-1.5 bg-white rounded-[50%] transform -rotate-[15deg] shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)] flex items-center justify-center overflow-hidden">
                {getInnerContent()}
            </div>
            
            {!small && (
                <>
                    <div className="absolute top-1 left-1.5 text-base sm:text-lg font-black text-white drop-shadow-[1px_1px_0_rgba(0,0,0,0.8)]">
                        {getCornerContent()}
                    </div>
                    <div className="absolute bottom-1 right-1.5 text-base sm:text-lg font-black text-white drop-shadow-[1px_1px_0_rgba(0,0,0,0.8)] rotate-180">
                        {getCornerContent()}
                    </div>
                </>
            )}
        </div>
    );
};

export default function ProUno() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);
  const [view, setView] = useState('menu');

  // --- ESTADO JUEGO ---
  const [gameMode, setGameMode] = useState('pve');
  const [deck, setDeck] = useState([]);
  const [discard, setDiscard] = useState([]);
  const [players, setPlayers] = useState([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [currentColor, setCurrentColor] = useState('');
  const [winner, setWinner] = useState(null);
  const [isDrawPending, setIsDrawPending] = useState(0);
  const [log, setLog] = useState("¡Bienvenido a UNO!");
  const [moveCount, setMoveCount] = useState(0); 

  // --- UI & ONLINE ---
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [activeColorSelect, setActiveColorSelect] = useState(false);
  const tempWildCardRef = useRef(null);
  
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [myPlayerIndex, setMyPlayerIndex] = useState(-1);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingRank, setLoadingRank] = useState(true);
  
  // -- BETS --
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [currentBetInfo, setCurrentBetInfo] = useState(null);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    });
    fetchLeaderboard();
    return () => unsubscribe();
  }, []);

  // --- IA BOT REACTIVA ---
  useEffect(() => {
    if (gameMode === 'pve' && view === 'game' && !winner && players[turnIndex]?.isBot) {
        const timer = setTimeout(playBotTurn, 1200 + Math.random() * 800); 
        return () => clearTimeout(timer);
    }
  }, [turnIndex, moveCount, view, winner]);

  // --- SYNC ONLINE ---
  useEffect(() => {
      if (gameMode === 'pvp' && roomCode) {
          const unsub = onSnapshot(doc(db, "matches_uno", roomCode), (docSnap) => {
              if (docSnap.exists()) {
                  const data = docSnap.data();
                  setPlayers(data.players);
                  const myIdx = data.players.findIndex(p => p.uid === user?.uid);
                  setMyPlayerIndex(myIdx);
                  if (data.betInfo) setCurrentBetInfo(data.betInfo);

                  if (data.status === 'playing') {
                      if (view !== 'game') { setView('game'); playSound('start'); }
                      setDeck(data.gameState.deck.map(c => JSON.parse(c)));
                      setDiscard(data.gameState.discard.map(c => JSON.parse(c)));
                      setTurnIndex(data.gameState.turnIndex);
                      setDirection(data.gameState.direction);
                      setCurrentColor(data.gameState.currentColor);
                      setIsDrawPending(data.gameState.isDrawPending);
                      setLog(data.lastAction || 'Partida en curso');
                      if(data.winner) handleWin(data.winner.id, data.winner.name);
                  }
              }
          });
          return () => unsub();
      }
  }, [gameMode, roomCode, view]);

  // --- LÓGICA CORE ---
  const startPvE = (count) => {
      setGameMode('pve');
      const newDeck = createDeck();
      const newPlayers = [{ id: 'player', name: 'Tú', hand: newDeck.splice(0, 7), isBot: false, uid: user?.uid }];
      for(let i=1; i<count; i++) newPlayers.push({ id: `bot_${i}`, name: `CPU ${i}`, hand: newDeck.splice(0, 7), isBot: true });
      
      initGameLogic(newDeck, newPlayers);
      setView('game'); playSound('start');
  };

  const initGameLogic = (initialDeck, initialPlayers) => {
      let first = initialDeck.pop();
      while(first.color === 'black') { initialDeck.unshift(first); first = initialDeck.pop(); }
      
      setDeck(initialDeck); 
      setDiscard([first]); 
      setPlayers(initialPlayers);
      setCurrentColor(first.color); 
      setTurnIndex(0); 
      setDirection(1); 
      setWinner(null); 
      setIsDrawPending(0); 
      setMoveCount(0);
      setMyPlayerIndex(0); 
      setSelectedCardIds([]);
      setLog("¡Partida Iniciada!");
  };

  const isValidPlay = (card) => {
      const top = discard[discard.length-1];
      if (isDrawPending > 0) {
        if (top.value === 'draw2' && card.value === 'draw2') return true;
        if (top.value === 'draw4' && card.value === 'draw4') return true;
        return false;
      }
      return card.color === 'black' || card.color === currentColor || card.value === top.value;
  };

  const playBotTurn = () => {
      const bot = players[turnIndex];
      const validCards = bot.hand.filter(c => isValidPlay(c));
      
      if (validCards.length > 0) {
          validCards.sort((a,b) => b.score - a.score);
          const card = validCards[0];
          
          let nextColor = card.color;
          if (card.color === 'black') {
              const counts = { red:0, blue:0, green:0, yellow:0 };
              bot.hand.forEach(c => { if(c.color!=='black') counts[c.color]++ });
              nextColor = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
          }
          executePlay(bot.id, [card], nextColor);
      } else {
          executeDraw(bot.id);
      }
  };

  const executePlay = async (playerId, cards, chosenColor) => {
      playSound('drop');
      let newPlayers = [...players];
      let playerHand = newPlayers.find(p => p.id === playerId).hand;
      let newDiscard = [...discard];
      let lastCard = cards[0]; 
      let nextDir = direction;
      let skipTurn = false;
      let drawAmount = 0;
      let logMsg = `${players[turnIndex].name} juega ${lastCard.value}`;

      cards.forEach(card => {
          playerHand = playerHand.filter(c => c.id !== card.id);
          newDiscard.push(card);
          
          if (card.value === 'reverse') {
              if (players.length === 2) skipTurn = !skipTurn; 
              else nextDir *= -1;
          }
          if (card.value === 'skip') skipTurn = !skipTurn;
          if (card.value === 'draw2') drawAmount += 2;
          if (card.value === 'draw4') drawAmount += 4;
      });

      newPlayers = newPlayers.map(p => p.id === playerId ? { ...p, hand: playerHand } : p);
      
      if (playerHand.length === 0) {
          handleWin(playerId, players.find(p=>p.id===playerId).name); 
          return;
      }
      
      if (playerHand.length === 1) {
          playSound('alert');
          logMsg += " - ¡UNO!";
      }

      let nextIdx = (turnIndex + nextDir + players.length) % players.length;
      if (skipTurn) nextIdx = (nextIdx + nextDir + players.length) % players.length;

      updateState({
          deck, discard: newDiscard, players: newPlayers, 
          turnIndex: nextIdx, direction: nextDir, 
          currentColor: chosenColor || lastCard.color, 
          isDrawPending: isDrawPending + drawAmount
      }, logMsg);
      
      setSelectedCardIds([]); 
  };

  const executeDraw = (playerId, forcedAmount) => {
      let currentDeck = [...deck];
      let currentDiscard = [...discard];
      const count = forcedAmount || 1;
      const drawn = [];

      for(let i=0; i<count; i++) {
          if (currentDeck.length === 0) {
              if (currentDiscard.length <= 1) break; 
              const top = currentDiscard.pop();
              currentDeck = currentDiscard.sort(()=>Math.random()-0.5);
              currentDiscard = [top];
          }
          drawn.push(currentDeck.pop());
      }
      
      playSound('card');
      const newPlayers = players.map(p => p.id === playerId ? { ...p, hand: [...p.hand, ...drawn] } : p);
      const nextIdx = (turnIndex + direction + players.length) % players.length;
      
      updateState({
          deck: currentDeck, discard: currentDiscard, players: newPlayers,
          turnIndex: nextIdx, direction, currentColor, isDrawPending: 0
      }, `${players[turnIndex].name} roba ${drawn.length}`);
  };

  const updateState = async (newState, actionLog) => {
      if (gameMode === 'pve') {
          setDeck(newState.deck); setDiscard(newState.discard); setPlayers(newState.players);
          setTurnIndex(newState.turnIndex); setDirection(newState.direction); setCurrentColor(newState.currentColor);
          setIsDrawPending(newState.isDrawPending); setLog(actionLog);
          setMoveCount(prev => prev + 1); 
      } else {
          const serialized = {
              ...newState,
              deck: newState.deck.map(c=>JSON.stringify(c)),
              discard: newState.discard.map(c=>JSON.stringify(c)),
              players: newState.players.map(p => ({...p, hand: p.hand.map(c=>JSON.stringify(c))}))
          };
          await updateDoc(doc(db, "matches_uno", roomCode), { gameState: serialized, lastAction: actionLog });
      }
  };

  // --- INTERACCIÓN ---
  const handleCardClick = (card) => {
      if (turnIndex !== myPlayerIndex) return;
      
      if (card.color === 'black') {
          if (isValidPlay(card)) {
              tempWildCardRef.current = card;
              setActiveColorSelect(true);
              setSelectedCardIds([]); 
          } else {
              playSound('error');
          }
          return;
      }

      setSelectedCardIds(prev => {
          if (prev.includes(card.id)) return prev.filter(id => id !== card.id);
          const first = players[myPlayerIndex].hand.find(c => c.id === prev[0]);
          if (prev.length === 0 || (first && card.value === first.value && isValidPlay(card, true))) {
              playSound('click');
              return [...prev, card.id];
          }
          playSound('error');
          return prev;
      });
  };

  const playSelected = () => {
      if (selectedCardIds.length === 0) return;
      const hand = players[myPlayerIndex].hand;
      const toPlay = selectedCardIds.map(id => hand.find(c => c.id === id));
      
      if (!isValidPlay(toPlay[0])) { 
          playSound('error'); setLog("Jugada no válida"); setSelectedCardIds([]); return; 
      }
      executePlay(players[myPlayerIndex].id, toPlay);
  };

  const handleColorSelect = (color) => {
      setActiveColorSelect(false);
      if(tempWildCardRef.current) {
          executePlay(players[myPlayerIndex].id, [tempWildCardRef.current], color);
          tempWildCardRef.current = null;
      }
  };

  const handleDeckClick = () => {
      if (turnIndex !== myPlayerIndex) return;
      if (isDrawPending > 0) executeDraw(players[myPlayerIndex].id, isDrawPending);
      else executeDraw(players[myPlayerIndex].id);
  };

  const handleWin = (wId, wName) => {
      setWinner({ id: wId, name: wName });
      const isMe = wId === user?.uid;
      playSound(isMe ? 'win' : 'lose');
      if (isMe && gameMode === 'pve') {
          addCoins(100, "Victoria UNO");
          saveScore(100);
      }
  };

  // --- ONLINE ROOMS ---
  const createRoom = async () => {
      if (!user) return alert("Inicia sesión para jugar online");
      if (betType === 'money' && coins < betAmount) return alert("Fondos insuficientes");
      if (betType === 'money') await spendCoins(betAmount, "Apuesta UNO");

      playSound('click');
      const betInfo = { type: betType, value: betType === 'money' ? betAmount : betText || 'Honor' };
      const code = Math.random().toString(36).substring(2, 7).toUpperCase();
      const deck = createDeck();
      const me = { id: `p_${user.uid}`, name: user.name, hand: [], uid: user.uid, isHost: true };
      
      await setDoc(doc(db, "matches_uno", code), {
          hostId: user.uid, status: 'waiting', players: [me], betInfo, createdAt: serverTimestamp(),
          gameState: { deck: deck.map(c=>JSON.stringify(c)), discard: [], turnIndex:0, direction:1, currentColor:'', isDrawPending:0 }
      });
      setRoomCode(code); setIsHost(true); setCurrentBetInfo(betInfo); setGameMode('pvp'); setView('lobby');
  };

  const joinRoom = async (codeInput) => {
      if (!user) return alert("Inicia sesión para jugar online");
      if (!codeInput) return;
      playSound('click');
      
      const ref = doc(db, "matches_uno", codeInput);
      const snap = await getDoc(ref);
      if (!snap.exists() || snap.data().status !== 'waiting') return alert("Sala no disponible o ya en juego");
      
      const data = snap.data();
      if (data.betInfo?.type === 'money') {
          if (coins < data.betInfo.value) return alert("Fondos insuficientes para esta mesa");
          await spendCoins(data.betInfo.value, "Apuesta UNO");
      }

      const me = { id: `p_${user.uid}`, name: user.name, hand: [], uid: user.uid, isHost: false };
      await updateDoc(ref, { players: arrayUnion(me) });
      setRoomCode(codeInput); setIsHost(false); setCurrentBetInfo(data.betInfo); setGameMode('pvp'); setView('lobby');
  };

  const startOnline = async () => {
      if (players.length < 2) return alert("Esperando jugadores...");
      playSound('start');
      const ref = doc(db, "matches_uno", roomCode);
      const data = (await getDoc(ref)).data();
      let deck = data.gameState.deck.map(c=>JSON.parse(c));
      
      const updatedPlayers = players.map(p => ({ ...p, hand: deck.splice(0, 7).map(c=>JSON.stringify(c)) }));
      let first = deck.pop();
      while(first.color === 'black') { deck.unshift(first); first = deck.pop(); }

      const state = {
          deck: deck.map(c=>JSON.stringify(c)),
          discard: [JSON.stringify(first)],
          players: updatedPlayers,
          turnIndex: 0, direction: 1, currentColor: first.color, isDrawPending: 0
      };
      await updateDoc(ref, { status: 'playing', gameState: state, players: updatedPlayers, lastAction: "¡La partida ha comenzado!" });
  };

  // --- DB HELPERS ---
  const saveScore = async (s) => { 
      if(user) {
          await addDoc(collection(db, "scores_uno"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); 
          fetchLeaderboard(); 
      }
  };
  
  const fetchLeaderboard = async () => { 
      setLoadingRank(true);
      try { 
          const q = query(collection(db, "scores_uno"), orderBy("score", "desc"), limit(5)); 
          const s = await getDocs(q); 
          setLeaderboard(s.docs.map(d=>d.data())); 
      } catch(e) { console.error(e); } finally { setLoadingRank(false); }
  };

  // --- CÁLCULO DE COLORES PARA EL FONDO ---
  const getGlowColor = () => {
      switch(currentColor) {
          case 'red': return 'rgba(239, 68, 68, 0.15)';
          case 'blue': return 'rgba(59, 130, 246, 0.15)';
          case 'green': return 'rgba(34, 197, 94, 0.15)';
          case 'yellow': return 'rgba(234, 179, 8, 0.15)';
          default: return 'rgba(255, 255, 255, 0.05)';
      }
  };

  return (
    <div 
        className="min-h-screen flex flex-col items-center p-2 font-mono text-white overflow-hidden relative transition-colors duration-1000 bg-[#020617] select-none"
        style={{ backgroundImage: `radial-gradient(circle at center, ${getGlowColor()} 0%, #020617 100%)` }}
    >
        {/* HEADER PRO */}
        <div className="w-full max-w-6xl flex justify-between items-center py-4 px-2 shrink-0 z-10 relative mt-2">
            <button onClick={() => view==='menu'?window.location.href='/':setView('menu')} className="p-2 sm:p-3 bg-slate-900/50 rounded-full border border-slate-700 hover:border-white transition shadow-lg backdrop-blur-md"><ArrowLeft className="w-5 h-5"/></button>
            
            <div className="text-center">
                <h1 className="text-3xl sm:text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-400 to-blue-500 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" style={{WebkitTextStroke: '1px rgba(255,255,255,0.3)'}}>UNO</h1>
                <p className="text-[8px] sm:text-[10px] text-white/60 font-bold uppercase tracking-[0.5em]">Classic Pro</p>
            </div>

            <div className="bg-slate-900/90 backdrop-blur-md px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-yellow-500/30 flex items-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.1)]">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-md">
                    <Coins className="w-3 h-3 text-black fill-current" />
                </div>
                <span className="text-xs sm:text-sm font-black text-yellow-400 tabular-nums">{coins.toLocaleString()}</span>
            </div>
        </div>

        {/* VISTAS */}
        {view === 'menu' ? (
            <div className="w-full max-w-md grid gap-5 animate-in fade-in zoom-in mt-6 z-10 px-2 flex-grow overflow-y-auto no-scrollbar">
                
                {/* MODO SOLITARIO */}
                <div className="bg-slate-900/80 p-6 rounded-[2rem] border border-slate-700 shadow-2xl backdrop-blur-md">
                    <h2 className="text-xs font-bold text-slate-400 mb-4 flex gap-2 tracking-widest items-center uppercase"><Layers className="w-4 h-4 text-purple-400"/> Modo Solitario</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => startPvE(2)} className="py-4 bg-slate-950 hover:bg-slate-800 border-2 border-purple-500/50 rounded-xl font-black text-purple-400 transition-all shadow-lg active:scale-95 flex flex-col items-center gap-1">
                            <span className="text-xl">1 vs 1</span>
                        </button>
                        <button onClick={() => startPvE(4)} className="py-4 bg-slate-950 hover:bg-slate-800 border-2 border-rose-500/50 rounded-xl font-black text-rose-400 transition-all shadow-lg active:scale-95 flex flex-col items-center gap-1">
                            <span className="text-xl">4 Jugadores</span>
                        </button>
                    </div>
                </div>

                {/* MODO ONLINE */}
                <div className="bg-slate-900/80 p-6 rounded-[2rem] border border-slate-700 shadow-2xl backdrop-blur-md">
                    <h2 className="text-xs font-bold text-slate-400 mb-4 flex gap-2 tracking-widest items-center uppercase"><Users className="w-4 h-4 text-blue-400"/> Multijugador Online</h2>
                    
                    {/* APUESTAS UI */}
                    <div className="mb-4 bg-black/40 p-4 rounded-2xl border border-white/5">
                        <div className="flex gap-2 mb-3 bg-slate-950 p-1 rounded-lg">
                            <button onClick={() => setBetType('money')} className={`flex-1 py-2 text-[10px] font-black tracking-widest rounded uppercase transition-colors ${betType==='money'?'bg-yellow-500 text-black':'text-slate-500 hover:text-white'}`}>Monedas</button>
                            <button onClick={() => setBetType('text')} className={`flex-1 py-2 text-[10px] font-black tracking-widest rounded uppercase transition-colors ${betType==='text'?'bg-pink-500 text-black':'text-slate-500 hover:text-white'}`}>Reto Libre</button>
                        </div>
                        {betType === 'money' ? (
                            <div className="relative">
                                <Coins className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500"/>
                                <input type="number" value={betAmount} onChange={(e)=>setBetAmount(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 pl-10 text-yellow-400 font-black outline-none focus:border-yellow-500 transition-colors"/>
                            </div>
                        ) : (
                            <input type="text" value={betText} onChange={(e)=>setBetText(e.target.value)} placeholder="Ej: Paga la cena" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-center text-white text-xs font-bold outline-none focus:border-pink-500 transition-colors"/>
                        )}
                    </div>
                    
                    <div className="flex gap-2 flex-col sm:flex-row">
                        <button onClick={createRoom} className="w-full sm:flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-900/20 active:scale-95 transition-all">CREAR SALA</button>
                        <div className="flex w-full sm:flex-1 gap-2">
                            <input id="codeInput" placeholder="CODE" maxLength={5} className="flex-1 bg-slate-950 border border-slate-700 rounded-xl text-center font-black outline-none focus:border-blue-500 uppercase"/>
                            <button onClick={() => joinRoom(document.getElementById('codeInput').value.toUpperCase())} className="px-4 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-colors active:scale-95"><Play className="w-4 h-4 fill-current"/></button>
                        </div>
                    </div>
                </div>

                {/* RANKING */}
                <div className="bg-slate-900/50 p-5 rounded-[2rem] border border-slate-800 mb-4">
                    <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-3 text-center tracking-widest">Top Jugadores</h3>
                    {loadingRank ? <Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto"/> : leaderboard.length>0 ? leaderboard.map((s,i)=>(
                        <div key={i} className="flex justify-between items-center text-[10px] py-2 border-b border-white/5 last:border-0 text-slate-300">
                            <span className="font-bold text-white flex gap-2"><span>#{i+1}</span> {s.displayName}</span>
                            <span className="text-yellow-400 font-black">{s.score} PTS</span>
                        </div>
                    )) : <p className="text-[10px] text-slate-600 text-center">Sin récords</p>}
                </div>
            </div>

        ) : view === 'lobby' ? (
            <div className="w-full max-w-sm flex flex-col items-center justify-center flex-grow z-10 animate-in fade-in px-4">
                <div className="bg-slate-900/90 p-8 rounded-[2.5rem] border border-slate-700 text-center shadow-2xl backdrop-blur-md w-full relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500"></div>
                    <h2 className="text-xs font-bold text-slate-400 mb-6 uppercase tracking-widest">Sala de Espera</h2>
                    
                    <div className="bg-slate-950 p-4 rounded-2xl mb-6 border border-slate-800 flex items-center justify-center gap-4 group cursor-pointer hover:border-slate-600 transition-colors" onClick={() => {navigator.clipboard.writeText(roomCode); playSound('click');}}>
                        <span className="text-4xl font-black tracking-[0.2em] text-white">{roomCode}</span>
                        <Copy className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors"/>
                    </div>
                    
                    <div className="w-full mb-8 space-y-2">
                        {players.map((p, i) => (
                            <div key={i} className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2.5 h-2.5 rounded-full ${p.isHost?'bg-yellow-500':'bg-green-500'} shadow-[0_0_8px_currentColor]`}></div>
                                    <span className="font-bold text-sm text-white">{p.name}</span>
                                </div>
                                {p.isHost && <Crown className="w-4 h-4 text-yellow-500"/>}
                            </div>
                        ))}
                    </div>
                    
                    {isHost ? (
                        <button onClick={startOnline} disabled={players.length<2} className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-xl font-black uppercase tracking-widest transition shadow-lg disabled:opacity-50 disabled:grayscale active:scale-95 text-xs">COMENZAR PARTIDA</button> 
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-500"/>
                            <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Esperando al anfitrión...</p>
                        </div>
                    )}
                </div>
            </div>

        ) : (
            <div className="w-full max-w-7xl flex flex-col items-center justify-between flex-grow relative z-10 pb-4 h-full">
                
                {/* RIVALES (Top Bar) */}
                <div className="flex justify-center gap-3 sm:gap-6 w-full mt-2 px-2 overflow-x-auto no-scrollbar py-2">
                    {players.map((p, i) => {
                        if (i === myPlayerIndex) return null;
                        const isHisTurn = turnIndex === i;
                        return (
                            <div key={i} className={`flex flex-col items-center p-2 rounded-2xl transition-all duration-300 ${isHisTurn ? 'bg-slate-800/80 scale-110 border border-white/20 shadow-lg' : 'opacity-60 scale-90'}`}>
                                <div className="relative">
                                    <div className="w-12 h-12 rounded-full bg-slate-950 border-2 border-slate-700 flex items-center justify-center font-black text-xl shadow-inner text-white">{p.hand.length}</div>
                                    {isHisTurn && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div>}
                                </div>
                                <span className="text-[10px] font-bold mt-2 uppercase bg-black/60 px-3 py-1 rounded-full truncate max-w-[100px] border border-white/5">{p.name}</span>
                            </div>
                        );
                    })}
                </div>

                {/* MESA CENTRAL */}
                <div className="flex gap-4 sm:gap-12 items-center justify-center flex-grow relative w-full">
                    {/* Mazo Robo */}
                    <div onClick={handleDeckClick} className={`relative transition-transform duration-200 ${turnIndex===myPlayerIndex && isDrawPending===0 ? 'hover:scale-105 hover:-translate-y-2 cursor-pointer' : ''}`}>
                        <Card hidden />
                        {turnIndex===myPlayerIndex && isDrawPending===0 && <div className="absolute inset-0 bg-white/10 rounded-xl animate-pulse pointer-events-none ring-2 ring-white/50"></div>}
                        {/* Shadow stack effect */}
                        <div className="absolute top-1 left-1 w-full h-full bg-slate-950 border-2 border-white/20 rounded-xl -z-10"></div>
                        <div className="absolute top-2 left-2 w-full h-full bg-slate-950 border-2 border-white/10 rounded-xl -z-20"></div>
                    </div>

                    {/* Pila Descarte */}
                    <div className="relative">
                        {discard.length > 0 && (
                            <div className="relative z-10 animate-in zoom-in duration-300 transform rotate-6 drop-shadow-2xl">
                                <Card card={discard[discard.length-1]} />
                            </div>
                        )}
                        {/* Indicador Sentido (Flechas rotando debajo) */}
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0 scale-150">
                            <RefreshCw className={`w-32 h-32 opacity-10 ${direction===1 ? 'animate-[spin_10s_linear_infinite]' : 'animate-[spin_10s_linear_infinite_reverse]'} ${currentColor==='red'?'text-red-500':currentColor==='blue'?'text-blue-500':currentColor==='green'?'text-green-500':currentColor==='yellow'?'text-yellow-500':'text-white'}`} strokeWidth={1}/>
                        </div>
                    </div>
                </div>

                {/* LOG DEL JUEGO & INDICADOR DE TURNO */}
                <div className="w-full max-w-md text-center mb-4 h-16 flex flex-col justify-end items-center z-20">
                    <div className={`px-6 py-1.5 rounded-full font-black text-xs sm:text-sm uppercase tracking-widest shadow-lg border mb-2 transition-colors ${turnIndex===myPlayerIndex ? 'bg-green-500 text-black border-green-400 animate-pulse' : 'bg-slate-900/80 text-white/50 border-slate-700'}`}>
                        {turnIndex===myPlayerIndex ? 'ES TU TURNO' : `Turno de ${players[turnIndex]?.name}`}
                    </div>
                    <p className="text-[10px] sm:text-xs font-bold text-white/80 drop-shadow-md bg-black/40 backdrop-blur-sm py-1 px-4 rounded-full border border-white/5">{log}</p>
                    {isDrawPending > 0 && <p className="text-[10px] text-red-400 font-black uppercase tracking-widest animate-pulse mt-1">¡Acumulado +{isDrawPending} cartas!</p>}
                </div>

                {/* MANO JUGADOR */}
                <div className="w-full relative pb-2 sm:pb-4">
                    {/* Botón Jugar Selección */}
                    {selectedCardIds.length > 0 && turnIndex === myPlayerIndex && (
                        <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-50">
                            <button onClick={playSelected} className="bg-gradient-to-r from-green-500 to-emerald-500 text-black font-black py-3 px-8 rounded-full shadow-[0_10px_20px_rgba(34,197,94,0.4)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2 animate-in slide-in-from-bottom border-2 border-green-300 text-sm">
                                <Hand className="w-5 h-5"/> JUGAR {selectedCardIds.length > 1 ? 'CARTAS' : 'CARTA'}
                            </button>
                        </div>
                    )}
                    
                    <div className="flex justify-center w-full px-2 overflow-x-auto pb-6 pt-10 min-h-[180px] no-scrollbar">
                        <div className="flex -space-x-8 sm:-space-x-12 items-end mx-auto px-4">
                            {players[myPlayerIndex]?.hand.map((card, i) => {
                                const isSelected = selectedCardIds.includes(card.id);
                                const isMyTurn = turnIndex === myPlayerIndex;
                                return (
                                    <div key={card.id} className={`transition-all duration-300 transform origin-bottom ${isMyTurn ? 'hover:-translate-y-6 hover:z-30' : 'opacity-80 grayscale-[30%]'} ${isSelected ? '-translate-y-10 z-40' : 'z-10'}`} style={{zIndex: i}}>
                                        <Card card={card} onClick={() => handleCardClick(card)} playable={isMyTurn} isSelected={isSelected} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* MODAL SELECCIÓN COLOR */}
                {activeColorSelect && (
                    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center animate-in zoom-in backdrop-blur-md p-4">
                        <div className="bg-slate-900 p-8 rounded-[2rem] border border-slate-700 text-center w-full max-w-sm shadow-2xl">
                            <h3 className="text-xl font-black text-white mb-6 uppercase tracking-widest">Elige Color</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => handleColorSelect('red')} className="h-28 rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-transform border-4 border-white bg-[#ef4444] shadow-red-500/50"></button>
                                <button onClick={() => handleColorSelect('blue')} className="h-28 rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-transform border-4 border-white bg-[#3b82f6] shadow-blue-500/50"></button>
                                <button onClick={() => handleColorSelect('green')} className="h-28 rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-transform border-4 border-white bg-[#22c55e] shadow-green-500/50"></button>
                                <button onClick={() => handleColorSelect('yellow')} className="h-28 rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-transform border-4 border-white bg-[#eab308] shadow-yellow-500/50"></button>
                            </div>
                        </div>
                    </div>
                )}

                {/* PANTALLA GAME OVER */}
                {winner && (
                    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center animate-in zoom-in p-4 backdrop-blur-xl">
                        <div className={`p-8 rounded-full bg-gradient-to-br ${winner.id===user?.uid ? 'from-yellow-500/20 to-transparent border-yellow-500/30' : 'from-slate-500/20 to-transparent border-slate-500/30'} mb-6 border shadow-2xl`}>
                            <Trophy className={`w-24 h-24 sm:w-32 sm:h-32 animate-bounce ${winner.id===user?.uid ? 'text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'text-slate-500'}`}/>
                        </div>
                        <h2 className="text-5xl sm:text-7xl font-black text-white italic mb-2 tracking-tighter drop-shadow-lg">{winner.id===user?.uid ? '¡VICTORIA!' : 'DERROTA'}</h2>
                        <p className="text-slate-400 mb-8 font-bold tracking-widest uppercase">{winner.name} se quedó sin cartas</p>
                        
                        {winner.id===user?.uid && gameMode==='pve' && (
                            <div className="bg-slate-900/80 text-yellow-400 px-8 py-4 rounded-2xl font-black mb-8 flex flex-col items-center gap-2 border border-yellow-500/30 shadow-lg">
                                <span className="text-[10px] text-slate-400 uppercase tracking-widest">Recompensa</span>
                                <span className="flex items-center gap-2 text-2xl"><Coins className="w-6 h-6"/> +100</span>
                            </div>
                        )}
                        <button onClick={() => window.location.reload()} className="w-full max-w-xs py-5 bg-white text-black font-black rounded-2xl hover:bg-slate-200 active:scale-95 transition shadow-[0_0_30px_rgba(255,255,255,0.2)] uppercase tracking-widest text-sm">VOLVER AL MENÚ</button>
                    </div>
                )}
            </div>
        )}
        
        {/* FOOTER & CHAT */}
        <div className="mt-auto w-full max-w-md pt-2 opacity-80 relative z-10 mb-2">
            <AdSpace type="banner" />
            <GameChat gameId={roomCode || "global_uno"} gameName="UNO CLASSIC" />
        </div>
    </div>
  );
}