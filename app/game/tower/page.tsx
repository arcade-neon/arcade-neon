// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, Play, RotateCcw, Trophy, Hammer, Heart, 
  Share2, MessageCircle, Home, CheckCircle, Users, Bot, Video, 
  ShoppingBag, Coins, Lock, Loader2, X, AlertCircle, Gem, Crown, Zap, Star
} from 'lucide-react';
import { useAudio } from '@/contexts/AudioContext'; 
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace'; 

// --- CONFIGURACIÓN FÍSICA ---
const CONFIG = {
    BASE_BLOCK_WIDTH: 110, 
    BASE_BLOCK_HEIGHT: 85,
    GRAVITY: 12,
    SWING_SPEED_BASE: 0.04, 
    ROPE_HEIGHT: 180, 
    PERFECT_TOLERANCE: 12, 
    CAMERA_SPEED: 0.15
};

// --- TIENDA PREMIUM ---
const SHOP_ITEMS = [
    { id: 'default', name: 'Hormigón', price: 0, type: 'skin', rarity: 'common', gradient: 'from-slate-400 to-slate-600' },
    { id: 'eco', name: 'Eco Madera', price: 250, type: 'skin', rarity: 'common', gradient: 'from-amber-700 to-amber-900' },
    { id: 'gold', name: 'Lingote Oro', price: 1000, type: 'skin', rarity: 'rare', gradient: 'from-yellow-300 via-yellow-500 to-yellow-700' },
    { id: 'ruby', name: 'Rubí Sangre', price: 1500, type: 'skin', rarity: 'rare', gradient: 'from-red-400 to-red-900' },
    { id: 'toxic', name: 'Residuo Bio', price: 2000, type: 'skin', rarity: 'rare', gradient: 'from-lime-400 to-lime-900' },
    { id: 'cyber', name: 'Cyberpunk', price: 3500, type: 'skin', rarity: 'legendary', gradient: 'from-pink-500 via-purple-500 to-indigo-500' },
    { id: 'diamond', name: 'Diamante Puro', price: 5000, type: 'skin', rarity: 'legendary', gradient: 'from-cyan-300 via-blue-400 to-blue-800' },
    { id: 'obsidian', name: 'Obsidiana', price: 7000, type: 'skin', rarity: 'legendary', gradient: 'from-gray-900 via-slate-800 to-black' },
    { id: 'magma', name: 'Núcleo Magma', price: 10000, type: 'skin', rarity: 'legendary', gradient: 'from-orange-500 via-red-600 to-red-900' },
];

// --- COMPONENTE VIDEO AD (RECUPERADO) ---
const VideoAdOverlay = ({ onComplete, onCancel }) => {
    const [timer, setTimer] = useState(5);
    useEffect(() => {
        if(timer > 0) { const i = setInterval(() => setTimer(t => t - 1), 1000); return () => clearInterval(i); } 
        else { const t = setTimeout(onComplete, 500); return () => clearTimeout(t); }
    }, [timer, onComplete]);
    return (
        <div className="fixed inset-0 z-[100000] bg-black/95 flex flex-col items-center justify-center p-4 text-center backdrop-blur-xl animate-in fade-in">
            <Video className="w-16 h-16 text-emerald-500 mb-4 animate-pulse"/>
            <h3 className="text-xl font-black text-white mb-2 uppercase">Recargando Vidas</h3>
            <p className="text-slate-400 text-xs mb-6">El juego continuará en breve...</p>
            <div className="text-4xl font-mono font-black text-emerald-400 mb-4">{timer}s</div>
            <button onClick={onCancel} className="text-slate-500 text-xs underline mt-4 hover:text-white">Cancelar</button>
        </div>
    );
};

function GameContent() {
  const searchParams = useSearchParams();
  const [gameState, setGameState] = useState<'MENU' | 'MODE_SELECT' | 'PLAYING' | 'GAMEOVER' | 'MULTIPLAYER_LOBBY'>('MENU');
  const [gameMode, setGameMode] = useState<'SOLO' | 'VS_AI' | 'VS_FRIEND'>('SOLO');
  
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [extraLivesUsed, setExtraLivesUsed] = useState(0); // CONTADOR DE VIDAS EXTRA
  const [aiScore, setAiScore] = useState(0); 
  const [perfectCombo, setPerfectCombo] = useState(0);
  
  const [showRanking, setShowRanking] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userNickname, setUserNickname] = useState('');
  const [userCoins, setUserCoins] = useState(0);
  const [inventory, setInventory] = useState<string[]>(['default']); 
  const [equippedSkin, setEquippedSkin] = useState('default');
  const [buyingItem, setBuyingItem] = useState<string | null>(null);
  const [shopTab, setShopTab] = useState<'common' | 'rare' | 'legendary'>('common');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loadingRank, setLoadingRank] = useState(false);
  
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
  const [roomCode, setRoomCode] = useState('');
  const [challengeData, setChallengeData] = useState<{name: string, target: number} | null>(null);
  
  // ESTADOS PARA EL ANUNCIO
  const [showAd, setShowAd] = useState(false);
  const [adType, setAdType] = useState<'LIFE' | 'HINT' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const { playSound } = useAudio();
  const scaleRef = useRef(1);

  const gameRef = useRef({
    time: 0,
    cameraY: 0,
    targetCameraY: 0,
    swingSpeed: CONFIG.SWING_SPEED_BASE,
    currentBlock: { x: 0, y: 0, state: 'SWINGING' as 'SWINGING' | 'DROPPING' | 'LANDED' },
    stack: [] as { x: number, y: number, perfect: boolean }[],
    skin: 'default'
  });

  // CARGA USUARIO
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        try {
            const docRef = doc(db, "users", u.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserNickname(data.nickname || u.displayName || 'Jugador');
                setUserCoins(data.coins || 0);
                if(data.inventory) setInventory(data.inventory);
                if(data.equippedTowerSkin) {
                    setEquippedSkin(data.equippedTowerSkin);
                    gameRef.current.skin = data.equippedTowerSkin;
                }
            } else {
                setUserNickname(u.displayName || 'Jugador');
            }
        } catch (e) { console.error(e); }
      }
    });

    const challenger = searchParams.get('challenger');
    const target = searchParams.get('target');
    if (challenger && target) {
        setChallengeData({ name: challenger, target: parseInt(target) });
    }
    fetchLeaderboard();
    return () => unsub();
  }, [searchParams]);

  // RANKING REAL
  const fetchLeaderboard = async () => {
      setLoadingRank(true);
      try {
          const q = query(collection(db, "scores_towerbloxx"), orderBy("score", "desc"), limit(10));
          const querySnapshot = await getDocs(q);
          const scores = querySnapshot.docs.map(doc => doc.data());
          setLeaderboard(scores);
      } catch (error) { console.error("Error ranking:", error); } 
      finally { setLoadingRank(false); }
  };

  // GUARDADO
  useEffect(() => {
      if (gameState === 'GAMEOVER' && user && score > 0) {
          const saveScore = async () => {
              setSaveStatus('SAVING');
              try {
                  await addDoc(collection(db, "scores_towerbloxx"), {
                      uid: user.uid,
                      name: userNickname, 
                      score: score,
                      photo: user.photoURL || null,
                      date: serverTimestamp()
                  });
                  setSaveStatus('SAVED');
                  const coinsEarned = Math.floor(score / 2);
                  if (coinsEarned > 0) {
                      await updateDoc(doc(db, "users", user.uid), {
                          coins: (userCoins || 0) + coinsEarned
                      });
                      setUserCoins(prev => prev + coinsEarned);
                  }
                  fetchLeaderboard();
              } catch (error) { setSaveStatus('ERROR'); }
          };
          saveScore();
      } else if (gameState === 'GAMEOVER' && !user) {
          setSaveStatus('IDLE'); 
      }
  }, [gameState]);

  // IA
  useEffect(() => {
      if (gameState === 'PLAYING' && gameMode === 'VS_AI') {
          const aiInterval = setInterval(() => {
              if (Math.random() > 0.3) setAiScore(prev => prev + 1);
          }, 1500);
          return () => clearInterval(aiInterval);
      }
  }, [gameState, gameMode]);

  const handleBuyOrEquip = async (item: any) => {
      if (!user) return alert("Inicia sesión para usar la tienda.");
      if (inventory.includes(item.id)) {
          setEquippedSkin(item.id);
          gameRef.current.skin = item.id;
          playSound('click');
          await updateDoc(doc(db, "users", user.uid), { equippedTowerSkin: item.id });
      } else {
          if (userCoins >= item.price) {
              setBuyingItem(item.id);
              try {
                  await updateDoc(doc(db, "users", user.uid), {
                      coins: userCoins - item.price,
                      inventory: arrayUnion(item.id),
                      equippedTowerSkin: item.id
                  });
                  setUserCoins(prev => prev - item.price);
                  setInventory(prev => [...prev, item.id]);
                  setEquippedSkin(item.id);
                  gameRef.current.skin = item.id;
                  playSound('success');
              } catch (e) { alert("Error al comprar"); } 
              finally { setBuyingItem(null); }
          } else {
              playSound('error');
              alert("No tienes suficientes monedas.");
          }
      }
  };

  const drawBuildingBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, isPerfect: boolean, isMoving: boolean, skin: string) => {
      const w = CONFIG.BASE_BLOCK_WIDTH * scaleRef.current;
      const h = CONFIG.BASE_BLOCK_HEIGHT * scaleRef.current;

      if (!isMoving) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + (8 * scaleRef.current), y + (8 * scaleRef.current), w, h);
      }

      let mainColor1 = '#f1f5f9'; let mainColor2 = '#94a3b8';
      let windowColor = '#0ea5e9'; let balconyColor = '#1e293b'; let strokeColor = '#334155';

      if (skin === 'gold') { mainColor1 = '#fde047'; mainColor2 = '#d97706'; windowColor = '#fef3c7'; balconyColor = '#78350f'; strokeColor = '#b45309'; }
      else if (skin === 'cyber') { mainColor1 = '#e879f9'; mainColor2 = '#a21caf'; windowColor = '#22d3ee'; balconyColor = '#4c1d95'; strokeColor = '#f0abfc'; }
      else if (skin === 'eco') { mainColor1 = '#bef264'; mainColor2 = '#65a30d'; windowColor = '#bae6fd'; balconyColor = '#365314'; strokeColor = '#1a2e05'; }
      else if (skin === 'ruby') { mainColor1 = '#f87171'; mainColor2 = '#991b1b'; windowColor = '#fecaca'; balconyColor = '#450a0a'; strokeColor = '#7f1d1d'; }
      else if (skin === 'obsidian') { mainColor1 = '#475569'; mainColor2 = '#0f172a'; windowColor = '#6366f1'; balconyColor = '#000000'; strokeColor = '#94a3b8'; }
      else if (skin === 'diamond') { mainColor1 = '#e0f2fe'; mainColor2 = '#0ea5e9'; windowColor = '#ffffff'; balconyColor = '#0369a1'; strokeColor = '#38bdf8'; }
      else if (skin === 'toxic') { mainColor1 = '#d9f99d'; mainColor2 = '#65a30d'; windowColor = '#a3e635'; balconyColor = '#1a2e05'; strokeColor = '#365314'; }
      else if (skin === 'magma') { mainColor1 = '#fb923c'; mainColor2 = '#9a3412'; windowColor = '#fca5a5'; balconyColor = '#450a0a'; strokeColor = '#7f1d1d'; }

      if (isPerfect) {
          mainColor1 = '#ffffff'; 
          if(!isMoving) { ctx.shadowColor = windowColor; ctx.shadowBlur = 20; }
      }

      const gradient = ctx.createLinearGradient(x, y, x + w, y);
      gradient.addColorStop(0, mainColor1);
      gradient.addColorStop(1, mainColor2);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, w, h);
      ctx.shadowBlur = 0; 

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2 * scaleRef.current;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = windowColor; 
      ctx.fillRect(x + (15 * scaleRef.current), y + (15 * scaleRef.current), 25 * scaleRef.current, 30 * scaleRef.current);
      ctx.fillRect(x + w - (40 * scaleRef.current), y + (15 * scaleRef.current), 25 * scaleRef.current, 30 * scaleRef.current);
      
      ctx.fillStyle = balconyColor;
      ctx.fillRect(x + (10 * scaleRef.current), y + (55 * scaleRef.current), w - (20 * scaleRef.current), 12 * scaleRef.current);
  };

  const update = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = gameRef.current;
    
    const logicalWidth = canvas.width / (window.devicePixelRatio || 1);
    const scaledWidth = CONFIG.BASE_BLOCK_WIDTH * scaleRef.current;
    const scaledHeight = CONFIG.BASE_BLOCK_HEIGHT * scaleRef.current;

    state.cameraY += (state.targetCameraY - state.cameraY) * CONFIG.CAMERA_SPEED;

    if (state.currentBlock.state === 'SWINGING') {
        state.time += state.swingSpeed;
        const swingRange = logicalWidth / 2 - scaledWidth; 
        const centerX = logicalWidth / 2;
        const offsetX = Math.sin(state.time) * swingRange;
        state.currentBlock.x = centerX + offsetX - (scaledWidth / 2);
        state.currentBlock.y = (CONFIG.ROPE_HEIGHT + Math.abs(Math.cos(state.time) * 20)) - state.cameraY; 
    }

    if (state.currentBlock.state === 'DROPPING') {
        const prevBlock = state.stack[state.stack.length - 1];
        const landingY = prevBlock.y - scaledHeight;
        
        let currentGravity = CONFIG.GRAVITY;
        if (state.currentBlock.y > landingY + (scaledHeight / 2)) {
             currentGravity = CONFIG.GRAVITY * 5; 
        }
        state.currentBlock.y += currentGravity;

        if (state.currentBlock.y >= landingY && state.currentBlock.y < landingY + (scaledHeight)) {
            const overlapTolerance = 25 * scaleRef.current;
            const overlap = (state.currentBlock.x + scaledWidth > prevBlock.x + overlapTolerance) && 
                            (state.currentBlock.x < prevBlock.x + scaledWidth - overlapTolerance);

            if (overlap) {
                state.currentBlock.state = 'LANDED';
                state.currentBlock.y = landingY;
                const centerDiff = Math.abs(state.currentBlock.x - prevBlock.x);
                let isPerfect = false;

                if (centerDiff < (CONFIG.PERFECT_TOLERANCE * scaleRef.current)) {
                    state.currentBlock.x = prevBlock.x;
                    isPerfect = true;
                    setPerfectCombo(c => c + 1);
                    setScore(s => s + 2); 
                    playSound('pop');
                } else {
                    setPerfectCombo(0);
                    setScore(s => s + 1);
                    playSound('click');
                }

                state.stack.push({
                    x: state.currentBlock.x,
                    y: state.currentBlock.y,
                    perfect: isPerfect
                });

                if (state.stack.length > 2) state.targetCameraY += scaledHeight;
                state.swingSpeed = Math.min(0.12, CONFIG.SWING_SPEED_BASE + (state.stack.length * 0.002));
                state.currentBlock = { x: logicalWidth / 2, y: -100, state: 'SWINGING' };
            }
        }
        
        const screenBottom = (canvas.height / window.devicePixelRatio) + state.cameraY;
        if (state.currentBlock.y > screenBottom + 50) { 
            handleLifeLost(logicalWidth);
        }
    }
  };

  const handleLifeLost = (logicalWidth: number) => {
      if (gameRef.current.currentBlock.state === 'LANDED') return;
      gameRef.current.currentBlock.state = 'LANDED'; 
      playSound('error');
      setPerfectCombo(0);
      setLives(prevLives => {
          const newLives = prevLives - 1;
          if (newLives > 0) {
              setTimeout(() => {
                  gameRef.current.currentBlock = { x: logicalWidth / 2, y: -100, state: 'SWINGING' };
              }, 200); 
              return newLives;
          } else {
              setGameState('GAMEOVER');
              return 0;
          }
      });
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = gameRef.current;
    const logicalWidth = canvas.width / window.devicePixelRatio;
    const logicalHeight = canvas.height / window.devicePixelRatio;

    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    const gradient = ctx.createLinearGradient(0, 0, 0, logicalHeight);
    if (state.skin === 'cyber') { gradient.addColorStop(0, '#0f172a'); gradient.addColorStop(1, '#4c1d95'); } 
    else if (state.skin === 'gold') { gradient.addColorStop(0, '#422006'); gradient.addColorStop(1, '#a16207'); }
    else if (state.skin === 'magma') { gradient.addColorStop(0, '#450a0a'); gradient.addColorStop(1, '#991b1b'); }
    else if (state.skin === 'diamond') { gradient.addColorStop(0, '#0c4a6e'); gradient.addColorStop(1, '#0ea5e9'); }
    else { gradient.addColorStop(0, '#0f172a'); gradient.addColorStop(1, '#1e293b'); }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    ctx.save();
    ctx.translate(0, state.cameraY);

    const groundY = state.stack[0].y + (CONFIG.BASE_BLOCK_HEIGHT * scaleRef.current);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, groundY, logicalWidth, 1000);

    state.stack.forEach(block => {
        drawBuildingBlock(ctx, block.x, block.y, block.perfect, false, state.skin);
    });

    if (state.currentBlock.state === 'DROPPING') {
        drawBuildingBlock(ctx, state.currentBlock.x, state.currentBlock.y, false, true, state.skin);
    }

    ctx.restore();

    if (state.currentBlock.state === 'SWINGING') {
        const originX = logicalWidth / 2;
        const blockDrawY = state.currentBlock.y + state.cameraY;
        const scaledWidth = CONFIG.BASE_BLOCK_WIDTH * scaleRef.current;

        ctx.beginPath();
        ctx.moveTo(originX, -50); 
        ctx.lineTo(state.currentBlock.x + scaledWidth/2, blockDrawY);
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 3 * scaleRef.current;
        ctx.stroke();

        drawBuildingBlock(ctx, state.currentBlock.x, blockDrawY, false, true, state.skin);
    }
  };

  const loop = () => {
      if (gameState === 'PLAYING') { update(); draw(); }
      requestRef.current = requestAnimationFrame(loop);
  };

  const handleTap = (e: any) => {
      e?.preventDefault(); e?.stopPropagation();
      if (gameState === 'PLAYING') {
          if (gameRef.current.currentBlock.state === 'SWINGING') {
              gameRef.current.currentBlock.state = 'DROPPING';
          }
      }
  };

  const initGame = (mode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setGameMode(mode); setScore(0); setAiScore(0); setLives(3); setPerfectCombo(0); setSaveStatus('IDLE'); setExtraLivesUsed(0);
    if (mode === 'VS_FRIEND') { setRoomCode(Math.random().toString(36).substring(2, 8).toUpperCase()); setGameState('MULTIPLAYER_LOBBY'); return; }
    const logicalWidth = canvas.width / (window.devicePixelRatio || 1);
    const logicalHeight = canvas.height / (window.devicePixelRatio || 1);
    const centerX = logicalWidth / 2;
    const groundY = logicalHeight - 150; 
    const scaledWidth = CONFIG.BASE_BLOCK_WIDTH * scaleRef.current;
    gameRef.current = {
        time: 0, cameraY: 0, targetCameraY: 0, swingSpeed: CONFIG.SWING_SPEED_BASE,
        currentBlock: { x: centerX, y: 100, state: 'SWINGING' },
        stack: [{ x: centerX - scaledWidth/2, y: groundY, perfect: true }],
        skin: equippedSkin
    };
    setGameState('PLAYING');
  };

  // --- LOGICA DE VIDEO ---
  const triggerExtraLife = () => {
      if (extraLivesUsed >= 2) return;
      setAdType('LIFE');
      setShowAd(true);
  };

  const handleAdReward = () => {
      setShowAd(false);
      if (adType === 'LIFE') {
          setLives(1); 
          setExtraLivesUsed(prev => prev + 1); 
          setGameState('PLAYING');
          const canvas = canvasRef.current;
          if (canvas) {
              const logicalWidth = canvas.width / (window.devicePixelRatio || 1);
              gameRef.current.currentBlock = { x: logicalWidth / 2, y: -100, state: 'SWINGING' };
          }
      }
      setAdType(null);
  };

  useEffect(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
          const resize = () => {
              const rect = container.getBoundingClientRect(); 
              const dpr = window.devicePixelRatio || 1;
              canvas.width = rect.width * dpr;
              canvas.height = rect.height * dpr;
              const ctx = canvas.getContext('2d');
              ctx?.scale(dpr, dpr);
              scaleRef.current = rect.width < 350 ? 0.65 : rect.width < 450 ? 0.8 : 1.0;
          };
          window.addEventListener('resize', resize); resize();
          return () => window.removeEventListener('resize', resize);
      }
  }, [gameState]);

  useEffect(() => {
      requestRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(requestRef.current!);
  }, [gameState]);

  return (
    <div className="fixed inset-0 bg-slate-900 flex justify-center items-center overflow-hidden touch-none select-none">
        
        {showAd && <VideoAdOverlay onComplete={handleAdReward} onCancel={() => setShowAd(false)} />}

        <div className="relative w-full h-full max-w-[500px] bg-gradient-to-b from-sky-900 to-slate-900 shadow-2xl overflow-hidden flex flex-col">
            
            {/* HUD JUEGO */}
            <div className="w-full p-4 grid grid-cols-3 items-start bg-gradient-to-b from-black/60 to-transparent z-20 shrink-0 min-h-[100px]">
                {gameState === 'PLAYING' && (
                    <>
                        <div className="flex flex-col items-start gap-3">
                            <div className="flex items-center gap-2">
                                <button onClick={() => setGameState('MENU')} className="p-2 bg-black/40 rounded-full text-white backdrop-blur-md"><ArrowLeft size={20} /></button>
                                <div className="flex gap-1 bg-black/40 p-1.5 rounded-full backdrop-blur-sm border border-white/10">
                                    {[...Array(3)].map((_, i) => (<Heart key={i} size={16} className={i < lives ? "fill-red-500 text-red-500" : "text-slate-600 fill-slate-800"} />))}
                                </div>
                            </div>
                            
                            {/* PUNTUACIÓN EN IZQUIERDA */}
                            <div className="pl-1">
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Puntuación</span>
                                <div className="text-4xl font-black text-white font-mono leading-none drop-shadow-lg">{score}</div>
                            </div>

                            {perfectCombo > 1 && <div className="bg-yellow-500 text-black font-black text-xs px-2 py-1 rounded rotate-[-5deg] animate-bounce shadow-lg mt-2">COMBO x{perfectCombo}!</div>}
                        </div>
                        
                        <div className="flex justify-center">
                             <div className="bg-black/50 px-4 py-2 rounded-full border border-yellow-500/50 flex items-center gap-2 backdrop-blur-md shadow-lg transform translate-y-1">
                                <Coins className="text-yellow-400 fill-yellow-500" size={18} />
                                <span className="text-yellow-100 font-black text-lg">{userCoins}</span>
                             </div>
                        </div>
                        
                        <div className="flex flex-col items-end justify-start">
                            {gameMode === 'VS_AI' && (
                                <div className="flex flex-col items-end">
                                    <span className="text-[9px] text-red-400 font-bold uppercase">Rival (IA)</span>
                                    <span className="text-3xl font-black text-red-100 font-mono">{aiScore}</span>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div ref={containerRef} className="flex-1 relative w-full overflow-hidden bg-transparent cursor-pointer" onPointerDown={handleTap}>
                 <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" style={{ touchAction: 'none' }}/>
            </div>

            {gameState === 'MENU' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30 p-6 text-center animate-in fade-in">
                    <Link href="/" className="absolute top-6 left-6 p-3 bg-slate-800/80 rounded-full border border-slate-700 text-white hover:bg-slate-700 z-50"><ArrowLeft size={24} /></Link>
                    
                    {challengeData ? (
                        <div className="mb-6 bg-slate-800 p-6 rounded-3xl border-2 border-yellow-500 w-full max-w-xs shadow-2xl">
                            <h2 className="text-xl font-black text-white">Reto de {challengeData.name}</h2>
                            <p className="text-3xl font-black text-white">{challengeData.target} <span className="text-xs text-yellow-500">PISOS</span></p>
                            <button onClick={() => initGame('SOLO')} className="mt-4 w-full bg-yellow-500 text-black font-black py-3 rounded-xl">ACEPTAR</button>
                        </div>
                    ) : (
                        <div className="w-full max-w-xs space-y-4">
                            <h1 className="text-5xl font-black text-white italic tracking-tighter mb-4 drop-shadow-xl">SKY<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">TOWER</span></h1>
                            <button onClick={() => setGameState('MODE_SELECT')} className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-black text-2xl py-6 rounded-3xl shadow-[0_0_40px_rgba(234,179,8,0.4)] flex items-center justify-center gap-3 transition-all hover:scale-105 active:scale-95 animate-pulse border-4 border-yellow-300/50">
                                <Play fill="black" size={32}/> ¡JUGAR YA!
                            </button>
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <button onClick={() => { setShowRanking(true); fetchLeaderboard(); }} className="bg-slate-800 text-white font-bold py-4 rounded-2xl border border-slate-700 flex items-center justify-center gap-2 text-xs hover:bg-slate-700 transition-colors shadow-lg"><Trophy size={18} className="text-yellow-500"/> RANKING</button>
                                <button onClick={() => setShowShop(true)} className="bg-slate-800 text-white font-bold py-4 rounded-2xl border border-slate-700 flex items-center justify-center gap-2 text-xs hover:bg-slate-700 transition-colors shadow-lg"><ShoppingBag size={18} className="text-pink-500"/> TIENDA</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {gameState === 'MODE_SELECT' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40 p-6 animate-in zoom-in">
                    <h2 className="text-2xl font-black text-white mb-8 uppercase tracking-widest italic">SELECCIONA MODO</h2>
                    <div className="w-full max-w-xs space-y-4">
                        <button onClick={() => initGame('SOLO')} className="w-full bg-slate-800 p-5 rounded-2xl border border-slate-600 flex gap-4 items-center hover:border-yellow-500 hover:bg-slate-700 transition-all group shadow-lg"><Hammer className="text-yellow-400 group-hover:scale-110 transition-transform" size={24}/> <span className="font-black text-white text-lg">SOLITARIO</span></button>
                        <button onClick={() => initGame('VS_AI')} className="w-full bg-slate-800 p-5 rounded-2xl border border-slate-600 flex gap-4 items-center hover:border-red-500 hover:bg-slate-700 transition-all group shadow-lg"><Bot className="text-red-400 group-hover:scale-110 transition-transform" size={24}/> <span className="font-black text-white text-lg">CONTRA IA</span></button>
                        <button onClick={() => initGame('VS_FRIEND')} className="w-full bg-slate-800 p-5 rounded-2xl border border-slate-600 flex gap-4 items-center hover:border-green-500 hover:bg-slate-700 transition-all group shadow-lg"><Users className="text-green-400 group-hover:scale-110 transition-transform" size={24}/> <span className="font-black text-white text-lg">AMIGO</span></button>
                    </div>
                    <button onClick={() => setGameState('MENU')} className="mt-10 text-slate-500 text-sm font-bold flex gap-2 hover:text-white items-center py-2 px-4 rounded-full hover:bg-white/10 transition-colors"><ArrowLeft size={16}/> VOLVER</button>
                </div>
            )}

            {gameState === 'GAMEOVER' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md z-30 p-4 animate-in zoom-in">
                    <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col items-center mb-4 shadow-2xl w-full max-w-xs relative overflow-hidden">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Pisos Construidos</span>
                        <div className="text-6xl font-black text-white mb-1">{score}</div>
                        <div className="h-6 flex items-center justify-center mt-2">
                            {saveStatus === 'SAVING' && <span className="text-yellow-400 text-xs flex gap-1"><Loader2 className="animate-spin" size={12}/> Guardando...</span>}
                            {saveStatus === 'SAVED' && <span className="text-emerald-400 text-xs font-bold flex gap-1"><CheckCircle size={12}/> Récord Guardado</span>}
                            {saveStatus === 'ERROR' && <span className="text-red-400 text-xs font-bold flex gap-1"><AlertCircle size={12}/> Error al guardar</span>}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 w-full max-w-xs mb-4">
                        <button 
                            onClick={triggerExtraLife} 
                            disabled={extraLivesUsed >= 2}
                            className={`border p-3 rounded-xl flex flex-col items-center transition-colors ${extraLivesUsed >= 2 ? 'bg-slate-800 border-slate-700 text-slate-600 opacity-50' : 'bg-purple-600/20 border-purple-500/50 text-purple-300 hover:bg-purple-600/40'}`}
                        >
                            <Video size={20}/> 
                            <span className="text-[10px] font-black uppercase mt-1">
                                {extraLivesUsed >= 2 ? 'MAX USADO' : `REVIVIR (${2-extraLivesUsed})`}
                            </span>
                        </button>
                        <button className="bg-blue-600/20 border border-blue-500/50 text-blue-300 p-3 rounded-xl flex flex-col items-center hover:bg-blue-600/40 transition-colors"><Bot size={20}/> <span className="text-[10px] font-black uppercase mt-1">PISTA</span></button>
                    </div>
                    <div className="flex gap-3 w-full max-w-xs mb-4">
                        <Link href="/" className="bg-slate-700 text-white p-3 rounded-xl flex-1 flex justify-center items-center hover:bg-slate-600"><Home size={24}/></Link>
                        <button onClick={() => initGame(gameMode)} className="bg-yellow-500 text-black font-black py-3 px-6 rounded-xl flex-[2] flex items-center justify-center gap-2 hover:bg-yellow-400"><RotateCcw size={20} /> OTRA VEZ</button>
                    </div>
                </div>
            )}

            {showShop && (
                <div className="absolute inset-0 z-50 bg-black/95 flex flex-col p-6 animate-in slide-in-from-bottom">
                     <div className="flex justify-between items-center mb-6">
                        <button onClick={() => setShowShop(false)} className="bg-slate-800 p-2 rounded-full hover:bg-slate-700 transition-colors border border-slate-700"><ArrowLeft className="text-white" size={24} /></button>
                        <h2 className="text-2xl font-black text-white flex gap-2 items-center"><Crown className="text-yellow-500" fill="gold"/> TIENDA PREMIUM</h2>
                        <div className="w-10"></div>
                     </div>

                     <div className="flex gap-2 mb-4">
                         {['common', 'rare', 'legendary'].map(tab => (
                             <button key={tab} onClick={() => setShopTab(tab)} className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase transition-all ${shopTab === tab ? 'bg-white text-black' : 'bg-slate-800 text-slate-500'}`}>{tab === 'common' ? 'Básicos' : tab === 'rare' ? 'Premium' : 'Legendarios'}</button>
                         ))}
                     </div>

                     <div className="grid grid-cols-2 gap-4 overflow-y-auto pb-20 custom-scrollbar">
                        {SHOP_ITEMS.filter(i => i.rarity === shopTab).map(item => {
                            const owned = inventory.includes(item.id);
                            const equipped = equippedSkin === item.id;
                            
                            return (
                                <div key={item.id} className={`bg-slate-900 p-4 rounded-2xl border-2 flex flex-col items-center gap-3 relative overflow-hidden group ${equipped ? 'border-emerald-500' : 'border-slate-700'}`}>
                                    <div className={`w-16 h-12 rounded-lg shadow-lg bg-gradient-to-r ${item.gradient} border-2 border-white/20 transform group-hover:scale-110 transition-transform relative`}>
                                        <div className="absolute top-2 left-2 w-3 h-4 bg-white/30 rounded-sm"></div>
                                        <div className="absolute top-2 right-2 w-3 h-4 bg-white/30 rounded-sm"></div>
                                    </div>

                                    <div className="text-center z-10">
                                        <div className="text-white font-bold text-sm">{item.name}</div>
                                        {!owned && <div className="text-yellow-400 text-xs font-bold">{item.price} <Coins size={10} className="inline"/></div>}
                                    </div>
                                    <button 
                                        onClick={() => handleBuyOrEquip(item)}
                                        disabled={buyingItem === item.id}
                                        className={`w-full py-2 rounded-lg text-xs font-black uppercase transition-all ${equipped ? 'bg-emerald-500 text-black cursor-default' : owned ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-yellow-500 text-black hover:bg-yellow-400'}`}
                                    >
                                        {buyingItem === item.id ? <Loader2 className="animate-spin mx-auto" size={12}/> : equipped ? 'USANDO' : owned ? 'EQUIPAR' : 'COMPRAR'}
                                    </button>
                                </div>
                            )
                        })}
                     </div>
                </div>
            )}

            {showRanking && (
                <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in zoom-in">
                    <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl relative">
                        <button onClick={() => setShowRanking(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={20}/></button>
                        <h2 className="text-2xl font-black text-white text-center mb-6 flex items-center justify-center gap-2"><Trophy className="text-yellow-500"/> TOP MUNDIAL</h2>
                        
                        {loadingRank ? (
                            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white"/></div>
                        ) : (
                            <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                                {leaderboard.length > 0 ? leaderboard.map((player, i) => (
                                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl ${i===0 ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-slate-800'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${i===0 ? 'bg-yellow-500 text-black' : i===1 ? 'bg-slate-400 text-black' : i===2 ? 'bg-orange-700 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                                {i+1}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-white font-bold text-sm truncate max-w-[120px]">{player.name}</span>
                                                <span className="text-[9px] text-slate-500">{player.date ? new Date(player.date.seconds * 1000).toLocaleDateString() : 'Reciente'}</span>
                                            </div>
                                        </div>
                                        <span className="font-mono font-black text-emerald-400 text-lg">{player.score}</span>
                                    </div>
                                )) : (
                                    <div className="text-center text-slate-500 py-4 italic">Sé el primero en el ranking...</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="w-full bg-black shrink-0 z-50"><AdSpace type="banner" /></div>
        </div>
    </div>
  );
}

export default function TowerBloxxPage() {
    return (
        <Suspense fallback={<div className="h-screen w-full bg-slate-900 flex items-center justify-center text-white">Cargando...</div>}>
            <GameContent />
        </Suspense>
    );
}