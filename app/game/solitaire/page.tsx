// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
// IMPORTACIÓN LIMPIA SIN ELEMENTOS SOBRANTES
import { ArrowLeft, RotateCw, Trophy, Crown } from 'lucide-react';
import { useEconomy } from '@/contexts/EconomyContext';
import { useAudio } from '@/contexts/AudioContext';
import AdSpace from '@/components/AdSpace';

// --- CONFIGURACIÓN ---
const SUITS = ['♠', '♥', '♣', '♦'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

type CardType = {
  id: string;
  suit: string;
  value: string;
  numeric: number;
  color: string;
  faceUp: boolean;
};

export default function Solitaire() {
  const { addCoins } = useEconomy();
  const { playSound } = useAudio();

  // ESTADO DEL JUEGO
  const [deck, setDeck] = useState<CardType[]>([]);
  const [waste, setWaste] = useState<CardType[]>([]);
  const [foundations, setFoundations] = useState<CardType[][]>([[], [], [], []]); // 4 palos
  const [tableau, setTableau] = useState<CardType[][]>([[], [], [], [], [], [], []]); // 7 columnas
  
  const [selectedCard, setSelectedCard] = useState<{ type: 'waste' | 'tableau' | 'foundation', colIdx?: number, cardIdx?: number } | null>(null);
  const [win, setWin] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    startNewGame();
  }, []);

  // --- LÓGICA DE INICIO ---
  const startNewGame = () => {
    // 1. Crear baraja
    let newDeck: CardType[] = [];
    SUITS.forEach(suit => {
      VALUES.forEach((val, idx) => {
        newDeck.push({
          id: `${val}${suit}`,
          suit,
          value: val,
          numeric: idx + 1,
          color: (suit === '♥' || suit === '♦') ? 'red' : 'black',
          faceUp: false
        });
      });
    });
    
    // 2. Barajar
    newDeck.sort(() => Math.random() - 0.5);

    // 3. Repartir Tableau (7 columnas)
    const newTableau: CardType[][] = [[], [], [], [], [], [], []];
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j <= i; j++) {
        const card = newDeck.pop()!;
        if (j === i) card.faceUp = true; // La última carta boca arriba
        newTableau[i].push(card);
      }
    }

    setDeck(newDeck);
    setWaste([]);
    setFoundations([[], [], [], []]);
    setTableau(newTableau);
    setWin(false);
    setScore(0);
    setSelectedCard(null);
    playSound('start');
  };

  // --- MOVIMIENTOS ---
  const handleStockClick = () => {
    if (deck.length === 0) {
      if (waste.length === 0) return;
      // Reciclar descarte
      const newDeck = [...waste].reverse().map(c => ({ ...c, faceUp: false }));
      setDeck(newDeck);
      setWaste([]);
      playSound('card');
    } else {
      // Robar carta
      const newDeck = [...deck];
      const card = newDeck.pop()!;
      card.faceUp = true;
      setWaste(prev => [...prev, card]);
      setDeck(newDeck);
      playSound('card');
    }
    setSelectedCard(null);
  };

  const handleCardClick = (type: 'waste' | 'tableau' | 'foundation', colIdx?: number, cardIdx?: number) => {
    // 1. Si no hay selección, seleccionar origen
    if (!selectedCard) {
      if (type === 'waste' && waste.length > 0) {
        setSelectedCard({ type: 'waste' });
        playSound('click');
      } else if (type === 'tableau' && tableau[colIdx!][cardIdx!].faceUp) {
        setSelectedCard({ type: 'tableau', colIdx, cardIdx });
        playSound('click');
      }
      return;
    }

    // 2. Si ya hay selección, intentar mover al destino
    // Si clicamos lo mismo, deseleccionar
    if (selectedCard.type === type && selectedCard.colIdx === colIdx && selectedCard.cardIdx === cardIdx) {
      setSelectedCard(null);
      return;
    }

    if (type === 'tableau') attemptMoveToTableau(colIdx!);
    if (type === 'foundation') attemptMoveToFoundation(colIdx!);
  };

  const attemptMoveToTableau = (destColIdx: number) => {
    if (!selectedCard) return;

    let cardsToMove: CardType[] = [];
    
    // Obtener cartas a mover
    if (selectedCard.type === 'waste') {
      cardsToMove = [waste[waste.length - 1]];
    } else if (selectedCard.type === 'tableau') {
      cardsToMove = tableau[selectedCard.colIdx!].slice(selectedCard.cardIdx!);
    } else {
      return; // No movemos desde foundation hacia abajo
    }

    const movingCard = cardsToMove[0];
    const destCol = tableau[destColIdx];
    const targetCard = destCol[destCol.length - 1];

    // Validar Movimiento (Color alterno y valor descendente)
    let isValid = false;
    if (!targetCard) {
      if (movingCard.value === 'K') isValid = true; // Solo Reyes en huecos vacíos
    } else {
      if (movingCard.color !== targetCard.color && movingCard.numeric === targetCard.numeric - 1) {
        isValid = true;
      }
    }

    if (isValid) {
      executeMove(cardsToMove, destColIdx, 'tableau');
    } else {
      playSound('error');
      setSelectedCard(null);
    }
  };

  const attemptMoveToFoundation = (foundIdx: number) => {
    if (!selectedCard) return;
    
    let cardToMove: CardType | null = null;
    
    if (selectedCard.type === 'waste') cardToMove = waste[waste.length - 1];
    if (selectedCard.type === 'tableau') {
      const col = tableau[selectedCard.colIdx!];
      // Solo podemos subir la última carta del tableau
      if (selectedCard.cardIdx === col.length - 1) cardToMove = col[col.length - 1];
    }

    if (!cardToMove) return;

    const pile = foundations[foundIdx];
    const topCard = pile[pile.length - 1];

    // Validar (Mismo palo, ascendente)
    let isValid = false;
    if (!topCard) {
      if (cardToMove.value === 'A') isValid = true;
    } else {
      if (cardToMove.suit === topCard.suit && cardToMove.numeric === topCard.numeric + 1) {
        isValid = true;
      }
    }

    if (isValid) {
      executeMove([cardToMove], foundIdx, 'foundation');
    } else {
      playSound('error');
      setSelectedCard(null);
    }
  };

  const executeMove = (cards: CardType[], destIdx: number, destType: 'tableau' | 'foundation') => {
    // 1. Quitar de origen
    if (selectedCard?.type === 'waste') {
      setWaste(prev => prev.slice(0, -1));
    } else if (selectedCard?.type === 'tableau') {
      const newTableau = [...tableau];
      const sourceCol = newTableau[selectedCard.colIdx!];
      sourceCol.splice(selectedCard.cardIdx!, cards.length);
      
      // Voltear la nueva última carta si estaba boca abajo
      if (sourceCol.length > 0 && !sourceCol[sourceCol.length - 1].faceUp) {
        sourceCol[sourceCol.length - 1].faceUp = true;
        setScore(s => s + 5);
      }
      setTableau(newTableau);
    }

    // 2. Poner en destino
    if (destType === 'tableau') {
      const newTableau = [...tableau];
      newTableau[destIdx] = [...newTableau[destIdx], ...cards];
      setTableau(newTableau);
    } else {
      const newFoundations = [...foundations];
      newFoundations[destIdx] = [...newFoundations[destIdx], ...cards];
      setFoundations(newFoundations);
      setScore(s => s + 10);
      checkWin(newFoundations);
    }

    playSound('card');
    setSelectedCard(null);
  };

  const checkWin = (currentFoundations: CardType[][]) => {
    const total = currentFoundations.reduce((acc, pile) => acc + pile.length, 0);
    if (total === 52) {
      setWin(true);
      playSound('win');
      addCoins(75, "Victoria Solitario"); // PAGO DE ECONOMÍA
    }
  };

  // --- COMPONENTES VISUALES ---
  const Card = ({ card, onClick, isSelected, style = {} }: any) => {
    if (!card) return <div className="w-16 h-24 sm:w-20 sm:h-28 border-2 border-white/10 rounded-lg bg-white/5" onClick={onClick}></div>; // Hueco vacío

    if (!card.faceUp) {
      return (
        <div className="w-16 h-24 sm:w-20 sm:h-28 bg-gradient-to-br from-indigo-900 to-black border-2 border-indigo-500 rounded-lg shadow-md relative" style={style} onClick={onClick}>
           <div className="absolute inset-2 border border-indigo-500/30 rounded flex items-center justify-center">
             <div className="text-indigo-500/50 text-xl">DR</div>
           </div>
        </div>
      );
    }

    return (
      <div 
        onClick={onClick}
        style={style}
        className={`w-16 h-24 sm:w-20 sm:h-28 bg-white rounded-lg shadow-lg flex flex-col justify-between p-1.5 cursor-pointer transition-transform ${isSelected ? 'ring-4 ring-yellow-400 -translate-y-2 z-50' : 'hover:-translate-y-1'} ${card.color === 'red' ? 'text-red-600' : 'text-slate-900'}`}
      >
        <div className="text-sm font-black leading-none">{card.value} {card.suit}</div>
        <div className="text-2xl self-center">{card.suit}</div>
        <div className="text-sm font-black leading-none self-end rotate-180">{card.value} {card.suit}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-2 font-mono text-white overflow-hidden">
      
      {/* HEADER */}
      <div className="w-full max-w-7xl flex justify-between items-center mb-4 z-10 px-2 mt-4">
          <Link href="/" className="p-2 bg-slate-900/80 rounded-full border border-slate-700 hover:border-purple-500 transition-all"><ArrowLeft className="w-5 h-5"/></Link>
          <h1 className="text-2xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 tracking-tighter">SOLITARIO</h1>
          <div className="flex gap-2">
             <div className="bg-slate-900 px-3 py-1 rounded border border-slate-700 text-xs font-bold text-yellow-400">PTS: {score}</div>
             <button onClick={startNewGame} className="p-2 bg-slate-900 rounded border border-slate-700 hover:text-purple-400"><RotateCw className="w-4 h-4"/></button>
          </div>
      </div>

      {/* ÁREA DE JUEGO CON SCROLL HORIZONTAL */}
      <div className="w-full flex-grow flex flex-col items-center relative overflow-hidden">
          {/* Contenedor con scroll */}
          <div className="w-full overflow-x-auto overflow-y-hidden pb-4 px-4 custom-scrollbar">
              <div className="min-w-[600px] max-w-4xl mx-auto flex flex-col gap-6">
                  
                  {/* FILA SUPERIOR (Mazo y Fundaciones) */}
                  <div className="flex justify-between items-start">
                      <div className="flex gap-4">
                          {/* MAZO */}
                          <div onClick={handleStockClick} className="cursor-pointer">
                              {deck.length > 0 ? (
                                  <Card card={{ faceUp: false }} />
                              ) : (
                                  <div className="w-16 h-24 sm:w-20 sm:h-28 border-2 border-white/10 rounded-lg flex items-center justify-center"><RotateCw className="w-6 h-6 text-white/20"/></div>
                              )}
                          </div>
                          {/* DESCARTE */}
                          <div>
                              {waste.length > 0 ? (
                                  <Card card={waste[waste.length - 1]} onClick={() => handleCardClick('waste')} isSelected={selectedCard?.type === 'waste'} />
                              ) : <div className="w-16 h-24 sm:w-20 sm:h-28"></div>}
                          </div>
                      </div>

                      {/* FUNDACIONES */}
                      <div className="flex gap-2 sm:gap-4">
                          {foundations.map((pile, idx) => (
                              <div key={idx} onClick={() => handleCardClick('foundation', idx)}>
                                  {pile.length > 0 ? (
                                      <Card card={pile[pile.length - 1]} />
                                  ) : (
                                      <div className="w-16 h-24 sm:w-20 sm:h-28 border-2 border-dashed border-white/20 rounded-lg flex items-center justify-center text-white/20 text-2xl font-bold">
                                          {idx === 0 ? '♠' : idx === 1 ? '♥' : idx === 2 ? '♣' : '♦'}
                                      </div>
                                  )}
                              </div>
                          ))}
                      </div>
                  </div>

                  {/* TABLEAU (7 Columnas) */}
                  <div className="grid grid-cols-7 gap-2 sm:gap-4 items-start min-h-[400px]">
                      {tableau.map((col, colIdx) => (
                          <div key={colIdx} className="relative flex flex-col items-center" onClick={() => col.length === 0 && handleCardClick('tableau', colIdx, 0)}>
                              {col.length === 0 ? (
                                  <div className="w-16 h-24 sm:w-20 sm:h-28 border border-white/5 rounded-lg"></div>
                              ) : (
                                  col.map((card, cardIdx) => (
                                      <div key={card.id} className="absolute" style={{ top: `${cardIdx * 30}px` }}>
                                          <Card 
                                              card={card} 
                                              onClick={(e: any) => {
                                                  e.stopPropagation();
                                                  handleCardClick('tableau', colIdx, cardIdx);
                                              }}
                                              isSelected={selectedCard?.type === 'tableau' && selectedCard.colIdx === colIdx && selectedCard.cardIdx === cardIdx}
                                          />
                                      </div>
                                  ))
                              )}
                          </div>
                      ))}
                  </div>

              </div>
          </div>
      </div>

      {/* PANTALLA DE VICTORIA */}
      {win && (
          <div className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center animate-in zoom-in p-4 backdrop-blur-sm">
              <Crown className="w-32 h-32 text-yellow-400 animate-bounce mb-6"/>
              <h2 className="text-5xl font-black text-white italic tracking-tighter mb-4">¡COMPLETADO!</h2>
              <p className="text-purple-300 font-bold text-lg mb-8">+75 Monedas</p>
              <button onClick={startNewGame} className="px-10 py-4 bg-white text-black font-black rounded-full hover:scale-105 transition-all shadow-xl flex items-center gap-2">
                  <RotateCw className="w-5 h-5"/> JUGAR OTRA
              </button>
          </div>
      )}

      <div className="mt-auto opacity-50 w-full max-w-md"><AdSpace type="banner" /></div>
    </div>
  );
}