// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Play, RotateCcw, Trophy, Hammer, Heart, Share2, MessageCircle, Home, CheckCircle } from 'lucide-react';
import { useAudio } from '@/contexts/AudioContext'; 
import { saveGameScore } from '@/lib/gameUtils';
import GameRanking from '@/components/GameRanking';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

// --- CONFIGURACIÓN FÍSICA ---
const CONFIG = {
    BLOCK_WIDTH: 100,
    BLOCK_HEIGHT: 80,
    GRAVITY: 10, // Un poco más rápido para que se sienta mejor
    SWING_SPEED_BASE: 0.035, 
    ROPE_HEIGHT: 150, 
    PERFECT_TOLERANCE: 12, // Un poco más permisivo
    CAMERA_SPEED: 0.1 
};

function GameContent() {
  const searchParams = useSearchParams();
  const [gameState, setGameState] = useState<'MENU' | 'PLAYING' | 'GAMEOVER'>('MENU');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [showRanking, setShowRanking] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userNickname, setUserNickname] = useState('');
  const [perfectCombo, setPerfectCombo] = useState(0);
  const [scoreSaved, setScoreSaved] = useState(false);

  // --- MODO RETO ---
  const [challengeData, setChallengeData] = useState<{name: string, target: number} | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const { playSound } = useAudio();

  // ESTADO INTERNO DEL JUEGO
  const gameRef = useRef({
    time: 0,
    cameraY: 0,
    targetCameraY: 0,
    swingSpeed: CONFIG.SWING_SPEED_BASE,
    currentBlock: { x: 0, y: 0, state: 'SWINGING' as 'SWINGING' | 'DROPPING' | 'LANDED' },
    stack: [] as { x: number, y: number, perfect: boolean }[] 
  });

  // 1. CARGAR USUARIO Y DETECTAR RETO
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        try {
            const docSnap = await getDoc(doc(db, "users", u.uid));
            if (docSnap.exists() && docSnap.data().nickname) {
                setUserNickname(docSnap.data().nickname);
            } else {
                setUserNickname(u.displayName || 'Jugador');
            }
        } catch (e) { setUserNickname('Jugador'); }
      }
    });

    const challenger = searchParams.get('challenger');
    const target = searchParams.get('target');
    
    if (challenger && target) {
        setChallengeData({
            name: challenger,
            target: parseInt(target)
        });
    }

    return () => unsub();
  }, [searchParams]);

  // --- REINICIAR JUEGO ---
  const initGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setScore(0);
    setLives(3); // Reiniciar vidas
    setPerfectCombo(0);
    setScoreSaved(false);
    
    const centerX = canvas.width / 2;
    const groundY = canvas.height - 100;

    gameRef.current = {
        time: 0,
        cameraY: 0,
        targetCameraY: 0,
        swingSpeed: CONFIG.SWING_SPEED_BASE,
        currentBlock: { x: centerX, y: 100, state: 'SWINGING' },
        stack: [{ x: centerX - CONFIG.BLOCK_WIDTH/2, y: groundY, perfect: true }] 
    };
    
    setGameState('PLAYING');
  };

  // --- DIBUJAR EDIFICIO ---
  const drawBuildingBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, isPerfect: boolean, isMoving: boolean) => {
      const w = CONFIG.BLOCK_WIDTH;
      const h = CONFIG.BLOCK_HEIGHT;

      if (!isMoving) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + 10, y + 10, w, h);
      }

      const gradient = ctx.createLinearGradient(x, y, x + w, y);
      if (isPerfect) {
          gradient.addColorStop(0, '#fef08a'); 
          gradient.addColorStop(1, '#eab308');
      } else {
          gradient.addColorStop(0, '#f1f5f9'); 
          gradient.addColorStop(1, '#94a3b8');
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Ventanas
      ctx.fillStyle = '#0ea5e9'; 
      ctx.fillRect(x + 15, y + 15, 25, 30);
      ctx.fillRect(x + w - 40, y + 15, 25, 30);
      
      // Balcón
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + 10, y + 55, w - 20, 10);

      if (isPerfect) {
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
      }
  };

  // --- LOOP PRINCIPAL ---
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
            const fallingLeft = state.currentBlock.x;
            const fallingRight = state.currentBlock.x + CONFIG.BLOCK_WIDTH;
            const targetLeft = prevBlock.x;
            const targetRight = prevBlock.x + CONFIG.BLOCK_WIDTH;
            const overlap = (fallingRight > targetLeft + 15) && (fallingLeft < targetRight - 15);

            if (overlap) {
                state.currentBlock.state = 'LANDED';
                state.currentBlock.y = landingY;
                
                const centerDiff = Math.abs(state.currentBlock.x - prevBlock.x);
                let isPerfect = false;

                if (centerDiff < CONFIG.PERFECT_TOLERANCE) {
                    state.currentBlock.x = prevBlock.x; // SNAP
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

                if (state.stack.length > 3) {
                    state.targetCameraY += CONFIG.BLOCK_HEIGHT;
                }

                // Aumentar dificultad
                state.swingSpeed = Math.min(0.12, CONFIG.SWING_SPEED_BASE + (state.stack.length * 0.002));
                spawnNewBlock(canvas);

            } else if (state.currentBlock.y > canvas.height + state.cameraY) {
                handleLifeLost(canvas);
            }
        }
    }
  };

  const spawnNewBlock = (canvas: HTMLCanvasElement) => {
      const state = gameRef.current;
      state.currentBlock = { x: canvas.width / 2, y: -100, state: 'SWINGING' };
  };

  const handleLifeLost = (canvas: HTMLCanvasElement) => {
      // Prevenir que se reste vida múltiple veces en el mismo frame
      if (gameRef.current.currentBlock.state === 'LANDED') return;
      gameRef.current.currentBlock.state = 'LANDED'; // Marcar como procesado

      playSound('error');
      setPerfectCombo(0);
      
      // Restar vida
      setLives(prevLives => {
          const newLives = prevLives - 1;
          if (newLives > 0) {
              spawnNewBlock(canvas);
              return newLives;
          } else {
              endGame();
              return 0;
          }
      });
  };

  const endGame = () => {
    setGameState('GAMEOVER');
    if (user) {
        saveGameScore(user.uid, 'towerbloxx', score);
        setScoreSaved(true);
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = gameRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0f172a'); 
    gradient.addColorStop(1, '#334155');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(0, state.cameraY);

    // Suelo
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, canvas.height - 100 + CONFIG.BLOCK_HEIGHT, canvas.width, 200);
    ctx.fillStyle = '#22c55e'; // Césped
    ctx.fillRect(0, canvas.height - 100 + CONFIG.BLOCK_HEIGHT, canvas.width, 15);

    // Torre
    state.stack.forEach(block => {
        drawBuildingBlock(ctx, block.x, block.y, block.perfect, false);
    });

    if (state.currentBlock.state === 'DROPPING') {
        drawBuildingBlock(ctx, state.currentBlock.x, state.currentBlock.y, false, true);
    }

    ctx.restore();

    // Grúa
    if (state.currentBlock.state === 'SWINGING') {
        const originX = canvas.width / 2;
        const originY = 0; 
        const blockDrawY = state.currentBlock.y + state.cameraY;

        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(state.currentBlock.x + CONFIG.BLOCK_WIDTH/2, blockDrawY);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 4;
        ctx.stroke();

        drawBuildingBlock(ctx, state.currentBlock.x, blockDrawY, false, true);
        
        // Gancho
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(state.currentBlock.x + CONFIG.BLOCK_WIDTH/2, blockDrawY, 6, 0, Math.PI * 2);
        ctx.fill();
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
      e?.stopPropagation();

      if (gameState === 'MENU') {
          initGame();
      } else if (gameState === 'PLAYING') {
          if (gameRef.current.currentBlock.state === 'SWINGING') {
              gameRef.current.currentBlock.state = 'DROPPING';
          }
      }
  };

  // --- CREAR SALA DE RETO (WHATSAPP) ---
  const createChallengeRoom = () => {
      const currentUrl = window.location.origin + window.location.pathname;
      const challengeLink = `${currentUrl}?challenger=${encodeURIComponent(userNickname)}&target=${score}`;
      
      const text = `🏗️ *TOWER BLOXX CHALLENGE* \n\nHe construido ${score} pisos. \n¿Puedes superarme? \n\nEntra aquí para aceptar el reto: \n${challengeLink}`;
      
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(whatsappUrl, '_blank');
  };

  useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas) {
          const dpr = window.devicePixelRatio || 1;
          const rect = canvas.getBoundingClientRect();
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          const ctx = canvas.getContext('2d');
          ctx?.scale(dpr, dpr);
      }
      requestRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(requestRef.current!);
  }, [gameState]);

  return (
    <div className="fixed inset-0 bg-slate-900 flex justify-center overflow-hidden touch-none select-none">
        
        {/* CANVAS */}
        <canvas 
            ref={canvasRef} 
            className="w-full h-full max-w-[500px] cursor-pointer"
            onPointerDown={handleTap}
            style={{ touchAction: 'none' }}
        />

        {/* HUD SUPERIOR */}
        <div className="absolute top-0 w-full max-w-[500px] p-4 flex justify-between items-start pointer-events-none z-20">
            {/* BOTÓN ATRÁS EN JUEGO */}
            <Link href="/" className="pointer-events-auto p-3 bg-slate-800/80 rounded-full text-white backdrop-blur-md border border-slate-700 hover:border-yellow-500 transition-colors">
                <ArrowLeft size={24} />
            </Link>
            
            {/* RETO ACTIVO */}
            {challengeData && gameState !== 'GAMEOVER' && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-4 py-1 rounded-full text-xs font-black shadow-lg border-2 border-white animate-bounce">
                    VS {challengeData.name}: {challengeData.target}
                </div>
            )}

            <div className="flex flex-col items-end">
                {/* 3 VIDAS */}
                <div className="flex gap-1 mb-2 bg-black/30 p-2 rounded-full backdrop-blur-sm border border-white/10">
                    {[...Array(3)].map((_, i) => (
                        <Heart key={i} size={20} className={i < lives ? "fill-red-500 text-red-500" : "text-slate-700 fill-slate-800"} />
                    ))}
                </div>
                <div className="text-5xl font-black text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.5)] font-mono flex flex-col items-end">
                    {score}
                    {perfectCombo > 1 && <span className="text-xs text-yellow-400 font-bold uppercase tracking-widest animate-pulse">Combo x{perfectCombo}!</span>}
                </div>
            </div>
        </div>

        {/* MENÚ INICIO */}
        {gameState === 'MENU' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30 animate-in fade-in duration-300 p-6 text-center">
                <Hammer size={80} className="text-yellow-400 mb-6 animate-bounce" />
                
                {challengeData ? (
                    <div className="mb-8 bg-slate-800 p-6 rounded-3xl border-2 border-yellow-500 shadow-2xl w-full max-w-xs animate-in zoom-in">
                        <p className="text-yellow-400 font-bold uppercase tracking-widest text-[10px] mb-2">Has sido retado por</p>
                        <h2 className="text-2xl font-black text-white mb-4 truncate">"{challengeData.name}"</h2>
                        <div className="bg-black/40 rounded-xl p-3">
                            <p className="text-xs text-slate-400">OBJETIVO</p>
                            <p className="text-3xl font-black text-white">{challengeData.target} <span className="text-xs text-yellow-500">PISOS</span></p>
                        </div>
                    </div>
                ) : (
                    <>
                        <h1 className="text-6xl font-black text-white italic tracking-tighter mb-2 drop-shadow-lg">TOWER</h1>
                        <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 italic tracking-widest mb-10">BLOXX</h2>
                    </>
                )}
                
                <button onClick={handleTap} className="group relative bg-yellow-500 hover:bg-yellow-400 text-black font-black py-5 px-16 rounded-2xl text-2xl shadow-[0_0_40px_rgba(234,179,8,0.4)] transition-all transform hover:scale-105 hover:-translate-y-1 pointer-events-auto">
                    <span className="flex items-center gap-3"><Play fill="black" size={28}/> {challengeData ? 'ACEPTAR' : 'JUGAR'}</span>
                </button>
                
                <button 
                    onClick={(e) => { e.stopPropagation(); setShowRanking(true); }}
                    className="mt-6 text-slate-400 hover:text-white flex gap-2 items-center text-sm font-bold bg-slate-800 px-6 py-3 rounded-xl border border-slate-700 hover:border-yellow-500 transition-all pointer-events-auto"
                >
                    <Trophy size={18} className="text-yellow-500"/> RANKING
                </button>
            </div>
        )}

        {/* GAME OVER (CON RETO Y WHATSAPP) */}
        {gameState === 'GAMEOVER' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md z-30 animate-in zoom-in duration-300 p-6">
                
                {/* Mensaje de Reto */}
                {challengeData && (
                    <div className={`mb-6 px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest border-2 shadow-lg ${score > challengeData.target ? 'bg-green-500 text-white border-green-400' : 'bg-red-500 text-white border-red-400'}`}>
                        {score > challengeData.target ? '🏆 ¡RETO SUPERADO!' : '💀 RETO FALLIDO'}
                    </div>
                )}

                <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-widest">Fin del Juego</h2>
                
                <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 flex flex-col items-center mb-6 shadow-2xl w-full max-w-xs relative overflow-hidden">
                    <div className="absolute top-0 w-full h-2 bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-500 animate-pulse"></div>
                    <span className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Altura Alcanzada</span>
                    <div className="text-7xl font-black text-white mb-2">{score}</div>
                    <div className="px-3 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded-full border border-yellow-500/30">PISOS</div>
                    
                    {scoreSaved && (
                        <div className="flex items-center gap-1 mt-4 text-emerald-400 text-[10px] font-bold uppercase animate-in fade-in">
                            <CheckCircle size={12}/> Puntuación Guardada
                        </div>
                    )}
                </div>

                {/* BOTÓN WHATSAPP (CREAR SALA DE RETO) */}
                <button 
                    onClick={createChallengeRoom}
                    className="w-full max-w-xs bg-[#25D366] hover:bg-[#128C7E] text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg mb-4 pointer-events-auto transition-transform hover:scale-105 active:scale-95"
                >
                    <MessageCircle size={24} fill="white" /> RETAR A UN AMIGO
                </button>
                
                <div className="flex gap-3 w-full max-w-xs">
                    {/* BOTÓN SALIR (HOME) */}
                    <Link href="/" className="bg-slate-700 text-white p-4 rounded-xl hover:bg-slate-600 transition-all pointer-events-auto border border-slate-600 flex-1 flex justify-center items-center">
                        <Home size={24}/>
                    </Link>
                    
                    {/* BOTÓN REINTENTAR */}
                    <button onClick={initGame} className="bg-yellow-500 text-black font-black py-4 px-6 rounded-xl hover:bg-yellow-400 shadow-xl transition-all flex gap-2 items-center justify-center pointer-events-auto hover:scale-105 flex-[2]">
                        <RotateCcw size={20} /> REINTENTAR
                    </button>
                </div>
            </div>
        )}

        {/* MODAL DE RANKING GLOBAL */}
        <GameRanking 
            gameId="towerbloxx" 
            isOpen={showRanking} 
            onClose={() => setShowRanking(false)} 
        />

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