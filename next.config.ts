import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = isCapacitorBuild
  ? {
      output: "export",
      images: { unoptimized: true },
    }
  : {
      cacheComponents: true,
      partialPrefetching: true,
      async rewrites() {
        return [
          { source: "/library", destination: "/" },
          { source: "/guardados", destination: "/" },
          { source: "/upload", destination: "/" },
          { source: "/subir", destination: "/" },
          { source: "/profile", destination: "/" },
          { source: "/perfil", destination: "/" },
          { source: "/create", destination: "/" },
          { source: "/crear-proyecto", destination: "/" },
          { source: "/landing", destination: "/" },
          { source: "/project/:id*", destination: "/" },
        ];
      },
    };

export default nextConfig;



