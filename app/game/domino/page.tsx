// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Users, Cpu, Plus, Video, LayoutList } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, getDoc, serverTimestamp, query, orderBy, limit, getDocs, setDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- LÓGICA DOMINÓ ---
const generateDeck = () => {
  const deck = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      deck.push([i, j]);
    }
  }
  return deck.sort(() => Math.random() - 0.5);
};

export default function AaronMourinhoDomino() {
  const [view, setView] = useState('menu');
  const [user, setUser] = useState(null);
  
  // ESTADO JUEGO
  const [deck, setDeck] = useState([]);
  const [myHand, setMyHand] = useState([]);
  const [opHandCount, setOpHandCount] = useState(7);
  const [board, setBoard] = useState([]); 
  const [turn, setTurn] = useState('player'); 
  const [ends, setEnds] = useState({ left: null, right: null });
  const [winner, setWinner] = useState(null); 
  const [log, setLog] = useState("¡Arranca la partida!");
  const [passCount, setPassCount] = useState(0); 

  // ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [opName, setOpName] = useState('Mourinho Bot');
  const [isHost, setIsHost] = useState(false);

  // MONETIZACIÓN & RANKING
  const [adState, setAdState] = useState({ active: false, type: null, timer: 5 });
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
    fetchLeaderboard();
  }, []);

  // --- SYNC ONLINE ---
  useEffect(() => {
    if (view.includes('pvp') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_domino", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const imHost = isHost;
                
                if (imHost) setOpName(data.guestName || 'Esperando...');
                else setOpName(data.hostName || 'Host');

                if (data.board) {
                    const parsedBoard = JSON.parse(data.board);
                    setBoard(parsedBoard);
                    
                    if (parsedBoard.length > 0) {
                        setEnds({
                            left: parsedBoard[0].vals[0],
                            right: parsedBoard[parsedBoard.length - 1].vals[1]
                        });
                    }
                }
                
                setTurn(data.turn);
                if (imHost) setOpHandCount(data.guestHandCount || 7);
                else setOpHandCount(data.hostHandCount || 7);

                if (data.winner) setWinner(data.winner);
                if (data.lastLog) setLog(data.lastLog);
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode]);

  // --- GAMEPLAY ---
  const startGame = (mode) => {
      const newDeck = generateDeck();
      const p1Hand = newDeck.splice(0, 7);
      const p2HandCount = 7; 
      newDeck.splice(0, 7); 

      setDeck(newDeck);
      setMyHand(p1Hand);
      setOpHandCount(p2HandCount);
      setBoard([]);
      setEnds({ left: null, right: null });
      setWinner(null);
      setTurn('player');
      setPassCount(0);
      setLog("Tú sales primero.");
      setView(mode);
  };

  const playTile = async (tileIndex, side) => {
      if (turn !== 'player' || winner) return;

      const tile = myHand[tileIndex];
      const newBoard = [...board];
      let placedTile = null;

      if (newBoard.length === 0) {
          placedTile = { vals: tile, id: Date.now() };
          newBoard.push(placedTile);
          setEnds({ left: tile[0], right: tile[1] });
      } else {
          if (side === 'left') {
              if (tile[1] === ends.left) placedTile = { vals: tile, id: Date.now() };
              else if (tile[0] === ends.left) placedTile = { vals: [tile[1], tile[0]], id: Date.now() }; 
              if (placedTile) newBoard.unshift(placedTile);
          } else {
              if (tile[0] === ends.right) placedTile = { vals: tile, id: Date.now() };
              else if (tile[1] === ends.right) placedTile = { vals: [tile[1], tile[0]], id: Date.now() }; 
              if (placedTile) newBoard.push(placedTile);
          }
      }

      if (!placedTile) return;

      const newHand = myHand.filter((_, i) => i !== tileIndex);
      setMyHand(newHand);
      setBoard(newBoard);
      
      const newLeft = newBoard[0].vals[0];
      const newRight = newBoard[newBoard.length - 1].vals[1];
      setEnds({ left: newLeft, right: newRight });
      setPassCount(0);

      if (newHand.length === 0) {
          finishGame('player');
          return;
      }

      const nextTurn = 'opponent';
      setTurn(nextTurn);
      setLog(`Jugaste [${tile[0]}|${tile[1]}]`);

      if (view.includes('pvp')) {
          await updateOnline(newBoard, nextTurn, newHand.length, null, `Rival jugó [${tile[0]}|${tile[1]}]`);
      } else {
          setTimeout(() => aiTurn(newBoard, { left: newLeft, right: newRight }, deck.length), 1000);
      }
  };

  const drawTile = () => {
      if (deck.length === 0 || turn !== 'player') return;
      const newDeck = [...deck];
      const tile = newDeck.pop();
      setDeck(newDeck);
      setMyHand([...myHand, tile]);
      setLog("Has robado una ficha.");
  };

  const passTurn = async () => {
      if (turn !== 'player') return;
      if (deck.length > 0) { setLog("¡Quedan fichas! Roba primero."); return; }

      const nextTurn = 'opponent';
      setTurn(nextTurn);
      setLog("Has pasado turno.");
      
      const newPassCount = passCount + 1;
      setPassCount(newPassCount);

      if (newPassCount >= 2) {
          checkBlockedGame();
      } else {
          if (view.includes('pvp')) {
              await updateOnline(board, nextTurn, myHand.length, null, "Rival pasó turno");
          } else {
              setTimeout(() => aiTurn(board, ends, 0), 1000);
          }
      }
  };

  const aiTurn = (currentBoard, currentEnds, deckCount) => {
      if (Math.random() > 0.2 || deckCount === 0) {
          const newBoard = [...currentBoard];
          
          if (currentBoard.length === 0) {
             newBoard.push({ vals: [6,6], id: Date.now() }); 
          } else {
             newBoard.push({ vals: [currentEnds.right, Math.floor(Math.random()*7)], id: Date.now() });
          }

          setBoard(newBoard);
          setEnds({ left: newBoard[0].vals[0], right: newBoard[newBoard.length-1].vals[1] });
          setOpHandCount(c => c - 1);
          setPassCount(0);

          if (opHandCount - 1 <= 0) {
              finishGame('opponent');
          } else {
              setTurn('player');
              setLog("Mourinho ha jugado.");
          }
      } else {
          setLog("Mourinho roba/pasa.");
          setTurn('player');
          setPassCount(p => p + 1);
          if (passCount + 1 >= 2) checkBlockedGame();
      }
  };
  
  const checkBlockedGame = () => {
      if (myHand.length < opHandCount) finishGame('player');
      else if (myHand.length > opHandCount) finishGame('opponent');
      else finishGame('draw');
  };

  const finishGame = async (winnerId) => {
      setWinner(winnerId);
      if (winnerId === 'player' && user) saveScore(100);
      if (view.includes('pvp') && winnerId === user?.uid) {
          await updateDoc(doc(db, "matches_domino", roomCode), { winner: user.uid });
      }
  };

  const updateOnline = async (b, t, handC, w, l) => {
      const data = { board: JSON.stringify(b), turn: t, lastLog: l };
      if (isHost) data.hostHandCount = handC; else data.guestHandCount = handC;
      if (w) data.winner = w;
      await updateDoc(doc(db, "matches_domino", roomCode), data);
  };

  const createRoom = async () => {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_domino", code), {
          host: user?.uid, hostName: user?.name, hostHandCount: 7, guestHandCount: 7,
          board: "[]", turn: 'player', createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); setView('pvp_host');
      setMyHand(generateDeck().slice(0,7)); 
  };

  const joinRoom = async (c) => {
      const ref = doc(db, "matches_domino", c);
      await updateDoc(ref, { guest: user?.uid, guestName: user?.name });
      setRoomCode(c); setIsHost(false); setView('pvp_guest');
      setMyHand(generateDeck().slice(0,7)); 
  };

  const watchAd = () => { setAdState({ active: true, timer: 5 }); };
  useEffect(() => {
    let i;
    if (adState.active && adState.timer > 0) i = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active) { clearInterval(i); setAdState({active:false, timer:5}); drawTile(); } 
    return () => clearInterval(i);
  }, [adState.active]);

  const saveScore = async (s) => { if(user) await addDoc(collection(db, "scores_domino"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); fetchLeaderboard(); };
  const fetchLeaderboard = async () => { 
      const q = query(collection(db, "scores_domino"), orderBy("score", "desc"), limit(5));
      const s = await getDocs(q); setLeaderboard(s.docs.map(d=>d.data()));
  };

  const renderTile = (vals, size = 'normal', onClick = null) => {
      const pips = (n) => {
          const pos = {
              1: ['center'], 2: ['tl','br'], 3: ['tl','center','br'], 4: ['tl','tr','bl','br'], 
              5: ['tl','tr','center','bl','br'], 6: ['tl','tr','l','r','bl','br'], 0: []
          };
          return pos[n]?.map((p, i) => (
              <div key={i} className={`w-1.5 h-1.5 bg-black rounded-full absolute ${
                  p==='center'?'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2':
                  p==='tl'?'top-1 left-1': p==='tr'?'top-1 right-1':
                  p==='bl'?'bottom-1 left-1': p==='br'?'bottom-1 right-1':
                  p==='l'?'top-1/2 left-1 -translate-y-1/2': 'top-1/2 right-1 -translate-y-1/2'
              }`}/>
          ));
      };

      const w = size === 'small' ? 'w-8 h-16' : 'w-10 h-20';
      
      return (
          <div onClick={onClick} className={`${w} bg-white rounded-lg flex flex-col justify-between border-2 border-slate-300 shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-transform hover:scale-105 cursor-pointer relative overflow-hidden`}>
              <div className="flex-1 relative border-b border-slate-300">{pips(vals[0])}</div>
              <div className="flex-1 relative">{pips(vals[1])}</div>
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-2 font-mono text-white select-none overflow-hidden">
      {adState.active && <div className="fixed inset-0 bg-black z-50 flex items-center justify-center"><h2 className="text-2xl animate-bounce">PUBLICIDAD {adState.timer}s</h2></div>}

      {/* HEADER */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-4 mt-2 px-4">
        <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 bg-slate-900 rounded-full border border-slate-700"><ArrowLeft className="w-5 h-5"/></button>
        <div className="text-center">
            <h1 className="text-xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500 tracking-tighter">AARON MOURINHO</h1>
            <p className="text-[10px] text-slate-500 tracking-[0.5em]">DOMINO LEAGUE</p>
        </div>
        {view !== 'menu' && <div className="text-xs font-bold bg-slate-900 px-3 py-1 rounded-full border border-slate-800 text-orange-400">{deck.length} POZO</div>}
      </div>

      {view === 'menu' ? (
          <div className="w-full max-w-md grid gap-4 animate-in zoom-in mt-8">
              <button onClick={() => startGame('pve')} className="bg-slate-900 p-8 rounded-3xl border border-slate-800 flex flex-col items-center gap-4 hover:border-orange-500/50 transition group relative overflow-hidden">
                  <div className="absolute inset-0 bg-orange-500/5 group-hover:bg-orange-500/10 transition"></div>
                  <LayoutList className="w-12 h-12 text-orange-500 group-hover:scale-110 transition"/>
                  <div className="text-center"><h2 className="text-2xl font-black text-white">VS MOURINHO (IA)</h2><p className="text-xs text-slate-400">El Special One te espera.</p></div>
              </button>

              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-red-500"/> ONLINE</h2>
                  <div className="flex gap-2">
                      <button onClick={createRoom} className="flex-1 py-3 bg-red-600 rounded-xl font-bold text-xs hover:bg-red-500">CREAR</button>
                      <input id="code" placeholder="CÓDIGO" className="w-24 bg-black border border-slate-700 rounded-xl text-center font-bold"/>
                      <button onClick={() => joinRoom(document.getElementById('code').value)} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs border border-slate-700">UNIRSE</button>
                  </div>
              </div>
              
              {leaderboard.length > 0 && (
                <div className="bg-black/20 p-4 rounded-xl border border-white/5 mt-4">
                    <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2">TOP JUGADORES</h3>
                    {leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-[10px] text-slate-400 border-b border-white/5 py-1"><span>#{i+1} {s.displayName}</span><span className="text-orange-500">{s.score}</span></div>))}
                </div>
               )}
          </div>
      ) : (
          <div className="w-full max-w-4xl flex flex-col items-center flex-grow h-full justify-between pb-4">
              
              {/* RIVAL */}
              <div className="w-full flex justify-center py-4 relative">
                  <div className="flex gap-1">
                      {[...Array(Math.min(7, opHandCount))].map((_, i) => (
                          <div key={i} className="w-6 h-10 bg-slate-800 rounded border border-slate-700"></div>
                      ))}
                  </div>
                  <div className="absolute right-4 top-4 text-xs font-bold text-slate-500">{opName} {turn === 'opponent' && <span className="text-orange-500 animate-pulse">●</span>}</div>
              </div>

              {/* TABLERO (SCROLLABLE) */}
              <div className="w-full flex-grow bg-slate-900/50 rounded-2xl border border-slate-800 mb-4 overflow-x-auto flex items-center px-8 shadow-inner custom-scrollbar relative">
                  {board.length === 0 && <div className="w-full text-center text-slate-600 font-bold text-4xl opacity-20">AARON MOURINHO</div>}
                  <div className="flex items-center gap-1 mx-auto">
                      {board.map((tile, i) => (
                          <div key={tile.id} className={`flex ${tile.vals[0]===tile.vals[1] ? '-mt-4' : ''}`}>
                              {renderTile(tile.vals, 'small')}
                          </div>
                      ))}
                  </div>
              </div>

              {/* LOG & ACCIONES */}
              <div className="w-full flex justify-between items-center px-4 mb-2">
                  <div className="text-xs text-orange-400 font-mono animate-pulse">&gt; {log}</div>
                  <div className="flex gap-2">
                      <button onClick={drawTile} disabled={deck.length===0} className="p-2 bg-slate-800 rounded-full border border-slate-700 disabled:opacity-30"><Plus className="w-4 h-4"/></button>
                      <button onClick={passTurn} className="px-3 py-1 bg-slate-800 rounded-lg text-[10px] font-bold border border-slate-700 hover:bg-red-900/50">PASAR</button>
                  </div>
              </div>

              {/* MI MANO */}
              <div className="w-full bg-slate-950 p-4 rounded-t-3xl border-t border-slate-800 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                  <div className="flex justify-center gap-2 flex-wrap">
                      {myHand.map((tile, i) => {
                          const canPlayLeft = ends.left === null || tile[0] === ends.left || tile[1] === ends.left;
                          const canPlayRight = ends.right === null || tile[0] === ends.right || tile[1] === ends.right;
                          const playable = (canPlayLeft || canPlayRight) && turn === 'player';

                          return (
                              <div key={i} className={`relative group ${!playable ? 'opacity-50 grayscale' : ''}`}>
                                  {renderTile(tile)}
                                  {playable && (
                                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700 z-10">
                                          {canPlayLeft && <button onClick={(e)=>{e.stopPropagation(); playTile(i, 'left')}} className="p-1 hover:bg-orange-500 rounded"><ArrowLeft className="w-3 h-3"/></button>}
                                          {canPlayRight && <button onClick={(e)=>{e.stopPropagation(); playTile(i, 'right')}} className="p-1 hover:bg-orange-500 rounded"><ArrowLeft className="w-3 h-3 rotate-180"/></button>}
                                      </div>
                                  )}
                              </div>
                          );
                      })}
                  </div>
              </div>

              {/* WINNER OVERLAY */}
              {winner && (
                  <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50 animate-in zoom-in">
                      <Trophy className="w-24 h-24 text-orange-500 mb-6 animate-bounce"/>
                      <h2 className="text-4xl font-black text-white mb-2">{winner === 'player' ? '¡GANASTE!' : winner === 'draw' ? 'TRANCA (EMPATE)' : 'MOURINHO GANA'}</h2>
                      <button onClick={() => setView('menu')} className="px-8 py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition mt-4">VOLVER AL MENÚ</button>
                  </div>
              )}
          </div>
      )}
      <div className="mt-auto w-full max-w-md pt-2 opacity-50"><AdSpace type="banner" /><GameChat gameId="global_domino" gameName="DOMINO" /></div>
    </div>
  );
}