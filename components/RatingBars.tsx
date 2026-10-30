import { plural } from "@/lib/format";

/** How a set of ratings spreads across half-stars, as ten thin bars from ½ to 5 stars. */
export function RatingBars({ ratings, label = "ratings", mine }: { ratings: number[]; label?: string; mine?: number | null }) {
  const bins = Array.from({ length: 10 }, (_, i) => ratings.filter((r) => Math.round(r * 2) === i + 1).length);
  const max = Math.max(1, ...bins);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  return (
    <figure className="rbars" aria-label={`${plural(ratings.length, label.replace(/s$/, ""))}${ratings.length ? `, average ${avg.toFixed(1)} stars` : ""}`}>
      <div className="rb-top"><span className="label">{label}</span>{ratings.length > 0 && <b>★ {avg.toFixed(1)}</b>}</div>
      <div className="rb-bars">
        <span className="rb-end" aria-hidden="true">★</span>
        {bins.map((n, i) => (
          <span key={i} className={`rb${mine && Math.round(mine * 2) === i + 1 ? " mine" : ""}`} title={`${(i + 1) / 2} stars: ${n}`}>
            <i style={{ height: `${Math.max(n ? 8 : 2, (n / max) * 100)}%` }} />
          </span>
        ))}
        <span className="rb-end" aria-hidden="true">★★★★★</span>
      </div>
      <figcaption className="hint">{ratings.length ? plural(ratings.length, label.replace(/s$/, "")) : "No ratings yet"}</figcaption>
    </figure>
  );
}
