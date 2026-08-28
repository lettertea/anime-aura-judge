# Code Review & Remediation Plan: Anime Aura Judge

## 1. Verdict
The app has a compelling visual identity and an airtight deterministic scoring engine, but it is currently crippled by two zero-index truthiness bugs in `GridSelector.jsx` that completely break search and autofocus for Slot 1 (index 0). Furthermore, users cannot replace or clear filled slots without refreshing the page, the OpenRouter model string has an invalid leading tilde (`~`) that causes 100% of LLM calls to fail, and search modal UX lacks standard keyboard/backdrop handling.

---

## 2. UI/UX Issues

### Critical
- **`src/components/GridSelector.jsx:52` & `src/components/GridSelector.jsx:63`**
  - **What's wrong:** `if (!modalSlot) return undefined` in the search effect and `if (modalSlot && inputRef.current)` in the focus effect treat `0` (Slot 1) as falsy.
  - **Why it matters:** Typing in the search modal for Slot 1 never triggers an API search, and the search input is never auto-focused for Slot 1. The top-left slot is completely non-functional.
  - **Concrete fix:** Change condition to `if (modalSlot === null) return undefined` and `if (modalSlot !== null && inputRef.current) inputRef.current.focus()`.

### Major
- **`src/components/GridSelector.jsx:19` & `src/components/GridSelector.jsx:88-93`**
  - **What's wrong:** `openModal` immediately returns if `slots[index]` is truthy (`if (slots[index] || isJudging) return`).
  - **Why it matters:** Once an anime is picked into any slot, it cannot be replaced or removed. If a user makes a mistake on slot 1 after picking 8 slots, they are stuck. Yet filled slots retain `cursor-pointer`, creating a broken UX affordance.
  - **Concrete fix:** Allow clicking a filled slot to reopen search and replace it, or add a hover overlay with a "Replace" and "Remove" button.
- **`src/components/GridSelector.jsx:144` & `src/components/GridSelector.jsx:150`**
  - **What's wrong:** Search modal cannot be dismissed by pressing `Escape` or clicking the backdrop overlay.
  - **Why it matters:** Traps keyboard users and violates standard web modal UX expectations.
  - **Concrete fix:** Add `onClick={closeModal}` to the backdrop div (with `e.stopPropagation()` on modal container) and attach a `keydown` event listener for `e.key === 'Escape'`.
- **`src/components/AuraCard.jsx:24-26`**
  - **What's wrong:** Export errors in `handleDownload` are caught and logged to console with no UI notification.
  - **Why it matters:** Because Jikan/MyAnimeList CDN images may encounter CORS restrictions during canvas rasterization, downloads can fail silently, leaving the user with a button that resets without explanation.
  - **Concrete fix:** Maintain an `exportError` state and display an inline warning toast or retry suggestion.

### Minor
- **`src/components/AuraCard.jsx:109-114`**
  - **What's wrong:** The `offline` banner is rendered outside `cardRef`.
  - **Why it matters:** The exported PNG image will not show whether the verdict was generated locally or via the LLM.
  - **Concrete fix:** Move the offline badge inside `cardRef` (e.g. in the footer) or style it consistently as a card pill.
- **`src/components/AuraCard.jsx:134-140`**
  - **What's wrong:** The "Reset" button has no confirmation dialog or undo state.
  - **Why it matters:** Misclicking Reset immediately destroys all 9 selections with no recovery option.
  - **Concrete fix:** Add a lightweight confirmation state or double-click guard (`"Are you sure?"`).
- **`src/App.jsx:25-31`**
  - **What's wrong:** View transitions do not reset scroll position.
  - **Why it matters:** If the user scrolled down on the grid selector, transitioning to results leaves the viewport scrolled partway down the card.
  - **Concrete fix:** Add `window.scrollTo({ top: 0, behavior: 'instant' })` inside `transitionTo`.

### Nit
- **`src/components/GridSelector.jsx:12`**
  - **What's wrong:** `const debounceRef = useRef(null)` is declared but never referenced.
  - **Concrete fix:** Remove unused ref declaration.

---

## 3. Logic Issues

### Critical
- **`src/services/gemini.js:4`**
  - **What's wrong:** `const MODEL = '~anthropic/claude-sonnet-latest'`.
  - **Why it matters:** The leading `~` is invalid syntax for OpenRouter model slugs. All API requests fail immediately and trigger the fallback path.
  - **Concrete fix:** Change to a valid model ID such as `anthropic/claude-3.5-sonnet` or `anthropic/claude-3.7-sonnet`.

### Major
- **`src/components/GridSelector.jsx:33-49`**
  - **What's wrong:** `doSearch` lacks request cancellation or request ID tracking.
  - **Why it matters:** If earlier queries resolve after later queries (race condition), stale search results overwrite fresh results.
  - **Concrete fix:** Use an `AbortController` in `useEffect` and cancel previous in-flight requests when `query` changes.

### Minor
- **`src/utils/scoring.js:29`**
  - **What's wrong:** Typo in `GENRE_LABELS`: `'Samural'` instead of `'Samurai'`.
  - **Why it matters:** Samurai anime fail genre matching and default to `'objectively a certified pick'` instead of `'honor-bound weeb'`.
  - **Concrete fix:** Rename `'Samural'` key to `'Samurai'`.
- **`src/services/gemini.js:130-135`**
  - **What's wrong:** The payload sent to OpenRouter maps only `{ title, genre }` and omits MAL ratings/scores (`a.score`).
  - **Why it matters:** The LLM does not have full context of anime scores when formulating the archetype roast.
  - **Concrete fix:** Include `score: a.score` in `payload.titles` map.

### Logic & Determinism Verification
- **Determinism (`src/utils/scoring.js:49-104`): VERIFIED CORRECT**
  - Input array is copied and sorted by `a.mal_id - b.mal_id`, guaranteeing a canonical order.
  - `seed` computation is purely commutative and deterministic.
  - Collision resolution algorithms for indices (`(j + 1) % 9`) and values (`out + (i + 1) * 777`) are strictly deterministic.
  - Sign rule indexing uses modifier index `k` and strictly enforces `sign = '-'` for `'guilty pleasure'` genres.
  - Permuting the 9 input titles in any order yields identical score, modifiers, and local archetype.
- **Fallback Path (`src/services/gemini.js`, `src/App.jsx`): VERIFIED ROBUST**
  - `parseVerdictJSON` defensively handles markdown code fences, unbalanced braces, and schema property validation.
  - Double attempt loop in `getAuraVerdict` falls back to `localFallbackVerdict(seed)`.
  - Top-level `try/catch` in `App.jsx` prevents unhandled rejections from blocking the results view.

---

## 4. Top 5 Changes (Ranked)

1. **Fix zero-index falsy checks in `GridSelector.jsx` (lines 52 & 63):** Change `!modalSlot` to `modalSlot === null` to restore Slot 1 search and focus.
2. **Fix OpenRouter model string in `gemini.js` (line 4):** Remove invalid `~` prefix so API calls succeed.
3. **Enable slot editing/replacement in `GridSelector.jsx` (line 19):** Allow users to change or clear already selected anime slots.
4. **Implement search modal keyboard & backdrop dismissal (`GridSelector.jsx`):** Add `Escape` key and backdrop click handlers.
5. **Add error handling & CORS mitigation for PNG export (`AuraCard.jsx`):** Provide user feedback on export failures.
