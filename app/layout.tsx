import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// Importamos el contexto de audio y el botón de volumen
import { AudioProvider } from "@/contexts/AudioContext";
import VolumeControl from "@/components/VolumeControl";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chami Arcade",
  description: "La mejor plataforma de juegos retro modernos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        {/* Envolvemos toda la app con el proveedor de audio */}
        <AudioProvider>
          {children}
          
          {/* El botón de volumen flotante estará disponible en todas las páginas */}
          <VolumeControl />
        </AudioProvider>
      </body>
    </html>
  );
}