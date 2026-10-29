"use client";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "./Providers";

export function FollowButton({ id }: { id: string }) {
  const { user, profile, following, setFollowing, toast } = useSession();
  const [busy, setBusy] = useState(false);
  if (!user) return <Link className="follow" href="/login" style={{ textDecoration: "none" }}>Follow</Link>;
  if (!profile || id === user.id) return null;
  const on = following.has(id);
  return (
    <button className="follow" aria-pressed={on} disabled={busy} onClick={async () => {
      setBusy(true);
      const next = new Set(following);
      const db = supabase();
      const { error } = on
        ? await db.from("follows").delete().eq("follower_id", user.id).eq("followee_id", id)
        : await db.from("follows").insert({ follower_id: user.id, followee_id: id });
      setBusy(false);
      if (error) return toast("Couldn't update that. Try again.");
      if (on) next.delete(id); else next.add(id);
      setFollowing(next);
    }}>{on ? "Following" : "Follow"}</button>
  );
}
