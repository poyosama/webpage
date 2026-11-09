// Datos curados para "El tablero" — Artistas, Proyectos y Novedades de Productores
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
  id: "poyo",
  handle: "@poyo",
  name: "poyo",
  email: "poyo@eltablero.mza",
  role: "Artista · Productor · Curador",
  zone: "Mendoza",
  crew: "EL TABLERO // UG",
  bio: "chickenNugget EP. beats crudos, stems abiertos, cero caretaje.",
  color: "#111111",
  tracksCount: 42,
  projectsCount: 5,
  friendsCount: 31,
  followersCount: 1420,
  playsTotal: "28.4K",
  stickers: ["🍗", "💿", "🎛️", "🔥", "⚡"],
};

export const SCENE_ARTISTS: ArtistProfile[] = [
  INITIAL_ME_PROFILE,
  {
    id: "eyebags",
    handle: "@eyebags",
    name: "eyebags",
    role: "Artista · Vocal · Mixtape",
    zone: "Mendoza",
    crew: "LA PLAGA",
    bio: "ojeras, frecuencias bajas y distorsión nocturna. LA PLAGA mixtape.",
    color: "#e11d48",
    tracksCount: 34,
    projectsCount: 4,
    friendsCount: 28,
    followersCount: 1890,
    playsTotal: "41.2K",
    stickers: ["👁️", "🕷️", "🩸"],
  },
  {
    id: "tizianolased",
    handle: "@tizianolased",
    name: "Tizianolased",
    role: "Artista · Rapero",
    zone: "Mendoza",
    crew: "LA SED",
    bio: "PERDÓN POR LA DEMORA. barras crudas y melodías rotas a las 4am.",
    color: "#0284c7",
    tracksCount: 29,
    projectsCount: 3,
    friendsCount: 24,
    followersCount: 1540,
    playsTotal: "33.8K",
    stickers: ["💧", "⏳", "🎙️"],
  },
  {
    id: "v4lentin0",
    handle: "@v4lentin0",
    name: "V4lentin0",
    role: "Artista · Productor · LP",
    zone: "Mendoza",
    crew: "EN SONIDO",
    bio: "ESTO ES ESTAR EN SONIDO. diseño sonoro, sintes abiertos y textura analógica.",
    color: "#65a30d",
    tracksCount: 51,
    projectsCount: 6,
    friendsCount: 39,
    followersCount: 2110,
    playsTotal: "52.0K",
    stickers: ["🔊", "🟢", "🎛️"],
  },
  {
    id: "maximo",
    handle: "@maximo",
    name: "Máximo",
    role: "Artista · Vocal",
    zone: "Mendoza",
    crew: "AMORIO CLUB",
    bio: "AMORIO CLUB 2. R&B distorsionado, club nocturno y bajos profundos.",
    color: "#7e22ce",
    tracksCount: 26,
    projectsCount: 3,
    friendsCount: 33,
    followersCount: 1680,
    playsTotal: "36.5K",
    stickers: ["💜", "🥂", "🌙"],
  },
  {
    id: "ma7imza",
    handle: "@ma7imza",
    name: "Ma7imza",
    role: "Productor · Sound Designer",
    zone: "Mendoza",
    crew: "0261 LAB",
    bio: "drumkits pesados, 808s quirúrgicos y catálogos de beats para la escena.",
    color: "#ca8a04",
    tracksCount: 94,
    projectsCount: 8,
    friendsCount: 45,
    followersCount: 1320,
    playsTotal: "29.7K",
    stickers: ["🥁", "⚡", "📦"],
  },
  {
    id: "nvcho",
    handle: "@nvcho",
    name: "Nvcho",
    role: "Productor · Beatmaker",
    zone: "Mendoza",
    crew: "UG BOARD",
    bio: "loopkits oscuros, sintes detuneados y beatposts semanales.",
    color: "#ea580c",
    tracksCount: 78,
    projectsCount: 7,
    friendsCount: 37,
    followersCount: 1190,
    playsTotal: "24.1K",
    stickers: ["🎹", "🔥", "💿"],
  },
  {
    id: "alvamusicc",
    handle: "@alvamusicc",
    name: "alva musicc",
    role: "Productor · Mix · Soundkits",
    zone: "Mendoza",
    crew: "ALVA STUDIO",
    bio: "texturas ambientales, soundkits custom y producción ejecutiva.",
    color: "#0d9488",
    tracksCount: 63,
    projectsCount: 5,
    friendsCount: 29,
    followersCount: 980,
    playsTotal: "19.6K",
    stickers: ["🌊", "🎚️", "💎"],
  },
  {
    id: "dorkke",
    handle: "@dorkke",
    name: "dorkke",
    role: "Productor · Glitch · Experimental",
    zone: "Mendoza",
    crew: "SUBSUELO",
    bio: "bitcrush, percusión rota, drumkits industriales y beats deformes.",
    color: "#4338ca",
    tracksCount: 82,
    projectsCount: 6,
    friendsCount: 26,
    followersCount: 1105,
    playsTotal: "22.3K",
    stickers: ["👾", "⛓️", "🔋"],
  },
];

export const INITIAL_PROJECTS: Project[] = [
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
    attributes: ["Mendoza", "2026", "Dark Trap", "Mixtape"],
    c1: "#18181b",
    c2: "#e11d48",
    accent: "#e11d48",
    tagGlyph: "01 // MXT",
    description: "LA PLAGA mixtape por eyebags. Bajos saturados, noches sin dormir y producción cruda.",
    plays: "19.4K",
    blockPos: [-1.15, 0.85, 0.55],
    blockSize: [1.55, 1.45, 1.55],
    videos: [
      { id: "v-lp-1", label: "la_plaga_teaser_01.mp4 (4s)", kind: "procedural", stylePreset: "vhs-grain", c1: "#18181b", c2: "#e11d48" },
      { id: "v-lp-2", label: "eyebags_studio_cam.gif (3s)", kind: "procedural", stylePreset: "kinetic-type", c1: "#f43f5e", c2: "#111111" },
      { id: "v-lp-3", label: "termica_plaga.mp4 (5s)", kind: "procedural", stylePreset: "thermal-wave", c1: "#881337", c2: "#fde047" },
    ],
    tracks: [
      { id: "lp-1", title: "Peste Nocturna (Intro)", artist: "eyebags", prod: "Ma7imza", bpm: 142, key: "F#m", duration: "1:54", durationSec: 114, version: 3, note: "808 al frente", c1: "#111111", c2: "#e11d48", accent: "#e11d48", glyph: "I", audioFreq: 110 },
      { id: "lp-2", title: "LA PLAGA", artist: "eyebags", feat: "poyo", prod: "Nvcho", bpm: 146, key: "Am", duration: "2:38", durationSec: 158, version: 5, note: "master v5", c1: "#1f2937", c2: "#fb7185", accent: "#e11d48", glyph: "II", audioFreq: 130.8 },
      { id: "lp-3", title: "Sin Dormir", artist: "eyebags", prod: "dorkke", bpm: 138, key: "Dm", duration: "2:21", durationSec: 141, version: 2, note: "corte sucio", c1: "#09090b", c2: "#f43f5e", accent: "#e11d48", glyph: "III", audioFreq: 146.8 },
      { id: "lp-4", title: "Humo en el Lobby", artist: "eyebags", feat: "Tizianolased", prod: "alva musicc", bpm: 134, key: "Cm", duration: "2:49", durationSec: 169, version: 4, note: "voces dobladas", c1: "#18181b", c2: "#fda4af", accent: "#e11d48", glyph: "IV", audioFreq: 164.8 },
      { id: "lp-5", title: "Ceniza (Outro)", artist: "eyebags", prod: "Ma7imza", bpm: 124, key: "Em", duration: "2:08", durationSec: 128, version: 1, note: "one-take", c1: "#27272a", c2: "#9f1239", accent: "#e11d48", glyph: "V", audioFreq: 98 },
    ],
  },
  {
    id: "perdon-por-la-demora",
    title: "PERDÓN POR LA DEMORA",
    artist: "Tizianolased",
    artistId: "tizianolased",
    type: "Mixtape",
    status: "Publicado",
    year: "2026",
    dateLabel: "MIXTAPE · 2026",
    zone: "Mendoza",
    attributes: ["Mendoza", "2026", "Mixtape", "La Sed"],
    c1: "#0c4a6e",
    c2: "#38bdf8",
    accent: "#0284c7",
    tagGlyph: "02 // MXT",
    description: "PERDÓN POR LA DEMORA por Tizianolased.Valió cada segundo de espera.",
    plays: "16.8K",
    blockPos: [0.65, 1.05, -0.45],
    blockSize: [1.65, 1.55, 1.5],
    videos: [
      { id: "v-ppd-1", label: "demora_visualizer.mp4 (4s)", kind: "procedural", stylePreset: "liquid-ink", c1: "#0c4a6e", c2: "#38bdf8" },
      { id: "v-ppd-2", label: "tiziano_vhs_cut.gif (3s)", kind: "procedural", stylePreset: "halftone-cam", c1: "#0284c7", c2: "#e0f2fe" },
    ],
    tracks: [
      { id: "ppd-1", title: "Llegué Tarde", artist: "Tizianolased", prod: "alva musicc", bpm: 132, key: "Gm", duration: "2:33", durationSec: 153, version: 4, note: "master final", c1: "#0c4a6e", c2: "#38bdf8", accent: "#0284c7", glyph: "01", audioFreq: 123.5 },
      { id: "ppd-2", title: "Perdón Por La Demora", artist: "Tizianolased", feat: "Máximo", prod: "Nvcho", bpm: 136, key: "Bm", duration: "2:52", durationSec: 172, version: 3, note: "808 largo", c1: "#075985", c2: "#7dd3fc", accent: "#0284c7", glyph: "02", audioFreq: 138.6 },
      { id: "ppd-3", title: "4 Llamadas Perdidas", artist: "Tizianolased", feat: "eyebags", prod: "Ma7imza", bpm: 140, key: "Fm", duration: "2:24", durationSec: 144, version: 2, note: "stems abiertos", c1: "#082f49", c2: "#0ea5e9", accent: "#0284c7", glyph: "03", audioFreq: 110 },
      { id: "ppd-4", title: "Madrugada en MZA", artist: "Tizianolased", prod: "poyo", bpm: 128, key: "Cm", duration: "2:41", durationSec: 161, version: 1, note: "cierre", c1: "#0c4a6e", c2: "#0284c7", accent: "#0284c7", glyph: "04", audioFreq: 146.8 },
    ],
  },
  {
    id: "chickennugget",
    title: "chickenNugget",
    artist: "poyo",
    artistId: "poyo",
    type: "EP",
    status: "Publicado",
    year: "2026",
    dateLabel: "EP · POYO",
    zone: "Mendoza",
    attributes: ["Mendoza", "2026", "EP", "Bounce"],
    c1: "#1c1917",
    c2: "#facc15",
    accent: "#ca8a04",
    tagGlyph: "03 // EP",
    description: "chickenNugget EP por poyo. Crujiente, distorsionado y con 808s que patean el tablero.",
    plays: "22.1K",
    blockPos: [-1.35, -0.55, -0.5],
    blockSize: [1.5, 1.35, 1.6],
    videos: [
      { id: "v-cn-1", label: "chickennugget_loop.mp4 (5s)", kind: "procedural", stylePreset: "strobe-cut", c1: "#1c1917", c2: "#facc15" },
      { id: "v-cn-2", label: "poyo_mpc_session.gif (3s)", kind: "procedural", stylePreset: "kinetic-type", c1: "#ca8a04", c2: "#fef08a" },
    ],
    tracks: [
      { id: "cn-1", title: "chickenNugget", artist: "poyo", prod: "poyo", bpm: 144, key: "Fm", duration: "2:05", durationSec: 125, version: 4, note: "808 saturado", c1: "#1c1917", c2: "#facc15", accent: "#ca8a04", glyph: "N1", audioFreq: 116.5 },
      { id: "cn-2", title: "Salsa Picante", artist: "poyo", feat: "eyebags", prod: "poyo & Ma7imza", bpm: 148, key: "C#m", duration: "2:18", durationSec: 138, version: 3, note: "bounce", c1: "#292524", c2: "#fde047", accent: "#ca8a04", glyph: "N2", audioFreq: 138.6 },
      { id: "cn-3", title: "Drive-Thru 3AM", artist: "poyo", feat: "V4lentin0", prod: "dorkke", bpm: 136, key: "Am", duration: "2:30", durationSec: 150, version: 2, note: "synth lead", c1: "#44403c", c2: "#eab308", accent: "#ca8a04", glyph: "N3", audioFreq: 146.8 },
      { id: "cn-4", title: "Combo Deluxe (Outro)", artist: "poyo", prod: "poyo", bpm: 140, key: "Em", duration: "1:58", durationSec: 118, version: 1, note: "clipper al taco", c1: "#1c1917", c2: "#fef08a", accent: "#ca8a04", glyph: "N4", audioFreq: 164.8 },
    ],
  },
  {
    id: "esto-es-estar-en-sonido",
    title: "ESTO ES ESTAR EN SONIDO",
    artist: "V4lentin0",
    artistId: "v4lentin0",
    type: "LP",
    status: "Publicado",
    year: "2026",
    dateLabel: "LP · FULL ALBUM",
    zone: "Mendoza",
    attributes: ["Mendoza", "2026", "LP", "Experimental"],
    c1: "#1e1b4b",
    c2: "#a3e635",
    accent: "#65a30d",
    tagGlyph: "04 // LP",
    description: "ESTO ES ESTAR EN SONIDO (LP) por V4lentin0. Arquitectura sonora, sintetizadores y frecuencias vivas.",
    plays: "25.7K",
    blockPos: [0.35, -0.35, 0.85],
    blockSize: [1.65, 1.45, 1.55],
    videos: [
      { id: "v-ees-1", label: "estar_en_sonido_osc.mp4 (4s)", kind: "procedural", stylePreset: "thermal-wave", c1: "#1e1b4b", c2: "#a3e635" },
      { id: "v-ees-2", label: "v4lentin0_synth_rig.gif (4s)", kind: "procedural", stylePreset: "vhs-grain", c1: "#312e81", c2: "#bef264" },
    ],
    tracks: [
      { id: "ees-1", title: "Estar En Sonido", artist: "V4lentin0", prod: "V4lentin0", bpm: 130, key: "F#m", duration: "3:04", durationSec: 184, version: 6, note: "apertura LP", c1: "#1e1b4b", c2: "#a3e635", accent: "#65a30d", glyph: "A1", audioFreq: 123.5 },
      { id: "ees-2", title: "Frecuencia Madre", artist: "V4lentin0", feat: "poyo", prod: "V4lentin0 & alva musicc", bpm: 144, key: "Cm", duration: "2:46", durationSec: 166, version: 3, note: "sub estéreo", c1: "#312e81", c2: "#bef264", accent: "#65a30d", glyph: "A2", audioFreq: 146.8 },
      { id: "ees-3", title: " Fase Cero", artist: "V4lentin0", feat: "dorkke", prod: "dorkke", bpm: 126, key: "G#m", duration: "3:12", durationSec: 192, version: 2, note: "modular patch", c1: "#1e1b4b", c2: "#84cc16", accent: "#65a30d", glyph: "B1", audioFreq: 110 },
      { id: "ees-4", title: "Resonancia 0261", artist: "V4lentin0", feat: "Tizianolased", bpm: 118, key: "Dm", duration: "2:55", durationSec: 175, version: 4, note: "outro analógico", c1: "#0f172a", c2: "#d9f99d", accent: "#65a30d", glyph: "B2", audioFreq: 155.6 },
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
    attributes: ["Mendoza", "2026", "EP", "Club / R&B"],
    c1: "#2e1065",
    c2: "#c084fc",
    accent: "#7e22ce",
    tagGlyph: "05 // EP",
    description: "AMORIO CLUB 2 (EP) por Máximo. Luces bajas, melodías nocturnas y sub-bajos de club.",
    plays: "18.3K",
    blockPos: [1.55, -0.75, -0.35],
    blockSize: [1.45, 1.35, 1.45],
    videos: [
      { id: "v-ac2-1", label: "amorio_club_vip.mp4 (3s)", kind: "procedural", stylePreset: "strobe-cut", c1: "#2e1065", c2: "#c084fc" },
      { id: "v-ac2-2", label: "maximo_backstage.gif (4s)", kind: "procedural", stylePreset: "halftone-cam", c1: "#581c87", c2: "#f3e8ff" },
    ],
    tracks: [
      { id: "ac2-1", title: "Bienvenidos al Club", artist: "Máximo", prod: "Nvcho", bpm: 122, key: "C#m", duration: "2:28", durationSec: 148, version: 3, note: "vocal silk", c1: "#18181b", c2: "#a855f7", accent: "#7e22ce", glyph: "C1", audioFreq: 138.6 },
      { id: "ac2-2", title: "Amorio Pt. 2", artist: "Máximo", feat: "Tizianolased", prod: "alva musicc", bpm: 116, key: "Gm", duration: "2:50", durationSec: 170, version: 4, note: "reverb largo", c1: "#2e1065", c2: "#c084fc", accent: "#7e22ce", glyph: "C2", audioFreq: 116.5 },
      { id: "ac2-3", title: "Después de las 5", artist: "Máximo", feat: "eyebags", prod: "Ma7imza", bpm: 134, key: "Em", duration: "2:36", durationSec: 156, version: 2, note: "808 glide", c1: "#3b0764", c2: "#e9d5ff", accent: "#7e22ce", glyph: "C3", audioFreq: 164.8 },
    ],
  },
];

// Novedades de Productores: Beatpost, Soundkit, Drumkit, Loopkit, Catálogo de Beats
export const INITIAL_PRODUCER_DROPS: ProducerDropItem[] = [
  {
    id: "drop-ma7imza-drumkit",
    title: "0261 SURGICAL DRUMKIT VOL. 1",
    producer: "Ma7imza",
    producerHandle: "@ma7imza",
    kind: "Drumkit",
    bpmLabel: "135–155 BPM",
    keyLabel: "24-bit WAV",
    itemsCountLabel: "85 one-shots · 22 808s",
    tag: "DRUMKIT // 808s & PERCS",
    c1: "#18181b",
    c2: "#facc15",
    accent: "#ca8a04",
    description: "808s distorsionados, rims secos, snares cortantes y hi-hats listos para trap y rage.",
    projectId: "la-plaga",
    previewTrack: {
      id: "pk-ma7-1",
      title: "[PREVIEW] 0261 Surgical 808 Demo",
      artist: "Ma7imza",
      prod: "Ma7imza",
      bpm: 146,
      key: "F#m",
      duration: "1:12",
      durationSec: 72,
      version: 1,
      note: "Drumkit Demo · 808 Spinz Mod",
      c1: "#18181b",
      c2: "#facc15",
      accent: "#ca8a04",
      glyph: "DK",
      audioFreq: 110,
    },
  },
  {
    id: "drop-nvcho-loopkit",
    title: "NOCTURNO ANALOG LOOPKIT",
    producer: "Nvcho",
    producerHandle: "@nvcho",
    kind: "Loopkit",
    bpmLabel: "120–144 BPM",
    keyLabel: "Key & BPM Labeled",
    itemsCountLabel: "30 melodies + stems",
    tag: "LOOPKIT // SYNTH & STEMS",
    c1: "#1f1209",
    c2: "#fb923c",
    accent: "#ea580c",
    description: "Loops oscuros con Prophet y guitarras procesadas con cinta. Incluye stems separados.",
    projectId: "perdon-por-la-demora",
    previewTrack: {
      id: "pk-nvc-1",
      title: "[LOOP 04] Nocturno Prophet 138bpm Fm",
      artist: "Nvcho",
      prod: "Nvcho",
      bpm: 138,
      key: "Fm",
      duration: "1:28",
      durationSec: 88,
      version: 1,
      note: "Stems incluidos",
      c1: "#1f1209",
      c2: "#fb923c",
      accent: "#ea580c",
      glyph: "LK",
      audioFreq: 130.8,
    },
  },
  {
    id: "drop-alva-soundkit",
    title: "ALVA TEXTURES & SERUM SOUNDKIT",
    producer: "alva musicc",
    producerHandle: "@alvamusicc",
    kind: "Soundkit",
    bpmLabel: "Multi-tempo",
    keyLabel: "Presets + Phrases",
    itemsCountLabel: "60 presets · 40 phrases",
    tag: "SOUNDKIT // PRESETS & TEXTURAS",
    c1: "#042f2e",
    c2: "#2dd4bf",
    accent: "#0d9488",
    description: "Bancos de sonidos atmosféricos, pads granulares, vocal chops y texturas analógicas.",
    projectId: "amorio-club-2",
    previewTrack: {
      id: "pk-alv-1",
      title: "[SOUNDKIT] Granular Pad & Sub Phrase",
      artist: "alva musicc",
      prod: "alva musicc",
      bpm: 124,
      key: "Cm",
      duration: "1:36",
      durationSec: 96,
      version: 1,
      note: "Soundkit Preview",
      c1: "#042f2e",
      c2: "#2dd4bf",
      accent: "#0d9488",
      glyph: "SK",
      audioFreq: 123.5,
    },
  },
  {
    id: "drop-dorkke-beatpost",
    title: "GLITCH BONE // BEATPOST #09",
    producer: "dorkke",
    producerHandle: "@dorkke",
    kind: "Beatpost",
    bpmLabel: "152 BPM",
    keyLabel: "C#m",
    itemsCountLabel: "Beat libre p/ vocal",
    tag: "BEATPOST // OPEN VERSE",
    c1: "#1e1b4b",
    c2: "#818cf8",
    accent: "#4338ca",
    description: "Beatpost industrial con 808 bitcrusheado y cambio de ritmo en el minuto 1:10.",
    projectId: "esto-es-estar-en-sonido",
    previewTrack: {
      id: "pk-drk-1",
      title: "GLITCH BONE (152bpm C#m) [Beatpost]",
      artist: "dorkke",
      prod: "dorkke",
      bpm: 152,
      key: "C#m",
      duration: "2:04",
      durationSec: 124,
      version: 2,
      note: "DM para stems",
      c1: "#1e1b4b",
      c2: "#818cf8",
      accent: "#4338ca",
      glyph: "BP",
      audioFreq: 138.6,
    },
  },
  {
    id: "drop-poyo-catalogo",
    title: "CATÁLOGO DE BEATS 2026 // POYO & FRIENDS",
    producer: "poyo",
    producerHandle: "@poyo",
    kind: "Catálogo de Beats",
    bpmLabel: "118–150 BPM",
    keyLabel: "WAV + Trackouts",
    itemsCountLabel: "24 beats disponibles",
    tag: "CATÁLOGO // LICENCIAS & EXCLUSIVOS",
    c1: "#18181b",
    c2: "#e11d48",
    accent: "#e11d48",
    description: "Catálogo curado de instrumentales listos para grabar con stems abiertos y mezcla incluida.",
    projectId: "chickennugget",
    previewTrack: {
      id: "pk-poy-1",
      title: "[CATÁLOGO #01] Nugget Bounce Type Beat",
      artist: "poyo",
      prod: "poyo",
      bpm: 144,
      key: "Gm",
      duration: "2:10",
      durationSec: 130,
      version: 1,
      note: "Disponible en Catálogo",
      c1: "#18181b",
      c2: "#e11d48",
      accent: "#e11d48",
      glyph: "CB",
      audioFreq: 116.5,
    },
  },
];
