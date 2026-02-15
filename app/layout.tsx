import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// IMPORTAMOS LOS CONTEXTOS
import { AudioProvider } from "@/contexts/AudioContext";
import { EconomyProvider } from "@/contexts/EconomyContext"; // <--- NUEVO
import VolumeControl from "@/components/VolumeControl";
import WalletBar from "@/components/WalletBar"; // <--- NUEVO
import { InventoryProvider } from "@/contexts/InventoryContext"; // <--- IMPORTAR

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: 'Daytha Rivals',
  description: 'Arcade Competitivo',
  manifest: '/manifest.json', // <--- ESTO ES LO QUE LO CONECTA
  themeColor: '#020617',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0',
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
          {/* 1. ECONOMÍA (El Banco) */}
          <EconomyProvider>
            
            {/* 2. INVENTARIO (La Tienda y tus objetos) - AQUI VA EL CAMBIO */}
            <InventoryProvider>
              
              {children}
              
              {/* COMPONENTES FLOTANTES */}
              <WalletBar />
              <VolumeControl />

            </InventoryProvider>
            {/* ----------------------------------------------------------- */}

          </EconomyProvider>
        </AudioProvider>
      </body>
    </html>
  );
}