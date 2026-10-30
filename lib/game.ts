import { hash } from "./format";
import { norm } from "./match";

/**
 * Undercover: guess the album from its cover with the colours scrambled. Everyone gets the same album each day;
 * each wrong guess (or skip) brings the cover a step closer to the real thing.
 */
export type GameAlbum = { title: string; artist: string; year: number };

// Well-known records across eras and genres. Covers are found by title and artist, the same way album pages find them.
const POOL: [string, string, number][] = [
  ["In Rainbows", "Radiohead", 2007], ["OK Computer", "Radiohead", 1997], ["Kid A", "Radiohead", 2000],
  ["Blonde", "Frank Ocean", 2016], ["Channel Orange", "Frank Ocean", 2012],
  ["To Pimp a Butterfly", "Kendrick Lamar", 2015], ["good kid, m.A.A.d city", "Kendrick Lamar", 2012], ["DAMN.", "Kendrick Lamar", 2017],
  ["My Beautiful Dark Twisted Fantasy", "Kanye West", 2010], ["The College Dropout", "Kanye West", 2004], ["Graduation", "Kanye West", 2007], ["Yeezus", "Kanye West", 2013],
  ["Rumours", "Fleetwood Mac", 1977], ["Abbey Road", "The Beatles", 1969], ["Sgt. Pepper's Lonely Hearts Club Band", "The Beatles", 1967], ["Revolver", "The Beatles", 1966],
  ["The Dark Side of the Moon", "Pink Floyd", 1973], ["Wish You Were Here", "Pink Floyd", 1975], ["The Wall", "Pink Floyd", 1979],
  ["Nevermind", "Nirvana", 1991], ["In Utero", "Nirvana", 1993],
  ["Thriller", "Michael Jackson", 1982], ["Off the Wall", "Michael Jackson", 1979], ["Bad", "Michael Jackson", 1987],
  ["Purple Rain", "Prince", 1984], ["Back in Black", "AC/DC", 1980], ["Led Zeppelin IV", "Led Zeppelin", 1971],
  ["The Velvet Underground & Nico", "The Velvet Underground", 1967], ["London Calling", "The Clash", 1979], ["Never Mind the Bollocks, Here's the Sex Pistols", "Sex Pistols", 1977],
  ["Unknown Pleasures", "Joy Division", 1979], ["The Queen Is Dead", "The Smiths", 1986], ["Disintegration", "The Cure", 1989],
  ["Kind of Blue", "Miles Davis", 1959], ["A Love Supreme", "John Coltrane", 1965], ["Blue", "Joni Mitchell", 1971], ["Pet Sounds", "The Beach Boys", 1966],
  ["What's Going On", "Marvin Gaye", 1971], ["Songs in the Key of Life", "Stevie Wonder", 1976], ["Born to Run", "Bruce Springsteen", 1975],
  ["Ziggy Stardust", "David Bowie", 1972], ["Blackstar", "David Bowie", 2016], ["Hounds of Love", "Kate Bush", 1985],
  ["Discovery", "Daft Punk", 2001], ["Random Access Memories", "Daft Punk", 2013], ["Homework", "Daft Punk", 1997],
  ["Currents", "Tame Impala", 2015], ["Lonerism", "Tame Impala", 2012], ["Is This It", "The Strokes", 2001], ["AM", "Arctic Monkeys", 2013],
  ["Whatever People Say I Am, That's What I'm Not", "Arctic Monkeys", 2006], ["Funeral", "Arcade Fire", 2004], ["Hot Fuss", "The Killers", 2004],
  ["American Idiot", "Green Day", 2004], ["Dookie", "Green Day", 1994], ["The Black Parade", "My Chemical Romance", 2006],
  ["Parachutes", "Coldplay", 2000], ["A Rush of Blood to the Head", "Coldplay", 2002], ["(What's the Story) Morning Glory?", "Oasis", 1995],
  ["Definitely Maybe", "Oasis", 1994], ["Parklife", "Blur", 1994], ["Dummy", "Portishead", 1994], ["Mezzanine", "Massive Attack", 1998],
  ["Ready to Die", "The Notorious B.I.G.", 1994], ["Illmatic", "Nas", 1994], ["The Miseducation of Lauryn Hill", "Lauryn Hill", 1998],
  ["Enter the Wu-Tang (36 Chambers)", "Wu-Tang Clan", 1993], ["The Chronic", "Dr. Dre", 1992], ["The Marshall Mathers LP", "Eminem", 2000],
  ["The Blueprint", "Jay-Z", 2001], ["Aquemini", "OutKast", 1998], ["Speakerboxxx/The Love Below", "OutKast", 2003],
  ["Madvillainy", "Madvillain", 2004], ["Donuts", "J Dilla", 2006], ["Igor", "Tyler, the Creator", 2019], ["Flower Boy", "Tyler, the Creator", 2017],
  ["Call Me If You Get Lost", "Tyler, the Creator", 2021], ["Astroworld", "Travis Scott", 2018], ["Rodeo", "Travis Scott", 2015],
  ["Take Care", "Drake", 2011], ["Nothing Was the Same", "Drake", 2013], ["Views", "Drake", 2016],
  ["After Hours", "The Weeknd", 2020], ["Starboy", "The Weeknd", 2016], ["Beauty Behind the Madness", "The Weeknd", 2015],
  ["Lemonade", "Beyoncé", 2016], ["Renaissance", "Beyoncé", 2022], ["Ctrl", "SZA", 2017], ["SOS", "SZA", 2022],
  ["Back to Black", "Amy Winehouse", 2006], ["21", "Adele", 2011], ["25", "Adele", 2015],
  ["1989", "Taylor Swift", 2014], ["Folklore", "Taylor Swift", 2020], ["Red", "Taylor Swift", 2012], ["Midnights", "Taylor Swift", 2022],
  ["Melodrama", "Lorde", 2017], ["Pure Heroine", "Lorde", 2013], ["When We All Fall Asleep, Where Do We Go?", "Billie Eilish", 2019],
  ["Future Nostalgia", "Dua Lipa", 2020], ["Sour", "Olivia Rodrigo", 2021], ["Brat", "Charli XCX", 2024], ["Short n' Sweet", "Sabrina Carpenter", 2024],
  ["Hit Me Hard and Soft", "Billie Eilish", 2024], ["The Rise and Fall of a Midwest Princess", "Chappell Roan", 2023], ["GNX", "Kendrick Lamar", 2024],
  ["Born This Way", "Lady Gaga", 2011], ["The Fame", "Lady Gaga", 2008], ["Teenage Dream", "Katy Perry", 2010],
  ["Un Verano Sin Ti", "Bad Bunny", 2022], ["Motomami", "Rosalía", 2022], ["Punisher", "Phoebe Bridgers", 2020],
  ["Carrie & Lowell", "Sufjan Stevens", 2015], ["For Emma, Forever Ago", "Bon Iver", 2007], ["Fleet Foxes", "Fleet Foxes", 2008],
  ["Since I Left You", "The Avalanches", 2000], ["Loveless", "My Bloody Valentine", 1991], ["Doolittle", "Pixies", 1989],
  ["Siamese Dream", "The Smashing Pumpkins", 1993], ["Ten", "Pearl Jam", 1991], ["Appetite for Destruction", "Guns N' Roses", 1987],
  ["Master of Puppets", "Metallica", 1986], ["Paranoid", "Black Sabbath", 1970], ["Hybrid Theory", "Linkin Park", 2000],
  ["Californication", "Red Hot Chili Peppers", 1999], ["Elephant", "The White Stripes", 2003], ["Vampire Weekend", "Vampire Weekend", 2008],
  ["Plastic Beach", "Gorillaz", 2010], ["Demon Days", "Gorillaz", 2005], ["Lust for Life", "Lana Del Rey", 2017], ["Born to Die", "Lana Del Rey", 2012],
  ["Norman Fucking Rockwell!", "Lana Del Rey", 2019], ["Nectar", "Joji", 2020], ["Bloom", "Beach House", 2012],
  ["Lover", "Taylor Swift", 2019], ["Thank U, Next", "Ariana Grande", 2019], ["Positions", "Ariana Grande", 2020],
  ["Scorpion", "Drake", 2018], ["Culture", "Migos", 2017], ["Utopia", "Travis Scott", 2023], ["Heroes & Villains", "Metro Boomin", 2022],
  ["Mr. Morale & the Big Steppers", "Kendrick Lamar", 2022], ["Malibu", "Anderson .Paak", 2016], ["Awaken, My Love!", "Childish Gambino", 2016],
  ["Coloring Book", "Chance the Rapper", 2016], ["Swimming", "Mac Miller", 2018], ["Circles", "Mac Miller", 2020],
];
export const ALBUMS: GameAlbum[] = POOL.map(([title, artist, year]) => ({ title, artist, year }));

/** Puzzle #1 was 30 October 2026, the day Undercover launched. Days follow the player's own calendar. */
const START = Date.UTC(2026, 9, 30);
export function puzzleNumber(d = new Date()) {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - START) / 864e5) + 1;
}

/** A fixed shuffle of the pool, so each album comes round once before any repeats. */
const ORDER = (() => {
  const order = ALBUMS.map((_, i) => i);
  let seed = 20261030;
  const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
})();
/** The album for a puzzle. `skip` moves past albums whose cover couldn't be found. */
export const albumFor = (n: number, skip = 0) => ALBUMS[ORDER[(((n - 1 + skip) % ORDER.length) + ORDER.length) % ORDER.length]];

export const isAnswer = (guess: string, a: GameAlbum) => norm(guess) === norm(a.title);

export const coverSrc = (a: GameAlbum) => `/api/cover/game-${hash(a.artist + a.title)}?v=3&s=500&a=${encodeURIComponent(a.artist)}&t=${encodeURIComponent(a.title)}`;

/** Suggestions for the guess box: titles or artists containing what was typed. */
export function suggest(q: string, exclude: string[] = []) {
  const t = norm(q);
  if (t.length < 2) return [];
  const out = new Set(exclude.map(norm));
  return ALBUMS.filter((a) => (norm(a.title).includes(t) || norm(a.artist).includes(t)) && !out.has(norm(a.title)))
    .sort((a, b) => Number(!norm(a.title).startsWith(t)) - Number(!norm(b.title).startsWith(t))).slice(0, 6);
}

// ---------------------------------------------------------------- the scrambled cover
/** How scrambled the cover is before each guess: grid size, share of tiles shuffled, and how far colours are turned. */
export const STAGES = [
  { grid: 8, shuffle: 1, hue: 0, palette: true },   // only the cover's main colours, in random squares
  { grid: 7, shuffle: 1, hue: 150 },
  { grid: 12, shuffle: 0.55, hue: 90 },
  { grid: 20, shuffle: 0.2, hue: 40 },
  { grid: 36, shuffle: 0, hue: 0 },
] as const;
export const MAX_GUESSES = STAGES.length;

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function rotateHue(r: number, g: number, b: number, deg: number): [number, number, number] {
  if (!deg) return [r, g, b];
  // Rotation around the grey axis in RGB space: keeps brightness, turns every colour round the wheel.
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), k = (1 - c) / 3, q = Math.sqrt(1 / 3) * s;
  const m = [c + k, k - q, k + q];
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return [f(r * m[0] + g * m[1] + b * m[2]), f(r * m[2] + g * m[0] + b * m[1]), f(r * m[1] + g * m[2] + b * m[0])];
}

/** The most common colours in a grid of pixels, by simple k-means, with how much of the cover each takes up. */
export function palette(px: Uint8ClampedArray, k = 6, seed = 1) {
  const n = px.length / 4, r = rng(seed);
  let centres = Array.from({ length: k }, () => { const i = Math.floor(r() * n) * 4; return [px[i], px[i + 1], px[i + 2]]; });
  const owner = new Int32Array(n);
  for (let iter = 0; iter < 8; iter++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (let p = 0; p < n; p++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = (px[p * 4] - centres[c][0]) ** 2 + (px[p * 4 + 1] - centres[c][1]) ** 2 + (px[p * 4 + 2] - centres[c][2]) ** 2; if (d < bd) { bd = d; best = c; } }
      owner[p] = best; const s = sums[best]; s[0] += px[p * 4]; s[1] += px[p * 4 + 1]; s[2] += px[p * 4 + 2]; s[3]++;
    }
    centres = sums.map((s, c) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centres[c]));
  }
  const counts = new Array(k).fill(0);
  for (let p = 0; p < n; p++) counts[owner[p]]++;
  return centres.map((c, i) => ({ rgb: c.map(Math.round) as [number, number, number], share: counts[i] / n })).filter((c) => c.share > 0).sort((a, b) => b.share - a.share);
}

/**
 * Scrambles a grid×grid sample of the cover (RGBA pixels) for one stage: turns the colours, then shuffles some of the
 * squares. The palette stage replaces the picture with its main colours in proportion, scattered at random.
 */
export function scramble(px: Uint8ClampedArray, grid: number, stage: (typeof STAGES)[number], seed: number) {
  const n = grid * grid, out = new Uint8ClampedArray(px.length), r = rng(seed);
  const cells: [number, number, number][] = [];
  if ("palette" in stage && stage.palette) {
    const pal = palette(px, 6, seed);
    pal.forEach((c, i) => { const count = i === pal.length - 1 ? n - cells.length : Math.round(c.share * n); for (let j = 0; j < count && cells.length < n; j++) cells.push(c.rgb); });
  } else {
    for (let i = 0; i < n; i++) cells.push(rotateHue(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], stage.hue));
  }
  // Shuffle a share of the squares among themselves; the rest stay where they belong.
  const moving = Array.from({ length: n }, (_, i) => i).filter(() => r() < stage.shuffle);
  const dest = [...moving];
  for (let i = dest.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [dest[i], dest[j]] = [dest[j], dest[i]]; }
  const at = Array.from({ length: n }, (_, i) => i);
  moving.forEach((from, i) => { at[dest[i]] = from; });
  for (let i = 0; i < n; i++) { const c = cells[at[i]]; out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255; }
  return out;
}

/** The share text: "listener Undercover #12 3/5" and a row of squares. */
export function shareText(n: number, marks: string, won: boolean) {
  const sq = marks.split("").map((m) => (m === "O" ? "🟩" : m === "S" ? "⬛" : "🟥")).join("") + "⬜".repeat(MAX_GUESSES - marks.length);
  return `listener Undercover #${n} ${won ? marks.length : "X"}/${MAX_GUESSES}\n${sq}`;
}
