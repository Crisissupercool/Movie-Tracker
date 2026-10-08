# Recs site

Plain HTML/JS site: what I'm watching/playing, what I'm recommending, what's up next, and a moderated form where visitors can send me recs.

- **Your data**: `data/library.json` (edit it, commit, push, Vercel redeploys).
- **Metadata** (poster, year, seasons): fetched from TMDB (movies/TV) and IGDB (games) at build time, so you never type it.
- **Visitor recs**: stored in Supabase as `pending`. Only the ones you approve in `/admin` appear on the site.
- **Hosting**: Vercel serves both the static site and the `/api` functions (one domain, no CORS). GitHub just holds the repo.

## One-time setup

1. **Keys**
   - TMDB: https://www.themoviedb.org/settings/api (free)
   - IGDB (games): sign in at https://dev.twitch.tv/console with a Twitch account (turn on 2FA, it's required), *Applications -> Register Your Application*. Name: anything unique. OAuth Redirect URL: `http://localhost`. Category: Website Integration. Client Type: Confidential. Then *Manage -> New Secret*. You need the **Client ID** and the **Client Secret**.
2. **Supabase**: create a free project, open *SQL Editor*, paste `supabase.sql`, run it. Copy the project URL and the `service_role` key (*Project settings -> API*).
3. **GitHub**: push this folder to a new repo.
4. **Vercel**: *Add New -> Project -> import the repo*. Framework preset: **Other** (settings come from `vercel.json`). Add these environment variables:

   | Name | Value |
   |---|---|
   | `TMDB_API_KEY` | your TMDB key |
   | `IGDB_CLIENT_ID` | Twitch Client ID |
   | `IGDB_CLIENT_SECRET` | Twitch Client Secret |
   | `SUPABASE_URL` | project URL |
   | `SUPABASE_SERVICE_KEY` | service_role key (never in frontend code) |
   | `ADMIN_TOKEN` | long random string, 16+ chars (you type it into `/admin`) |
   | `IP_SALT` | any random string |
   | `DISCORD_WEBHOOK_URL` | optional, pings you on new recs |
   | `TURNSTILE_SECRET` | optional, see below |

5. Deploy. Open `https://<your-site>/admin`, enter the token, approve or reject recs.

## Editing your lists

`data/library.json` is an array. **Order = display order**, so put the newest first. Fields:

| Field | Meaning |
|---|---|
| `type` | `tv`, `movie` or `game` (required) |
| `status` | `now` (watching/playing), `finished`, or `next` (My list) (required) |
| `query` / `id` / `title` | `query` is searched on TMDB/IGDB. Pin the exact entry with `id` once you know it. `title` overrides the displayed name. At least one is required. |
| `year` | helps pick the right match for a `query` |
| `rating` | 0-10, leave out for "not rated yet" |
| `recommended` | `true` puts it in the Recommendations section |
| `replay` | `true` shows a Replay badge |
| `note` | free text, e.g. `"s2 ep3"` or `"Next season in july 2027"` |
| `platform` | e.g. `"Pc"`, `"Playstation"` |
| `review` | text for the detail view (blank line = new paragraph) |
| `screenshots` | list of image paths, e.g. `["images/control-resonant/01.webp"]` |

**Finding the right ID:** the build prints `resolved "X" -> ... id 123` for every entry without an `id`. You can also run `node scripts/find.mjs movie "Children of Men" 2006`.

**Screenshots:** put them in `public/images/<name>/`, compress to WebP first (https://squoosh.app), and reference them as above. Commit and push.

## Run locally

```bash
cp .env.example .env     # fill in keys
node scripts/build.mjs   # generates public/data/library.json
npx vercel dev           # serves the site and /api together
```

Without Supabase keys the site still works, only Browse and the form show errors.

## Spam protection

Built in: honeypot field, 5 recs per visitor per hour (hashed IP), a cap of 200 pending recs, and everything is `pending` until you approve it. For more, create a free Cloudflare Turnstile widget, put the **site key** in `public/config.js` and the **secret** in `TURNSTILE_SECRET`.

## Notes

- The "Combine" dot merges the three categories into one list; the 📺🎬🎮 buttons then put one category first. It starts merged on phones.
- Admin lives at `/admin` (not linked anywhere, `noindex`). Anyone with the token can moderate, so keep it long and private.
- The footer carries the required TMDB/IGDB attribution, keep it.
