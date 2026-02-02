import React from 'react';

interface AdSpaceProps {
  type?: 'banner' | 'square';
}

export default function AdSpace({ type = 'banner' }: AdSpaceProps) {
  const sizeClass = type === 'banner' 
    ? 'w-full max-w-[728px] h-24' 
    : 'w-[300px] h-[250px]';

  return (
    <div className={`
      ${sizeClass} 
      mx-auto my-6 
      bg-slate-900/30 
      border border-dashed border-slate-700 
      rounded-xl 
      flex flex-col items-center justify-center 
      relative overflow-hidden 
      group
      transition-colors hover:bg-slate-900/50
    `}>
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-slate-500 opacity-50"></div>
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-slate-500 opacity-50"></div>
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-slate-500 opacity-50"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-slate-500 opacity-50"></div>

      <span className="text-[10px] text-slate-600 font-bold tracking-[0.2em] uppercase mb-1">
        Publicidad
      </span>
      <span className="text-[9px] text-slate-700">
        ESPACIO RESERVADO GOOGLE
      </span>

      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent -translate-y-full group-hover:translate-y-full transition-transform duration-1000"></div>
    </div>
  );
}