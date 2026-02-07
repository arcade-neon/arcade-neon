'use client';

import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useAudio } from '@/contexts/AudioContext';

export default function VolumeControl() {
  const { isMuted, toggleMute } = useAudio();

  return (
    <button 
      onClick={toggleMute}
      className={`fixed bottom-4 left-4 z-50 p-3 rounded-full border transition-all duration-300 shadow-lg group backdrop-blur-md
        ${isMuted 
          ? 'bg-slate-900/80 border-slate-700 text-slate-500 hover:border-slate-500' 
          : 'bg-cyan-900/80 border-cyan-500 text-cyan-400 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] animate-pulse-slow'
        }`}
      title={isMuted ? "Activar Sonido" : "Silenciar"}
    >
      {isMuted ? (
        <VolumeX className="w-6 h-6" />
      ) : (
        <div className="relative">
           <Volume2 className="w-6 h-6 relative z-10" />
           {/* Onda visual de sonido */}
           <div className="absolute inset-0 rounded-full bg-cyan-400 opacity-20 animate-ping"></div>
        </div>
      )}
    </button>
  );
}