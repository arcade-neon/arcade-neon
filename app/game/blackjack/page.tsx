// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, RotateCw, DollarSign, Shield, Zap, TrendingUp, Hand, Play, Trophy, Coins, Loader2 } from 'lucide-react';
import { useEconomy } from '@/contexts/EconomyContext'; 
import { useAudio } from '@/contexts/AudioContext';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';
import Link from 'next/link';

// --- CONFIGURACIÓN ---
const SUITS = ['♠', '♥', '♣', '♦'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export default function NeonBlackjack() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  const [user, setUser] = useState(null);
  
  // ESTADOS JUEGO
  const [deck, setDeck] = useState<any[]>([]);
  const [playerHand, setPlayerHand] = useState<any[]>([]);
  const [dealerHand, setDealerHand] = useState<any[]>([]);
  const [gameState, setGameState] = useState('betting'); // betting, playing, dealerTurn, finished
  const [bet, setBet] = useState(0);
  const [result, setResult] = useState(''); // win, lose, push, blackjack, bust
  const [history, setHistory] = useState<string[]>([]);
  
  // RANKING
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingRank, setLoadingRank] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ? { uid: u.uid, name: u.displayName || 'High Roller' } : null));
    fetchLeaderboard();
    return () => unsub();
  }, []);

  // --- LÓGICA DE CARTAS ---
  const createDeck = () => {
    let newDeck = [];
    for (let suit of SUITS) {
      for (let val of VALUES) {
        let numeric = parseInt(val);
        if (['J', 'Q', 'K'].includes(val)) numeric = 10;
        if (val === 'A') numeric = 11;
        newDeck.push({ suit, value: val, numeric, color: (suit === '♥' || suit === '♦') ? 'red' : 'black' });
      }
    }
    return newDeck.sort(() => Math.random() - 0.5);
  };

  const calculateScore = (hand: any[]) => {
    let score = 0;
    let aces = 0;
    hand.forEach(card => {
      score += card.numeric;
      if (card.value === 'A') aces += 1;
    });
    while (score > 21 && aces > 0) {
      score -= 10;
      aces -= 1;
    }
    return score;
  };

  // --- ACCIONES DE JUEGO ---
  const handleBet = (amount: number) => {
    if (bet + amount > coins) {
      playSound('error');
      return alert("¡Fondos insuficientes! Gana monedas en otros juegos o en la tienda.");
    }
    playSound('click');
    setBet(b => b + amount);
  };

  const clearBet = () => { playSound('click'); setBet(0); };

  const dealGame = async () => {
    if (bet <= 0) return alert("Debes hacer una apuesta inicial.");
    
    // COBRAR ENTRADA
    const success = await spendCoins(bet, "Apuesta Blackjack");
    if (!success) return;

    playSound('card');
    const newDeck = createDeck();
    const pHand = [newDeck.pop(), newDeck.pop()];
    const dHand = [newDeck.pop(), newDeck.pop()];

    setDeck(newDeck);
    setPlayerHand(pHand);
    setDealerHand(dHand);
    setGameState('playing');
    setResult('');

    // Verificar Blackjack instantáneo del jugador
    if (calculateScore(pHand) === 21) {
      if (calculateScore(dHand) === 21) endGame('push', pHand, dHand, bet);
      else endGame('blackjack', pHand, dHand, bet);
    }
  };

  const hit = () => {
    playSound('card');
    const newDeck = [...deck];
    const card = newDeck.pop();
    const newHand = [...playerHand, card];
    setPlayerHand(newHand);
    setDeck(newDeck);

    if (calculateScore(newHand) > 21) {
      endGame('bust', newHand, dealerHand, bet);
    }
  };

  const stand = () => {
    setGameState('dealerTurn');
    setTimeout(() => runDealerLogic(dealerHand, deck), 800);
  };

  const doubleDown = async () => {
    if (coins < bet) return alert("No tienes fondos para doblar.");
    
    const success = await spendCoins(bet, "Doblar Apuesta Blackjack");
    if (!success) return;

    const newBet = bet * 2;
    setBet(newBet);
    playSound('card');
    
    const newDeck = [...deck];
    const card = newDeck.pop();
    const newHand = [...playerHand, card];
    setPlayerHand(newHand);
    
    if (calculateScore(newHand) > 21) {
      endGame('bust', newHand, dealerHand, newBet);
    } else {
      setGameState('dealerTurn');
      setTimeout(() => runDealerLogic(dealerHand, newDeck), 1000);
    }
  };

  // --- IA DEL DEALER ---
  const runDealerLogic = async (currentDealerHand: any[], currentDeck: any[]) => {
    let dHand = [...currentDealerHand];
    let dScore = calculateScore(dHand);
    let dDeck = [...currentDeck];

    const drawLoop = () => {
        if (dScore < 17) {
            playSound('card');
            const card = dDeck.pop();
            dHand.push(card);
            dScore = calculateScore(dHand);
            setDealerHand([...dHand]);
            setDeck(dDeck);
            setTimeout(drawLoop, 1000); 
        } else {
            const pScore = calculateScore(playerHand);
            let finalResult = 'lose';
            
            if (dScore > 21) finalResult = 'win'; 
            else if (pScore > dScore) finalResult = 'win';
            else if (pScore === dScore) finalResult = 'push';
            
            endGame(finalResult, playerHand, dHand, bet);
        }
    };
    drawLoop();
  };

  const endGame = async (res: string, pHand: any[], dHand: any[], finalBet: number) => {
    setGameState('finished');
    setResult(res);
    
    let winAmount = 0;

    if (res === 'win') {
      playSound('win');
      winAmount = finalBet * 2;
      addCoins(winAmount, "Ganancia Blackjack");
      setHistory(prev => [`Ganaste +${winAmount}`, ...prev].slice(0,5));
    } else if (res === 'blackjack') {
      playSound('win'); 
      winAmount = Math.floor(finalBet * 2.5);
      addCoins(winAmount, "Blackjack Puro");
      setHistory(prev => [`BLACKJACK! +${winAmount}`, ...prev].slice(0,5));
    } else if (res === 'push') {
      addCoins(finalBet, "Empate Blackjack"); 
      setHistory(prev => [`Empate (Retorno ${finalBet})`, ...prev].slice(0,5));
    } else {
      playSound('explosion');
      setHistory(prev => [`Perdiste -${finalBet}`, ...prev].slice(0,5));
    }

    // Registrar en el Ranking si la ganancia NETA es mayor a 0
    const netProfit = winAmount - finalBet;
    if (user && netProfit > 0) {
        saveScoreToLeaderboard(netProfit);
    }
  };

  // --- RANKING LOGIC ---
  const saveScoreToLeaderboard = async (netProfit) => {
      try {
        await addDoc(collection(db, "scores_blackjack"), { 
            uid: user.uid, displayName: user.name, score: netProfit, date: serverTimestamp() 
        });
        fetchLeaderboard();
      } catch (e) { console.error(e); }
  };

  const fetchLeaderboard = async () => {
    setLoadingRank(true);
    try {
      const q = query(collection(db, "scores_blackjack"), orderBy("score", "desc"), limit(5));
      const s = await getDocs(q);
      setLeaderboard(s.docs.map(d => d.data()));
    } catch (e) { console.error(e); } finally { setLoadingRank(false); }
  };


  // --- COMPONENTES VISUALES ---
  const Card = ({ card, hidden, index }: { card: any, hidden?: boolean, index: number }) => {
    // Cálculo de abanico (Fan effect)
    const rotation = (index - 0.5) * 8; 
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const offset = isMobile ? index * -30 : index * -50; 

    if (hidden) return (
      <div 
        style={{ transform: `translateX(${offset}px) rotate(${rotation}deg)`, zIndex: index }}
        className="w-16 h-24 sm:w-24 sm:h-36 bg-gradient-to-br from-slate-800 to-black border-2 border-green-500/50 rounded-xl shadow-2xl flex items-center justify-center relative transition-transform duration-500 origin-bottom hover:-translate-y-4"
      >
         <div className="w-12 h-16 sm:w-16 sm:h-24 border border-green-500/20 rounded flex items-center justify-center bg-[radial-gradient(rgba(34,197,94,0.1)_1px,transparent_1px)] [background-size:4px_4px]">
            <Shield className="w-6 h-6 text-green-500/30"/>
         </div>
      </div>
    );

    return (
      <div 
        style={{ transform: `translateX(${offset}px) rotate(${rotation}deg)`, zIndex: index }}
        className={`w-16 h-24 sm:w-24 sm:h-36 bg-white rounded-xl shadow-2xl flex flex-col items-center justify-between p-1.5 sm:p-2 relative animate-in slide-in-from-top-10 duration-500 origin-bottom hover:-translate-y-4 transition-transform border border-slate-200 ${card.color === 'red' ? 'text-red-600' : 'text-slate-900'}`}
      >
        <div className="w-full text-left font-black text-sm sm:text-xl leading-none">{card.value}</div>
        <div className="text-3xl sm:text-5xl">{card.suit}</div>
        <div className="w-full text-right font-black text-sm sm:text-xl leading-none rotate-180">{card.value}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-2 sm:p-4 font-mono text-white relative overflow-hidden select-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-green-900/10 via-[#050b14] to-black pointer-events-none"></div>
        
        {/* HEADER STANDARD */}
        <div className="w-full max-w-6xl flex justify-between items-center mb-4 sm:mb-8 z-10 px-2 mt-2">
            <Link href="/" className="p-2 sm:p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-green-500 transition-all shadow-lg"><ArrowLeft className="w-5 h-5"/></Link>
            <div className="text-center">
                <h1 className="text-2xl sm:text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 tracking-tighter drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]">NEON 21</h1>
                <p className="text-[8px] sm:text-[10px] text-green-500/80 font-bold tracking-[0.5em] uppercase">High Stakes</p>
            </div>
            
            {/* COIN DISPLAY GLOBALES */}
            <div className="bg-slate-900/90 backdrop-blur-md px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-yellow-500/30 flex items-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.1)]">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-md">
                    <Coins className="w-3 h-3 text-black fill-current" />
                </div>
                <span className="text-xs sm:text-sm font-black text-yellow-400 tabular-nums">{coins.toLocaleString()}</span>
            </div>
        </div>

        {/* CONTENEDOR PRINCIPAL */}
        <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-6 items-start z-10">
            
            {/* MESA DE JUEGO */}
            <div className="flex-1 w-full bg-[#0a1f14] border-4 sm:border-[8px] border-[#133d28] rounded-[2rem] sm:rounded-[3rem] p-4 sm:p-8 shadow-[0_0_50px_rgba(22,163,74,0.15)] relative min-h-[400px] sm:min-h-[550px] flex flex-col justify-between overflow-hidden">
                
                {/* LÍNEA DE LA MESA */}
                <div className="absolute top-[45%] left-10 right-10 h-px bg-green-500/20 border-b border-dashed border-green-500/10 rounded-[100%]"></div>

                {/* DEALER AREA */}
                <div className="flex flex-col items-center mb-4 sm:mb-8 relative z-10">
                    <div className="flex justify-center h-24 sm:h-36 pl-8 sm:pl-12">
                        {dealerHand.map((c, i) => (
                            <Card key={i} card={c} hidden={gameState === 'playing' && i === 1} index={i} />
                        ))}
                        {dealerHand.length === 0 && <div className="w-16 h-24 sm:w-24 sm:h-36 border-2 border-dashed border-green-500/20 rounded-xl flex items-center justify-center text-green-500/20 font-bold text-xs sm:text-base">DEALER</div>}
                    </div>
                    {gameState !== 'betting' && gameState !== 'playing' && (
                        <div className="mt-4 bg-black/80 px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold text-green-400 border border-green-500/30 animate-in zoom-in">
                            PUNTOS: {calculateScore(dealerHand)}
                        </div>
                    )}
                </div>

                {/* ZONA CENTRAL (MENSAJES) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-30 pointer-events-none w-full">
                    {result && (
                        <div className={`text-4xl sm:text-6xl font-black italic tracking-tighter animate-in zoom-in duration-300 drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] uppercase ${result === 'win' || result === 'blackjack' ? 'text-yellow-400' : result === 'push' ? 'text-slate-300' : 'text-rose-500'}`}>
                            {result === 'win' && '¡GANASTE!'}
                            {result === 'blackjack' && '¡BLACKJACK!'}
                            {result === 'bust' && 'TE PASASTE'}
                            {result === 'lose' && 'LA CASA GANA'}
                            {result === 'push' && 'EMPATE'}
                        </div>
                    )}
                    {gameState === 'betting' && <div className="text-green-500/30 font-bold text-lg sm:text-2xl animate-pulse tracking-widest">HAGA SU APUESTA</div>}
                </div>

                {/* PLAYER AREA */}
                <div className="flex flex-col items-center relative z-10">
                    {gameState !== 'betting' && (
                        <div className="mb-4 bg-black/80 px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold text-white border border-white/20 animate-in zoom-in">
                            TUS PUNTOS: {calculateScore(playerHand)}
                        </div>
                    )}
                    <div className="flex justify-center h-24 sm:h-36 pl-8 sm:pl-12">
                        {playerHand.map((c, i) => (
                            <Card key={i} card={c} index={i} />
                        ))}
                        {playerHand.length === 0 && <div className="w-16 h-24 sm:w-24 sm:h-36 border-2 border-dashed border-white/20 rounded-xl flex items-center justify-center text-white/20 font-bold text-xs sm:text-base">JUGADOR</div>}
                    </div>
                </div>
            </div>

            {/* PANEL DERECHO (CONTROLES Y RANKING) */}
            <div className="w-full lg:w-80 flex flex-col gap-4">
                
                {/* CAJA DE CONTROLES */}
                <div className="bg-slate-900/80 border border-slate-700 p-4 sm:p-6 rounded-[2rem] shadow-xl backdrop-blur-md">
                    {gameState === 'betting' ? (
                        <div className="flex flex-col items-center gap-4 animate-in fade-in">
                            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Fichas</p>
                            <div className="flex gap-2 sm:gap-3 flex-wrap justify-center">
                                {[10, 50, 100, 500].map(amt => (
                                    <button key={amt} onClick={() => handleBet(amt)} className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-slate-950 border-4 border-dashed border-emerald-600 flex items-center justify-center font-black text-emerald-400 hover:scale-110 hover:bg-emerald-900 hover:border-solid hover:text-white transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] active:scale-95 text-xs sm:text-sm">
                                        {amt}
                                    </button>
                                ))}
                            </div>
                            <div className="w-full h-px bg-slate-800 my-2"></div>
                            <div className="w-full flex justify-between items-center bg-black/50 p-3 rounded-xl border border-slate-800">
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Apuesta Total</span>
                                <span className="text-xl font-black text-yellow-400 flex items-center gap-1"><DollarSign className="w-4 h-4"/>{bet}</span>
                            </div>
                            <div className="flex gap-2 w-full">
                                <button onClick={clearBet} className="px-4 py-3 bg-slate-800 rounded-xl font-bold text-slate-400 hover:bg-slate-700 transition-colors text-xs w-1/3">CLEAR</button>
                                <button onClick={dealGame} disabled={bet===0} className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 rounded-xl font-black text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 text-xs sm:text-sm">
                                    REPARTIR
                                </button>
                            </div>
                        </div>
                    ) : gameState === 'playing' ? (
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 animate-in fade-in">
                            <button onClick={hit} className="col-span-2 py-4 sm:py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center justify-center gap-2 active:scale-95 transition-all text-sm sm:text-base">
                                <Zap className="w-5 h-5"/> PEDIR CARTA
                            </button>
                            <button onClick={stand} className="py-3 sm:py-4 bg-rose-600 hover:bg-rose-500 rounded-2xl font-black text-white shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all text-xs sm:text-sm">
                                <Hand className="w-4 h-4"/> PLANTARSE
                            </button>
                            <button onClick={doubleDown} disabled={playerHand.length !== 2 || coins < bet} className="py-3 sm:py-4 bg-yellow-600 hover:bg-yellow-500 rounded-2xl font-black text-white shadow-lg flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 text-xs sm:text-sm">
                                <TrendingUp className="w-4 h-4"/> DOBLAR x2
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 animate-in fade-in">
                            <div className="bg-slate-950 p-4 rounded-xl text-center border border-slate-800">
                                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Resultado de la mano</p>
                                <p className={`font-black text-xl ${result === 'win' || result === 'blackjack' ? 'text-green-400' : result === 'push' ? 'text-slate-400' : 'text-rose-500'}`}>
                                    {history[0] || 'Terminado'}
                                </p>
                            </div>
                            <button onClick={() => {setGameState('betting'); setBet(0); setPlayerHand([]); setDealerHand([]);}} className="w-full py-4 sm:py-5 bg-white text-black font-black rounded-2xl shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm sm:text-base">
                                <RotateCw className="w-5 h-5"/> NUEVA MANO
                            </button>
                        </div>
                    )}
                </div>

                {/* RANKING HIGH ROLLERS */}
                <div className="bg-slate-900/50 p-4 sm:p-5 rounded-[2rem] border border-slate-800 hidden lg:block">
                    <h3 className="text-[10px] text-slate-400 uppercase font-bold mb-3 flex items-center gap-2 tracking-widest"><Trophy className="w-3 h-3 text-yellow-500"/> Top Ganancias (Netas)</h3>
                    {loadingRank ? <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-green-500"/></div> : leaderboard.length > 0 ? leaderboard.map((s,i) => (
                    <div key={i} className="flex justify-between text-xs py-2 border-b border-white/5 last:border-0 items-center">
                        <span className="text-slate-300 font-bold flex items-center gap-2">
                            <span className={`w-4 text-center ${i===0?'text-yellow-400':i===1?'text-slate-300':i===2?'text-amber-600':'text-slate-600'}`}>{i+1}</span>
                            {s.displayName.substring(0,10)}
                        </span>
                        <span className="text-green-400 font-black">+{s.score.toLocaleString()}</span>
                    </div>
                    )) : <p className="text-[10px] text-slate-600 text-center italic py-2">Sé el primer High Roller.</p>}
                </div>

            </div>
        </div>
        
        {/* FOOTER COMPONENTS */}
        <div className="w-full max-w-6xl mt-6 flex flex-col items-center opacity-80">
            <AdSpace type="banner" />
            <div className="w-full max-w-md mt-4">
                <GameChat gameId="global_blackjack" gameName="BLACKJACK" />
            </div>
        </div>
    </div>
  );
}