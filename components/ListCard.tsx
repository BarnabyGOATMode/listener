import Link from "next/link";
import { plural } from "@/lib/format";
import type { ListRow } from "@/lib/lists";
import { Cover } from "./bits";

/** A list's first five covers fanned out like records in a crate, with its title and who made it. */
export function ListCard({ list, hideOwner }: { list: ListRow; hideOwner?: boolean }) {
  const covers = list.items.slice(0, 5);
  return (
    <div className="lcard">
      <Link className="lstack" href={`/list/${list.id}`} aria-label={`Open the list ${list.title}`}>
        {covers.map((i, n) => <span key={i.album_id} style={{ "--n": n } as React.CSSProperties}><Cover album={i.album} size={250} /></span>)}
        {Array.from({ length: Math.max(0, 5 - covers.length) }, (_, n) => <span key={`e${n}`} className="blank" style={{ "--n": covers.length + n } as React.CSSProperties} />)}
      </Link>
      <Link className="card-title" href={`/list/${list.id}`}><b>{list.title}</b></Link>
      <small>
        {!hideOwner && list.profile && <><Link className="card-artist" href={`/u/${list.profile.handle}`}>{list.profile.name}</Link> · </>}
        {plural(list.items.length, "album")}{list.ranked ? " · ranked" : ""}{list.likes ? ` · ♥ ${list.likes}` : ""}
      </small>
    </div>
  );
}
