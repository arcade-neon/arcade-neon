'use client';

import { useState } from 'react';
import { signInWithPopup, signInAnonymously } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase'; // Importamos tu conexión
import { useRouter } from 'next/navigation';
import { Gamepad2, Ghost, Zap } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Entrar con Google
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
      router.push('/'); // Si sale bien, nos manda al Menú Principal
    } catch (err: any) {
      console.error(err);
      // ESTA ES LA LÍNEA NUEVA:
      alert("CÓDIGO DE ERROR: " + err.code + "\nMENSAJE: " + err.message); 
      
      setError('Error al conectar con Google. Inténtalo de nuevo.');
      setLoading(false);
    }
  };

  // 2. Entrar como Invitado (Anónimo)
  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      await signInAnonymously(auth);
      router.push('/');
   } catch (err: any) {
      console.error(err);
      // ESTA ES LA LÍNEA NUEVA:
      alert("CÓDIGO DE ERROR: " + err.code + "\nMENSAJE: " + err.message); 
      
      setError('Error al conectar con Google. Inténtalo de nuevo.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 relative overflow-hidden font-mono">
      
      {/* Fondo Animado (Nebula) */}
      <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] animate-pulse"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[500px] h-[500px] bg-cyan-600/20 rounded-full blur-[100px] animate-pulse delay-1000"></div>

      {/* Tarjeta de Login */}
      <div className="z-10 bg-slate-900/80 border border-slate-700 p-8 rounded-3xl shadow-2xl backdrop-blur-md w-full max-w-md text-center animate-in zoom-in duration-500">
        
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-purple-500 blur-lg opacity-50"></div>
            <Gamepad2 className="w-20 h-20 text-white relative z-10" />
          </div>
        </div>

        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-2">
          FAMILY ARCADE
        </h1>
        <p className="text-slate-500 text-xs tracking-[0.3em] uppercase mb-10">Identifícate, Jugador</p>

        {/* Botones */}
        <div className="space-y-4">
          
          {/* Botón Google */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:scale-100"
          >
            {loading ? (
              <Zap className="w-5 h-5 animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            {loading ? 'CONECTANDO...' : 'ENTRAR CON GOOGLE'}
          </button>

          {/* Separador */}
          <div className="flex items-center gap-4 text-xs text-slate-600 my-4">
            <div className="h-[1px] bg-slate-800 flex-1"></div>
            O
            <div className="h-[1px] bg-slate-800 flex-1"></div>
          </div>

          {/* Botón Invitado */}
          <button
            onClick={handleGuestLogin}
            disabled={loading}
            className="w-full bg-slate-800 text-slate-300 font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-700 hover:text-white transition-colors border border-slate-700"
          >
            <Ghost className="w-5 h-5" />
            ENTRAR COMO INVITADO
          </button>

        </div>

        {error && (
          <p className="mt-6 text-red-400 text-xs bg-red-500/10 py-2 rounded border border-red-500/20 animate-pulse">
            {error}
          </p>
        )}

      </div>

      <p className="absolute bottom-6 text-slate-600 text-[10px] tracking-widest">
        SECURE CONNECTION // FIREBASE V10
      </p>
    </div>
  );
}  