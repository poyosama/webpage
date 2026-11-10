// Datos reales de "El tablero" — Raperos, Productores, Proyectos y Novedades de Productores
export type ProjectVideoClip = {
  id: string;
  label: string;
  kind: "procedural" | "uploaded";
  stylePreset:
    | "vhs-grain"
    | "thermal-wave"
    | "kinetic-type"
    | "strobe-cut"
    | "liquid-ink"
    | "halftone-cam";
  url?: string; // URL de video/gif/portada
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
  coverUrl?: string;
};

export type ProjectType =
  | "EP"
  | "LP"
  | "Album"
  | "Mixtape"
  | "Single"
  | "Beatpost"
  | "Soundkit"
  | "Drumkit"
  | "Loopkit"
  | "Catálogo de Beats"
  | "Beat Tape"
  | "WIP";

export type Project = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  type: ProjectType;
  status: "Publicado" | "WIP" | "Privado" | "En mezcla" | "Master";
  visibility?: "private" | "public";
  createdAt?: string;
  year: string;
  dateLabel: string;
  zone: string;
  genre?: string;
  attributes?: string[];
  targetTrackCount?: number;
  coverUrl?: string;
  c1: string;
  c2: string;
  accent: string;
  tagGlyph: string;
  description: string;
  plays: string;
  blockPos: [number, number, number];
  blockSize: [number, number, number];
  videos: ProjectVideoClip[];
  tracks: Track[];
};

export type ProducerDropKind =
  | "Beatpost"
  | "Soundkit"
  | "Drumkit"
  | "Loopkit"
  | "Catálogo de Beats";

export type ProducerDropItem = {
  id: string;
  title: string;
  producer: string;
  producerHandle: string;
  kind: ProducerDropKind;
  bpmLabel: string;
  keyLabel: string;
  itemsCountLabel: string;
  tag: string;
  c1: string;
  c2: string;
  accent: string;
  description: string;
  previewTrack: Track;
  projectId: string;
};

export type ArtistProfile = {
  id: string;
  handle: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  role: string;
  category?: "rapero" | "productor" | "ambos";
  zone: string;
  crew: string;
  bio: string;
  color: string;
  tracksCount: number;
  projectsCount: number;
  friendsCount: number;
  followersCount: number;
  playsTotal: string;
  accountType?: "artista" | "oyente";
  stickers: string[];
  createdAt?: string;
};

// Perfil vacío para cuentas nuevas (sin datos de prueba)
export const EMPTY_ME_PROFILE: ArtistProfile = {
  id: "",
  handle: "@",
  name: "",
  role: "Artista",
  accountType: "artista",
  category: "rapero",
  zone: "",
  crew: "",
  bio: "",
  color: "#111111",
  tracksCount: 0,
  projectsCount: 0,
  friendsCount: 0,
  followersCount: 0,
  playsTotal: "0",
  stickers: [],
};

export const INITIAL_ME_PROFILE: ArtistProfile = {
  id: "poyo",
  handle: "@poyo",
  name: "poyo",
  email: "poyo@eltablero.mza",
  role: "Rapero · Artista",
  accountType: "artista",
  category: "rapero",
  zone: "Mendoza",
  crew: "EL TABLERO // UG",
  bio: "chickenNugget EP (poyo · dorkke). Tus proyectos. Tu identidad. Tu gente. Tu música.",
  color: "#111111",
  tracksCount: 6,
  projectsCount: 1,
  friendsCount: 31,
  followersCount: 1420,
  playsTotal: "28.4K",
  stickers: ["RAW", "MIC", "VINYL", "808"],
};

export const STANDBY_TRACK: Track = {
  id: "standby-track",
  title: "Sin track activo",
  artist: "@poyo",
  prod: "dorkke",
  bpm: 140,
  key: "F#m",
  duration: "0:00",
  durationSec: 120,
  version: 1,
  note: "Seleccioná o subí un proyecto para reproducir",
  c1: "#09090b",
  c2: "#ffffff",
  accent: "#e11d48",
  glyph: "—",
  audioFreq: 110,
};

export const STANDBY_PROJECT: Project = {
  id: "standby-project",
  title: "EL TABLERO",
  artist: "@poyo",
  artistId: "poyo",
  type: "EP",
  status: "WIP",
  year: "2026",
  dateLabel: "STANDBY",
  zone: "Mendoza",
  attributes: ["Mendoza", "2026"],
  c1: "#09090b",
  c2: "#ffffff",
  accent: "#e11d48",
  tagGlyph: "00 // —",
  description: "Creá un proyecto o importalo desde [untitled] para verlo en tu Biblioteca 3D.",
  plays: "0",
  blockPos: [0, 0, 0],
  blockSize: [1.5, 1.4, 1.5],
  videos: [],
  tracks: [STANDBY_TRACK],
};

// ==================== RAPEROS Y PRODUCTORES DE LA ESCENA ====================
export const SCENE_ARTISTS: ArtistProfile[] = [
  // RAPEROS
  INITIAL_ME_PROFILE,
  {
    id: "tizianolased",
    handle: "@tizianolased",
    name: "Tizianolased",
    role: "Rapero · Artista",
    category: "rapero",
    zone: "Mendoza",
    crew: "5056931405",
    bio: "PERDÓN LA DEMORA (8 tracks). fuma conmigo, peligrosita, billetes azules.",
    color: "#15803d",
    tracksCount: 29,
    projectsCount: 3,
    friendsCount: 24,
    followersCount: 1540,
    playsTotal: "33.8K",
    stickers: ["PERDON", "DEMORA", "8TRACKS"],
  },
  {
    id: "ma7imza",
    handle: "@ma7imza",
    name: "Ma7imza",
    role: "Rapero · Artista",
    category: "rapero",
    zone: "Mendoza",
    crew: "5056 B.G ENTERTAINMENT",
    bio: "#MA7IAS Album (7 tracks). SIN ANALITICO, AKAPITAL, GOLES DE CAÑO, HOES RETORNABLES.",
    color: "#16a34a",
    tracksCount: 34,
    projectsCount: 4,
    friendsCount: 45,
    followersCount: 1920,
    playsTotal: "38.7K",
    stickers: ["MA7IAS", "BG", "LP"],
  },
  {
    id: "v4lentin0",
    handle: "@v4lentin0",
    name: "V4lentin0",
    role: "Rapero · Artista",
    category: "rapero",
    zone: "Mendoza",
    crew: "5056 El RujoDominga",
    bio: "ESTO ES ESTAR EN SONIDO (9 tracks). ESTO ES ESTAR, PERRAS TUNEADAS, DEPENDE DE MÍ.",
    color: "#dc2626",
    tracksCount: 41,
    projectsCount: 5,
    friendsCount: 39,
    followersCount: 2110,
    playsTotal: "52.0K",
    stickers: ["SONIDO", "5056", "LP"],
  },
  {
    id: "icylucki",
    handle: "@icylucki",
    name: "Icylucki",
    role: "Rapero · Productor",
    category: "ambos",
    zone: "Mendoza",
    crew: "5056 I+CCV",
    bio: "Love2Hate EP, Extazy Vol. 2, 20min. Barras y producción propia.",
    color: "#be123c",
    tracksCount: 38,
    projectsCount: 6,
    friendsCount: 32,
    followersCount: 1750,
    playsTotal: "34.2K",
    stickers: ["LOVE2HATE", "PROD", "EP"],
  },
  {
    id: "eyebags",
    handle: "@eyebags",
    name: "eyebags",
    role: "Rapero · Artista",
    category: "rapero",
    zone: "Mendoza",
    crew: "LA PLAGA",
    bio: "LA PLAGA Mixtape. Noches sin dormir, barras crudas y voces saturadas.",
    color: "#e11d48",
    tracksCount: 24,
    projectsCount: 3,
    friendsCount: 28,
    followersCount: 1690,
    playsTotal: "31.2K",
    stickers: ["PLAGA", "MIXTAPE", "RAW"],
  },
  {
    id: "maximo",
    handle: "@maximo",
    name: "Máximo",
    role: "Rapero · Artista",
    category: "rapero",
    zone: "Mendoza",
    crew: "AMORIO CLUB",
    bio: "AMORIO CLUB 2 (EP). Melodías nocturnas y club.",
    color: "#7e22ce",
    tracksCount: 22,
    projectsCount: 3,
    friendsCount: 33,
    followersCount: 1680,
    playsTotal: "29.5K",
    stickers: ["AMORIO", "CLUB", "EP"],
  },
  {
    id: "nvcho",
    handle: "@nvcho",
    name: "Nvcho",
    role: "Rapero · Artista",
    category: "rapero",
    zone: "Mendoza",
    crew: "UG BOARD",
    bio: "Rapero de la escena underground. Versos directos y colaboraciones en el tablero.",
    color: "#ea580c",
    tracksCount: 19,
    projectsCount: 2,
    friendsCount: 37,
    followersCount: 1190,
    playsTotal: "21.1K",
    stickers: ["BARS", "FLOW", "UG"],
  },
  {
    id: "alvamusicc",
    handle: "@alvamusicc",
    name: "alva musicc",
    role: "Rapero · Artista",
    category: "rapero",
    zone: "Mendoza",
    crew: "UG BOARD",
    bio: "Rapero y vocalista en rotación del tablero.",
    color: "#0d9488",
    tracksCount: 18,
    projectsCount: 2,
    friendsCount: 29,
    followersCount: 980,
    playsTotal: "18.6K",
    stickers: ["WAVE", "MIC", "RAW"],
  },

  // PRODUCTORES
  {
    id: "dorkke",
    handle: "@dorkke",
    name: "dorkke",
    role: "Productor · Sound Designer",
    category: "productor",
    zone: "Mendoza",
    crew: "EL TABLERO PROD",
    bio: "Productor ejecutivo de chickenNugget (poyo · dorkke). Drumkits, sintes rotos y 808s.",
    color: "#4338ca",
    tracksCount: 86,
    projectsCount: 7,
    friendsCount: 42,
    followersCount: 1650,
    playsTotal: "44.3K",
    stickers: ["808", "DESIGN", "DRUMS"],
  },
  {
    id: "gonza2k",
    handle: "@gonza2k",
    name: "Gonza2k",
    role: "Productor · Beatmaker",
    category: "productor",
    zone: "Mendoza",
    crew: "2K LAB",
    bio: "Productor en chickenNugget (esta cumbia, florcita, ni plata ni Tiempo). Loopkits y catálogos.",
    color: "#0284c7",
    tracksCount: 74,
    projectsCount: 6,
    friendsCount: 38,
    followersCount: 1410,
    playsTotal: "35.8K",
    stickers: ["LOOPKIT", "KEYS", "2K"],
  },
  {
    id: "2ounces",
    handle: "@2ounces",
    name: "2ounces",
    role: "Productor · Beatmaker",
    category: "productor",
    zone: "Mendoza",
    crew: "2OZ",
    bio: "Productor en esta cumbia (chickenNugget). 808s pesados, drumkits y beatposts.",
    color: "#ca8a04",
    tracksCount: 68,
    projectsCount: 5,
    friendsCount: 35,
    followersCount: 1290,
    playsTotal: "28.9K",
    stickers: ["DRUMS", "808", "LAB"],
  },
  {
    id: "bemowav",
    handle: "@bemo.wav",
    name: "bemo.wav",
    role: "Productor · Soundkits",
    category: "productor",
    zone: "Mendoza",
    crew: "WAV LAB",
    bio: "Soundkits analógicos, texturas WAV en 24-bit y diseño de sintetizadores.",
    color: "#0f766e",
    tracksCount: 62,
    projectsCount: 5,
    friendsCount: 31,
    followersCount: 1180,
    playsTotal: "24.4K",
    stickers: ["WAV", "ANALOG", "KIT"],
  },
  {
    id: "andoflp",
    handle: "@ando.flp",
    name: "ando.flp",
    role: "Productor · FL Studio Wizard",
    category: "productor",
    zone: "Mendoza",
    crew: "FLP GANG",
    bio: "Loopkits, proyectos FLP abiertos, melodías sintéticas y catálogos de beats.",
    color: "#ea580c",
    tracksCount: 79,
    projectsCount: 6,
    friendsCount: 40,
    followersCount: 1360,
    playsTotal: "31.0K",
    stickers: ["FLP", "KEYS", "SYNTH"],
  },
  {
    id: "erreorocko",
    handle: "@erreorocko",
    name: "erreorocko",
    role: "Productor · Beatmaker",
    category: "productor",
    zone: "Mendoza",
    crew: "ROCKO BEATS",
    bio: "Drumkits crudos, percusión sucia y beatposts semanales para la escena.",
    color: "#9333ea",
    tracksCount: 57,
    projectsCount: 4,
    friendsCount: 29,
    followersCount: 1090,
    playsTotal: "22.7K",
    stickers: ["RAW", "DRUMS", "BEATS"],
  },
  {
    id: "nutsvk",
    handle: "@nutsvk",
    name: "nutsvk",
    role: "Productor · Sound Designer",
    category: "productor",
    zone: "Mendoza",
    crew: "VK SOUND",
    bio: "Catálogos de beats oscuros, 808s quirúrgicos y soundkits custom.",
    color: "#e11d48",
    tracksCount: 64,
    projectsCount: 5,
    friendsCount: 33,
    followersCount: 1210,
    playsTotal: "26.1K",
    stickers: ["VK", "DARK", "808"],
  },
];

// ==================== PROYECTOS REALES CON TAPAS Y TRACKLISTS DE LOS SCREENSHOTS ====================
export const DEMO_PROJECTS: Project[] = [
  {
    id: "chickennugget",
    title: "chickenNugget",
    artist: "poyo · dorkke",
    artistId: "poyo",
    type: "EP",
    status: "Publicado",
    year: "2026",
    dateLabel: "EP · 6 TRACKS · 10 MIN 32 SEC",
    zone: "Mendoza",
    coverUrl: "/covers/chickennugget.png",
    attributes: ["Mendoza", "2026", "EP", "poyo", "dorkke"],
    c1: "#09090b",
    c2: "#71717a",
    accent: "#18181b",
    tagGlyph: "01 // EP",
    description: "chickenNugget (EP) por poyo & dorkke. Con producciones de dorkke, Gonza2k, 2ounces y colaboración de Ma7imza.",
    plays: "24.8K",
    blockPos: [-1.25, 0.75, 0.55],
    blockSize: [1.58, 1.48, 1.58],
    videos: [
      { id: "v-cn-cover", label: "chickennugget_cover.png", kind: "uploaded", mediaType: "image", url: "/covers/chickennugget.png", stylePreset: "strobe-cut", c1: "#09090b", c2: "#a1a1aa" },
      { id: "v-cn-2", label: "poyo_dorkke_live.mp4 (4s)", kind: "procedural", stylePreset: "kinetic-type", c1: "#09090b", c2: "#e4e4e7" },
    ],
    tracks: [
      { id: "cn-1", title: "i am GOD", artist: "poyo", prod: "dorkke", bpm: 144, key: "Fm", duration: "1:53", durationSec: 113, version: 1, note: "poyo, dorkke", c1: "#09090b", c2: "#a1a1aa", accent: "#18181b", glyph: "01", audioFreq: 116.5 },
      { id: "cn-2", title: "esta cumbia", artist: "poyo", prod: "dorkke, Gonza2k, 2ounces", bpm: 138, key: "Cm", duration: "1:41", durationSec: 101, version: 1, note: "poyo, dorkke, Gonza2k, 2ounces", c1: "#18181b", c2: "#d4d4d8", accent: "#18181b", glyph: "02", audioFreq: 130.8 },
      { id: "cn-3", title: "uno más", artist: "poyo", prod: "dorkke", bpm: 146, key: "Am", duration: "1:22", durationSec: 82, version: 1, note: "poyo, dorkke", c1: "#09090b", c2: "#71717a", accent: "#18181b", glyph: "03", audioFreq: 146.8 },
      { id: "cn-4", title: "florcita", artist: "poyo", feat: "Ma7imza", prod: "dorkke, Gonza2k", bpm: 142, key: "Gm", duration: "1:45", durationSec: 105, version: 1, note: "poyo, dorkke, Gonza2k, Ma7imza", c1: "#18181b", c2: "#a1a1aa", accent: "#18181b", glyph: "04", audioFreq: 123.5 },
      { id: "cn-5", title: "ni plata ni Tiempo", artist: "poyo", prod: "dorkke, Gonza2k", bpm: 140, key: "Em", duration: "2:10", durationSec: 130, version: 1, note: "poyo, dorkke, Gonza2k", c1: "#09090b", c2: "#e4e4e7", accent: "#18181b", glyph: "05", audioFreq: 138.6 },
      { id: "cn-6", title: "recuerdos tuyos", artist: "poyo", prod: "dorkke", bpm: 134, key: "Dm", duration: "1:40", durationSec: 100, version: 1, note: "poyo, dorkke", c1: "#18181b", c2: "#71717a", accent: "#18181b", glyph: "06", audioFreq: 110.0 },
    ],
  },
  {
    id: "perdon-la-demora",
    title: "PERDÓN LA DEMORA",
    artist: "Tizianolased",
    artistId: "tizianolased",
    type: "Mixtape",
    status: "Publicado",
    year: "2025",
    dateLabel: "MIXTAPE · 8 TRACKS · 21 MIN 25 SEC",
    zone: "Mendoza",
    coverUrl: "/covers/perdon-la-demora.png",
    attributes: ["Mendoza", "2025", "Mixtape", "Tizianolased"],
    c1: "#0a2e1d",
    c2: "#15803d",
    accent: "#16a34a",
    tagGlyph: "02 // MXT",
    description: "PERDÓN LA DEMORA por Tizianolased (8 canciones). Con colaboraciones de blango y Elefego.",
    plays: "31.4K",
    blockPos: [0.65, 1.02, -0.42],
    blockSize: [1.62, 1.52, 1.52],
    videos: [
      { id: "v-pld-cover", label: "perdon_la_demora_cover.png", kind: "uploaded", mediaType: "image", url: "/covers/perdon-la-demora.png", stylePreset: "vhs-grain", c1: "#0a2e1d", c2: "#15803d" },
      { id: "v-pld-2", label: "tizianolased_canvas.mp4 (4s)", kind: "procedural", stylePreset: "liquid-ink", c1: "#064e3b", c2: "#22c55e" },
    ],
    tracks: [
      { id: "pld-1", title: "fuma conmigo", artist: "Tizianolased", prod: "bemo.wav", bpm: 132, key: "Gm", duration: "1:52", durationSec: 112, version: 1, note: "1,181 plays", c1: "#0a2e1d", c2: "#22c55e", accent: "#15803d", glyph: "01", audioFreq: 123.5 },
      { id: "pld-2", title: "peligrosita (recuerdos)", artist: "Tizianolased", prod: "ando.flp", bpm: 136, key: "Cm", duration: "2:28", durationSec: 148, version: 1, note: "1,255 plays", c1: "#064e3b", c2: "#4ade80", accent: "#15803d", glyph: "02", audioFreq: 138.6 },
      { id: "pld-3", title: "me sube", artist: "Tizianolased", prod: "Gonza2k", bpm: 140, key: "Fm", duration: "3:18", durationSec: 198, version: 1, c1: "#0a2e1d", c2: "#16a34a", accent: "#15803d", glyph: "03", audioFreq: 110.0 },
      { id: "pld-4", title: "pronto es tarde", artist: "Tizianolased", prod: "2ounces", bpm: 128, key: "Am", duration: "3:00", durationSec: 180, version: 1, note: "2,463 plays", c1: "#052e16", c2: "#22c55e", accent: "#15803d", glyph: "04", audioFreq: 146.8 },
      { id: "pld-5", title: "billetes azules", artist: "Tizianolased", feat: "blango", prod: "erreorocko", bpm: 142, key: "Dm", duration: "3:25", durationSec: 205, version: 1, c1: "#0a2e1d", c2: "#4ade80", accent: "#15803d", glyph: "05", audioFreq: 130.8 },
      { id: "pld-6", title: "antes que te vayas", artist: "Tizianolased", feat: "Elefego", prod: "bemo.wav", bpm: 130, key: "Em", duration: "2:50", durationSec: 170, version: 1, c1: "#064e3b", c2: "#22c55e", accent: "#15803d", glyph: "06", audioFreq: 164.8 },
      { id: "pld-7", title: "no da más", artist: "Tizianolased", prod: "nutsvk", bpm: 138, key: "Bm", duration: "2:00", durationSec: 120, version: 1, c1: "#0a2e1d", c2: "#15803d", accent: "#15803d", glyph: "07", audioFreq: 116.5 },
      { id: "pld-8", title: "esta noche", artist: "Tizianolased", prod: "dorkke", bpm: 134, key: "F#m", duration: "2:29", durationSec: 149, version: 1, c1: "#052e16", c2: "#4ade80", accent: "#15803d", glyph: "08", audioFreq: 123.5 },
    ],
  },
  {
    id: "ma7ias",
    title: "#MA7IAS",
    artist: "Ma7imza",
    artistId: "ma7imza",
    type: "Album",
    status: "Publicado",
    year: "2025",
    dateLabel: "ALBUM · 7 TRACKS · 18 MIN 5 SEC",
    zone: "Mendoza",
    coverUrl: "/covers/ma7ias.png",
    attributes: ["Mendoza", "2025", "Album", "Ma7imza", "5056 B.G"],
    c1: "#052e16",
    c2: "#22c55e",
    accent: "#16a34a",
    tagGlyph: "03 // ALB",
    description: "#MA7IAS por Ma7imza (7 canciones). Incluye SIN ANALITICO, GOLES DE CAÑO, HOES RETORNABLES (feat. Tizianolased) y PIÑAZOS Y PATADAS.",
    plays: "34.1K",
    blockPos: [-1.35, -0.58, -0.48],
    blockSize: [1.55, 1.42, 1.58],
    videos: [
      { id: "v-m7-cover", label: "ma7ias_cover.png", kind: "uploaded", mediaType: "image", url: "/covers/ma7ias.png", stylePreset: "thermal-wave", c1: "#052e16", c2: "#22c55e" },
      { id: "v-m7-2", label: "ma7imza_night_car.mp4 (4s)", kind: "procedural", stylePreset: "vhs-grain", c1: "#052e16", c2: "#4ade80" },
    ],
    tracks: [
      { id: "m7-1", title: "SIN ANALITICO", artist: "Ma7imza", prod: "Gonza2k", bpm: 144, key: "F#m", duration: "2:14", durationSec: 134, version: 1, note: "3,975 plays", c1: "#052e16", c2: "#22c55e", accent: "#16a34a", glyph: "01", audioFreq: 110.0 },
      { id: "m7-2", title: "AKAPITAL", artist: "Ma7imza", prod: "2ounces", bpm: 146, key: "Cm", duration: "2:08", durationSec: 128, version: 1, note: "3,011 plays", c1: "#064e3b", c2: "#4ade80", accent: "#16a34a", glyph: "02", audioFreq: 130.8 },
      { id: "m7-3", title: "GOLES DE CAÑO", artist: "Ma7imza", prod: "dorkke", bpm: 142, key: "Gm", duration: "2:18", durationSec: 138, version: 1, note: "5,991 plays", c1: "#052e16", c2: "#22c55e", accent: "#16a34a", glyph: "03", audioFreq: 146.8 },
      { id: "m7-4", title: "HOES RETORNABLES", artist: "Ma7imza", feat: "Tizianolased", prod: "ando.flp", bpm: 138, key: "Am", duration: "4:24", durationSec: 264, version: 1, note: "4,483 plays", c1: "#064e3b", c2: "#86efac", accent: "#16a34a", glyph: "04", audioFreq: 123.5 },
      { id: "m7-5", title: "PARA LA MAS ROCHA", artist: "Ma7imza", prod: "erreorocko", bpm: 140, key: "Dm", duration: "2:19", durationSec: 139, version: 1, note: "4,281 plays", c1: "#052e16", c2: "#22c55e", accent: "#16a34a", glyph: "05", audioFreq: 138.6 },
      { id: "m7-6", title: "FRANKLIN Y LAMAR", artist: "Ma7imza", prod: "bemo.wav", bpm: 145, key: "Em", duration: "2:15", durationSec: 135, version: 1, note: "4,403 plays", c1: "#064e3b", c2: "#4ade80", accent: "#16a34a", glyph: "06", audioFreq: 116.5 },
      { id: "m7-7", title: "PIÑAZOS Y PATADAS", artist: "Ma7imza", prod: "nutsvk", bpm: 148, key: "Fm", duration: "2:25", durationSec: 145, version: 1, note: "8,286 plays", c1: "#052e16", c2: "#22c55e", accent: "#16a34a", glyph: "07", audioFreq: 110.0 },
    ],
  },
  {
    id: "esto-es-estar-en-sonido",
    title: "ESTO ES ESTAR EN SONIDO",
    artist: "V4lentin0",
    artistId: "v4lentin0",
    type: "LP",
    status: "Publicado",
    year: "2025",
    dateLabel: "ALBUM · 9 TRACKS · 20 MIN 46 SEC",
    zone: "Mendoza",
    coverUrl: "/covers/esto-es-estar-en-sonido.png",
    attributes: ["Mendoza", "2025", "LP", "V4lentin0"],
    c1: "#1e293b",
    c2: "#ef4444",
    accent: "#dc2626",
    tagGlyph: "04 // LP",
    description: "ESTO ES ESTAR EN SONIDO por V4lentin0 (9 canciones). Con colaboraciones de Tizianolased y Ma7imza.",
    plays: "42.7K",
    blockPos: [0.38, -0.36, 0.86],
    blockSize: [1.65, 1.48, 1.55],
    videos: [
      { id: "v-ees-cover", label: "esto_es_estar_en_sonido.png", kind: "uploaded", mediaType: "image", url: "/covers/esto-es-estar-en-sonido.png", stylePreset: "thermal-wave", c1: "#1e293b", c2: "#ef4444" },
      { id: "v-ees-2", label: "v4lentin0_rain_visual.mp4 (4s)", kind: "procedural", stylePreset: "vhs-grain", c1: "#0f172a", c2: "#f87171" },
    ],
    tracks: [
      { id: "ees-1", title: "ESTO ES ESTAR", artist: "V4lentin0", prod: "dorkke", bpm: 134, key: "F#m", duration: "2:16", durationSec: 136, version: 1, c1: "#1e293b", c2: "#ef4444", accent: "#dc2626", glyph: "01", audioFreq: 123.5 },
      { id: "ees-2", title: "PERRAS TUNEADAS", artist: "V4lentin0", prod: "Gonza2k", bpm: 142, key: "Cm", duration: "2:04", durationSec: 124, version: 1, c1: "#0f172a", c2: "#f87171", accent: "#dc2626", glyph: "02", audioFreq: 146.8 },
      { id: "ees-3", title: "CHETA LA COREO", artist: "V4lentin0", prod: "2ounces", bpm: 138, key: "Gm", duration: "2:11", durationSec: 131, version: 1, c1: "#1e293b", c2: "#ef4444", accent: "#dc2626", glyph: "03", audioFreq: 110.0 },
      { id: "ees-4", title: "DEPENDE DE MÍ", artist: "V4lentin0", feat: "Tizianolased", prod: "bemo.wav", bpm: 130, key: "Dm", duration: "2:46", durationSec: 166, version: 1, c1: "#0f172a", c2: "#fb7185", accent: "#dc2626", glyph: "04", audioFreq: 155.6 },
      { id: "ees-5", title: "CUANDO ME LLEGUE (Interludio)", artist: "V4lentin0", prod: "ando.flp", bpm: 120, key: "Am", duration: "1:45", durationSec: 105, version: 1, c1: "#1e293b", c2: "#94a3b8", accent: "#dc2626", glyph: "05", audioFreq: 116.5 },
      { id: "ees-6", title: "AY BADDIE", artist: "V4lentin0", prod: "erreorocko", bpm: 144, key: "Em", duration: "2:07", durationSec: 127, version: 1, c1: "#0f172a", c2: "#ef4444", accent: "#dc2626", glyph: "06", audioFreq: 138.6 },
      { id: "ees-7", title: "ME TIRAN", artist: "V4lentin0", feat: "Ma7imza", prod: "nutsvk", bpm: 146, key: "Fm", duration: "3:05", durationSec: 185, version: 1, c1: "#1e293b", c2: "#f87171", accent: "#dc2626", glyph: "07", audioFreq: 110.0 },
      { id: "ees-8", title: "BAJEN PA' ACÁ", artist: "V4lentin0", prod: "dorkke", bpm: 140, key: "C#m", duration: "2:10", durationSec: 130, version: 1, c1: "#0f172a", c2: "#ef4444", accent: "#dc2626", glyph: "08", audioFreq: 130.8 },
      { id: "ees-9", title: "DECLINE", artist: "V4lentin0", prod: "Gonza2k", bpm: 128, key: "Bm", duration: "2:20", durationSec: 140, version: 1, c1: "#1e293b", c2: "#94a3b8", accent: "#dc2626", glyph: "09", audioFreq: 146.8 },
    ],
  },
  {
    id: "love2hate",
    title: "Love2Hate",
    artist: "Icylucki",
    artistId: "icylucki",
    type: "EP",
    status: "Publicado",
    year: "2025",
    dateLabel: "EP · 3 TRACKS · 7 MIN 16 SEC",
    zone: "Mendoza",
    coverUrl: "/covers/love2hate.png",
    attributes: ["Mendoza", "2025", "EP", "Icylucki"],
    c1: "#4c0519",
    c2: "#e11d48",
    accent: "#be123c",
    tagGlyph: "05 // EP",
    description: "Love2Hate (EP) por Icylucki. Incluye Tengo tos (feat. nunoset), 3am y Fumo mari.",
    plays: "21.9K",
    blockPos: [1.58, -0.72, -0.35],
    blockSize: [1.46, 1.38, 1.46],
    videos: [
      { id: "v-l2h-cover", label: "love2hate_cover.png", kind: "uploaded", mediaType: "image", url: "/covers/love2hate.png", stylePreset: "strobe-cut", c1: "#4c0519", c2: "#e11d48" },
      { id: "v-l2h-2", label: "icylucki_3am_loop.mp4 (3s)", kind: "procedural", stylePreset: "halftone-cam", c1: "#881337", c2: "#fb7185" },
    ],
    tracks: [
      { id: "l2h-1", title: "Tengo tos", artist: "Icylucki", feat: "nunoset", prod: "Icylucki", bpm: 138, key: "C#m", duration: "3:03", durationSec: 183, version: 1, c1: "#4c0519", c2: "#e11d48", accent: "#be123c", glyph: "01", audioFreq: 130.8 },
      { id: "l2h-2", title: "3am", artist: "Icylucki", prod: "Icylucki & bemo.wav", bpm: 142, key: "Gm", duration: "2:19", durationSec: 139, version: 1, c1: "#881337", c2: "#fb7185", accent: "#be123c", glyph: "02", audioFreq: 116.5 },
      { id: "l2h-3", title: "Fumo mari", artist: "Icylucki", prod: "Icylucki & ando.flp", bpm: 136, key: "Fm", duration: "1:54", durationSec: 114, version: 1, c1: "#4c0519", c2: "#f43f5e", accent: "#be123c", glyph: "03", audioFreq: 146.8 },
    ],
  },
  {
    id: "la-plaga",
    title: "LA PLAGA",
    artist: "eyebags",
    artistId: "eyebags",
    type: "Mixtape",
    status: "Publicado",
    year: "2026",
    dateLabel: "MIXTAPE · UG",
    zone: "Mendoza",
    attributes: ["Mendoza", "2026", "Mixtape", "eyebags"],
    c1: "#18181b",
    c2: "#e11d48",
    accent: "#e11d48",
    tagGlyph: "06 // MXT",
    description: "LA PLAGA mixtape por eyebags con producción de dorkke, 2ounces y nutsvk.",
    plays: "19.4K",
    blockPos: [-0.25, 1.55, -0.75],
    blockSize: [1.45, 1.35, 1.45],
    videos: [
      { id: "v-lp-1", label: "la_plaga_teaser.mp4 (4s)", kind: "procedural", stylePreset: "vhs-grain", c1: "#18181b", c2: "#e11d48" },
    ],
    tracks: [
      { id: "lp-1", title: "LA PLAGA", artist: "eyebags", prod: "dorkke", bpm: 146, key: "Am", duration: "2:18", durationSec: 138, version: 1, c1: "#18181b", c2: "#e11d48", accent: "#e11d48", glyph: "01", audioFreq: 130.8 },
      { id: "lp-2", title: "Sin Dormir", artist: "eyebags", feat: "poyo", prod: "2ounces", bpm: 142, key: "Dm", duration: "2:09", durationSec: 129, version: 1, c1: "#09090b", c2: "#f43f5e", accent: "#e11d48", glyph: "02", audioFreq: 146.8 },
      { id: "lp-3", title: "Ceniza", artist: "eyebags", prod: "nutsvk", bpm: 138, key: "Em", duration: "2:04", durationSec: 124, version: 1, c1: "#27272a", c2: "#9f1239", accent: "#e11d48", glyph: "03", audioFreq: 110.0 },
    ],
  },
  {
    id: "amorio-club-2",
    title: "AMORIO CLUB 2",
    artist: "Máximo",
    artistId: "maximo",
    type: "EP",
    status: "Publicado",
    year: "2026",
    dateLabel: "EP · CLUB",
    zone: "Mendoza",
    attributes: ["Mendoza", "2026", "EP", "Máximo"],
    c1: "#2e1065",
    c2: "#a855f7",
    accent: "#7e22ce",
    tagGlyph: "07 // EP",
    description: "AMORIO CLUB 2 (EP) por Máximo con producciones de bemo.wav, Gonza2k y ando.flp.",
    plays: "18.3K",
    blockPos: [1.45, 0.45, 0.72],
    blockSize: [1.42, 1.32, 1.42],
    videos: [
      { id: "v-ac2-1", label: "amorio_club_2.mp4 (3s)", kind: "procedural", stylePreset: "strobe-cut", c1: "#2e1065", c2: "#c084fc" },
    ],
    tracks: [
      { id: "ac2-1", title: "Bienvenidos al Club", artist: "Máximo", prod: "bemo.wav", bpm: 124, key: "C#m", duration: "2:28", durationSec: 148, version: 1, c1: "#18181b", c2: "#a855f7", accent: "#7e22ce", glyph: "01", audioFreq: 138.6 },
      { id: "ac2-2", title: "Amorio Pt. 2", artist: "Máximo", feat: "Tizianolased", prod: "Gonza2k", bpm: 118, key: "Gm", duration: "2:50", durationSec: 170, version: 1, c1: "#2e1065", c2: "#c084fc", accent: "#7e22ce", glyph: "02", audioFreq: 116.5 },
      { id: "ac2-3", title: "Después de las 5", artist: "Máximo", prod: "ando.flp", bpm: 132, key: "Em", duration: "2:36", durationSec: 156, version: 1, c1: "#3b0764", c2: "#e9d5ff", accent: "#7e22ce", glyph: "03", audioFreq: 164.8 },
    ],
  },
];

export const INITIAL_PROJECTS: Project[] = DEMO_PROJECTS;

// ==================== NOVEDADES DE PRODUCTORES (SOLO PRODUCTORES REALES: dorkke, Gonza2k, 2ounces, bemo.wav, ando.flp, erreorocko, Icylucki, nutsvk) ====================
export const INITIAL_PRODUCER_DROPS: ProducerDropItem[] = [
  {
    id: "drop-dorkke-beatpost",
    title: "CHICKENNUGGET STEMS & BEATPOST #01",
    producer: "dorkke",
    producerHandle: "@dorkke",
    kind: "Beatpost",
    bpmLabel: "144 BPM",
    keyLabel: "Fm",
    itemsCountLabel: "Beatpost + Stems",
    tag: "BEATPOST // DORKKE",
    c1: "#09090b",
    c2: "#818cf8",
    accent: "#4338ca",
    description: "Instrumental crudo estilo i am GOD / uno más con 808 saturado y sintes industriales.",
    projectId: "chickennugget",
    previewTrack: {
      id: "pk-drk-1",
      title: "[BEATPOST] dorkke — god_mode_144bpm",
      artist: "dorkke",
      prod: "dorkke",
      bpm: 144,
      key: "Fm",
      duration: "1:53",
      durationSec: 113,
      version: 1,
      note: "Beatpost libre p/ vocal",
      c1: "#09090b",
      c2: "#818cf8",
      accent: "#4338ca",
      glyph: "BP",
      audioFreq: 116.5,
    },
  },
  {
    id: "drop-gonza2k-catalogo",
    title: "CATÁLOGO DE BEATS 2026 // GONZA2K",
    producer: "Gonza2k",
    producerHandle: "@gonza2k",
    kind: "Catálogo de Beats",
    bpmLabel: "136–148 BPM",
    keyLabel: "WAV + Trackouts",
    itemsCountLabel: "28 beats disponibles",
    tag: "CATÁLOGO // GONZA2K",
    c1: "#082f49",
    c2: "#38bdf8",
    accent: "#0284c7",
    description: "Catálogo actualizado de Gonza2k (productor en chickenNugget). Beats listos para grabar con stems.",
    projectId: "chickennugget",
    previewTrack: {
      id: "pk-g2k-1",
      title: "[CATÁLOGO] Gonza2k — florcita_bounce_142bpm",
      artist: "Gonza2k",
      prod: "Gonza2k",
      bpm: 142,
      key: "Gm",
      duration: "1:45",
      durationSec: 105,
      version: 1,
      note: "Catálogo 2026",
      c1: "#082f49",
      c2: "#38bdf8",
      accent: "#0284c7",
      glyph: "CB",
      audioFreq: 123.5,
    },
  },
  {
    id: "drop-2ounces-drumkit",
    title: "2OUNCES HEAVY 808 DRUMKIT VOL. 1",
    producer: "2ounces",
    producerHandle: "@2ounces",
    kind: "Drumkit",
    bpmLabel: "135–155 BPM",
    keyLabel: "24-bit WAV",
    itemsCountLabel: "90 one-shots · 25 808s",
    tag: "DRUMKIT // 2OUNCES",
    c1: "#1c1917",
    c2: "#facc15",
    accent: "#ca8a04",
    description: "Los 808s, claps, hi-hats y percusiones que suenan en esta cumbia y el tablero.",
    projectId: "chickennugget",
    previewTrack: {
      id: "pk-2oz-1",
      title: "[DRUMKIT] 2ounces — cumbia_808_knock",
      artist: "2ounces",
      prod: "2ounces",
      bpm: 138,
      key: "Cm",
      duration: "1:41",
      durationSec: 101,
      version: 1,
      note: "Drumkit Preview",
      c1: "#1c1917",
      c2: "#facc15",
      accent: "#ca8a04",
      glyph: "DK",
      audioFreq: 110.0,
    },
  },
  {
    id: "drop-bemowav-soundkit",
    title: "BEMO.WAV ANALOG TEXTURES SOUNDKIT",
    producer: "bemo.wav",
    producerHandle: "@bemo.wav",
    kind: "Soundkit",
    bpmLabel: "Multi-tempo",
    keyLabel: "Presets + One-Shots",
    itemsCountLabel: "65 presets · 40 phrases",
    tag: "SOUNDKIT // BEMO.WAV",
    c1: "#042f2e",
    c2: "#2dd4bf",
    accent: "#0d9488",
    description: "Bancos de Serum, pads granulares, acordes procesados en cinta y texturas ambientales.",
    projectId: "perdon-la-demora",
    previewTrack: {
      id: "pk-bemo-1",
      title: "[SOUNDKIT] bemo.wav — tape_pad_phrase",
      artist: "bemo.wav",
      prod: "bemo.wav",
      bpm: 132,
      key: "Gm",
      duration: "1:36",
      durationSec: 96,
      version: 1,
      note: "Soundkit Preview",
      c1: "#042f2e",
      c2: "#2dd4bf",
      accent: "#0d9488",
      glyph: "SK",
      audioFreq: 130.8,
    },
  },
  {
    id: "drop-andoflp-loopkit",
    title: "ANDO.FLP MELODIC & SYNTH LOOPKIT",
    producer: "ando.flp",
    producerHandle: "@ando.flp",
    kind: "Loopkit",
    bpmLabel: "124–148 BPM",
    keyLabel: "Stems + MIDI",
    itemsCountLabel: "35 loops + FLPs",
    tag: "LOOPKIT // ANDO.FLP",
    c1: "#1f1209",
    c2: "#fb923c",
    accent: "#ea580c",
    description: "Loops listos para tirar al playlist con stems individuales y archivos FLP de muestra.",
    projectId: "ma7ias",
    previewTrack: {
      id: "pk-ando-1",
      title: "[LOOPKIT] ando.flp — retornables_synth_138bpm",
      artist: "ando.flp",
      prod: "ando.flp",
      bpm: 138,
      key: "Am",
      duration: "1:48",
      durationSec: 108,
      version: 1,
      note: "Loopkit + Stems",
      c1: "#1f1209",
      c2: "#fb923c",
      accent: "#ea580c",
      glyph: "LK",
      audioFreq: 146.8,
    },
  },
  {
    id: "drop-erreorocko-drumkit",
    title: "ERREOROCKO UNDERGROUND DRUMKIT",
    producer: "erreorocko",
    producerHandle: "@erreorocko",
    kind: "Drumkit",
    bpmLabel: "130–150 BPM",
    keyLabel: "WAV 24-bit",
    itemsCountLabel: "75 drums + loops",
    tag: "DRUMKIT // ERREOROCKO",
    c1: "#2e1065",
    c2: "#c084fc",
    accent: "#9333ea",
    description: "Snares secos, kicks saturados, 808s profundos y percusión sucia por erreorocko.",
    projectId: "esto-es-estar-en-sonido",
    previewTrack: {
      id: "pk-rocko-1",
      title: "[DRUMKIT] erreorocko — baddie_bounce_144bpm",
      artist: "erreorocko",
      prod: "erreorocko",
      bpm: 144,
      key: "Em",
      duration: "1:32",
      durationSec: 92,
      version: 1,
      note: "Drumkit Demo",
      c1: "#2e1065",
      c2: "#c084fc",
      accent: "#9333ea",
      glyph: "DK",
      audioFreq: 138.6,
    },
  },
  {
    id: "drop-icylucki-beatpost",
    title: "ICYLUCKI // 3AM & LOVE2HATE BEATPOST",
    producer: "Icylucki",
    producerHandle: "@icylucki",
    kind: "Beatpost",
    bpmLabel: "138 BPM",
    keyLabel: "C#m",
    itemsCountLabel: "Beatpost + Hook abierto",
    tag: "BEATPOST // ICYLUCKI",
    c1: "#4c0519",
    c2: "#f43f5e",
    accent: "#be123c",
    description: "Beatpost producido por Icylucki con estética Love2Hate / Extazy Vol. 2.",
    projectId: "love2hate",
    previewTrack: {
      id: "pk-icy-1",
      title: "[BEATPOST] Icylucki — 3am_type_beat",
      artist: "Icylucki",
      prod: "Icylucki",
      bpm: 138,
      key: "C#m",
      duration: "2:05",
      durationSec: 125,
      version: 1,
      note: "Rapero & Productor",
      c1: "#4c0519",
      c2: "#f43f5e",
      accent: "#be123c",
      glyph: "BP",
      audioFreq: 130.8,
    },
  },
  {
    id: "drop-nutsvk-catalogo",
    title: "NUTSVK DARK 808 CATÁLOGO & SOUNDKIT",
    producer: "nutsvk",
    producerHandle: "@nutsvk",
    kind: "Catálogo de Beats",
    bpmLabel: "136–154 BPM",
    keyLabel: "WAV + Stems",
    itemsCountLabel: "20 beats oscuros",
    tag: "CATÁLOGO // NUTSVK",
    c1: "#18181b",
    c2: "#e11d48",
    accent: "#e11d48",
    description: "Instrumentales agresivos con 808s distorsionados al estilo PIÑAZOS Y PATADAS y ME TIRAN.",
    projectId: "ma7ias",
    previewTrack: {
      id: "pk-nuts-1",
      title: "[CATÁLOGO] nutsvk — patadas_808_148bpm",
      artist: "nutsvk",
      prod: "nutsvk",
      bpm: 148,
      key: "Fm",
      duration: "1:50",
      durationSec: 110,
      version: 1,
      note: "nutsvk prod",
      c1: "#18181b",
      c2: "#e11d48",
      accent: "#e11d48",
      glyph: "CB",
      audioFreq: 110.0,
    },
  },
];

export const DEMO_PRODUCER_DROPS = INITIAL_PRODUCER_DROPS;
