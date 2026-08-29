# Reviewer Prompt: Manga Mode Plan

You are a senior frontend architect reviewing an implementation plan for a React + Vite app called **Anime Aura**. The app lets users search anime, computes an "aura score" for each title, enriches results with Gemini AI commentary, and renders shareable score cards.

## Your Task

Review the plan at [`.kilo/plans/manga-mode-plan.md`](manga-mode-plan.md), which adds a "manga mode" (search/score manga in addition to anime). Evaluate it against the actual codebase.

## Files to Read

- The plan: `.kilo/plans/manga-mode-plan.md`
- `src/services/animeApi.js` — provider search layer (AniList → Kitsu → Jikan fallback chain), normalization contract, re-ranking
- `src/utils/scoring.js` — aura score heuristics
- `src/services/gemini.js` — AI enrichment prompts
- `src/App.jsx`, `src/components/GridSelector.jsx`, `src/components/AuraCard.jsx`, `src/components/ScoreBreakdown.jsx` — UI
- `src/utils/cardCanvas.js` — card image export

## Review Criteria

1. **Completeness** — Does the plan miss any file, call site, or consumer that assumes anime semantics? Search the codebase for hardcoded references (e.g., `ANIME`, `/anime`, `episodes`, `TV`, `MOVIE`, "anime" in user-facing copy or prompts).
2. **Correctness of provider mapping** — Verify the anime→manga field mappings against the real APIs:
   - AniList GraphQL: `Media.type: MANGA`, `chapters`, `volumes`
   - Kitsu JSON:API: `/api/edge/manga`, `chapterCount`/`volumeCount`
   - Jikan v4: `/v4/manga`, `chapters`, `published`, `volumes`
   Flag any incorrect or missing field differences (e.g., AniList `seasonYear` is null for manga — does the plan handle year extraction correctly?).
3. **Data contract stability** — The plan proposes keeping `episodes` as a generic "length" field vs. adding a `chapters` field. Which approach is better for this codebase? Consider consumers in scoring, UI, and card canvas.
4. **Risk assessment** — Are the listed risks accurate and sufficient? Consider: Jikan rate limiting, Kitsu ID semantics, AniList `isAdult` filtering, empty/short manga chapter counts affecting scoring, Gemini prompt drift.
5. **Testability** — Is the QA section adequate? Suggest concrete test cases, including fallback-chain behavior when the primary provider fails in manga mode.
6. **Scope & sequencing** — Are the steps in a sensible order? Is anything in scope that should be cut for a first iteration (e.g., is the Lucky button manga support essential)?

## Output Format

Provide:

- **Verdict**: APPROVE / APPROVE WITH CHANGES / REQUEST CHANGES
- **Blocking issues** (must fix before implementation), each with file/line references
- **Non-blocking suggestions**
- **Missed items** found by searching the codebase that the plan doesn't mention
- **Recommended data-contract decision** (generic `episodes` vs. new `chapters` field) with justification
