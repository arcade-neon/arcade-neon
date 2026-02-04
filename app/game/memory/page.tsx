// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Trophy, Users, Brain, Play, Zap, Eye, Lock, Video, 
  Atom, Anchor, Aperture, Award, Biohazard, Blocks, Bug, 
  Camera, CloudLightning, Component, Crown, Diamond, Flame, 
  Gem, Ghost, Hexagon, Joystick, Key, Layers, Rocket
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, onSnapshot, getDoc, serverTimestamp, query, orderBy, limit, getDocs, setDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- CONFIGURACIÓN VISUAL PREMIUM ---

const ICON_LIST = [
  <Atom key="1" />, <Zap key="2" />, <Diamond key="3" />, <Flame key="4" />, <Rocket key="5" />, <Crown key="6" />, 
  <Gem key="7" />, <Biohazard key="8" />, <Joystick key="9" />, <Hexagon key="10" />, <Anchor key="11" />, <Aperture key="12" />,
  <Award key="13" />, <Blocks key="14" />, <Bug key="15" />, <Camera key="16" />, <CloudLightning key="17" />, <Component key="18" />,
  <Ghost key="19" />, <Key key="20" />, <Layers key="21" />
];

const COLOR_PALETTES = [
    { color: 'text-pink-400', shadow: '#ec4899' },    
    { color: 'text-cyan-400', shadow: '#22d3ee' },    
    { color: 'text-yellow-400', shadow: '#eab308' },  
    { color: 'text-emerald-400', shadow: '#34d399' }, 
    { color: 'text-rose-400', shadow: '#fb7185' },    
    { color: 'text-violet-400', shadow: '#a78bfa' },  
];

const DIFFICULTIES = {
  easy: { name: 'FÁCIL', pairs: 6, cols: 3, bonus: 100 },    
  medium: { name: 'NORMAL', pairs: 8, cols: 4, bonus: 200 }, 
  hard: { name: 'DIFÍCIL', pairs: 12, cols: 4, bonus: 300 }  
};

export default function NeonMemory() {
  const [view, setView] = useState('menu');
  const [user, setUser] = useState(null);
  
  // JUEGO
  const [cards, setCards] = useState([]); 
  const [flipped, setFlipped] = useState([]); 
  const [matched, setMatched] = useState([]); 
  const [lives, setLives] = useState(5);
  const [score, setScore] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentDiff, setCurrentDiff] = useState('medium');

  // ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [opName, setOpName] = useState('Rival');
  const [opProgress, setOpProgress] = useState(0);
  const [opStatus, setOpStatus] = useState('playing');
  const [isHost, setIsHost] = useState(false);

  // MONETIZACIÓN & DATA
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
        const unsubscribe = onSnapshot(doc(db, "matches_memory", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (isHost) {
                    setOpName(data.guestName || 'Esperando...');
                    setOpProgress(data.guestProgress || 0);
                    setOpStatus(data.guestStatus || 'playing');
                } else {
                    setOpName(data.hostName || 'Host');
                    setOpProgress(data.hostProgress || 0);
                    setOpStatus(data.hostStatus || 'playing');
                    if (cards.length === 0 && data.boardLayout) {
                        setCards(JSON.parse(data.boardLayout));
                        setCurrentDiff(data.difficulty || 'medium');
                        setLives(5);
                    }
                }
                if (data.winner) {
                    setGameWon(data.winner === user?.uid);
                    setGameOver(data.winner !== user?.uid);
                }
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode]);

  // --- LOGICA JUEGO ---
  const startGame = (mode, diff = 'medium', onlineLayout = null) => {
      let layout = onlineLayout;
      const config = DIFFICULTIES[diff];

      if (!layout) {
          const numPairs = config.pairs;
          const availableIconsIndices = [...Array(ICON_LIST.length).keys()].sort(() => 0.5 - Math.random());
          const selectionIndices = availableIconsIndices.slice(0, numPairs);
          
          const deck = [...selectionIndices, ...selectionIndices];
          layout = deck.sort(() => Math.random() - 0.5).map((iconIndex, id) => ({ id, iconIndex }));
      }
      
      setCards(layout);
      setCurrentDiff(diff);
      setFlipped([]);
      setMatched([]);
      setLives(5);
      setScore(0);
      setGameWon(false);
      setGameOver(false);
      setView(mode);
      
      return layout;
  };

  const handleCardClick = (index) => {
      if (gameOver || gameWon || isProcessing || flipped.length >= 2 || matched.includes(index) || flipped.includes(index)) return;

      const newFlipped = [...flipped, index];
      setFlipped(newFlipped);

      if (newFlipped.length === 2) {
          setIsProcessing(true);
          checkForMatch(newFlipped);
      }
  };

  const checkForMatch = (currentFlipped) => {
      const [idx1, idx2] = currentFlipped;
      const match = cards[idx1].iconIndex === cards[idx2].iconIndex;

      if (match) {
          const newMatched = [...matched, idx1, idx2];
          setMatched(newMatched);
          setFlipped([]);
          setIsProcessing(false);
          setScore(s => s + DIFFICULTIES[currentDiff].bonus);
          
          if (view.includes('pvp')) updateOnlineProgress(newMatched.length);
          if (newMatched.length === cards.length) handleWin();

      } else {
          setTimeout(() => {
              setFlipped([]);
              setIsProcessing(false);
              if (view === 'pve') {
                  setLives(l => {
                      const newLives = l - 1;
                      if (newLives <= 0) setGameOver(true);
                      return newLives;
                  });
              }
          }, 800);
      }
  };

  const handleWin = async () => {
      setGameWon(true);
      if (view === 'pve') saveScore(score + (lives * 500));
      if (view.includes('pvp')) await updateDoc(doc(db, "matches_memory", roomCode), { winner: user.uid });
  };

  const updateOnlineProgress = async (matchedCount) => {
      const progress = Math.floor((matchedCount / cards.length) * 100);
      const field = isHost ? 'hostProgress' : 'guestProgress';
      if (roomCode) await updateDoc(doc(db, "matches_memory", roomCode), { [field]: progress });
  };

  // --- ONLINE SETUP ---
  const createRoom = async (diff) => {
      const layout = startGame('pve', diff); 
      
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_memory", code), {
          host: user?.uid, hostName: user?.name, hostProgress: 0,
          guestProgress: 0, boardLayout: JSON.stringify(layout),
          difficulty: diff,
          createdAt: serverTimestamp()
      });
      setRoomCode(code); setIsHost(true); setView('pvp_host');
  };

  const joinRoom = async (c) => {
      const ref = doc(db, "matches_memory", c);
      const s = await getDoc(ref);
      if (!s.exists()) return alert("Sala no encontrada");
      await updateDoc(ref, { guest: user?.uid, guestName: user?.name });
      setRoomCode(c); setIsHost(false); setView('pvp_guest');
  };

  // --- ADS ---
  const watchAd = (type) => { setAdState({ active: true, type, timer: 5 }); };
  useEffect(() => {
    let interval = null;
    if (adState.active && adState.timer > 0) interval = setInterval(() => setAdState(p => ({ ...p, timer: p.timer - 1 })), 1000);
    else if (adState.active && adState.timer === 0) { clearInterval(interval); finishAd(); }
    return () => clearInterval(interval);
  }, [adState.active]);

  const finishAd = () => {
      setAdState(p => ({ ...p, active: false }));
      if (adState.type === 'life') {
          setLives(p => p + 2);
          setGameOver(false);
      } else if (adState.type === 'hint') {
          const allIndices = cards.map((_, i) => i);
          const prevFlipped = flipped;
          setFlipped(allIndices);
          setIsProcessing(true);
          setTimeout(() => {
              setFlipped(prevFlipped);
              setIsProcessing(false);
          }, 1500);
      }
  };

  const saveScore = async (s) => {
      if(user) { await addDoc(collection(db, "scores_memory"), { uid:user.uid, displayName:user.name, score:s, date:serverTimestamp() }); fetchLeaderboard(); }
  };
  const fetchLeaderboard = async () => {
      const q = query(collection(db, "scores_memory"), orderBy("score", "desc"), limit(5));
      const s = await getDocs(q); setLeaderboard(s.docs.map(d=>d.data()));
  };

  const renderStyledIcon = (iconIndex, isMatched) => {
      const iconBase = ICON_LIST[iconIndex];
      const palette = COLOR_PALETTES[iconIndex % COLOR_PALETTES.length];
      return React.cloneElement(iconBase, {
          className: `w-14 h-14 ${palette.color} drop-shadow-[0_0_15px_${palette.shadow}] filter transition-all duration-500 ${isMatched ? 'scale-110 animate-pulse' : 'scale-100 animate-in zoom-in'}`
      });
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-4 font-mono text-white select-none">
      {adState.active && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-6">
           <Video className="w-16 h-16 text-pink-500 mb-4 animate-bounce" />
           <h2 className="text-2xl font-black mb-2">PUBLICIDAD</h2>
           <div className="text-4xl font-black text-white mb-6">{adState.timer}s</div>
        </div>
      )}

      {/* HEADER CORREGIDO */}
      <div className="w-full max-w-md flex justify-between items-center mb-6 z-10">
        <button 
            onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} 
            className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:bg-slate-800"
        >
            <ArrowLeft className="w-5 h-5 text-slate-400"/>
        </button>
        {view !== 'menu' && (
           <div className="flex gap-4 bg-slate-900 px-4 py-2 rounded-full border border-slate-700 items-center">
               {view === 'pve' && (
                   <div className="flex gap-1 text-pink-500 font-bold items-center border-r border-slate-700 pr-4 mr-2">
                       <Brain className="w-4 h-4"/> {lives}
                   </div>
               )}
               <div className="text-cyan-400 font-bold flex flex-col items-center leading-none">
                   <span className="text-[10px] text-slate-500">PUNTOS</span>
                   {score}
               </div>
           </div>
        )}
      </div>

      <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500 mb-6 italic tracking-tighter">NEON MEMORY</h1>

      {view === 'menu' ? (
          <div className="w-full max-w-md grid gap-4 animate-in zoom-in">
              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-2 mb-4">
                      <Brain className="w-6 h-6 text-pink-500"/>
                      <h2 className="text-xl font-black text-white">SOLO (IA)</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                      {Object.entries(DIFFICULTIES).map(([key, cfg]) => (
                          <button key={key} onClick={() => startGame('pve', key)} className="py-2 bg-slate-800 rounded-lg text-[10px] font-bold border border-slate-700 hover:bg-pink-900/20 hover:border-pink-500/50 transition">
                              {cfg.name}
                          </button>
                      ))}
                  </div>
              </div>

              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-purple-500"/> DUELO ONLINE</h2>
                  <div className="flex gap-2">
                      <button onClick={() => createRoom('medium')} className="flex-1 py-3 bg-purple-600 rounded-xl font-bold text-xs hover:bg-purple-500">CREAR</button>
                      <input id="code" placeholder="CÓDIGO" className="w-24 bg-black border border-slate-700 rounded-xl text-center font-bold"/>
                      <button onClick={() => joinRoom(document.getElementById('code').value)} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs border border-slate-700">UNIRSE</button>
                  </div>
              </div>

              {leaderboard.length > 0 && (
                <div className="bg-black/20 p-4 rounded-xl border border-white/5 mt-4">
                    <h3 className="text-[10px] text-slate-500 uppercase font-bold mb-2">TOP MEMORIA</h3>
                    {leaderboard.map((s,i) => (<div key={i} className="flex justify-between text-[10px] text-slate-400 border-b border-white/5 py-1"><span>#{i+1} {s.displayName}</span><span className="text-pink-500">{s.score}</span></div>))}
                </div>
               )}
          </div>
      ) : (
          <div className="w-full max-w-md flex flex-col items-center flex-grow">
              
              {view.includes('pvp') && (
                  <div className="w-full mb-4 flex justify-between items-center px-4 bg-slate-900/50 py-2 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400 font-mono">SALA: <span className="text-white font-bold">{roomCode}</span></span>
                      <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-bold uppercase">VS {opName}</span>
                          <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                              <div className="h-full bg-purple-500 transition-all duration-500" style={{width: `${opProgress}%`}}></div>
                          </div>
                      </div>
                  </div>
              )}

              <div 
                className="grid gap-3 w-full" 
                style={{ 
                    gridTemplateColumns: `repeat(${DIFFICULTIES[currentDiff].cols}, 1fr)` 
                }}
              >
                  {cards.map((card, i) => {
                      const isFlipped = flipped.includes(i) || matched.includes(i);
                      const isMatched = matched.includes(i);
                      return (
                          <button 
                            key={i} 
                            onClick={() => handleCardClick(i)} 
                            className={`
                                relative aspect-square rounded-2xl border-2 transition-all duration-500 transform style-preserve-3d shadow-lg
                                ${isFlipped ? 'rotate-y-180' : ''}
                                ${isMatched ? 'border-cyan-500/50 bg-cyan-900/20 shadow-[0_0_20px_rgba(34,211,238,0.2)]' : isFlipped ? 'border-pink-500/80 bg-slate-800 shadow-[0_0_25px_rgba(236,72,153,0.3)]' : 'bg-slate-900 border-slate-700 hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.2)]'}
                            `}
                          >
                              <div className="absolute inset-0 flex items-center justify-center p-2">
                                  {isFlipped ? (
                                      renderStyledIcon(card.iconIndex, isMatched)
                                  ) : (
                                      <Lock className="w-6 h-6 text-slate-800 opacity-50"/>
                                  )}
                              </div>
                          </button>
                      );
                  })}
              </div>

              <div className="flex gap-2 w-full mt-8">
                  {view === 'pve' && !gameOver && (
                      <button onClick={() => watchAd('hint')} className="flex-1 py-4 bg-slate-800/80 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 text-yellow-400 hover:bg-slate-700 transition shadow-lg backdrop-blur-sm"><Eye className="w-5 h-5"/> PISTA (VIDEO)</button>
                  )}
              </div>

              {(gameWon || gameOver) && (
                  <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 animate-in zoom-in backdrop-blur-md p-6">
                      {gameWon ? <Trophy className="w-24 h-24 text-yellow-400 mb-4 animate-bounce drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]"/> : <Brain className="w-24 h-24 text-slate-700 mb-4 drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]"/>}
                      <h2 className="text-4xl font-black text-white mb-2 italic tracking-tighter">{gameWon ? '¡MEMORIA ÉPICA!' : 'CEREBRO FRITO'}</h2>
                      <p className="text-slate-400 mb-8 font-bold tracking-widest">PUNTUACIÓN: {score}</p>
                      
                      {gameOver && view === 'pve' && (
                          <button onClick={() => watchAd('life')} className="w-full max-w-sm py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-black mb-3 flex items-center justify-center gap-3 hover:scale-105 transition shadow-[0_0_25px_rgba(34,197,94,0.4)] text-white"><Play className="w-6 h-6 fill-current"/> RECUPERAR VIDAS (VIDEO)</button>
                      )}
                      <button onClick={() => setView('menu')} className="w-full max-w-sm py-4 bg-slate-800 rounded-xl font-bold border-2 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition">VOLVER AL MENÚ</button>
                  </div>
              )}
          </div>
      )}
      <div className="mt-auto w-full max-w-md pt-4 opacity-75"><AdSpace type="banner" /><GameChat gameId="global_memory" gameName="MEMORY" /></div>
    </div>
  );
}