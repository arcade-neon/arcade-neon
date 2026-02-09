// @ts-nocheck
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, ShoppingCart, Lock, Check, Zap, Shield, Crown, Sparkles, 
  Ghost, Flame, Gem, Skull, Aperture, Palette, MessageSquare, Star, 
  Coins, User, Bot, Eye, Smile, Cpu, Fingerprint
} from 'lucide-react';
import { useEconomy } from '@/contexts/EconomyContext';
import { useInventory } from '@/contexts/InventoryContext';
import { useAudio } from '@/contexts/AudioContext';
import AdSpace from '@/components/AdSpace';

// --- CONFIGURACIÓN DE RAREZA VISUAL ---
const RARITY = {
  COMMON: { label: 'COMÚN', color: 'text-slate-400', border: 'border-slate-600', bg: 'from-slate-800/80 to-slate-900/80', glow: 'group-hover:shadow-[0_0_20px_rgba(148,163,184,0.3)]' },
  RARE: { label: 'RARO', color: 'text-cyan-400', border: 'border-cyan-500', bg: 'from-cyan-950/80 to-slate-900/80', glow: 'group-hover:shadow-[0_0_30px_rgba(6,182,212,0.4)]' },
  EPIC: { label: 'ÉPICO', color: 'text-purple-400', border: 'border-purple-500', bg: 'from-purple-950/80 to-slate-900/80', glow: 'group-hover:shadow-[0_0_40px_rgba(168,85,247,0.5)]' },
  LEGENDARY: { label: 'LEGENDARIO', color: 'text-yellow-400', border: 'border-yellow-500', bg: 'from-yellow-950/80 to-slate-900/80', glow: 'group-hover:shadow-[0_0_50px_rgba(234,179,8,0.6)]' },
  TOXIC: { label: 'TÓXICO', color: 'text-green-500', border: 'border-green-500', bg: 'from-green-950/80 to-slate-900/80', glow: 'group-hover:shadow-[0_0_50px_rgba(34,197,94,0.6)]' },
  MYTHIC: { label: 'MITICO', color: 'text-rose-500', border: 'border-rose-500', bg: 'from-rose-950/90 to-black', glow: 'group-hover:shadow-[0_0_80px_rgba(244,63,94,0.8)]' }
};

// --- CATÁLOGO DE PRODUCTOS ---
const CATALOG = [
  // --- AVATARES (NUEVO) ---
  { id: 'avatar_recruit', name: 'Recluta', category: 'avatar', price: 500, desc: 'Icono estándar de soldado.', rarity: 'COMMON', css: 'bg-slate-700', icon: User },
  { id: 'avatar_punk', name: 'Cyber Punk', category: 'avatar', price: 1500, desc: 'Estilo rebelde neón.', rarity: 'RARE', css: 'bg-cyan-900 text-cyan-400', icon: Smile },
  { id: 'avatar_bot', name: 'Mecha Unit', category: 'avatar', price: 3000, desc: 'Inteligencia artificial pura.', rarity: 'EPIC', css: 'bg-purple-900 text-purple-400', icon: Bot },
  { id: 'avatar_demon', name: 'Oni Mask', category: 'avatar', price: 8000, desc: 'Terror digital.', rarity: 'TOXIC', css: 'bg-green-900 text-green-400', icon: Ghost },
  { id: 'avatar_hacker', name: 'Netrunner', category: 'avatar', price: 15000, desc: 'Acceso root concedido.', rarity: 'LEGENDARY', css: 'bg-yellow-900 text-yellow-400', icon: Cpu },
  { id: 'avatar_god', name: 'LA SINGULARIDAD', category: 'avatar', price: 99999, desc: 'Más allá de la comprensión humana.', rarity: 'MYTHIC', css: 'bg-black text-rose-500 animate-pulse border-2 border-rose-500', icon: Fingerprint },

  // --- MARCOS ---
  { id: 'frame_silver', name: 'Plata Pulida', category: 'frame', price: 250, desc: 'Acabado metálico industrial.', rarity: 'COMMON', css: 'border-slate-300 shadow-[0_0_10px_rgba(203,213,225,0.5)] bg-slate-800' },
  { id: 'frame_gold', name: 'Oro Real', category: 'frame', price: 1000, desc: 'Bañado en oro de 24k.', rarity: 'RARE', css: 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.6)] bg-gradient-to-b from-yellow-900/40 to-black' },
  { id: 'frame_neon', name: 'Cyber Neon', category: 'frame', price: 2000, desc: 'Tubos de neón activos.', rarity: 'EPIC', css: 'border-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.8)] animate-pulse bg-black' },
  { id: 'frame_magma', name: 'Magma Vivo', category: 'frame', price: 3500, desc: 'Roca volcánica fundida.', rarity: 'LEGENDARY', css: 'border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.8)] animate-pulse bg-gradient-to-tr from-red-900/60 to-orange-500/20' },
  { id: 'frame_glitch', name: 'System Glitch', category: 'frame', price: 5000, desc: 'Error crítico en el sistema.', rarity: 'LEGENDARY', css: 'border-white shadow-[0_0_15px_rgba(255,255,255,0.8)] animate-bounce bg-black' },

  // --- TÍTULOS ---
  { id: 'title_rookie', name: 'Promesa', category: 'title', price: 100, desc: 'Para quien empieza.', rarity: 'COMMON', css: 'text-slate-300 border-slate-500 bg-slate-800' },
  { id: 'title_pro', name: 'Profesional', category: 'title', price: 500, desc: 'Badge azul competitivo.', rarity: 'RARE', css: 'text-cyan-400 border-cyan-500 bg-cyan-950/60 shadow-[0_0_10px_cyan]' },
  { id: 'title_boss', name: 'THE BOSS', category: 'title', price: 2500, desc: 'Badge rojo animado.', rarity: 'EPIC', css: 'text-white bg-red-600 border-red-400 animate-pulse shadow-xl' },
  { id: 'title_whale', name: 'La Ballena', category: 'title', price: 10000, desc: 'Oro sólido exclusivo.', rarity: 'LEGENDARY', css: 'text-yellow-100 bg-gradient-to-r from-yellow-600 to-yellow-400 border-yellow-300 shadow-2xl scale-110' },

  // --- CARTAS ---
  { id: 'card_carbon', name: 'Fibra Carbono', category: 'cardback', price: 750, desc: 'Diseño técnico stealth.', rarity: 'RARE', css: 'bg-zinc-900 border-zinc-600' },
  { id: 'card_matrix', name: 'Matrix Code', category: 'cardback', price: 1500, desc: 'Lluvia digital verde.', rarity: 'EPIC', css: 'bg-black border-green-500 text-green-500 font-mono text-[6px] leading-none overflow-hidden' },
  { id: 'card_gold', name: 'Lingote 24K', category: 'cardback', price: 3000, desc: 'Oro sólido grabado.', rarity: 'LEGENDARY', css: 'bg-gradient-to-br from-yellow-200 via-yellow-500 to-yellow-700 border-yellow-200' },

  // --- CHAT ---
  { id: 'chat_cyan', name: 'Voz Neón', category: 'chat', price: 500, desc: 'Tu texto será Cian.', rarity: 'RARE', css: 'text-cyan-400 drop-shadow-[0_0_5px_cyan]' },
  { id: 'chat_gold', name: 'Voz Dorada', category: 'chat', price: 2000, desc: 'Tu texto será Dorado.', rarity: 'EPIC', css: 'text-yellow-400 font-bold drop-shadow-[0_0_5px_gold]' },
];

const CATEGORIES = [
  { id: 'all', label: 'TODO', icon: Star },
  { id: 'avatar', label: 'AVATARES', icon: User }, // NUEVA CATEGORIA
  { id: 'frame', label: 'MARCOS', icon: Aperture },
  { id: 'title', label: 'TÍTULOS', icon: Gem },
  { id: 'cardback', label: 'CARTAS', icon: Palette },
  { id: 'chat', label: 'CHAT', icon: MessageSquare },
];

export default function ShopPage() {
  const { coins, spendCoins } = useEconomy();
  const { items, equipped, buyItem, equipItem } = useInventory();
  const { playSound } = useAudio();
  
  const [activeTab, setActiveTab] = useState('all');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  const confirmPurchase = async () => {
    if (!selectedItem || processing) return;
    setProcessing(true);
    
    const success = await spendCoins(selectedItem.price, `Compra: ${selectedItem.name}`);
    if (success) {
        playSound('win');
        await buyItem(selectedItem.id, selectedItem.category);
        setSelectedItem(null);
    } else {
        playSound('error');
    }
    setProcessing(false);
  };

  const handleEquip = async (item: any) => {
      playSound('click');
      await equipItem(item.id, item.category);
  };

  const filteredCatalog = activeTab === 'all' ? CATALOG : CATALOG.filter(i => i.category === activeTab);

  const renderLivePreview = (item: any) => {
      // PREVIEW AVATAR (NUEVO)
      if (item.category === 'avatar') {
          const Icon = item.icon || User;
          return (
              <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 border-slate-700 shadow-2xl ${item.css}`}>
                  <Icon className="w-12 h-12"/>
                  {item.id === 'avatar_god' && <div className="absolute inset-0 bg-rose-500/20 animate-ping rounded-full"></div>}
              </div>
          );
      }
      if (item.category === 'frame') {
          return (
              <div className="relative flex items-center justify-center">
                  <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center relative z-10 ${item.css}`}>
                      <div className="w-full h-full rounded-full overflow-hidden bg-slate-800 flex items-center justify-center">
                          <span className="text-3xl font-black text-slate-600">ID</span>
                      </div>
                  </div>
                  <div className={`absolute inset-0 blur-xl opacity-50 ${item.rarity === 'LEGENDARY' ? 'bg-orange-500' : item.rarity === 'EPIC' ? 'bg-cyan-500' : 'bg-transparent'}`}></div>
              </div>
          );
      }
      if (item.category === 'title') {
          return (
              <div className="flex flex-col items-center gap-2">
                   <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-700 shadow-inner"></div>
                   <div className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border shadow-lg transform scale-110 ${item.css}`}>
                       {item.name}
                   </div>
              </div>
          );
      }
      if (item.category === 'cardback') {
          return (
              <div className="perspective-500">
                  <div className={`w-16 h-24 rounded-lg border-2 flex items-center justify-center relative shadow-2xl transform rotate-y-12 rotate-x-6 hover:rotate-y-0 hover:rotate-x-0 transition-transform duration-500 ${item.css}`}>
                      {item.id === 'card_matrix' && <div className="absolute inset-0 opacity-50 break-all p-1 text-[6px]">0101011010111010010101011</div>}
                      <div className="w-10 h-10 rounded-full border border-current flex items-center justify-center opacity-50 relative z-10">
                          <span className="text-[10px] font-bold">DR</span>
                      </div>
                  </div>
              </div>
          );
      }
      if (item.category === 'chat') {
          return (
              <div className="flex flex-col gap-2 w-full max-w-[140px]">
                  <div className="bg-slate-800/80 p-2 rounded-tr-xl rounded-bl-xl rounded-tl-xl border border-slate-700 self-start">
                      <p className={`text-xs ${item.css}`}>GG! Buena partida.</p>
                  </div>
              </div>
          );
      }
      return <div className="w-16 h-16 bg-slate-800 rounded animate-pulse"></div>;
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center p-4 font-mono text-white relative overflow-x-hidden selection:bg-purple-500/30">
        
        {/* FONDO */}
        <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-900/20 rounded-full blur-[150px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-cyan-900/20 rounded-full blur-[150px] animate-pulse" style={{animationDelay: '3s'}}></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-20"></div>
        </div>

        {/* MODAL CONFIRMACIÓN */}
        {selectedItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-700 p-8 rounded-[2rem] max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] transform scale-100 animate-in zoom-in-95 duration-200 relative overflow-hidden">
                    <h3 className="text-xl font-black italic uppercase text-white mb-6 text-center tracking-wider">Confirmar Adquisición</h3>
                    <div className="flex justify-center mb-8 scale-150 py-4">
                        {renderLivePreview(selectedItem)}
                    </div>
                    <div className="bg-black/40 p-4 rounded-xl mb-6 border border-slate-800 text-center">
                        <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Coste Total</p>
                        <div className="flex items-center justify-center gap-2 text-2xl font-black text-white">
                             {selectedItem.price} <Coins className="w-5 h-5 text-yellow-500"/>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setSelectedItem(null)} className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold hover:bg-slate-700 hover:text-white transition uppercase text-xs tracking-widest">Cancelar</button>
                        <button onClick={confirmPurchase} disabled={processing} className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-black text-white hover:scale-105 transition shadow-[0_0_20px_rgba(34,197,94,0.4)] uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                            {processing ? '...' : 'PAGAR AHORA'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* HEADER */}
        <div className="w-full max-w-7xl flex flex-col md:flex-row justify-between items-center mb-10 z-10 mt-6 relative gap-4">
            <Link href="/" className="absolute left-0 top-0 md:static p-3 bg-slate-900/50 backdrop-blur-md rounded-full border border-slate-700 hover:border-purple-500 transition-all group">
                <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-purple-500"/>
            </Link>
            <div className="text-center md:flex-1">
                <h1 className="text-4xl md:text-6xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 tracking-tighter uppercase drop-shadow-[0_0_25px_rgba(168,85,247,0.4)] animate-pulse">
                    BLACK MARKET
                </h1>
                <p className="text-[10px] text-purple-400/80 font-bold tracking-[0.8em] uppercase mt-1">Suministros Élite</p>
            </div>
            <div className="hidden md:block w-12"></div>
        </div>

        {/* NAVEGACIÓN CATEGORÍAS */}
        <div className="w-full max-w-7xl mb-8 z-10 overflow-x-auto pb-2 no-scrollbar">
            <div className="flex md:justify-center gap-3 min-w-max px-2">
                {CATEGORIES.map(cat => (
                    <button 
                        key={cat.id}
                        onClick={() => setActiveTab(cat.id)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-all border backdrop-blur-md ${activeTab === cat.id ? 'bg-purple-600/90 border-purple-400 text-white shadow-[0_0_25px_rgba(147,51,234,0.4)]' : 'bg-slate-900/40 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-500'}`}
                    >
                        <cat.icon className="w-3 h-3" />
                        {cat.label}
                    </button>
                ))}
            </div>
        </div>

        {/* GRID PRODUCTOS */}
        <div className="w-full max-w-7xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-20 relative z-10 px-2">
            {filteredCatalog.map((item) => {
                const isOwned = items?.includes(item.id);
                const isEquipped = equipped?.[item.category] === item.id;
                const canAfford = coins >= item.price;
                const rareData = RARITY[item.rarity as keyof typeof RARITY];

                return (
                    <div key={item.id} className={`group relative bg-slate-900/60 backdrop-blur-xl border ${rareData.border} rounded-3xl flex flex-col overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-2 hover:z-20 ${rareData.glow}`}>
                        <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-20">
                            <span className={`text-[9px] font-black px-2 py-1 rounded bg-black/50 border border-white/10 backdrop-blur-md ${rareData.color}`}>
                                {rareData.label}
                            </span>
                            {isOwned && <div className="bg-green-500 text-black p-1 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.8)]"><Check className="w-3 h-3 stroke-[4]"/></div>}
                        </div>

                        <div className={`relative h-56 flex items-center justify-center overflow-hidden bg-gradient-to-b ${rareData.bg}`}>
                            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-b from-white/10 to-transparent rotate-45 pointer-events-none"></div>
                            <div className="transform group-hover:scale-110 transition-transform duration-500 drop-shadow-2xl">
                                {renderLivePreview(item)}
                            </div>
                        </div>

                        <div className="p-5 flex flex-col flex-grow bg-slate-950/30">
                            <h3 className={`text-xl font-black italic uppercase tracking-tighter mb-1 ${rareData.color}`}>{item.name}</h3>
                            <p className="text-xs text-slate-400 font-medium leading-relaxed mb-6 h-[2.5em]">{item.desc}</p>
                            <div className="mt-auto">
                                {isOwned ? (
                                    isEquipped ? (
                                        <button disabled className="w-full py-3 bg-green-500/10 border border-green-500/30 text-green-500 font-black rounded-xl uppercase tracking-widest flex items-center justify-center gap-2 cursor-default">
                                            <Check className="w-4 h-4"/> Equipado
                                        </button>
                                    ) : (
                                        <button onClick={() => handleEquip(item)} className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-white/50 text-white font-bold rounded-xl uppercase tracking-widest transition-all hover:shadow-lg">
                                            EQUIPAR
                                        </button>
                                    )
                                ) : (
                                    <button 
                                        onClick={() => setSelectedItem(item)} 
                                        disabled={!canAfford}
                                        className={`w-full py-3 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all relative overflow-hidden group/btn ${canAfford ? 'bg-white text-black hover:bg-purple-400 hover:scale-[1.02] shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed grayscale'}`}
                                    >
                                        {!canAfford && <Lock className="w-3 h-3 absolute left-4"/>}
                                        <span>{item.price}</span>
                                        <Coins className={`w-4 h-4 ${canAfford ? 'text-yellow-600' : 'text-slate-600'}`}/>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
        <div className="mt-auto w-full max-w-4xl opacity-50 relative z-10"><AdSpace type="banner" /></div>
    </div>
  );
}