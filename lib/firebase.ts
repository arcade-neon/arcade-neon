import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // <--- ESTO ES LO NUEVO IMPORTANTE

// --- AQUÍ PEGAS TUS LLAVES REALES ---
// Borra este bloque de abajo y pega lo que acabas de copiar de la web de Google
const firebaseConfig = {
  apiKey: "AIzaSyDSc4aCkzUTk7bBz78qTVTy_wrJeyxjPCI",
  authDomain: "family-arcade-pro.firebaseapp.com",
  projectId: "family-arcade-pro",
  storageBucket: "family-arcade-pro.firebasestorage.app",
  messagingSenderId: "396329005852",
  appId: "1:396329005852:web:422421ef6e1b947ee180d9"
};
// -------------------------------------

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app); // <--- ESTO ACTIVA LA BASE DE DATOS

export { auth, googleProvider, db };