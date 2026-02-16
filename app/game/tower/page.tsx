// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, Play, RotateCcw, Trophy, Hammer, Heart, 
  Share2, MessageCircle, Home, CheckCircle, Users, Bot, Video, 
  ShoppingBag, Coins, Lock, Check, Loader2, X
} from 'lucide-react';
import { useAudio } from '@/contexts/AudioContext'; 
import GameRanking from '@/components/GameRanking';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace'; 

// --- CONFIGURACIÓN FÍSICA ---
const CONFIG = {
    BLOCK_WIDTH: 100,
    BLOCK_HEIGHT: 80,
    GRAVITY: 10,
    SWING_SPEED_BASE: 0.035, 
    ROPE_HEIGHT: 150, 
    PERFECT_TOLERANCE: 12,
    CAMERA_SPEED: 0.1 
};

// --- ITEMS DE LA TIENDA ---
const SHOP_ITEMS = [
    { id: 'default', name: 'Hormigón', price: 0, color: '#94a3b8', type: 'skin' },
    { id: 'gold', name: 'Rascacielos de Oro', price: 1000, color: '#fbbf24', type: 'skin' },
    { id: 'cyber', name: 'Cyber Neon', price: 500, color: '#ec4899', type: 'skin' },
    { id: 'eco', name: 'Eco Madera', price: 250, color: '#78350f', type: 'skin' },
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
  const [showShop, setShowShop] = useState(false); // Modal Tienda
  const [user, setUser] = useState<any>(null);
  const [userNickname, setUserNickname] = useState('');
  const [userCoins, setUserCoins] = useState(0); // Monedas
  const [inventory, setInventory] = useState<string[]>(['default']); 
  const [equippedSkin, setEquippedSkin] = useState('default'); // Skin actual
  const [buyingItem, setBuyingItem] = useState<string | null>(null);

  const [perfectCombo, setPerfectCombo] = useState(0);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  // --- MODO RETO (URL) ---
  const [challengeData, setChallengeData] = useState<{name: string, target: number} | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const { playSound } = useAudio();

  // Referencia mutable para el motor del juego (rendimiento)
  const gameRef = useRef({
    time: 0,
    cameraY: 0,
    targetCameraY: 0,
    swingSpeed: CONFIG.SWING_SPEED_BASE,
    currentBlock: { x: 0, y: 0, state: 'SWINGING' as 'SWINGING' | 'DROPPING' | 'LANDED' },
    stack: [] as { x: number, y: number, perfect: boolean }[],
    skin: 'default' // Skin en uso dentro del loop
  });

  // 1. CARGAR USUARIO, MONEDAS Y SKIN
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
                    gameRef.current.skin = data.equippedTowerSkin; // Actualizar ref del juego
                }
            } else {
                setUserNickname(u.displayName || 'Jugador');
            }
        } catch (e) { console.error(e); }
      }
    });

    // Detectar Retos
    const challenger = searchParams.get('challenger');
    const target = searchParams.get('target');
    if (challenger && target) {
        setChallengeData({ name: challenger, target: parseInt(target) });
    }

    return () => unsub();
  }, [searchParams]);

  // --- IA LOGIC ---
  useEffect(() => {
      if (gameState === 'PLAYING' && gameMode === 'VS_AI') {
          const aiInterval = setInterval(() => {
              if (Math.random() > 0.3) setAiScore(prev => prev + 1);
          }, 2000);
          return () => clearInterval(aiInterval);
      }
  }, [gameState, gameMode]);

  // --- TIENDA: COMPRAR O EQUIPAR ---
  const handleBuyOrEquip = async (item: any) => {
      if (!user) return alert("Inicia sesión para usar la tienda.");

      if (inventory.includes(item.id)) {
          // EQUIPAR
          setEquippedSkin(item.id);
          gameRef.current.skin = item.id; // Actualizar motor inmediato
          playSound('click');
          await updateDoc(doc(db, "users", user.uid), { equippedTowerSkin: item.id });
      } else {
          // COMPRAR
          if (userCoins >= item.price) {
              setBuyingItem(item.id);
              try {
                  await updateDoc(doc(db, "users", user.uid), {
                      coins: userCoins - item.price,
                      inventory: arrayUnion(item.id),
                      equippedTowerSkin: item.id // Equipar al comprar
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

  // --- GUARDAR RANKING (CORREGIDO) ---
  const saveRankingDirectly = async (finalScore: number) => {
      if (!user || finalScore === 0) return;
      try {
          const nameToSave = userNickname || user.displayName || 'Anónimo';
          await addDoc(collection(db, "scores_towerbloxx"), {
              uid: user.uid,
              name: nameToSave,
              score: finalScore,
              photo: user.photoURL || null,
              date: serverTimestamp()
          });
          setScoreSaved(true);
          console.log("Ranking guardado correctamente para:", nameToSave);
      } catch (e) {
          console.error("Error guardando ranking:", e);
      }
  };

  // --- MOTOR DEL JUEGO ---
  const initGame = (mode: 'SOLO' | 'VS_AI' | 'VS_FRIEND' = 'SOLO') => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setGameMode(mode);
    setScore(0);
    setAiScore(0);
    setLives(3);
    setPerfectCombo(0);
    setScoreSaved(false);
    
    if (mode === 'VS_FRIEND') {
        setRoomCode(Math.random().toString(36).substring(2, 8).toUpperCase());
        setGameState('MULTIPLAYER_LOBBY');
        return;
    }

    const centerX = canvas.width / 2;
    const groundY = canvas.height - 100;

    gameRef.current = {
        time: 0,
        cameraY: 0,
        targetCameraY: 0,
        swingSpeed: CONFIG.SWING_SPEED_BASE,
        currentBlock: { x: centerX, y: 100, state: 'SWINGING' },
        stack: [{ x: centerX - CONFIG.BLOCK_WIDTH/2, y: groundY, perfect: true }],
        skin: equippedSkin // Usar skin equipada
    };
    
    setGameState('PLAYING');
  };

  const watchAdForLife = () => {
      alert("Simulación: Viendo anuncio publicitario (+1 Vida)...");
      setLives(prev => prev + 1);
      setGameState('PLAYING'); 
  };

  // --- DIBUJADO DE EDIFICIOS (CON SKINS) ---
  const drawBuildingBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, isPerfect: boolean, isMoving: boolean, skin: string) => {
      const w = CONFIG.BLOCK_WIDTH;
      const h = CONFIG.BLOCK_HEIGHT;

      // Sombra
      if (!isMoving) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + 10, y + 10, w, h);
      }

      // Estilos según Skin
      let mainColor1 = '#f1f5f9';
      let mainColor2 = '#94a3b8';
      let windowColor = '#0ea5e9';
      let balconyColor = '#1e293b';
      let strokeColor = '#334155';

      if (skin === 'gold') {
          mainColor1 = '#fde047'; mainColor2 = '#d97706';
          windowColor = '#fef3c7'; balconyColor = '#78350f';
          strokeColor = '#b45309';
      } else if (skin === 'cyber') {
          mainColor1 = '#e879f9'; mainColor2 = '#a21caf';
          windowColor = '#22d3ee'; balconyColor = '#4c1d95';
          strokeColor = '#f0abfc';
      } else if (skin === 'eco') {
          mainColor1 = '#a3e635'; mainColor2 = '#3f6212';
          windowColor = '#bae6fd'; balconyColor = '#365314';
      }

      // Si es perfecto, brilla más
      if (isPerfect) {
           mainColor1 = '#fef08a'; // Amarillo pálido universal para perfecto
      }

      // Gradiente
      const gradient = ctx.createLinearGradient(x, y, x + w, y);
      gradient.addColorStop(0, mainColor1);
      gradient.addColorStop(1, mainColor2);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, w, h);

      // Borde
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Ventanas
      ctx.fillStyle = windowColor; 
      ctx.fillRect(x + 15, y + 15, 25, 30);
      ctx.fillRect(x + w - 40, y + 15, 25, 30);
      
      // Balcón
      ctx.fillStyle = balconyColor;
      ctx.fillRect(x + 10, y + 55, w - 20, 10);
  };

  const update = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = gameRef.current;

    state.cameraY += (state.targetCameraY - state.cameraY) * CONFIG.CAMERA_SPEED;

    if (state.currentBlock.state === 'SWINGING') {
        state.time += state.swingSpeed;
        const swingRange = canvas.width / 2 - CONFIG.BLOCK_WIDTH; 
        const centerX = canvas.width / 2;
        const offsetX = Math.sin(state.time) * swingRange;
        state.currentBlock.x = centerX + offsetX - (CONFIG.BLOCK_WIDTH / 2);
        state.currentBlock.y = (CONFIG.ROPE_HEIGHT + Math.abs(Math.cos(state.time) * 15)) - state.cameraY; 
    }

    if (state.currentBlock.state === 'DROPPING') {
        state.currentBlock.y += CONFIG.GRAVITY;
        const prevBlock = state.stack[state.stack.length - 1];
        const landingY = prevBlock.y - CONFIG.BLOCK_HEIGHT;

        if (state.currentBlock.y >= landingY) {
            const overlap = (state.currentBlock.x + CONFIG.BLOCK_WIDTH > prevBlock.x + 15) && 
                            (state.currentBlock.x < prevBlock.x + CONFIG.BLOCK_WIDTH - 15);

            if (overlap) {
                state.currentBlock.state = 'LANDED';
                state.currentBlock.y = landingY;
                const centerDiff = Math.abs(state.currentBlock.x - prevBlock.x);
                let isPerfect = false;

                if (centerDiff < CONFIG.PERFECT_TOLERANCE) {
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

                if (state.stack.length > 3) state.targetCameraY += CONFIG.BLOCK_HEIGHT;
                state.swingSpeed = Math.min(0.12, CONFIG.SWING_SPEED_BASE + (state.stack.length * 0.002));
                
                // Generar nuevo bloque
                state.currentBlock = { x: canvas.width / 2, y: -100, state: 'SWINGING' };

            } else if (state.currentBlock.y > canvas.height + state.cameraY) {
                handleLifeLost(canvas);
            }
        }
    }
  };

  const handleLifeLost = (canvas: HTMLCanvasElement) => {
      if (gameRef.current.currentBlock.state === 'LANDED') return;
      gameRef.current.currentBlock.state = 'LANDED'; 
      playSound('error');
      setPerfectCombo(0);
      
      setLives(prevLives => {
          const newLives = prevLives - 1;
          if (newLives > 0) {
              gameRef.current.currentBlock = { x: canvas.width / 2, y: -100, state: 'SWINGING' };
              return newLives;
          } else {
              endGame();
              return 0;
          }
      });
  };

  const endGame = () => {
    setGameState('GAMEOVER');
    saveRankingDirectly(score); // GUARDADO SEGURO
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = gameRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fondo (varía ligeramente según skin para atmósfera)
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    if (state.skin === 'cyber') {
        gradient.addColorStop(0, '#2e1065'); gradient.addColorStop(1, '#4c1d95');
    } else if (state.skin === 'gold') {
        gradient.addColorStop(0, '#422006'); gradient.addColorStop(1, '#713f12');
    } else {
        gradient.addColorStop(0, '#0f172a'); gradient.addColorStop(1, '#334155');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(0, state.cameraY);

    // Suelo
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, canvas.height - 100 + CONFIG.BLOCK_HEIGHT, canvas.width, 200);

    // Torre
    state.stack.forEach(block => {
        drawBuildingBlock(ctx, block.x, block.y, block.perfect, false, state.skin);
    });

    if (state.currentBlock.state === 'DROPPING') {
        drawBuildingBlock(ctx, state.currentBlock.x, state.currentBlock.y, false, true, state.skin);
    }

    ctx.restore();

    // Grúa
    if (state.currentBlock.state === 'SWINGING') {
        const originX = canvas.width / 2;
        const blockDrawY = state.currentBlock.y + state.cameraY;
        ctx.beginPath();
        ctx.moveTo(originX, 0);
        ctx.lineTo(state.currentBlock.x + CONFIG.BLOCK_WIDTH/2, blockDrawY);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 4;
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

  // --- RESPONSIVE CANVAS ---
  useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas) {
          const resize = () => {
              const dpr = window.devicePixelRatio || 1;
              const rect = canvas.getBoundingClientRect();
              canvas.width = rect.width * dpr;
              canvas.height = rect.height * dpr;
              const ctx = canvas.getContext('2d');
              ctx?.scale(dpr, dpr);
          };
          window.addEventListener('resize', resize);
          resize();
          return () => window.removeEventListener('resize', resize);
      }
  }, []);

  useEffect(() => {
      requestRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(requestRef.current!);
  }, [gameState]);

  return (
    <div className="fixed inset-0 bg-slate-900 flex justify-center items-center overflow-hidden touch-none select-none">
        
        <div className="relative w-full h-[100dvh] max-w-[500px] bg-gradient-to-b from-sky-900 to-slate-900 shadow-2xl overflow-hidden flex flex-col">
            
            {/* CANVAS */}
            <div className="flex-1 relative w-full overflow-hidden">
                <canvas 
                    ref={canvasRef} 
                    className="absolute inset-0 w-full h-full cursor-pointer"
                    onPointerDown={handleTap}
                    style={{ touchAction: 'none' }}
                />
            </div>

            {/* --- HUD --- */}
            {gameState === 'PLAYING' && (
                <div className="absolute top-0 w-full p-4 flex justify-between items-start pointer-events-none z-20">
                    <button onClick={() => setGameState('MENU')} className="pointer-events-auto p-2 bg-black/40 rounded-full text-white backdrop-blur-md">
                        <ArrowLeft size={20} />
                    </button>
                    {gameMode === 'VS_AI' && <div className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-black shadow-lg">IA: {aiScore}</div>}
                    <div className="flex flex-col items-end">
                        <div className="flex gap-1 mb-2 bg-black/30 p-2 rounded-full backdrop-blur-sm">
                            {[...Array(3)].map((_, i) => (
                                <Heart key={i} size={20} className={i < lives ? "fill-red-500 text-red-500" : "text-slate-600 fill-slate-800"} />
                            ))}
                        </div>
                        <div className="text-5xl font-black text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] font-mono">{score}</div>
                    </div>
                </div>
            )}

            {/* --- MENÚ PRINCIPAL --- */}
            {gameState === 'MENU' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30 animate-in fade-in p-6 text-center">
                    <Hammer size={64} className="text-yellow-400 mb-4 animate-bounce" />
                    
                    {challengeData ? (
                        <div className="mb-6 bg-slate-800 p-6 rounded-3xl border-2 border-yellow-500 shadow-2xl w-full max-w-xs">
                            <h2 className="text-2xl font-black text-white mb-4">Reto de {challengeData.name}</h2>
                            <p className="text-3xl font-black text-white">{challengeData.target} <span className="text-xs text-yellow-500">PISOS</span></p>
                            <button onClick={() => initGame('SOLO')} className="mt-4 w-full bg-yellow-500 text-black font-black py-3 rounded-xl">ACEPTAR</button>
                        </div>
                    ) : (
                        <>
                            <h1 className="text-5xl font-black text-white italic tracking-tighter mb-1">CONSTRUCCIONES</h1>
                            <div className="w-full max-w-xs space-y-3 mt-8">
                                <button onClick={() => setGameState('MODE_SELECT')} className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-xl shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-all flex items-center justify-center gap-2">
                                    <Play fill="black" size={20}/> JUGAR AHORA
                                </button>
                                <div className="grid grid-cols-2 gap-3">
                                    <button onClick={() => setShowRanking(true)} className="bg-slate-800 text-white font-bold py-4 rounded-xl border border-slate-700 flex items-center justify-center gap-2 text-xs">
                                        <Trophy size={16} className="text-yellow-500"/> RANKING
                                    </button>
                                    <button onClick={() => setShowShop(true)} className="bg-slate-800 text-white font-bold py-4 rounded-xl border border-slate-700 flex items-center justify-center gap-2 text-xs hover:border-pink-500 transition-colors">
                                        <ShoppingBag size={16} className="text-pink-500"/> TIENDA
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                    
                    {/* PUBLICIDAD ABAJO DEL TODO */}
                    <div className="absolute bottom-0 w-full bg-black">
                        <AdSpace type="banner" />
                    </div>
                </div>
            )}

            {/* --- SELECCIÓN DE MODO --- */}
            {gameState === 'MODE_SELECT' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40 animate-in zoom-in p-6">
                    <h2 className="text-2xl font-black text-white mb-6 uppercase">Elige Modo</h2>
                    <div className="w-full max-w-xs space-y-4">
                        <button onClick={() => initGame('SOLO')} className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-600 flex items-center gap-4 hover:bg-slate-700"><Hammer size={24} className="text-yellow-400"/><div className="text-left"><div className="font-black text-white">SOLITARIO</div></div></button>
                        <button onClick={() => initGame('VS_AI')} className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-600 flex items-center gap-4 hover:bg-slate-700"><Bot size={24} className="text-red-400"/><div className="text-left"><div className="font-black text-white">VS IA</div></div></button>
                        <button onClick={() => initGame('VS_FRIEND')} className="w-full bg-slate-800 p-4 rounded-2xl border border-slate-600 flex items-center gap-4 hover:bg-slate-700"><Users size={24} className="text-green-400"/><div className="text-left"><div className="font-black text-white">RETAR AMIGO</div></div></button>
                    </div>
                    <button onClick={() => setGameState('MENU')} className="mt-8 text-slate-500 flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16}/> VOLVER</button>
                </div>
            )}

            {/* --- LOBBY MULTIJUGADOR --- */}
            {gameState === 'MULTIPLAYER_LOBBY' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40 p-6 text-center">
                    <h2 className="text-xl font-black text-white mb-2">SALA CREADA</h2>
                    <div className="bg-slate-800 p-6 rounded-3xl border border-green-500 mb-6 w-full max-w-xs">
                        <div className="text-4xl font-mono font-black text-green-400 tracking-widest">{roomCode}</div>
                    </div>
                    <button onClick={() => { setGameMode('SOLO'); setGameState('PLAYING'); }} className="text-white font-bold underline mt-4">Jugar Solo</button>
                </div>
            )}

            {/* --- TIENDA MODAL --- */}
            {showShop && (
                <div className="absolute inset-0 z-50 bg-black/95 flex flex-col p-6 animate-in slide-in-from-bottom">
                     <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-black text-white flex gap-2"><ShoppingBag className="text-pink-500"/> TIENDA</h2>
                        <button onClick={() => setShowShop(false)}><X className="text-slate-400"/></button>
                     </div>
                     <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700 mb-6 flex justify-between items-center">
                        <span className="text-slate-400 font-bold text-xs uppercase">Tus Monedas</span>
                        <span className="text-yellow-400 font-black text-xl flex gap-2 items-center"><Coins/> {userCoins}</span>
                     </div>
                     <div className="grid grid-cols-2 gap-4 overflow-y-auto pb-20">
                        {SHOP_ITEMS.map(item => {
                            const owned = inventory.includes(item.id);
                            const equipped = equippedSkin === item.id;
                            return (
                                <div key={item.id} className={`bg-slate-800 p-4 rounded-2xl border-2 flex flex-col items-center gap-3 ${equipped ? 'border-emerald-500' : 'border-slate-700'}`}>
                                    <div className="w-12 h-12 rounded shadow-lg" style={{background: item.color}}></div>
                                    <div className="text-center">
                                        <div className="text-white font-bold text-sm">{item.name}</div>
                                        {!owned && <div className="text-yellow-400 text-xs font-bold">{item.price} Monedas</div>}
                                    </div>
                                    <button 
                                        onClick={() => handleBuyOrEquip(item)}
                                        disabled={buyingItem === item.id}
                                        className={`w-full py-2 rounded-lg text-xs font-black uppercase ${equipped ? 'bg-emerald-500 text-black' : owned ? 'bg-slate-700 text-white' : 'bg-yellow-500 text-black'}`}
                                    >
                                        {equipped ? 'USANDO' : owned ? 'EQUIPAR' : 'COMPRAR'}
                                    </button>
                                </div>
                            )
                        })}
                     </div>
                </div>
            )}

            {/* --- GAME OVER --- */}
            {gameState === 'GAMEOVER' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md z-30 animate-in zoom-in duration-300 p-4">
                    <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col items-center mb-4 shadow-2xl w-full max-w-xs relative overflow-hidden">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Pisos Construidos</span>
                        <div className="text-7xl font-black text-white mb-1">{score}</div>
                        {scoreSaved && <div className="text-emerald-400 text-[10px] font-bold uppercase flex items-center gap-1"><CheckCircle size={10}/> Guardado</div>}
                    </div>

                    <div className="grid grid-cols-2 gap-3 w-full max-w-xs mb-4">
                        <button onClick={watchAdForLife} className="bg-purple-600/20 border border-purple-500/50 hover:bg-purple-600 hover:text-white text-purple-300 p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all">
                            <Video size={20}/> <span className="text-[10px] font-black uppercase">+1 VIDA</span>
                        </button>
                        <button className="bg-blue-600/20 border border-blue-500/50 hover:bg-blue-600 hover:text-white text-blue-300 p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all">
                            <Bot size={20}/> <span className="text-[10px] font-black uppercase">PISTA</span>
                        </button>
                    </div>

                    <div className="flex gap-3 w-full max-w-xs">
                        <Link href="/" className="bg-slate-700 text-white p-3 rounded-xl flex-1 flex justify-center items-center"><Home size={24}/></Link>
                        <button onClick={() => initGame(gameMode)} className="bg-yellow-500 text-black font-black py-3 px-6 rounded-xl flex-[2] flex items-center justify-center gap-2 hover:scale-105 transition-transform"><RotateCcw size={20} /> OTRA VEZ</button>
                    </div>

                    {/* PUBLICIDAD ABAJO DEL TODO */}
                    <div className="absolute bottom-0 w-full bg-black">
                        <AdSpace type="banner" />
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