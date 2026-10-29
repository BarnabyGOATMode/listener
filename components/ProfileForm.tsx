"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

/** Used for both finishing sign-up (no existing profile) and Edit profile. */
export function ProfileForm({ userId, existing, onSaved, onCancel }: { userId: string; existing?: Profile | null; onSaved: (p: Profile) => void; onCancel?: () => void }) {
  const [handle, setHandle] = useState(existing?.handle ?? "");
  const [kind, setKind] = useState<Profile["kind"]>(existing?.kind ?? "listener");
  const [name, setName] = useState(existing?.name ?? "");
  const [genre, setGenre] = useState(existing?.genre ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [bio, setBio] = useState(existing?.bio ?? "");
  const [taken, setTaken] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const artist = kind === "artist";
  const validHandle = /^[a-z0-9_]{3,20}$/.test(handle);

  useEffect(() => {
    setTaken(false);
    if (!validHandle || handle === existing?.handle) return;
    const t = setTimeout(async () => {
      const { data } = await supabase().from("profiles").select("id").eq("handle", handle).maybeSingle();
      setTaken(!!data && data.id !== userId);
    }, 350);
    return () => clearTimeout(t);
  }, [handle, validHandle, existing?.handle, userId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!validHandle) return setError("Usernames are 3 to 20 characters: lowercase letters, numbers and underscores.");
    if (taken) return setError(`@${handle} is taken. Try another.`);
    if (!name.trim()) return setError(artist ? "Add your artist or band name." : "Add a display name.");
    setBusy(true);
    const row = { id: userId, handle, kind, name: name.trim(), bio: bio.trim(), genre: artist ? genre.trim() : "", location: artist ? location.trim() : "" };
    const db = supabase();
    const { data, error } = existing
      ? await db.from("profiles").update(row).eq("id", userId).select().single()
      : await db.from("profiles").insert(row).select().single();
    setBusy(false);
    if (error) return setError(error.code === "23505" ? `@${handle} was just taken. Try another.` : "Couldn't save your profile. Check your connection and try again.");
    onSaved(data as Profile);
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <label className="field">Username
        <span className="handle"><span>@</span><input value={handle} maxLength={20} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="yourname"
          onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} /></span>
        <span className={`hint${handle && (!validHandle || taken) ? " bad" : ""}`}>
          {!handle ? "3 to 20 characters: lowercase letters, numbers and underscores." : !validHandle ? "At least 3 characters." : taken ? `@${handle} is taken.` : handle === existing?.handle ? " " : `@${handle} is available.`}
        </span>
      </label>
      <fieldset className="types"><legend className="label" style={{ marginBottom: 8 }}>I&apos;m joining as</legend>
        <label className="type"><input type="radio" name="kind" checked={!artist} onChange={() => setKind("listener")} /><span><b>Listener</b><small>Log, rate and review music</small></span></label>
        <label className="type"><input type="radio" name="kind" checked={artist} onChange={() => setKind("artist")} /><span><b>Artist</b><small>Share your releases and build a following</small></span></label>
      </fieldset>
      <label className="field">{artist ? "Artist or band name" : "Display name"}
        <input className="input" value={name} maxLength={60} placeholder={artist ? "How your name appears on your releases" : "How your name appears on reviews"} onChange={(e) => setName(e.target.value)} />
      </label>
      {artist && (
        <div className="two">
          <label className="field">Genre <span className="hint">optional</span><input className="input" value={genre} maxLength={40} placeholder="e.g. Indie rock" onChange={(e) => setGenre(e.target.value)} /></label>
          <label className="field">Based in <span className="hint">optional</span><input className="input" value={location} maxLength={60} placeholder="e.g. Glasgow" onChange={(e) => setLocation(e.target.value)} /></label>
        </div>
      )}
      <label className="field">Bio <span className="hint">optional</span>
        <textarea className="textarea" style={{ minHeight: 70 }} value={bio} maxLength={160} placeholder="What are you listening to lately?" onChange={(e) => setBio(e.target.value)} />
      </label>
      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="actions">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : existing ? "Save profile" : "Create account"}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
