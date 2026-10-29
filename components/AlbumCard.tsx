import Link from "next/link";
import type { Album } from "@/lib/types";
import { Cover } from "./bits";

export function AlbumCard({ album, note, sub }: { album: Pick<Album, "id" | "title" | "artist" | "cover_url"> & { year?: number | null }; note?: React.ReactNode; sub?: string }) {
  return (
    <Link className="card" href={`/album/${album.id}`}>
      <Cover album={album} size={250} />
      <div><b>{album.title}</b><small>{album.artist}{album.year ? ` · ${album.year}` : ""}</small></div>
      {sub && <div className="meta">{sub}</div>}
      {note && <span className="why">{note}</span>}
    </Link>
  );
}
