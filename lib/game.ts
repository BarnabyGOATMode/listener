import { hash } from "./format";
import { norm } from "./match";

/**
 * Undercover: guess the album from its cover, blurred. Everyone gets the same album each day;
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

// ---------------------------------------------------------------- the blurred cover
/**
 * How blurred the cover is before each guess, as a share of its width. The first is so soft it's only the cover's
 * main colours washed together; each miss brings it further into focus.
 */
export const BLUR = [0.13, 0.085, 0.055, 0.032, 0.016] as const;
export const MAX_GUESSES = BLUR.length;

/** The share text: "listener Undercover #12 3/5" and a row of squares. */
export function shareText(n: number, marks: string, won: boolean) {
  const sq = marks.split("").map((m) => (m === "O" ? "🟩" : m === "S" ? "⬛" : "🟥")).join("") + "⬜".repeat(MAX_GUESSES - marks.length);
  return `listener Undercover #${n} ${won ? marks.length : "X"}/${MAX_GUESSES}\n${sq}`;
}
