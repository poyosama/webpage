"use client";

import { useEffect, useState } from "react";

/** Productores de la escena para los ejemplos de "prod." (rotan para no mostrar siempre el mismo) */
export const PRODUCER_EXAMPLES = ["icylucki", "br1", "2ounces", "gonza2k", "bemo", "ando", "dorkke"];

/** "ej. icylucki, 2ounces..." — elegidos al azar al abrir (después de montar, así no hay diferencias con el servidor) */
export function useProducerExample(count = 2): string {
  const [txt, setTxt] = useState(`ej. ${PRODUCER_EXAMPLES.slice(0, count).join(", ")}${count > 1 ? "..." : ""}`);
  useEffect(() => {
    const pool = [...PRODUCER_EXAMPLES].sort(() => Math.random() - 0.5).slice(0, count);
    setTxt(`ej. ${pool.join(", ")}${count > 1 ? "..." : ""}`);
  }, [count]);
  return txt;
}
