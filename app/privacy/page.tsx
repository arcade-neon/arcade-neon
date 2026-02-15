// @ts-nocheck
import React from 'react';
import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 mb-8 font-bold uppercase tracking-widest text-xs transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al Arcade
        </Link>
        
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-slate-900 rounded-2xl border border-slate-700">
            <Shield className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter">Política de Privacidad</h1>
        </div>

        <div className="space-y-8 bg-slate-900/50 p-8 rounded-3xl border border-slate-800 backdrop-blur-sm">
          <section>
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">1. Introducción</h2>
            <p className="text-sm leading-relaxed">
              Bienvenido a <strong>Daytha Rivals</strong>. Nos tomamos muy en serio tu privacidad. Esta política describe cómo recopilamos, usamos y protegemos tu información cuando utilizas nuestra aplicación web progresiva (PWA). Al jugar, aceptas las prácticas descritas aquí.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Datos que Recopilamos</h2>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li><strong>Información de Cuenta:</strong> Cuando inicias sesión con Google, recibimos tu nombre público, ID de usuario y avatar para crear tu perfil de jugador.</li>
              <li><strong>Datos de Juego:</strong> Guardamos tus puntuaciones, monedas virtuales, estadísticas de partidas y posición en el ranking global.</li>
              <li><strong>Datos Técnicos:</strong> Información básica del dispositivo para optimizar el rendimiento del juego (como el tipo de navegador o sistema operativo).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Uso de la Información</h2>
            <p className="text-sm leading-relaxed">
              Utilizamos tus datos exclusivamente para:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-2 text-sm">
              <li>Gestionar tu cuenta y guardar tu progreso en la nube (Firebase).</li>
              <li>Mostrarte en las tablas de clasificación (Rankings) junto a otros jugadores.</li>
              <li>Emparejarte con oponentes en el modo multijugador.</li>
              <li>Mejorar la estabilidad y seguridad de la aplicación.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Publicidad y Cookies</h2>
            <p className="text-sm leading-relaxed">
              Daytha Rivals es un servicio gratuito que se mantiene mediante publicidad. Utilizamos identificadores anónimos para mostrar anuncios no intrusivos y gestionar las recompensas (monedas gratis por ver vídeos). No vendemos tus datos personales a terceros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Tus Derechos</h2>
            <p className="text-sm leading-relaxed">
              Tienes derecho a acceder, corregir o eliminar tus datos en cualquier momento. Si deseas borrar tu cuenta y todo tu progreso, puedes solicitarlo directamente desde el soporte de la aplicación o cerrando sesión permanentemente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Contacto</h2>
            <p className="text-sm leading-relaxed">
              Para cualquier duda sobre esta política, contáctanos a través de los canales oficiales de Daytha Rivals.
            </p>
          </section>
          
          <div className="pt-8 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-600 uppercase font-bold tracking-widest">Última actualización: Febrero 2026</p>
          </div>
        </div>
      </div>
    </div>
  );
}