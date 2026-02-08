import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// IMPORTACIONES
import { AudioProvider } from "@/contexts/AudioContext";
import { EconomyProvider } from "@/contexts/EconomyContext"; // <--- NUEVO
import VolumeControl from "@/components/VolumeControl";
import WalletBar from "@/components/WalletBar"; // <--- NUEVO

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Daytha Rivals",
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
          {/* ENVOLVEMOS CON EL SISTEMA DE ECONOMÍA */}
          <EconomyProvider>
            {children}
            
            {/* BARRA DE MONEDAS FLOTANTE */}
            <WalletBar />
            
            {/* CONTROL DE VOLUMEN FLOTANTE */}
            <VolumeControl />
          </EconomyProvider>
        </AudioProvider>
      </body>
    </html>
  );
}