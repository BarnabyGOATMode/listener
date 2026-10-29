import Link from "next/link";
import type { Album } from "@/lib/types";
import { Cover } from "./bits";

type CardAlbum = Pick<Album, "id" | "title" | "artist" | "cover_url"> & { year?: number | null; artist_mbid?: string | null; artist_id?: string | null };

/** Album tile. The cover and title open the album; the artist name opens the artist's page when we know who they are. */
export function AlbumCard({ album, note, sub, hideArtist }: { album: CardAlbum; note?: React.ReactNode; sub?: string; hideArtist?: boolean }) {
  const href = `/album/${album.id}`;
  const artistId = album.artist_mbid || album.artist_id;
  return (
    <div className="card">
      <Link className="card-art" href={href} tabIndex={-1} aria-hidden="true"><Cover album={album} size={250} /></Link>
      <div>
        <Link className="card-title" href={href}><b>{album.title}</b></Link>
        <small>{hideArtist ? album.year ?? "" : <>{artistId ? <Link className="card-artist" href={`/artist/${artistId}`}>{album.artist}</Link> : album.artist}{album.year ? ` · ${album.year}` : ""}</>}</small>
      </div>
      {sub && <div className="meta">{sub}</div>}
      {note && <span className="why">{note}</span>}
    </div>
  );
}
