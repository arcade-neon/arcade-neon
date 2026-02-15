// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Trophy, Users, Play, RefreshCw, 
  Layers, Spade, Club, Heart, Diamond, Coins, MessageSquare, Hand, Crown, MoveHorizontal, RotateCcw
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, onSnapshot, getDoc, serverTimestamp, setDoc, collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';

// --- LÓGICA DE CARTAS ---
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// --- DIFICULTAD ---
const MODES = {
    easy: { name: 'ROBO 1', draw: 1, bonus: 100 },
    hard: { name: 'ROBO 3', draw: 3, bonus: 250 }
};

export default function SolitairePro() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);

  // VISTAS
  const [view, setView] = useState('menu'); 
  
  // ESTADO JUEGO
  const [deck, setDeck] = useState([]);
  const [waste, setWaste] = useState([]);
  const [foundations, setFoundations] = useState({ hearts: [], diamonds: [], clubs: [], spades: [] });
  const [tableau, setTableau] = useState([[], [], [], [], [], [], []]);
  const [selectedCard, setSelectedCard] = useState(null); 
  
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [gameMode, setGameMode] = useState('easy');
  const [gameWon, setGameWon] = useState(false);

  // DATA
  const [leaderboard, setLeaderboard] = useState([]);

  // ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opName, setOpName] = useState('Rival');
  const [opScore, setOpScore] = useState(0);
  const [opState, setOpState] = useState('playing');
  
  // APUESTAS
  const [betType, setBetType] = useState('money');
  const [betAmount, setBetAmount] = useState(100);
  const [betText, setBetText] = useState('');
  const [currentBetInfo, setCurrentBetInfo] = useState(null);

  // --- INICIALIZACIÓN ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
        else setUser(null);
    });
    fetchLeaderboard();
    return () => unsubscribe();
  }, []);

  // --- SYNC ONLINE ---
  useEffect(() => {
    if (view === 'pvp_game' && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_solitaire", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.betInfo) setCurrentBetInfo(data.betInfo);
                
                if (isHost) {
                    setOpName(data.guestName || 'Esperando...');
                    setOpScore(data.guestScore || 0);
                    setOpState(data.guestState || 'playing');
                } else {
                    setOpName(data.hostName || 'Host');
                    setOpScore(data.hostScore || 0);
                    setOpState(data.hostState || 'playing');
                }

                if (!isHost && data.seed && deck.length === 0) {
                    initGame(data.difficulty, data.seed);
                }
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode, isHost, deck]);

  // --- FUNCIONES DE CONTROL ---
  const handleBack = () => {
      if (view === 'menu') {
          window.location.href = '/';
      } else {
          exitGame();
      }
  };

  const exitGame = () => {
      setDeck([]);
      setWaste([]);
      setTableau([[], [], [], [], [], [], []]);
      setFoundations({ hearts: [], diamonds: [], clubs: [], spades: [] });
      setScore(0);
      setMoves(0);
      setSelectedCard(null);
      setView('menu');
  };

  // --- GENERADOR ---
  const createDeck = (seed = null) => {
      let newDeck = [];
      SUITS.forEach(suit => {
          RANKS.forEach((rank, index) => {
              newDeck.push({
                  id: `${rank}-${suit}`,
                  rank,
                  suit,
                  value: index + 1,
                  color: (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black',
                  faceUp: false
              });
          });
      });
      
      if (seed) {
          let m = newDeck.length, t, i;
          const random = () => { var x = Math.sin(seed++) * 10000; return x - Math.floor(x); }
          while (m) { i = Math.floor(random() * m--); t = newDeck[m]; newDeck[m] = newDeck[i]; newDeck[i] = t; }
      } else {
          newDeck.sort(() => Math.random() - 0.5);
      }
      return newDeck;
  };

  const initGame = (difficulty = 'easy', seed = null) => {
      playSound('shuffle');
      const newDeck = createDeck(seed);
      setGameMode(difficulty);
      
      const newTableau = [[], [], [], [], [], [], []];
      let cardIdx = 0;
      
      for (let i = 0; i < 7; i++) {
          for (let j = 0; j <= i; j++) {
              const card = newDeck[cardIdx++];
              if (j === i) card.faceUp = true;
              newTableau[i].push(card);
          }
      }

      setDeck(newDeck.slice(cardIdx));
      setWaste([]);
      setFoundations({ hearts: [], diamonds: [], clubs: [], spades: [] });
      setTableau(newTableau);
      setScore(0);
      setMoves(0);
      setGameWon(false);
      setSelectedCard(null);
  };

  // --- MECÁNICAS ---
  const drawCard = () => {
      playSound('card');
      if (deck.length === 0) {
          const newDeck = [...waste].reverse().map(c => ({...c, faceUp: false}));
          setDeck(newDeck);
          setWaste([]);
      } else {
          const drawCount = MODES[gameMode].draw;
          const cardsToMove = deck.slice(0, drawCount).map(c => ({...c, faceUp: true}));
          setWaste(prev => [...prev, ...cardsToMove]);
          setDeck(prev => prev.slice(drawCount));
      }
      setSelectedCard(null);
  };

  const handleCardClick = (card, location, colIdx = null) => {
      if (!card) return;
      if (!card.faceUp && location === 'tableau') return;
      if (!card.faceUp) return;

      if (selectedCard) {
          if (selectedCard.card.id === card.id) {
              setSelectedCard(null);
              playSound('click');
          } else {
              attemptMove(selectedCard, { location, colIdx, card });
          }
      } else {
          setSelectedCard({ location, colIdx, card });
          playSound('click');
      }
  };

  const handleEmptyColClick = (colIdx) => {
      if (selectedCard) {
          attemptMove(selectedCard, { location: 'tableau', colIdx, card: null });
      }
  };

  const attemptMove = (from, to) => {
      let valid = false;
      let cardsToMove = [];

      if (from.location === 'waste') {
          cardsToMove = [from.card];
      } else if (from.location === 'tableau') {
          const col = tableau[from.colIdx];
          const idx = col.findIndex(c => c.id === from.card.id);
          cardsToMove = col.slice(idx);
      }

      const leaderCard = cardsToMove[0];

      if (to.location === 'tableau') {
          if (!to.card) {
              if (leaderCard.rank === 'K') valid = true;
          } else {
              if (to.card.color !== leaderCard.color && to.card.value === leaderCard.value + 1) {
                  valid = true;
              }
          }
      } else if (to.location === 'foundation') {
          if (cardsToMove.length === 1) {
              const suitPile = foundations[to.colIdx];
              const topCard = suitPile[suitPile.length - 1];
              
              if (!topCard) {
                  if (leaderCard.value === 1) valid = true;
              } else {
                  if (topCard.suit === leaderCard.suit && topCard.value === leaderCard.value - 1) valid = true;
              }
          }
      }

      if (valid) {
          playSound('card');
          if (from.location === 'waste') {
              setWaste(prev => prev.slice(0, -1));
          } else if (from.location === 'tableau') {
              setTableau(prev => {
                  const newTab = [...prev];
                  const col = newTab[from.colIdx];
                  const cutIdx = col.findIndex(c => c.id === from.card.id);
                  newTab[from.colIdx] = col.slice(0, cutIdx);
                  if (newTab[from.colIdx].length > 0) {
                      const last = newTab[from.colIdx][newTab[from.colIdx].length - 1];
                      if (!last.faceUp) last.faceUp = true;
                  }
                  return newTab;
              });
          }

          if (to.location === 'tableau') {
              setTableau(prev => {
                  const newTab = [...prev];
                  newTab[to.colIdx] = [...newTab[to.colIdx], ...cardsToMove];
                  return newTab;
              });
              setScore(s => s + 5);
          } else if (to.location === 'foundation') {
              setFoundations(prev => ({
                  ...prev,
                  [leaderCard.suit]: [...prev[leaderCard.suit], leaderCard]
              }));
              setScore(s => s + 10);
              checkWin();
          }

          setMoves(m => m + 1);
          setSelectedCard(null);
          
          if (view === 'pvp_game') updateOnlineScore(score + (to.location==='foundation'?10:5));

      } else {
          playSound('error');
          setSelectedCard(null);
      }
  };

  const autoStack = (card, fromLoc, colIdx) => {
      const suit = card.suit;
      const pile = foundations[suit];
      const top = pile[pile.length - 1];
      let canMove = false;
      if (!top && card.value === 1) canMove = true;
      if (top && top.value === card.value - 1) canMove = true;
      if (canMove) attemptMove({ location: fromLoc, colIdx, card }, { location: 'foundation', colIdx: suit });
  };

  const checkWin = () => {
      // Implementación visual
  };

  const updateOnlineScore = async (newScore) => {
      if (!roomCode) return;
      const fieldScore = isHost ? 'hostScore' : 'guestScore';
      await updateDoc(doc(db, "matches_solitaire", roomCode), { [fieldScore]: newScore });
  };

  const handleCreateRoom = async () => {
      if (!user) return alert("Inicia sesión");
      if (betType === 'money' && coins < betAmount) return alert("Fondos insuficientes");
      if (betType === 'money') await spendCoins(betAmount, "Apuesta Solitario (Host)");

      const betInfo = { type: betType, value: betType === 'money' ? betAmount : betText || 'Honor' };
      const seed = Math.floor(Math.random() * 1000000); 

      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_solitaire", code), {
          host: user.uid, hostName: user.name, hostScore: 0, hostState: 'playing',
          guest: null, guestName: 'Esperando...', guestScore: 0, guestState: 'playing',
          difficulty: 'easy', seed: seed, betInfo, createdAt: serverTimestamp()
      });

      setRoomCode(code); setIsHost(true); setCurrentBetInfo(betInfo);
      initGame('easy', seed);
      setView('pvp_game');
  };

  const joinRoom = async (inputCode) => {
      if (!user) return alert("Inicia sesión");
      const ref = doc(db, "matches_solitaire", inputCode);
      const snap = await getDoc(ref);
      if (!snap.exists()) return alert("Sala no encontrada");
      
      const data = snap.data();
      if (data.betInfo?.type === 'money' && coins < data.betInfo.value) return alert("Fondos insuficientes");
      if (data.betInfo?.type === 'money') await spendCoins(data.betInfo.value, "Apuesta Solitario (Guest)");

      await updateDoc(ref, { guest: user.uid, guestName: user.name });
      setRoomCode(inputCode); setIsHost(false); setCurrentBetInfo(data.betInfo);
      setView('pvp_game');
  };

  const fetchLeaderboard = async () => {
    try { const q = query(collection(db, "scores_solitaire"), orderBy("score", "desc"), limit(5)); const s = await getDocs(q); setLeaderboard(s.docs.map(d=>d.data())); } catch(e){}
  };

  // --- RENDERIZADO DE CARTAS PROFESIONAL ---
  const Card = ({ card, loc, colIdx, overlapped = false }) => {
      const isSelected = selectedCard?.card?.id === card.id;
      
      const SuitIcon = 
          card.suit === 'hearts' ? Heart : 
          card.suit === 'diamonds' ? Diamond : 
          card.suit === 'clubs' ? Club : Spade;

      const cardColor = card.color === 'red' ? 'text-[#e11d48]' : 'text-[#0f172a]'; // Rose-600 vs Slate-900

      return (
          <div 
            onClick={(e) => { e.stopPropagation(); handleCardClick(card, loc, colIdx); }}
            onDoubleClick={(e) => { e.stopPropagation(); autoStack(card, loc, colIdx); }}
            className={`
                relative w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 rounded-lg border-[1px] border-slate-300 shadow-md transition-all duration-200 cursor-pointer select-none
                ${card.faceUp ? 'bg-white' : 'bg-slate-900 border-2 border-cyan-500/50'}
                ${isSelected ? 'ring-4 ring-yellow-400 z-50 -translate-y-2' : 'hover:-translate-y-1 hover:shadow-xl'}
                ${overlapped ? '-mt-16 sm:-mt-24 md:-mt-28' : ''}
            `}
          >
              {card.faceUp ? (
                  <div className="w-full h-full relative p-1.5 flex flex-col justify-between">
                      {/* Esquina Superior Izquierda */}
                      <div className="flex flex-col items-center leading-none w-6">
                          <span className={`text-lg sm:text-xl font-bold font-serif ${cardColor}`}>{card.rank}</span>
                          <SuitIcon className={`w-3 h-3 sm:w-4 sm:h-4 ${cardColor} fill-current`}/>
                      </div>

                      {/* Centro (Símbolo Grande) */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <SuitIcon className={`w-8 h-8 sm:w-12 sm:h-12 md:w-14 md:h-14 ${cardColor} opacity-90 fill-current`}/>
                      </div>

                      {/* Esquina Inferior Derecha (Invertida) */}
                      <div className="flex flex-col items-center leading-none w-6 self-end rotate-180">
                          <span className={`text-lg sm:text-xl font-bold font-serif ${cardColor}`}>{card.rank}</span>
                          <SuitIcon className={`w-3 h-3 sm:w-4 sm:h-4 ${cardColor} fill-current`}/>
                      </div>
                  </div>
              ) : (
                  // Dorso de Carta Cyberpunk (LIMPIO)
                  <div className="w-full h-full rounded-md bg-slate-900 overflow-hidden relative border border-slate-700">
                      {/* Patrón de Rejilla Hexagonal (CSS) */}
                      <div className="absolute inset-0 opacity-30" 
                           style={{ backgroundImage: 'radial-gradient(#22d3ee 1.5px, transparent 1.5px)', backgroundSize: '12px 12px' }}>
                      </div>
                  </div>
              )}
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-2 font-mono text-white select-none overflow-x-hidden">
        
        {/* FONDO AMBIENTAL */}
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#050b14] to-black opacity-80"></div>

        {/* HEADER */}
        <div className="w-full max-w-[1600px] flex justify-between items-center mb-4 z-10 mt-4 px-4">
            <button onClick={handleBack} className="p-3 bg-slate-900/80 backdrop-blur-sm rounded-full border border-slate-700 hover:border-blue-500 transition shadow-lg group">
                <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-blue-400"/>
            </button>
            <div className="text-center">
                <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 italic tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                    SOLITARIO
                </h1>
                <p className="text-[10px] text-blue-500/80 font-bold tracking-[0.6em] uppercase">CYBER DECK PRO</p>
            </div>
            
            {/* MARGEN AÑADIDO: mr-16 PARA MOVER EL GRUPO A LA IZQUIERDA */}
            <div className="flex gap-2 mr-16">
                <button onClick={() => initGame(gameMode)} className="p-3 bg-slate-900/80 backdrop-blur-sm rounded-full border border-slate-700 hover:border-yellow-500 transition shadow-lg">
                    <RotateCcw className="w-5 h-5 text-yellow-500"/>
                </button>
                <div className="bg-slate-900/80 backdrop-blur-sm px-5 py-2 rounded-full border border-slate-700 flex items-center gap-3 shadow-lg">
                    <span className="text-[10px] text-slate-500 font-bold">SCORE</span>
                    <span className="text-xl font-black text-blue-400 font-mono">{score}</span>
                </div>
            </div>
        </div>

        {view === 'menu' && (
            <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-10 z-10">
                <div className="bg-slate-900/80 backdrop-blur-md p-8 rounded-3xl border border-slate-700 shadow-2xl">
                    <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-3"><Layers className="w-8 h-8 text-blue-500"/> MODO INDIVIDUAL</h2>
                    <div className="flex gap-3">
                        <button onClick={() => { initGame('easy'); setView('pve'); }} className="flex-1 py-4 bg-slate-800 border-2 border-slate-700 rounded-2xl hover:bg-blue-900/20 hover:border-blue-500 transition text-xs font-bold uppercase tracking-wider flex flex-col items-center gap-1 group">
                            <span className="text-blue-400 group-hover:scale-110 transition">FÁCIL</span>
                            <span className="text-[9px] text-slate-500">ROBO 1 CARTA</span>
                        </button>
                        <button onClick={() => { initGame('hard'); setView('pve'); }} className="flex-1 py-4 bg-slate-800 border-2 border-slate-700 rounded-2xl hover:bg-red-900/20 hover:border-red-500 transition text-xs font-bold uppercase tracking-wider flex flex-col items-center gap-1 group">
                            <span className="text-red-400 group-hover:scale-110 transition">EXTREMO</span>
                            <span className="text-[9px] text-slate-500">ROBO 3 CARTAS</span>
                        </button>
                    </div>
                </div>

                <div className="bg-slate-900/80 backdrop-blur-md p-8 rounded-3xl border border-slate-700 relative overflow-hidden group shadow-2xl">
                    <div className="flex items-center gap-4 mb-6 relative z-10">
                        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800"><Users className="w-8 h-8 text-cyan-400"/></div>
                        <div className="text-left">
                            <h2 className="text-2xl font-black text-white italic">DUELO VS</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-wide font-bold">Mismo mazo • Misma suerte</p>
                        </div>
                    </div>
                    <div className="flex gap-3 relative z-10">
                        <button onClick={() => setView('pvp_setup')} className="flex-1 py-4 bg-cyan-600 rounded-2xl font-black text-sm hover:bg-cyan-500 shadow-lg text-white transition hover:scale-105 uppercase tracking-widest">CREAR SALA</button>
                        <button onClick={() => setView('pvp_join')} className="flex-1 py-4 bg-slate-800 rounded-2xl font-black text-sm hover:bg-slate-700 border-2 border-slate-600 text-slate-300 transition hover:scale-105 uppercase tracking-widest">UNIRSE</button>
                    </div>
                </div>

                {leaderboard.length > 0 && (
                    <div className="bg-black/40 backdrop-blur-sm p-6 rounded-3xl border border-white/5 mt-4">
                        <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-3 flex gap-2 items-center tracking-widest"><Crown className="w-3 h-3 text-yellow-500"/> Ranking Global</h3>
                        {leaderboard.map((s,i) => (
                            <div key={i} className="flex justify-between text-xs text-slate-400 border-b border-white/5 py-2 last:border-0">
                                <span className="font-bold text-white">#{i+1} {s.displayName}</span>
                                <span className="text-blue-400 font-mono font-black">{s.score}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {view === 'pvp_setup' && (
            <div className="w-full max-w-md bg-slate-900/90 border border-slate-700 p-8 rounded-3xl animate-in fade-in mt-10 shadow-2xl backdrop-blur-md">
                <h2 className="text-2xl font-black text-center mb-8 text-white uppercase italic tracking-widest">¿QUÉ APOSTAMOS?</h2>
                <div className="flex gap-3 mb-8">
                    <button onClick={() => setBetType('money')} className={`flex-1 py-4 rounded-2xl font-bold text-xs flex flex-col items-center gap-2 border-2 transition-all ${betType==='money' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}><Coins className="w-6 h-6"/> MONEDAS</button>
                    <button onClick={() => setBetType('text')} className={`flex-1 py-4 rounded-2xl font-bold text-xs flex flex-col items-center gap-2 border-2 transition-all ${betType==='text' ? 'bg-pink-500/10 border-pink-500 text-pink-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}><MessageSquare className="w-6 h-6"/> RETO</button>
                </div>
                {betType === 'money' ? (
                    <div className="mb-6">
                        <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase mb-2"><span>Saldo: {coins}</span><span>Cantidad</span></div>
                        <input type="number" value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} className="w-full bg-black border-2 border-slate-700 rounded-xl p-4 text-center text-3xl font-black text-yellow-400 focus:border-yellow-500 outline-none"/>
                    </div>
                ) : (
                    <textarea value={betText} onChange={(e) => setBetText(e.target.value)} placeholder="El perdedor..." className="w-full bg-black border-2 border-slate-700 rounded-xl p-4 text-sm font-bold text-white focus:border-pink-500 outline-none h-32 resize-none mb-6"/>
                )}
                <button onClick={handleCreateRoom} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition uppercase tracking-widest shadow-lg">LANZAR RETO</button>
                <button onClick={handleBack} className="w-full mt-4 text-xs font-bold text-slate-500 hover:text-white uppercase tracking-widest">VOLVER AL MENÚ</button>
            </div>
        )}

        {view === 'pvp_join' && (
            <div className="w-full max-w-md bg-slate-900 p-8 rounded-3xl border border-slate-700 animate-in fade-in mt-10 shadow-2xl backdrop-blur-md">
                <h2 className="text-sm font-bold mb-4 text-center text-slate-400 uppercase tracking-widest">CÓDIGO DE SALA</h2>
                <input type="number" id="code-input" placeholder="0000" className="w-full bg-black/50 border-2 border-slate-700 rounded-2xl p-6 text-center text-5xl font-black text-white mb-8 outline-none focus:border-cyan-500 tracking-[0.2em]"/>
                <button onClick={() => joinRoom(document.getElementById('code-input').value)} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition shadow-lg uppercase tracking-widest">ENTRAR AL DUELO</button>
                <button onClick={handleBack} className="w-full mt-4 text-xs font-bold text-slate-500 hover:text-white uppercase tracking-widest">VOLVER AL MENÚ</button>
            </div>
        )}

        {(view === 'pve' || view === 'pvp_game') && (
            <div className="w-full max-w-[1600px] flex flex-col items-center flex-grow z-10">
                
                {/* HUD PVP */}
                {view === 'pvp_game' && (
                    <div className="w-full max-w-xl flex justify-between items-center mb-6 bg-slate-900/90 px-6 py-3 rounded-full border border-slate-700 shadow-xl backdrop-blur-md">
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">TÚ: <span className="text-blue-400 text-lg ml-2">{score}</span></span>
                        <div className="text-[10px] text-slate-500 font-bold bg-black/50 px-3 py-1 rounded border border-slate-800 flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> {roomCode}
                        </div>
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-widest text-right">{opName}: <span className="text-red-400 text-lg ml-2">{opScore}</span></span>
                    </div>
                )}

                {/* --- TABLERO SCROLLABLE (DESPLAZAMIENTO HORIZONTAL) --- */}
                <div className="w-full overflow-x-auto pb-8 px-4 scrollbar-hide">
                    <div className="min-w-[900px] w-full grid grid-cols-7 gap-4 md:gap-6 p-4 bg-slate-900/40 rounded-3xl border border-slate-800/50 backdrop-blur-sm min-h-[70vh]">
                        
                        {/* FILA SUPERIOR: MAZO Y BASES */}
                        <div className="col-span-7 grid grid-cols-7 gap-4 md:gap-6 mb-4 pb-6 border-b border-white/5">
                            
                            {/* MAZO Y DESCARTES */}
                            <div className="col-span-2 flex gap-4 border-r border-white/5 pr-4">
                                {/* Mazo */}
                                <div onClick={drawCard} className="relative w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 bg-slate-800 rounded-xl border-2 border-slate-600 flex items-center justify-center cursor-pointer hover:border-blue-400 transition shadow-lg group">
                                    {deck.length > 0 ? (
                                        <div className="w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-60 rounded-lg flex items-center justify-center">
                                            <div className="w-8 h-8 rounded-full border-2 border-slate-500 group-hover:border-blue-400 flex items-center justify-center bg-slate-900"><RefreshCw className="w-4 h-4 text-slate-400 group-hover:text-blue-400"/></div>
                                        </div>
                                    ) : (
                                        <div className="w-8 h-8 rounded-full border-2 border-slate-700 flex items-center justify-center"><RefreshCw className="w-4 h-4 text-slate-600"/></div>
                                    )}
                                    <span className="absolute -top-3 -right-3 bg-blue-600 text-white text-[10px] rounded-full w-6 h-6 flex items-center justify-center font-bold border-2 border-slate-900 shadow-md">{deck.length}</span>
                                </div>
                                
                                {/* Descartes */}
                                {waste.length > 0 ? (
                                    <Card card={waste[waste.length - 1]} loc="waste" />
                                ) : (
                                    <div className="w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 border-2 border-dashed border-slate-700 rounded-xl opacity-30"></div>
                                )}
                            </div>

                            {/* ESPACIO */}
                            <div className="col-span-1"></div>

                            {/* BASES (FOUNDATIONS) */}
                            {['hearts', 'diamonds', 'clubs', 'spades'].map(suit => {
                                const pile = foundations[suit];
                                const topCard = pile[pile.length - 1];
                                const SuitIcon = suit === 'hearts' ? Heart : suit === 'diamonds' ? Diamond : suit === 'clubs' ? Club : Spade;
                                
                                return (
                                    <div key={suit} 
                                         onClick={() => attemptMove(selectedCard, { location: 'foundation', colIdx: suit })}
                                         className="relative w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 bg-slate-800/30 rounded-xl border-2 border-slate-700 flex items-center justify-center hover:bg-slate-800/50 transition cursor-pointer"
                                    >
                                        {topCard ? (
                                            <Card card={topCard} loc="foundation" />
                                        ) : (
                                            <SuitIcon className="w-8 h-8 text-slate-700 opacity-40"/>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* TABLEAU (COLUMNAS DE JUEGO) */}
                        {tableau.map((col, i) => (
                            <div key={i} className="flex flex-col items-center relative min-h-[300px]" onClick={() => handleEmptyColClick(i)}>
                                {col.length === 0 && <div className="w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 border-2 border-dashed border-slate-800 rounded-xl opacity-20 hover:opacity-40 transition cursor-pointer"></div>}
                                {col.map((card, idx) => (
                                    <Card key={card.id} card={card} loc="tableau" colIdx={i} overlapped={idx > 0} />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
                
                {/* Scroll Hint para móviles */}
                <div className="md:hidden flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2 animate-pulse pb-4">
                    <MoveHorizontal className="w-4 h-4"/> Desliza para ver más
                </div>
            </div>
        )}

        <div className="mt-auto w-full max-w-md pt-4 opacity-75"><AdSpace type="banner" /><GameChat gameId={view.includes('pvp') ? roomCode : "global_solitaire"} gameName="SOLITARIO" /></div>
    </div>
  );
}