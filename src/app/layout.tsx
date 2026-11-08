import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono, UnifrakturMaguntia } from "next/font/google";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const serif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const gothic = UnifrakturMaguntia({
  variable: "--font-gothic",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "El tablero — Mendoza Underground Archive & Studio",
  description:
    "El tablero: archivo vivo 3D, reproductor customizable para snippets y biblioteca con carpetas de video para la escena de Mendoza.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${gothic.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
