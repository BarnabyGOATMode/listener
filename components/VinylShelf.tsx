"use client";
import Link from "next/link";
import { fmtDate, hash, stars } from "@/lib/format";
import type { Album } from "@/lib/types";
import { Cover } from "./bits";

export type ShelfRecord = { key: string; href: string; album: Album; title: string; sub: string; rating?: number | null; liked?: boolean; date?: string | null };

/**
 * A shelf of records seen spine-out. Hovering (or focusing) a record pulls it out: the sleeve opens to its cover,
 * the disc slides out and spins, the details fade in, and its neighbours lean away. `size="single"` is a 7-inch shelf.
 */
export function VinylShelf({ records, label, size = "lp" }: { records: ShelfRecord[]; label?: string; size?: "lp" | "single" }) {
  return (
    <div className={`vshelf-wrap ${size}`}>
      <div className="vshelf" role="list">
        {records.map((r) => {
          const h = hash(r.key);
          return (
            <Link key={r.key} href={r.href} className="vinyl" role="listitem" aria-label={`${r.title} — ${r.sub}${r.rating ? `, ${r.rating} stars` : ""}`}
              style={{ "--spine": `${(size === "lp" ? 38 : 30) + (h % 14)}px`, "--lean": `${((h >> 4) % 3) - 1}deg` } as React.CSSProperties}>
              <span className="disc" aria-hidden="true">
                <span className="disc-spin"><span className="lbl"><Cover album={r.album} size={250} /></span></span>
              </span>
              <span className="sleeve">
                <Cover album={r.album} size={500} />
                <span className="spine" aria-hidden="true"><b>{r.title}</b><small>{r.sub}</small></span>
                <span className="vinfo" aria-hidden="true">
                  <b>{r.title}</b><small>{r.sub}</small>
                  {(r.rating || r.liked) && <span className="vstars">{stars(r.rating)}{r.liked && <span className="heart"> ♥</span>}</span>}
                  {r.date && <small>Listened {fmtDate(r.date)}</small>}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
      <div className="plank" aria-hidden="true" />
      {label && <div className="shelf-label">{label}</div>}
    </div>
  );
}

/** Favourite albums stood face-out on the shelf, slightly tilted; hovering one straightens it and lifts the disc out of the top. */
export function FaceOut({ albums }: { albums: Album[] }) {
  return (
    <div className="vshelf-wrap faceout">
      <div className="facerow">
        {albums.map((a, i) => (
          <Link key={a.id} href={`/album/${a.id}`} className="faced" title={`${a.title} — ${a.artist}`} style={{ "--tilt": `${[-4, 2.5, -1.5, 3.5][i % 4]}deg` } as React.CSSProperties}>
            <span className="disc" aria-hidden="true"><span className="disc-spin"><span className="lbl"><Cover album={a} size={250} /></span></span></span>
            <span className="sleeve"><Cover album={a} size={500} /></span>
            <span className="faced-cap"><b>{a.title}</b><small>{a.artist}</small></span>
          </Link>
        ))}
      </div>
      <div className="plank" aria-hidden="true" />
    </div>
  );
}
