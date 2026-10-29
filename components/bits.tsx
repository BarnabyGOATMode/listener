"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { hash } from "@/lib/format";
import type { Album, Profile } from "@/lib/types";

export function Avatar({ profile, large }: { profile: Pick<Profile, "id" | "name" | "handle"> | null | undefined; large?: boolean }) {
  if (!profile) return <span className={`av${large ? " lg" : ""}`} style={{ background: "#8a8172" }} aria-hidden="true">?</span>;
  return (
    <Link href={`/u/${profile.handle}`} className={`av${large ? " lg" : ""}`} style={{ background: `hsl(${hash(profile.id) % 360} 16% 44%)` }} aria-hidden="true" tabIndex={-1}>
      {(profile.name.trim()[0] || "?").toUpperCase()}
    </Link>
  );
}

export const ArtistBadge = ({ profile }: { profile?: Pick<Profile, "kind"> | null }) => (profile?.kind === "artist" ? <span className="badge">Artist</span> : null);

/** Album art from the Cover Art Archive, falling back to generated sleeve art when there is none. */
export function Cover({ album, size = 500 }: { album: Pick<Album, "id" | "title" | "artist" | "cover_url">; size?: 250 | 500 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [album.cover_url]);
  const src = album.cover_url ? album.cover_url.replace(/front-\d+$/, `front-${size}`) : null;
  return (
    <div className="cover">
      {src && !failed ? <img src={src} alt={`${album.title} cover`} loading="lazy" onError={() => setFailed(true)} /> : <Generated album={album} />}
    </div>
  );
}

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function Generated({ album }: { album: Pick<Album, "id" | "title" | "artist"> }) {
  const r = rng(hash(album.id + album.title)), h = Math.floor(r() * 360);
  const bg = `hsl(${h} ${35 + r() * 30}% ${14 + r() * 22}%)`, c1 = `hsl(${(h + 140 + r() * 80) % 360} 78% 62%)`, c2 = `hsl(${(h + 25) % 360} 55% 84%)`;
  const shapes: React.ReactNode[] = [];
  const style = hash(album.id) % 4;
  if (style === 0) for (let i = 9; i > 0; i--) shapes.push(<circle key={i} cx="50" cy="46" r={i * 5} fill="none" stroke={i % 2 ? c1 : c2} strokeWidth={0.5 + r() * 2.2} opacity={0.35 + r() * 0.65} />);
  else if (style === 1) for (let i = -2; i < 12; i++) shapes.push(<rect key={i} x="-10" y={i * 9} width="120" height={1.5 + r() * 6} fill={i % 3 ? c1 : c2} opacity={0.25 + r() * 0.75} transform="rotate(-14 50 50)" />);
  else if (style === 2) shapes.push(<circle key="a" cx={30 + r() * 40} cy={28 + r() * 30} r={22 + r() * 14} fill={c1} />, <circle key="b" cx={30 + r() * 40} cy={30 + r() * 30} r={10 + r() * 10} fill={c2} opacity=".85" />);
  else { let p = "M0 70"; for (let x = 0; x <= 100; x += 5) p += ` L${x} ${40 + r() * 30}`; shapes.push(<path key="p" d={`${p} L100 100 L0 100Z`} fill={c1} opacity=".9" />, <rect key="t" x="0" y="0" width="100" height={8 + r() * 20} fill={c2} opacity=".7" />); }
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={`${album.title} cover`}>
      <rect width="100" height="100" fill={bg} />{shapes}
      <rect x="0" y="86" width="100" height="14" fill={bg} opacity=".75" />
      <text x="5" y="95.5" fontFamily="ui-monospace, monospace" fontSize="4.6" fill={c2} letterSpacing=".4">{album.artist.toUpperCase().slice(0, 26)}</text>
    </svg>
  );
}

const fill = (v: number, i: number) => Math.max(0, Math.min(1, v - i + 1)) * 100;

/** Five half-star rating input. Click the left half of a star for a half star; click the current value to clear. */
export function Rater({ value, onChange, label, small, disabled }: { value: number; onChange?: (v: number) => void; label: string; small?: boolean; disabled?: boolean }) {
  const set = (v: number) => onChange?.(Math.max(0, Math.min(5, Math.round(v * 2) / 2)));
  return (
    <div className={`rate${small ? " sm" : ""}`} role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={0} aria-valuemax={5} aria-valuenow={value}
      aria-valuetext={value ? `${value} stars` : "Not rated"} aria-disabled={disabled || undefined}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); set(value + 0.5); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); set(value - 0.5); }
      }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} onClick={(e) => {
          if (disabled) return;
          const box = e.currentTarget.getBoundingClientRect();
          const v = i - 1 + (e.clientX - box.left < box.width / 2 ? 0.5 : 1);
          set(v === value ? 0 : v);
        }}>★<span className="f" style={{ width: `${fill(value, i)}%` }}>★</span></span>
      ))}
    </div>
  );
}

const SERVICES: [string, (q: string) => string][] = [
  ["Spotify", (q) => `https://open.spotify.com/search/${q}`],
  ["Apple Music", (q) => `https://music.apple.com/search?term=${q}`],
  ["YouTube Music", (q) => `https://music.youtube.com/search?q=${q}`],
  ["Deezer", (q) => `https://www.deezer.com/search/${q}`],
  ["Tidal", (q) => `https://listen.tidal.com/search?q=${q}`],
];

/** Opens a search for this album or song in the listener's streaming service. */
export function ListenNow({ query }: { query: string }) {
  const q = encodeURIComponent(query);
  return (
    <details className="listen" onToggle={(e) => {
      const d = e.currentTarget;
      if (!d.open) return;
      const close = (ev: MouseEvent) => { if (!d.contains(ev.target as Node)) { d.open = false; document.removeEventListener("click", close, true); } };
      document.addEventListener("click", close, true);
    }}>
      <summary><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" /></svg>Listen now</summary>
      <div className="lmenu">
        {SERVICES.map(([name, url]) => <a key={name} href={url(q)} target="_blank" rel="noopener noreferrer">{name}</a>)}
        <span>Opens in a new tab</span>
      </div>
    </details>
  );
}
