'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, setDoc, onSnapshot } from 'firebase/firestore';

interface InventoryContextType {
  items: string[]; // IDs de items comprados
  equipped: { [category: string]: string }; // { frame: 'gold', title: 'boss' }
  buyItem: (itemId: string, category: string) => Promise<void>;
  equipItem: (itemId: string, category: string) => Promise<void>;
  loading: boolean;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = useState<string[]>([]);
  const [equipped, setEquipped] = useState<any>({});
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(setUser);
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            setItems(data.inventory || []); // Lista de IDs comprados
            setEquipped(data.equipped || {}); // Objetos en uso
        }
        setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const buyItem = async (itemId: string, category: string) => {
      if (!user) return;
      const ref = doc(db, "users", user.uid);
      await updateDoc(ref, {
          inventory: arrayUnion(itemId)
      });
  };

  const equipItem = async (itemId: string, category: string) => {
      if (!user) return;
      const ref = doc(db, "users", user.uid);
      await updateDoc(ref, {
          [`equipped.${category}`]: itemId
      });
  };

  return (
    <InventoryContext.Provider value={{ items, equipped, buyItem, equipItem, loading }}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => useContext(InventoryContext);