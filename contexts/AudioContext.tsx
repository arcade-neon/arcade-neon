'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

// Tipos de sonidos disponibles
type SoundType = 'click' | 'hover' | 'win' | 'lose' | 'bgm';

interface AudioContextType {
  playSound: (type: SoundType) => void;
  isMuted: boolean;
  toggleMute: () => void;
  volume: number;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider = ({ children }: { children: React.ReactNode }) => {
  const [isMuted, setIsMuted] = useState(true); // Empieza muteado por cortesía (política de navegadores)
  const [volume, setVolume] = useState(0.5);
  
  // Referencias a los objetos de audio para no recargarlos
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Precargar sonidos
    const sounds = ['click', 'hover', 'win', 'lose'];
    sounds.forEach(sound => {
      const audio = new Audio(`/sounds/${sound}.mp3`);
      audio.volume = volume;
      audioRefs.current[sound] = audio;
    });

    // Configurar música de fondo
    const bgm = new Audio('/sounds/bgm.mp3');
    bgm.loop = true;
    bgm.volume = volume * 0.5; // La música un poco más baja que los efectos
    bgmRef.current = bgm;

    return () => {
      // Limpieza
      sounds.forEach(s => { if(audioRefs.current[s]) audioRefs.current[s] = null; });
      if (bgmRef.current) { bgmRef.current.pause(); bgmRef.current = null; }
    };
  }, []);

  // Efecto para manejar el cambio de volumen/mute en tiempo real
  useEffect(() => {
    Object.values(audioRefs.current).forEach(audio => {
      if (audio) {
        audio.muted = isMuted;
        audio.volume = volume;
      }
    });
    if (bgmRef.current) {
      bgmRef.current.muted = isMuted;
      bgmRef.current.volume = volume * 0.5;
      // Si desmuteamos, intentamos reproducir la música
      if (!isMuted) {
        bgmRef.current.play().catch(e => console.log("Interacción requerida para audio:", e));
      } else {
        bgmRef.current.pause();
      }
    }
  }, [isMuted, volume]);

  const playSound = (type: SoundType) => {
    if (isMuted) return;
    
    // Si es música, ya se maneja sola
    if (type === 'bgm') return;

    const audio = audioRefs.current[type];
    if (audio) {
      audio.currentTime = 0; // Reiniciar si ya estaba sonando (para clicks rápidos)
      audio.play().catch(e => console.error("Error playing sound:", e));
    }
  };

  const toggleMute = () => setIsMuted(prev => !prev);

  return (
    <AudioContext.Provider value={{ playSound, isMuted, toggleMute, volume }}>
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};