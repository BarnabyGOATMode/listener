export type Look = "light" | "dark" | "system";

export type Profile = {
  id: string;
  handle: string;
  name: string;
  bio: string;
  kind: "listener" | "artist";
  genre: string;
  location: string;
  favorites: string[];
  look: Look;
  notif_seen_at: string;
  created_at: string;
};

export type Track = { title: string; length_ms?: number | null };

export type Album = {
  id: string;
  source: "musicbrainz" | "release" | "custom";
  title: string;
  artist: string;
  year: number | null;
  genre: string;
  cover_url: string | null;
  tracks: Track[];
  owner_id: string | null;
  artist_mbid?: string | null;
  created_at: string;
};

export type Log = {
  id: string;
  user_id: string;
  album_id: string;
  rating: number | null;
  liked: boolean;
  review: string;
  listened_on: string | null;
  track_ratings: Record<string, number>;
  use_average: boolean;
  posted_at: string;
  updated_at: string;
};

export type SongReview = {
  id: string;
  user_id: string;
  album_id: string;
  track_index: number;
  rating: number | null;
  liked: boolean;
  review: string;
  listened_on: string | null;
  posted_at: string;
  updated_at: string;
};

export type TargetType = "log" | "song" | "release";

export type Comment = { id: string; user_id: string; target_type: TargetType; target_id: string; body: string; created_at: string };

export type Notification = {
  id: string;
  recipient_id: string;
  actor_id: string;
  kind: "like" | "comment" | "follow" | "rated";
  target_type: TargetType | null;
  target_id: string | null;
  album_id: string | null;
  track_index: number | null;
  excerpt: string | null;
  created_at: string;
};

/** A search result before it is cached locally. */
export type SearchHit = { id: string; title: string; artist: string; artist_id?: string | null; year: number | null; type: string; cover_url: string | null; local?: boolean };

export type ArtistPage = {
  id: string;
  name: string;
  kind: string;
  area: string;
  disambiguation: string;
  active: string;
  genres: string[];
  releases: { id: string; title: string; year: number | null; type: string; shelf: "album" | "ep" | "single" | "other"; cover_url: string }[];
};
