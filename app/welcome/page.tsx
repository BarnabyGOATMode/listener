"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ProfileForm } from "@/components/ProfileForm";
import { useSession } from "@/components/Providers";

export default function WelcomePage() {
  const { user, profile, ready, refresh } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login?mode=up");
    else if (profile) router.replace("/");
  }, [ready, user, profile, router]);
  if (!user || profile) return null;
  return (
    <div className="authcard" style={{ maxWidth: 560 }}>
      <div className="kicker">Welcome to listener</div>
      <h1 className="display" style={{ fontSize: 44 }}>Set up your profile</h1>
      <p className="lede" style={{ fontSize: 17 }}>Pick a username so people can find your reviews and follow your diary.</p>
      <ProfileForm userId={user.id} onSaved={async () => { await refresh(); router.replace("/"); }} />
    </div>
  );
}
