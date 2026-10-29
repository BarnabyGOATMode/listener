"use client";
import Link from "next/link";
import type { MiniProfile } from "@/lib/feed";
import { ArtistBadge, Avatar } from "./bits";
import { FollowButton } from "./FollowButton";

export function Person({ p, note }: { p: MiniProfile; note?: string }) {
  return (
    <div className="person">
      <Avatar profile={p} />
      <div className="n"><Link className="u" href={`/u/${p.handle}`}>{p.name}</Link><ArtistBadge profile={p} /><small>@{p.handle}{note ? ` · ${note}` : ""}</small></div>
      <FollowButton id={p.id} />
    </div>
  );
}
