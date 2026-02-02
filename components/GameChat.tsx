import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, X, Minus } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';

interface GameChatProps {
  gameId: string;
  gameName: string;
}

export default function GameChat({ gameId, gameName }: GameChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const dummyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gameId) return;
    const q = query(collection(db, "chats", gameId, "messages"), orderBy("createdAt", "asc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => doc.data()));
      setTimeout(() => dummyRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsubscribe();
  }, [gameId]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    const user = auth.currentUser;
    await addDoc(collection(db, "chats", gameId, "messages"), {
      text: message.trim(),
      sender: user?.displayName || 'Anónimo',
      uid: user?.uid,
      photo: user?.photoURL,
      createdAt: serverTimestamp()
    });
    setMessage('');
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="fixed bottom-4 right-4 bg-slate-900/90 border border-purple-500/50 text-purple-400 p-3 rounded-full shadow-lg hover:scale-110 transition z-50 animate-bounce">
        <MessageSquare className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 h-96 bg-slate-950/95 border border-purple-500/30 rounded-xl flex flex-col shadow-2xl z-50 backdrop-blur-md overflow-hidden animate-in slide-in-from-bottom-10">
      <div className="bg-slate-900 p-3 flex justify-between items-center border-b border-slate-800">
        <span className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div> CHAT {gameName}</span>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white"><Minus className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-700">
        {messages.map((msg, i) => {
          const isMe = auth.currentUser?.uid === msg.uid;
          return (
            <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-lg text-xs ${isMe ? 'bg-purple-900/50 text-purple-100 border border-purple-500/20' : 'bg-slate-800 text-slate-300'}`}>
                {!isMe && <span className="block text-[9px] text-purple-400 font-bold mb-1">{msg.sender}</span>}
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={dummyRef}></div>
      </div>
      <form onSubmit={sendMessage} className="p-2 bg-slate-900 border-t border-slate-800 flex gap-2">
        <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Escribe..." className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500" />
        <button type="submit" className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}