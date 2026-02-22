// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Trophy, ArrowLeft, Crown, Medal, Coins, 
  Gamepad2, Search, User, Hammer, Grid3X3 
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

// Categorías del Ranking
const CATEGORIES = [
  { id: 'global', label: 'FORTUNAS', icon: Coins, color: 'text-yellow-400', coll: 'users', field: 'coins' },
  { id: 'towerbloxx', label: 'CONSTRUCCIONES', icon: Hammer, color: 'text-orange-400', coll: 'scores_towerbloxx', field: 'score' },
  { id: 'chess', label: 'AJEDREZ', icon: Crown, color: 'text-emerald-400', coll: 'scores_chess', field: 'moves', order: 'asc' }, // En ajedrez menos movs es mejor (o usa score si prefieres)
  { id: 'wordsearch', label: 'SOPA LETRAS', icon: Search, color: 'text-blue-400', coll: 'scores_wordsearch', field: 'time', order: 'asc' },
];

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState('global');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRanking = async () => {
      setLoading(true);
      setData([]);
      try {
        const cat = CATEGORIES.find(c => c.id === activeTab);
        if (!cat) return;

        // Consulta dinámica según la categoría
        const q = query(
            collection(db, cat.coll), 
            orderBy(cat.field, cat.order || 'desc'), 
            limit(50)
        );

        const snapshot = await getDocs(q);
        const results = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                // Lógica para encontrar el nombre real según dónde se guardó
                name: d.nickname || d.displayName || d.name || 'Jugador Anónimo', 
                score: d[cat.field] || 0,
                photo: d.photoURL || null,
                ...d
            };
        });
        
        // Filtramos duplicados por UID si es ranking global (para que no salga el mismo usuario 2 veces)
        const uniqueResults = activeTab === 'global' 
            ? results 
            : results; // En juegos permitimos que salgan varias veces si tienen varios records

        setData(uniqueResults);
      } catch (error) {
        console.error("Error cargando ranking:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRanking();
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-[#020617] text-white font-sans selection:bg-indigo-500/30 pb-20">
      
      {/* HEADER FIJO */}
      <div className="sticky top-0 w-full bg-[#020617]/90 backdrop-blur-xl z-20 border-b border-slate-800 shadow-2xl">
        <div className="max-w-2xl mx-auto p-4 flex items-center justify-between">
            <Link href="/" className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition"><ArrowLeft size={20}/></Link>
            <h1 className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                <Trophy className="text-yellow-500" /> SALÓN DE LA FAMA
            </h1>
            <div className="w-10"></div>
        </div>
        
        {/* TABS SCROLLABLE */}
        <div className="max-w-2xl mx-auto px-4 pb-0 overflow-x-auto flex gap-6 no-scrollbar mask-linear-fade">
            {CATEGORIES.map(cat => (
                <button
                    key={cat.id}
                    onClick={() => setActiveTab(cat.id)}
                    className={`flex items-center gap-2 pb-3 border-b-2 transition-all whitespace-nowrap text-xs font-black tracking-widest ${activeTab === cat.id ? `border-indigo-500 text-white` : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    <cat.icon size={14} className={activeTab === cat.id ? cat.color : 'text-slate-600'}/> {cat.label}
                </button>
            ))}
        </div>
      </div>

      {/* LISTA DE JUGADORES */}
      <div className="max-w-2xl mx-auto pt-6 px-4">
          {loading ? (
              <div className="flex flex-col items-center py-20 gap-4">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-slate-500 text-xs font-bold tracking-widest animate-pulse">BUSCANDO LEYENDAS...</p>
              </div>
          ) : data.length > 0 ? (
              <div className="space-y-3">
                  {data.map((player, index) => {
                      // Estilos especiales para el TOP 3
                      const isTop1 = index === 0;
                      const isTop2 = index === 1;
                      const isTop3 = index === 2;
                      
                      let rankColor = 'text-slate-500';
                      let ringColor = 'border-slate-700';
                      let bgCard = 'bg-slate-900/50 border-slate-800/50';

                      if (isTop1) { rankColor = 'text-yellow-400'; ringColor = 'border-yellow-500'; bgCard = 'bg-gradient-to-r from-yellow-900/20 to-slate-900 border-yellow-500/30'; }
                      else if (isTop2) { rankColor = 'text-slate-300'; ringColor = 'border-slate-400'; bgCard = 'bg-slate-800/80 border-slate-600/30'; }
                      else if (isTop3) { rankColor = 'text-orange-700'; ringColor = 'border-orange-700'; bgCard = 'bg-slate-900 border-orange-900/30'; }

                      return (
                          <div key={index} className={`flex items-center gap-4 p-4 rounded-2xl border transition-transform hover:scale-[1.01] ${bgCard}`}>
                              
                              {/* NÚMERO DE POSICIÓN */}
                              <div className={`w-8 text-center font-black text-xl italic ${rankColor}`}>
                                  {isTop1 ? '1º' : index + 1}
                              </div>

                              {/* AVATAR */}
                              <div className={`relative w-12 h-12 rounded-full border-2 p-0.5 ${ringColor}`}>
                                  {player.photo ? (
                                      <img src={player.photo} alt={player.name} className="w-full h-full rounded-full object-cover" />
                                  ) : (
                                      <div className="w-full h-full bg-slate-800 rounded-full flex items-center justify-center text-slate-500 font-bold">
                                          {player.name[0]?.toUpperCase()}
                                      </div>
                                  )}
                                  {isTop1 && <Crown size={14} className="absolute -top-3 -right-1 text-yellow-500 fill-yellow-500 animate-bounce" />}
                              </div>

                              {/* INFO */}
                              <div className="flex-1 min-w-0">
                                  <div className={`font-bold text-sm truncate ${isTop1 ? 'text-yellow-100' : 'text-slate-200'}`}>
                                      {player.name}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono uppercase truncate">
                                      ID: {player.id.substring(0,8)}...
                                  </div>
                              </div>

                              {/* PUNTUACIÓN */}
                              <div className="text-right">
                                  <div className={`font-black text-lg font-mono ${activeTab === 'global' ? 'text-yellow-400' : 'text-indigo-400'}`}>
                                      {activeTab === 'wordsearch' || activeTab === 'chess' && activeTab !== 'global' ? 
                                        player.score : // Para tiempo o movimientos, mostrar tal cual
                                        player.score.toLocaleString()
                                      }
                                  </div>
                                  <div className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">
                                      {activeTab === 'global' ? 'Monedas' : activeTab === 'chess' ? 'Movimientos' : activeTab === 'wordsearch' ? 'Segundos' : 'Puntos'}
                                  </div>
                              </div>
                          </div>
                      );
                  })}
              </div>
          ) : (
              <div className="text-center py-20 opacity-50">
                  <Trophy size={48} className="mx-auto mb-4 text-slate-700"/>
                  <h3 className="text-slate-400 font-bold text-sm uppercase">Nadie ha reclamado el trono</h3>
                  <p className="text-slate-600 text-xs mt-1">Sé el primero en jugar.</p>
              </div>
          )}
      </div>
    </div>
  );
}