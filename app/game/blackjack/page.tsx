// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, RotateCw, DollarSign, Shield, Zap, TrendingUp, Hand, Play } from 'lucide-react';
import { useEconomy } from '@/contexts/EconomyContext'; // CONEXIÓN AL BANCO
import { useAudio } from '@/contexts/AudioContext';
import AdSpace from '@/components/AdSpace';
import Link from 'next/link';

// --- CONFIGURACIÓN ---
const SUITS = ['♠', '♥', '♣', '♦'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export default function NeonBlackjack() {
  const { coins, spendCoins, addCoins } = useEconomy();
  const { playSound } = useAudio();
  
  // ESTADOS
  const [deck, setDeck] = useState<any[]>([]);
  const [playerHand, setPlayerHand] = useState<any[]>([]);
  const [dealerHand, setDealerHand] = useState<any[]>([]);
  const [gameState, setGameState] = useState('betting'); // betting, playing, dealerTurn, finished
  const [bet, setBet] = useState(0);
  const [result, setResult] = useState(''); // win, lose, push, blackjack
  const [history, setHistory] = useState<string[]>([]);

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
      return alert("¡Fondos insuficientes! Gana más monedas en otros juegos.");
    }
    playSound('click');
    setBet(b => b + amount);
  };

  const clearBet = () => { playSound('click'); setBet(0); };

  const dealGame = async () => {
    if (bet <= 0) return alert("Debes apostar algo.");
    
    // COBRAR ENTRADA
    const success = await spendCoins(bet, "Apuesta Blackjack");
    if (!success) return;

    playSound('card');
    const newDeck = createDeck();
    const pHand = [newDeck.pop(), newDeck.pop()];
    const dHand = [newDeck.pop(), newDeck.pop()]; // La segunda carta del dealer estaría oculta visualmente

    setDeck(newDeck);
    setPlayerHand(pHand);
    setDealerHand(dHand);
    setGameState('playing');
    setResult('');

    // Verificar Blackjack instantáneo
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
    // Pequeño delay para dramatismo
    setTimeout(() => runDealerLogic(dealerHand, deck), 800);
  };

  const doubleDown = async () => {
    if (coins < bet) return alert("No tienes fondos para doblar.");
    
    // Cobrar la diferencia
    const success = await spendCoins(bet, "Doblar Apuesta Blackjack");
    if (!success) return;

    const newBet = bet * 2;
    setBet(newBet);
    playSound('card');
    
    // Robar UNA sola carta
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

    // El dealer pide carta si tiene menos de 17
    // Usamos recursividad con timeout para animar las cartas una a una
    const drawLoop = () => {
        if (dScore < 17) {
            playSound('card');
            const card = dDeck.pop();
            dHand.push(card);
            dScore = calculateScore(dHand);
            setDealerHand([...dHand]);
            setDeck(dDeck);
            setTimeout(drawLoop, 1000); // Carta cada segundo
        } else {
            // Fin del turno del dealer, calcular ganador
            const pScore = calculateScore(playerHand);
            let finalResult = 'lose';
            
            if (dScore > 21) finalResult = 'win'; // Dealer se pasa
            else if (pScore > dScore) finalResult = 'win';
            else if (pScore === dScore) finalResult = 'push';
            
            endGame(finalResult, playerHand, dHand, bet);
        }
    };
    drawLoop();
  };

  const endGame = (res: string, pHand: any[], dHand: any[], finalBet: number) => {
    setGameState('finished');
    setResult(res);
    
    if (res === 'win') {
      playSound('win');
      addCoins(finalBet * 2, "Ganancia Blackjack");
      setHistory(prev => [`Ganaste +${finalBet}`, ...prev.slice(0,4)]);
    } else if (res === 'blackjack') {
      playSound('win'); // Sonido especial si tienes
      addCoins(Math.floor(finalBet * 2.5), "Blackjack Puro");
      setHistory(prev => [`BLACKJACK! +${Math.floor(finalBet * 1.5)}`, ...prev.slice(0,4)]);
    } else if (res === 'push') {
      addCoins(finalBet, "Empate Blackjack"); // Devolver apuesta
      setHistory(prev => [`Empate (Recuperas ${finalBet})`, ...prev.slice(0,4)]);
    } else {
      playSound('lose');
      setHistory(prev => [`Perdiste -${finalBet}`, ...prev.slice(0,4)]);
    }
  };

  // --- COMPONENTES VISUALES ---
  const Card = ({ card, hidden }: { card: any, hidden?: boolean }) => {
    if (hidden) return (
      <div className="w-20 h-28 sm:w-24 sm:h-36 bg-gradient-to-br from-red-900 to-black border-2 border-red-500 rounded-lg shadow-xl flex items-center justify-center relative transform transition-transform hover:scale-105">
         <div className="w-16 h-24 border border-red-500/30 rounded flex items-center justify-center">
            <span className="text-2xl font-bold text-red-500/50">DR</span>
         </div>
      </div>
    );

    return (
      <div className={`w-20 h-28 sm:w-24 sm:h-36 bg-white rounded-lg shadow-2xl flex flex-col items-center justify-between p-2 relative animate-in slide-in-from-top-4 duration-300 transform hover:-translate-y-2 transition-all ${card.color === 'red' ? 'text-red-600' : 'text-slate-900'}`}>
        <div className="w-full text-left font-black text-lg leading-none">{card.value}</div>
        <div className="text-4xl">{card.suit}</div>
        <div className="w-full text-right font-black text-lg leading-none rotate-180">{card.value}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono text-white relative overflow-hidden">
        {/* FONDO NEON CASINO */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-green-900/20 via-[#050b14] to-black pointer-events-none"></div>
        
        {/* HEADER */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-8 z-10">
            <Link href="/" className="p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-green-500 transition-all"><ArrowLeft className="w-5 h-5"/></Link>
            <div className="text-center">
                <h1 className="text-3xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 tracking-tighter">NEON 21</h1>
                <p className="text-[10px] text-green-500/50 font-bold tracking-[0.5em]">HIGH STAKES</p>
            </div>
            <div className="w-10"></div>
        </div>

        {/* TABLERO DE JUEGO */}
        <div className="w-full max-w-4xl bg-[#0f2e1d] border-[8px] border-[#1a4731] rounded-[3rem] p-8 shadow-[0_0_50px_rgba(22,163,74,0.1)] relative min-h-[500px] flex flex-col justify-between">
            {/* DEALER AREA */}
            <div className="flex flex-col items-center mb-8">
                <div className="flex gap-2 justify-center h-36">
                    {dealerHand.map((c, i) => (
                        <div key={i} className={gameState === 'playing' && i === 1 ? '' : ''}>
                            <Card card={c} hidden={gameState === 'playing' && i === 1} />
                        </div>
                    ))}
                    {dealerHand.length === 0 && <div className="w-24 h-36 border-2 border-dashed border-green-500/20 rounded-lg flex items-center justify-center text-green-500/20 font-bold">DEALER</div>}
                </div>
                {gameState !== 'betting' && gameState !== 'playing' && (
                    <div className="mt-2 bg-black/50 px-4 py-1 rounded-full text-xs font-bold text-green-400">
                        PUNTOS: {calculateScore(dealerHand)}
                    </div>
                )}
            </div>

            {/* ZONA CENTRAL (MENSAJES) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-20 pointer-events-none">
                {result && (
                    <div className={`text-5xl font-black italic tracking-tighter animate-in zoom-in duration-300 drop-shadow-lg ${result === 'win' || result === 'blackjack' ? 'text-yellow-400' : result === 'push' ? 'text-slate-300' : 'text-red-500'}`}>
                        {result === 'win' && '¡GANASTE!'}
                        {result === 'blackjack' && '¡BLACKJACK!'}
                        {result === 'bust' && 'TE PASASTE'}
                        {result === 'lose' && 'LA CASA GANA'}
                        {result === 'push' && 'EMPATE'}
                    </div>
                )}
                {gameState === 'betting' && <div className="text-green-500/30 font-bold text-xl animate-pulse">HAGA SU APUESTA</div>}
            </div>

            {/* PLAYER AREA */}
            <div className="flex flex-col items-center">
                {gameState !== 'betting' && (
                    <div className="mb-2 bg-black/50 px-4 py-1 rounded-full text-xs font-bold text-white">
                        TUS PUNTOS: {calculateScore(playerHand)}
                    </div>
                )}
                <div className="flex gap-2 justify-center h-36 relative">
                    {playerHand.map((c, i) => (
                        <div key={i} style={{ transform: `translateX(${i * -40}px) rotate(${i * 5}deg)` }} className="transition-all origin-bottom-left">
                            <Card card={c} />
                        </div>
                    ))}
                    {playerHand.length === 0 && <div className="w-24 h-36 border-2 border-dashed border-white/20 rounded-lg flex items-center justify-center text-white/20 font-bold">JUGADOR</div>}
                </div>
            </div>
        </div>

        {/* CONTROLES */}
        <div className="w-full max-w-4xl mt-6">
            {gameState === 'betting' ? (
                <div className="flex flex-col items-center gap-4 animate-in slide-in-from-bottom">
                    <div className="flex gap-4 flex-wrap justify-center">
                        {[10, 50, 100, 500].map(amt => (
                            <button key={amt} onClick={() => handleBet(amt)} className="w-16 h-16 rounded-full bg-slate-900 border-4 border-dashed border-green-600 flex items-center justify-center font-black text-green-400 hover:scale-110 hover:bg-green-900 hover:border-solid hover:text-white transition-all shadow-[0_0_15px_rgba(22,163,74,0.3)]">
                                {amt}
                            </button>
                        ))}
                        <button onClick={clearBet} className="w-16 h-16 rounded-full bg-red-900/50 border-2 border-red-600 flex items-center justify-center text-xs font-bold text-red-400 hover:bg-red-800 transition-all">BORRAR</button>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-xl font-bold text-yellow-400 bg-black/50 px-6 py-2 rounded-lg border border-yellow-500/30">
                            APUESTA: {bet}
                        </div>
                        <button onClick={dealGame} disabled={bet===0} className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-full font-black text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all scale-105">
                            REPARTIR CARTAS
                        </button>
                    </div>
                </div>
            ) : gameState === 'playing' ? (
                <div className="flex justify-center gap-4 animate-in slide-in-from-bottom">
                    <button onClick={hit} className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-black text-white shadow-lg flex items-center gap-2 transition-transform hover:scale-105">
                        <Zap className="w-5 h-5"/> PEDIR
                    </button>
                    <button onClick={stand} className="px-8 py-4 bg-red-600 hover:bg-red-500 rounded-xl font-black text-white shadow-lg flex items-center gap-2 transition-transform hover:scale-105">
                        <Hand className="w-5 h-5"/> PLANTARSE
                    </button>
                    {playerHand.length === 2 && coins >= bet && (
                        <button onClick={doubleDown} className="px-8 py-4 bg-yellow-600 hover:bg-yellow-500 rounded-xl font-black text-white shadow-lg flex items-center gap-2 transition-transform hover:scale-105">
                            <TrendingUp className="w-5 h-5"/> DOBLAR
                        </button>
                    )}
                </div>
            ) : (
                <div className="flex justify-center animate-in slide-in-from-bottom">
                    <button onClick={() => {setGameState('betting'); setBet(0); setPlayerHand([]); setDealerHand([]);}} className="px-12 py-4 bg-white text-black font-black rounded-full hover:scale-105 shadow-xl transition-all flex items-center gap-2">
                        <RotateCw className="w-5 h-5"/> NUEVA MANO
                    </button>
                </div>
            )}
        </div>

        <div className="mt-8 text-xs text-slate-500 font-mono">
            HISTORIAL: {history.join(' | ')}
        </div>
        
        <div className="mt-auto opacity-50"><AdSpace type="banner" /></div>
    </div>
  );
}