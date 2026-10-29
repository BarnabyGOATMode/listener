export const metadata = { title: "Terms" };

export default function Terms() {
  return (
    <article style={{ maxWidth: 680, paddingTop: 44 }}>
      <h1 className="display" style={{ fontSize: 48 }}>Terms of use</h1>
      <p className="notice">Draft. Have these reviewed before listener opens to the public.</p>
      <div className="review" style={{ display: "grid", gap: 16, fontSize: 17 }}>
        <p>listener is a place to log, rate and review music. By creating an account you agree to these terms.</p>
        <p><b>Your account.</b> You must be at least 13 years old. Keep your password safe; you are responsible for what is posted from your account.</p>
        <p><b>Your content.</b> You own the reviews, ratings and comments you post. You give listener permission to show them on the site. Don&apos;t post anything illegal, hateful, harassing, or that you don&apos;t have the right to share.</p>
        <p><b>Artists.</b> Only add releases that you made or have the right to share.</p>
        <p><b>Removal.</b> We may remove content or accounts that break these terms. You can delete your account at any time from Settings, which deletes everything you have posted.</p>
        <p><b>No guarantees.</b> listener is provided as is, and may change or stop at any time.</p>
        <p><b>Music data.</b> Album information comes from MusicBrainz and covers from the Cover Art Archive. Listen now links open third-party services, which have their own terms.</p>
      </div>
    </article>
  );
}
