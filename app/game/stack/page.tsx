// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Heart, Play, X, Trophy, Users, 
  ShoppingBag, Coins, Home, Repeat, Loader2, Lock, Check, AlertCircle
} from 'lucide-react';
import { useEconomy } from '@/contexts/EconomyContext'; 
import { useAudio } from '@/contexts/AudioContext'; 

// --- FIREBASE ---
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// --- CONFIGURACIÓN ---
const BLOCK_HEIGHT = 50;     
const INITIAL_WIDTH = 250;   
const SPAWN_HEIGHT = 500;

// DEFINICIÓN DE ITEMS DE LA TIENDA
const SHOP_ITEMS = [
    { id: 'neon_classic', name: 'Neón Clásico', price: 0, color: '#10b981', type: 'skin' }, // Skin por defecto
    { id: 'metal_skin', name: 'Acero Puro', price: 500, color: '#94a3b8', type: 'skin' },
    { id: 'gold_skin', name: 'Oro Real', price: 1000, color: '#fbbf24', type: 'skin' },
    { id: 'cyber_punk', name: 'Cyber Pink', price: 250, color: '#ec4899', type: 'skin' },
];

const COLORS_DEFAULT = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444'];

// --- COMPONENTE MODAL ---
const ModalContainer = ({ title, icon: Icon, onClose, children, headerColor = "text-white" }: any) => (
    <div className="absolute inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 animate-in zoom-in-95">
        <div className="bg-[#0f172a] border border-slate-700 p-6 rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden flex flex-col max-h-[85dvh]">
            <div className="flex justify-between items-center mb-4 shrink-0 pb-4 border-b border-slate-800">
                <h2 className={`text-xl font-black ${headerColor} flex items-center gap-2 uppercase italic tracking-wider`}>
                    <Icon size={24} /> {title}
                </h2>
                <button onClick={onClose}><X size={24} className="text-slate-400 hover:text-white"/></button>
            </div>
            <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 min-h-0">
                {children}
            </div>
        </div>
    </div>
);

export default function BloquesPro() {
  // --- ESTADOS ---
  const [gameState, setGameState] = useState<'MENU' | 'PLAYING' | 'GAMEOVER' | 'MULTIPLAYER'>('MENU');
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [stack, setStack] = useState<any[]>([]);
  // Usamos un color por defecto inicial, luego se sobrescribe con la skin
  const [activeBlock, setActiveBlock] = useState({ width: INITIAL_WIDTH, x: 0, y: SPAWN_HEIGHT, direction: 1, color: '#10b981' });
  const [cameraY, setCameraY] = useState(0);
  const [isDropping, setIsDropping] = useState(false);
  
  // DATOS REALES USUARIO
  const [user, setUser] = useState<any>(null);
  const [userNickname, setUserNickname] = useState('');
  const [rankingData, setRankingData] = useState<any[]>([]);
  
  // ECONOMÍA Y TIENDA
  const [userCoins, setUserCoins] = useState(0);
  const [inventory, setInventory] = useState<string[]>(['neon_classic']); // Skins compradas
  const [equippedSkin, setEquippedSkin] = useState('neon_classic'); // Skin actual
  const [buyingItem, setBuyingItem] = useState<string | null>(null); // Loading de compra

  // MODALES
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  // REFS
  const moveInterval = useRef<NodeJS.Timeout | null>(null);
  const dropInterval = useRef<NodeJS.Timeout | null>(null);
  const speedRef = useRef(20); 
  const { playSound } = useAudio();
  // const { coins } = useEconomy(); // Ya no usamos el contexto global aquí para forzar la lectura en tiempo real de Firebase

  // --- 1. CARGA INICIAL ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        try {
            const userRef = doc(db, "users", u.uid);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const data = userSnap.data();
                setUserNickname(data.nickname || u.displayName || 'Anónimo');
                setUserCoins(data.coins || 0); // Cargar monedas
                if (data.inventory) setInventory(data.inventory); // Cargar inventario
                if (data.equippedStackSkin) setEquippedSkin(data.equippedStackSkin); // Cargar skin equipada
            } else {
                // Crear perfil básico si no existe
                setUserNickname(u.displayName || 'Anónimo');
                setUserCoins(100); // Regalo de bienvenida
            }
        } catch (error) {
            console.error("Error cargando perfil:", error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 2. LÓGICA DE TIENDA (COMPRA Y EQUIPAR) ---
  const handleBuyOrEquip = async (item: any) => {
      if (!user) return alert("Inicia sesión para comprar.");

      // CASO A: YA LO TENGO -> EQUIPAR
      if (inventory.includes(item.id)) {
          setEquippedSkin(item.id);
          playSound('click');
          // Guardar equipación en Firebase
          await updateDoc(doc(db, "users", user.uid), { equippedStackSkin: item.id });
          return;
      }

      // CASO B: NO LO TENGO -> COMPRAR
      if (userCoins >= item.price) {
          setBuyingItem(item.id);
          try {
              const userRef = doc(db, "users", user.uid);
              // Transacción atómica: restar monedas y añadir item
              await updateDoc(userRef, {
                  coins: userCoins - item.price,
                  inventory: arrayUnion(item.id)
              });
              
              // Actualizar estado local
              setUserCoins(prev => prev - item.price);
              setInventory(prev => [...prev, item.id]);
              setEquippedSkin(item.id); // Equipar automáticamente al comprar
              playSound('success');
          } catch (e) {
              console.error("Error en compra:", e);
              alert("Error en la transacción.");
          } finally {
              setBuyingItem(null);
          }
      } else {
          playSound('error');
          alert("¡No tienes suficientes monedas! Juega más para ganar.");
      }
  };

  // --- 3. FUNCIONES DE JUEGO (ADAPTADAS A SKINS) ---
  
  // Obtener color actual basado en la skin equipada
  const getCurrentColor = (scoreLevel: number) => {
      const skin = SHOP_ITEMS.find(i => i.id === equippedSkin);
      if (!skin) return COLORS_DEFAULT[scoreLevel % COLORS_DEFAULT.length];
      
      // Si es "neon_classic", usamos el arcoiris normal
      if (skin.id === 'neon_classic') return COLORS_DEFAULT[scoreLevel % COLORS_DEFAULT.length];
      
      // Si es una skin comprada (ej: oro), usamos su color fijo o variante
      return skin.color; 
  };

  const startGame = () => {
    const baseBlock = { width: 360, x: 0, y: 0, color: '#334155', isBase: true };
    setStack([baseBlock]);
    setScore(0);
    setLives(3);
    setCameraY(0);
    speedRef.current = 20; 
    setIsDropping(false);
    spawnNewBlock(INITIAL_WIDTH, 0);
    setGameState('PLAYING');
  };

  const spawnNewBlock = (width: number, currentStackHeight: number) => {
    // Calculamos el color basado en la skin actual y el score (para el efecto arcoiris si aplica)
    // Nota: score es 0 al inicio, pero usamos una variable local o el stack length
    const level = Math.floor(currentStackHeight / BLOCK_HEIGHT);
    const nextColor = getCurrentColor(level);

    setActiveBlock({
      width: width, x: -150, y: currentStackHeight + SPAWN_HEIGHT, direction: 1, color: nextColor
    });
    setIsDropping(false);
  };

  const handleImpact = (currentX: number, landingY: number) => {
    const lastBlock = stack[stack.length - 1];
    const delta = currentX - lastBlock.x;
    const overlap = lastBlock.width - Math.abs(delta);

    if (overlap > 5) {
        playSound('pop');
        const newBlock = { width: overlap, x: lastBlock.x + delta / 2, y: landingY, color: activeBlock.color };
        const newStack = [...stack, newBlock];
        setStack(newStack);
        setScore(s => s + 1);
        
        if (newStack.length > 4) {
             const targetCam = (newStack.length * BLOCK_HEIGHT) - 200;
             setCameraY(targetCam);
        }
        if (score > 0 && score % 5 === 0) speedRef.current = Math.max(5, speedRef.current - 2);
        spawnNewBlock(overlap, landingY);
    } else {
        playSound('error');
        handleLifeLost();
    }
  };

  // ... (RESTO DE LÓGICA DE JUEGO IGUAL: moveInterval, dropInterval, useEffects...)
  useEffect(() => {
    if (gameState !== 'PLAYING' || isDropping) return;
    moveInterval.current = setInterval(() => {
      setActiveBlock((prev) => {
        let newX = prev.x + (4 * prev.direction);
        if (newX > 160 || newX < -160) return { ...prev, x: prev.x, direction: prev.direction * -1 };
        return { ...prev, x: newX };
      });
    }, speedRef.current);
    return () => clearInterval(moveInterval.current as NodeJS.Timeout);
  }, [gameState, isDropping]);

  useEffect(() => {
    if (!isDropping || gameState !== 'PLAYING') return;
    dropInterval.current = setInterval(() => {
      setActiveBlock((prev) => {
        const targetY = stack.length * BLOCK_HEIGHT;
        const nextY = prev.y - 35; 
        if (nextY <= targetY) {
            clearInterval(dropInterval.current as NodeJS.Timeout);
            handleImpact(prev.x, targetY);
            return { ...prev, y: targetY }; 
        }
        return { ...prev, y: nextY };
      });
    }, 10);
    return () => clearInterval(dropInterval.current as NodeJS.Timeout);
  }, [isDropping, stack]);

  // --- GUARDADO DE SCORE + RECOMPENSA DE MONEDAS ---
  const handleLifeLost = async () => {
    if (lives > 1) {
        setLives(l => l - 1);
        const lastValid = stack[stack.length - 1];
        spawnNewBlock(lastValid.width, lastValid.y);
    } else {
        // --- GAME OVER ---
        setGameState('GAMEOVER');
        
        if (user && score > 0) {
            // 1. Guardar Score
            const nameToSave = userNickname || 'Jugador';
            addDoc(collection(db, "scores_stack"), {
                uid: user.uid, name: nameToSave, score: score, photo: user.photoURL, date: serverTimestamp()
            });

            // 2. Dar Monedas (1 punto = 1 moneda, por ejemplo)
            const coinsEarned = Math.floor(score / 2) + 1; // Fórmula simple
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, { coins: userCoins + coinsEarned });
            setUserCoins(c => c + coinsEarned); // Actualizar local
            console.log(`Ganaste ${coinsEarned} monedas`);
        }
    }
  };

  const fetchRanking = async () => {
    setLoadingRanking(true);
    try {
        const q = query(collection(db, "scores_stack"), orderBy("score", "desc"), limit(5));
        const snap = await getDocs(q);
        setRankingData(snap.docs.map(d => d.data()));
    } catch (e) { console.error(e); } finally { setLoadingRanking(false); }
  };
  useEffect(() => { if (showRankingModal) fetchRanking(); }, [showRankingModal]);

  const createRoom = () => { setRoomCode('VS-' + Math.floor(Math.random() * 9000)); setGameState('MULTIPLAYER'); };

  // --- RENDER ---
  return (
    <div className="h-[100dvh] w-full bg-black flex items-center justify-center font-sans overflow-hidden select-none touch-none">
      <div className="relative w-full max-w-md h-full md:h-[90vh] md:rounded-3xl md:border-4 border-slate-800 bg-[#0b1120] overflow-hidden flex flex-col shadow-2xl">
        
        {/* FONDO */}
        <div className="absolute inset-0 z-0">
            <div className="absolute top-0 w-full h-1/2 bg-gradient-to-b from-[#0b1120] to-transparent z-10"></div>
            <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-[#0b1120] to-transparent z-10"></div>
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)`, backgroundSize: '40px 40px' }}></div>
        </div>

        {/* BORDES NEÓN */}
        <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500/30 z-20"></div>
        <div className="absolute inset-y-0 right-0 w-1 bg-emerald-500/30 z-20"></div>

        {/* HUD */}
        {gameState === 'PLAYING' && (
            <div className="absolute top-0 left-0 right-0 p-4 z-40 flex justify-between items-start pointer-events-none">
                <button onClick={() => setGameState('MENU')} className="pointer-events-auto bg-black/50 backdrop-blur-md p-2 rounded-xl border border-white/10 text-white hover:bg-white/10 transition">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-1">
                        {[...Array(3)].map((_, i) => (
                        <Heart key={i} size={20} className={`${i < lives ? 'fill-rose-500 text-rose-500' : 'text-slate-800'}`} />
                        ))}
                    </div>
                    <span className="text-white font-mono text-xl font-bold drop-shadow-md">{score}</span>
                </div>
            </div>
        )}

        {/* JUEGO */}
        <div 
            className="relative w-full flex-1 cursor-pointer overflow-hidden z-10"
            onClick={() => !isDropping && gameState === 'PLAYING' && setIsDropping(true)}
        >
            <div className="absolute bottom-0 w-full flex items-center justify-center transition-transform duration-500 ease-out" style={{ height: '100%', transform: `translateY(${cameraY}px)` }}>
                <div className="absolute bottom-0 w-full h-1 bg-emerald-500 shadow-[0_0_20px_#10b981]"></div>
                {stack.map((block, i) => (
                    <div key={i} className="absolute bottom-0 shadow-lg transition-all"
                        style={{
                            width: `${block.width}px`, height: `${BLOCK_HEIGHT}px`, backgroundColor: block.color,
                            bottom: `${block.y}px`, transform: `translateX(${block.x}px)`, borderRadius: '3px',
                            boxShadow: `inset 0 0 10px rgba(0,0,0,0.5)`, borderTop: '1px solid rgba(255,255,255,0.3)', zIndex: 10
                        }}
                    ></div>
                ))}
                {gameState === 'PLAYING' && (
                    <div className="absolute bottom-0 z-20"
                        style={{
                            width: `${activeBlock.width}px`, height: `${BLOCK_HEIGHT}px`, backgroundColor: activeBlock.color,
                            bottom: `${activeBlock.y}px`, transform: `translateX(${activeBlock.x}px)`, borderRadius: '3px',
                            border: '2px solid white', boxShadow: '0 0 20px rgba(255,255,255,0.5)'
                        }}
                    ></div>
                )}
            </div>
        </div>

        {/* GAME OVER */}
        {gameState === 'GAMEOVER' && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-in zoom-in">
                <h2 className="text-4xl font-black text-white italic uppercase mb-4 tracking-widest">FIN</h2>
                <div className="relative mb-6 flex flex-col items-center">
                    <div className="text-[100px] leading-none font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-emerald-600 drop-shadow-2xl">{score}</div>
                    <div className="bg-emerald-600 text-black font-black text-xs px-3 py-1 rounded-full uppercase tracking-widest mt-2">PISOS</div>
                </div>
                <div className="bg-slate-900/80 p-4 rounded-xl border border-yellow-500/30 mb-6 flex items-center gap-3">
                    <Coins className="text-yellow-400 animate-pulse" />
                    <div>
                        <p className="text-xs text-slate-400 uppercase font-bold">Recompensa</p>
                        <p className="text-white font-black text-lg">+{Math.floor(score/2) + 1} Monedas</p>
                    </div>
                </div>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button onClick={startGame} className="w-full bg-white text-black font-black py-4 rounded-xl flex items-center justify-center gap-2 hover:scale-105 transition-transform">
                        <Repeat size={24} className="text-black"/> REINTENTAR
                    </button>
                    <button onClick={() => setGameState('MENU')} className="w-full bg-slate-800 text-white font-bold py-4 rounded-xl border border-slate-700">
                       <Home size={20}/> SALIR
                    </button>
                </div>
            </div>
        )}

        {/* MENÚ PRINCIPAL */}
        {gameState === 'MENU' && !showRankingModal && !showShopModal && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-6">
                 <Link href="/" className="absolute top-6 left-6 p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-emerald-500 transition-all text-slate-400 hover:text-white z-50">
                    <ArrowLeft size={24} />
                 </Link>
                 <h1 className="text-6xl font-black text-white italic tracking-tighter mb-8 drop-shadow-[0_0_20px_#10b981]">BLOQUES</h1>
                 <div className="flex flex-col gap-4 w-full max-w-xs">
                    <button onClick={startGame} className="bg-emerald-500 text-black font-black text-xl py-5 rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:scale-105 transition-transform flex items-center justify-center gap-3">
                        <Play size={28} fill="black" /> JUGAR SOLO
                    </button>
                    <button onClick={createRoom} className="bg-slate-800 text-white font-bold py-4 rounded-2xl border border-slate-700 hover:bg-slate-700 transition-all flex items-center justify-center gap-3">
                        <Users size={22} className="text-blue-400"/> CREAR SALA VS
                    </button>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                        <button onClick={() => setShowRankingModal(true)} className="bg-slate-900/80 text-slate-300 font-bold py-4 rounded-xl border border-slate-700 flex items-center justify-center gap-2 text-xs hover:border-yellow-500 transition-colors">
                            <Trophy size={16}/> RANKING
                        </button>
                        <button onClick={() => setShowShopModal(true)} className="bg-slate-900/80 text-slate-300 font-bold py-4 rounded-xl border border-slate-700 flex items-center justify-center gap-2 text-xs hover:border-pink-500 transition-colors">
                            <ShoppingBag size={16}/> TIENDA
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL RANKING */}
        {showRankingModal && (
            <ModalContainer title="TOP 5 GLOBAL" icon={Trophy} onClose={() => setShowRankingModal(false)} headerColor="text-yellow-400">
                {loadingRanking ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-yellow-400"/></div> : (
                    <div className="space-y-3 pb-4">
                        {rankingData.length === 0 ? <p className="text-slate-500 text-center py-4">Aún no hay récords.</p> : rankingData.map((p, i) => (
                            <div key={i} className={`flex justify-between items-center p-3 rounded-xl border transition-all ${i===0 ? 'bg-yellow-900/20 border-yellow-500/50 scale-105 mb-2' : 'bg-slate-800/50 border-slate-700'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black ${i===0 ? 'bg-yellow-500 text-black' : 'bg-slate-700 text-slate-400'}`}>#{i+1}</div>
                                    <div className="flex flex-col">
                                        <span className={`font-bold text-sm uppercase ${i===0 ? 'text-yellow-400' : 'text-white'}`}>{p.name || 'ANÓNIMO'}</span>
                                        <span className="text-[10px] text-slate-500">{p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString() : 'Hoy'}</span>
                                    </div>
                                </div>
                                <span className="text-emerald-400 font-black text-lg">{p.score}</span>
                            </div>
                        ))}
                    </div>
                )}
            </ModalContainer>
        )}

        {/* MODAL MULTIJUGADOR */}
        {gameState === 'MULTIPLAYER' && (
             <ModalContainer title="Sala Privada" icon={Users} onClose={() => setGameState('MENU')}>
                <div className="bg-black/40 p-6 rounded-2xl border-2 border-dashed border-slate-600 mb-6 text-center">
                    <span className="text-4xl font-mono font-black text-white tracking-widest block">{roomCode}</span>
                </div>
                <button className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl animate-pulse">Esperando...</button>
             </ModalContainer>
        )}

        {/* MODAL TIENDA FUNCIONAL */}
        {showShopModal && (
             <ModalContainer title="Tienda" icon={ShoppingBag} onClose={() => setShowShopModal(false)} headerColor="text-pink-400">
                <div className="flex justify-between mb-4 bg-slate-900 p-3 rounded-xl border border-slate-700">
                    <span className="text-slate-400 text-xs font-bold uppercase">Tu Saldo:</span>
                    <span className="text-yellow-400 font-black flex gap-2 items-center text-lg"><Coins size={18}/> {userCoins}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pb-4">
                    {SHOP_ITEMS.map((item) => {
                        const isOwned = inventory.includes(item.id);
                        const isEquipped = equippedSkin === item.id;
                        return (
                            <div key={item.id} className={`bg-slate-800 p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${isEquipped ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-slate-700'}`}>
                                <div className="w-12 h-8 rounded shadow-lg mb-1" style={{background: item.color}}></div>
                                <span className="text-xs text-white font-bold text-center leading-tight">{item.name}</span>
                                
                                <button 
                                    onClick={() => handleBuyOrEquip(item)}
                                    disabled={buyingItem === item.id}
                                    className={`text-[10px] w-full py-2 rounded font-black uppercase transition-all flex justify-center items-center gap-1
                                        ${isEquipped 
                                            ? 'bg-emerald-500 text-black cursor-default' 
                                            : isOwned 
                                                ? 'bg-slate-700 text-white hover:bg-slate-600' 
                                                : userCoins >= item.price 
                                                    ? 'bg-yellow-500 text-black hover:scale-105 hover:shadow-lg' 
                                                    : 'bg-slate-900 text-slate-500 opacity-50 cursor-not-allowed'
                                        }`}
                                >
                                    {buyingItem === item.id ? <Loader2 size={12} className="animate-spin"/> : 
                                     isEquipped ? <><Check size={12}/> EN USO</> : 
                                     isOwned ? 'EQUIPAR' : 
                                     item.price === 0 ? 'GRATIS' : item.price}
                                </button>
                            </div>
                        );
                    })}
                </div>
             </ModalContainer>
        )}
      </div>
    </div>
  );
}