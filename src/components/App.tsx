"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  DEMO_PROJECTS,
  INITIAL_ME_PROFILE,
  INITIAL_PRODUCER_DROPS,
  INITIAL_PROJECTS,
  SCENE_ARTISTS,
  STANDBY_PROJECT,
  STANDBY_TRACK,
  type ArtistProfile,
  type ProducerDropItem,
  type ProducerDropKind,
  type Project,
  type ProjectType,
  type ProjectVideoClip,
  type Track,
} from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import MacInstallerUpload from "./MacInstallerUpload";
import UntitledImporter from "./UntitledImporter";
import type { QueueEntry, RepeatMode } from "./PerformativePlayer";
import {
  supabase,
  isSupabaseConfigured,
  fetchUserProjectsFromSupabase,
  fetchCommunityProfilesFromSupabase,
  uploadMediaToSupabase,
} from "@/lib/supabase";

const DiscSpinner3D = dynamic(() => import("./DiscSpinner3D"), { ssr: false });
const PerformativePlayer = dynamic(() => import("./PerformativePlayer"), { ssr: false });
const ManifoldLibrary3D = dynamic(() => import("./ManifoldLibrary3D"), { ssr: false });
const CreateProjectScreen = dynamic(() => import("./CreateProjectScreen"), { ssr: false });

type ScreenTab = "inicio" | "subir" | "biblioteca" | "perfil" | "crear-proyecto";

const PROJECT_TYPES: ProjectType[] = [
  "Mixtape",
  "EP",
  "LP",
  "Album",
  "Single",
  "Beatpost",
  "Soundkit",
  "Drumkit",
  "Loopkit",
  "Catálogo de Beats",
  "WIP",
];

const PRODUCER_DROP_KINDS: ("Todos" | ProducerDropKind)[] = [
  "Todos",
  "Beatpost",
  "Soundkit",
  "Drumkit",
  "Loopkit",
  "Catálogo de Beats",
];

const STORAGE_PROJECTS_KEY = "eltablero_real_projects_v1";
const STORAGE_PROFILE_KEY = "eltablero_real_profile_v1";
const STORAGE_DROPS_KEY = "eltablero_real_drops_v1";

function TrashIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function DiscIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState<ScreenTab>("inicio");
  const [meProfile, setMeProfile] = useState<ArtistProfile>(INITIAL_ME_PROFILE);
  const [projects, setProjects] = useState<Project[]>([]);
  const [communityArtists, setCommunityArtists] = useState<ArtistProfile[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [producerDrops, setProducerDrops] = useState<ProducerDropItem[]>([]);
  const [producerFilter, setProducerFilter] = useState<"Todos" | ProducerDropKind>("Todos");
  const [hydrated, setHydrated] = useState<boolean>(false);

  // Estado del reproductor persistente + pantalla completa (con funciones completas de Spotify)
  const [currentTrack, setCurrentTrack] = useState<Track>(STANDBY_TRACK);
  const [currentProject, setCurrentProject] = useState<Project>(STANDBY_PROJECT);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playerExpanded, setPlayerExpanded] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.85);
  const [shuffle, setShuffle] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [likedTrackIds, setLikedTrackIds] = useState<string[]>([]);
  const [userQueue, setUserQueue] = useState<QueueEntry[]>([]);
  const [customAudioMap, setCustomAudioMap] = useState<Record<string, string>>({});

  // Input temporal para agregar atributos personalizados a un proyecto en Biblioteca
  const [newAttrInput, setNewAttrInput] = useState<string>("");

  // Vista 3D en Mis Proyectos: Vinilos 3D en arco fijo
  const [libraryViewMode, setLibraryViewMode] = useState<"manifold" | "disc-row">("disc-row");
  // Modo de display en Biblioteca: 1 (default) "inside" (Por defecto) o 2 "side-by-side" (Lado a Lado)
  const [libraryLayoutMode, setLibraryLayoutMode] = useState<"inside" | "side-by-side">("inside");
  const [insideCubeOpen, setInsideCubeOpen] = useState<boolean>(false);

  // Modales: Editar Track, Editar Proyecto, Editar Perfil y Login/Register con Google
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editProfileOpen, setEditProfileOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [googleConnected, setGoogleConnected] = useState<boolean>(false);

  // Hidratar proyectos y perfil guardados por el usuario en su dispositivo (Web / Capacitor iOS)
  useEffect(() => {
    try {
      const savedProjs = localStorage.getItem(STORAGE_PROJECTS_KEY);
      if (savedProjs) {
        const parsed = JSON.parse(savedProjs) as Project[];
        if (Array.isArray(parsed)) {
          setProjects(parsed);
          if (parsed[0]) {
            setSelectedProjectId(parsed[0].id);
            setCurrentProject(parsed[0]);
            if (parsed[0].tracks[0]) setCurrentTrack(parsed[0].tracks[0]);
          }
        }
      }
      const savedProfile = localStorage.getItem(STORAGE_PROFILE_KEY);
      if (savedProfile) {
        const parsedProf = JSON.parse(savedProfile) as ArtistProfile;
        if (parsedProf && parsedProf.id) setMeProfile(parsedProf);
      }
      const savedDrops = localStorage.getItem(STORAGE_DROPS_KEY);
      if (savedDrops) {
        const parsedDrops = JSON.parse(savedDrops) as ProducerDropItem[];
        if (Array.isArray(parsedDrops)) setProducerDrops(parsedDrops);
      }
    } catch {
      // ignore storage errors
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      // ignore quota errors
    }
  }, [projects, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(meProfile));
    } catch {
      // ignore
    }
  }, [meProfile, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_DROPS_KEY, JSON.stringify(producerDrops));
    } catch {
      // ignore
    }
  }, [producerDrops, hydrated]);

  // Escuchar sesión activa de Supabase Auth y sincronizar datos de la nube
  useEffect(() => {
    let mounted = true;

    async function loadData() {
      // 1. Cargar perfiles reales de Supabase
      try {
        const realProfiles = await fetchCommunityProfilesFromSupabase();
        if (mounted) setCommunityArtists(realProfiles);
      } catch (err) {
        console.warn("Error cargando perfiles de comunidad:", err);
      }

      // 2. Cargar todos los proyectos reales de Supabase
      try {
        const allProjs = await fetchUserProjectsFromSupabase();
        if (allProjs && mounted) {
          setProjects(allProjs);
          if (allProjs.length > 0) {
            setSelectedProjectId(allProjs[0].id);
            setCurrentProject(allProjs[0]);
            if (allProjs[0].tracks[0]) setCurrentTrack(allProjs[0].tracks[0]);
          }
        }
      } catch (err) {
        console.warn("Error cargando proyectos de Supabase:", err);
      }

      // 3. Revisar sesión de auth
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          setGoogleConnected(true);
          const u = session.user;
          const meta = u.user_metadata || {};
          const displayName =
            meta.full_name || meta.name || u.email?.split("@")[0] || "Artista";
          const cleanHandle = `@${(meta.user_name || u.email?.split("@")[0] || "artista").replace(/[^a-zA-Z0-9_]/g, "")}`;

          setMeProfile((prev) => ({
            ...prev,
            id: u.id,
            email: u.email,
            name: displayName,
            handle: cleanHandle,
          }));

          try {
            await supabase.from("profiles").upsert(
              {
                id: u.id,
                handle: cleanHandle,
                name: displayName,
                role: "Rapero · Artista",
                zone: "Mendoza",
                crew: "UG BOARD",
              },
              { onConflict: "id" }
            );
            const updatedProfiles = await fetchCommunityProfilesFromSupabase();
            if (mounted) setCommunityArtists(updatedProfiles);
          } catch {}
        } else if (mounted) {
          setGoogleConnected(false);
        }
      } catch (err) {
        console.warn("Supabase session check:", err);
      }
    }

    loadData();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && mounted) {
        setGoogleConnected(true);
        const u = session.user;
        const meta = u.user_metadata || {};
        const displayName =
          meta.full_name || meta.name || u.email?.split("@")[0] || "Artista";
        const cleanHandle = `@${(meta.user_name || u.email?.split("@")[0] || "artista").replace(/[^a-zA-Z0-9_]/g, "")}`;

        setMeProfile((prev) => ({
          ...prev,
          id: u.id,
          email: u.email,
          name: displayName,
          handle: cleanHandle,
        }));

        try {
          await supabase.from("profiles").upsert(
            {
              id: u.id,
              handle: cleanHandle,
              name: displayName,
              role: "Rapero · Artista",
              zone: "Mendoza",
              crew: "UG BOARD",
            },
            { onConflict: "id" }
          );
          const updatedProfiles = await fetchCommunityProfilesFromSupabase();
          if (mounted) setCommunityArtists(updatedProfiles);
        } catch {}

        const allProjs = await fetchUserProjectsFromSupabase();
        if (allProjs && mounted) {
          setProjects(allProjs);
          if (allProjs.length > 0) {
            setSelectedProjectId(allProjs[0].id);
            setCurrentProject(allProjs[0]);
            if (allProjs[0].tracks[0]) setCurrentTrack(allProjs[0].tracks[0]);
          }
        }
      } else if (event === "SIGNED_OUT" && mounted) {
        setGoogleConnected(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const activeProject: Project | null =
    projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  const playTrack = (track: Track, project: Project, openFull = false) => {
    setCurrentTrack(track);
    setCurrentProject(project);
    setIsPlaying(true);
    sfx.play();
    sfx.startGroove(
      track.bpm,
      track.audioFreq,
      track.customAudioUrl || customAudioMap[track.id],
      track.durationSec,
      true
    );
    if (openFull) setPlayerExpanded(true);
  };

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      sfx.pause();
      sfx.stopGroove();
    } else {
      setIsPlaying(true);
      sfx.play();
      sfx.startGroove(
        currentTrack.bpm,
        currentTrack.audioFreq,
        currentTrack.customAudioUrl || customAudioMap[currentTrack.id],
        currentTrack.durationSec,
        false
      );
    }
  };

  const handleVolumeChange = (nextVol: number) => {
    const clamped = Math.max(0, Math.min(1, nextVol));
    setVolume(clamped);
    if (clamped > 0 && muted) {
      setMuted(false);
      sfx.setMuted(false);
    }
    sfx.setVolume(clamped);
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    sfx.setMuted(next);
  };

  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;

  useEffect(() => {
    const INTERACTIVE_SELECTOR =
      'button, a, label, select, summary, input[type="range"], input[type="color"], [role="button"], .clean-track-row, .artist-dir-item, .filmstrip-thumb, .mini-art, .mini-meta, .prop-card, .upload-dropzone, .quick-proj-pill, .video-clip-remove-btn, .ios-seg-control button, .seg-pills button, .ios-icon-btn, .apple-btn, .mini-btn, .mini-play-btn';

    let pressedEl: Element | null = null;
    let hoveredEl: Element | null = null;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        sfx.press();
        togglePlayRef.current();
      } else if (e.key === "Escape") {
        sfx.close();
        setEditingTrack(null);
        setEditProfileOpen(false);
        setAuthModalOpen(false);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const match = target?.closest?.(INTERACTIVE_SELECTOR) || null;
      if (match) {
        pressedEl = match;
        sfx.press();
      }
    };

    const onPointerUp = () => {
      if (pressedEl) {
        pressedEl = null;
        sfx.release();
      }
    };

    const onPointerOver = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const match = target?.closest?.(INTERACTIVE_SELECTOR) || null;
      if (match && match !== hoveredEl) {
        hoveredEl = match;
        sfx.hover();
      } else if (!match) {
        hoveredEl = null;
      }
    };

    const onInputOrChange = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.tagName === "SELECT" ||
        (target.tagName === "INPUT" && (target as HTMLInputElement).type === "range")
      ) {
        sfx.tick();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    window.addEventListener("pointerover", onPointerOver, { passive: true });
    window.addEventListener("input", onInputOrChange, { passive: true });
    window.addEventListener("change", onInputOrChange, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      window.removeEventListener("pointerover", onPointerOver);
      window.removeEventListener("input", onInputOrChange);
      window.removeEventListener("change", onInputOrChange);
    };
  }, []);

  const stepTrack = (dir: 1 | -1) => {
    // Si va hacia adelante y hay canciones en la cola del usuario, reproducir la primera de la cola
    if (dir === 1 && userQueue.length > 0) {
      const [nextItem, ...rest] = userQueue;
      setUserQueue(rest);
      playTrack(nextItem.track, nextItem.project, playerExpanded);
      return;
    }

    const list = currentProject.tracks;
    if (shuffle && list.length > 1) {
      const candidates = list.filter((t) => t.id !== currentTrack.id);
      const randomTrack = candidates[Math.floor(Math.random() * candidates.length)] || list[0];
      playTrack(randomTrack, currentProject, playerExpanded);
      return;
    }

    const idx = list.findIndex((t) => t.id === currentTrack.id);
    const nextIdx = (idx + dir + list.length) % list.length;
    const nextTrack = list[nextIdx] || list[0];
    playTrack(nextTrack, currentProject, playerExpanded);
  };

  // Actualizar metadata completable del proyecto (tipo, atributos, zona, año, estado, etc.)
  const updateProjectMeta = (projectId: string, patch: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const updated = { ...p, ...patch };
        if (currentProject.id === p.id) setCurrentProject(updated);
        return updated;
      })
    );
  };

  const handleAddAttribute = (projectId: string, rawAttr: string) => {
    const clean = rawAttr.trim();
    if (!clean) return;
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const existing = target.attributes || [target.zone, target.year];
    if (existing.includes(clean)) return;
    updateProjectMeta(projectId, { attributes: [...existing, clean] });
    setNewAttrInput("");
    sfx.tap();
  };

  const handleRemoveAttribute = (projectId: string, attrToRemove: string) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const existing = target.attributes || [target.zone, target.year];
    updateProjectMeta(projectId, {
      attributes: existing.filter((a) => a !== attrToRemove),
    });
    sfx.tap();
  };

  const handleAddTrackToProject = (
    projectId: string,
    newTrack: Track,
    insertIndex: number,
    customAudioUrl?: string
  ) => {
    if (customAudioUrl) {
      setCustomAudioMap((prev) => ({ ...prev, [newTrack.id]: customAudioUrl }));
    }
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const copy = [...p.tracks];
        const safeIdx = Math.max(0, Math.min(copy.length, insertIndex));
        copy.splice(safeIdx, 0, newTrack);
        const updated = { ...p, tracks: copy };
        if (currentProject.id === p.id) setCurrentProject(updated);
        return updated;
      })
    );
    setSelectedProjectId(projectId);
  };

  const handleUploadProjectVideo = (projectId: string, file: File) => {
    const url = URL.createObjectURL(file);
    const isImage =
      file.type.startsWith("image/") || /\.(gif|png|jpe?g|webp|avif)$/i.test(file.name);
    const newClip: ProjectVideoClip = {
      id: `clip-${Date.now()}`,
      label: file.name,
      kind: "uploaded",
      stylePreset: "vhs-grain",
      url,
      mediaType: isImage ? "image" : "video",
      c1: "#111111",
      c2: "#e11d48",
    };
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, videos: [newClip, ...p.videos] };
      })
    );
  };

  const handleRemoveProjectVideo = (projectId: string, clipId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          videos: p.videos.filter((v) => v.id !== clipId),
        };
      })
    );
  };

  const handleDeleteProject = (projectId: string) => {
    if (googleConnected) {
      supabase.from("projects").delete().eq("id", projectId).then();
    }
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== projectId);
      if (next.length === 0) {
        setSelectedProjectId("");
        setInsideCubeOpen(false);
        setCurrentProject(STANDBY_PROJECT);
        setCurrentTrack(STANDBY_TRACK);
        setIsPlaying(false);
        sfx.stopGroove();
        return [];
      }
      if (selectedProjectId === projectId && next[0]) {
        setSelectedProjectId(next[0].id);
      }
      if (currentProject.id === projectId && next[0]) {
        setCurrentProject(next[0]);
        if (next[0].tracks[0]) setCurrentTrack(next[0].tracks[0]);
      }
      return next;
    });
    sfx.close();
  };

  const handleWipeAllProjects = () => {
    sfx.close();
    setProjects([]);
    setSelectedProjectId("");
    setInsideCubeOpen(false);
    setCurrentProject(STANDBY_PROJECT);
    setCurrentTrack(STANDBY_TRACK);
    setIsPlaying(false);
    sfx.stopGroove();
  };

  const handleRestoreDemoProjects = () => {
    sfx.open();
    setProjects(DEMO_PROJECTS);
    if (DEMO_PROJECTS[0]) {
      setSelectedProjectId(DEMO_PROJECTS[0].id);
      setCurrentProject(DEMO_PROJECTS[0]);
      if (DEMO_PROJECTS[0].tracks[0]) {
        setCurrentTrack(DEMO_PROJECTS[0].tracks[0]);
      }
    }
  };

  const handleDeleteTrack = (projectId: string, trackId: string) => {
    if (googleConnected) {
      supabase.from("tracks").delete().eq("id", trackId).then();
    }
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        if (p.tracks.length <= 1) return p;
        const nextTracks = p.tracks.filter((t) => t.id !== trackId);
        const updated = { ...p, tracks: nextTracks };
        if (currentProject.id === p.id) {
          setCurrentProject(updated);
          if (currentTrack.id === trackId && nextTracks[0]) {
            setCurrentTrack(nextTracks[0]);
          }
        }
        return updated;
      })
    );
    if (editingTrack?.id === trackId) setEditingTrack(null);
    sfx.close();
  };

  const handleDeleteTrackById = (trackId: string) => {
    const owner = projects.find((p) => p.tracks.some((t) => t.id === trackId));
    if (owner) {
      handleDeleteTrack(owner.id, trackId);
    }
  };

  const handleSaveEditedTrack = (updatedTrack: Track) => {
    setProjects((prev) =>
      prev.map((p) => {
        const hasTrack = p.tracks.some((t) => t.id === updatedTrack.id);
        if (!hasTrack) return p;
        const nextTracks = p.tracks.map((t) => (t.id === updatedTrack.id ? updatedTrack : t));
        const nextProj = { ...p, tracks: nextTracks };
        if (currentProject.id === p.id) setCurrentProject(nextProj);
        return nextProj;
      })
    );
    if (currentTrack.id === updatedTrack.id) {
      setCurrentTrack(updatedTrack);
      if (isPlaying) {
        sfx.startGroove(
          updatedTrack.bpm,
          updatedTrack.audioFreq,
          updatedTrack.customAudioUrl || customAudioMap[updatedTrack.id],
          updatedTrack.durationSec,
          false
        );
      }
    }
    setEditingTrack(null);
    sfx.drop();
  };

  const handleUploadProjectTrack = (projectId: string, file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    const newTrack: Track = {
      id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: cleanName,
      artist: meProfile.handle,
      bpm: 140,
      key: "F#m",
      duration: "2:34",
      durationSec: 154,
      version: 1,
      note: "Subido desde iPhone / Archivos",
      glyph: "01",
      c1: "#ffffff",
      c2: "#888888",
      accent: "#ffffff",
      audioFreq: 80,
      customAudioUrl: objectUrl,
    };
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const nextTracks = [...p.tracks, newTrack];
        const nextProj = { ...p, tracks: nextTracks };
        if (currentProject.id === p.id) setCurrentProject(nextProj);
        return nextProj;
      })
    );
    sfx.drop();
  };

  const handleSaveEditedProject = (updatedProject: Project) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
    );
    if (currentProject.id === updatedProject.id) {
      setCurrentProject(updatedProject);
    }
    setEditingProject(null);
    sfx.drop();
  };

  const navigate = (nextTab: ScreenTab) => {
    if (nextTab === tab) return;
    sfx.nav();
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const myProjects = projects.filter((p) => p.artistId === meProfile.id);
  const activeAttributes = activeProject
    ? activeProject.attributes || [activeProject.zone, activeProject.year]
    : [];
  const filteredProducerDrops =
    producerFilter === "Todos"
      ? producerDrops
      : producerDrops.filter((d) => d.kind === producerFilter);

  const findProjectById = (id: string) =>
    projects.find((p) => p.id === id) || DEMO_PROJECTS.find((p) => p.id === id);

  return (
    <div className="apple-shell">
      <div className="paper-grain" aria-hidden />

      {/* Top Navigation Bar */}
      <header className="ios-navbar">
        <button
          type="button"
          className="ios-brand-title"
          onMouseEnter={() => sfx.hover()}
          onClick={() => navigate("inicio")}
        >
          <span className="brand-dot" />
          <strong>El tablero</strong>
        </button>

        <nav className="ios-seg-control" aria-label="Navegación principal">
          {(
            [
              ["inicio", "Inicio"],
              ["subir", "Subir"],
              ["biblioteca", "Biblioteca"],
              ["perfil", meProfile.handle],
            ] as [ScreenTab, string][]
          ).map(([id, label]) => {
            const isActive =
              tab === id || (id === "biblioteca" && tab === "crear-proyecto");
            return (
              <button
                key={id}
                type="button"
                className={isActive ? "active" : ""}
                onMouseEnter={() => sfx.hover()}
                onClick={() => {
                  if (id === "biblioteca") setInsideCubeOpen(false);
                  navigate(id);
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="iosSegPill"
                    className="seg-pill-bg"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="seg-label">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="ios-nav-right">
          <button
            type="button"
            className="ios-icon-btn"
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.open();
              setAuthModalOpen(true);
            }}
          >
            {googleConnected ? meProfile.handle : "Iniciar con Google"}
          </button>
          <button
            type="button"
            className="ios-icon-btn"
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.open();
              setPlayerExpanded(true);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <line x1="4" y1="21" x2="4" y2="14"></line>
              <line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line>
              <line x1="20" y1="12" x2="20" y2="3"></line>
              <line x1="1" y1="14" x2="7" y2="14"></line>
              <line x1="9" y1="8" x2="15" y2="8"></line>
              <line x1="17" y1="16" x2="23" y2="16"></line>
            </svg>
            <span>Reproductor</span>
          </button>
          <button
            type="button"
            className="ios-icon-btn"
            onMouseEnter={() => sfx.hover()}
            onClick={handleToggleMute}
            aria-label={muted ? "Activar sonido" : "Silenciar"}
          >
            {muted ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            )}
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main
          key={tab}
          className="ios-main"
          initial={{ opacity: 0, y: 12, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(5px)" }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* ==================== 1. INICIO ==================== */}
          {tab === "inicio" && (
            <div className="explore-page">
              <section className="secondstory-strip-card">
                <div className="strip-top-meta">
                  <span>EL TABLERO // UG BOARD</span>
                </div>

                {/* 1º: EL RUIDO EN EL MEDIO DE LA PANTALLA (TIPOGRAFÍA LIMPIA Y UNIFICADA + TAPAS REALES) */}
                <div className="corecore-stage">
                  <div className="neon-spine" aria-hidden>
                    <span className="spine-badge">@quetablero</span>
                  </div>

                  <div className="Roster-collage">
                    {/* Fila 1: LA PLAGA (eyebags) — fuente unificada sin gothic-drop ni cortes */}
                    <div className="collage-line">
                      <span className="cluster-dots">
                        <i style={{ background: "#e11d48" }} />
                        <i style={{ background: "#0284c7" }} />
                        <i style={{ background: "#ca8a04" }} />
                      </span>
                      <span className="pixel-tag coral-badge">MIXTAPE // 01</span>
                      <button
                        type="button"
                        className="roster-word clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("proj-la-plaga");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        LA <span className="inline-swatch coral">PLAGA</span>
                        <sup className="sup-tag">mixtape · eyebags</sup>
                      </button>
                      <span className="cutout-pill">Mendoza</span>
                    </div>

                    {/* Fila 2: PERDÓN LA DEMORA (Tizianolased) — sin etiqueta chickenNugget */}
                    <div className="collage-line">
                      <img
                        src="/covers/perdon-la-demora.png"
                        alt="PERDÓN LA DEMORA"
                        className="collage-cover-thumb"
                      />
                      <button
                        type="button"
                        className="roster-word clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("proj-perdon-demora");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        PERDÓN <span className="inline-swatch cyan">LA DEMORA</span>
                        <sup className="sup-tag">mixtape · Tizianolased</sup>
                      </button>
                      <span className="cutout-pill dark">8 tracks · 23 min</span>
                    </div>

                    {/* Fila 3: chickenNugget (poyo · dorkke) + ESTO ES ESTAR EN SONIDO (V4lentin0) */}
                    <div className="collage-line">
                      <img
                        src="/covers/chickennugget.png"
                        alt="chickenNugget"
                        className="collage-cover-thumb"
                      />
                      <button
                        type="button"
                        className="roster-word clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("proj-chickennugget");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        chicken<span className="inline-swatch gold">Nugget</span>
                        <sup className="sup-tag">ep · poyo × dorkke</sup>
                      </button>
                      <img
                        src="/covers/esto-es-estar-en-sonido.png"
                        alt="ESTO ES ESTAR EN SONIDO"
                        className="collage-cover-thumb"
                      />
                      <button
                        type="button"
                        className="roster-word clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("proj-en-sonido");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        <span className="inline-swatch blue">ESTO ES ESTAR</span> EN SONIDO
                        <sup className="sup-tag">lp · V4lentin0</sup>
                      </button>
                    </div>

                    {/* Fila 4: #MA7IAS (Ma7imza) + Love2Hate (Icylucki) + AMORIO CLUB 2 (Máximo) */}
                    <div className="collage-line">
                      <img
                        src="/covers/ma7ias.png"
                        alt="#MA7IAS"
                        className="collage-cover-thumb"
                      />
                      <button
                        type="button"
                        className="roster-word clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("proj-ma7ias");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        <span className="inline-swatch lime">#MA7IAS</span>
                        <sup className="sup-tag">lp · Ma7imza</sup>
                      </button>
                      <img
                        src="/covers/love2hate.png"
                        alt="Love2Hate"
                        className="collage-cover-thumb"
                      />
                      <button
                        type="button"
                        className="roster-word clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("proj-love2hate");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        Love<span className="inline-swatch purple">2Hate</span>
                        <sup className="sup-tag">ep · Icylucki</sup>
                      </button>
                      <button
                        type="button"
                        className="roster-word clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("proj-amorio-club-2");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        <span className="inline-swatch red">AMORIO CLUB 2</span>
                        <sup className="sup-tag">ep · Máximo</sup>
                      </button>
                      <button
                        type="button"
                        className="collage-cta-pill"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          sfx.open();
                          setPlayerExpanded(true);
                        }}
                      >
                        Abrir Reproductor 3D →
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2º: NOMBRE DE LA WEB ("El tablero") */}
                <div className="secondstory-mega-footer">
                  <p className="micro-editorial-copy">
                    Tus proyectos. Tu identidad. Tu gente. Tu música.
                  </p>
                  <h1 className="mega-display-title">El tablero</h1>
                </div>

                {/* 3º: TIRA HORIZONTAL DE MINIPORTADAS (con tapas reales y sin scrollbar fantasma) */}
                <div className="filmstrip-row">
                  {(projects.length > 0 ? projects : DEMO_PROJECTS).map((p, idx) => (
                    <motion.button
                      key={p.id}
                      type="button"
                      whileHover={{ y: -3, scale: 1.01 }}
                      whileTap={{ scale: 0.985 }}
                      className="filmstrip-thumb"
                      onMouseEnter={() => sfx.hover()}
                      onClick={() => p.tracks[0] && playTrack(p.tracks[0], p, false)}
                    >
                      <div
                        className="filmstrip-art"
                        style={{
                          background: p.coverUrl
                            ? `linear-gradient(180deg, rgba(10,10,14,0.45) 0%, rgba(10,10,14,0.12) 45%, rgba(10,10,14,0.75) 100%), url(${p.coverUrl}) center / cover no-repeat`
                            : `linear-gradient(145deg, ${p.c1} 0%, ${p.c2} 100%)`,
                        }}
                      >
                        <span className="thumb-index">0{idx + 1}</span>
                        {!p.coverUrl && (
                          <strong className="thumb-glyph">{p.tracks[0]?.glyph}</strong>
                        )}
                        <small>{p.type} · {p.tracks.length} tracks</small>
                      </div>
                      <div className="filmstrip-caption">
                        <b>{p.title}</b>
                        <span>{p.artist}</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </section>

              {/* ==================== NOVEDADES DE PRODUCTORES: BEATPOST · SOUNDKIT · DRUMKIT · LOOPKIT · CATÁLOGO DE BEATS ==================== */}
              <section className="apple-card producer-drops-section">
                <div className="producer-drops-header">
                  <div>
                    <span className="mono-tag">
                      NOVEDADES DE PRODUCTORES // BEATPOST · SOUNDKIT · DRUMKIT · LOOPKIT · CATÁLOGO DE BEATS
                    </span>
                    <h3>Herramientas, Kits &amp; Beats de los Productores</h3>
                  </div>

                  <div className="producer-filter-pills">
                    {PRODUCER_DROP_KINDS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={producerFilter === k ? "on" : ""}
                        onClick={() => {
                          sfx.tap();
                          setProducerFilter(k);
                        }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="producer-drops-grid">
                  {filteredProducerDrops.length > 0 ? (
                    filteredProducerDrops.map((drop) => {
                      const isPlayingDrop =
                        currentTrack.id === drop.previewTrack.id && isPlaying;
                      const linkedProj =
                        projects.find((p) => p.id === drop.projectId) ||
                        STANDBY_PROJECT;
                      return (
                        <div
                          key={drop.id}
                          className={`producer-drop-card ${isPlayingDrop ? "is-playing" : ""}`}
                          onClick={() => playTrack(drop.previewTrack, linkedProj, false)}
                        >
                          <div className="producer-drop-top">
                            <span
                              className="producer-kind-badge"
                              style={{ background: drop.accent }}
                            >
                              {drop.kind}
                            </span>
                            <span className="mono-tag">{drop.itemsCountLabel}</span>
                            <button
                              type="button"
                              className="trash-icon-btn"
                              title="Eliminar publicación"
                              onClick={(e) => {
                                e.stopPropagation();
                                sfx.tap();
                                setProducerDrops((prev) =>
                                  prev.filter((item) => item.id !== drop.id)
                                );
                              }}
                            >
                              <TrashIcon />
                            </button>
                          </div>

                          <div className="producer-drop-main">
                            <div
                              className="producer-drop-swatch"
                              style={{
                                background: `linear-gradient(135deg, ${drop.c1}, ${drop.c2})`,
                              }}
                            >
                              <span>{isPlayingDrop ? "❚❚" : "▶"}</span>
                            </div>
                            <div>
                              <h4>{drop.title}</h4>
                              <span className="producer-byline">
                                por <b>{drop.producer}</b> ({drop.producerHandle})
                              </span>
                            </div>
                          </div>

                          <p className="producer-drop-desc">{drop.description}</p>

                          <div className="producer-drop-foot">
                            <span className="meta-chip">{drop.bpmLabel}</span>
                            <span className="meta-chip">{drop.keyLabel}</span>
                            <span className="producer-listen-cta">
                              {isPlayingDrop ? "Sonando demo..." : "▶ Escuchar preview"}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ gridColumn: "1 / -1", padding: "36px 20px", textAlign: "center", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 12 }}>
                      <span className="mono-tag" style={{ display: "inline-block", marginBottom: 6 }}>
                        0 NOVEDADES DE PRODUCTORES
                      </span>
                      <p style={{ color: "var(--ink-secondary)", fontSize: "0.85rem", margin: "4px 0 0" }}>
                        Los beatmakers registrados publicarán sus beatposts, drumkits y soundkits en esta sección.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* Grilla inferior de proyectos y artistas */}
              <section className="explore-bottom-grid">
                <div className="apple-card">
                  <div className="card-head">
                    <span className="mono-tag">PROYECTOS // ROTACIÓN DEL TABLERO</span>
                    <h3>Proyectos fijados</h3>
                  </div>
                  <div className="track-list-clean">
                    {projects.length > 0 ? (
                      projects
                        .flatMap((p) => p.tracks.slice(0, 2).map((t) => ({ track: t, proj: p })))
                        .slice(0, 7)
                        .map(({ track, proj }, i) => {
                          const active = currentTrack.id === track.id;
                          return (
                            <div
                              key={track.id}
                              className={`clean-track-row ${active ? "is-playing" : ""}`}
                              onMouseEnter={() => sfx.hover()}
                              onClick={() => playTrack(track, proj, false)}
                            >
                              <span className="row-num">{String(i + 1).padStart(2, "0")}</span>
                              <div
                                className="row-swatch"
                                style={{
                                  background: proj.coverUrl
                                    ? `linear-gradient(rgba(0,0,0,0.28), rgba(0,0,0,0.28)), url(${proj.coverUrl}) center / cover no-repeat`
                                    : `linear-gradient(135deg, ${track.c1}, ${track.c2})`,
                                }}
                              >
                                {active && isPlaying ? "❚❚" : "▶"}
                              </div>
                              <div className="row-main">
                                <b>{track.title}</b>
                                <span>
                                  {track.artist} {track.feat ? `feat. ${track.feat}` : ""} · {proj.title}
                                </span>
                              </div>
                              <div className="row-pills">
                                <span className="meta-chip">{track.bpm} BPM</span>
                                <span className="meta-chip">{track.key}</span>
                              </div>
                              <div className="row-inline-actions">
                                <button
                                  type="button"
                                  className="row-snippet-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTrack(track);
                                  }}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="trash-icon-btn"
                                  title={`Eliminar track ${track.title}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteTrack(proj.id, track.id);
                                  }}
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div style={{ padding: "40px 16px", textAlign: "center" }}>
                        <span className="mono-tag" style={{ display: "inline-block", marginBottom: 6 }}>
                          0 PROYECTOS EN ROTACIÓN
                        </span>
                        <p style={{ color: "var(--ink-secondary)", fontSize: "0.86rem", margin: "4px 0 14px" }}>
                          No hay proyectos publicados todavía. Creá uno en la biblioteca para que aparezca acá.
                        </p>
                        <button
                          type="button"
                          className="apple-btn primary"
                          onClick={() => navigate("crear-proyecto")}
                        >
                          + Crear Primer Proyecto
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="apple-card">
                  <div className="card-head">
                    <span className="mono-tag">ARTISTAS // ROTACIÓN DEL TABLERO</span>
                    <h3>Artistas en El Tablero</h3>
                  </div>
                  <div className="artist-directory-list">
                    {communityArtists.length > 0 ? (
                      communityArtists.map((a) => {
                        const artistTrackCount = projects
                          .filter((p) => p.artistId === a.id || p.artist.toLowerCase() === a.name.toLowerCase())
                          .reduce((acc, p) => acc + p.tracks.length, 0);
                        return (
                          <div
                            key={a.id}
                            className="artist-dir-item"
                            onMouseEnter={() => sfx.hover()}
                            onClick={() => {
                              const found = projects.find((p) => p.artistId === a.id || p.artist.toLowerCase() === a.name.toLowerCase());
                              if (found) {
                                setSelectedProjectId(found.id);
                                navigate("biblioteca");
                              }
                            }}
                          >
                            <div className="artist-dir-avatar" style={{ background: a.color }}>
                              {a.stickers[0] || a.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="artist-dir-info">
                              <b>
                                {a.name} <em>{a.handle}</em>
                              </b>
                              <span>
                                {a.role} · {a.zone}
                              </span>
                            </div>
                            <div className="artist-dir-stats">
                              <b>{artistTrackCount}</b>
                              <small>tracks</small>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: "40px 16px", textAlign: "center" }}>
                        <span className="mono-tag" style={{ display: "inline-block", marginBottom: 6 }}>
                          0 ARTISTAS REGISTRADOS
                        </span>
                        <p style={{ color: "var(--ink-secondary)", fontSize: "0.86rem", margin: "4px 0 14px" }}>
                          No hay cuentas creadas todavía. Conectate con Google para registrar tu perfil.
                        </p>
                        <button
                          type="button"
                          className="apple-btn primary"
                          onClick={() => setAuthModalOpen(true)}
                        >
                          Iniciar Sesión con Google
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ==================== 2. BIBLIOTECA ==================== */}
          {tab === "biblioteca" && (
            <div className="library-page">
              <div className="section-header-row">
                <div>
                  <span className="mono-tag">BIBLIOTECA 3D // EL TABLERO</span>
                  <h1 className="editorial-h1">Mis Proyectos</h1>
                </div>

                {/* Switch superior + botón de wipear/restaurar ejemplos */}
                <div className="row-actions">
                  {projects.length > 0 ? (
                    <button
                      type="button"
                      className="apple-btn ghost danger-trash-btn"
                      onClick={handleWipeAllProjects}
                      title="Dejar la biblioteca en 0 proyectos para arrancar en limpio"
                    >
                      Wipear ejemplos (0 proyectos)
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="apple-btn ghost"
                      onClick={handleRestoreDemoProjects}
                    >
                      Restaurar proyectos de la escena
                    </button>
                  )}

                  <div className="seg-pills">
                    <button
                      type="button"
                      className={libraryLayoutMode === "inside" ? "on" : ""}
                      onClick={() => {
                        sfx.tap();
                        setLibraryLayoutMode("inside");
                        setInsideCubeOpen(false);
                      }}
                    >
                      Por defecto
                    </button>
                    <button
                      type="button"
                      className={libraryLayoutMode === "side-by-side" ? "on" : ""}
                      onClick={() => {
                        sfx.tap();
                        setLibraryLayoutMode("side-by-side");
                      }}
                    >
                      ◫ Lado a Lado
                    </button>
                  </div>
                </div>
              </div>

              <div
                className={
                  libraryLayoutMode === "side-by-side" && activeProject
                    ? "library-side-by-side-grid"
                    : "library-inside-stack"
                }
              >
                {/* Escena 3D de Mis Proyectos (se muestra siempre en Lado a Lado, o cuando estás afuera del cubo en modo Por defecto) */}
                {(libraryLayoutMode === "side-by-side" || !insideCubeOpen || !activeProject) && (
                  <ManifoldLibrary3D
                    projects={projects}
                    selectedProjectId={activeProject?.id || ""}
                    viewMode={libraryViewMode}
                    onChangeViewMode={(m) => setLibraryViewMode(m)}
                    onSelectProject={(proj) => setSelectedProjectId(proj.id)}
                    onDiveIntoProject={
                      libraryLayoutMode === "inside"
                        ? (proj) => {
                            setSelectedProjectId(proj.id);
                            setInsideCubeOpen(true);
                          }
                        : undefined
                    }
                    onOpenCreateProject={() => navigate("crear-proyecto")}
                    onDeleteProject={handleDeleteProject}
                    onUploadProjectVideo={handleUploadProjectVideo}
                    onRemoveProjectVideo={handleRemoveProjectVideo}
                    onUploadProjectTrack={handleUploadProjectTrack}
                  />
                )}

                {/* Interior del Proyecto / Inspector con Spinner 3D (se muestra al entrar al cubo en Modo Por defecto, o al lado en Modo 2) */}
                {activeProject && (libraryLayoutMode === "side-by-side" || insideCubeOpen) && (
                  <motion.section
                    key={`inspector-${libraryLayoutMode}-${activeProject.id}`}
                    className="project-inspector-sheet"
                    initial={
                      libraryLayoutMode === "inside"
                        ? { opacity: 0, scale: 0.94, filter: "blur(8px)" }
                        : { opacity: 1, scale: 1 }
                    }
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {libraryLayoutMode === "inside" && (
                      <div className="cube-interior-back-bar">
                        <button
                          type="button"
                          className="apple-btn primary"
                          onClick={() => {
                            sfx.close();
                            setInsideCubeOpen(false);
                          }}
                        >
                          ← Volver a Mis proyectos
                        </button>

                        <div className="manifold-quick-pills">
                          {projects.map((p) => {
                            const active = p.id === activeProject.id;
                            return (
                              <div
                                key={p.id}
                                className={`quick-proj-pill-group ${active ? "on" : ""}`}
                              >
                                <button
                                  type="button"
                                  className={`quick-proj-pill ${active ? "on" : ""}`}
                                  onClick={() => {
                                    sfx.tap();
                                    setSelectedProjectId(p.id);
                                  }}
                                >
                                  <span
                                    className="pill-dot"
                                    style={{ background: p.c2 }}
                                  />
                                  <b>{p.title}</b>
                                  <small>{p.tracks.length}d</small>
                                </button>
                                <button
                                  type="button"
                                  className="pill-trash-btn"
                                  title={`Eliminar proyecto ${p.title}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteProject(p.id);
                                  }}
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            className="quick-proj-pill add-project-plus-pill"
                            onClick={() => {
                              sfx.open();
                              navigate("crear-proyecto");
                            }}
                            title="Crear un nuevo proyecto"
                          >
                            <b>+</b>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="inspector-header">
                      <div className="inspector-meta-builder">
                        {/* Metadata del proyecto: Tipo de Proyecto, tracks y Atributos */}
                        <div className="project-editable-meta-bar">
                          <label className="meta-pill-select">
                            <span>TIPO</span>
                            <select
                              value={activeProject.type}
                              onChange={(e) => {
                                sfx.tick();
                                updateProjectMeta(activeProject.id, {
                                  type: e.target.value as ProjectType,
                                });
                              }}
                            >
                              {PROJECT_TYPES.map((pt) => (
                                <option key={pt} value={pt}>
                                  {pt}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="meta-pill-static">
                            <b>{activeProject.tracks.length} tracks</b>
                          </div>

                          {activeAttributes.map((attr) => (
                            <span key={attr} className="meta-user-attr-pill">
                              {attr}
                              <button
                                type="button"
                                onClick={() => handleRemoveAttribute(activeProject.id, attr)}
                                title="Quitar atributo"
                              >
                                ✕
                              </button>
                            </span>
                          ))}

                          <form
                            className="meta-add-attr-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleAddAttribute(activeProject.id, newAttrInput);
                            }}
                          >
                            <input
                              value={newAttrInput}
                              onChange={(e) => setNewAttrInput(e.target.value)}
                              placeholder="+ Atributo (ej. Trap, 2026...)"
                            />
                            {newAttrInput.trim() && (
                              <button type="submit" className="meta-attr-submit">
                                +
                              </button>
                            )}
                          </form>
                        </div>

                        <h2>
                          {activeProject.title} — <em>{activeProject.artist}</em>
                        </h2>
                        <p>{activeProject.description}</p>
                      </div>

                      <div className="row-actions">
                        <button
                          type="button"
                          className="apple-btn ghost"
                          onClick={() => {
                            sfx.open();
                            setEditingProject(activeProject);
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="apple-btn ghost"
                          onClick={() => navigate("subir")}
                        >
                          + Agregar canciones
                        </button>
                        <button
                          type="button"
                          className="apple-btn primary"
                          onClick={() =>
                            activeProject.tracks[0] &&
                            playTrack(activeProject.tracks[0], activeProject, true)
                          }
                        >
                          ▶ Abrir en reproductor
                        </button>
                        <button
                          type="button"
                          className="apple-btn ghost danger-trash-btn"
                          title={`Eliminar proyecto ${activeProject.title}`}
                          onClick={() => handleDeleteProject(activeProject.id)}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <TrashIcon /> Eliminar proyecto
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* ==================== CANVAS VISUAL DEL PROYECTO ==================== */}
                    <div className="inspector-canvas-section">
                      <div className="inspector-canvas-header">
                        <div>
                          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>Canvas</h3>
                        </div>
                        <div className="row-actions">
                          <label className="apple-btn ghost" style={{ cursor: "pointer" }}>
                            <span>{activeProject.videos.length > 0 ? "Cambiar Canvas" : "+ Subir Video / GIF al Canvas"}</span>
                            <input
                              type="file"
                              accept="video/mp4,video/webm,image/gif,image/*,video/*"
                              hidden
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadProjectVideo(activeProject.id, file);
                              }}
                            />
                          </label>
                          {activeProject.videos.length > 0 && (
                            <button
                              type="button"
                              className="apple-btn ghost danger-trash-btn"
                              title="Quitar video del Canvas"
                              onClick={() => handleRemoveProjectVideo(activeProject.id, activeProject.videos[0].id)}
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="inspector-canvas-viewer-card">
                        {activeProject.videos.length > 0 && activeProject.videos[0].url ? (
                          <div className="canvas-video-wrapper">
                            {activeProject.videos[0].mediaType === "image" || /\.(gif|png|jpe?g|webp|avif)$/i.test(activeProject.videos[0].label) ? (
                              <img
                                src={activeProject.videos[0].url}
                                alt={activeProject.videos[0].label}
                                className="canvas-active-video-elem"
                              />
                            ) : (
                              <video
                                src={activeProject.videos[0].url}
                                autoPlay
                                loop
                                muted
                                playsInline
                                disablePictureInPicture
                                controlsList="nodownload noplaybackrate nofullscreen"
                                className="canvas-active-video-elem"
                              />
                            )}
                          </div>
                        ) : (
                          <div className="canvas-empty-state">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
                            <div style={{ textAlign: "center" }}>
                              <b style={{ display: "block", marginBottom: 3, fontSize: "0.95rem" }}>Sin video de Canvas subido</b>
                              <small style={{ color: "var(--ink-secondary)", fontSize: "0.78rem" }}>
                                Subí un loop corto de 3 a 5 segundos (MP4, WebM o GIF) para que se vea en grande con la música.
                              </small>
                            </div>
                            <label className="apple-btn primary" style={{ cursor: "pointer", marginTop: 4 }}>
                              <span>+ Subir video 3–5s / GIF al Canvas</span>
                              <input
                                type="file"
                                accept="video/mp4,video/webm,image/gif,image/*,video/*"
                                hidden
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadProjectVideo(activeProject.id, file);
                                }}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="inspector-split">
                      <DiscSpinner3D
                        project={activeProject}
                        currentTrackId={currentTrack.id}
                        onPlayTrack={(tr, pr) => playTrack(tr, pr, false)}
                        onDeleteTrack={handleDeleteTrack}
                      />

                      <div className="inspector-tracklist">
                        <div className="card-head">
                          <span className="mono-tag">
                            {activeProject.tracks.length} CANCIONES EN ESTE PROYECTO
                          </span>
                          <h3>Tracks del proyecto (editar · cambiar tapa · eliminar)</h3>
                        </div>
                        {activeProject.tracks.map((t, idx) => {
                          const isCurrent = currentTrack.id === t.id;
                          return (
                            <div
                              key={t.id}
                              className={`clean-track-row ${isCurrent ? "is-playing" : ""}`}
                              onMouseEnter={() => sfx.hover()}
                              onClick={() => playTrack(t, activeProject, false)}
                            >
                              <label
                                className="track-row-art-wrap"
                                title="Cambiar tapa de la canción"
                                style={{ cursor: "pointer" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t.coverUrl || activeProject.coverUrl ? (
                                  <img
                                    src={t.coverUrl || activeProject.coverUrl}
                                    alt={t.title}
                                    className="track-row-img-thumb"
                                  />
                                ) : (
                                  <span className="track-row-art-fallback">{String(idx + 1).padStart(2, "0")}</span>
                                )}
                                <input
                                  type="file"
                                  accept="image/*,.png,.jpg,.jpeg,.webp,.gif"
                                  hidden
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const coverUrl = URL.createObjectURL(file);
                                      handleSaveEditedTrack({ ...t, coverUrl });
                                    }
                                  }}
                                />
                              </label>
                              <div className="row-main">
                                <b>{t.title}</b>
                                <span>
                                  {t.artist} {t.feat ? `feat. ${t.feat}` : ""} {t.prod ? `· prod. ${t.prod}` : ""}
                                </span>
                              </div>
                              <div className="row-pills">
                                <span className="meta-chip">{t.bpm} BPM</span>
                                <span className="meta-chip">{t.key}</span>
                                <span className="meta-chip">v{t.version}</span>
                              </div>
                              <div className="row-inline-actions">
                                <button
                                  type="button"
                                  className="row-snippet-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTrack(t);
                                  }}
                                >
                                  Editar
                                </button>
                                {activeProject.tracks.length > 1 && (
                                  <button
                                    type="button"
                                    className="trash-icon-btn"
                                    title={`Eliminar track ${t.title}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteTrack(activeProject.id, t.id);
                                    }}
                                  >
                                    <TrashIcon />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.section>
                )}
              </div>
            </div>
          )}

          {/* ==================== 3. SUBIR ==================== */}
          {tab === "subir" && (
            <MacInstallerUpload
              meProfile={meProfile}
              projects={projects}
              onAddTrackToProject={handleAddTrackToProject}
              onPlayTrack={(tr, pr) => playTrack(tr, pr, false)}
              onOpenCreateProject={() => navigate("crear-proyecto")}
            />
          )}

          {/* ==================== 3B. CREAR PROYECTO (PARTÍCULAS SENTIENTES + LOGO 3D "El tablero") ==================== */}
          {tab === "crear-proyecto" && (
            <CreateProjectScreen
              meProfile={meProfile}
              existingCount={projects.length}
              onCancel={() => navigate("biblioteca")}
              onCreateProject={async (newProj) => {
                setProjects((prev) => [newProj, ...prev]);
                setSelectedProjectId(newProj.id);
                setInsideCubeOpen(false);
                navigate("biblioteca");
                if (googleConnected && meProfile.id) {
                  try {
                    await supabase.from("projects").upsert({
                      id: newProj.id,
                      user_id: meProfile.id,
                      title: newProj.title,
                      artist: newProj.artist,
                      type: newProj.type,
                      year: newProj.year,
                      status: newProj.status,
                      zone: newProj.zone,
                      description: newProj.description,
                      cover_url: newProj.coverUrl || null,
                      order_index: 0,
                    });
                    for (let i = 0; i < newProj.tracks.length; i++) {
                      const tr = newProj.tracks[i];
                      await supabase.from("tracks").upsert({
                        id: tr.id,
                        project_id: newProj.id,
                        title: tr.title,
                        artist: tr.artist,
                        feat: tr.feat || null,
                        prod: tr.prod || null,
                        bpm: tr.bpm,
                        musical_key: tr.key,
                        duration: tr.duration,
                        duration_sec: tr.durationSec,
                        version: tr.version,
                        glyph: tr.glyph,
                        order_index: i,
                      });
                    }
                  } catch (e) {
                    console.warn("Supabase project sync error:", e);
                  }
                }
              }}
            />
          )}

          {/* ==================== 4. PERFIL ==================== */}
          {tab === "perfil" && (
            <div className="profile-page">
              <section className="profile-hero-card">
                <div className="profile-hero-top">
                  <div
                    className="profile-avatar-large"
                    style={{ background: meProfile.color }}
                  >
                    <span>{meProfile.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="profile-main-copy">
                    <div className="profile-badges">
                      <span className="mono-tag">{meProfile.crew}</span>
                      <span className="mono-tag">{meProfile.zone}</span>
                      {googleConnected && (
                        <span className="mono-tag google-verified">
                          Google: {meProfile.email}
                        </span>
                      )}
                    </div>
                    <h1>
                      {meProfile.name} <em>{meProfile.handle}</em>
                    </h1>
                    <p>{meProfile.bio}</p>
                    <div className="profile-sticker-tray">
                      {meProfile.stickers.map((st, i) => (
                        <span key={i} className="sticker-chip">
                          {st}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="profile-cta-col">
                    <button
                      type="button"
                      className="apple-btn primary"
                      onClick={() => {
                        sfx.open();
                        setEditProfileOpen(true);
                      }}
                    >
                      Editar Perfil &amp; Identidad
                    </button>
                    <button
                      type="button"
                      className="apple-btn ghost"
                      onClick={() => {
                        sfx.open();
                        setAuthModalOpen(true);
                      }}
                    >
                      Cuenta / Google Sign-In
                    </button>
                  </div>
                </div>

                <div className="profile-metrics-bar">
                  <div>
                    <b>{meProfile.tracksCount}</b>
                    <span>TRACKS SUBIDOS</span>
                  </div>
                  <div>
                    <b>{projects.length}</b>
                    <span>PROYECTOS EN 3D</span>
                  </div>
                  <div>
                    <b>{meProfile.friendsCount}</b>
                    <span>AMIGOS EN LA ESCENA</span>
                  </div>
                  <div>
                    <b>{meProfile.followersCount}</b>
                    <span>OYENTES / FOLLOWERS</span>
                  </div>
                  <div>
                    <b>{meProfile.playsTotal}</b>
                    <span>REPRODUCCIONES</span>
                  </div>
                </div>
              </section>

              {/* IMPORTADOR DIRECTO DESDE [untitled] EN LA PÁGINA DEL PERFIL */}
              <UntitledImporter
                meProfile={meProfile}
                existingCount={projects.length}
                onImportProject={(newProj) => {
                  setProjects((prev) => [newProj, ...prev]);
                  setSelectedProjectId(newProj.id);
                  setInsideCubeOpen(false);
                  navigate("biblioteca");
                }}
              />

              <section className="profile-manifold-showcase">
                <div className="section-header-row">
                  <div>
                    <span className="mono-tag">
                      IDENTIDAD VISUAL // BIBLIOTECA 3D DE {meProfile.handle.toUpperCase()}
                    </span>
                    <h2 className="editorial-h2">
                      Mis Proyectos &amp; Canvas
                    </h2>
                  </div>
                  <div className="row-actions">
                    {projects.length > 0 ? (
                      <button
                        type="button"
                        className="apple-btn ghost danger-trash-btn"
                        onClick={handleWipeAllProjects}
                      >
                        Wipear ejemplos (0 proyectos)
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="apple-btn ghost"
                        onClick={handleRestoreDemoProjects}
                      >
                        Restaurar ejemplos
                      </button>
                    )}
                    <button
                      type="button"
                      className="apple-btn primary"
                      onClick={() => navigate("crear-proyecto")}
                    >
                      + Crear Proyecto
                    </button>
                    <button
                      type="button"
                      className="apple-btn ghost"
                      onClick={() => navigate("subir")}
                    >
                      + Subir con Prop
                    </button>
                  </div>
                </div>

                <ManifoldLibrary3D
                  projects={myProjects.length > 0 ? myProjects : projects}
                  selectedProjectId={selectedProjectId}
                  viewMode={libraryViewMode}
                  onChangeViewMode={(m) => setLibraryViewMode(m)}
                  onSelectProject={(proj) => setSelectedProjectId(proj.id)}
                  onOpenCreateProject={() => navigate("crear-proyecto")}
                  onDeleteProject={handleDeleteProject}
                  onUploadProjectVideo={handleUploadProjectVideo}
                  onUploadProjectTrack={handleUploadProjectTrack}
                />
              </section>
            </div>
          )}
        </motion.main>
      </AnimatePresence>

      {/* ==================== DYNAMIC ISLAND REPRODUCTOR (CONTROLES 100% CENTRADOS + SOLO TRACK/ARTISTA + SLIDER DE VOLUMEN) ==================== */}
      <AnimatePresence>
        {!playerExpanded && (
          <div className="ios-mini-player-dock">
            <motion.div
              className="ios-mini-player"
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              {/* Columna Izquierda: Portada + Nombre del Track y Artista (sin BPM ni Key) */}
              <div
                className="mini-left"
                onClick={() => {
                  sfx.open();
                  setPlayerExpanded(true);
                }}
              >
                <div
                  className="mini-art"
                  style={{
                    background: `linear-gradient(135deg, ${currentTrack.c1}, ${currentTrack.c2})`,
                  }}
                >
                  {currentProject?.coverUrl ? (
                    <img
                      src={currentProject.coverUrl}
                      alt={currentTrack.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                    />
                  ) : (
                    <span className={isPlaying ? "spin-slow" : ""}>{currentTrack.glyph}</span>
                  )}
                </div>

                <div className="mini-meta">
                  <b>{currentTrack.title}</b>
                  <span>{currentTrack.artist}</span>
                </div>
              </div>

              {/* Columna Central: Controles Play / Skip perfectamente centrados en el eje del Dynamic Island */}
              <div className="mini-controls">
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => stepTrack(-1)}
                  aria-label="Anterior"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="19 20 9 12 19 4 19 20"></polygon>
                    <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="3" strokeLinecap="round"></line>
                  </svg>
                </button>
                <button
                  type="button"
                  className="mini-play-btn"
                  onClick={togglePlay}
                  aria-label="Reproducir o pausar"
                >
                  {isPlaying ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1.5"></rect>
                      <rect x="14" y="4" width="4" height="16" rx="1.5"></rect>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                      <polygon points="6 4 20 12 6 20 6 4"></polygon>
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => stepTrack(1)}
                  aria-label="Siguiente"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 4 15 12 5 20 5 4"></polygon>
                    <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="3" strokeLinecap="round"></line>
                  </svg>
                </button>
              </div>

              {/* Columna Derecha: Slider de Volumen en lugar del botón Abrir Reproductor */}
              <div className="mini-volume-wrap">
                <button
                  type="button"
                  className="mini-vol-btn"
                  onClick={handleToggleMute}
                  aria-label={muted ? "Activar sonido" : "Silenciar"}
                >
                  {muted || volume === 0 ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <line x1="23" y1="9" x2="17" y2="15"></line>
                      <line x1="17" y1="9" x2="23" y2="15"></line>
                    </svg>
                  ) : volume < 0.5 ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="apple-volume-slider"
                  aria-label="Volumen"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== PANTALLA REPRODUCTOR 3D COMPLETA ==================== */}
      <AnimatePresence>
        {playerExpanded && (
          <motion.div
            className="perf-modal-layer"
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
          >
            <PerformativePlayer
              track={currentTrack}
              project={currentProject}
              allProjects={projects}
              isPlaying={isPlaying}
              volume={volume}
              muted={muted}
              shuffle={shuffle}
              repeatMode={repeatMode}
              likedTrackIds={likedTrackIds}
              userQueue={userQueue}
              onTogglePlay={togglePlay}
              onNext={() => stepTrack(1)}
              onPrev={() => stepTrack(-1)}
              onSelectTrack={(t, p) => playTrack(t, p, true)}
              onToggleShuffle={() => setShuffle((s) => !s)}
              onCycleRepeat={() =>
                setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"))
              }
              onToggleLike={(id) =>
                setLikedTrackIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
              onAddToQueue={(t, p) => setUserQueue((prev) => [...prev, { track: t, project: p }])}
              onRemoveFromQueue={(idx) =>
                setUserQueue((prev) => prev.filter((_, i) => i !== idx))
              }
              onClearQueue={() => setUserQueue([])}
              onVolumeChange={handleVolumeChange}
              onToggleMute={handleToggleMute}
              onClose={() => setPlayerExpanded(false)}
              onJumpToProject={(projId) => {
                setPlayerExpanded(false);
                setSelectedProjectId(projId);
                setTab("biblioteca");
              }}
              onOpenEditTrack={() => setEditingTrack(currentTrack)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== PANTALLA / MODAL "EDITAR TRACK" ==================== */}
      <AnimatePresence>
        {editingTrack && (
          <EditTrackModal
            track={editingTrack}
            onClose={() => setEditingTrack(null)}
            onSave={handleSaveEditedTrack}
            onDelete={() => handleDeleteTrackById(editingTrack.id)}
          />
        )}
      </AnimatePresence>

      {/* ==================== MODAL "EDITAR PROYECTO & VINILO" ==================== */}
      <AnimatePresence>
        {editingProject && (
          <EditProjectModal
            project={editingProject}
            onClose={() => setEditingProject(null)}
            onSave={handleSaveEditedProject}
            onDelete={() => {
              handleDeleteProject(editingProject.id);
              setEditingProject(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* ==================== MODAL "EDITAR PERFIL" ==================== */}
      <AnimatePresence>
        {editProfileOpen && (
          <EditProfileModal
            profile={meProfile}
            onClose={() => setEditProfileOpen(false)}
            onSave={(updated) => {
              setMeProfile(updated);
              setEditProfileOpen(false);
              sfx.drop();
            }}
          />
        )}
      </AnimatePresence>

      {/* ==================== MODAL CUENTAS / LOGIN & REGISTER CON GOOGLE ==================== */}
      <AnimatePresence>
        {authModalOpen && (
          <GoogleAuthModal
            profile={meProfile}
            connected={googleConnected}
            onClose={() => setAuthModalOpen(false)}
            onSignInGoogle={(email, name, handle) => {
              setGoogleConnected(true);
              setMeProfile((prev) => ({
                ...prev,
                email,
                name: name || prev.name,
                handle: handle.startsWith("@") ? handle : `@${handle}`,
              }));
              setAuthModalOpen(false);
              sfx.drop();
            }}
            onSignOut={() => {
              setGoogleConnected(false);
              setAuthModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ==================== COMPONENTE: PANTALLA EDITAR TRACK ==================== */
function EditTrackModal({
  track,
  onClose,
  onSave,
  onDelete,
}: {
  track: Track;
  onClose: () => void;
  onSave: (t: Track) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [feat, setFeat] = useState(track.feat || "");
  const [prod, setProd] = useState(track.prod || "");
  const [bpm, setBpm] = useState(track.bpm);
  const [musicalKey, setMusicalKey] = useState(track.key);
  const [version, setVersion] = useState(track.version);
  const [note, setNote] = useState(track.note || "");
  const [c2, setC2] = useState(track.c2);
  const [customAudioUrl, setCustomAudioUrl] = useState<string | undefined>(track.customAudioUrl);
  const [coverUrl, setCoverUrl] = useState<string | undefined>(track.coverUrl);

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">STUDIO INSPECTOR // EDITAR TRACK</span>
            <h3>Editar metadata y versión del track</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="modal-form-grid">
          <label className="modal-field">
            <span>TÍTULO DEL TRACK</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>ARTISTA PRINCIPAL</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>FEATURING (OPCIONAL)</span>
            <input value={feat} onChange={(e) => setFeat(e.target.value)} placeholder="ej. eyebags" />
          </label>
          <label className="modal-field">
            <span>PRODUCTOR / MIX</span>
            <input value={prod} onChange={(e) => setProd(e.target.value)} placeholder="ej. Ma7imza" />
          </label>
          <label className="modal-field">
            <span>BPM</span>
            <input type="number" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
          <label className="modal-field">
            <span>KEY (TONALIDAD)</span>
            <input value={musicalKey} onChange={(e) => setMusicalKey(e.target.value)} placeholder="ej. F#m" />
          </label>
          <label className="modal-field">
            <span>NÚMERO DE VERSIÓN</span>
            <input type="number" value={version} onChange={(e) => setVersion(Number(e.target.value))} />
          </label>
          <label className="modal-field">
            <span>COLOR DEL DISCO / SELLO</span>
            <div className="color-dots">
              {["#e11d48", "#0284c7", "#ca8a04", "#65a30d", "#7e22ce", "#14b8a6"].map((col) => (
                <button
                  key={col}
                  type="button"
                  style={{ background: col }}
                  className={c2 === col ? "on" : ""}
                  onClick={() => setC2(col)}
                />
              ))}
            </div>
          </label>

          <label className="modal-field full">
            <span>PORTADA / IMAGEN INDIVIDUAL DEL TRACK</span>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 6 }}>
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={title}
                  style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)" }}
                />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 8, background: "#1c1d24", display: "grid", placeItems: "center" }}>
                  <DiscIcon size={24} />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  accept="image/*,.png,.jpg,.jpeg,.webp,.gif"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setCoverUrl(URL.createObjectURL(f));
                  }}
                />
                <small style={{ display: "block", color: "rgba(255,255,255,0.5)", marginTop: 4, fontSize: 11 }}>
                  Esta imagen se muestra en su disco del spinner 3D y en el reproductor.
                </small>
              </div>
            </div>
          </label>

          <label className="modal-field full">
            <span>NOTAS DE SESIÓN / CAMBIOS DE MEZCLA</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ej. sub más seco, falta automatizar delay del outro..."
            />
          </label>
          <label className="modal-field full">
            <span>REEMPLAZAR ARCHIVO DE AUDIO (WAV / MP3)</span>
            <input
              type="file"
              accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/flac,application/octet-stream"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setCustomAudioUrl(URL.createObjectURL(f));
              }}
            />
          </label>
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="apple-btn ghost danger-trash-btn"
            onClick={onDelete}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <TrashIcon /> Eliminar track
            </span>
          </button>
          <div className="row-actions">
            <button type="button" className="apple-btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="apple-btn primary"
              onClick={() =>
                onSave({
                  ...track,
                  title,
                  artist,
                  feat: feat.trim() || undefined,
                  prod: prod.trim() || undefined,
                  bpm: Number(bpm) || track.bpm,
                  key: musicalKey || track.key,
                  version: Number(version) || track.version,
                  note: note.trim() || undefined,
                  c2,
                  accent: c2,
                  customAudioUrl,
                  coverUrl,
                })
              }
            >
              Guardar cambios en el track
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ==================== COMPONENTE: MODAL EDITAR PROYECTO & VINILO ==================== */
function EditProjectModal({
  project,
  onClose,
  onSave,
  onDelete,
}: {
  project: Project;
  onClose: () => void;
  onSave: (p: Project) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [artist, setArtist] = useState(project.artist);
  const [type, setType] = useState<ProjectType>(project.type);
  const [year, setYear] = useState(project.year);
  const [status, setStatus] = useState(project.status);
  const [description, setDescription] = useState(project.description || "");
  const [coverUrl, setCoverUrl] = useState<string | undefined>(project.coverUrl);
  const [zone, setZone] = useState(project.zone || "Mendoza");

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">PROYECTO // METADATA &amp; VINILO</span>
            <h3>Editar datos y portada del vinilo</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="modal-form-grid">
          <label className="modal-field">
            <span>NOMBRE DEL PROYECTO</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="modal-field">
            <span>ARTISTA O CREW</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} required />
          </label>
          <label className="modal-field">
            <span>TIPO DE PROYECTO</span>
            <select
              className="apple-select"
              value={type}
              onChange={(e) => setType(e.target.value as ProjectType)}
            >
              {PROJECT_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {pt}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-field">
            <span>ESTADO</span>
            <select
              className="apple-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as Project["status"])}
            >
              <option value="Publicado">Publicado</option>
              <option value="En mezcla">En mezcla</option>
              <option value="Master">Master</option>
              <option value="WIP">WIP</option>
              <option value="Privado">Privado</option>
            </select>
          </label>
          <label className="modal-field">
            <span>AÑO / EDICIÓN</span>
            <input value={year} onChange={(e) => setYear(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>ZONA</span>
            <input value={zone} onChange={(e) => setZone(e.target.value)} />
          </label>

          <label className="modal-field full">
            <span>TAPA / PORTADA DEL VINILO (IMAGEN)</span>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 6 }}>
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={title}
                  style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)" }}
                />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 8, background: "#1c1d24", display: "grid", placeItems: "center" }}>
                  <DiscIcon size={28} />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  accept="image/*,.png,.jpg,.jpeg,.webp,.gif"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setCoverUrl(URL.createObjectURL(f));
                  }}
                />
                <small style={{ display: "block", color: "rgba(255,255,255,0.5)", marginTop: 4, fontSize: 11 }}>
                  Esta imagen viste el sobre del vinilo 3D, el sello central del disco y los tracks.
                </small>
              </div>
            </div>
          </label>

          <label className="modal-field full">
            <span>DESCRIPCIÓN / LINER NOTES</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Notas del proyecto, concepto o créditos..."
            />
          </label>
        </div>

        <div className="modal-foot">
          <button type="button" className="apple-btn ghost danger-trash-btn" onClick={onDelete}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <TrashIcon /> Eliminar proyecto
            </span>
          </button>
          <div className="row-actions">
            <button type="button" className="apple-btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="apple-btn primary"
              onClick={() => {
                onSave({
                  ...project,
                  title: title.trim() || project.title,
                  artist: artist.trim() || project.artist,
                  type,
                  year,
                  status,
                  zone,
                  description,
                  coverUrl,
                });
              }}
            >
              Guardar Cambios
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ==================== COMPONENTE: MODAL EDITAR PERFIL ==================== */
function EditProfileModal({
  profile,
  onClose,
  onSave,
}: {
  profile: ArtistProfile;
  onClose: () => void;
  onSave: (p: ArtistProfile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [role, setRole] = useState(profile.role);
  const [zone, setZone] = useState(profile.zone);
  const [crew, setCrew] = useState(profile.crew);
  const [bio, setBio] = useState(profile.bio);
  const [color, setColor] = useState(profile.color);
  const [stickersText, setStickersText] = useState(profile.stickers.join(" "));

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">PERFIL // EL TABLERO</span>
            <h3>Editar identidad del artista</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="modal-form-grid">
          <label className="modal-field">
            <span>NOMBRE ARTÍSTICO</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>USUARIO (@HANDLE)</span>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>ROL EN LA ESCENA</span>
            <input value={role} onChange={(e) => setRole(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>ZONA / DEPARTAMENTO</span>
            <input value={zone} onChange={(e) => setZone(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>CREW / SELLO</span>
            <input value={crew} onChange={(e) => setCrew(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>COLOR DE AVATAR</span>
            <div className="color-dots">
              {["#111111", "#e11d48", "#1d4ed8", "#0f766e", "#ca8a04", "#7e22ce"].map((c) => (
                <button
                  key={c}
                  type="button"
                  style={{ background: c }}
                  className={color === c ? "on" : ""}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </label>
          <label className="modal-field full">
            <span>BIO / MANIFIESTO</span>
            <input value={bio} onChange={(e) => setBio(e.target.value)} />
          </label>
          <label className="modal-field full">
            <span>STICKERS / INSIGNIAS (SEPARADOS POR ESPACIO)</span>
            <input value={stickersText} onChange={(e) => setStickersText(e.target.value)} />
          </label>
        </div>

        <div className="modal-foot">
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="apple-btn primary"
            onClick={() =>
              onSave({
                ...profile,
                name,
                handle: handle.startsWith("@") ? handle : `@${handle}`,
                role,
                zone,
                crew,
                bio,
                color,
                stickers: stickersText
                  .split(/\s+/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          >
            Guardar Perfil
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ==================== COMPONENTE: MODAL LOGIN / REGISTER CON GOOGLE ==================== */
function GoogleAuthModal({
  profile,
  connected,
  onClose,
  onSignInGoogle,
  onSignOut,
}: {
  profile: ArtistProfile;
  connected: boolean;
  onClose: () => void;
  onSignInGoogle: (email: string, name: string, handle: string) => void;
  onSignOut: () => void;
}) {
  const [email, setEmail] = useState(profile.email || "juani@gmail.com");
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleOAuthGoogle = async () => {
    setLoading(true);
    setMsg("Conectando con Google...");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (error) {
        setMsg("Ingresando con perfil...");
        onSignInGoogle(email, name, handle);
      }
    } catch {
      onSignInGoogle(email, name, handle);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card narrow"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">AUTENTICACIÓN // EL TABLERO ID</span>
            <h3>Iniciar sesión o registrarse con Google</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 6, fontSize: "0.72rem", color: "#4ade80", marginBottom: 12 }}>
          <span className="live-pulse-dot" />
          <span>SUPABASE CLOUD CONECTADO // txhrbfgejcwmmurriccw</span>
        </div>

        <p className="modal-subcopy">
          Con tu cuenta de Google o tu email sincronizás tus proyectos en la base de datos PostgreSQL de Supabase y subís audios y tapas a la nube.
        </p>

        {msg && (
          <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.06)", borderRadius: 8, fontSize: "0.8rem", marginBottom: 12, border: "1px solid rgba(255,255,255,0.15)" }}>
            {msg}
          </div>
        )}

        <div className="modal-form-grid single-col">
          <label className="modal-field">
            <span>CORREO ELECTRÓNICO (GOOGLE O PRIVADO)</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>NOMBRE DE ARTISTA</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>@HANDLE EN EL TABLERO</span>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} />
          </label>
        </div>

        <div className="google-auth-actions" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            className="google-oauth-btn"
            disabled={loading}
            onClick={handleOAuthGoogle}
          >
            <span className="g-badge">G</span>
            <span>{loading ? "Conectando..." : `Ingresar con Google (${email})`}</span>
          </button>

          <button
            type="button"
            className="apple-btn ghost"
            onClick={() => onSignInGoogle(email, name, handle)}
            style={{ justifyContent: "center" }}
          >
            Guardar y usar perfil local
          </button>

          {connected && (
            <button
              type="button"
              className="apple-btn ghost danger-trash-btn"
              onClick={onSignOut}
              style={{ justifyContent: "center", marginTop: 4 }}
            >
              Cerrar sesión actual
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
