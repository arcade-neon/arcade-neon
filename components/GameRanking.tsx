// components/GameRanking.tsx
import React, { useState, useEffect } from 'react';
import { X, Trophy, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

interface RankingProps {
  gameId: string; // 'stack', 'uno', 'snake', etc.
  isOpen: boolean;
  onClose: () => void;
}

export default function GameRanking({ gameId, isOpen, onClose }: RankingProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      const fetchRanking = async () => {
        setLoading(true);
        try {
          const q = query(
            collection(db, `scores_${gameId}`), 
            orderBy("score", "desc"), 
            limit(20) // Top 20
          );
          const querySnapshot = await getDocs(q);
          const results = querySnapshot.docs.map(doc => doc.data());
          setData(results);
        } catch (error) {
          console.error("Error cargando ranking:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchRanking();
    }
  }, [isOpen, gameId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 animate-in zoom-in-95 backdrop-blur-sm">
        <div className="bg-[#0f172a] border border-slate-700 p-6 rounded-3xl w-full max-w-sm shadow-2xl relative flex flex-col max-h-[80vh]">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6 shrink-0 border-b border-slate-800 pb-4">
                <h2 className="text-xl font-black text-yellow-400 flex items-center gap-2 uppercase italic tracking-wider">
                    <Trophy size={24} /> TOP JUGADORES
                </h2>
                <button onClick={onClose} className="bg-slate-800 p-2 rounded-full text-slate-400 hover:text-white transition"><X size={18}/></button>
            </div>

            {/* Lista */}
            <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
                {loading ? (
                    <div className="flex justify-center p-10"><Loader2 className="animate-spin text-yellow-400 w-8 h-8"/></div>
                ) : data.length === 0 ? (
                    <div className="text-center text-slate-500 py-10">
                        <p>No hay registros aún.</p>
                        <p className="text-xs mt-2">¡Sé el primero en jugar!</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {data.map((p, i) => (
                            <div key={i} className={`flex justify-between items-center p-3 rounded-xl border transition-all ${i===0 ? 'bg-yellow-500/10 border-yellow-500/50 scale-105 mb-4' : i===1 ? 'bg-slate-300/10 border-slate-300/30' : i===2 ? 'bg-amber-700/10 border-amber-700/30' : 'bg-slate-800/30 border-slate-700/30'}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${i===0 ? 'bg-yellow-500 text-black' : i===1 ? 'bg-slate-300 text-black' : i===2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                        {i+1}
                                    </div>
                                    <div className="flex flex-col">
                                        {/* APODO EN GRANDE */}
                                        <span className={`font-black text-sm uppercase tracking-tight ${i===0 ? 'text-yellow-400' : 'text-white'}`}>
                                            {p.name || 'ANÓNIMO'}
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-mono">
                                            {p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString() : 'Hoy'}
                                        </span>
                                    </div>
                                </div>
                                <span className="font-mono font-black text-xl text-emerald-400">{p.score}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
}