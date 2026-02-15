// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Heart, Play, X, Trophy, Users, 
  ShoppingBag, Coins, Home, Repeat, Loader2
} from 'lucide-react';
import { useEconomy } from '@/contexts/EconomyContext'; 
import { useAudio } from '@/contexts/AudioContext'; 

// --- FIREBASE IMPORTS ---
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// --- CONFIGURACIÓN ---
const BLOCK_HEIGHT = 50;     
const INITIAL_WIDTH = 250;   
const SPAWN_HEIGHT = 500;
const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444'];
const MOCK_SHOP = [
    { id: 1, name: 'Skin Metálica', price: 500, color: '#64748b' },
    { id: 2, name: 'Pack Neón Puro', price: 1200, color: '#ec4899' },
];

// --- COMPONENTE MODAL ---
const ModalContainer = ({ title, icon: Icon, onClose, children, headerColor = "text-white" }: any) => (
    <div className="absolute inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 animate-in zoom-in-95">
        <div className="bg-[#0f172a] border border-slate-700 p-6 rounded-3xl w-full max-w-sm shadow-2xl relative flex flex-col max-h-[85dvh]">
            <div className="flex justify-between items-center mb-4 shrink-0 pb-4 border-b border-slate-800">
                <h2 className={`text-xl font-black ${headerColor} flex items-center gap-2 uppercase italic tracking-wider`}>
                    <Icon size={24} /> {title}
                </h2>
                <button onClick={onClose} className="bg-slate-800 p-2 rounded-full text-slate-400 hover:text-white transition"><X size={20}/></button>
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
  const [activeBlock, setActiveBlock] = useState({ width: INITIAL_WIDTH, x: 0, y: SPAWN_HEIGHT, direction: 1, color: COLORS[0] });
  const [cameraY, setCameraY] = useState(0);
  const [isDropping, setIsDropping] = useState(false);
  
  // DATOS REALES
  const [user, setUser] = useState<any>(null);
  const [userNickname, setUserNickname] = useState(''); 
  const [rankingData, setRankingData] = useState<any[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(false);

  // MODALES
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);

  // MULTIJUGADOR
  const [roomCode, setRoomCode] = useState('');

  // REFS
  const moveInterval = useRef<NodeJS.Timeout | null>(null);
  const dropInterval = useRef<NodeJS.Timeout | null>(null);
  const speedRef = useRef(20); 
  const { playSound } = useAudio();
  const { coins } = useEconomy();

  // --- 1. CARGAR USUARIO Y APODO ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        try {
            const userDoc = await getDoc(doc(db, "users", u.uid));
            if (userDoc.exists() && userDoc.data().nickname) {
                setUserNickname(userDoc.data().nickname);
            } else {
                setUserNickname(u.displayName || 'Anónimo');
            }
        } catch (error) {
            console.error("Error cargando apodo:", error);
            setUserNickname(u.displayName || 'Anónimo');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 2. CARGAR RANKING (TOP 5) ---
  const fetchRanking = async () => {
    setLoadingRanking(true);
    try {
        // AQUI ESTÁ EL CAMBIO: limit(5)
        const q = query(collection(db, "scores_stack"), orderBy("score", "desc"), limit(5));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => doc.data());
        setRankingData(data);
    } catch (error) {
        console.error("Error cargando ranking:", error);
    } finally {
        setLoadingRanking(false);
    }
  };

  useEffect(() => {
    if (showRankingModal) fetchRanking();
  }, [showRankingModal]);

  // --- 3. GUARDAR PUNTUACIÓN ---
  const saveScoreToFirebase = async (finalScore: number) => {
    if (!user || finalScore === 0) return; 
    const nameToSave = userNickname || user.displayName || 'Jugador';

    try {
        await addDoc(collection(db, "scores_stack"), {
            uid: user.uid,
            name: nameToSave,
            score: finalScore,
            photo: user.photoURL || null,
            date: serverTimestamp()
        });
    } catch (e) {
        console.error("Error guardando score:", e);
    }
  };

  // --- LÓGICA DE JUEGO ---
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
    const nextColor = COLORS[Math.floor(currentStackHeight / BLOCK_HEIGHT) % COLORS.length];
    setActiveBlock({
      width: width, x: -150, y: currentStackHeight + SPAWN_HEIGHT, direction: 1, color: nextColor
    });
    setIsDropping(false);
  };

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

  const handleLifeLost = () => {
    if (lives > 1) {
        setLives(l => l - 1);
        const lastValid = stack[stack.length - 1];
        spawnNewBlock(lastValid.width, lastValid.y);
    } else {
        saveScoreToFirebase(score); 
        setGameState('GAMEOVER');
    }
  };

  const createRoom = () => {
    setRoomCode('VS-' + Math.floor(1000 + Math.random() * 9000));
    setGameState('MULTIPLAYER');
  };

  // --- RENDER ---
  return (
    <div className="h-[100dvh] w-full bg-black flex items-center justify-center font-sans overflow-hidden select-none touch-none">
      
      <div className="relative w-full max-w-md h-full md:h-[90vh] md:rounded-3xl md:border-4 border-slate-800 bg-[#0b1120] overflow-hidden flex flex-col shadow-2xl">
        
        {/* FONDO */}
        <div className="absolute inset-0 z-0">
            <div className="absolute top-0 w-full h-1/2 bg-gradient-to-b from-[#0b1120] to-transparent z-10"></div>
            <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-[#0b1120] to-transparent z-10"></div>
            <div className="absolute inset-0 opacity-20" 
                 style={{ 
                     backgroundImage: `linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)`, 
                     backgroundSize: '40px 40px',
                 }}>
            </div>
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
            <div 
                className="absolute bottom-0 w-full flex items-center justify-center transition-transform duration-500 ease-out"
                style={{ height: '100%', transform: `translateY(${cameraY}px)` }}
            >
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
                <div className="relative mb-10 flex flex-col items-center">
                    <div className="text-[100px] leading-none font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-emerald-600 drop-shadow-2xl">
                        {score}
                    </div>
                    <div className="bg-emerald-600 text-black font-black text-xs px-3 py-1 rounded-full uppercase tracking-widest mt-2">
                        PISOS COMPLETADOS
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

                 <h1 className="text-6xl font-black text-white italic tracking-tighter mb-8 drop-shadow-[0_0_20px_#10b981]">
                    BLOQUES
                </h1>
                <div className="flex flex-col gap-4 w-full max-w-xs">
                    <button onClick={startGame} className="bg-emerald-500 text-black font-black text-xl py-5 rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:scale-105 transition-transform flex items-center justify-center gap-3">
                        <Play size={28} fill="black" /> JUGAR SOLO
                    </button>
                    <button onClick={createRoom} className="bg-slate-800 text-white font-bold py-4 rounded-2xl border border-slate-700 hover:bg-slate-700 transition-all flex items-center justify-center gap-3">
                        <Users size={22} className="text-blue-400"/> CREAR SALA VS
                    </button>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                        <button onClick={() => setShowRankingModal(true)} className="bg-slate-900/80 text-slate-300 font-bold py-4 rounded-xl border border-slate-700 flex items-center justify-center gap-2 text-xs hover:border-yellow-500 transition-colors">
                            <Trophy size={16}/> RANKING REAL
                        </button>
                        <button onClick={() => setShowShopModal(true)} className="bg-slate-900/80 text-slate-300 font-bold py-4 rounded-xl border border-slate-700 flex items-center justify-center gap-2 text-xs hover:border-pink-500 transition-colors">
                            <ShoppingBag size={16}/> TIENDA
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL RANKING REAL (TOP 5) */}
        {showRankingModal && (
            <ModalContainer title="TOP 5 GLOBAL" icon={Trophy} onClose={() => setShowRankingModal(false)} headerColor="text-yellow-400">
                {loadingRanking ? (
                    <div className="flex justify-center p-8"><Loader2 className="animate-spin text-yellow-400"/></div>
                ) : (
                    <div className="space-y-3 pb-4">
                        {rankingData.length === 0 ? (
                            <p className="text-slate-500 text-center py-4">Aún no hay récords.</p>
                        ) : (
                            rankingData.map((p, i) => (
                                <div key={i} className={`flex justify-between items-center p-3 rounded-xl border transition-all ${i===0 ? 'bg-yellow-900/20 border-yellow-500/50 scale-105 mb-2' : 'bg-slate-800/50 border-slate-700'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black ${i===0 ? 'bg-yellow-500 text-black' : 'bg-slate-700 text-slate-400'}`}>
                                            #{i+1}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={`font-bold text-sm uppercase ${i===0 ? 'text-yellow-400' : 'text-white'}`}>
                                                {p.name || 'ANÓNIMO'}
                                            </span>
                                            <span className="text-[10px] text-slate-500">
                                                {p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString() : 'Hoy'}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-emerald-400 font-black text-lg">{p.score}</span>
                                </div>
                            ))
                        )}
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

        {/* MODAL TIENDA */}
        {showShopModal && (
             <ModalContainer title="Tienda" icon={ShoppingBag} onClose={() => setShowShopModal(false)} headerColor="text-pink-400">
                <div className="flex justify-between mb-4 bg-slate-900 p-2 rounded-lg">
                    <span className="text-slate-400 text-xs">Saldo:</span>
                    <span className="text-yellow-400 font-bold flex gap-1 items-center"><Coins size={12}/> {coins}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pb-4">
                    {MOCK_SHOP.map((item) => (
                        <div key={item.id} className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col items-center gap-2 hover:border-pink-500 transition-colors">
                            <div className="w-8 h-8 rounded shadow-lg" style={{background: item.color}}></div>
                            <span className="text-xs text-white font-bold">{item.name}</span>
                            <button className="text-[10px] bg-black px-2 py-1 rounded text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500 hover:text-black transition-colors">{item.price}</button>
                        </div>
                    ))}
                </div>
             </ModalContainer>
        )}
      </div>
    </div>
  );
}