# Manga Mode Plan (v2 — post-review)

Add a "manga mode" to Anime Aura so users can search, score, and generate aura cards for manga as well as anime. Philosophy: working and good beats perfect but incomplete — keep changes minimal, reuse the existing pipeline, and don't over-engineer.

## Current State

- [`src/services/animeApi.js`](../../src/services/animeApi.js) is anime-only:
  - AniList GraphQL hardcodes `type: ANIME` (search query + "Feeling Lucky" query).
  - Kitsu base URL: `https://kitsu.io/api/edge/anime`.
  - Jikan base URL: `https://api.jikan.moe/v4/anime`.
  - Public entry point `searchAnime(query, signal)` has no media-type parameter.
- [`src/utils/scoring.js`](../../src/utils/scoring.js) score math uses only `mal_id`, `score`, `genres`, `title` — it does **not** consume `episodes`/`format`/`status`. But it contains many hardcoded anime strings (STAT_BLURBS, CLASS_SUFFIXES, ROAST_TEMPLATES, holistic explanations).
- Other anime-hardcoded consumers: [`src/services/gemini.js`](../../src/services/gemini.js) (system prompt, payload key `anime`), [`src/components/GridSelector.jsx`](../../src/components/GridSelector.jsx) (search copy/labels), [`src/components/ScoreBreakdown.jsx`](../../src/components/ScoreBreakdown.jsx) ("All 9 Anime Contributions"), [`src/utils/cardCanvas.js`](../../src/utils/cardCanvas.js) (canvas titles, modifier text, download filename).

## Data Contract Decision

Add explicit fields; do **not** overload `episodes`:

```js
// NormalizedMedia (extends NormalizedAnime)
{
  mal_id, title, english_title, romaji_title, images, genres, year, score,
  mediaType: 'ANIME' | 'MANGA',   // self-describing
  format: 'TV' | 'MANGA' | 'NOVEL' | ...,
  status,
  episodes: number | null,        // anime only
  chapters: number | null,        // manga only
  volumes: number | null,         // manga only
  popularity, favourites,
}
```

Justification: `episodes` is not consumed anywhere in scoring/UI/canvas today, so adding fields breaks nothing; manga has distinct chapter/volume counts on all three providers; `mediaType` on each item lets components and prompt builders inspect items directly.

## Provider Mapping (Anime → Manga)

| Provider | Anime | Manga | Field changes |
|---|---|---|---|
| AniList | `type: ANIME` | `type: MANGA` | request `chapters`, `volumes`; year from `startDate.year` (no `seasonYear` for manga) |
| Kitsu | `/api/edge/anime` | `/api/edge/manga` | `episodeCount` → `chapterCount` (+ `volumeCount`); genre fallback `'Anime'` → `'Manga'` |
| Jikan | `/v4/anime` | `/v4/manga` | `episodes` → `chapters` (+ `volumes`); **year from `a.published?.from`** (manga has no `a.year`/`a.aired`) |

Note: NSFW filtering is intentionally out of scope — the current anime search doesn't filter adult content either; manga mode keeps parity.

## Implementation Phases

### Phase 1: API & Data Contract (`src/services/animeApi.js`)

- [ ] Add `mediaType` param (`'ANIME' | 'MANGA'`, default `'ANIME'`) to `searchAnime(query, signal, mediaType)`; thread through `searchAniList`, `searchKitsu`, `searchJikan`.
- [ ] AniList: parameterize `type` in both the search query and the Lucky query; request `chapters`/`volumes`; map into new fields; set `mediaType` on results.
- [ ] Kitsu: dynamic endpoint; map `chapterCount`/`volumeCount`; genre fallback `{ name: mediaType === 'MANGA' ? 'Manga' : 'Anime' }`.
- [ ] Jikan: dynamic endpoint; map `chapters`/`volumes`; fix year extraction to use `a.published?.from` for manga:
  ```js
  const dateStr = a.aired?.from || a.published?.from
  const year = a.year || (dateStr ? parseInt(dateStr.slice(0, 4), 10) : null)
  ```
- [ ] Update `getRandomAnimeSet` → `getRandomMediaSet(count, mediaType)` (AniList `type: MANGA, sort: FAVOURITES_DESC` for manga). Keep Lucky button in scope — it's trivial.
- [ ] Update error messages to be media-aware ("Unable to search manga…", "Not enough random manga returned").
- [ ] `rankByRelevanceAndPopularity()` unchanged (already media-agnostic).

### Phase 2: Text & Prompt Adaptation

- [ ] [`src/utils/scoring.js`](../../src/utils/scoring.js): **score math unchanged**. Parameterize text templates by `mediaType`: "viewer" → "reader", "watchlist" → "reading list", "show/anime" → "series/manga"; adapt soundtrack/dub/sub roasts for print media. Keep it lightweight — a small `copy(mediaType)` helper or ternaries in the template tables.
- [ ] [`src/services/gemini.js`](../../src/services/gemini.js): parameterize the system prompt ("perceptive manga critic…", no references to animation/voice acting/OSTs) and the payload (pass `mediaType` and rename/adapt the `anime` key).

### Phase 3: UI & Canvas Integration

- [ ] [`src/App.jsx`](../../src/App.jsx): add Anime/Manga toggle (state, persisted to `localStorage`). **Grid lifecycle on mode switch:** if `filledCount > 0`, show a confirmation modal ("Switching to Manga mode will clear your current grid. Continue?"); if confirmed, reset slots and switch. If empty, switch instantly.
- [ ] [`src/components/GridSelector.jsx`](../../src/components/GridSelector.jsx): dynamic copy — placeholder ("Search manga for Slot N…"), loading/empty states, header ("Manga Aura Judge" / "Pick 9 manga. Receive judgment. No mercy."), tooltips, mobile sheet titles, input id/label.
- [ ] [`src/components/ScoreBreakdown.jsx`](../../src/components/ScoreBreakdown.jsx): "All 9 Anime Contributions" → dynamic.
- [ ] [`src/components/AuraCard.jsx`](../../src/components/AuraCard.jsx): pass `mediaType` through; any episode/chapter labels dynamic.
- [ ] [`src/utils/cardCanvas.js`](../../src/utils/cardCanvas.js): dynamic canvas header ("Manga Aura Judge"), modifier subtext, panel title, and download filename (`manga-aura-card.png`).

### Phase 4: QA & Verification

Provider search & fallback:
- [ ] AniList (primary): search "Berserk", "Chainsaw Man", "Oyasumi Punpun" in manga mode — verify title, cover, year, genres.
- [ ] Kitsu fallback: block `graphql.anilist.co` in devtools; search "One Piece" — verify fallback + `chapterCount` extraction.
- [ ] Jikan fallback: block AniList + Kitsu; search "Monster" — verify `/v4/manga` and `published.from` → `year`.
- [ ] Ongoing manga with `chapters: null` — verify no crashes and scores compute (score math doesn't use chapters).

Feature workflows:
- [ ] Lucky button in manga mode fills 9 top-favorited manga.
- [ ] Offline (No AI) verdict on a 9-manga grid — roasts/explanations don't say "watching", "episodes", "soundtracks".
- [ ] AI verdict on a 9-manga grid — JSON parses; commentary is manga-appropriate.
- [ ] Canvas export — header, modifier rows, and filename correct per mode.
- [ ] Mode toggle with 3 filled slots — confirmation modal appears; grid clears on confirm.
- [ ] Regression: anime mode behaves identically to before.

## Risks

| Risk | Mitigation |
|---|---|
| Jikan manga year extraction bug (no `aired`/`year`) | Explicit `published.from` mapping in Phase 1 |
| Kitsu `'Anime'` genre fallback polluting manga results | Media-aware fallback genre |
| Ongoing manga have `chapters: null` | Harmless — score math ignores it |
| Jikan rate limits (429) | Already last in fallback chain; 300ms debounce + AbortController already in place |
| Gemini referencing anime concepts for manga | Parameterized system prompt |
