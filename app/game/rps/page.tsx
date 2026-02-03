// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Zap, RefreshCw, Hand, Scissors, FileText, Swords, Users, Cpu, Copy, Check } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, doc, setDoc, updateDoc, onSnapshot, getDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import GameChat from '@/components/GameChat';

// --- CONFIGURACIÓN ---
const WEAPONS = [
  { id: 'rock', icon: <Hand className="w-full h-full" />, name: 'PIEDRA', beats: 'scissors' },
  { id: 'paper', icon: <FileText className="w-full h-full" />, name: 'PAPEL', beats: 'rock' },
  { id: 'scissors', icon: <Scissors className="w-full h-full" />, name: 'TIJERA', beats: 'paper' }
];

const WIN_TARGET = 10; // CARRERA A 10

export default function PiedraPapelTijeraPro() {
  const [view, setView] = useState('menu'); // menu, pve, pvp_menu, pvp_host, pvp_guest
  const [user, setUser] = useState(null);
  
  // ESTADO JUEGO
  const [myScore, setMyScore] = useState(0);
  const [opScore, setOpScore] = useState(0);
  const [myChoice, setMyChoice] = useState(null); // Mi elección actual
  const [opChoice, setOpChoice] = useState(null); // Elección del rival (oculta hasta resolver)
  const [result, setResult] = useState(null); // win, lose, draw
  const [animating, setAnimating] = useState(false);
  const [roundWinner, setRoundWinner] = useState(null);
  
  // ESTADO ONLINE
  const [roomCode, setRoomCode] = useState('');
  const [opName, setOpName] = useState('Esperando...');
  const [isHost, setIsHost] = useState(false);
  
  // LOGROS
  const [trophies, setTrophies] = useState([]);

  useEffect(() => {
    const u = auth.currentUser;
    if (u) setUser({ uid: u.uid, name: u.displayName || 'Jugador' });
  }, []);

  // --- LÓGICA ONLINE (REALTIME) ---
  useEffect(() => {
    if ((view === 'pvp_host' || view === 'pvp_guest') && roomCode) {
        const unsubscribe = onSnapshot(doc(db, "matches_rps", roomCode), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // 1. Sincronizar nombres y scores
                if (isHost) {
                    setOpName(data.guestName || 'Esperando...');
                    // El host calcula, así que sus estados locales mandan, pero leemos para confirmar conexión
                } else {
                    setOpName(data.hostName || 'Host');
                    // El guest lee los scores oficiales de la DB
                    setMyScore(data.guestScore || 0);
                    setOpScore(data.hostScore || 0);
                }

                // 2. Detectar jugadas
                // Si soy Host, miro si Guest movió. Si soy Guest, miro si Host movió.
                const myMoveRemote = isHost ? data.hostMove : data.guestMove;
                const opMoveRemote = isHost ? data.guestMove : data.hostMove;

                // Visualmente saber si el rival ya eligió (sin ver qué eligió)
                if (opMoveRemote && !opChoice) {
                    // Marcamos que el rival ya eligió (icono de interrogación o check)
                    setOpChoice({ id: 'hidden', name: 'LISTO' }); 
                }

                // 3. RESOLUCIÓN DE TURNO (Solo si ambos movieron)
                if (data.hostMove && data.guestMove && !animating && !data.roundResolved) {
                    resolveOnlineRound(data.hostMove, data.guestMove);
                }
                
                // 4. RESET (Cuando el host limpia la ronda en DB)
                if (!data.hostMove && !data.guestMove && result) {
                   // Limpiar tablero para siguiente ronda
                   setMyChoice(null);
                   setOpChoice(null);
                   setResult(null);
                }
            }
        });
        return () => unsubscribe();
    }
  }, [view, roomCode, animating]);

  // --- FUNCIONES CORE ---
  
  // JUGADA VS IA
  const playPvE = (weaponId) => {
    if (animating || myScore >= WIN_TARGET || opScore >= WIN_TARGET) return;
    setAnimating(true);
    
    // Simular proceso
    const playerWeapon = WEAPONS.find(w => w.id === weaponId);
    setMyChoice(playerWeapon);
    setOpChoice({ id: 'hidden' }); // Simular que la IA piensa

    setTimeout(() => {
        const cpuWeapon = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
        setOpChoice(cpuWeapon);
        calculateWinner(playerWeapon.id, cpuWeapon.id);
        setAnimating(false);
    }, 600);
  };

  // JUGADA ONLINE
  const playPvP = async (weaponId) => {
      if (myChoice) return; // Ya elegiste
      const weapon = WEAPONS.find(w => w.id === weaponId);
      setMyChoice(weapon);

      // Enviar movimiento a DB
      const field = isHost ? 'hostMove' : 'guestMove';
      await updateDoc(doc(db, "matches_rps", roomCode), {
          [field]: weaponId
      });
  };

  const resolveOnlineRound = async (hostMoveId, guestMoveId) => {
      setAnimating(true);
      
      // Mostrar armas reales
      if (isHost) {
          setOpChoice(WEAPONS.find(w => w.id === guestMoveId));
      } else {
          setOpChoice(WEAPONS.find(w => w.id === hostMoveId));
          // El guest espera a que el host actualice el score en DB, 
          // pero calculamos local para la animación inmediata
      }

      // Calcular ganador
      const p1 = isHost ? hostMoveId : guestMoveId;
      const p2 = isHost ? guestMoveId : hostMoveId;
      
      // Delay para ver el resultado
      setTimeout(async () => {
          setAnimating(false);
          
          if (isHost) {
              // Lógica de puntos (Solo Host escribe en DB para evitar conflictos)
              let hScore = myScore;
              let gScore = opScore;
              let winner = 'draw';

              if (hostMoveId !== guestMoveId) {
                  const hostWin = WEAPONS.find(w => w.id === hostMoveId).beats === guestMoveId;
                  if (hostWin) {
                      hScore++;
                      winner = 'host';
                      setResult('win');
                  } else {
                      gScore++;
                      winner = 'guest';
                      setResult('lose');
                  }
              } else {
                  setResult('draw');
              }
              
              setMyScore(hScore);
              setOpScore(gScore);

              // Guardar score y resetear movimientos
              await updateDoc(doc(db, "matches_rps", roomCode), {
                  hostScore: hScore,
                  guestScore: gScore,
                  roundResolved: true
              });
              
              // Esperar 2 segundos y limpiar mesa
              setTimeout(async () => {
                  await updateDoc(doc(db, "matches_rps", roomCode), {
                      hostMove: null,
                      guestMove: null,
                      roundResolved: false
                  });
              }, 2000);
          } else {
              // Guest solo calcula local para mostrar WIN/LOSE
              if (guestMoveId !== hostMoveId) {
                  const guestWin = WEAPONS.find(w => w.id === guestMoveId).beats === hostMoveId;
                  setResult(guestWin ? 'win' : 'lose');
              } else {
                  setResult('draw');
              }
          }
      }, 500);
  };

  const calculateWinner = (pId, oId) => {
      if (pId === oId) {
          setResult('draw');
      } else {
          const pWeapon = WEAPONS.find(w => w.id === pId);
          if (pWeapon.beats === oId) {
              setResult('win');
              setMyScore(s => s + 1);
          } else {
              setResult('lose');
              setOpScore(s => s + 1);
          }
      }
  };

  // --- GESTIÓN DE SALAS ---
  const createRoom = async () => {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      await setDoc(doc(db, "matches_rps", code), {
          host: user?.uid || 'host',
          hostName: user?.name || 'Anónimo',
          hostScore: 0,
          guestScore: 0,
          status: 'waiting',
          createdAt: serverTimestamp()
      });
      setRoomCode(code);
      setIsHost(true);
      resetGame();
      setView('pvp_host');
  };

  const joinRoom = async (codeInput) => {
      const ref = doc(db, "matches_rps", codeInput);
      const snap = await getDoc(ref);
      if (!snap.exists()) return alert("Sala no encontrada");
      
      await updateDoc(ref, {
          guest: user?.uid || 'guest',
          guestName: user?.name || 'Invitado',
          status: 'playing'
      });
      setRoomCode(codeInput);
      setOpName(snap.data().hostName);
      setIsHost(false);
      resetGame();
      setView('pvp_guest');
  };

  const resetGame = () => {
      setMyScore(0);
      setOpScore(0);
      setMyChoice(null);
      setOpChoice(null);
      setResult(null);
  };

  // --- RENDERIZADO ---
  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-4 font-mono text-white select-none">
      
      {/* HEADER */}
      <div className="w-full max-w-md flex justify-between items-center mb-6 z-10">
        <button onClick={() => view === 'menu' ? window.location.href='/' : setView('menu')} className="p-2 bg-slate-900 rounded-full border border-slate-700 hover:bg-slate-800 transition">
             <ArrowLeft className="w-5 h-5 text-slate-400"/>
        </button>
        {view !== 'menu' && (
           <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-full border border-slate-700">
               <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
               <span className="text-[10px] font-bold text-slate-400">{view.includes('pvp') ? 'ONLINE' : 'VS CPU'}</span>
           </div>
        )}
      </div>

      <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500 mb-2 text-center italic tracking-tighter">PIEDRA PAPEL TIJERA</h1>

      {/* MENÚ PRINCIPAL */}
      {view === 'menu' && (
          <div className="w-full max-w-md grid gap-4 animate-in zoom-in">
              <button onClick={() => { resetGame(); setView('pve'); }} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex items-center gap-4 hover:border-pink-500/50 transition group">
                  <div className="p-4 bg-slate-950 rounded-xl group-hover:bg-pink-900/20 transition"><Cpu className="w-8 h-8 text-cyan-400"/></div>
                  <div className="text-left">
                      <h2 className="text-xl font-black text-white">1 JUGADOR (IA)</h2>
                      <p className="text-xs text-slate-400">Entrena y consigue trofeos.</p>
                  </div>
              </button>

              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-4 mb-4">
                      <div className="p-4 bg-slate-950 rounded-xl"><Users className="w-8 h-8 text-pink-500"/></div>
                      <div className="text-left">
                          <h2 className="text-xl font-black text-white">2 JUGADORES</h2>
                          <p className="text-xs text-slate-400">Sala privada. Carrera a 10.</p>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={createRoom} className="flex-1 py-3 bg-pink-600 rounded-xl font-bold text-xs hover:bg-pink-500 shadow-lg">CREAR SALA</button>
                      <button onClick={() => setView('pvp_menu')} className="flex-1 py-3 bg-slate-800 rounded-xl font-bold text-xs hover:bg-slate-700 border border-slate-700">UNIRSE</button>
                  </div>
              </div>
          </div>
      )}

      {/* MENÚ UNIRSE */}
      {view === 'pvp_menu' && (
          <div className="w-full max-w-md bg-slate-900 p-6 rounded-2xl border border-slate-700 animate-in fade-in">
              <h2 className="text-lg font-bold mb-4">CÓDIGO DE SALA</h2>
              <input type="number" id="code-input" placeholder="0000" className="w-full bg-black border border-slate-700 rounded-xl p-4 text-center text-4xl font-black text-white mb-4 outline-none focus:border-pink-500 tracking-[1em]"/>
              <button onClick={() => joinRoom(document.getElementById('code-input').value)} className="w-full py-4 bg-white text-black font-black rounded-xl hover:scale-105 transition">ENTRAR</button>
          </div>
      )}

      {/* JUEGO (PVE Y PVP) */}
      {(view === 'pve' || view === 'pvp_host' || view === 'pvp_guest') && (
          <div className="w-full max-w-md flex flex-col items-center flex-grow w-full">
              
              {/* INFO SALA ONLINE */}
              {view.includes('pvp') && (
                  <div className="mb-4 flex items-center gap-2 bg-slate-800/50 px-4 py-1 rounded-full border border-slate-700">
                      <span className="text-[10px] text-slate-400">SALA: <b className="text-white select-all">{roomCode}</b></span>
                      {isHost && <Copy className="w-3 h-3 text-slate-500 cursor-pointer" onClick={() => navigator.clipboard.writeText(roomCode)}/>}
                  </div>
              )}

              {/* MARCADOR */}
              <div className="flex justify-between items-end w-full px-4 mb-8">
                  <div className="text-center w-1/3">
                      <p className="text-[10px] font-bold text-cyan-400 mb-1 truncate">TÚ</p>
                      <div className="text-5xl font-black text-white drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">{myScore}</div>
                  </div>
                  <div className="text-center w-1/3 pb-2 flex flex-col items-center">
                      <p className="text-[10px] font-bold text-slate-500 tracking-[0.2em] mb-1">META: {WIN_TARGET}</p>
                      <div className="text-xs font-bold text-yellow-500">VS</div>
                      <p className="text-[9px] text-slate-600 mt-1 truncate max-w-full">{view === 'pve' ? 'IA' : opName}</p>
                  </div>
                  <div className="text-center w-1/3">
                      <p className="text-[10px] font-bold text-pink-500 mb-1 truncate">{view === 'pve' ? 'CPU' : 'RIVAL'}</p>
                      <div className="text-5xl font-black text-white drop-shadow-[0_0_10px_rgba(236,72,153,0.5)]">{opScore}</div>
                  </div>
              </div>

              {/* ZONA DE BATALLA */}
              <div className="flex-grow w-full flex items-center justify-center gap-4 mb-8 relative min-h-[180px]">
                  
                  {/* TU MANO */}
                  <div className={`w-24 h-24 sm:w-28 sm:h-28 bg-slate-900 rounded-full border-4 flex items-center justify-center p-5 transition-all duration-300 ${myChoice ? 'border-cyan-500 scale-105 shadow-[0_0_20px_rgba(34,211,238,0.3)]' : 'border-slate-800'}`}>
                      {myChoice ? myChoice.icon : <div className="w-full h-full rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-700">?</div>}
                  </div>

                  {/* RESULTADO */}
                  <div className="absolute z-10">
                      {animating ? (
                         <div className="text-3xl font-black animate-bounce text-yellow-400 drop-shadow-lg">VS</div>
                      ) : result ? (
                         <div className={`text-xl font-black px-4 py-2 rounded-xl border-2 shadow-xl ${result === 'win' ? 'bg-green-500 border-green-400 text-black' : result === 'lose' ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-200 border-white text-black'}`}>
                             {result === 'win' ? '¡GANAS!' : result === 'lose' ? 'PIERDES' : 'EMPATE'}
                         </div>
                      ) : null}
                  </div>

                  {/* RIVAL MANO */}
                  <div className={`w-24 h-24 sm:w-28 sm:h-28 bg-slate-900 rounded-full border-4 flex items-center justify-center p-5 transition-all duration-300 ${opChoice ? 'border-pink-500 scale-105 shadow-[0_0_20px_rgba(236,72,153,0.3)]' : 'border-slate-800'}`}>
                      {opChoice && opChoice.id !== 'hidden' ? opChoice.icon : (
                          opChoice?.id === 'hidden' ? <Check className="w-8 h-8 text-green-500 animate-pulse"/> : <div className="w-full h-full rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-700">?</div>
                      )}
                  </div>
              </div>

              {/* CONTROLES */}
              {myScore < WIN_TARGET && opScore < WIN_TARGET ? (
                  <div className="grid grid-cols-3 gap-3 w-full mb-6">
                      {WEAPONS.map((w) => (
                          <button 
                            key={w.id} 
                            onClick={() => view === 'pve' ? playPvE(w.id) : playPvP(w.id)}
                            disabled={animating || (view !== 'pve' && myChoice)} // Bloquear si ya elegiste en online
                            className={`aspect-square bg-slate-800 rounded-2xl border-b-4 border-slate-950 hover:bg-slate-700 active:border-b-0 active:translate-y-1 transition-all flex flex-col items-center justify-center p-3 group ${myChoice?.id === w.id ? 'bg-cyan-900 border-cyan-700' : ''}`}
                          >
                              <div className="w-8 h-8 text-slate-400 group-hover:text-white transition-colors mb-2">{w.icon}</div>
                              <span className="text-[10px] font-bold text-slate-500 group-hover:text-cyan-400">{w.name}</span>
                          </button>
                      ))}
                  </div>
              ) : (
                  // FIN DE PARTIDA
                  <div className="w-full bg-slate-900 border border-slate-700 p-6 rounded-2xl text-center animate-in zoom-in mb-6">
                      {myScore >= WIN_TARGET ? (
                          <>
                            <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-2 animate-bounce"/>
                            <h2 className="text-3xl font-black text-white mb-2">¡CAMPEÓN!</h2>
                            <p className="text-yellow-400 text-sm font-bold mb-4">HAS ALCANZADO 10 VICTORIAS</p>
                          </>
                      ) : (
                          <>
                            <Zap className="w-16 h-16 text-red-500 mx-auto mb-2"/>
                            <h2 className="text-3xl font-black text-white mb-2">DERROTA</h2>
                            <p className="text-slate-400 text-xs mb-4">Suerte la próxima vez.</p>
                          </>
                      )}
                      <button onClick={resetGame} className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:scale-105 transition flex items-center justify-center gap-2 mx-auto">
                          <RefreshCw className="w-4 h-4"/> JUGAR OTRA VEZ
                      </button>
                  </div>
              )}
          </div>
      )}

      <div className="mt-auto w-full max-w-md pt-4 opacity-75"><AdSpace type="banner" /><GameChat gameId="global_rps" gameName="PIEDRA PAPEL TIJERA" /></div>
    </div>
  );
}