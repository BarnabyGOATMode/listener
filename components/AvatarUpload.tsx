"use client";
import { useState } from "react";
import { removeAvatar, uploadAvatar } from "@/lib/avatar";
import type { Profile } from "@/lib/types";
import { Avatar } from "./bits";
import { useSession } from "./Providers";

/** Your avatar, which you can click to choose a new photo. Used on your own profile and in Edit profile. */
export function AvatarUpload({ profile, onChange, large = true, withButtons }: { profile: Profile; onChange: (url: string | null) => void; large?: boolean; withButtons?: boolean }) {
  const { refresh, toast } = useSession();
  const [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { const url = await uploadAvatar(profile.id, file); onChange(url); await refresh(); toast("Photo updated"); }
    catch (e) { toast((e as Error).message); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try { await removeAvatar(profile.id); onChange(null); await refresh(); toast("Photo removed"); }
    catch (e) { toast((e as Error).message); }
    setBusy(false);
  };
  const face = (
    <label className={`avatar-edit${busy ? " busy" : ""}`} title="Change photo">
      <Avatar profile={profile} large={large} />
      <span className="hover" aria-hidden="true">{busy ? "Uploading…" : profile.avatar_url ? "Change photo" : "Add photo"}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/*" aria-label="Choose a profile photo" disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );
  if (!withButtons) return face;
  return (
    <div className="photo-row">
      {face}
      <div className="actions">
        <label className="btn ghost small" style={{ cursor: "pointer" }}>
          {profile.avatar_url ? "Upload a new photo" : "Upload a photo"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/*" style={{ display: "none" }} disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {profile.avatar_url && <button type="button" className="btn ghost small" disabled={busy} onClick={remove}>Remove photo</button>}
      </div>
    </div>
  );
}
