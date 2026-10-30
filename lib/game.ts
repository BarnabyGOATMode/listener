import { hash } from "./format";
import { norm } from "./match";

/**
 * Undercover: guess the album from its cover, blurred. Everyone gets the same album each day;
 * each wrong guess (or skip) brings the cover a step closer to the real thing.
 */
export type GameAlbum = { title: string; artist: string; year: number; aka?: string[] };

/**
 * Five of the best-known albums from every year since 1956, when the LP (and the album cover) really took off.
 * Covers are found by title and artist, the same way album pages find them. A third entry lists other names people
 * know an album by ("Ziggy Stardust"), which also count as a right answer.
 */
type Entry = [title: string, artist: string, aka?: string[]];
const BY_YEAR: Record<number, Entry[]> = {
  1956: [["Elvis Presley", "Elvis Presley"], ["Songs for Swingin' Lovers!", "Frank Sinatra"], ["Calypso", "Harry Belafonte"], ["Ella and Louis", "Ella Fitzgerald & Louis Armstrong"], ["Ellington at Newport", "Duke Ellington"]],
  1957: [["Here's Little Richard", "Little Richard"], ["The \"Chirping\" Crickets", "The Crickets", ["Chirping Crickets"]], ["Birth of the Cool", "Miles Davis"], ["Saxophone Colossus", "Sonny Rollins"], ["Brilliant Corners", "Thelonious Monk"]],
  1958: [["Blue Train", "John Coltrane"], ["Somethin' Else", "Cannonball Adderley"], ["Come Fly with Me", "Frank Sinatra"], ["Lady in Satin", "Billie Holiday"], ["Milestones", "Miles Davis"]],
  1959: [["Kind of Blue", "Miles Davis"], ["Time Out", "The Dave Brubeck Quartet"], ["Mingus Ah Um", "Charles Mingus"], ["The Shape of Jazz to Come", "Ornette Coleman"], ["Moanin'", "Art Blakey & The Jazz Messengers"]],
  1960: [["Giant Steps", "John Coltrane"], ["Sketches of Spain", "Miles Davis"], ["Elvis Is Back!", "Elvis Presley"], ["Joan Baez", "Joan Baez"], ["Ella in Berlin: Mack the Knife", "Ella Fitzgerald", ["Ella in Berlin"]]],
  1961: [["Blue Hawaii", "Elvis Presley"], ["Judy at Carnegie Hall", "Judy Garland"], ["My Favorite Things", "John Coltrane"], ["Breakfast at Tiffany's", "Henry Mancini"], ["Sunday at the Village Vanguard", "Bill Evans Trio"]],
  1962: [["Modern Sounds in Country and Western Music", "Ray Charles", ["Modern Sounds"]], ["Bob Dylan", "Bob Dylan"], ["Jazz Samba", "Stan Getz & Charlie Byrd"], ["Surfin' Safari", "The Beach Boys"], ["Green Onions", "Booker T. & the M.G.'s"]],
  1963: [["Please Please Me", "The Beatles"], ["With the Beatles", "The Beatles"], ["The Freewheelin' Bob Dylan", "Bob Dylan", ["Freewheelin"]], ["Live at the Apollo", "James Brown"], ["A Christmas Gift for You from Phil Spector", "Phil Spector", ["A Christmas Gift for You"]]],
  1964: [["A Hard Day's Night", "The Beatles"], ["Getz/Gilberto", "Stan Getz & João Gilberto"], ["The Times They Are a-Changin'", "Bob Dylan"], ["The Rolling Stones", "The Rolling Stones"], ["Beatles for Sale", "The Beatles"]],
  1965: [["Highway 61 Revisited", "Bob Dylan"], ["Rubber Soul", "The Beatles"], ["Bringing It All Back Home", "Bob Dylan"], ["A Love Supreme", "John Coltrane"], ["Help!", "The Beatles"]],
  1966: [["Revolver", "The Beatles"], ["Pet Sounds", "The Beach Boys"], ["Blonde on Blonde", "Bob Dylan"], ["Aftermath", "The Rolling Stones"], ["Sounds of Silence", "Simon & Garfunkel"]],
  1967: [["Sgt. Pepper's Lonely Hearts Club Band", "The Beatles", ["Sgt Pepper", "Sgt Peppers"]], ["The Velvet Underground & Nico", "The Velvet Underground"], ["Are You Experienced", "The Jimi Hendrix Experience"], ["The Doors", "The Doors"], ["I Never Loved a Man the Way I Love You", "Aretha Franklin"]],
  1968: [["Electric Ladyland", "The Jimi Hendrix Experience"], ["Beggars Banquet", "The Rolling Stones"], ["Astral Weeks", "Van Morrison"], ["Bookends", "Simon & Garfunkel"], ["Cheap Thrills", "Big Brother & the Holding Company"]],
  1969: [["Abbey Road", "The Beatles"], ["Led Zeppelin II", "Led Zeppelin"], ["Let It Bleed", "The Rolling Stones"], ["In the Court of the Crimson King", "King Crimson"], ["Tommy", "The Who"]],
  1970: [["Bridge over Troubled Water", "Simon & Garfunkel"], ["Let It Be", "The Beatles"], ["Paranoid", "Black Sabbath"], ["After the Gold Rush", "Neil Young"], ["All Things Must Pass", "George Harrison"]],
  1971: [["What's Going On", "Marvin Gaye"], ["Led Zeppelin IV", "Led Zeppelin"], ["Blue", "Joni Mitchell"], ["Tapestry", "Carole King"], ["Sticky Fingers", "The Rolling Stones"]],
  1972: [["The Rise and Fall of Ziggy Stardust and the Spiders from Mars", "David Bowie", ["Ziggy Stardust"]], ["Exile on Main St.", "The Rolling Stones", ["Exile on Main Street"]], ["Harvest", "Neil Young"], ["Talking Book", "Stevie Wonder"], ["Transformer", "Lou Reed"]],
  1973: [["The Dark Side of the Moon", "Pink Floyd", ["Dark Side of the Moon"]], ["Houses of the Holy", "Led Zeppelin"], ["Innervisions", "Stevie Wonder"], ["Goodbye Yellow Brick Road", "Elton John"], ["Aladdin Sane", "David Bowie"]],
  1974: [["Court and Spark", "Joni Mitchell"], ["Autobahn", "Kraftwerk"], ["Sheer Heart Attack", "Queen"], ["Diamond Dogs", "David Bowie"], ["Natty Dread", "Bob Marley & The Wailers"]],
  1975: [["Born to Run", "Bruce Springsteen"], ["Wish You Were Here", "Pink Floyd"], ["Physical Graffiti", "Led Zeppelin"], ["A Night at the Opera", "Queen"], ["Blood on the Tracks", "Bob Dylan"]],
  1976: [["Songs in the Key of Life", "Stevie Wonder"], ["Hotel California", "Eagles"], ["Ramones", "Ramones"], ["Boston", "Boston"], ["Station to Station", "David Bowie"]],
  1977: [["Rumours", "Fleetwood Mac"], ["Never Mind the Bollocks, Here's the Sex Pistols", "Sex Pistols", ["Never Mind the Bollocks"]], ["Aja", "Steely Dan"], ["Exodus", "Bob Marley & The Wailers"], ["Low", "David Bowie"]],
  1978: [["Parallel Lines", "Blondie"], ["Some Girls", "The Rolling Stones"], ["Van Halen", "Van Halen"], ["The Cars", "The Cars"], ["Darkness on the Edge of Town", "Bruce Springsteen"]],
  1979: [["London Calling", "The Clash"], ["The Wall", "Pink Floyd"], ["Off the Wall", "Michael Jackson"], ["Unknown Pleasures", "Joy Division"], ["Highway to Hell", "AC/DC"]],
  1980: [["Back in Black", "AC/DC"], ["Remain in Light", "Talking Heads"], ["Closer", "Joy Division"], ["Double Fantasy", "John Lennon & Yoko Ono"], ["Scary Monsters (and Super Creeps)", "David Bowie", ["Scary Monsters"]]],
  1981: [["Tattoo You", "The Rolling Stones"], ["Moving Pictures", "Rush"], ["Escape", "Journey"], ["Dare", "The Human League"], ["Ghost in the Machine", "The Police"]],
  1982: [["Thriller", "Michael Jackson"], ["The Number of the Beast", "Iron Maiden"], ["1999", "Prince"], ["Rio", "Duran Duran"], ["Nebraska", "Bruce Springsteen"]],
  1983: [["Synchronicity", "The Police"], ["Murmur", "R.E.M."], ["Let's Dance", "David Bowie"], ["War", "U2"], ["Kill 'Em All", "Metallica"]],
  1984: [["Purple Rain", "Prince"], ["Born in the U.S.A.", "Bruce Springsteen", ["Born in the USA"]], ["Like a Virgin", "Madonna"], ["Ride the Lightning", "Metallica"], ["Private Dancer", "Tina Turner"]],
  1985: [["Hounds of Love", "Kate Bush"], ["Brothers in Arms", "Dire Straits"], ["Psychocandy", "The Jesus and Mary Chain"], ["Songs from the Big Chair", "Tears for Fears"], ["Rain Dogs", "Tom Waits"]],
  1986: [["Master of Puppets", "Metallica"], ["Graceland", "Paul Simon"], ["The Queen Is Dead", "The Smiths"], ["Licensed to Ill", "Beastie Boys"], ["Slippery When Wet", "Bon Jovi"]],
  1987: [["Appetite for Destruction", "Guns N' Roses"], ["The Joshua Tree", "U2"], ["Bad", "Michael Jackson"], ["Sign o' the Times", "Prince"], ["Paid in Full", "Eric B. & Rakim"]],
  1988: [["It Takes a Nation of Millions to Hold Us Back", "Public Enemy"], ["Straight Outta Compton", "N.W.A"], ["Daydream Nation", "Sonic Youth"], ["Surfer Rosa", "Pixies"], ["Tracy Chapman", "Tracy Chapman"]],
  1989: [["Doolittle", "Pixies"], ["Disintegration", "The Cure"], ["The Stone Roses", "The Stone Roses"], ["Paul's Boutique", "Beastie Boys"], ["Like a Prayer", "Madonna"]],
  1990: [["Violator", "Depeche Mode"], ["Fear of a Black Planet", "Public Enemy"], ["Goo", "Sonic Youth"], ["Mama Said Knock You Out", "LL Cool J"], ["Please Hammer, Don't Hurt 'Em", "MC Hammer"]],
  1991: [["Nevermind", "Nirvana"], ["Ten", "Pearl Jam"], ["Loveless", "My Bloody Valentine"], ["Achtung Baby", "U2"], ["Blood Sugar Sex Magik", "Red Hot Chili Peppers"]],
  1992: [["The Chronic", "Dr. Dre"], ["Automatic for the People", "R.E.M."], ["Rage Against the Machine", "Rage Against the Machine"], ["Dirt", "Alice in Chains"], ["Slanted and Enchanted", "Pavement"]],
  1993: [["In Utero", "Nirvana"], ["Enter the Wu-Tang (36 Chambers)", "Wu-Tang Clan", ["36 Chambers", "Enter the Wu-Tang"]], ["Siamese Dream", "The Smashing Pumpkins"], ["Debut", "Björk"], ["Doggystyle", "Snoop Doggy Dogg"]],
  1994: [["Illmatic", "Nas"], ["Ready to Die", "The Notorious B.I.G."], ["Dookie", "Green Day"], ["Definitely Maybe", "Oasis"], ["The Downward Spiral", "Nine Inch Nails"]],
  1995: [["(What's the Story) Morning Glory?", "Oasis", ["Morning Glory", "Whats the Story Morning Glory"]], ["The Bends", "Radiohead"], ["Jagged Little Pill", "Alanis Morissette"], ["Mellon Collie and the Infinite Sadness", "The Smashing Pumpkins", ["Mellon Collie"]], ["Different Class", "Pulp"]],
  1996: [["The Score", "Fugees"], ["Reasonable Doubt", "Jay-Z"], ["Odelay", "Beck"], ["Endtroducing.....", "DJ Shadow"], ["Spice", "Spice Girls"]],
  1997: [["OK Computer", "Radiohead"], ["Homework", "Daft Punk"], ["Life After Death", "The Notorious B.I.G."], ["The Fat of the Land", "The Prodigy"], ["Urban Hymns", "The Verve"]],
  1998: [["The Miseducation of Lauryn Hill", "Lauryn Hill", ["Miseducation"]], ["Mezzanine", "Massive Attack"], ["Aquemini", "OutKast"], ["In the Aeroplane Over the Sea", "Neutral Milk Hotel"], ["Ray of Light", "Madonna"]],
  1999: [["Californication", "Red Hot Chili Peppers"], ["The Slim Shady LP", "Eminem"], ["Play", "Moby"], ["...Baby One More Time", "Britney Spears", ["Baby One More Time"]], ["Things Fall Apart", "The Roots"]],
  2000: [["Kid A", "Radiohead"], ["The Marshall Mathers LP", "Eminem"], ["Parachutes", "Coldplay"], ["Hybrid Theory", "Linkin Park"], ["Stankonia", "OutKast"]],
  2001: [["Is This It", "The Strokes"], ["Discovery", "Daft Punk"], ["The Blueprint", "Jay-Z"], ["White Blood Cells", "The White Stripes"], ["Songs in A Minor", "Alicia Keys"]],
  2002: [["A Rush of Blood to the Head", "Coldplay"], ["The Eminem Show", "Eminem"], ["Yankee Hotel Foxtrot", "Wilco"], ["Come Away with Me", "Norah Jones"], ["Songs for the Deaf", "Queens of the Stone Age"]],
  2003: [["Elephant", "The White Stripes"], ["Speakerboxxx/The Love Below", "OutKast", ["Speakerboxxx", "The Love Below"]], ["Get Rich or Die Tryin'", "50 Cent"], ["Dangerously in Love", "Beyoncé"], ["Fever to Tell", "Yeah Yeah Yeahs"]],
  2004: [["The College Dropout", "Kanye West"], ["Funeral", "Arcade Fire"], ["American Idiot", "Green Day"], ["Hot Fuss", "The Killers"], ["Madvillainy", "Madvillain"]],
  2005: [["Late Registration", "Kanye West"], ["Demon Days", "Gorillaz"], ["Confessions on a Dance Floor", "Madonna"], ["Silent Alarm", "Bloc Party"], ["X&Y", "Coldplay"]],
  2006: [["Back to Black", "Amy Winehouse"], ["The Black Parade", "My Chemical Romance"], ["Whatever People Say I Am, That's What I'm Not", "Arctic Monkeys", ["Whatever People Say I Am"]], ["FutureSex/LoveSounds", "Justin Timberlake", ["FutureSex LoveSounds"]], ["St. Elsewhere", "Gnarls Barkley"]],
  2007: [["In Rainbows", "Radiohead"], ["Graduation", "Kanye West"], ["Good Girl Gone Bad", "Rihanna"], ["For Emma, Forever Ago", "Bon Iver"], ["Favourite Worst Nightmare", "Arctic Monkeys"]],
  2008: [["Fleet Foxes", "Fleet Foxes"], ["Vampire Weekend", "Vampire Weekend"], ["808s & Heartbreak", "Kanye West"], ["Tha Carter III", "Lil Wayne"], ["The Fame", "Lady Gaga"]],
  2009: [["xx", "The xx"], ["Merriweather Post Pavilion", "Animal Collective"], ["Wolfgang Amadeus Phoenix", "Phoenix"], ["The Fame Monster", "Lady Gaga"], ["The Blueprint 3", "Jay-Z"]],
  2010: [["My Beautiful Dark Twisted Fantasy", "Kanye West"], ["The Suburbs", "Arcade Fire"], ["Teenage Dream", "Katy Perry"], ["Plastic Beach", "Gorillaz"], ["This Is Happening", "LCD Soundsystem"]],
  2011: [["21", "Adele"], ["Take Care", "Drake"], ["Watch the Throne", "Jay-Z & Kanye West"], ["Bon Iver, Bon Iver", "Bon Iver"], ["Born This Way", "Lady Gaga"]],
  2012: [["Channel Orange", "Frank Ocean"], ["good kid, m.A.A.d city", "Kendrick Lamar", ["good kid maad city"]], ["Born to Die", "Lana Del Rey"], ["Red", "Taylor Swift"], ["Lonerism", "Tame Impala"]],
  2013: [["AM", "Arctic Monkeys"], ["Random Access Memories", "Daft Punk"], ["Yeezus", "Kanye West"], ["Pure Heroine", "Lorde"], ["Modern Vampires of the City", "Vampire Weekend"]],
  2014: [["1989", "Taylor Swift"], ["x", "Ed Sheeran", ["Multiply"]], ["2014 Forest Hills Drive", "J. Cole"], ["Run the Jewels 2", "Run the Jewels"], ["Lost in the Dream", "The War on Drugs"]],
  2015: [["To Pimp a Butterfly", "Kendrick Lamar"], ["Currents", "Tame Impala"], ["25", "Adele"], ["Carrie & Lowell", "Sufjan Stevens"], ["Beauty Behind the Madness", "The Weeknd"]],
  2016: [["Blonde", "Frank Ocean"], ["Lemonade", "Beyoncé"], ["Blackstar", "David Bowie"], ["A Moon Shaped Pool", "Radiohead"], ["The Life of Pablo", "Kanye West"]],
  2017: [["DAMN.", "Kendrick Lamar"], ["Ctrl", "SZA"], ["Melodrama", "Lorde"], ["Flower Boy", "Tyler, the Creator"], ["Reputation", "Taylor Swift"]],
  2018: [["Astroworld", "Travis Scott"], ["Golden Hour", "Kacey Musgraves"], ["Invasion of Privacy", "Cardi B"], ["Swimming", "Mac Miller"], ["Dirty Computer", "Janelle Monáe"]],
  2019: [["Igor", "Tyler, the Creator"], ["When We All Fall Asleep, Where Do We Go?", "Billie Eilish"], ["Norman Fucking Rockwell!", "Lana Del Rey", ["NFR"]], ["Fine Line", "Harry Styles"], ["Thank U, Next", "Ariana Grande"]],
  2020: [["After Hours", "The Weeknd"], ["Folklore", "Taylor Swift"], ["Future Nostalgia", "Dua Lipa"], ["Punisher", "Phoebe Bridgers"], ["Fetch the Bolt Cutters", "Fiona Apple"]],
  2021: [["Sour", "Olivia Rodrigo"], ["Call Me If You Get Lost", "Tyler, the Creator"], ["Donda", "Kanye West"], ["30", "Adele"], ["Happier Than Ever", "Billie Eilish"]],
  2022: [["Renaissance", "Beyoncé"], ["Un Verano Sin Ti", "Bad Bunny"], ["Midnights", "Taylor Swift"], ["SOS", "SZA"], ["Harry's House", "Harry Styles"]],
  2023: [["The Rise and Fall of a Midwest Princess", "Chappell Roan", ["Midwest Princess"]], ["Guts", "Olivia Rodrigo"], ["Utopia", "Travis Scott"], ["Did You Know That There's a Tunnel Under Ocean Blvd", "Lana Del Rey", ["Ocean Blvd"]], ["The Record", "boygenius"]],
  2024: [["Brat", "Charli XCX"], ["Short n' Sweet", "Sabrina Carpenter"], ["Hit Me Hard and Soft", "Billie Eilish"], ["GNX", "Kendrick Lamar"], ["The Tortured Poets Department", "Taylor Swift", ["TTPD"]]],
  2025: [["Debí Tirar Más Fotos", "Bad Bunny"], ["Mayhem", "Lady Gaga"], ["Man's Best Friend", "Sabrina Carpenter"], ["The Life of a Showgirl", "Taylor Swift"], ["Virgin", "Lorde"]],
};
export const ALBUMS: GameAlbum[] = Object.entries(BY_YEAR).flatMap(([year, list]) => list.map(([title, artist, aka]) => ({ title, artist, year: Number(year), aka })));

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
export function albumFor(n: number, skip = 0): GameAlbum {
  // Puzzle #1 was played on the earlier album list, so it keeps its answer.
  if (n === 1 && skip === 0) return ALBUMS.find((a) => a.title === "Born to Die")!;
  return ALBUMS[ORDER[(((n - 1 + skip) % ORDER.length) + ORDER.length) % ORDER.length]];
}

export const isAnswer = (guess: string, a: GameAlbum) => !!norm(guess) && [a.title, ...(a.aka ?? [])].some((t) => norm(t) === norm(guess));

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
export const BLUR = [0.08, 0.052, 0.034, 0.02, 0.01] as const;
export const MAX_GUESSES = BLUR.length;

/** The share text: "listener Undercover #12 3/5" and a row of squares. */
export function shareText(n: number, marks: string, won: boolean) {
  const sq = marks.split("").map((m) => (m === "O" ? "🟩" : m === "S" ? "⬛" : "🟥")).join("") + "⬜".repeat(MAX_GUESSES - marks.length);
  return `listener Undercover #${n} ${won ? marks.length : "X"}/${MAX_GUESSES}\n${sq}`;
}
