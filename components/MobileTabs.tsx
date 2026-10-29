"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AvatarFace, avatarColor } from "./bits";
import { NewReview } from "./NewReview";
import { useSession } from "./Providers";

const ICON = {
  home: <path d="M3.5 10.6 12 3.5l8.5 7.1V20a.5.5 0 0 1-.5.5h-5.2v-6.2H9.2v6.2H4a.5.5 0 0 1-.5-.5z" />,
  compass: <><circle cx="12" cy="12" r="8.7" /><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5z" /></>,
  plus: <><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><path d="M12 8v8M8 12h8" /></>,
  search: <><circle cx="10.6" cy="10.6" r="6.6" /><path d="m15.6 15.6 4.9 4.9" /></>,
  user: <><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c.9-3.9 3.9-6 7.5-6s6.6 2.1 7.5 6" /></>,
};
const Svg = ({ d }: { d: React.ReactNode }) => <svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>;

/** The phone tab bar, like Instagram's: Feed, Discover, New review, Search, Profile. Hidden inside an open chat. */
export function MobileTabs() {
  return <Suspense><Tabs /></Suspense>;
}

function Tabs() {
  const { profile, user } = useSession();
  const path = usePathname();
  const inChat = path.startsWith("/messages") && !!useSearchParams().get("c");
  if (inChat) return null;
  const on = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const mine = !!profile && path.startsWith(`/u/${profile.handle}`);
  return (
    <nav className="mtabs" aria-label="Main">
      <Link href="/" aria-label="Feed" aria-current={on("/") ? "page" : undefined}><Svg d={ICON.home} /></Link>
      <Link href="/discover" aria-label="Discover" aria-current={on("/discover") ? "page" : undefined}><Svg d={ICON.compass} /></Link>
      {profile
        ? <NewReview trigger={(open) => <button aria-label="New review" onClick={open}><Svg d={ICON.plus} /></button>} />
        : <span aria-hidden="true" />}
      <Link href="/albums" aria-label="Search" aria-current={on("/albums") ? "page" : undefined}><Svg d={ICON.search} /></Link>
      {profile ? (
        <Link href={`/u/${profile.handle}`} aria-label="Profile" aria-current={mine ? "page" : undefined}>
          <span className="rail-av" style={{ background: avatarColor(profile.id) }} aria-hidden="true"><AvatarFace profile={profile} /></span>
        </Link>
      ) : !user ? <Link href="/login" aria-label="Sign in" aria-current={on("/login") ? "page" : undefined}><Svg d={ICON.user} /></Link> : <span />}
    </nav>
  );
}
