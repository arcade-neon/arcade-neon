// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, Play, RotateCcw, Trophy, Hammer, Heart, 
  Share2, MessageCircle, Home, CheckCircle, Users, Bot, Video, 
  ShoppingBag, Coins, Lock, Loader2, X, AlertCircle, Gem, Crown, Zap
} from 'lucide-react';
import { useAudio } from '@/contexts/AudioContext'; 
import GameRanking from '@/components/GameRanking';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace'; 

// --- CONFIGURACIÓN FÍSICA ---
const CONFIG = {
    BASE_BLOCK_WIDTH: 100, 
    BASE_BLOCK_HEIGHT: 80,
    GRAVITY: 10,
    SWING_SPEED_BASE: 0.035, 
    ROPE_HEIGHT: 150, 
    PERFECT_TOLERANCE: 15,
    CAMERA_SPEED: 0.1 
};

// --- TIENDA PREMIUM EXPANDIDA ---
const SHOP_ITEMS = [
    { id: 'default', name: 'Hormigón', price: 0, color: '#94a3b8', type: 'skin', rarity: 'common' },
    { id: 'eco', name: 'Eco Madera', price: 250, color: '#78350f', type: 'skin', rarity: 'common' },
    { id: 'cyber', name: 'Cyber Neon', price: 500, color: '#ec4899', type: 'skin', rarity: 'rare' },
    { id: 'gold', name: 'Lingote de Oro', price: 1000, color: '#fbbf24', type: 'skin', rarity: 'epic' },
    { id: 'ruby', name: 'Rubí Sangre', price: 1500, color: '#ef4444', type: 'skin', rarity: 'epic' },
    { id: 'toxic', name: 'Residuo Tóxico', price: 2000, color: '#a3e635', type: 'skin', rarity: 'rare' },
    { id: 'obsidian', name: 'Obsidiana Pura', price: 3000, color: '#1e293b', type: 'skin', rarity: 'legendary' },
    { id: 'diamond', name: 'Cristal Diamante', price: 5000, color: '#bae6fd', type: 'skin', rarity: 'legendary' },
];

function GameContent() {
  const searchParams = useSearchParams();
  const [gameState, setGameState] = useState<'MENU' | 'MODE_SELECT' | 'PLAYING' | 'GAMEOVER' | 'MULTIPLAYER_LOBBY'>('MENU');
  const [gameMode, setGameMode] = useState<'SOLO' | 'VS_AI' | 'VS_FRIEND'>('SOLO');
  
  // Estados de Juego
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [aiScore, setAiScore] = useState(0); 
  
  // Estados UI y Usuario
  const [showRanking, setShowRanking] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userNickname, setUserNickname] = useState('');
  const [userCoins, setUserCoins] = useState(0);
  const [inventory, setInventory] = useState<string[]>(['default']); 
  const [equippedSkin, setEquippedSkin] = useState('default');
  const [buyingItem, setBuyingItem] = useState<string | null>(null);
  const [perfectCombo, setPerfectCombo] = useState(0);
  
  // Estado de guardado
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
  const [roomCode, setRoomCode] = useState('');

  // Modo Reto
  const [challengeData, setChallengeData] = useState<{name: string, target: number} | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const { playSound } = useAudio();

  const scaleRef = useRef(1);

  // Motor del juego
  const gameRef = useRef({
    time: 0,
    cameraY: 0,
    targetCameraY: 0,
    swingSpeed: CONFIG.SWING_SPEED_BASE,
    currentBlock: { x: 0, y: 0, state: 'SWINGING' as 'SWINGING' | 'DROPPING' | 'LANDED' },
    stack: [] as { x: number, y: number, perfect: boolean }[],
    skin: 'default'
  });

  // 1. CARGA DE USUARIO
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

    return () => unsub();
  }, [searchParams]);

  // --- EFECTO DE GUARDADO AUTOMÁTICO ---
  useEffect(() => {
      if (gameState === 'GAMEOVER' && user && score > 0) {
          const saveScore = async () => {
              setSaveStatus('SAVING');
              try {
                  const nameToSave = userNickname || 'Anónimo';
                  await addDoc(collection(db, "scores_towerbloxx"), {
                      uid: user.uid,
                      name: nameToSave,
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
              } catch (error) {
                  console.error("Error guardando:", error);
                  setSaveStatus('ERROR');
              }
          };
          saveScore();
      } else if (gameState === 'GAMEOVER' && !user) {
          setSaveStatus('IDLE'); 
      }
  }, [gameState]);

  // --- IA LOGIC ---
  useEffect(() => {
      if (gameState === 'PLAYING' && gameMode === 'VS_AI') {
          const aiInterval = setInterval(() => {
              if (Math.random() > 0.3) setAiScore(prev => prev + 1);
          }, 2000);
          return () => clearInterval(aiInterval);
      }
  }, [gameState, gameMode]);

  // --- TIENDA ---
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

  // --- INICIO DE JUEGO ---
  const initGame = (mode: 'SOLO' | 'VS_AI' | 'VS_FRIEND' = 'SOLO') => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setGameMode(mode);
    setScore(0);
    setAiScore(0);
    setLives(3);
    setPerfectCombo(0);
    setSaveStatus('IDLE');
    
    if (mode === 'VS_FRIEND') {
        setRoomCode(Math.random().toString(36).substring(2, 8).toUpperCase());
        setGameState('MULTIPLAYER_LOBBY');
        return;
    }

    const logicalWidth = canvas.width / (window.devicePixelRatio || 1);
    const logicalHeight = canvas.height / (window.devicePixelRatio || 1);
    const centerX = logicalWidth / 2;
    const groundY = logicalHeight - 150; 
    const scaledWidth = CONFIG.BASE_BLOCK_WIDTH * scaleRef.current;

    gameRef.current = {
        time: 0,
        cameraY: 0,
        targetCameraY: 0,
        swingSpeed: CONFIG.SWING_SPEED_BASE,
        currentBlock: { x: centerX, y: 100, state: 'SWINGING' },
        stack: [{ x: centerX - scaledWidth/2, y: groundY, perfect: true }],
        skin: equippedSkin
    };
    
    setGameState('PLAYING');
  };

  const watchAdForLife = () => {
      setLives(prev => prev + 1);
      setGameState('PLAYING'); 
  };

  // --- DIBUJADO DE EDIFICIOS PREMIUM ---
  const drawBuildingBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, isPerfect: boolean, isMoving: boolean, skin: string) => {
      const w = CONFIG.BASE_BLOCK_WIDTH * scaleRef.current;
      const h = CONFIG.BASE_BLOCK_HEIGHT * scaleRef.current;

      if (!isMoving) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + (10 * scaleRef.current), y + (10 * scaleRef.current), w, h);
      }

      let mainColor1 = '#f1f5f9';
      let mainColor2 = '#94a3b8';
      let windowColor = '#0ea5e9';
      let balconyColor = '#1e293b';
      let strokeColor = '#334155';

      // PALETAS DE COLORES PREMIUM
      if (skin === 'gold') {
          mainColor1 = '#fde047'; mainColor2 = '#d97706';
          windowColor = '#fef3c7'; balconyColor = '#78350f'; strokeColor = '#b45309';
      } else if (skin === 'cyber') {
          mainColor1 = '#e879f9'; mainColor2 = '#a21caf';
          windowColor = '#22d3ee'; balconyColor = '#4c1d95'; strokeColor = '#f0abfc';
      } else if (skin === 'eco') {
          mainColor1 = '#a3e635'; mainColor2 = '#3f6212';
          windowColor = '#bae6fd'; balconyColor = '#365314'; strokeColor = '#1a2e05';
      } else if (skin === 'ruby') {
          mainColor1 = '#f87171'; mainColor2 = '#991b1b';
          windowColor = '#fecaca'; balconyColor = '#450a0a'; strokeColor = '#7f1d1d';
      } else if (skin === 'obsidian') {
          mainColor1 = '#334155'; mainColor2 = '#0f172a';
          windowColor = '#6366f1'; balconyColor = '#000000'; strokeColor = '#94a3b8';
      } else if (skin === 'diamond') {
          mainColor1 = '#e0f2fe'; mainColor2 = '#7dd3fc';
          windowColor = '#ffffff'; balconyColor = '#0284c7'; strokeColor = '#38bdf8';
      } else if (skin === 'toxic') {
          mainColor1 = '#d9f99d'; mainColor2 = '#65a30d';
          windowColor = '#a3e635'; balconyColor = '#1a2e05'; strokeColor = '#365314';
      }

      if (isPerfect) mainColor1 = '#fff'; // Brillo extra

      const gradient = ctx.createLinearGradient(x, y, x + w, y);
      gradient.addColorStop(0, mainColor1);
      gradient.addColorStop(1, mainColor2);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2 * scaleRef.current;
      ctx.strokeRect(x, y, w, h);

      // Ventanas
      ctx.fillStyle = windowColor; 
      ctx.fillRect(x + (15 * scaleRef.current), y + (15 * scaleRef.current), 25 * scaleRef.current, 30 * scaleRef.current);
      ctx.fillRect(x + w - (40 * scaleRef.current), y + (15 * scaleRef.current), 25 * scaleRef.current, 30 * scaleRef.current);
      
      // Balcón
      ctx.fillStyle = balconyColor;
      ctx.fillRect(x + (10 * scaleRef.current), y + (55 * scaleRef.current), w - (20 * scaleRef.current), 10 * scaleRef.current);
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
        state.currentBlock.y = (CONFIG.ROPE_HEIGHT + Math.abs(Math.cos(state.time) * 15)) - state.cameraY; 
    }

    if (state.currentBlock.state === 'DROPPING') {
        state.currentBlock.y += CONFIG.GRAVITY;
        const prevBlock = state.stack[state.stack.length - 1];
        const landingY = prevBlock.y - scaledHeight;

        if (state.currentBlock.y >= landingY) {
            const overlapTolerance = 15 * scaleRef.current;
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

            } else if (state.currentBlock.y > (canvas.height / window.devicePixelRatio) + state.cameraY) {
                handleLifeLost(logicalWidth);
            }
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
              gameRef.current.currentBlock = { x: logicalWidth / 2, y: -100, state: 'SWINGING' };
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

    // Fondo degradado elegante
    const gradient = ctx.createLinearGradient(0, 0, 0, logicalHeight);
    if (state.skin === 'cyber') {
        gradient.addColorStop(0, '#0f172a'); gradient.addColorStop(1, '#4c1d95');
    } else if (state.skin === 'gold') {
        gradient.addColorStop(0, '#271a0c'); gradient.addColorStop(1, '#573a18');
    } else if (state.skin === 'obsidian') {
        gradient.addColorStop(0, '#020617'); gradient.addColorStop(1, '#1e293b');
    } else if (state.skin === 'diamond') {
        gradient.addColorStop(0, '#0c4a6e'); gradient.addColorStop(1, '#0284c7');
    } else {
        gradient.addColorStop(0, '#0f172a'); gradient.addColorStop(1, '#334155');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    ctx.save();
    ctx.translate(0, state.cameraY);

    // Suelo
    const groundY = state.stack[0].y + (CONFIG.BASE_BLOCK_HEIGHT * scaleRef.current);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, groundY, logicalWidth, 500);

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
        ctx.moveTo(originX, 0); 
        ctx.lineTo(state.currentBlock.x + scaledWidth/2, blockDrawY);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 3 * scaleRef.current;
        ctx.stroke();

        drawBuildingBlock(ctx, state.currentBlock.x, blockDrawY, false, true, state.skin);
    }
  };

  const loop = () => {
      if (gameState === 'PLAYING') {
          update();
          draw();
      }
      requestRef.current = requestAnimationFrame(loop);
  };

  const handleTap = (e: any) => {
      e?.preventDefault();
      if (gameState === 'PLAYING') {
          if (gameRef.current.currentBlock.state === 'SWINGING') {
              gameRef.current.currentBlock.state = 'DROPPING';
          }
      }
  };

  const shareOnWhatsapp = (targetScore = score) => {
      const currentUrl = window.location.origin + window.location.pathname;
      const challengeLink = `${currentUrl}?challenger=${encodeURIComponent(userNickname)}&target=${targetScore}&room=${roomCode}`;
      const text = `🏗️ *CONSTRUCCIONES CHALLENGE* \n\nHe construido ${targetScore} pisos. \nCódigo de Sala: *${roomCode || 'SOLO'}* \n\n¿Puedes superarme? \n${challengeLink}`;
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(whatsappUrl, '_blank');
  };

  // --- RESPONSIVE CANVAS ---
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

              if (rect.width < 350) scaleRef.current = 0.7;
              else if (rect.width < 450) scaleRef.current = 0.85;
              else scaleRef.current = 1.0;
          };
          window.addEventListener('resize', resize);
          resize();
          return () => window.removeEventListener('resize', resize);
      }
  }, [gameState]);

  useEffect(() => {
      requestRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(requestRef.current!);
  }, [gameState]);

  return (
    <div className="fixed inset-0 bg-slate-900 flex justify-center items-center overflow-hidden touch-none select-none">
        
        <div className="relative w-full h-full max-w-[500px] bg-gradient-to-b from-sky-900 to-slate-900 shadow-2xl overflow-hidden flex flex-col">
            
            {/* 1. HUD SUPERIOR */}
            <div className="w-full p-4 flex justify-between items-start bg-black/20 z-20 shrink-0 min-h-[80px]">
                {gameState === 'PLAYING' && (
                    <>
                        <button onClick={() => setGameState('MENU')} className="p-2 bg-black/40 rounded-full text-white backdrop-blur-md">
                            <ArrowLeft size={20} />
                        </button>
                        {gameMode === 'VS_AI' && <div className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-black shadow-lg">IA: {aiScore}</div>}
                        <div className="flex flex-col items-end">
                            <div className="flex gap-1 mb-2 bg-black/30 p-2 rounded-full backdrop-blur-sm">
                                {[...Array(3)].map((_, i) => (
                                    <Heart key={i} size={20} className={i < lives ? "fill-red-500 text-red-500" : "text-slate-600 fill-slate-800"} />
                                ))}
                            </div>
                            <div className="text-4xl font-black text-white font-mono">{score}</div>
                        </div>
                    </>
                )}
            </div>

            {/* 2. AREA DE JUEGO FLEXIBLE */}
            <div ref={containerRef} className="flex-1 relative w-full overflow-hidden bg-transparent">
                 <canvas 
                    ref={canvasRef} 
                    className="absolute inset-0 w-full h-full cursor-pointer"
                    onPointerDown={handleTap}
                    style={{ touchAction: 'none' }}
                />
            </div>

            {/* 3. MENÚS OVERLAY */}
            {gameState === 'MENU' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30 p-6 text-center">
                    
                    {/* BOTÓN VOLVER ATRÁS AL ARCADE */}
                    <Link href="/" className="absolute top-6 left-6 p-3 bg-slate-800/80 rounded-full border border-slate-700 text-white hover:bg-slate-700 z-50">
                        <ArrowLeft size={24} />
                    </Link>

                    <Hammer size={64} className="text-yellow-400 mb-4 animate-bounce" />
                    {challengeData ? (
                        <div className="mb-6 bg-slate-800 p-6 rounded-3xl border-2 border-yellow-500 w-full max-w-xs shadow-2xl">
                            <h2 className="text-xl font-black text-white">Reto de {challengeData.name}</h2>
                            <p className="text-3xl font-black text-white">{challengeData.target} <span className="text-xs text-yellow-500">PISOS</span></p>
                            <button onClick={() => initGame('SOLO')} className="mt-4 w-full bg-yellow-500 text-black font-black py-3 rounded-xl">ACEPTAR</button>
                        </div>
                    ) : (
                        <div className="w-full max-w-xs space-y-3">
                            <h1 className="text-4xl font-black text-white italic tracking-tighter mb-4">CONSTRUCCIONES</h1>
                            <button onClick={() => setGameState('MODE_SELECT')} className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-xl shadow-[0_0_20px_rgba(234,179,8,0.4)] flex items-center justify-center gap-2 transition-transform hover:scale-105">
                                <Play fill="black" size={20}/> JUGAR
                            </button>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setShowRanking(true)} className="bg-slate-800 text-white font-bold py-4 rounded-xl border border-slate-700 flex items-center justify-center gap-2 text-xs">
                                    <Trophy size={16} className="text-yellow-500"/> RANKING
                                </button>
                                <button onClick={() => setShowShop(true)} className="bg-slate-800 text-white font-bold py-4 rounded-xl border border-slate-700 flex items-center justify-center gap-2 text-xs">
                                    <ShoppingBag size={16} className="text-pink-500"/> TIENDA
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {gameState === 'MODE_SELECT' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40 p-6 animate-in zoom-in">
                    <h2 className="text-xl font-black text-white mb-6 uppercase tracking-widest">ELIGE MODO</h2>
                    <div className="w-full max-w-xs space-y-3">
                        <button onClick={() => initGame('SOLO')} className="w-full bg-slate-800 p-4 rounded-xl border border-slate-600 flex gap-4 items-center hover:border-yellow-500 transition-colors"><Hammer className="text-yellow-400"/> <span className="font-bold text-white">SOLITARIO</span></button>
                        <button onClick={() => initGame('VS_AI')} className="w-full bg-slate-800 p-4 rounded-xl border border-slate-600 flex gap-4 items-center hover:border-red-500 transition-colors"><Bot className="text-red-400"/> <span className="font-bold text-white">VS IA</span></button>
                        <button onClick={() => initGame('VS_FRIEND')} className="w-full bg-slate-800 p-4 rounded-xl border border-slate-600 flex gap-4 items-center hover:border-green-500 transition-colors"><Users className="text-green-400"/> <span className="font-bold text-white">RETAR AMIGO</span></button>
                    </div>
                    <button onClick={() => setGameState('MENU')} className="mt-8 text-slate-500 text-sm font-bold flex gap-2 hover:text-white"><ArrowLeft size={16}/> VOLVER</button>
                </div>
            )}

            {gameState === 'MULTIPLAYER_LOBBY' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40 p-6 text-center animate-in fade-in">
                    <h2 className="text-xl font-black text-white mb-2">SALA CREADA</h2>
                    <div className="bg-slate-800 p-6 rounded-3xl border border-green-500 mb-6 w-full max-w-xs">
                        <div className="text-4xl font-mono font-black text-green-400 tracking-widest">{roomCode}</div>
                    </div>
                    <button onClick={() => { setGameMode('SOLO'); setGameState('PLAYING'); }} className="text-white font-bold underline mt-4">Jugar Solo</button>
                    <button onClick={() => setGameState('MENU')} className="mt-8 text-red-400 text-sm font-bold flex gap-2 hover:text-red-300"><X size={16}/> CANCELAR</button>
                </div>
            )}

            {gameState === 'GAMEOVER' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md z-30 p-4 animate-in zoom-in">
                    <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col items-center mb-4 shadow-2xl w-full max-w-xs relative overflow-hidden">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Pisos</span>
                        <div className="text-6xl font-black text-white mb-1">{score}</div>
                        
                        <div className="h-6 flex items-center justify-center">
                            {saveStatus === 'SAVING' && <span className="text-yellow-400 text-xs flex gap-1"><Loader2 className="animate-spin" size={12}/> Guardando...</span>}
                            {saveStatus === 'SAVED' && <span className="text-emerald-400 text-xs font-bold flex gap-1"><CheckCircle size={12}/> Récord Guardado</span>}
                            {saveStatus === 'ERROR' && <span className="text-red-400 text-xs font-bold flex gap-1"><AlertCircle size={12}/> Error al guardar</span>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 w-full max-w-xs mb-4">
                        <button onClick={watchAdForLife} className="bg-purple-600/20 border border-purple-500/50 text-purple-300 p-3 rounded-xl flex flex-col items-center hover:bg-purple-600/40 transition-colors"><Video size={20}/> <span className="text-[10px] font-black uppercase">+1 VIDA</span></button>
                        <button className="bg-blue-600/20 border border-blue-500/50 text-blue-300 p-3 rounded-xl flex flex-col items-center hover:bg-blue-600/40 transition-colors"><Bot size={20}/> <span className="text-[10px] font-black uppercase">PISTA</span></button>
                    </div>

                    <div className="flex gap-3 w-full max-w-xs mb-4">
                        <Link href="/" className="bg-slate-700 text-white p-3 rounded-xl flex-1 flex justify-center items-center"><Home size={24}/></Link>
                        <button onClick={() => initGame(gameMode)} className="bg-yellow-500 text-black font-black py-3 px-6 rounded-xl flex-[2] flex items-center justify-center gap-2"><RotateCcw size={20} /> OTRA VEZ</button>
                    </div>

                     <button onClick={() => shareOnWhatsapp(score)} className="w-full max-w-xs bg-[#25D366] text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:bg-[#20bd5a]">
                        <MessageCircle size={20}/> RETAR CONTACTO
                    </button>
                </div>
            )}

            {/* 4. PUBLICIDAD Y FOOTER (FIJO ABAJO) */}
            <div className="w-full bg-black shrink-0 z-50">
                <AdSpace type="banner" />
            </div>

            {/* MODALES EXTRA */}
            {showShop && (
                <div className="absolute inset-0 z-50 bg-black/95 flex flex-col p-6 animate-in slide-in-from-bottom">
                     {/* CABECERA TIENDA CON FLECHA ATRÁS */}
                     <div className="flex justify-between items-center mb-6">
                        <button onClick={() => setShowShop(false)} className="bg-slate-800 p-2 rounded-full hover:bg-slate-700 transition-colors border border-slate-700">
                            <ArrowLeft className="text-white" size={24} />
                        </button>
                        <h2 className="text-2xl font-black text-white flex gap-2 items-center"><Crown className="text-yellow-500" fill="gold"/> TIENDA</h2>
                        <div className="w-10"></div>
                     </div>

                     <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700 mb-6 flex justify-between items-center shadow-lg">
                        <span className="text-slate-400 font-bold text-xs uppercase">Tus Monedas</span>
                        <span className="text-yellow-400 font-black text-xl flex gap-2 items-center"><Coins className="fill-yellow-500"/> {userCoins}</span>
                     </div>
                     <div className="grid grid-cols-2 gap-4 overflow-y-auto pb-20 custom-scrollbar">
                        {SHOP_ITEMS.map(item => {
                            const owned = inventory.includes(item.id);
                            const equipped = equippedSkin === item.id;
                            const isLegendary = item.rarity === 'legendary';
                            const isEpic = item.rarity === 'epic';
                            
                            let borderClass = 'border-slate-700';
                            if (equipped) borderClass = 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]';
                            else if (isLegendary) borderClass = 'border-blue-400/50 shadow-[0_0_10px_rgba(96,165,250,0.2)]';
                            else if (isEpic) borderClass = 'border-yellow-500/50';

                            return (
                                <div key={item.id} className={`bg-slate-800 p-4 rounded-2xl border-2 flex flex-col items-center gap-3 relative overflow-hidden group ${borderClass}`}>
                                    {isLegendary && <div className="absolute top-0 right-0 bg-blue-500 text-[8px] font-black text-white px-2 py-1 rounded-bl-lg">LEGENDARIO</div>}
                                    {isEpic && <div className="absolute top-0 right-0 bg-yellow-600 text-[8px] font-black text-white px-2 py-1 rounded-bl-lg">ÉPICO</div>}
                                    
                                    <div className="w-12 h-12 rounded shadow-lg transform group-hover:scale-110 transition-transform" style={{background: item.color}}></div>
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

            <GameRanking gameId="towerbloxx" isOpen={showRanking} onClose={() => setShowRanking(false)} />

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