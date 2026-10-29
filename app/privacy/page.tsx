export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <article style={{ maxWidth: 680, paddingTop: 44 }}>
      <h1 className="display" style={{ fontSize: 48 }}>Privacy</h1>
      <p className="notice">Draft. Have this reviewed before listener opens to the public.</p>
      <div className="review" style={{ display: "grid", gap: 16, fontSize: 17 }}>
        <p><b>What we store.</b> Your email address and password (stored securely by our login provider, Supabase), your profile, and everything you post: ratings, reviews, comments, likes, follows and releases.</p>
        <p><b>What is public.</b> Your profile, ratings, reviews, comments, likes, follows and releases can be seen by anyone, including people who aren&apos;t signed in. Your email address and notifications are never shown to others.</p>
        <p><b>What we don&apos;t do.</b> We don&apos;t sell your data or show ads. We don&apos;t use tracking cookies; the only cookies keep you signed in.</p>
        <p><b>Services we use.</b> Supabase (database and logins), Vercel (hosting), MusicBrainz and the Cover Art Archive (album information and artwork).</p>
        <p><b>Deleting your data.</b> Delete your account from Settings at any time. This permanently removes your profile and everything you have posted.</p>
      </div>
    </article>
  );
}
