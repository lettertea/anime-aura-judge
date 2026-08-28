# Reviewer Prompt — Independent Review of the Anime Search Ranking Plan

You are an experienced senior front-end engineer and reviewer. Your task is a **READ-ONLY technical review** of the plan below. Do **not** implement source changes, do **not** run mutating commands, and do **not** commit anything. You may, if convenient, open files in the repository at `C:\Users\Thomas\Desktop\code\anime-aura` to verify your reasoning, but the prompt below is designed to be fully self-contained.

Produce a structured review: verdict (`APPROVE` / `APPROVE WITH CHANGES` / `REJECT`), per-task findings, missed risks, and a concrete list of corrections at code level if you find any.

---

## 1. Project background (what this app is)

`anime-aura` is a React 18 + Vite + Tailwind single-page app ("Anime Aura Judge"). The user picks 9 anime into a 3x3 grid using a live search autocomplete, then the app computes a deterministic "aura score" client-side and asks an LLM (OpenRouter) for a roast verdict, rendering an exportable PNG card.

Key architectural facts you must hold in mind:

- **Search service**: `src/services/animeApi.js` is a multi-provider cascade: **AniList** (GraphQL, primary) → **Kitsu** (REST, fallback) → **Jikan/MyAnimeList** (REST, fallback). All providers normalize into the same shape (`mal_id`, `title`, `english_title`, `romaji_title`, `images.jpg.{image_url,large_image_url,small_image_url}`, `genres[]`, `year`, `score`).
- **Search UI**: `src/components/GridSelector.jsx` runs a 300ms debounced search with `AbortController` cancellation, renders up to N results in a scrollable autocomplete dropdown (`max-h-[380px]`, `overflow-y-auto`), supports keyboard nav (ArrowUp/Down, Enter, Escape) and clicks. Results are consumed **in returned order** (first result is highlighted/selected by default). `mal_id` is used as the React `key`, for the "Already Picked" badge (`slots.some((s, i) => s && s.mal_id === selected.mal_id && i !== activeSlot)`), and for the "pick" selection.
- **Scoring engine**: `src/utils/scoring.js` — purely deterministic; at judge time it **sorts the 9 picked anime by `mal_id`** internally, so search-result *order* never affects scores (only *which* anime are picked matters).
- **Verdict LLM**: `src/services/gemini.js` calls OpenRouter with the 9 titles (no dependency on search).
- **Rate limit**: the AniList HAR response headers include `x-ratelimit-limit: 30` (requests per minute) and `x-ratelimit-remaining`. This applies to the whole AniList API.

## 2. The reference being cloned (from a real HAR capture)

The original site `komikoai.com/anime-aura` performs **one** AniList GraphQL POST per search:

```graphql
query ($search: String) {
  Page(perPage: 8) {
    media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
      id
      title { english romaji }
      coverImage { large extraLarge }
      seasonYear
      genres
      averageScore
      popularity
    }
  }
}
```

So the reference is **popularity-first** (`POPULARITY_DESC`) and does not filter adult content or country of origin. The clone improves on this by using `SEARCH_MATCH` (relevance-first), fetching `idMal`, native titles, and `startDate`, and adding Kitsu/Jikan fallbacks.

## 3. THE PLAN TO REVIEW (verbatim)

---

# Search Result Quality & Ranking Improvement Plan

## Context

The search feature (`src/services/animeApi.js` + `src/components/GridSelector.jsx`) clones `komikoai.com/anime-aura`, which queries AniList GraphQL with `sort: POPULARITY_DESC` (popularity-first). The clone currently uses `sort: SEARCH_MATCH` (relevance-first) with a Kitsu→Jikan fallback chain.

Reference HAR query (perPage 8, POPULARITY_DESC): fetches `id, title{english romaji}, coverImage{large extraLarge}, seasonYear, genres, averageScore, popularity`.

Goal: improve on the reference **within the scope of result quality & ranking only** — no caching, empty-state presets, dropdown UI polish, or CORS hardening (explicitly out of scope).

## Decisions

- **Ranking:** Hybrid. Fetch AniList with `SEARCH_MATCH` and `perPage: 12` (bigger pool), then re-rank client-side with a deterministic blend of search-match position (relevance) and log-normalized popularity, weighted ~60/40.
- **Filters:** `isAdult: false` and `countryOfOrigin: "JP"` in the AniList query. Jikan fallback gets `&sfw=true`. Kitsu fallback keeps existing params (limit bumped to 12).
- **Schema enrichment:** Extend the normalized anime object with `format`, `episodes`, `status`, `popularity`, `favourites` (best-effort from each provider). Backward-compatible — existing fields unchanged.
- **Fallback chain:** Keep AniList → Kitsu → Jikan. Re-ranking applies only to the AniList path (fallback providers return their own relevance-ordered results).
- **Display count:** All 12 fetched results render in the dropdown (already scrolls, `max-h-[380px]`). Do not modify the dropdown component.
- **Score engine / LLM / App.jsx:** untouched.

## Tasks

### 1. `src/services/animeApi.js` — AniList query, filters, enrichment

- Extend `ANILIST_QUERY`:
  - Add fixed args to `media(...)`: `isAdult: false`, `countryOfOrigin: "JP"`.
  - Change `perPage: 8` → `perPage: 12` (keep `sort: SEARCH_MATCH`, `type: ANIME`).
  - Add fields: `format`, `status`, `episodes`, `popularity`, `favourites`.
- Extend `searchAniList` mapping to emit the new fields:
  - `format`, `status`, `episodes` (passthrough), `popularity`, `favourites` (passthrough, `?? null`).
  - Keep `mal_id`, `title`, `english_title`, `romaji_title`, `images`, `genres`, `year`, `score` exactly as today.

### 2. `src/services/animeApi.js` — deterministic hybrid re-rank

- Add pure exported function `rankByRelevanceAndPopularity(mediaList)`:
  - Input: normalized list in SEARCH_MATCH order (index `i`, 0-based, length `N`).
  - `maxP = max(popularity ?? 0)` across the list (guard `N < 2` → return list unchanged).
  - `relevance(i) = 1 - i / max(1, N - 1)`
  - `popNorm(p) = popularity == null ? 0 : log2(1 + p) / log2(1 + maxP)`
  - `blend(i, p) = 0.6 * relevance(i) + 0.5 state 0.4 * popNorm(p)` — (NOTE: this line is intentionally garbled; if you are reviewing, flag whether it should read `0.6 * relevance(i) + 0.4 * popNorm(p)` given the stated 60/40 weight.)
  - Sort descending by `blend`; tie-break by `popularity` desc, then `mal_id` asc (stable, fully deterministic).
- Apply inside `searchAniList` (after mapping, before returning) — or in `searchAnime` only for the AniList path (preferred: inside `searchAniList` so fallbacks are untouched).
- Add a brief comment documenting the formula. No other behavior change.

### 3. `src/services/animeApi.js` — fallback provider parity

- `searchKitsu`: bump `page[limit]=8` → `12`; map new fields best-effort:
  - `format: attr.subtype` (e.g. `TV`, `movie`, `ona`), `status: attr.status`,
  - `episodes: attr.episodeCount ?? null`, `popularity: attr.userCount ?? null`, `favourites: attr.favoritesCount ?? null`.
- `searchJikan`: add `&sfw=true` to URL; map new fields:
  - `format: a.type`, `status: a.status`, `episodes: a.episodes ?? null`, `popularity: a.members ?? null`, `favourites: a.favorites ?? null`.
- Union types normalized to the same keys; nulls allowed.

### 4. Update the normalized contract comment block

- Extend the `NormalizedAnime` comment in `animeApi.js` with the five new optional fields.

## Risks & Notes

- **Rate limit:** perPage 12 vs 8 increases per-request payload slightly; fine under AniList's 30 req/min burst limit. (Caching is out of scope but is the follow-up if rate limits bite.)
- **Kitsu `mal_id`:** unchanged — `parseInt(item.id)` (Kitsu ID), never used as a true MAL ID; session-consistent so scoring is unaffected.
- **Re-rank edge cases:** all-null popularity → falls back to pure SEARCH_MATCH order; `N < 2` short-circuits; mixed-null popularity ranks those items by relevance.
- **Security note (out of scope, flag only):** `.env.example` contains a real-looking `sk-or-v1-...` OpenRouter key committed to the repo. Recommend rotating it and stripping it from `.env.example` (use a placeholder).

## Validation

1. `npm run build` — must pass (no TS/lint configured; build is the gate).
2. Manual, in `npm run dev`:
   - Fuzzy partial query (e.g. `blue`, `solo`) — popular shows (BLUE LOCK, Solo Leveling) rise to the top; exact-match titles (Blue Exorcist) remain near the top.
   - Query that returns nothing → falls to Kitsu/Jikan as before (test with devtools offline or a garbage term).
   - `isAdult` check: a previously-leaking query must not return hentai/adult titles.
   - Non-JP origin check: donghua/K-drama titles no longer appear.
   - Reselect flow and `Already Picked` badge still behave (rely on `mal_id`).

---

<= END OF PLAN =>

## 4. Current code the plan modifies (verbatim, `src/services/animeApi.js`)

```js
// Unified Anime Search Service with reliable fallbacks (AniList -> Kitsu -> Jikan)

const ANILIST_URL = 'https://graphql.anilist.co'
const KITSU_URL = 'https://kitsu.io/api/edge/anime'
const JIKAN_URL = 'https://api.jikan.moe/v4/anime'

const ANILIST_QUERY = `
  query ($search: String) {
    Page(page: 1, perPage: 8) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        genres
        seasonYear
        startDate {
          year
        }
        averageScore
        coverImage {
          extraLarge
          large
          medium
        }
      }
    }
  }
`

async function searchAniList(query, signal) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: query } }),
    signal,
  })
  if (!res.ok) throw new Error(`AniList error ${res.status}`)
  const json = await res.json()
  const mediaList = json.data?.Page?.media || []
  return mediaList.map((m) => {
    const title = m.title?.english || m.title?.romaji || m.title?.native || 'Unknown Title'
    const year = m.seasonYear || m.startDate?.year || null
    const genres = (m.genres || []).map((name) => ({ name }))
    const imageUrl = m.coverImage?.large || m.coverImage?.medium
    const largeImageUrl = m.coverImage?.extraLarge || m.coverImage?.large || imageUrl
    const smallImageUrl = m.coverImage?.medium || imageUrl
    return {
      mal_id: m.idMal || m.id,
      title,
      english_title: m.title?.english,
      romaji_title: m.title?.romaji,
      images: { jpg: { image_url: imageUrl, large_image_url: largeImageUrl, small_image_url: smallImageUrl } },
      genres,
      year,
      score: m.averageScore ? Number((m.averageScore / 10).toFixed(2)) : null,
    }
  })
}

async function searchKitsu(query, signal) {
  const url = `${KITSU_URL}?filter[text]=${encodeURIComponent(query)}&page[limit]=8`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Kitsu error ${res.status}`)
  const json = await res.json()
  const data = json.data || []
  return data.map((item) => {
    const attr = item.attributes || {}
    const title = attr.canonicalTitle || attr.titles?.en || attr.titles?.en_jp || 'Unknown Title'
    const year = attr.startDate ? parseInt(attr.startDate.slice(0, 4), 10) : null
    const imageUrl = attr.posterImage?.medium || attr.posterImage?.small
    const largeImageUrl = attr.posterImage?.large || attr.posterImage?.original || imageUrl
    return {
      mal_id: parseInt(item.id, 10) || Math.floor(Math.random() * 100000),
      title,
      images: { jpg: { image_url: imageUrl, large_image_url: largeImageUrl, small_image_url: imageUrl } },
      genres: [{ name: attr.subtype || 'Anime' }],
      year,
      score: attr.averageRating ? Number((parseFloat(attr.averageRating) / 10).toFixed(2)) : null,
    }
  })
}

async function searchJikan(query, signal) {
  const url = `${JIKAN_URL}?q=${encodeURIComponent(query)}&limit=8`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Jikan error ${res.status}`)
  const json = await res.json()
  return (json.data || []).map((a) => ({
    mal_id: a.mal_id,
    title: a.title_english || a.title,
    images: a.images,
    genres: a.genres || [],
    year: a.year || (a.aired?.from ? parseInt(a.aired.from.slice(0, 4), 10) : null),
    score: a.score,
  }))
}

export async function searchAnime(query, signal) {
  if (!query || !query.trim()) return []
  const cleanQuery = query.trim()
  try {
    const results = await searchAniList(cleanQuery, signal)
    if (results && results.length > 0) return results
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('AniList search failed, falling back to Kitsu/Jikan:', err)
  }
  try {
    const results = await searchKitsu(cleanQuery, signal)
    if (results && results.length > 0) return results
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('Kitsu search failed, falling back to Jikan:', err)
  }
  try {
    const results = await searchJikan(cleanQuery, signal)
    return results
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('All anime search providers failed:', err)
    throw new Error('Unable to search anime. Please check your internet connection and try again.')
  }
}
```

## 5. Facts about the surrounding files the plan depends on (verified against the repo)

- `src/components/GridSelector.jsx` (only consumer of `searchAnime`):
  - Debounces 300ms; on each query change creates a new `AbortController`, aborts the previous one. Race-safe cleanup.
  - Renders results in array order; `selectedIndex` starts at 0 → the first result is the default selection. Highlighted row uses `selectedIndex === index`.
  - "Already Picked" logic: `slots.some((s, i) => s && s.mal_id === selected.mal_id && i !== activeSlot)`.
  - `pick(anime)` → `onSelectSlot(targetSlot, anime)`; grid holds exactly 9 slots; filled slots can be replaced/cleared.
  - Dropdown container already handles 12 rows: `max-h-[380px]` + `overflow-y-auto` (the element also carries `overflow-hidden`, which Tailwind compiles to `overflow-x:hidden` alongside `overflow-y:auto`).
- `src/utils/scoring.js` — `computeAuraScore` sorts the picked list by `mal_id` before seeding; **result order is therefore irrelevant to the deterministic score**.
- `src/App.jsx` — owns `slots` state; passes `onSelectSlot`, `onJudge`, `isJudging` into `GridSelector`. Not touched by the plan.
- `src/services/gemini.js` — sends the 9 picked titles (with genre + score) to OpenRouter for the roast. Not touched by the plan.
- No test framework, no linter, no typecheck configured; `npm run build` (vite build) is the only gate. `package.json` scripts: `dev`, `build`, `preview`.

## 6. External API facts you should verify or already know

- **AniList GraphQL** (`https://graphql.anilist.co`): `media()` accepts filter args including `search`, `type`, `sort`, `isAdult: Boolean`, `countryOfOrigin: CountryCode` (e.g. `"JP"`). Media fields include `id`, `idMal`, `title`, `genres`, `seasonYear`, `startDate`, `averageScore`, `coverImage`, `popularity`, `favourites`, `format`, `status`, `episodes`. Rate limit: 30 req/min (confirmed by HAR header `x-ratelimit-limit: 30`).
- **Kitsu** (`https://kitsu.io/api/edge/anime`): attributes include `canonicalTitle`, `titles`, `subtype` (`TV`/`movie`/`ona`…), `status`, `startDate`, `episodeCount`, `averageRating`, `userCount`, `favoritesCount`, `posterImage`. Note: Kitsu's `id` is a Kitsu-internal id, **not** a MAL id.
- **Jikan/MyAnimeList** (`https://api.jikan.moe/v4/anime`): search supports `q`, `limit`, and `sfw` (`true` restricts to safe-for-work). Response items include `mal_id`, `title`, `title_english`, `images`, `genres`, `year`, `aired`, `score`, `type`, `status`, `episodes`, `members`, `favorites`.

## 7. Your review mandate

Assess the plan rigorously. Specifically:

1. **GraphQL correctness** — Are `isAdult: false`, `countryOfOrigin: "JP"`, and the new fields (`format`, `status`, `episodes`, `popularity`, `favourites`) valid on AniList's `media` in a single query with `sort: SEARCH_MATCH` and `perPage: 12`? Any schema/argument pitfalls (e.g. arg type, nullability, `idMal` requiring a query-time note)?
2. **Ranking math** — Is the blend formula deterministic, bounded, and sensible? Check edge cases: `N < 2`; `maxP = 0` (all popularity 0/null); mixed null/non-null popularity; float ties; whether `log2(1+p)/log2(1+maxP)` is always ≤ 1; whether the tie-break `popularity desc, mal_id asc` is sufficient for full determinism (e.g. equal popularity AND equal mal_id can't happen since list is unique). Confirm whether the garbled line in Task 2 should be `0.6 * relevance(i) + 0.4 * popNorm(p)` and flag it.
3. **Where re-rank belongs** — Inside `searchAniList` vs inside `searchAnime`. Consider: the fallback chain checks `results.length > 0`; re-ranking does not change length; does placing it inside `searchAniList` conflict with `makings sure empty arrays still propagate`? Any downside to exporting the pure function vs keeping it module-private?
4. **Schema enrichment** — For each provider, are the mapped field sources correct per §6? Any null/undefined pitfalls (e.g. `attr.episodeCount` absent, `a.episodes` null, `format` undefined) that would violate downstream consumers (GridSelector renders `anime.genre...` etc. — but new fields are unused by the UI for now; confirm nothing crashes).
5. **Downstream compatibility** — Given GridSelector consumes the returned **order**, keys rows by `mal_id`, and uses `mal_id` for dedupe: does re-ordering break anything? Does the `mal_id` fallback `m.idMal || m.id` (AniList id used when `idMal` is null) create collision risk with real MAL ids, and is that within/outside plan scope? Same question for Kitsu's `parseInt(item.id)` + random-fallback id.
6. **Behavioral consequences of the two filters** (worldview check, not just code): is `countryOfOrigin: "JP"` the right default for this product, and does the plan anywhere address search terms whose best match is non-JP (results simply won't appear; is that acceptable/intended)?
7. **Scope discipline** — Confirm the plan does not touch caching, dropdown UI, CORS/image handling, scoring, or the LLM path; flag anything that leaks outside "result quality & ranking".
8. **Validation plan quality** — Are the manual checks in §Validation adequate, or is a specific query/adult-title case needed to prove `isAdult`/`countryOfOrigin` work (any known edge like `isAdult` filter being silently ignored if the arg name differs)? Is `npm run build` a sufficient gate?

## 8. Output format (be concrete)

Return a review containing:

1. **Verdict**: `APPROVE` / `APPROVE WITH CHANGES` / `REJECT`.
2. **Findings by section** — for each of the 4 plan tasks: correct / incorrect / incomplete, with one line of justification each.
3. **Concrete correction list** — itemized, code-level suggestions (exact formula line, exact GraphQL arg spelling, exact URL/param spelling) if any are wrong.
4. **Missed risks / edge cases** not mentioned in the plan's Risks section.
5. **Open questions** for the plan author (if any remain after your analysis).

Do not pad the response; every line should be a judgment actionable by the plan author.