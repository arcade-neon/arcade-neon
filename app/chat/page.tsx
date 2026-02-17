// @ts-nocheck
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Send, Users, MessageSquare, Lock, Unlock, 
  ShieldAlert, Crown, Gamepad2, X, Globe, User, Bell, ChevronRight, Menu
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { 
  collection, addDoc, query, orderBy, limit, onSnapshot, 
  serverTimestamp, doc, setDoc, deleteDoc, updateDoc, where, getDoc 
} from 'firebase/firestore';
import { useAudio } from '@/contexts/AudioContext';

// --- COMPONENTE DE MENSAJE MEJORADO ---
const ChatMessage = ({ msg, isMe, onInteract }) => (
  <div className={`flex flex-col mb-4 ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}>
    <div className={`flex items-end gap-3 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      
      {/* AVATAR */}
      <div 
          onClick={() => !isMe && onInteract(msg.uid, msg.sender)}
          className={`w-9 h-9 min-w-[36px] rounded-full flex items-center justify-center text-xs font-black shadow-lg cursor-pointer transition-transform hover:scale-110 ${
            isMe 
            ? 'bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white ring-2 ring-white/20' 
            : 'bg-slate-700 text-slate-300 hover:bg-slate-600 ring-1 ring-slate-600'
          }`}
      >
          {msg.sender ? msg.sender[0].toUpperCase() : '?'}
      </div>

      {/* BURBUJA DE MENSAJE */}
      <div className={`px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-md relative ${
        isMe 
          ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-tr-none shadow-purple-900/20' // TU COLOR DESTACADO
          : 'bg-[#1e293b] border border-slate-700 text-slate-200 rounded-tl-none' // COLOR DE OTROS
      }`}>
        {!isMe && (
            <div 
                className="text-[10px] text-indigo-400 font-bold mb-1 cursor-pointer hover:underline uppercase tracking-wide flex items-center gap-1" 
                onClick={() => onInteract(msg.uid, msg.sender)}
            >
                {msg.sender}
            </div>
        )}
        <span className="break-words font-medium">{msg.text}</span>
      </div>
    </div>
    
    {/* HORA */}
    <span className={`text-[9px] text-slate-500 mt-1 px-14 font-medium ${isMe ? 'text-right' : 'text-left'}`}>
        {msg.time ? new Date(msg.time.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...'}
    </span>
  </div>
);

// --- COMPONENTE PRINCIPAL ---
export default function SocialLobby() {
  const [user, setUser] = useState(null);
  const [myNickname, setMyNickname] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeTab, setActiveTab] = useState<'GLOBAL' | 'PRIVATE'>('GLOBAL');
  
  // UX UI STATES
  const [showUsersMobile, setShowUsersMobile] = useState(false); // Para ver lista en móvil
  
  // LOGIC STATES
  const [selectedUser, setSelectedUser] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [activePrivateChat, setActivePrivateChat] = useState(null);
  const [activePrivateChatName, setActivePrivateChatName] = useState('');
  const [privateMessages, setPrivateMessages] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);

  const { playSound } = useAudio();
  const dummyDiv = useRef(null);

  // 1. CARGAR USUARIO
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        let finalNick = u.displayName || 'Invitado';
        try {
            const userDoc = await getDoc(doc(db, "users", u.uid));
            if (userDoc.exists() && userDoc.data().nickname) {
                finalNick = userDoc.data().nickname;
            }
        } catch (error) { console.error(error); }
        setMyNickname(finalNick);

        // Registrar Online
        const userRef = doc(db, "online_users", u.uid);
        await setDoc(userRef, {
            uid: u.uid,
            name: finalNick,
            status: 'online',
            lastSeen: serverTimestamp()
        });

        const localBlocked = localStorage.getItem('blocked_users');
        if (localBlocked) setBlockedUsers(JSON.parse(localBlocked));
        window.addEventListener('beforeunload', () => deleteDoc(userRef));
      }
    });
    return () => unsubAuth();
  }, []);

  // 2. CHAT GLOBAL
  useEffect(() => {
    const q = query(collection(db, "messages_public"), orderBy("time", "desc"), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
      const filtered = msgs.filter(m => !blockedUsers.includes(m.uid));
      setMessages(filtered);
      setTimeout(() => dummyDiv.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsub();
  }, [blockedUsers]);

  // 3. USUARIOS ONLINE
  useEffect(() => {
    const q = query(collection(db, "online_users"), limit(100)); // Límite alto para ver lista entera
    const unsub = onSnapshot(q, (snap) => {
        setOnlineUsers(snap.docs.map(d => d.data()));
    });
    return () => unsub();
  }, []);

  // 4. INVITACIONES
  useEffect(() => {
      if(!user) return;
      const q = query(collection(db, "chat_invites"), where("to", "==", user.uid), where("status", "==", "pending"));
      const unsub = onSnapshot(q, (snap) => {
          setInvitations(snap.docs.map(d => ({id: d.id, ...d.data()})));
          if(!snap.empty) playSound('pop');
      });
      return () => unsub();
  }, [user]);

  // 5. CHAT PRIVADO
  useEffect(() => {
      if (!activePrivateChat) return;
      const q = query(collection(db, `private_chats/${activePrivateChat}/messages`), orderBy("time", "asc"));
      const unsub = onSnapshot(q, (snap) => {
          setPrivateMessages(snap.docs.map(d => d.data()));
          setTimeout(() => dummyDiv.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      });
      return () => unsub();
  }, [activePrivateChat]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !user) return;
    const text = input.trim();
    setInput('');

    try {
        const collectionName = activeTab === 'GLOBAL' ? "messages_public" : `private_chats/${activePrivateChat}/messages`;
        await addDoc(collection(db, collectionName), {
            text,
            uid: user.uid,
            sender: myNickname,
            time: serverTimestamp()
        });
    } catch (error) { console.error(error); }
  };

  const sendPrivateInvite = async (targetUid, targetName) => {
      if(!user) return;
      await addDoc(collection(db, "chat_invites"), {
          from: user.uid,
          fromName: myNickname,
          to: targetUid,
          status: 'pending',
          createdAt: serverTimestamp()
      });
      alert(`Invitación enviada a ${targetName}`);
      setSelectedUser(null);
  };

  const acceptInvite = async (invite) => {
      const chatRoomId = [user.uid, invite.from].sort().join('_');
      await updateDoc(doc(db, "chat_invites", invite.id), { status: 'accepted' });
      setActivePrivateChat(chatRoomId);
      setActivePrivateChatName(invite.fromName);
      setActiveTab('PRIVATE');
      setInvitations(prev => prev.filter(i => i.id !== invite.id));
  };

  const handleBlockUser = (uidToBlock) => {
      if (confirm("¿Bloquear usuario? No verás sus mensajes públicos.")) {
          const newBlocked = [...blockedUsers, uidToBlock];
          setBlockedUsers(newBlocked);
          localStorage.setItem('blocked_users', JSON.stringify(newBlocked));
          setSelectedUser(null);
      }
  };

  return (
    <div className="fixed inset-0 bg-[#0f172a] flex flex-col font-sans text-slate-200 overflow-hidden">
      
      {/* 1. HEADER (Elegante) */}
      <div className="bg-[#1e293b]/90 border-b border-slate-700/50 p-3 flex justify-between items-center backdrop-blur-md z-20 shadow-md">
        <Link href="/" className="p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
        </Link>
        
        <div className="flex flex-col items-center">
            <h1 className="text-sm font-black tracking-widest text-white flex items-center gap-2 uppercase">
                <Globe size={14} className="text-indigo-500" /> SOCIAL HUB
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold text-slate-400">{onlineUsers.length} ONLINE</span>
            </div>
        </div>

        {/* BOTÓN TOGGLE LISTA USUARIOS (Visible solo en móvil) */}
        <button 
            onClick={() => setShowUsersMobile(!showUsersMobile)}
            className="md:hidden p-2 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
        >
            {showUsersMobile ? <X size={20}/> : <Users size={20}/>}
        </button>
        <div className="hidden md:block w-10"></div> 
      </div>

      <div className="flex-1 flex relative overflow-hidden bg-[#0f172a]">
          
          {/* 2. SIDEBAR - LISTA DE USUARIOS (Izquierda) */}
          {/* En PC: Siempre visible (w-72). En Móvil: Absoluto sobre el chat si showUsersMobile es true */}
          <div className={`
              absolute md:relative z-10 h-full w-72 bg-[#1e293b] border-r border-slate-700/50 flex flex-col transition-transform duration-300 ease-in-out
              ${showUsersMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
          `}>
              <div className="p-4 border-b border-slate-700/50 bg-[#1e293b]">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Users size={14} className="text-emerald-500"/> JUGADORES EN LÍNEA
                  </h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar bg-[#111827]">
                  {onlineUsers.map(u => (
                      <button 
                        key={u.uid} 
                        onClick={() => { u.uid !== user?.uid && setSelectedUser(u); setShowUsersMobile(false); }} 
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group border border-transparent ${u.uid === user?.uid ? 'bg-indigo-500/10 border-indigo-500/30' : 'hover:bg-slate-800 hover:border-slate-700'}`}
                      >
                          <div className="relative">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shadow-sm transition-colors ${u.uid === user?.uid ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-white'}`}>
                                  {u.name[0].toUpperCase()}
                              </div>
                              <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#111827] rounded-full"></div>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                              <div className={`text-sm font-bold truncate ${u.uid === user?.uid ? 'text-indigo-400' : 'text-slate-300 group-hover:text-white'}`}>
                                  {u.name} {u.uid === user?.uid && '(Tú)'}
                              </div>
                              <div className="text-[10px] text-slate-500 group-hover:text-slate-400">Conectado</div>
                          </div>
                      </button>
                  ))}
              </div>
          </div>

          {/* 3. AREA DE CHAT (Derecha) */}
          <div className="flex-1 flex flex-col relative bg-gradient-to-b from-[#0f172a] to-[#1e293b]">
              
              {/* TABS */}
              <div className="flex bg-[#1e293b]/80 border-b border-slate-700/50 backdrop-blur-sm">
                  <button 
                    onClick={() => setActiveTab('GLOBAL')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest flex justify-center items-center gap-2 transition-all border-b-2 ${activeTab === 'GLOBAL' ? 'text-indigo-400 border-indigo-500 bg-indigo-500/5' : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/5'}`}
                  >
                      <Globe size={14}/> GLOBAL
                  </button>
                  <button 
                    onClick={() => setActiveTab('PRIVATE')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest flex justify-center items-center gap-2 transition-all border-b-2 relative ${activeTab === 'PRIVATE' ? 'text-purple-400 border-purple-500 bg-purple-500/5' : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/5'}`}
                  >
                      <Lock size={14}/> {activePrivateChatName ? activePrivateChatName : 'PRIVADO'}
                      {invitations.length > 0 && (
                          <span className="absolute top-2 right-[25%] flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-[#1e293b]"></span>
                          </span>
                      )}
                  </button>
              </div>

              {/* MESSAGES CONTAINER */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2 bg-[#0f172a]">
                  {activeTab === 'GLOBAL' ? (
                      messages.length > 0 ? (
                          messages.map(msg => (
                              <ChatMessage 
                                key={msg.id} 
                                msg={msg} 
                                isMe={msg.uid === user?.uid} 
                                onInteract={(uid, name) => setSelectedUser({uid, name})} 
                              />
                          ))
                      ) : (
                          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4 opacity-40">
                              <MessageSquare size={48} strokeWidth={1} />
                              <p className="text-xs font-medium uppercase tracking-widest">El chat está tranquilo...</p>
                          </div>
                      )
                  ) : activePrivateChat ? (
                      privateMessages.map((msg, i) => (
                          <ChatMessage 
                            key={i} 
                            msg={msg} 
                            isMe={msg.uid === user?.uid} 
                            onInteract={()=>{}} 
                          />
                      ))
                  ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-6 px-6">
                          <div className="bg-slate-800/50 p-6 rounded-full border border-slate-700">
                             <Lock size={32} className="text-purple-400 opacity-80"/>
                          </div>
                          <div className="text-center">
                              <h3 className="text-sm font-bold text-white mb-1">Zona Privada</h3>
                              <p className="text-xs text-slate-500">Selecciona un usuario de la lista o espera una invitación.</p>
                          </div>
                          {invitations.length > 0 && (
                              <div className="w-full max-w-sm space-y-3 mt-4 animate-in slide-in-from-bottom">
                                  {invitations.map(inv => (
                                      <div key={inv.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex justify-between items-center shadow-lg group hover:border-purple-500/50 transition-colors">
                                          <div className="flex items-center gap-3">
                                              <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-xs font-bold text-white">
                                                  {inv.fromName[0]}
                                              </div>
                                              <div>
                                                  <div className="text-sm font-bold text-white">{inv.fromName}</div>
                                                  <div className="text-[10px] text-slate-400">Te invita a chatear</div>
                                              </div>
                                          </div>
                                          <div className="flex gap-2">
                                              <button onClick={() => updateDoc(doc(db, "chat_invites", inv.id), {status: 'rejected'})} className="p-2 bg-slate-700 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition"><X size={16}/></button>
                                              <button onClick={() => acceptInvite(inv)} className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition shadow-lg"><Unlock size={16}/></button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                  )}
                  <div ref={dummyDiv}></div>
              </div>

              {/* INPUT BAR */}
              <form onSubmit={sendMessage} className="p-3 bg-[#1e293b] border-t border-slate-700/50 flex gap-3 items-center z-20 shrink-0">
                  <input 
                    type="text" 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)} 
                    placeholder={activeTab === 'GLOBAL' ? `Escribir mensaje...` : "Mensaje privado..."}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-full px-5 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                  />
                  <button 
                    type="submit" 
                    disabled={!input.trim()} 
                    className="bg-indigo-600 hover:bg-indigo-500 p-3.5 rounded-full text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center"
                  >
                      <Send size={20} />
                  </button>
              </form>
          </div>
      </div>

      {/* --- MODAL DE INTERACCIÓN --- */}
      {selectedUser && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in-95 duration-200" onClick={() => setSelectedUser(null)}>
              <div className="bg-[#1e293b] border border-slate-600 p-6 rounded-3xl w-full max-w-xs shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-indigo-900/50 to-transparent pointer-events-none"></div>
                  
                  <button onClick={() => setSelectedUser(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20}/></button>

                  <div className="flex flex-col items-center mb-6 relative z-10">
                      <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-3xl font-black text-indigo-400 mb-3 border-4 border-[#1e293b] shadow-xl ring-2 ring-indigo-500/50">
                          {selectedUser.name[0].toUpperCase()}
                      </div>
                      <h2 className="text-xl font-bold text-white text-center leading-tight">{selectedUser.name}</h2>
                      <div className="flex items-center gap-1.5 mt-2 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                          <span className="text-[10px] text-emerald-400 font-bold tracking-wider">ONLINE</span>
                      </div>
                  </div>

                  <div className="space-y-3 relative z-10">
                      <button onClick={() => sendPrivateInvite(selectedUser.uid, selectedUser.name)} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-900/20 hover:scale-[1.02]">
                          <Lock size={16}/> INVITAR A PRIVADO
                      </button>
                      
                      <button 
                        onClick={() => { alert("¡Reto enviado!"); setSelectedUser(null); }} 
                        className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border border-slate-700 hover:border-slate-500"
                      >
                          <Gamepad2 size={16} className="text-yellow-400"/> DESAFIAR A JUEGO
                      </button>
                      
                      <button onClick={() => handleBlockUser(selectedUser.uid)} className="w-full text-slate-500 hover:text-red-400 py-2 rounded-xl font-bold text-[10px] flex items-center justify-center gap-2 transition-colors mt-2 uppercase tracking-widest">
                          <ShieldAlert size={12}/> BLOQUEAR / REPORTAR
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}