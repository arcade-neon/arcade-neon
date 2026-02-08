import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// IMPORTAMOS LOS CONTEXTOS
import { AudioProvider } from "@/contexts/AudioContext";
import { EconomyProvider } from "@/contexts/EconomyContext"; // <--- NUEVO
import VolumeControl from "@/components/VolumeControl";
import WalletBar from "@/components/WalletBar"; // <--- NUEVO

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DAYTHA RIVALS",
  description: "Desafía. Compite. Domina.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <AudioProvider>
          {/* SISTEMA DE ECONOMÍA GLOBAL */}
          <EconomyProvider>
            {children}
            
            {/* COMPONENTES FLOTANTES GLOBALES */}
            <WalletBar />
            <VolumeControl />
            
          </EconomyProvider>
        </AudioProvider>
      </body>
    </html>
  );
}