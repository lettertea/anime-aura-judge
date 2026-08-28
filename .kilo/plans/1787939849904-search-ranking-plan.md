# Search Result Quality & Ranking Improvement Plan

## Context

The search feature (`src/services/animeApi.js` + `src/components/GridSelector.jsx`) clones `komikoai.com/anime-aura`, which queries AniList GraphQL with `sort: POPULARITY_DESC` (popularity-first). The clone currently uses `sort: SEARCH_MATCH` (relevance-first) with a Kitsu→Jikan fallback chain.

Reference HAR query (perPage 8, POPULARITY_DESC): fetches `id, title{english romaji}, coverImage{large extraLarge}, seasonYear, genres, averageScore, popularity`.

Goal: improve on the reference **within the scope of result quality & ranking only** — keep implementation straightforward and pragmatic without over-engineering.

## Decisions

- **Ranking:** Hybrid. Fetch AniList with `SEARCH_MATCH` and `perPage: 12` (bigger pool), then re-rank client-side with a deterministic blend of search-match position (relevance) and log-normalized popularity, weighted 60/40.
- **Filters:** No origin or adult restrictions. Allow global animations (donghua, manhwa adaptations, etc.) and avoid complex filter logic across providers.
- **Schema enrichment:** Extend the normalized anime object with `format`, `episodes`, `status`, `popularity`, `favourites` (best-effort from each provider). Backward-compatible — existing fields unchanged.
- **Fallback chain:** Keep AniList → Kitsu → Jikan. Re-ranking applies only to the AniList path (fallback providers return their own relevance-ordered results). All providers return up to 12 results (`perPage: 12`, `page[limit]=12`, `limit=12`).
- **Display count:** All 12 fetched results render in the dropdown (already scrolls, `max-h-[380px]`). Do not modify the dropdown component.
- **Score engine / LLM / App.jsx:** untouched.

## Tasks

### 1. `src/services/animeApi.js` — AniList query and enrichment

- Extend `ANILIST_QUERY`:
  - Change `perPage: 8` → `perPage: 12` (keep `sort: SEARCH_MATCH`, `type: ANIME`).
  - Add fields: `format`, `status`, `episodes`, `popularity`, `favourites`.
- Extend `searchAniList` mapping to emit the new fields:
  - `format`, `status`, `episodes` (passthrough), `popularity`, `favourites` (passthrough, `?? null`).
  - Keep `mal_id`, `title`, `english_title`, `romaji_title`, `images`, `genres`, `year`, `score` exactly as today.

### 2. `src/services/animeApi.js` — deterministic hybrid re-rank

- Add pure exported function `rankByRelevanceAndPopularity(mediaList)`:
  - Input: normalized list in SEARCH_MATCH order (index `i`, 0-based, length `N`).
  - Guard: if `!Array.isArray(mediaList) || mediaList.length < 2`, return `mediaList || []`.
  - `maxP = max(popularity ?? 0)` across the list.
  - `logMaxP = maxP > 0 ? Math.log2(1 + maxP) : 0`
  - For each item `i`:
    - `relevance = 1 - i / (N - 1)`
    - `popNorm = logMaxP > 0 ? Math.log2(1 + (item.popularity ?? 0)) / logMaxP : 0`
    - `blend = 0.6 * relevance + 0.4 * popNorm`
  - Sort a shallow copy `[...mediaList]` descending by `blend`; tie-break by `popularity` desc, then `mal_id` asc (stable, fully deterministic).
- Apply inside `searchAniList` before returning.
- Add a brief comment documenting the formula.

### 3. `src/services/animeApi.js` — fallback provider parity (12 results limit + enrichment)

- `searchKitsu`: bump `page[limit]=8` → `12`; map new fields best-effort:
  - `format: attr.subtype` (e.g. `TV`, `movie`, `ona`), `status: attr.status`,
  - `episodes: attr.episodeCount ?? null`, `popularity: attr.userCount ?? null`, `favourites: attr.favoritesCount ?? null`.
- `searchJikan`: bump `limit=8` → `12`; map new fields:
  - `format: a.type`, `status: a.status`, `episodes: a.episodes ?? null`, `popularity: a.members ?? null`, `favourites: a.favorites ?? null`.
- Union types normalized to the same keys; nulls allowed.

### 4. Update the normalized contract comment block

- Extend the `NormalizedAnime` comment in `animeApi.js` with the five new optional fields.

## Risks & Notes

- **Rate limit:** `perPage: 12` vs `8` increases payload minimally; well within AniList's 30 req/min limit.
- **Kitsu `mal_id`:** unchanged — `parseInt(item.id)` (Kitsu ID), session-consistent for scoring.
- **Re-rank edge cases:** `maxP <= 0` or all-null popularity falls back smoothly to pure SEARCH_MATCH order without `NaN` issues; `N < 2` short-circuits.
- **Global animations:** Global titles (e.g., *Link Click*, *Solo Leveling*, donghua) will appear without country-filter restrictions.
- **Security note (out of scope, flag only):** `.env.example` contains a real-looking `sk-or-v1-...` OpenRouter key committed to the repo. Recommend rotating it and stripping it from `.env.example` (use a placeholder).

## Validation

1. `npm run build` — must pass (Vite build is the gate).
2. Manual, in `npm run dev`:
   - Fuzzy partial query (e.g. `blue`, `solo`) — popular shows (BLUE LOCK, Solo Leveling) rise to the top; exact matches remain near the top.
   - Global animation query (e.g. `link click`, `scissor seven`) — returns valid results without country filtering.
   - Fallback offline / garbage query — falls to Kitsu/Jikan cleanly.
   - Reselect flow and `Already Picked` badge behave properly using `mal_id`.