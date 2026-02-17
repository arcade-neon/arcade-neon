// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Gamepad2, User, Trophy, Search, Hash, 
  Grid3X3, Video, Ghost, Swords, Layers, 
  Skull, Activity, Bomb, LayoutList, ShoppingCart,
  Brain, Circle, Anchor, DollarSign, Share2, Zap, Coins, Plus, Disc, Crown,
  GripHorizontal, LogOut, Globe, Save, Loader2, Edit3, Hammer, MessageCircle // <--- AQUÍ ESTÁ EL ARREGLO
} from 'lucide-react';
import { auth, googleProvider, db } from '@/lib/firebase';
import { signInWithPopup, signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import AdSpace from '@/components/AdSpace';
import { useAudio } from '@/contexts/AudioContext';
import { useEconomy } from '@/contexts/EconomyContext';

// --- DICCIONARIO DE IDIOMAS ---
const TRANSLATIONS = {
  es: {
    title: 'IDENTIFÍCATE, JUGADOR',
    googleBtn: 'ENTRAR CON GOOGLE',
    guestBtn: 'ENTRAR COMO INVITADO',
    connecting: 'CONECTANDO...',
    or: 'O',
    error: 'Error de conexión'
  },
  en: {
    title: 'IDENTIFY YOURSELF, PLAYER',
    googleBtn: 'SIGN IN WITH GOOGLE',
    guestBtn: 'ENTER AS GUEST',
    connecting: 'CONNECTING...',
    or: 'OR',
    error: 'Connection error'
  },
  de: {
    title: 'IDENTIFIZIERE DICH, SPIELER',
    googleBtn: 'MIT GOOGLE ANMELDEN',
    guestBtn: 'ALS GAST BEITRETEN',
    connecting: 'VERBINDEN...',
    or: 'ODER',
    error: 'Verbindungsfehler'
  },
  fr: {
    title: 'IDENTIFIEZ-VOUS, JOUEUR',
    googleBtn: 'SE CONNECTER AVEC GOOGLE',
    guestBtn: 'ENTRER COMME INVITÉ',
    connecting: 'CONNEXION...',
    or: 'OU',
    error: 'Erreur de connexion'
  },
  it: {
    title: 'IDENTIFICATI, GIOCATORE',
    googleBtn: 'ACCEDI CON GOOGLE',
    guestBtn: 'ENTRA COME OSPITE',
    connecting: 'CONNESSIONE...',
    or: 'O',
    error: 'Errore di connessione'
  }
};

// --- CONFIGURACIÓN DE TUS JUEGOS ---
const GAMES = [
  // 0. SALA SOCIAL
  {
    id: 'chat', 
    title: 'social', 
    slogan: 'Busca un nuevo rival', 
    href: '/chat', 
    icon: MessageCircle, 
    color: 'cyan', 
    border: 'border-cyan-500', 
    shadow: 'shadow-[0_0_30px_rgba(6,182,212,0.4)]', 
    text: 'text-cyan-400', 
    bg: 'bg-cyan-950/40'
  },
  // 1. TOWER BLOXX
  {
    id: 'towerbloxx', 
    title: 'CONSTRUCCIONES', 
    slogan: 'CONSTRUYE ALTO', 
    href: '/game/tower', 
    icon: Hammer, 
    color: 'yellow', 
    border: 'border-yellow-500', 
    shadow: 'shadow-yellow-500/20', 
    text: 'text-yellow-400', 
    bg: 'bg-yellow-950/20'
  },
  // 2. UNO
  {
    id: 'uno', 
    title: 'UNO', 
    slogan: 'EL POPULAR JUEGO DE CARTAS', 
    href: '/game/uno', 
    icon: Layers, color: 'red', border: 'border-red-500', shadow: 'shadow-red-500/20', text: 'text-red-400', bg: 'bg-red-950/20'
  },
  // 3. BLOQUES
  {
    id: 'stack', 
    title: 'BLOQUES', 
    slogan: 'APILA Y GANA', 
    href: '/game/stack', 
    icon: Layers, 
    color: 'emerald', 
    border: 'border-emerald-500', 
    shadow: 'shadow-emerald-500/20', 
    text: 'text-emerald-400', 
    bg: 'bg-emerald-950/20'
  },
  // 4. HUNDIR LA FLOTA
  {
    id: 'battleship', 
    title: 'HUNDIR LA FLOTA', 
    slogan: 'FUEGO A DISCRECIÓN', 
    href: '/game/battleship', 
    icon: Anchor, color: 'cyan', border: 'border-cyan-500', shadow: 'shadow-cyan-500/20', text: 'text-cyan-400', bg: 'bg-cyan-950/20'
  },
  // 5. DAMAS PRO
  {
    id: 'checkers', 
    title: 'DAMAS PRO', 
    slogan: 'ESTRATEGIA MAESTRA', 
    href: '/game/checkers', 
    icon: Circle, color: 'rose', border: 'border-rose-500', shadow: 'shadow-rose-500/20', text: 'text-rose-400', bg: 'bg-rose-950/20'
  },
  // 6. DOMINO
  {
    id: 'domino', 
    title: 'DOMINO', 
    slogan: 'GOLPE EN LA MESA', 
    href: '/game/domino', 
    icon: GripHorizontal, color: 'yellow', border: 'border-yellow-500', shadow: 'shadow-yellow-500/20', text: 'text-yellow-400', bg: 'bg-yellow-950/20'
  },
  // 7. SOLITARIO
  {
    id: 'solitaire', title: 'SOLITARIO', slogan: 'CYBER DECK PRO', href: '/game/solitaire', 
    icon: Layers, color: 'blue', border: 'border-blue-500', shadow: 'shadow-blue-500/20', text: 'text-blue-400', bg: 'bg-blue-950/20'
  },
  // 8. PIEDRA PAPEL TIJERA
  {
    id: 'rps', title: 'PIEDRA PAPEL TIJERA', slogan: 'CLÁSICO RÁPIDO', href: '/game/rps', 
    icon: Swords, color: 'pink', border: 'border-pink-500', shadow: 'shadow-pink-500/20', text: 'text-pink-400', bg: 'bg-pink-950/20'
  },
  // 9. TRES EN RAYA
  {
    id: 'tictactoe', title: '3 EN RAYA', slogan: 'DUELO MENTAL', href: '/game/tictactoe', 
    icon: Hash, color: 'teal', border: 'border-teal-500', shadow: 'shadow-teal-500/20', text: 'text-teal-400', bg: 'bg-teal-950/20'
  },
  // 10. JUEGO DE LA SERPIENTE
  {
    id: 'snake', 
    title: 'JUEGO DE LA SERPIENTE', 
    slogan: 'COMO EN TU NOKIA', 
    href: '/game/snake', 
    icon: Activity, color: 'green', border: 'border-green-500', shadow: 'shadow-green-500/20', text: 'text-green-400', bg: 'bg-green-950/20'
  },
  // 11. SOPA DE LETRAS
  {
    id: 'wordsearch', title: 'SOPA DE LETRAS', slogan: 'BUSCA Y ENCUENTRA', href: '/game/wordsearch', 
    icon: Search, color: 'sky', border: 'border-sky-500', shadow: 'shadow-sky-500/20', text: 'text-sky-400', bg: 'bg-sky-950/20'
  },
  // 12. SUDOKU
  {
    id: 'sudoku', title: 'SUDOKU', slogan: 'LÓGICA PURA', href: '/game/sudoku', 
    icon: Grid3X3, color: 'indigo', border: 'border-indigo-500', shadow: 'shadow-indigo-500/20', text: 'text-indigo-400', bg: 'bg-indigo-950/20'
  },
  // 13. JUEGO DE LAS PAREJAS
  {
    id: 'memory', 
    title: 'JUEGO DE LAS PAREJAS', 
    slogan: 'MEMORIA VISUAL', 
    href: '/game/memory', 
    icon: Brain, color: 'fuchsia', border: 'border-fuchsia-500', shadow: 'shadow-fuchsia-500/20', text: 'text-fuchsia-400', bg: 'bg-fuchsia-950/20'
  },
  // 14. CONNECT 4
  {
    id: 'connect4', title: 'CONNECT 4', slogan: 'ESTRATEGIA VERTICAL', href: '/game/connect4', 
    icon: Circle, color: 'orange', border: 'border-orange-500', shadow: 'shadow-orange-500/20', text: 'text-orange-400', bg: 'bg-orange-950/20'
  },
  // 15. TETRIS
  {
    id: 'tetris', title: 'TETRIX', slogan: 'ENCAJA LAS PIEZAS', href: '/game/tetris', 
    icon: Gamepad2, color: 'purple', border: 'border-purple-500', shadow: 'shadow-purple-500/20', text: 'text-purple-400', bg: 'bg-purple-950/20'
  },
  // 16. AHORCADO
  {
    id: 'hangman', title: 'EL AHORCADO', slogan: 'ADIVINA O MUERE', href: '/game/hangman', 
    icon: Skull, color: 'rose', border: 'border-rose-600', shadow: 'shadow-rose-600/20', text: 'text-rose-500', bg: 'bg-rose-950/20'
  },
  // 17. BUSCAMINAS
  {
    id: 'mines', title: 'BUSCAMINAS', slogan: 'RIESGO PURO', href: '/game/minesweeper', 
    icon: Bomb, color: 'pink', border: 'border-pink-500', shadow: 'shadow-pink-500/20', text: 'text-pink-400', bg: 'bg-pink-950/20'
  },
  // 18. BLACKJACK
  {
    id: 'blackjack', title: 'BLACKJACK', slogan: 'DESAFÍA LA BANCA', href: '/game/blackjack', 
    icon: DollarSign, color: 'emerald', border: 'border-emerald-500', shadow: 'shadow-emerald-500/20', text: 'text-emerald-400', bg: 'bg-emerald-950/20'
  },
  // 19. NEON SLOTS
  {
    id: 'slots', 
    title: 'NEON SLOTS', 
    slogan: 'JACKPOT CITY', 
    href: '/game/slots', 
    icon: Zap, color: 'violet', border: 'border-violet-500', shadow: 'shadow-violet-500/20', text: 'text-violet-400', bg: 'bg-violet-950/20'
  },
  // 20. SIMÓN DICE
  {
    id: 'simon', 
    title: 'SIMÓN DICE', 
    slogan: 'MEMORIA NEURAL', 
    href: '/game/simon', 
    icon: Zap, 
    color: 'yellow', 
    border: 'border-yellow-500', 
    shadow: 'shadow-yellow-500/20', 
    text: 'text-yellow-400', 
    bg: 'bg-yellow-950/20'
  },
  // 21. AJEDREZ
  {
    id: 'chess', 
    title: 'AJEDREZ', 
    slogan: 'JAQUE MATE NEON', 
    href: '/game/chess', 
    icon: Crown, 
    color: 'purple', 
    border: 'border-purple-500', 
    shadow: 'shadow-purple-500/20', 
    text: 'text-purple-400', 
    bg: 'bg-purple-950/20'
  },
  // 22. TIENDA
  {
    id: 'shop', title: 'TIENDA', slogan: 'SKINS & UPGRADES', href: '/shop', 
    icon: ShoppingCart, color: 'indigo', border: 'border-indigo-500', shadow: 'shadow-indigo-500/20', text: 'text-indigo-400', bg: 'bg-indigo-950/20'
  },
  // 23. RANKING
  {
    id: 'ranking', title: 'RANKING', slogan: 'TOP MUNDIAL', href: '/leaderboard', 
    icon: Trophy, color: 'amber', border: 'border-amber-500', shadow: 'shadow-amber-500/20', text: 'text-amber-400', bg: 'bg-amber-950/20'
  }
];

// --- 1. LOGIN ---
const LoginScreen = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState('es');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const t = TRANSLATIONS[lang as keyof typeof TRANSLATIONS] || TRANSLATIONS.es;

  const handleGoogle = async () => {
    setLoading(true); setError('');
    try { await signInWithPopup(auth, googleProvider); } 
    catch (e) { console.error(e); setError(t.error); setLoading(false); }
  };

  const handleGuest = async () => {
    setLoading(true); setError('');
    try { await signInAnonymously(auth); } 
    catch (e) { console.error(e); setError(t.error); setLoading(false); }
  };

  const languages = [
    { code: 'es', label: 'ESPAÑOL', flag: '🇪🇸' },
    { code: 'en', label: 'ENGLISH', flag: '🇺🇸' },
    { code: 'de', label: 'DEUTSCH', flag: '🇩🇪' },
    { code: 'fr', label: 'FRANÇAIS', flag: '🇫🇷' },
    { code: 'it', label: 'ITALIANO', flag: '🇮🇹' },
  ];

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 relative overflow-hidden font-mono">
      <div className="absolute top-6 right-6 z-50">
        <button 
          onClick={() => setShowLangMenu(!showLangMenu)}
          className="flex items-center gap-2 bg-slate-900/80 border border-slate-700 px-4 py-2 rounded-full text-white hover:border-emerald-500 transition-colors"
        >
          <Globe size={16} className="text-emerald-400"/>
          <span className="text-xs font-bold">{languages.find(l => l.code === lang)?.code.toUpperCase()}</span>
        </button>
        {showLangMenu && (
          <div className="absolute right-0 mt-2 w-40 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            {languages.map((l) => (
              <button key={l.code} onClick={() => { setLang(l.code); setShowLangMenu(false); }} className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center justify-between hover:bg-slate-800 ${lang === l.code ? 'text-emerald-400 bg-slate-800' : 'text-slate-400'}`}>
                <span>{l.label}</span>
                <span>{l.flag}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="z-10 bg-slate-900/80 border border-slate-700 p-8 rounded-3xl shadow-2xl backdrop-blur-md w-full max-w-md text-center animate-in zoom-in duration-500">
        <div className="mb-8 flex justify-center"><div className="relative"><div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-purple-500 blur-lg opacity-50"></div><Gamepad2 className="w-20 h-20 text-white relative z-10" /></div></div>
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-2">FAMILY ARCADE</h1>
        <p className="text-slate-500 text-xs tracking-[0.3em] uppercase mb-10">{t.title}</p>
        <div className="space-y-4">
          <button onClick={handleGoogle} disabled={loading} className="w-full bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:scale-105 transition-transform">
            {loading ? <Zap className="w-5 h-5 animate-spin" /> : <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>}
            {loading ? t.connecting : t.googleBtn}
          </button>
          <div className="flex items-center gap-4 text-xs text-slate-600 my-4"><div className="h-[1px] bg-slate-800 flex-1"></div>{t.or}<div className="h-[1px] bg-slate-800 flex-1"></div></div>
          <button onClick={handleGuest} disabled={loading} className="w-full bg-slate-800 text-slate-300 font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-700 transition-colors border border-slate-700">
            <Ghost className="w-5 h-5" /> {t.guestBtn}
          </button>
        </div>
        {error && <p className="mt-6 text-red-400 text-xs animate-pulse">{error}</p>}
      </div>
    </div>
  );
};

// --- 2. DASHBOARD ---
const Dashboard = ({ user }: { user: any }) => {
  const { playSound } = useAudio();
  const { coins } = useEconomy(); 
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nickname, setNickname] = useState('');
  const [savingNick, setSavingNick] = useState(false);

  useEffect(() => {
    const checkNickname = async () => {
        if (!user) return;
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists() || !userSnap.data().nickname) {
                setShowNicknameModal(true);
            }
        } catch (error) { console.error("Error verificando apodo:", error); }
    };
    checkNickname();
  }, [user]);

  const handleSaveNickname = async () => {
      if (nickname.trim().length < 3) return alert("El apodo debe tener al menos 3 letras.");
      setSavingNick(true);
      try {
          await setDoc(doc(db, "users", user.uid), {
              nickname: nickname.trim(),
              email: user.email,
              createdAt: new Date(),
              photoURL: user.photoURL
          }, { merge: true });
          setShowNicknameModal(false);
      } catch (error) { console.error("Error guardando apodo:", error); } 
      finally { setSavingNick(false); }
  };

  const scrollToGames = () => {
    playSound('click');
    const section = document.getElementById('games-section');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  };

  const SoundLink = ({ href, className, children, onClick }: any) => (
    <Link href={href} className={className} onMouseEnter={() => playSound('hover')} onClick={(e) => { playSound('click'); if(onClick) onClick(e); }}>{children}</Link>
  );

  return (
    <div className="min-h-screen bg-[#050b14] flex flex-col items-center p-4 font-mono select-none overflow-x-hidden">
      
      {showNicknameModal && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-[#0f172a] border border-emerald-500/50 p-8 rounded-3xl w-full max-w-sm text-center shadow-[0_0_60px_rgba(16,185,129,0.2)]">
                <h2 className="text-3xl font-black text-white mb-2 italic uppercase tracking-tighter">IDENTIDAD</h2>
                <div className="relative mb-4">
                    <input type="text" placeholder="TU APODO..." value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={12} className="w-full bg-slate-950 border-2 border-slate-700 text-white text-center font-black text-xl py-4 rounded-2xl focus:border-emerald-500 focus:outline-none uppercase placeholder:text-slate-700 transition-all shadow-inner" autoFocus />
                </div>
                <button onClick={handleSaveNickname} disabled={savingNick || nickname.length < 3} className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black py-4 rounded-2xl shadow-lg shadow-emerald-900/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group">
                    {savingNick ? <Loader2 className="animate-spin" /> : <Save className="group-hover:scale-110 transition-transform"/>} CONFIRMAR Y ENTRAR
                </button>
            </div>
        </div>
      )}

      <div className="w-full max-w-[1400px] flex justify-between items-center mb-8 relative z-10 mt-4">
        <div>
           <h1 className="text-3xl md:text-5xl font-black text-white italic tracking-tighter">
             DAYTHA <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-600">RIVALS</span>
           </h1>
           <p className="text-[10px] md:text-xs text-slate-500 font-bold tracking-[0.4em] pl-1 uppercase mt-1">ARCADE COMPETITIVO</p>
        </div>
        <div className="flex gap-3 items-center">
            <div className="bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-full border border-yellow-500/30 flex items-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.1)] group cursor-pointer hover:border-yellow-500 transition-all">
                <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-md"><Coins className="w-3 h-3 text-black fill-current" /></div>
                <span className="text-sm font-black text-yellow-400 tabular-nums">{coins.toLocaleString()}</span>
                <Link href="/shop" className="bg-slate-800 rounded-full w-5 h-5 flex items-center justify-center hover:bg-yellow-500 hover:text-black transition"><Plus className="w-3 h-3"/></Link>
            </div>
            <button onClick={() => signOut(auth)} className="bg-slate-900/80 backdrop-blur-md p-2 rounded-full border border-slate-700 hover:border-red-500 hover:bg-red-950/30 transition-all group shadow-lg"><LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-400"/></button>
            <SoundLink href="/profile" className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-md pl-4 pr-1 py-1 rounded-full border border-slate-700 hover:border-pink-500 transition-all group shadow-lg">
               <span className="text-[10px] font-bold text-slate-300 group-hover:text-white hidden sm:block">{user ? user.displayName || 'JUGADOR' : 'MI PERFIL'}</span>
               <div className="w-8 h-8 bg-gradient-to-tr from-pink-600 to-purple-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><User className="w-4 h-4 text-white" /></div>
            </SoundLink>
        </div>
      </div>

      <div className="w-full max-w-[1400px] mb-12 relative">
         <div className="flex justify-between items-end mb-4 px-2">
            <h2 className="text-sm font-bold text-slate-400 flex items-center gap-2 uppercase tracking-widest"><Trophy className="w-4 h-4 text-yellow-500"/> Zona de Retos</h2>
            <button onClick={scrollToGames} className="px-5 py-2 bg-slate-900 border border-slate-700 rounded-full text-[10px] font-bold text-white hover:bg-slate-800 hover:border-blue-500 transition flex items-center gap-2 group shadow-lg"><Share2 className="w-3 h-3 group-hover:text-blue-500 transition-colors" /> CREAR SALA</button>
         </div>
         <div className="w-full bg-gradient-to-r from-slate-900 to-slate-900/50 border border-slate-800 rounded-3xl p-8 relative overflow-hidden group shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all duration-1000"></div>
            <div className="relative z-10 flex justify-between items-center">
               <div>
                  <p className="text-[10px] text-blue-400 font-bold tracking-[0.2em] mb-2 uppercase">Tu Estado Actual</p>
                  <h3 className="text-4xl md:text-6xl font-black text-white italic tracking-tighter mb-4 drop-shadow-lg">NOVATO</h3>
                  <div className="h-2 w-48 bg-slate-800 rounded-full overflow-hidden border border-slate-700"><div className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 w-[10%] shadow-[0_0_10px_cyan]"></div></div>
               </div>
               <Gamepad2 className="w-24 h-24 md:w-32 md:h-32 text-slate-800 group-hover:text-blue-500/10 transition-all duration-500 transform group-hover:scale-110 group-hover:rotate-12" />
            </div>
         </div>
      </div>

      <div id="games-section" className="w-full max-w-[1400px] pb-20">
         <div className="flex items-center gap-4 mb-6 px-2"><div className="h-px bg-slate-800 flex-1"></div><p className="text-[10px] text-slate-500 font-bold tracking-[0.3em] uppercase">Selecciona tu Juego</p><div className="h-px bg-slate-800 flex-1"></div></div>
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {GAMES.map((game) => (
                <SoundLink key={game.id} href={game.href} className={`group relative rounded-2xl border-2 ${game.border} bg-[#0a0f1e] p-6 flex flex-col items-center justify-center gap-4 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 hover:shadow-2xl ${game.shadow} overflow-hidden min-h-[180px]`}>
                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-b ${game.bg} to-transparent pointer-events-none`}></div>
                    <div className={`relative z-10 w-16 h-16 rounded-full border-2 ${game.border} flex items-center justify-center bg-black/50 backdrop-blur-sm group-hover:shadow-[0_0_20px_currentColor] ${game.text} transition-all duration-300`}><game.icon className="w-8 h-8" strokeWidth={1.5} /></div>
                    <div className="relative z-10 text-center space-y-2 w-full"><h2 className={`text-xl font-black italic tracking-tighter text-white group-hover:tracking-widest transition-all duration-300 drop-shadow-md uppercase`}>{game.title}</h2><div className={`inline-block px-3 py-1 rounded-full border ${game.border} bg-black/40 backdrop-blur-sm`}><p className={`text-[8px] font-bold uppercase tracking-[0.2em] ${game.text}`}>{game.slogan}</p></div></div>
                </SoundLink>
            ))}
         </div>
      </div>
      <div className="w-full max-w-md opacity-40 hover:opacity-100 transition-opacity duration-500 pb-6 z-10"><AdSpace type="banner" /></div>
    </div>
  );
};

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-[#020617] flex items-center justify-center"><Zap className="w-10 h-10 text-cyan-500 animate-spin"/></div>;
  }

  if (!user) return <LoginScreen />;
  return <Dashboard user={user} />;
}