"use client";
import Link from "next/link";
import { stars } from "@/lib/format";
import type { Album } from "@/lib/types";
import { Cover } from "./bits";

export type WallTile = { key: string; href: string; album: Album; title: string; sub: string; rating?: number | null; liked?: boolean; review?: string; song?: boolean; favorite?: boolean };

/**
 * Everything someone has reviewed as one mosaic of covers, favourites shown large. Hovering a cover dims the rest of
 * the wall and lifts that one with its title, rating and the first line of the review.
 */
export function CoverWall({ tiles }: { tiles: WallTile[] }) {
  return (
    <div className="wall" role="list">
      {tiles.map((t, i) => (
        <Link key={t.key} href={t.href} role="listitem" className={`tile${t.favorite ? " fav" : ""}`} style={{ "--i": Math.min(i, 40) } as React.CSSProperties}
          aria-label={`${t.title} — ${t.sub}${t.rating ? `, ${t.rating} stars` : ""}${t.favorite ? ", favorite" : ""}`}>
          <Cover album={t.album} size={t.favorite ? 500 : 250} />
          {t.song && <span className="tile-mark" aria-hidden="true">♪</span>}
          {t.favorite && <span className="tile-mark fav-mark" aria-hidden="true">Favorite</span>}
          <span className="tinfo" aria-hidden="true">
            <b>{t.title}</b>
            <small>{t.sub}</small>
            {(t.rating || t.liked) && <span className="tstars">{stars(t.rating)}{t.liked && <span className="heart"> ♥</span>}</span>}
            {t.review && <q>{t.review}</q>}
          </span>
        </Link>
      ))}
    </div>
  );
}
