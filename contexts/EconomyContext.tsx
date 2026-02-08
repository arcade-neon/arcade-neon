'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, increment, arrayUnion, onSnapshot } from 'firebase/firestore';
import { useAudio } from '@/contexts/AudioContext';

interface EconomyContextType {
  coins: number;
  addCoins: (amount: number, reason: string) => Promise<void>;
  spendCoins: (amount: number, item: string) => Promise<boolean>;
  loading: boolean;
}

const EconomyContext = createContext<EconomyContextType | undefined>(undefined);

export const EconomyProvider = ({ children }: { children: React.ReactNode }) => {
  const [coins, setCoins] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { playSound } = useAudio(); // Usaremos esto para sonido de monedas

  // Escuchar usuario
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (!u) {
        setCoins(0);
        setLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  // Escuchar saldo en tiempo real
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    
    const unsubCoin = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setCoins(docSnap.data().coins || 0);
      } else {
        // Si el usuario no tiene perfil, crearlo con regalo de bienvenida
        setDoc(userRef, { coins: 100, email: user.email, joinedAt: new Date() }, { merge: true });
        setCoins(100);
      }
      setLoading(false);
    });

    return () => unsubCoin();
  }, [user]);

  // Función para INGRESAR dinero
  const addCoins = async (amount: number, reason: string) => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        coins: increment(amount),
        history: arrayUnion({ type: 'income', amount, reason, date: new Date().toISOString() })
      });
      
      // Reproducir sonido de moneda (si tienes un archivo coin.mp3 sería ideal, si no usa 'win')
      // playSound('coin'); 
      console.log(`🤑 Ingresados ${amount} por ${reason}`);
    } catch (e) {
      console.error("Error adding coins:", e);
    }
  };

  // Función para GASTAR dinero
  const spendCoins = async (amount: number, item: string): Promise<boolean> => {
    if (!user) return false;
    if (coins < amount) {
      alert("❌ Fondos insuficientes. ¡Juega más para ganar monedas!");
      return false;
    }

    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        coins: increment(-amount),
        history: arrayUnion({ type: 'expense', amount, item, date: new Date().toISOString() })
      });
      return true;
    } catch (e) {
      console.error("Error spending coins:", e);
      return false;
    }
  };

  return (
    <EconomyContext.Provider value={{ coins, addCoins, spendCoins, loading }}>
      {children}
    </EconomyContext.Provider>
  );
};

export const useEconomy = () => {
  const context = useContext(EconomyContext);
  if (context === undefined) throw new Error('useEconomy must be used within an EconomyProvider');
  return context;
};