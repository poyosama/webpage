import type { Metadata } from "next";
import { Michroma, Geist } from "next/font/google";
import "./globals.css";

const display = Michroma({ variable: "--font-display", weight: "400", subsets: ["latin"] });
const body = Geist({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "El Cerro de la Gloria",
  description: "La escena de Mendoza, en un solo lugar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
