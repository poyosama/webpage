"use client";

import React, { useRef, useState } from "react";
import { type Project, type Track } from "@/lib/mock";
import { sfx } from "@/lib/sfx";

export default function DiscSpinner3D({
  project,
  currentTrackId,
  onPlayTrack,
  compact = false,
}: {
  project: Project;
  currentTrackId?: string;
  onPlayTrack: (track: Track, project: Project) => void;
  onDeleteTrack?: (projectId: string, trackId: string) => void;
  compact?: boolean;
}) {
  const tracks = project.tracks;
  const activeTrack =
    tracks.find((t) => t.id === currentTrackId) || tracks[0] || null;
  const isProjectPlaying = Boolean(
    currentTrackId && tracks.some((t) => t.id === currentTrackId)
  );

  const coverUrl = activeTrack?.coverUrl || project.coverUrl;
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, hover: false });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
    const ry = (nx - 0.5) * 14;
    const rx = -(ny - 0.5) * 12;
    setTilt({
      rx,
      ry,
      gx: Math.round(nx * 100),
      gy: Math.round(ny * 100),
      hover: true,
    });
  };

  const handlePointerLeave = () => {
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 50, hover: false });
  };

  const handleTriggerPlay = () => {
    if (!activeTrack) return;
    sfx.play();
    onPlayTrack(activeTrack, project);
  };

  return (
    <div
      className={`vinyl-showcase-render ${compact ? "is-compact" : ""} ${
        isProjectPlaying ? "is-playing" : ""
      }`}
    >
      <div
        ref={cardRef}
        className="vinyl-render-stage"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleTriggerPlay}
        role="button"
        tabIndex={0}
        aria-label={`Reproducir ${project.title}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleTriggerPlay();
          }
        }}
        style={{
          transform: `perspective(1100px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${
            tilt.hover ? 1.02 : 1
          })`,
        }}
      >
        {/* Sombra de piso suave */}
        <div className="vinyl-render-floor-shadow" />

        {/* Disco de vinilo asomando a la derecha */}
        <div className="vinyl-render-disc-wrap">
          <div
            className={`vinyl-render-disc ${
              isProjectPlaying ? "spinning" : ""
            }`}
          >
            {/* Reflejo anisotrópico de luz */}
            <div className="vinyl-render-sheen" />
            {/* Surcos concéntricos de alta definición */}
            <div className="vinyl-render-grooves" />

            {/* Sello central (Label) con la portada o color del proyecto */}
            <div
              className="vinyl-render-label"
              style={{
                background: coverUrl
                  ? `url(${coverUrl}) center / cover no-repeat`
                  : `radial-gradient(circle, ${project.c2 || "#e11d48"} 0%, ${
                      project.c1 || "#18181b"
                    } 100%)`,
              }}
            >
              <div className="vinyl-render-label-ring" />
              <div className="vinyl-render-spindle-hole" />
            </div>
          </div>
        </div>

        {/* Sobre / Portada principal del proyecto */}
        <div className="vinyl-render-sleeve">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={project.title}
              className="vinyl-render-cover-img"
              draggable={false}
            />
          ) : (
            <div
              className="vinyl-render-cover-fallback"
              style={{
                background: `linear-gradient(135deg, ${
                  project.c1 || "#141418"
                } 0%, ${project.c2 || "#2d2f3d"} 100%)`,
              }}
            >
              <span className="fallback-type-tag">{project.type}</span>
              <strong>{project.title}</strong>
              <em>{project.artist}</em>
            </div>
          )}

          {/* Textura sutil de borde de cartón y lomo */}
          <div className="vinyl-render-sleeve-spine" />
          <div
            className="vinyl-render-sleeve-glare"
            style={{
              background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 62%)`,
            }}
          />

          {/* Indicador minimalista de Play en hover o estado activo */}
          <div className="vinyl-render-play-pill">
            <span>{isProjectPlaying ? "● Sonando" : "▶ Reproducir"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
