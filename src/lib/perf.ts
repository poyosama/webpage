/**
 * ¿Equipo flojo? (celu / tablet / pocos núcleos o poca memoria). En esos casos las escenas 3D usan menos
 * partículas y resolución normal (no "retina"): la app anda fluida y gasta menos batería.
 */
export function isLowPowerDevice(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (
    window.innerWidth <= 900 ||
    window.matchMedia?.("(pointer: coarse)").matches ||
    (nav.hardwareConcurrency || 8) <= 4 ||
    (nav.deviceMemory || 8) <= 4
  );
}
/** Densidad de píxeles para los <Canvas> 3D */
export function canvasDpr(desktop: [number, number]): [number, number] {
  return isLowPowerDevice() ? [1, 1] : desktop;
}
