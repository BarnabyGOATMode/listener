import "server-only";

export type Story = { id: string; title: string; link: string; summary: string; image: string | null; source: string; published: string };

/** Music publications' public news feeds. Each story links back to the publication; only the headline and a short excerpt are shown. */
export const SOURCES: { name: string; url: string }[] = [
  { name: "Pitchfork", url: "https://pitchfork.com/feed/feed-news/rss" },
  { name: "The Guardian", url: "https://www.theguardian.com/music/rss" },
  { name: "Stereogum", url: "https://www.stereogum.com/feed/" },
  { name: "NME", url: "https://www.nme.com/news/music/feed" },
  { name: "Consequence", url: "https://consequence.net/feed/" },
  { name: "Rolling Stone", url: "https://www.rollingstone.com/music/music-news/feed/" },
];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const text = (html: string) => decode(decode(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";
const attr = (xml: string, name: string, a: string) => xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["']`, "i"))?.[1] ?? "";

function excerpt(s: string, max = 220) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30)).replace(/[,;:.\s]+$/, "") + "…";
}

/** Reads RSS 2.0 or Atom: title, link, date, a plain-text excerpt and the best image it can find. */
export function parseFeed(xml: string, source: string): Story[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  return items.map((it) => {
    const title = text(tag(it, "title"));
    const link = decode(tag(it, "link").trim()) || attr(it, "link", "href");
    const date = tag(it, "pubDate") || tag(it, "published") || tag(it, "updated") || tag(it, "dc:date");
    const body = tag(it, "description") || tag(it, "summary") || tag(it, "content:encoded") || tag(it, "content");
    const image = attr(it, "media:content", "url") || attr(it, "media:thumbnail", "url") || attr(it, "enclosure", "url")
      || decode(body).match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || null;
    const published = new Date(date.trim());
    return {
      id: `${source}:${link}`,
      title, link, source,
      summary: excerpt(text(body)),
      image: image && /^https:\/\//.test(decode(image)) ? decode(image) : null,
      published: isNaN(+published) ? new Date(0).toISOString() : published.toISOString(),
    };
  }).filter((s) => s.title && /^https?:\/\//.test(s.link));
}

/** Every source at once; a source that's down or slow is simply left out. Newest first, duplicates removed. */
export async function latestNews(): Promise<{ stories: Story[]; sources: string[] }> {
  const results = await Promise.allSettled(SOURCES.map(async (s) => {
    const r = await fetch(s.url, { headers: { "User-Agent": "listener/0.1 (music news reader)", Accept: "application/rss+xml, application/atom+xml, text/xml" }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`${s.name} ${r.status}`);
    return parseFeed(await r.text(), s.name).slice(0, 20);
  }));
  const seen = new Set<string>();
  const stories = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((s) => { const k = s.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, 80);
  return { stories, sources: SOURCES.filter((_, i) => results[i].status === "fulfilled").map((s) => s.name) };
}
