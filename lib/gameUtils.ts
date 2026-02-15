// lib/gameUtils.ts
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';

// Esta función busca el apodo automáticamente y guarda el score
export const saveGameScore = async (userId: string, gameId: string, score: number) => {
  if (!userId || score === 0) return;

  try {
    // 1. Buscamos el APODO real del usuario
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    
    let playerName = 'Anónimo';
    let playerPhoto = null;

    if (userSnap.exists()) {
      const data = userSnap.data();
      playerName = data.nickname || data.displayName || 'Jugador';
      playerPhoto = data.photoURL || null;
    }

    // 2. Definimos la colección según el juego (ej: scores_stack, scores_uno)
    const collectionName = `scores_${gameId}`;

    // 3. Guardamos la puntuación con el APODO correcto
    await addDoc(collection(db, collectionName), {
      uid: userId,
      name: playerName, // <--- AQUÍ VA EL APODO
      score: score,
      photo: playerPhoto,
      date: serverTimestamp()
    });

    console.log(`✅ Puntuación guardada en ${collectionName}: ${score} para ${playerName}`);

  } catch (error) {
    console.error("❌ Error guardando score global:", error);
  }
};