// @ts-nocheck
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart, Lock, Check, Zap, Shield, Crown, Sparkles } from 'lucide-react';
import { useEconomy } from '@/contexts/EconomyContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useAudio } from '@/contexts/AudioContext';
import AdSpace from '@/components/AdSpace';

// --- CATÁLOGO DE PRODUCTOS ---
const CATALOG = [
  {
    id: 'frame_gold',
    name: 'Marco Dorado',
    category: 'frame',
    price: 500,
    desc: 'Borde de oro puro para tu avatar.',
    icon: Crown,
    color: 'text-yellow-400',
    border: 'border-yellow-500'
  },
  {
    id: 'frame_neon',
    name: 'Cyber Neon',
    category: 'frame',
    price: 1000,
    desc: 'Brilla en la oscuridad.',
    icon: Zap,
    color: 'text-cyan-400',
    border: 'border-cyan-500 shadow-[0_0_15px_cyan]'
  },
  {
    id: 'title_boss',
    name: 'Título: THE BOSS',
    category: 'title',
    price: 2500,
    desc: 'Que todos sepan quién manda.',
    icon: Shield,
    color: 'text-red-500',
    border: 'border-red-600'
  },
  {
    id: 'card_matrix',
    name: 'Dorso: Matrix',
    category: 'cardback',
    price: 5000,
    desc: 'Código verde cayendo en tus cartas UNO.',
    icon: Sparkles,
    color: 'text-green-500',
    border: 'border-green-500 bg-black'
  }
];

export default function ShopPage() {
  const { coins, spendCoins } = useEconomy();
  const { items, equipped, buyItem, equipItem } = useInventory();
  const { playSound } = useAudio();
  const [processing, setProcessing] = useState('');

  const handlePurchase = async (item: any) => {
    if (processing) return;
    setProcessing(item.id);
    
    // 1. Intentar cobrar
    const success = await spendCoins(item.price, `Compra: ${item.name}`);
    
    if (success) {
        playSound('win'); // Sonido de caja registradora
        await buyItem(item.id, item.category);
    } else {
        playSound('error');
    }
    setProcessing('');
  };

  const handleEquip = async (item: any) => {
      playSound('click');
      await equipItem(item.id, item.category);
  };

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono text-white relative">
        {/* HEADER */}
        <div className="w-full max-w-4xl flex justify-between items-center mb-8 z-10 mt-4">
            <Link href="/" className="p-3 bg-slate-900/80 rounded-full border border-slate-700 hover:border-purple-500 transition-all group">
                <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-purple-500"/>
            </Link>
            <div className="text-center">
                <h1 className="text-3xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 tracking-tighter uppercase">Black Market</h1>
                <p className="text-[10px] text-purple-500/50 font-bold tracking-[0.5em]">GASTA TU FORTUNA</p>
            </div>
            <div className="w-10"></div> {/* Espaciador */}
        </div>

        {/* GRID DE PRODUCTOS */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
            {CATALOG.map((item) => {
                const isOwned = items?.includes(item.id);
                const isEquipped = equipped?.[item.category] === item.id;
                const canAfford = coins >= item.price;

                return (
                    <div key={item.id} className={`bg-slate-900/80 border p-6 rounded-2xl flex flex-col items-center text-center relative overflow-hidden group transition-all hover:scale-[1.02] ${isEquipped ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'border-slate-800 hover:border-purple-500/50'}`}>
                        
                        {/* EFECTO DE FONDO */}
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                        {/* ICONO / PREVIEW */}
                        <div className={`w-20 h-20 rounded-full border-2 mb-4 flex items-center justify-center shadow-xl ${item.border} ${item.color} bg-slate-950`}>
                            <item.icon className="w-10 h-10"/>
                        </div>

                        <h3 className="text-lg font-bold text-white mb-1 uppercase italic">{item.name}</h3>
                        <p className="text-xs text-slate-400 mb-6 min-h-[2.5em]">{item.desc}</p>

                        {/* ACCIONES */}
                        <div className="w-full mt-auto">
                            {isOwned ? (
                                isEquipped ? (
                                    <button disabled className="w-full py-3 bg-green-900/50 border border-green-500/30 text-green-400 font-bold rounded-lg uppercase tracking-widest flex items-center justify-center gap-2 cursor-default">
                                        <Check className="w-4 h-4"/> Equipado
                                    </button>
                                ) : (
                                    <button onClick={() => handleEquip(item)} className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold rounded-lg uppercase tracking-widest transition-all">
                                        EQUIPAR
                                    </button>
                                )
                            ) : (
                                <button 
                                    onClick={() => handlePurchase(item)} 
                                    disabled={!canAfford || processing === item.id}
                                    className={`w-full py-3 rounded-lg font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${canAfford ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg hover:shadow-purple-500/25' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                                >
                                    {processing === item.id ? <RotateCw className="w-4 h-4 animate-spin"/> : <ShoppingCart className="w-4 h-4"/>}
                                    {item.price} ₵
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>

        <div className="mt-auto w-full max-w-4xl opacity-50"><AdSpace type="banner" /></div>
    </div>
  );
}