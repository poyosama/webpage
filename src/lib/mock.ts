// Datos de mentira para el prototipo (Fase 0).
export type Artist = {
  id: string; name: string; role: string; zone: string; color: string;
  tracks: number; projects: number; friends: number; followers: number;
};

export const artists: Artist[] = [
  { id: "juani", name: "juani", role: "rapero", zone: "Godoy Cruz", color: "#7cf7ff", tracks: 42, projects: 6, friends: 31, followers: 812 },
  { id: "nahue", name: "Nahue B", role: "productor", zone: "Ciudad", color: "#ff5ea8", tracks: 88, projects: 9, friends: 40, followers: 1204 },
  { id: "luz", name: "LUZ MALA", role: "rapera", zone: "Las Heras", color: "#b4ff5e", tracks: 23, projects: 3, friends: 18, followers: 640 },
  { id: "tomi", name: "Tomi 261", role: "beatmaker", zone: "Guaymallén", color: "#ffd25e", tracks: 120, projects: 12, friends: 52, followers: 990 },
  { id: "sur", name: "SUR$", role: "rapero", zone: "Maipú", color: "#a78bff", tracks: 17, projects: 2, friends: 12, followers: 377 },
  { id: "kali", name: "kali.wav", role: "ingeniera", zone: "Luján", color: "#5effc8", tracks: 64, projects: 5, friends: 29, followers: 455 },
  { id: "pibe", name: "Pibe Zonda", role: "rapero", zone: "Ciudad", color: "#ff8a5e", tracks: 31, projects: 4, friends: 22, followers: 701 },
  { id: "acq", name: "Acequia Crew", role: "crew", zone: "Godoy Cruz", color: "#5ea8ff", tracks: 55, projects: 7, friends: 60, followers: 1530 },
];

export const collabs: [string, string][] = [
  ["juani", "nahue"], ["juani", "tomi"], ["luz", "nahue"], ["sur", "tomi"], ["kali", "juani"],
  ["kali", "luz"], ["pibe", "acq"], ["acq", "juani"], ["pibe", "nahue"], ["sur", "kali"],
];

export type Release = { id: string; title: string; artist: string; type: string; c1: string; c2: string; date: string };
export const releases: Release[] = [
  { id: "r1", title: "FUEGO LENTO", artist: "juani", type: "EP", c1: "#ff3b3b", c2: "#1a0000", date: "hoy" },
  { id: "r2", title: "acequias", artist: "LUZ MALA", type: "single", c1: "#5ea8ff", c2: "#020b1a", date: "ayer" },
  { id: "r3", title: "261 TAPE", artist: "Tomi 261", type: "beat tape", c1: "#ffd25e", c2: "#1a1200", date: "lun" },
  { id: "r4", title: "pueblo disfrazado", artist: "Nahue B", type: "álbum", c1: "#d9d9d9", c2: "#222", date: "dom" },
  { id: "r5", title: "ZONDA", artist: "Pibe Zonda", type: "single", c1: "#ff8a5e", c2: "#1a0a00", date: "sáb" },
  { id: "r6", title: "s/t (demo)", artist: "SUR$", type: "WIP", c1: "#a78bff", c2: "#0b051a", date: "vie" },
  { id: "r7", title: "mix 3 final final", artist: "kali.wav", type: "single", c1: "#5effc8", c2: "#001a12", date: "jue" },
  { id: "r8", title: "CERRO", artist: "Acequia Crew", type: "mixtape", c1: "#ff5ea8", c2: "#1a0010", date: "mié" },
];

export const posts = [
  { who: "Nahue B", kind: "hoy grabando", text: "sesión con LUZ MALA, se viene algo sucio 🔥", ago: "12 min" },
  { who: "juani", kind: "snippet", text: "snippet 0:20 — 'fuego lento' versión 4", ago: "1 h" },
  { who: "Tomi 261", kind: "foto", text: "nuevo setup en el estudio, quedó hermoso", ago: "3 h" },
  { who: "Acequia Crew", kind: "lanzamiento", text: "CERRO ya está en la plataforma, 9 temas", ago: "ayer" },
];

export const events = [
  { name: "Ciclo Fuego Lento vol. 3", place: "Club Tribuna, Ciudad", date: "SÁB 14 NOV", lineup: "juani · LUZ MALA · SUR$" },
  { name: "Freestyle en la Plaza", place: "Plaza Independencia", date: "DOM 15 NOV", lineup: "abierto" },
  { name: "Release party CERRO", place: "La Nave, Godoy Cruz", date: "VIE 20 NOV", lineup: "Acequia Crew · Pibe Zonda" },
];

export const library = [
  { title: "FUEGO LENTO", type: "EP", status: "lanzado", tracks: [
    { t: "intro (cerro)", bpm: 82, key: "F# menor", v: 3, dur: "1:12" },
    { t: "fuego lento", bpm: 140, key: "A menor", v: 5, dur: "2:58" },
    { t: "careta", bpm: 96, key: "D menor", v: 2, dur: "3:21" },
  ]},
  { title: "demos nov", type: "WIP", status: "en proceso", tracks: [
    { t: "idea 808 sucio", bpm: 150, key: "C# menor", v: 1, dur: "0:47" },
    { t: "con kali (mix 2)", bpm: 88, key: "G mayor", v: 2, dur: "2:30" },
  ]},
];
