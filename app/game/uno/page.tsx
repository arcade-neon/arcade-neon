// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Zap, Eye, RotateCw, Slash, Plus, Layers, Crown, Sparkles, Trophy, Timer, AlertCircle, PlayCircle } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, query, orderBy, limit, getDocs, setDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import { useAudio } from '@/contexts/AudioContext'; // Asumiendo que ya tienes el audio

// --- CONFIGURACIÓN ---
const COLORS = ['red', 'blue', 'green', 'yellow'];
const SPECIALS = ['skip', 'reverse', 'draw2'];
const WILDS = ['wild', 'draw4'];

type CardType = {
  id: string;
  color: string; // 'red', 'blue', 'green', 'yellow', 'black'
  value: string; // '0'-'9', 'skip', 'reverse', 'draw2', 'wild', 'draw4'
  score: number;
};

// Generar Mazo
const createDeck = () => {
  let deck: CardType[] = [];
  let id = 0;
  COLORS.forEach(c => {
    deck.push({ id: `${id++}`, color: c, value: '0', score: 0 }); // 1 zero
    for (let i = 1; i <= 9; i++) {
        deck.push({ id: `${id++}`, color: c, value: `${i}`, score: i });
        deck.push({ id: `${id++}`, color: c, value: `${i}`, score: i });
    }
    SPECIALS.forEach(s => {
        deck.push({ id: `${id++}`, color: c, value: s, score: 20 });
        deck.push({ id: `${id++}`, color: c, value: s, score: 20 });
    });
  });
  WILDS.forEach(w => {
      for(let i=0; i<4; i++) deck.push({ id: `${id++}`, color: 'black', value: w, score: 50 });
  });
  return shuffle(deck);
};

const shuffle = (array: any[]) => {
  return array.sort(() => Math.random() - 0.5);
};

// Generador de Retos
const generateChallenge = (playerCount: number) => {
    const challenges = [
        { id: 'speed', text: 'Gana en menos de 20 turnos', check: (state: any) => state.turns <= 20, bonus: 500 },
        { id: 'no_wild', text: 'Gana sin usar Comodines', check: (state: any) => state.wildsUsed === 0, bonus: 1000 },
        { id: 'draw_master', text: 'Haz que roben 4+ cartas', check: (state: any) => state.cardsForced >= 4, bonus: 800 },
    ];
    if (playerCount === 4) {
        challenges.push({ id: 'survivor', text: 'Sobrevive 10 rondas sin robar', check: (state: any) => state.draws === 0, bonus: 1200 });
    }
    return challenges[Math.floor(Math.random() * challenges.length)];
};

export default function NeonUno() {
  const [view, setView] = useState('menu');
  const [user, setUser] = useState<any>(null);
  const { playSound } = useAudio();

  // ESTADO JUEGO
  const [deck, setDeck] = useState<CardType[]>([]);
  const [discard, setDiscard] = useState<CardType[]>([]);
  const [players, setPlayers] = useState<any[]>([]); // { id, name, hand: [], isBot }
  const [turnIndex, setTurnIndex] = useState(0);
  const [direction, setDirection] = useState(1); // 1 or -1
  const [currentColor, setCurrentColor] = useState('');
  const [winner, setWinner] = useState<any>(null);
  const [isDrawPending, setIsDrawPending] = useState(0); // Cartas acumuladas por draw2/draw4
  
  // ESTADO USUARIO
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [challenge, setChallenge] = useState<any>(null);
  const [gameStats, setGameStats] = useState({ turns: 0, wildsUsed: 0, cardsForced: 0, draws: 0 });
  const [log, setLog] = useState("¡Bienvenido a NEON UNO!");

  // ONLINE & ADS
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 });
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [activeColorSelect, setActiveColorSelect] = useState(false); // Para elegir color tras Wild

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
      try {
        const q = query(collection(db, "scores_uno"), orderBy("score", "desc"), limit(5));
        const s = await getDocs(q); 
        setLeaderboard(s.docs.map(d=>d.data()));
      } catch (e) { console.log(e); }
  };

  // --- LOGICA PRINCIPAL ---
  const startGame = (mode: string, playerCount: number) => {
      if (lives <= 0 && mode === 'pve') {
          if(confirm("¡Sin vidas! ¿Ver anuncio para continuar?")) watchAd('life');
          return;
      }

      const newDeck = createDeck();
      // Repartir 7 cartas
      const newPlayers = [];
      // Jugador Humano
      newPlayers.push({ id: 'player', name: 'Tú', hand: newDeck.splice(0, 7), isBot: false });
      // Bots
      for(let i=1; i<playerCount; i++) {
          newPlayers.push({ id: `bot_${i}`, name: `CPU ${i}`, hand: newDeck.splice(0, 7), isBot: true });
      }

      // Primera carta descarte (no puede ser wild para simplificar)
      let firstCard = newDeck.pop();
      while(firstCard?.color === 'black') {
          newDeck.unshift(firstCard);
          firstCard = newDeck.pop();
      }

      setDeck(newDeck);
      setDiscard([firstCard!]);
      setPlayers(newPlayers);
      setCurrentColor(firstCard!.color);
      setTurnIndex(0);
      setDirection(1);
      setWinner(null);
      setIsDrawPending(0);
      setGameStats({ turns: 0, wildsUsed: 0, cardsForced: 0, draws: 0 });
      setChallenge(generateChallenge(playerCount));
      setView('game');
      setLog("La partida ha comenzado.");
      playSound('start');
  };

  // TURNO DE IA
  useEffect(() => {
      if (view === 'game' && !winner && players[turnIndex]?.isBot) {
          const timer = setTimeout(() => playBotTurn(), 1500);
          return () => clearTimeout(timer);
      }
  }, [turnIndex, view, winner]);

  const playBotTurn = () => {
      const bot = players[turnIndex];
      const topCard = discard[discard.length-1];
      
      // Buscar jugada válida
      const validCards = bot.hand.filter((c: CardType) => isValidPlay(c));
      
      if (validCards.length > 0) {
          // Estrategia simple: Priorizar especiales si el siguiente tiene pocas cartas
          // O jugar color dominante
          const cardToPlay = validCards[0]; // Simplificado: juega la primera válida
          
          let nextColor = cardToPlay.color;
          if (cardToPlay.color === 'black') {
              // Elegir color que más tenga
              const counts = { red:0, blue:0, green:0, yellow:0 };
              bot.hand.forEach((c:any) => { if(c.color!=='black') counts[c.color as keyof typeof counts]++ });
              nextColor = Object.keys(counts).reduce((a, b) => counts[a as keyof typeof counts] > counts[b as keyof typeof counts] ? a : b);
          }
          
          playCard(bot.id, cardToPlay, nextColor);
      } else {
          drawCard(bot.id);
      }
  };

  const isValidPlay = (card: CardType) => {
      const top = discard[discard.length-1];
      if (card.color === 'black') return true; // Wilds always playable
      if (card.color === currentColor) return true; // Match color
      if (card.value === top.value) return true; // Match value
      return false;
  };

  const playCard = (playerId: string, card: CardType, chosenColor?: string) => {
      playSound('card');
      
      // Aplicar efectos
      let nextDir = direction;
      let nextSkip = false;
      let drawAmount = 0;

      if (card.value === 'reverse') {
          if (players.length === 2) nextSkip = true; // En 2j reverse actua como skip
          else nextDir *= -1;
      }
      if (card.value === 'skip') nextSkip = true;
      if (card.value === 'draw2') drawAmount = 2;
      if (card.value === 'draw4') drawAmount = 4;

      // Actualizar stats si soy yo
      if (playerId === 'player') {
          setGameStats(p => ({ ...p, turns: p.turns + 1, wildsUsed: card.color==='black' ? p.wildsUsed+1 : p.wildsUsed, cardsForced: p.cardsForced + drawAmount }));
      }

      // Actualizar manos
      const newPlayers = players.map(p => {
          if (p.id === playerId) {
              return { ...p, hand: p.hand.filter((c:any) => c.id !== card.id) };
          }
          return p;
      });

      // Actualizar mesa
      setDiscard(prev => [...prev, card]);
      setPlayers(newPlayers);
      setDirection(nextDir);
      setCurrentColor(chosenColor || card.color); // Si es wild, usa el elegido

      // Check Win
      if (newPlayers.find(p => p.id === playerId)?.hand.length === 0) {
          endGame(playerId);
          return;
      }

      // Pasar turno
      let nextIndex = (turnIndex + nextDir + players.length) % players.length;
      
      // Aplicar Skip
      if (nextSkip) {
          setLog(`${players[playerId==='player'?0:1].name} saltado.`); // Simplificado nombre
          nextIndex = (nextIndex + nextDir + players.length) % players.length;
      }

      // Aplicar Draw acumulado al siguiente jugador
      if (drawAmount > 0) {
          const targetPlayer = newPlayers[nextIndex];
          for(let i=0; i<drawAmount; i++) {
              if (deck.length > 0) targetPlayer.hand.push(deck.pop());
          }
          setLog(`${targetPlayer.name} roba ${drawAmount}!`);
          // Normalmente pierden turno tras robar en Draw2/4? Depende reglas casa. 
          // Reglas oficiales: Pierde turno.
          nextIndex = (nextIndex + nextDir + players.length) % players.length;
      }

      setTurnIndex(nextIndex);
  };

  const drawCard = (playerId: string) => {
      // Robar del mazo
      if (deck.length === 0) {
          // Reshuffle discard (menos top)
          const top = discard.pop();
          setDeck(shuffle(discard));
          setDiscard([top!]);
      }
      
      const newCard = deck.pop();
      if (!newCard) return;

      const newPlayers = players.map(p => {
          if (p.id === playerId) return { ...p, hand: [...p.hand, newCard] };
          return p;
      });
      setPlayers(newPlayers);
      setLog(`${players.find(p=>p.id===playerId)?.name} robó carta.`);
      
      // Pasar turno (Regla simple: robas y pasas)
      setTurnIndex((turnIndex + direction + players.length) % players.length);
  };

  const handlePlayerCardClick = (card: CardType) => {
      if (turnIndex !== 0) return; // No es mi turno
      if (!isValidPlay(card)) {
          playSound('error');
          return;
      }

      if (card.color === 'black') {
          // Mostrar selector de color
          setActiveColorSelect(true);
          // Guardamos carta temp
          window.tempWildCard = card;
      } else {
          playCard('player', card);
      }
  };

  const handleColorSelect = (color: string) => {
      setActiveColorSelect(false);
      const card = window.tempWildCard;
      playCard('player', card, color);
  };

  const endGame = (winnerId: string) => {
      playSound(winnerId === 'player' ? 'win' : 'lose');
      setWinner(winnerId);
      if (winnerId === 'player') {
          // Calcular puntos (suma de manos rivales)
          let points = 0;
          players.forEach(p => { if(p.id !== 'player') p.hand.forEach((c:any) => points += c.score); });
          
          // Bonus reto
          if (challenge.check(gameStats)) {
              points += challenge.bonus;
              setLog(`¡RETO COMPLETADO! +${challenge.bonus} PTS`);
          }
          
          setScore(s => s + points);
          saveScore(score + points);
      } else {
          setLives(l => l - 1);
      }
  };

  // --- ADS ---
  const watchAd = (type: any) => { setAdState({ active: true, type, timer: 5 }); };
  useEffect(() => {
    let i:any;
    if (adState.active && adState.timer > 0) i = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active) { clearInterval(i); setAdState({active:false, timer:5}); finishAd(); } 
    return () => clearInterval(i);
  }, [adState.active]);

  const finishAd = () => {
      if (adState.type === 'life') setLives(l => l + 1);
      if (adState.type === 'hint') highlightHint();
      setAdState(p => ({ ...p, active: false }));
  };

  const highlightHint = () => {
      const valid = players[0].hand.find((c:any) => isValidPlay(c));
      if (valid) alert(`Prueba con: ${valid.value} ${valid.color}`);
      else alert("No tienes jugadas, debes robar.");
  };

  const saveScore = async (s: number) => { if(user) await addDoc(collection(db, "scores_uno"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); fetchLeaderboard(); };

  // --- RENDER HELPERS ---
  const getColorClass = (c: string) => {
      switch(c) {
          case 'red': return 'bg-rose-600 shadow-[0_0_15px_rgba(225,29,72,0.6)] border-rose-400';
          case 'blue': return 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.6)] border-blue-400';
          case 'green': return 'bg-emerald-600 shadow-[0_0_15px_rgba(5,150,105,0.6)] border-emerald-400';
          case 'yellow': return 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.6)] border-yellow-300';
          case 'black': return 'bg-slate-900 shadow-[0_0_15px_rgba(255,255,255,0.3)] border-slate-500 bg-[url("https://www.transparenttextures.com/patterns/carbon-fibre.png")]';
          default: return 'bg-slate-700';
      }
  };

  const Card = ({ card, hidden = false, onClick, small = false }: any) => {
      if (hidden) return <div className={`rounded-xl bg-slate-800 border-2 border-slate-600 ${small ? 'w-8 h-12' : 'w-16 h-24'} shadow-lg flex items-center justify-center`}><div className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-700 to-slate-900 rounded opacity-50"></div></div>;

      return (
          <div onClick={onClick} className={`${getColorClass(card.color)} ${small ? 'w-10 h-14 text-xs' : 'w-20 h-32 sm:w-24 sm:h-36 text-2xl'} rounded-xl border-2 flex flex-col items-center justify-center relative cursor-pointer hover:scale-110 hover:-translate-y-4 transition-all duration-200 select-none group`}>
              <span className="font-black italic text-white drop-shadow-md group-hover:animate-pulse">
                  {card.value === 'skip' ? <Slash/> : card.value === 'reverse' ? <RotateCw/> : card.value === 'draw2' ? '+2' : card.value === 'draw4' ? '+4' : card.value === 'wild' ? <Sparkles/> : card.value}
              </span>
              {!small && <div className="absolute top-1 left-1 text-[10px] text-white opacity-80 font-bold">{card.value}</div>}
              {!small && <div className="absolute bottom-1 right-1 text-[10px] text-white opacity-80 font-bold rotate-180">{card.value}</div>}
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-2 font-mono text-white overflow-hidden relative">
        
        {/* AD OVERLAY */}
        {adState.active && <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center flex-col"><Eye className="w-20 h-20 text-yellow-400 animate-pulse mb-4"/><h2 className="text-2xl font-bold">PUBLICIDAD: {adState.timer}s</h2></div>}

        {/* HEADER */}
        <div className="w-full max-w-6xl flex justify-between items-center mb-4 z-10 px-4 mt-2">
            <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-3 bg-slate-900 rounded-full border border-slate-700 hover:border-pink-500 transition-all"><ArrowLeft className="w-5 h-5"/></button>
            <div className="text-center">
                <h1 className="text-3xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 tracking-tighter drop-shadow-lg">NEON UNO</h1>
                <p className="text-[10px] tracking-[0.4em] text-slate-400 font-bold">HYPER LOOP</p>
            </div>
            {view !== 'menu' && (
                <div className="flex gap-2">
                    <div className="flex items-center gap-1 bg-slate-900 px-3 py-1 rounded-full border border-pink-500/50"><Zap className="w-3 h-3 text-pink-500"/> {lives}</div>
                    <div className="flex items-center gap-1 bg-slate-900 px-3 py-1 rounded-full border border-yellow-500/50">{score} PTS</div>
                </div>
            )}
        </div>

        {view === 'menu' ? (
            <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-8 z-10">
                <button onClick={() => startGame('pve', 2)} className="bg-slate-900 p-6 rounded-2xl border border-slate-700 hover:border-blue-500 transition group flex items-center gap-4 shadow-xl">
                    <div className="p-4 bg-blue-900/30 rounded-xl"><Users className="w-8 h-8 text-blue-400"/></div>
                    <div className="text-left"><h2 className="text-xl font-black">DUELO 1vs1</h2><p className="text-xs text-slate-400">Rápido y frenético.</p></div>
                </button>
                <button onClick={() => startGame('pve', 4)} className="bg-slate-900 p-6 rounded-2xl border border-slate-700 hover:border-purple-500 transition group flex items-center gap-4 shadow-xl">
                    <div className="p-4 bg-purple-900/30 rounded-xl"><Layers className="w-8 h-8 text-purple-400"/></div>
                    <div className="text-left"><h2 className="text-xl font-black">CAOS (4 JUGADORES)</h2><p className="text-xs text-slate-400">Todos contra todos.</p></div>
                </button>
                
                {leaderboard.length > 0 && (
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 mt-4 backdrop-blur-sm">
                        <h3 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">Top Mundial</h3>
                        {leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-xs py-2 border-b border-slate-800 last:border-0 text-slate-300"><span>#{i+1} {s.displayName}</span><span className="text-yellow-500 font-bold">{s.score}</span></div>))}
                    </div>
                )}
            </div>
        ) : (
            <div className="w-full max-w-6xl flex flex-col items-center justify-between flex-grow relative z-10 pb-4 h-full">
                
                {/* RIVALES (TOP) */}
                <div className="flex justify-center gap-8 w-full mt-4">
                    {players.filter(p => p.id !== 'player').map((p, i) => (
                        <div key={p.id} className={`flex flex-col items-center transition-opacity ${turnIndex === players.indexOf(p) ? 'opacity-100 scale-110' : 'opacity-50'}`}>
                            <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center mb-2 shadow-lg">
                                <span className="text-xs font-bold">{p.hand.length}</span>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-widest">{p.name}</span>
                            {/* Mini cartas reverso */}
                            <div className="flex -space-x-2 mt-1">
                                {p.hand.slice(0, 5).map((_:any, idx:number) => <div key={idx} className="w-4 h-6 bg-slate-700 rounded border border-slate-600"></div>)}
                            </div>
                        </div>
                    ))}
                </div>

                {/* MESA CENTRAL */}
                <div className="flex gap-8 items-center justify-center my-8">
                    {/* MAZO */}
                    <div onClick={() => turnIndex === 0 && drawCard('player')} className="cursor-pointer relative group">
                        <Card hidden />
                        <div className="absolute inset-0 flex items-center justify-center"><Plus className="text-white opacity-50 group-hover:opacity-100"/></div>
                        <span className="absolute -bottom-6 w-full text-center text-[10px] font-bold text-slate-500">ROBAR</span>
                    </div>

                    {/* DESCARTE */}
                    <div className="relative">
                        {discard.length > 0 && <Card card={discard[discard.length-1]} />}
                        {/* Indicador de Color Activo */}
                        <div className={`absolute -right-12 top-1/2 -translate-y-1/2 w-4 h-24 rounded-full border border-white/20 ${getColorClass(currentColor).split(' ')[0]}`} title="Color Activo"></div>
                    </div>
                </div>

                {/* ALERTAS Y LOG */}
                <div className="mb-4 text-center">
                    <p className="text-sm font-bold text-pink-400 animate-pulse">{log}</p>
                    {isDrawPending > 0 && <p className="text-xs text-red-500 font-bold mt-1">¡ACUMULADO +{isDrawPending}!</p>}
                </div>

                {/* MANO DEL JUGADOR */}
                <div className={`w-full max-w-3xl flex justify-center items-end -space-x-6 sm:-space-x-8 pb-4 transition-opacity ${turnIndex !== 0 ? 'opacity-70 grayscale-[0.5]' : 'opacity-100'}`}>
                    {players[0].hand.map((card: CardType, i: number) => (
                        <div key={card.id} style={{ marginBottom: i%2===0 ? 0 : 20 }} className="transition-all hover:z-50 hover:mb-10">
                            <Card card={card} onClick={() => handlePlayerCardClick(card)} />
                        </div>
                    ))}
                </div>

                {/* SELECTOR DE COLOR (MODAL) */}
                {activeColorSelect && (
                    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center animate-in fade-in">
                        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 text-center">
                            <h3 className="text-xl font-black mb-4 text-white">ELIGE COLOR</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {COLORS.map(c => (
                                    <button key={c} onClick={() => handleColorSelect(c)} className={`w-24 h-24 rounded-xl ${getColorClass(c)} hover:scale-105 transition-transform`}></button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* CONTROLES EXTRA */}
                <div className="fixed bottom-4 right-4 flex flex-col gap-2">
                    <button onClick={() => watchAd('hint')} className="p-3 bg-yellow-600/80 rounded-full border border-yellow-400 hover:scale-110 transition shadow-lg"><Eye className="w-5 h-5"/></button>
                </div>

                {/* PANTALLA FIN */}
                {winner && (
                    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center">
                        {winner === 'player' ? (
                            <>
                                <Trophy className="w-24 h-24 text-yellow-400 animate-bounce mb-4"/>
                                <h1 className="text-5xl font-black text-white italic">¡VICTORIA!</h1>
                                <p className="text-slate-400 font-mono mt-2">PUNTOS GANADOS: {score}</p>
                            </>
                        ) : (
                            <>
                                <AlertCircle className="w-24 h-24 text-red-500 animate-pulse mb-4"/>
                                <h1 className="text-5xl font-black text-white italic">DERROTA</h1>
                                <p className="text-slate-400 font-mono mt-2">Inténtalo de nuevo.</p>
                            </>
                        )}
                        <button onClick={() => setView('menu')} className="mt-8 px-8 py-3 bg-white text-black font-black rounded-full hover:scale-105 transition">CONTINUAR</button>
                    </div>
                )}
            </div>
        )}
        
        {view === 'game' && challenge && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-slate-900/80 border border-slate-700 px-4 py-1 rounded-full text-[10px] font-bold text-slate-300 flex items-center gap-2">
                <Trophy className="w-3 h-3 text-yellow-500"/> RETO: {challenge.text}
            </div>
        )}

        <div className="mt-auto w-full max-w-md pt-2 opacity-50 relative z-10"><AdSpace type="banner" /><GameChat gameId="global_uno" gameName="NEON UNO" /></div>
    </div>
  );
}