"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useSession } from "./Providers";

/** Bookmark an album to hear later. It drops off the queue by itself once you log the album. */
export function ListenLater({ albumId, logged }: { albumId: string; logged: boolean }) {
  const { user, toast } = useSession();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) return;
    supabase().from("listen_later").select("album_id").eq("user_id", user.id).eq("album_id", albumId).maybeSingle()
      .then(({ data }) => setOn(!!data));
  }, [user, albumId, logged]);
  if (!user || logged || on === null) return null;
  const flip = async () => {
    const db = supabase();
    setOn(!on);
    const { error } = on
      ? await db.from("listen_later").delete().eq("user_id", user.id).eq("album_id", albumId)
      : await db.from("listen_later").insert({ user_id: user.id, album_id: albumId });
    if (error) { setOn(on); return toast("Couldn't save that. Try again."); }
    toast(on ? "Taken off Listen later" : "Saved to Listen later");
  };
  return (
    <button className="btn ghost" aria-pressed={on} onClick={flip} title="Save it to hear later. It comes off the queue when you log it.">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="ico"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>{on ? "On Listen later" : "Listen later"}
    </button>
  );
}
