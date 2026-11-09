// Datos curados para "El tablero" — con soporte de carpetas de videos/GIFs de 3-5s por proyecto
export type ProjectVideoClip = {
  id: string;
  label: string;
  kind: "procedural" | "uploaded";
  stylePreset: "vhs-grain" | "thermal-wave" | "kinetic-type" | "strobe-cut" | "liquid-ink" | "halftone-cam";
  url?: string; // URL de video/gif subido por el usuario (mp4/webm/gif)
  mediaType?: "video" | "image";
  c1: string;
  c2: string;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  feat?: string;
  prod?: string;
  bpm: number;
  key: string;
  duration: string;
  durationSec: number;
  version: number;
  note?: string;
  c1: string;
  c2: string;
  accent: string;
  glyph: string;
  audioFreq: number;
  customAudioUrl?: string;
};

export type ProjectType = "EP" | "LP" | "Album" | "Mixtape" | "Single" | "Beat Tape" | "WIP";

export type Project = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  type: ProjectType;
  status: "Publicado" | "WIP" | "Privado" | "En mezcla" | "Master";
  year: string;
  dateLabel: string;
  zone: string;
  genre?: string;
  attributes?: string[];
  targetTrackCount?: number;
  c1: string;
  c2: string;
  accent: string;
  tagGlyph: string;
  description: string;
  plays: string;
  // Posición 3D en el bloque arquitectónico tipo manifold.art (gif1.gif)
  blockPos: [number, number, number];
  blockSize: [number, number, number];
  videos: ProjectVideoClip[];
  tracks: Track[];
};

export type ArtistProfile = {
  id: string;
  handle: string;
  name: string;
  email?: string;
  role: string;
  zone: string;
  crew: string;
  bio: string;
  color: string;
  tracksCount: number;
  projectsCount: number;
  friendsCount: number;
  followersCount: number;
  playsTotal: string;
  stickers: string[];
};

export const INITIAL_ME_PROFILE: ArtistProfile = {
  id: "juani",
  handle: "@juani",
  name: "Juani",
  email: "juani@eltablero.mza",
  role: "Artista · Productor · Curador",
  zone: "Godoy Cruz, MZA",
  crew: "EL TABLERO / 0261",
  bio: "fuego lento en la precordillera. beats crudos, stems abiertos, cero caretaje.",
  color: "#111111",
  tracksCount: 42,
  projectsCount: 6,
  friendsCount: 31,
  followersCount: 812,
  playsTotal: "18.4K",
  stickers: ["🍇", "🏔️", "💿", "🎛️", "🔥"],
};

export const SCENE_ARTISTS: ArtistProfile[] = [
  INITIAL_ME_PROFILE,
  {
    id: "nahue",
    handle: "@nahue.b",
    name: "Nahue B",
    role: "Productor · Mix",
    zone: "Ciudad, MZA",
    crew: "TwoColor Lab",
    bio: "bajos rotos, compresión paralela y sintes analógicos desde la cuarta sección.",
    color: "#1d4ed8",
    tracksCount: 88,
    projectsCount: 9,
    friendsCount: 40,
    followersCount: 1204,
    playsTotal: "34.1K",
    stickers: ["🎚️", "⚡", "🔊"],
  },
  {
    id: "luz",
    handle: "@luzmala",
    name: "LUZ MALA",
    role: "Rapera · Directora",
    zone: "Las Heras, MZA",
    crew: "Norte Crudo",
    bio: "barra fría, cámara en mano, estética VHS de piedemonte.",
    color: "#be123c",
    tracksCount: 23,
    projectsCount: 3,
    friendsCount: 18,
    followersCount: 640,
    playsTotal: "14.9K",
    stickers: ["🌹", "★", "📹"],
  },
  {
    id: "tomi",
    handle: "@tomi261",
    name: "Tomi 261",
    role: "Beatmaker · DJ",
    zone: "Guaymallén, MZA",
    crew: "261 Cartel",
    bio: "sampleando vinilos de folclore cuyano a 144 bpm.",
    color: "#ca8a04",
    tracksCount: 120,
    projectsCount: 12,
    friendsCount: 52,
    followersCount: 990,
    playsTotal: "29.0K",
    stickers: ["🥁", "📀", "☀️"],
  },
  {
    id: "sur",
    handle: "@sursign",
    name: "SUR$",
    role: "Rapero",
    zone: "Maipú, MZA",
    crew: "Sur Sucio",
    bio: "detroit bounce con olor a bodega vieja.",
    color: "#4338ca",
    tracksCount: 17,
    projectsCount: 2,
    friendsCount: 12,
    followersCount: 377,
    playsTotal: "7.2K",
    stickers: ["⛓️", "🎲", "🦇"],
  },
  {
    id: "kali",
    handle: "@kali.wav",
    name: "kali.wav",
    role: "Ingeniera · Vocal",
    zone: "Luján de Cuyo, MZA",
    crew: "Subsuelo",
    bio: "reverbs largos, masters calientes y sesiones hasta las 6am.",
    color: "#0f766e",
    tracksCount: 64,
    projectsCount: 5,
    friendsCount: 29,
    followersCount: 455,
    playsTotal: "11.8K",
    stickers: ["🌊", "💎", "🎙️"],
  },
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: "fuego-lento",
    title: "FUEGO LENTO",
    artist: "Juani",
    artistId: "juani",
    type: "EP",
    status: "Publicado",
    year: "2026",
    dateLabel: "27.05 · HOY",
    zone: "Godoy Cruz",
    c1: "#18181b",
    c2: "#e11d48",
    accent: "#e11d48",
    tagGlyph: "01 // EP",
    description: "Grabado entre marzo y noviembre en Mendoza. 5 tracks sin filtro.",
    plays: "6.4K",
    blockPos: [-1.15, 0.85, 0.55],
    blockSize: [1.55, 1.45, 1.55],
    videos: [
      { id: "v-fl-1", label: "estudio_godoycruz_01.mp4 (4s)", kind: "procedural", stylePreset: "vhs-grain", c1: "#18181b", c2: "#e11d48" },
      { id: "v-fl-2", label: "sp404_resample_loop.gif (3s)", kind: "procedural", stylePreset: "kinetic-type", c1: "#f43f5e", c2: "#111111" },
      { id: "v-fl-3", label: "camara_termica_cerro.mp4 (5s)", kind: "procedural", stylePreset: "thermal-wave", c1: "#881337", c2: "#fde047" },
    ],
    tracks: [
      { id: "fl-1", title: "Intro (Cerro)", artist: "Juani", prod: "Nahue B", bpm: 84, key: "F#m", duration: "1:38", durationSec: 98, version: 3, note: "mix 3 · sub más seco", c1: "#111111", c2: "#e11d48", accent: "#e11d48", glyph: "I", audioFreq: 110 },
      { id: "fl-2", title: "Fuego Lento", artist: "Juani", feat: "LUZ MALA", prod: "Juani", bpm: 140, key: "Am", duration: "2:54", durationSec: 174, version: 5, note: "master final v5", c1: "#1f2937", c2: "#fb7185", accent: "#e11d48", glyph: "II", audioFreq: 130.8 },
      { id: "fl-3", title: "Careta", artist: "Juani", prod: "Tomi 261", bpm: 96, key: "Dm", duration: "3:12", durationSec: 192, version: 2, note: "con corte de cinta", c1: "#09090b", c2: "#f43f5e", accent: "#e11d48", glyph: "III", audioFreq: 146.8 },
      { id: "fl-4", title: "Acequia Nocturna", artist: "Juani", feat: "kali.wav", prod: "Juani", bpm: 128, key: "Cm", duration: "2:41", durationSec: 161, version: 4, note: "voces dobladas", c1: "#18181b", c2: "#fda4af", accent: "#e11d48", glyph: "IV", audioFreq: 164.8 },
      { id: "fl-5", title: "Pueblo Chico (Outro)", artist: "Juani", prod: "Nahue B", bpm: 78, key: "Em", duration: "2:19", durationSec: 139, version: 1, note: "one-take", c1: "#27272a", c2: "#9f1239", accent: "#e11d48", glyph: "V", audioFreq: 98 },
    ],
  },
  {
    id: "acequias-live",
    title: "ACEQUIAS",
    artist: "LUZ MALA",
    artistId: "luz",
    type: "Single",
    status: "Publicado",
    year: "2026",
    dateLabel: "AYER · 21:30",
    zone: "Las Heras",
    c1: "#0c4a6e",
    c2: "#38bdf8",
    accent: "#0284c7",
    tagGlyph: "02 // SGL",
    description: "Doble lado A grabado en vivo desde el zanjón de los Ciruelos.",
    plays: "4.1K",
    blockPos: [0.65, 1.05, -0.45],
    blockSize: [1.65, 1.55, 1.5],
    videos: [
      { id: "v-ac-1", label: "zanjon_nightvision.mp4 (4s)", kind: "procedural", stylePreset: "liquid-ink", c1: "#0c4a6e", c2: "#38bdf8" },
      { id: "v-ac-2", label: "luzmala_vhs_cut.gif (3s)", kind: "procedural", stylePreset: "halftone-cam", c1: "#0284c7", c2: "#e0f2fe" },
    ],
    tracks: [
      { id: "ac-1", title: "Acequias (Side A)", artist: "LUZ MALA", prod: "Nahue B", bpm: 134, key: "Gm", duration: "2:33", durationSec: 153, version: 4, note: "master cinta", c1: "#0c4a6e", c2: "#38bdf8", accent: "#0284c7", glyph: "A", audioFreq: 123.5 },
      { id: "ac-2", title: "Hielo Seco (Side B)", artist: "LUZ MALA", feat: "Juani", prod: "kali.wav", bpm: 136, key: "Bm", duration: "2:48", durationSec: 168, version: 2, note: "808 distorsionado", c1: "#075985", c2: "#7dd3fc", accent: "#0284c7", glyph: "B", audioFreq: 138.6 },
      { id: "ac-3", title: "Acequias (Instrumental)", artist: "LUZ MALA", prod: "Nahue B", bpm: 134, key: "Gm", duration: "2:33", durationSec: 153, version: 1, note: "stems abiertos", c1: "#082f49", c2: "#0ea5e9", accent: "#0284c7", glyph: "C", audioFreq: 110 },
    ],
  },
  {
    id: "261-tape",
    title: "261 TAPE VOL. 4",
    artist: "Tomi 261",
    artistId: "tomi",
    type: "Beat Tape",
    status: "Publicado",
    year: "2026",
    dateLabel: "LUN · 0261",
    zone: "Guaymallén",
    c1: "#1c1917",
    c2: "#facc15",
    accent: "#ca8a04",
    tagGlyph: "03 // TAPE",
    description: "6 recortes de vinilo mendocino pasados por SP-404 MKII.",
    plays: "8.9K",
    blockPos: [-1.35, -0.55, -0.5],
    blockSize: [1.5, 1.35, 1.6],
    videos: [
      { id: "v-tp-1", label: "vinilo_cuyano_spin.mp4 (5s)", kind: "procedural", stylePreset: "strobe-cut", c1: "#1c1917", c2: "#facc15" },
      { id: "v-tp-2", label: "mpc_pads_closeup.gif (3s)", kind: "procedural", stylePreset: "kinetic-type", c1: "#ca8a04", c2: "#fef08a" },
    ],
    tracks: [
      { id: "tp-1", title: "Vendimia Loop", artist: "Tomi 261", bpm: 88, key: "Fm", duration: "1:45", durationSec: 105, version: 2, c1: "#1c1917", c2: "#facc15", accent: "#ca8a04", glyph: "01", audioFreq: 116.5 },
      { id: "tp-2", title: "San Martín 1998", artist: "Tomi 261", bpm: 92, key: "C#m", duration: "2:04", durationSec: 124, version: 3, c1: "#292524", c2: "#fde047", accent: "#ca8a04", glyph: "02", audioFreq: 138.6 },
      { id: "tp-3", title: "Terminal del Sol", artist: "Tomi 261", feat: "SUR$", bpm: 95, key: "Am", duration: "2:22", durationSec: 142, version: 4, c1: "#44403c", c2: "#eab308", accent: "#ca8a04", glyph: "03", audioFreq: 146.8 },
      { id: "tp-4", title: "Jarilla Bounce", artist: "Tomi 261", bpm: 144, key: "Em", duration: "1:58", durationSec: 118, version: 1, c1: "#1c1917", c2: "#fef08a", accent: "#ca8a04", glyph: "04", audioFreq: 164.8 },
      { id: "tp-5", title: "Cobre y Polvo", artist: "Tomi 261", bpm: 86, key: "Dm", duration: "2:11", durationSec: 131, version: 2, c1: "#292524", c2: "#ca8a04", accent: "#ca8a04", glyph: "05", audioFreq: 130.8 },
      { id: "tp-6", title: "Ruta 7 (6AM)", artist: "Tomi 261", bpm: 80, key: "Gm", duration: "2:36", durationSec: 156, version: 1, c1: "#0c0a09", c2: "#facc15", accent: "#ca8a04", glyph: "06", audioFreq: 98 },
    ],
  },
  {
    id: "pueblo-disfrazado",
    title: "PUEBLO DISFRAZADO",
    artist: "Nahue B",
    artistId: "nahue",
    type: "LP",
    status: "Publicado",
    year: "2026",
    dateLabel: "DOM · ESTUDIO",
    zone: "Ciudad",
    c1: "#1e1b4b",
    c2: "#a3e635",
    accent: "#4d7c0f",
    tagGlyph: "04 // LP",
    description: "Un pueblo disfrazado de ciudad. Sintetizadores modulares y raperos invitados.",
    plays: "11.2K",
    blockPos: [0.35, -0.35, 0.85],
    blockSize: [1.65, 1.45, 1.55],
    videos: [
      { id: "v-pd-1", label: "modular_patch_4ta.mp4 (4s)", kind: "procedural", stylePreset: "thermal-wave", c1: "#1e1b4b", c2: "#a3e635" },
      { id: "v-pd-2", label: "microcentro_timelapse.gif (4s)", kind: "procedural", stylePreset: "vhs-grain", c1: "#312e81", c2: "#bef264" },
    ],
    tracks: [
      { id: "pd-1", title: "Pueblo Disfrazado", artist: "Nahue B", feat: "Juani", bpm: 132, key: "F#m", duration: "3:04", durationSec: 184, version: 6, c1: "#1e1b4b", c2: "#a3e635", accent: "#65a30d", glyph: "A1", audioFreq: 123.5 },
      { id: "pd-2", title: "4ta Sección", artist: "Nahue B", feat: "SUR$", bpm: 148, key: "Cm", duration: "2:40", durationSec: 160, version: 3, c1: "#312e81", c2: "#bef264", accent: "#65a30d", glyph: "A2", audioFreq: 146.8 },
      { id: "pd-3", title: "Viento Zonda", artist: "Nahue B", bpm: 126, key: "G#m", duration: "3:18", durationSec: 198, version: 2, c1: "#1e1b4b", c2: "#84cc16", accent: "#65a30d", glyph: "B1", audioFreq: 110 },
      { id: "pd-4", title: "Microcentro Gris", artist: "Nahue B", feat: "LUZ MALA", bpm: 98, key: "Dm", duration: "2:55", durationSec: 175, version: 4, c1: "#0f172a", c2: "#d9f99d", accent: "#65a30d", glyph: "B2", audioFreq: 155.6 },
    ],
  },
  {
    id: "demos-nov",
    title: "DEMOS NOV (S/T)",
    artist: "Juani",
    artistId: "juani",
    type: "WIP",
    status: "WIP",
    year: "2026",
    dateLabel: "WIP · PRIVADO",
    zone: "Godoy Cruz",
    c1: "#2e1065",
    c2: "#c084fc",
    accent: "#7e22ce",
    tagGlyph: "05 // WIP",
    description: "Maquetas crudas para testear en el auto antes de mandar a mezcla.",
    plays: "1.9K",
    blockPos: [1.55, -0.75, -0.35],
    blockSize: [1.45, 1.35, 1.45],
    videos: [
      { id: "v-dn-1", label: "auto_test_808.mp4 (3s)", kind: "procedural", stylePreset: "strobe-cut", c1: "#2e1065", c2: "#c084fc" },
      { id: "v-dn-2", label: "notas_voz_celu.gif (4s)", kind: "procedural", stylePreset: "halftone-cam", c1: "#581c87", c2: "#f3e8ff" },
    ],
    tracks: [
      { id: "dn-1", title: "idea_808_sucio_v2", artist: "Juani", bpm: 150, key: "C#m", duration: "1:18", durationSec: 78, version: 2, note: "subir hi-hat", c1: "#18181b", c2: "#a855f7", accent: "#7e22ce", glyph: "W1", audioFreq: 138.6 },
      { id: "dn-2", title: "con_kali_mix2", artist: "Juani", feat: "kali.wav", bpm: 88, key: "Gm", duration: "2:30", durationSec: 150, version: 2, note: "falta segundo verso", c1: "#2e1065", c2: "#c084fc", accent: "#7e22ce", glyph: "W2", audioFreq: 116.5 },
      { id: "dn-3", title: "cerro_gloria_sketch", artist: "Juani", prod: "Tomi 261", bpm: 94, key: "Em", duration: "1:52", durationSec: 112, version: 1, note: "grabado con mic de celu", c1: "#3b0764", c2: "#e9d5ff", accent: "#7e22ce", glyph: "W3", audioFreq: 164.8 },
    ],
  },
  {
    id: "subsuelo-sessions",
    title: "SUBSUELO 003",
    artist: "kali.wav",
    artistId: "kali",
    type: "EP",
    status: "Publicado",
    year: "2026",
    dateLabel: "JUE · LUJÁN",
    zone: "Luján de Cuyo",
    c1: "#042f2e",
    c2: "#2dd4bf",
    accent: "#0d9488",
    tagGlyph: "06 // LIVE",
    description: "Tomas directas de consola en el subsuelo de Luján. Cero edición.",
    plays: "5.3K",
    blockPos: [-0.25, -1.55, 0.15],
    blockSize: [1.75, 1.35, 1.65],
    videos: [
      { id: "v-ss-1", label: "consola_lujan_6am.mp4 (5s)", kind: "procedural", stylePreset: "liquid-ink", c1: "#042f2e", c2: "#2dd4bf" },
      { id: "v-ss-2", label: "reverb_tank_osc.gif (3s)", kind: "procedural", stylePreset: "thermal-wave", c1: "#0f766e", c2: "#99f6e4" },
    ],
    tracks: [
      { id: "ss-1", title: "Sala Fría", artist: "kali.wav", bpm: 118, key: "Fm", duration: "3:05", durationSec: 185, version: 3, c1: "#042f2e", c2: "#2dd4bf", accent: "#0d9488", glyph: "S1", audioFreq: 130.8 },
      { id: "ss-2", title: "Tape Hiss 02", artist: "kali.wav", feat: "Nahue B", bpm: 122, key: "Am", duration: "2:44", durationSec: 164, version: 2, c1: "#134e4a", c2: "#5eead4", accent: "#0d9488", glyph: "S2", audioFreq: 146.8 },
      { id: "ss-3", title: "Dique Cipolletti", artist: "kali.wav", feat: "Juani", bpm: 90, key: "Dm", duration: "3:28", durationSec: 208, version: 5, c1: "#115e59", c2: "#99f6e4", accent: "#0d9488", glyph: "S3", audioFreq: 110 },
      { id: "ss-4", title: "Cierre 6AM", artist: "kali.wav", bpm: 76, key: "Cm", duration: "2:12", durationSec: 132, version: 1, c1: "#042f2e", c2: "#14b8a6", accent: "#0d9488", glyph: "S4", audioFreq: 98 },
    ],
  },
];
