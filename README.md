# listener

Keep a diary of every album you hear. Rate records and individual songs, write reviews, follow friends, and discover new music. Artists can publish their own releases.

Built with Next.js, Supabase (database and logins) and MusicBrainz (album data, with covers from the Cover Art Archive). Hosted on Vercel.

## Setting up

1. **Database.** In Supabase, open **SQL Editor → New query**, paste the contents of `supabase/migrations/0001_init.sql`, and run it once.
2. **Logins.** In Supabase, go to **Authentication → URL Configuration**. Set **Site URL** to your live address (e.g. `https://listener.vercel.app`) and add `https://YOUR-SITE/auth/callback` under **Redirect URLs**.
3. **Environment variables.** Copy `.env.example` to `.env.local` for local work, or add the same variables in Vercel under **Project → Settings → Environment Variables**.
4. **Run locally:** `npm install`, then `npm run dev`.

## Where things live

- `app/`: pages for the feed (`/`), `discover`, `albums`, `album/[id]`, `album/[id]/song/[n]`, `u/[handle]`, and sign-in and account pages
- `app/api/`: server routes for MusicBrainz search, album caching and account deletion
- `components/`: masthead, posts, star ratings, Listen now, profile form
- `lib/recommend.ts`: the Discover recommendation logic (a simple stand-in, meant to be replaced)
- `supabase/migrations/`: database tables and access rules
