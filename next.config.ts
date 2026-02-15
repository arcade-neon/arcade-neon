import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',      // <--- ESTO ES LO QUE GENERA LA APP
  images: {
    unoptimized: true,   // <--- NECESARIO PARA QUE SE VEAN LAS PIEZAS
  },
};

export default nextConfig;