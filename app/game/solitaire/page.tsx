// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Users, Eye, RotateCcw, Zap, Sparkles, Crown, Heart, Diamond, Club, Spade, Timer, PlusCircle, Medal } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, query, orderBy, limit, getDocs, setDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- UTILIDADES Y CONFIGURACIÓN ---
const SUITS = ['H', 'D', 'C', 'S'];
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const createDeck = () => {
  let deck = [];
  SUITS.forEach(suit => {
    RANKS.forEach(rank => {
      deck.push({ 
        id: `${suit}${rank}`, 
        suit, 
        rank, 
        color: (suit === 'H' || suit === 'D') ? 'red' : 'black',
        faceUp: false 
      });
    });
  });
  return deck;
};

const shuffle = (array) => {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
};

// Generador de Retos
const generateChallenge = (diff) => {
    const types = ['time', 'score'];
    const type = types[Math.floor(Math.random() * types.length)];
    let target, description, bonus = 500;

    if (diff === 'easy') {
        if (type === 'time') { target = 300; description = "Termina en menos de 5 minutos"; }
        if (type === 'score') { target = 600; description = "Alcanza 600 puntos"; }
    } else {
        if (type === 'time') { target = 150; description = "Desafío Veloz: Termina en 2:30 minutos"; bonus = 800; }
        if (type === 'score') { target = 1000; description = "Maestro: Alcanza 1000 puntos"; bonus = 800; }
    }

    return { type, target, current: 0, completed: false, description, bonus };
};

export default function SolitairePro() {
  const [view, setView] = useState('menu');
  const [user, setUser] = useState(null);

  // ESTADO JUEGO
  const [deck, setDeck] = useState([]);
  const [waste, setWaste] = useState([]);
  const [foundation, setFoundation] = useState({H: [], D: [], C: [], S: []});
  const [tableau, setTableau] = useState([[], [], [], [], [], [], []]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState('easy');
  const [winner, setWinner] = useState(false);

  // RETOS IA
  const [challenge, setChallenge] = useState(null);
  const [gameStartTime, setGameStartTime] = useState(null);
  const timerRef = useRef(null);

  // ONLINE & DATA
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [seed, setSeed] = useState(null);
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 });
  const [leaderboard, setLeaderboard] = useState([]);

  const fetchLeaderboard = async () => {
      try {
        const q = query(collection(db, "scores_solitaire"), orderBy("score", "desc"), limit(5));
        const s = await getDocs(q); 
        setLeaderboard(s.docs.map(d=>d.data()));
      } catch (e) { console.log("Error LB", e); }
  };

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // Timer del Reto
  useEffect(() => {
      if (view === 'pve' && challenge && !challenge.completed && !winner) {
          timerRef.current = setInterval(() => {
              const now = Date.now();
              const elapsed = Math.floor((now - gameStartTime) / 1000);
              if (challenge.type === 'time') {
                  setChallenge(prev => ({ ...prev, current: elapsed }));
                  checkChallengeCompletion(elapsed, score);
              }
          }, 1000);
      } else {
          clearInterval(timerRef.current);
      }
      return () => clearInterval(timerRef.current);
  }, [view, challenge, winner, gameStartTime, score]);


  // --- LÓGICA JUEGO ---
  const startGame = (mode, diff = 'easy', onlineSeed = null) => {
      const newDeck = shuffle(createDeck()); 
      const newTableau = [[],[],[],[],[],[],[]];
      let cardIdx = 0;
      for (let i = 0; i < 7; i++) {
          for (let j = 0; j <= i; j++) {
              const card = newDeck[cardIdx++];
              if (j === i) card.faceUp = true;
              newTableau[i].push(card);
          }
      }
      setDeck(newDeck.slice(cardIdx)); setWaste([]);
      setFoundation({H: [], D: [], C: [], S: []}); setTableau(newTableau);
      setLives(3); setScore(0); setDifficulty(diff); setWinner(false); setSelectedCard(null);
      
      if (mode === 'pve') {
          setChallenge(generateChallenge(diff));
          setGameStartTime(Date.now());
      } else {
          setChallenge(null);
      }
      setView(mode);
  };

  const checkChallengeCompletion = (currentTime, currentScore) => {
      if (!challenge || challenge.completed) return;
      let completed = false;
      if (challenge.type === 'time' && winner && currentTime <= challenge.target) completed = true;
      if (challenge.type === 'score' && currentScore >= challenge.target) completed = true;

      if (completed) {
          setChallenge(prev => ({ ...prev, completed: true }));
          setScore(s => s + challenge.bonus);
          alert(`¡RETO COMPLETADO! +${challenge.bonus} Puntos`);
          saveScore(score + challenge.bonus);
      }
  };

  const drawCard = (forceSingle = false) => {
      if (deck.length === 0) {
          if (waste.length > 0) {
              if (lives > 0) {
                  setLives(l => l - 1);
                  setDeck(waste.reverse().map(c => ({...c, faceUp: false})));
                  setWaste([]);
              } else {
                  if(confirm("¡Sin movimientos! ¿Ver anuncio para obtener una vida extra?")) watchAd('life');
              }
          }
          return;
      }
      const drawCount = forceSingle ? 1 : (difficulty === 'easy' ? 1 : 3);
      const cardsToMove = deck.slice(0, drawCount).map(c => ({...c, faceUp: true}));
      setWaste([...waste, ...cardsToMove]);
      setDeck(deck.slice(drawCount));
      setSelectedCard(null);
  };

  // --- NUEVO: Manejador de Doble Clic (Auto-Foundation) ---
  const handleDoubleClick = (pile, colOrSuit, index) => {
      // Solo permitir mover al Foundation desde Waste o Tableau
      if (pile === 'foundation') return; 

      // Identificar la carta
      let clickedCard = null;
      if (pile === 'tableau') clickedCard = tableau[colOrSuit][index];
      if (pile === 'waste') clickedCard = waste[waste.length - 1];

      // Solo si es la última carta (tope) y está boca arriba
      if (!clickedCard || !clickedCard.faceUp) return;
      if (pile === 'tableau' && index !== tableau[colOrSuit].length - 1) return;

      // Intentar mover directamente al Foundation de su palo
      const targetPile = { pile: 'foundation', colOrSuit: clickedCard.suit };
      const sourcePile = { pile, colOrSuit, index };

      if (tryMove(sourcePile, targetPile)) {
          setSelectedCard(null); // Limpiar selección si se movió
      }
  };

  const handleCardClick = (pile, colOrSuit, index) => {
      let clickedCard = null;
      if (pile === 'tableau') clickedCard = tableau[colOrSuit][index];
      if (pile === 'waste') clickedCard = waste[waste.length - 1];
      if (pile === 'foundation') clickedCard = foundation[colOrSuit][foundation[colOrSuit].length - 1];

      const isEmptyTableau = pile === 'tableau' && !clickedCard && index === -1;

      if (selectedCard) {
          // Intentar mover lo seleccionado a lo clickado
          if (tryMove(selectedCard, { pile, colOrSuit, index, card: clickedCard, isEmpty: isEmptyTableau })) {
              setSelectedCard(null);
          } else {
              // Si falla el movimiento, cambiar selección (AHORA PERMITE SELECCIONAR FOUNDATION)
              if (clickedCard && clickedCard.faceUp) setSelectedCard({ pile, colOrSuit, index });
              else if (!isEmptyTableau) setSelectedCard(null);
          }
      } else {
          // Nueva selección (AHORA PERMITE SELECCIONAR FOUNDATION)
          if (clickedCard && clickedCard.faceUp) setSelectedCard({ pile, colOrSuit, index });
      }
  };

  const tryMove = (from, to) => {
      let cardsToMove = [];
      // IDENTIFICAR ORIGEN
      if (from.pile === 'waste') cardsToMove = [waste[waste.length - 1]];
      if (from.pile === 'tableau') cardsToMove = tableau[from.colOrSuit].slice(from.index);
      if (from.pile === 'foundation') cardsToMove = [foundation[from.colOrSuit][foundation[from.colOrSuit].length - 1]]; // NUEVO: Mover desde Foundation

      if (!cardsToMove.length || !cardsToMove[0]) return false;
      const movingCard = cardsToMove[0];

      // MOVIMIENTO A FOUNDATION (MAZO FINAL)
      if (to.pile === 'foundation') {
          if (cardsToMove.length > 1) return false;
          if (from.pile === 'foundation') return false; // No mover de foundation a foundation (redundante)

          const targetSuit = to.colOrSuit;
          const targetPile = foundation[targetSuit];
          const topCard = targetPile.length > 0 ? targetPile[targetPile.length - 1] : null;

          if (movingCard.suit !== targetSuit) return false;
          if (!topCard && movingCard.rank === 1) return executeMove(from, to, cardsToMove);
          if (topCard && movingCard.rank === topCard.rank + 1) return executeMove(from, to, cardsToMove);
      }

      // MOVIMIENTO A TABLEAU (TABLERO)
      if (to.pile === 'tableau') {
          const targetCol = tableau[to.colOrSuit];
          const topCard = targetCol.length > 0 ? targetCol[targetCol.length - 1] : null;

          if (!topCard) {
              if (movingCard.rank === 13) return executeMove(from, to, cardsToMove);
          } else {
              if (movingCard.color !== topCard.color && movingCard.rank === topCard.rank - 1) return executeMove(from, to, cardsToMove);
          }
      }
      return false;
  };

  const executeMove = (from, to, cards) => {
      // 1. QUITAR DE ORIGEN
      if (from.pile === 'waste') {
          setWaste(prev => prev.slice(0, -1));
      } else if (from.pile === 'tableau') {
          setTableau(prev => {
              const newT = [...prev];
              newT[from.colOrSuit] = newT[from.colOrSuit].slice(0, from.index);
              const last = newT[from.colOrSuit][newT[from.colOrSuit].length - 1];
              if (last) last.faceUp = true;
              return newT;
          });
      } else if (from.pile === 'foundation') { // NUEVO: Quitar de Foundation
          setFoundation(prev => ({...prev, [from.colOrSuit]: prev[from.colOrSuit].slice(0, -1)}));
          setScore(s => Math.max(0, s - 100)); // Penalización por recuperar (opcional, aquí resta los puntos ganados)
      }

      // 2. PONER EN DESTINO
      let newScore = score;
      if (to.pile === 'foundation') {
          setFoundation(prev => {
              const newF = {...prev, [to.colOrSuit]: [...prev[to.colOrSuit], cards[0]]};
              if (Object.values(newF).every(p => p.length === 13)) setWinner(true);
              return newF;
          });
          newScore += 100;
      } else if (to.pile === 'tableau') {
          setTableau(prev => {
              const newT = [...prev];
              newT[to.colOrSuit] = [...newT[to.colOrSuit], ...cards];
              return newT;
          });
          if (from.pile !== 'foundation') newScore += 10; // Solo puntos si no viene del foundation
      }
      setScore(newScore);
      checkChallengeCompletion(challenge?.current, newScore);
      return true;
  };

  // --- ADS & HELPERS ---
  const watchAd = (type) => { setAdState({ active: true, type, timer: 5 }); };
  useEffect(() => {
    let i;
    if (adState.active && adState.timer > 0) i = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active) { clearInterval(i); setAdState({active:false, timer:5}); finishAd(); } 
    return () => clearInterval(i);
  }, [adState.active]);

  const finishAd = () => {
      if (adState.type === 'life') setLives(l => l + 1);
      if (adState.type === 'hint') alert("Pista: Busca mover Reyes a huecos o Ases a las bases.");
      if (adState.type === 'extraCard') drawCard(true);
      setAdState(p => ({ ...p, active: false }));
  };

  const saveScore = async (s) => { if(user) { await addDoc(collection(db, "scores_solitaire"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); fetchLeaderboard(); }};

  // --- RENDER HELPERS ---
  const getSuitIcon = (s, sizeClass) => {
      if (s === 'H') return <Heart className={`${sizeClass} text-rose-600 fill-current`} />;
      if (s === 'D') return <Diamond className={`${sizeClass} text-rose-600 fill-current`} />;
      if (s === 'C') return <Club className={`${sizeClass} text-slate-800 fill-current`} />;
      if (s === 'S') return <Spade className={`${sizeClass} text-slate-800 fill-current`} />;
  };
  const getRankLabel = (r) => {
      if (r === 1) return 'A'; if (r === 11) return 'J'; if (r === 12) return 'Q'; if (r === 13) return 'K'; return r;
  };

  const cardStyle = "w-20 h-32 sm:w-24 sm:h-36 rounded-xl border border-slate-200 transition-all duration-200 overflow-hidden shadow-md hover:shadow-xl bg-slate-50 font-sans relative";

  const Card = ({ card, pile, colOrSuit, index, style = {} }) => {
      if (!card) return <div className={`${cardStyle} !bg-transparent border-dashed !border-slate-600/40 shadow-none opacity-50`} onClick={() => handleCardClick(pile, colOrSuit, -1)}></div>;

      const isSel = selectedCard && selectedCard.pile === pile && selectedCard.colOrSuit === colOrSuit && selectedCard.index === index;

      if (!card.faceUp) {
          return (
              <div className={`${cardStyle} !bg-[#1e293b] !border-slate-700 flex items-center justify-center relative group overflow-hidden`} style={style}>
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-500 to-transparent scale-150"></div>
                  <div className="absolute inset-1.5 border border-slate-600/60 rounded-lg flex items-center justify-center bg-[#172033]">
                     <Crown className="w-8 h-8 text-slate-500/50"/>
                  </div>
              </div>
          );
      }

      const isRed = card.color === 'red';
      const textColor = isRed ? 'text-rose-600' : 'text-slate-800';
      const selectClass = isSel ? 'ring-2 ring-amber-400 scale-[1.02] z-50 shadow-2xl' : 'hover:-translate-y-0.5';

      return (
          <div 
            onClick={(e) => { e.stopPropagation(); handleCardClick(pile, colOrSuit, index); }}
            onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick(pile, colOrSuit, index); }} // <--- DOBLE CLIC AÑADIDO
            className={`${cardStyle} flex flex-col justify-between p-2.5 cursor-pointer ${textColor} ${selectClass}`}
            style={style}
          >
              <div className="flex flex-col items-center leading-none select-none">
                <span className="text-lg sm:text-xl font-bold">{getRankLabel(card.rank)}</span>
                <div className="mt-0.5">{getSuitIcon(card.suit, "w-4 h-4 sm:w-5 sm:h-5")}</div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-10">
                {getSuitIcon(card.suit, "w-20 h-20 sm:w-24 sm:h-24")}
              </div>
              <div className="flex flex-col items-center leading-none rotate-180 select-none">
                <span className="text-lg sm:text-xl font-bold">{getRankLabel(card.rank)}</span>
                 <div className="mt-0.5">{getSuitIcon(card.suit, "w-4 h-4 sm:w-5 sm:h-5")}</div>
              </div>
          </div>
      );
  };

  const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-4 font-sans text-slate-200 select-none overflow-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0f172a] via-[#050b14] to-[#020617]">
      
      {adState.active && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center flex-col backdrop-blur-md">
          <Eye className="w-20 h-20 text-amber-500 animate-pulse mb-6"/>
          <h2 className="text-2xl font-bold text-white mb-2">PUBLICIDAD</h2>
          <p className="text-amber-400 text-xl">{adState.timer}s</p>
        </div>
      )}

      <div className="w-full max-w-6xl flex justify-between items-center mb-6 z-10">
        <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-3 bg-slate-800/50 rounded-full hover:bg-slate-700 transition-all"><ArrowLeft className="w-5 h-5"/></button>
        <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wider uppercase drop-shadow-lg font-mono">SOLITARIO PRO</h1>
        </div>
        {view !== 'menu' && (
            <div className="flex gap-3">
                <div className="flex items-center gap-2 bg-slate-800/60 px-4 py-2 rounded-full font-bold shadow-sm"><Zap className="w-4 h-4 text-amber-400"/> {lives}</div>
                <div className="flex items-center gap-2 bg-slate-800/60 px-4 py-2 rounded-full font-bold shadow-sm">{score} PTS</div>
            </div>
        )}
      </div>

      {view === 'pve' && challenge && (
          <div className={`w-full max-w-2xl mb-6 p-3 rounded-xl flex items-center justify-between border ${challenge.completed ? 'bg-green-900/40 border-green-500/50' : 'bg-slate-800/60 border-amber-500/30'} backdrop-blur-md animate-in slide-in-from-top`}>
              <div className="flex items-center gap-3">
                  {challenge.type === 'time' ? <Timer className="w-5 h-5 text-amber-400"/> : <Medal className="w-5 h-5 text-amber-400"/>}
                  <div>
                      <p className="text-sm font-bold text-white">{challenge.description}</p>
                      <p className="text-xs text-slate-400">Progreso: {challenge.type === 'time' ? formatTime(challenge.current) : challenge.current} / {challenge.type === 'time' ? formatTime(challenge.target) : challenge.target}</p>
                  </div>
              </div>
              {challenge.completed ? <span className="text-green-400 font-bold text-sm">¡COMPLETADO! (+{challenge.bonus})</span> : <span className="text-amber-400 font-bold text-sm">En curso...</span>}
          </div>
      )}

      {view === 'menu' ? (
          <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-4 z-10 font-mono">
              <button onClick={() => startGame('pve', 'easy')} className="bg-slate-800/60 p-6 rounded-2xl border border-slate-700/50 hover:border-slate-500/50 transition-all flex items-center gap-5 shadow-lg hover:shadow-xl group">
                  <div className="p-4 bg-slate-700/50 rounded-xl"><Sparkles className="w-6 h-6 text-slate-300 group-hover:text-white"/></div>
                  <div className="text-left"><h2 className="text-lg font-bold text-white">NORMAL</h2><p className="text-xs text-slate-400 mt-1">Robar 1 carta. Retos estándar.</p></div>
              </button>
              <button onClick={() => startGame('pve', 'hard')} className="bg-slate-800/60 p-6 rounded-2xl border border-slate-700/50 hover:border-amber-500/30 transition-all flex items-center gap-5 shadow-lg hover:shadow-xl group">
                  <div className="p-4 bg-slate-700/50 rounded-xl"><Crown className="w-6 h-6 text-amber-500 group-hover:text-amber-400"/></div>
                  <div className="text-left"><h2 className="text-lg font-bold text-white">EXPERTO</h2><p className="text-xs text-slate-400 mt-1">Robar 3 cartas. Retos difíciles.</p></div>
              </button>
              
              {leaderboard.length > 0 && (
                <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 mt-4">
                    <h3 className="text-xs text-slate-400 uppercase font-bold mb-3 tracking-widest">Ranking Mundial</h3>
                    <div className="flex flex-col gap-2">
                        {leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-xs text-slate-300 bg-slate-700/30 px-3 py-2 rounded-lg"><span>#{i+1} {s.displayName}</span><span className="font-bold text-white">{s.score}</span></div>))}
                    </div>
                </div>
               )}
          </div>
      ) : (
          <div className="w-full max-w-6xl flex flex-col items-center flex-grow relative z-10 pb-4">
              <div className="w-full flex justify-between items-start mb-8 px-4 sm:px-8">
                  <div className="flex gap-4 sm:gap-6 items-center">
                      <div className="relative group" onClick={() => drawCard()}>
                          {deck.length > 0 ? (
                              <div className={`${cardStyle} !bg-[#1e293b] !border-slate-700 flex items-center justify-center cursor-pointer hover:scale-[1.02] transition-transform relative shadow-xl`}>
                                   <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-500 to-transparent scale-150"></div>
                                  <div className="absolute inset-1.5 border border-slate-600/60 rounded-lg flex items-center justify-center bg-[#172033]">
                                      <span className="text-xl font-bold text-slate-400/60">{deck.length}</span>
                                  </div>
                              </div>
                          ) : (
                              <div className={`${cardStyle} !bg-transparent border-2 border-dashed border-slate-700/50 flex items-center justify-center cursor-pointer hover:bg-slate-800/30 transition-all rounded-xl shadow-none`}>
                                  <RotateCcw className="w-8 h-8 text-slate-600"/>
                              </div>
                          )}
                      </div>

                      {deck.length > 0 && (
                        <button onClick={() => watchAd('extraCard')} className="p-2 bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/50 rounded-full text-amber-400 transition-all group" title="Ver anuncio para carta extra">
                            <PlusCircle className="w-6 h-6 group-hover:scale-110 transition-transform"/>
                        </button>
                      )}
                      
                      <div className="relative">
                          {waste.length > 0 ? <Card card={waste[waste.length-1]} pile="waste" colOrSuit={0} index={waste.length-1}/> : <div className={`${cardStyle} !bg-transparent border border-slate-800/50 rounded-xl shadow-none`}></div>}
                      </div>
                  </div>

                  <div className="flex gap-3 sm:gap-5">
                      {SUITS.map(suit => (
                          <div key={suit} className="relative">
                              {foundation[suit].length > 0 ? (
                                  <Card card={foundation[suit][foundation[suit].length-1]} pile="foundation" colOrSuit={suit} index={foundation[suit].length-1}/>
                              ) : (
                                  <div onClick={() => handleCardClick('foundation', suit, -1)} className={`${cardStyle} !bg-slate-800/30 border-2 border-slate-700/50 flex items-center justify-center cursor-pointer hover:border-slate-600/60 transition-all rounded-xl shadow-inner opacity-50`}>
                                      {getSuitIcon(suit, "w-12 h-12 sm:w-16 sm:h-16")}
                                  </div>
                              )}
                          </div>
                      ))}
                  </div>
              </div>

              <div className="flex gap-3 sm:gap-5 justify-center w-full px-2 min-h-[550px]">
                  {tableau.map((col, colIdx) => (
                      <div key={colIdx} className="relative w-20 sm:w-24 h-[550px]" onClick={() => handleCardClick('tableau', colIdx, -1)}>
                          {col.length > 0 ? (
                              col.map((card, idx) => (
                                  <div key={card.id} className="absolute left-0 w-full" style={{ top: `${idx * 30}px`, zIndex: idx }}>
                                     <Card card={card} pile="tableau" colOrSuit={colIdx} index={idx} />
                                  </div>
                              ))
                          ) : (
                              <div className={`${cardStyle} !bg-transparent border border-dashed border-slate-800/50 hover:bg-slate-800/20 cursor-pointer rounded-xl absolute top-0 left-0 shadow-none`}></div>
                          )}
                      </div>
                  ))}
              </div>

              <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-50">
                   <button onClick={() => watchAd('hint')} className="p-4 bg-slate-800/80 rounded-full border border-slate-600/50 text-amber-400 shadow-lg hover:scale-105 transition-all group backdrop-blur-md"><Eye className="w-6 h-6 group-hover:text-amber-300"/></button>
                   {lives <= 1 && <button onClick={() => watchAd('life')} className="p-4 bg-rose-900/80 rounded-full border border-rose-700/50 text-rose-400 shadow-lg hover:scale-105 transition-all group animate-pulse backdrop-blur-md"><Zap className="w-6 h-6 group-hover:text-rose-300"/></button>}
              </div>
          </div>
      )}
      <div className="mt-auto w-full max-w-md pt-2 opacity-50 relative z-10"><AdSpace type="banner" /><GameChat gameId={view.includes('pvp') ? roomCode : "global_solitaire"} gameName="SOLITAIRE" /></div>
    </div>
  );
}