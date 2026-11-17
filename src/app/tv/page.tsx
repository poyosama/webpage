import type { Metadata } from "next";
import TvApp from "@/components/TvApp";
import "./tv.css";

export const metadata: Metadata = {
  title: "El tablero. — TV",
  description: "El tablero en la tele: vinculala con el celu y manejala desde ahí.",
};

/** Modo TV: pantalla liviana para teles (Google TV / Android TV / navegador), manejada desde el celu */
export default function TvPage() {
  return <TvApp />;
}
