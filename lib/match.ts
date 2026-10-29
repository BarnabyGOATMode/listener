/** "The Real Thing (Deluxe Edition)" ≈ "real thing": lowercased, accents and brackets dropped, punctuation flattened. */
export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)|\[.*?\]/g, "")
  .replace(/&/g, " and ").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();

export const sameTitle = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };

/** Artist credits differ between catalogues ("Jay-Z & Kanye West" vs "JAY-Z"), so also compare the lead name. */
const lead = (s: string) => s.split(/,|&| and | feat\.? | x /i)[0];
export const sameArtist = (a: string, b: string) => sameTitle(a, b) || sameTitle(lead(a), lead(b));
