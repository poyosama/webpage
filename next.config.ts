import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = isCapacitorBuild
  ? {
      output: "export",
      images: { unoptimized: true },
    }
  : {
      cacheComponents: true,
      poweredByHeader: false,
      // Headers de seguridad: nadie puede meter El tablero adentro de otra página (clickjacking),
      // el navegador no "adivina" tipos de archivo, no se filtra la URL completa a otros sitios
      // y la página no puede pedir cámara/micrófono/ubicación.
      async headers() {
        return [
          {
            // todo menos /embed/… : nadie puede meter El tablero adentro de otra página
            source: "/:path((?!embed).*)",
            headers: [
              { key: "X-Frame-Options", value: "SAMEORIGIN" },
              { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
              { key: "X-Content-Type-Options", value: "nosniff" },
              { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
              { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
              { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
            ],
          },
          {
            // /embed/… : recuadros pensados para ponerse en otras webs (ej. la de 2kolorstudio). Solo datos públicos.
            source: "/embed/:path*",
            headers: [
              { key: "Content-Security-Policy", value: "frame-ancestors *" },
              { key: "X-Content-Type-Options", value: "nosniff" },
              { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            ],
          },
        ];
      },
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
          // /project/:id tiene su propia página (vista previa del link); no se redirige
          { source: "/invite/:code*", destination: "/" },
          // Perfiles públicos: eltablero.blog/@handle
          { source: "/:handle(@[A-Za-z0-9_\\.]+)", destination: "/" },
        ];
      },
    };

export default nextConfig;



