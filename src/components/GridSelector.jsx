import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Loader2, X, Sparkles, AlertCircle, Gauge, Dices, BookOpen, Tv } from 'lucide-react'
import { searchAnime, getRandomMediaSet } from '../services/animeApi.js'

export default function GridSelector({ slots, onSelectSlot, onJudge, isJudging, judgeMode, onJudgeModeChange, mediaType = 'ANIME', onMediaTypeChange }) {
  const isManga = mediaType === 'MANGA'
  const mediumNoun = isManga ? 'manga' : 'anime'
  const [query, setQuery] = useState('')
  const [luckyLoading, setLuckyLoading] = useState(false)
  const [luckyError, setLuckyError] = useState(null)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  // On mobile the search lives in a bottom-sheet modal instead of the sticky bar.
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false)

  // Find first empty slot or default to 0
  const firstEmptySlot = slots.findIndex((s) => s === null)
  const [activeSlot, setActiveSlot] = useState(firstEmptySlot !== -1 ? firstEmptySlot : 0)

  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const searchContainerRef = useRef(null)
  // Guards against the focus-restore in pick() firing onFocus with stale
  // query/results and briefly re-opening the dropdown (visual flash).
  const skipNextFocusRef = useRef(false)

  const filledCount = slots.filter(Boolean).length

  // Keep activeSlot updated if current activeSlot gets filled and there are empty slots
  useEffect(() => {
    if (slots[activeSlot] !== null) {
      const nextEmpty = slots.findIndex((s) => s === null)
      if (nextEmpty !== -1) {
        setActiveSlot(nextEmpty)
      }
    }
  }, [slots, activeSlot])

  // Handle clicking outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Lock body scroll while the mobile picker sheet is open
  useEffect(() => {
    if (mobilePickerOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
    return undefined
  }, [mobilePickerOpen])

  const doSearch = useCallback(async (q, signal, mediaType) => {
    setSearching(true)
    setSearchError(null)
    try {
      const data = await searchAnime(q, signal, mediaType)
      setResults(data || [])
      setSelectedIndex(0)
      setIsDropdownOpen(true)
    } catch (err) {
      if (err.name === 'AbortError') return
      setSearchError(err.message || 'Search failed. Try again.')
      setResults([])
      setIsDropdownOpen(true)
    } finally {
      if (!signal.aborted) {
        setSearching(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearching(false)
      setSearchError(null)
      setIsDropdownOpen(false)
      return undefined
    }

    setSearching(true)
    const controller = new AbortController()
    const t = setTimeout(() => doSearch(query.trim(), controller.signal, mediaType), 300)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [query, doSearch, mediaType])

  const pick = (anime) => {
    if (!anime) return
    const targetSlot = activeSlot !== null ? activeSlot : (slots.findIndex((s) => s === null) !== -1 ? slots.findIndex((s) => s === null) : 0)
    onSelectSlot(targetSlot, anime)
    setQuery('')
    setResults([])
    setIsDropdownOpen(false)
    // Keep focus for rapid multi-picking without scrolling the page to the top.
    // Skip the onFocus handler — it still sees stale query/results here and
    // would briefly re-open the dropdown before the empty-query effect closes it.
    skipNextFocusRef.current = true
    inputRef.current?.focus({ preventScroll: true })

    // Advance to next empty slot
    const nextEmpty = slots.findIndex((s, idx) => idx !== targetSlot && s === null)
    if (nextEmpty !== -1) {
      setActiveSlot(nextEmpty)
    }
  }

  const handleKeyDown = (e) => {
    if (!isDropdownOpen || results.length === 0) {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = results[selectedIndex]
      if (selected) {
        const alreadyPicked = slots.some((s, i) => s && s.mal_id === selected.mal_id && i !== activeSlot)
        if (!alreadyPicked) {
          pick(selected)
        }
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false)
    }
  }

  const handleSlotClick = (index) => {
    if (isJudging) return
    setActiveSlot(index)
    if (window.matchMedia('(max-width: 639px)').matches) {
      // Mobile: open the bottom-sheet picker instead of focusing an inline bar.
      setMobilePickerOpen(true)
    } else {
      inputRef.current?.focus()
    }
  }

  const handleClearSlot = (e, index) => {
    e.stopPropagation()
    if (isJudging) return
    onSelectSlot(index, null)
    setActiveSlot(index)
    inputRef.current?.focus({ preventScroll: true })
  }

  const closeMobilePicker = () => {
    setMobilePickerOpen(false)
    setQuery('')
    setResults([])
    setIsDropdownOpen(false)
  }

  // Shared search UI (label + input + autocomplete dropdown), rendered inside
  // the desktop sticky bar and the mobile bottom sheet alike.
  const searchPanel = (
    <>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor="media-search-input" className="text-sm font-medium text-zinc-300">
          {slots[activeSlot] ? (
            <span>
              Replacing <span className="text-violet-400 font-semibold">Slot {activeSlot + 1}</span> ({slots[activeSlot].title})
            </span>
          ) : (
            <span>
              Adding to <span className="text-indigo-400 font-semibold">Slot {activeSlot + 1}</span>
            </span>
          )}
        </label>
        <span className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-full">
          {filledCount}/9
        </span>
      </div>

      <div className="relative">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
        />
        <input
          id="media-search-input"
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsDropdownOpen(true)
          }}
          onFocus={() => {
            if (skipNextFocusRef.current) {
              skipNextFocusRef.current = false
              return
            }
            if (query.trim() && results.length > 0) {
              setIsDropdownOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={`Search ${mediumNoun} for Slot ${activeSlot + 1}...`}
          disabled={isJudging}
          autoComplete="off"
          className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl py-3.5 pl-11 pr-11 text-zinc-100 placeholder-zinc-500 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-colors text-base"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {searching && (
            <Loader2 size={18} className="text-indigo-400 animate-spin" />
          )}
          {query && !searching && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setResults([])
                setIsDropdownOpen(false)
                inputRef.current?.focus()
              }}
              className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {isDropdownOpen && (query.trim() || searching || searchError) && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-2 z-50 bg-zinc-900/95 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden backdrop-blur-md max-h-[380px] overflow-y-auto divide-y divide-zinc-800/60"
        >
          {searching && results.length === 0 && (
            <div className="p-6 text-center text-zinc-400 flex items-center justify-center gap-2">
              <Loader2 size={18} className="text-indigo-400 animate-spin" />
              <span>Searching {mediumNoun} database...</span>
            </div>
          )}

          {searchError && (
            <div className="p-4 bg-rose-950/30 text-rose-300 text-sm flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-400 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {!searching && results.length === 0 && !searchError && query.trim() && (
            <div className="p-6 text-center text-zinc-400 text-sm">
              No {mediumNoun} found for "{query}". Try another title.
            </div>
          )}

          {results.map((anime, index) => {
            const alreadyPicked = slots.some(
              (s, i) => s && s.mal_id === anime.mal_id && i !== activeSlot,
            )
            const genresText = (anime.genres || []).map((g) => g.name).join(', ')
            const isHighlighted = selectedIndex === index

            return (
              <div
                key={anime.mal_id || index}
                onClick={() => {
                  if (!alreadyPicked) pick(anime)
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex items-center gap-4 p-3.5 transition-colors text-left ${
                  alreadyPicked
                    ? 'bg-zinc-900/40 opacity-40 cursor-not-allowed'
                    : isHighlighted
                      ? 'bg-indigo-500/10 border-l-2 border-indigo-400 cursor-pointer'
                      : 'hover:bg-zinc-800/50 cursor-pointer'
                }`}
              >
                <img
                  src={anime.images?.jpg?.small_image_url || anime.images?.jpg?.image_url}
                  alt={anime.title}
                  className="w-11 h-16 object-cover rounded-md border border-zinc-800 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm truncate ${isHighlighted ? 'text-indigo-300' : 'text-zinc-100'}`}>
                    {anime.title}
                  </p>
                  <p className="text-xs text-zinc-500 font-mono truncate mt-1">
                    {anime.year ? `${anime.year}` : ''}
                    {anime.year && genresText ? ' · ' : ''}
                    {genresText || (isManga ? 'Manga' : 'Anime')}
                  </p>
                </div>
                {alreadyPicked ? (
                  <span className="text-xs font-medium text-zinc-500 bg-zinc-800/80 px-2 py-1 rounded">
                    Already Picked
                  </span>
                ) : (
                  <span className="text-xs font-medium text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Select
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      <header className="text-center mb-8 sm:mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs font-mono uppercase tracking-widest text-zinc-400 mb-5">
          <Gauge size={13} className="text-indigo-400" />
          Official Aura Assessment
        </div>
        <h1 className="flex items-center justify-center gap-2 sm:gap-3 text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-accent-glow">
            <Gauge size={18} />
          </span>
          {isManga ? 'Manga Aura Judge' : 'Anime Aura Judge'}
        </h1>
        <p className="mt-3 text-zinc-400 text-base">
          Pick 9 {mediumNoun}. Receive judgment. No mercy.
        </p>
      </header>

      {/* Top Search & Autocomplete Bar — desktop only; mobile uses the sheet */}
      <div
        ref={searchContainerRef}
        className="hidden sm:block max-w-[820px] mx-auto mb-8 relative sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md rounded-b-2xl py-3 shadow-lg shadow-black/30 border-b border-white/5"
      >
        {searchPanel}
      </div>

      {/* Mobile slot status strip */}
      <div className="sm:hidden max-w-[820px] mx-auto mb-6 flex items-center justify-between px-1">
        <p className="text-sm text-zinc-300">
          {slots[activeSlot] ? (
            <>Replacing <span className="text-violet-400 font-semibold">Slot {activeSlot + 1}</span></>
          ) : (
            <>Adding to <span className="text-indigo-400 font-semibold">Slot {activeSlot + 1}</span></>
          )}
        </p>
        <span className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-full">
          {filledCount}/9
        </span>
      </div>

      {/* Grid Section */}
      <div className="max-w-[820px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Your 3x3</h2>
          <p className="text-xs font-mono text-zinc-500">
            Tap a slot to choose or replace
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-5">
          {slots.map((anime, i) => {
            const isActive = activeSlot === i

            return (
              <div key={i} className="relative w-full aspect-[2/3]">
                <button
                  type="button"
                  onClick={() => handleSlotClick(i)}
                  disabled={isJudging}
                  className={`group relative w-full h-full rounded-xl overflow-hidden border transition-colors duration-200 text-left ${
                    isActive
                      ? 'border-indigo-500/70 border-dashed bg-indigo-500/5 ring-2 ring-indigo-500/20'
                      : anime
                        ? 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600'
                        : 'border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700'
                  } ${isJudging ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {anime ? (
                    <>
                      <img
                        src={anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}
                        alt={anime.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-zinc-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-sm font-medium text-zinc-100 bg-zinc-900/90 px-3 py-1.5 rounded-lg border border-zinc-700">
                          Tap to Change
                        </span>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent p-3">
                        <p className="text-sm font-medium text-zinc-100 line-clamp-2">
                          {anime.title}
                        </p>
                      </div>
                      {isActive && (
                        <div className="absolute top-2 left-2 bg-indigo-500 text-white text-[10px] font-mono font-semibold px-2 py-0.5 rounded uppercase tracking-wider">
                          Active Slot
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600 group-hover:text-indigo-400 transition-colors">
                      <Sparkles size={32} className={isActive ? 'text-indigo-400 animate-pulse' : ''} />
                      <span className={`text-sm font-mono ${isActive ? 'text-indigo-400' : ''}`}>
                        Slot {i + 1} {isActive ? '(Active)' : ''}
                      </span>
                    </div>
                  )}
                </button>

                {anime && !isJudging && (
                  <button
                    type="button"
                    onClick={(e) => handleClearSlot(e, i)}
                    title={`Remove ${mediumNoun}`}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-zinc-950/80 border border-zinc-700 text-zinc-400 hover:text-rose-400 hover:border-rose-500/50 transition-colors z-10 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center gap-4">
        <p className="text-sm font-mono text-zinc-500">
          {filledCount}/9 slots filled
        </p>

        {/* Media type toggle: Anime vs Manga */}
        <div className="flex justify-center">
          <div className="inline-flex items-center rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
            <button
              type="button"
              onClick={() => onMediaTypeChange('ANIME')}
              disabled={isJudging}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                !isManga
                  ? 'bg-indigo-600 text-white shadow-accent-glow'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Tv size={15} />
              Anime
            </button>
            <button
              type="button"
              onClick={() => onMediaTypeChange('MANGA')}
              disabled={isJudging}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                isManga
                  ? 'bg-indigo-600 text-white shadow-accent-glow'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <BookOpen size={15} />
              Manga
            </button>
          </div>
        </div>

        {/* Judge mode toggle: AI verdict vs fully deterministic (no AI) */}
        <div className="flex justify-center">
        <div className="inline-flex items-center rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
          <button
            type="button"
            onClick={() => onJudgeModeChange('ai')}
            disabled={isJudging}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              judgeMode === 'ai'
                ? 'bg-indigo-600 text-white shadow-accent-glow'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <Sparkles size={15} />
            AI Judge
          </button>
          <button
            type="button"
            onClick={() => onJudgeModeChange('local')}
            disabled={isJudging}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              judgeMode === 'local'
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <Gauge size={15} />
            No AI
          </button>
        </div>
        </div>
        {judgeMode === 'local' && (
          <p className="text-xs text-zinc-500 mb-4 max-w-md mx-auto">
            No-AI mode: your verdict is computed entirely by the deterministic scoring engine.
          </p>
        )}
        {luckyError && (
          <p className="text-sm text-rose-400 mb-3">{luckyError}</p>
        )}
        <button
          onClick={async () => {
            if (luckyLoading || isJudging) return
            setLuckyLoading(true)
            setLuckyError(null)
            try {
              const randomSet = await getRandomMediaSet(9, mediaType)
              randomSet.forEach((anime, i) => onSelectSlot(i, anime))
            } catch (err) {
              console.error('Lucky pick failed:', err)
              setLuckyError("Luck ran out — couldn't fetch a random set. Try again.")
            } finally {
              setLuckyLoading(false)
            }
          }}
          disabled={luckyLoading || isJudging}
          className={`w-full sm:w-auto px-6 py-3.5 rounded-xl text-base font-semibold border transition-colors duration-200 ${
            luckyLoading || isJudging
              ? 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'
              : 'bg-zinc-900/50 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-zinc-100 hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
          }`}
        >
          {luckyLoading ? (
            <span className="flex items-center gap-2 justify-center">
              <Loader2 className="animate-spin" size={20} />
              Rolling the dice...
            </span>
          ) : (
            <span className="flex items-center gap-2 justify-center">
              <Dices size={20} />
              I'm Feeling Lucky
            </span>
          )}
        </button>
        <button
          onClick={onJudge}
          disabled={filledCount < 9 || isJudging}
          className={`w-full sm:w-auto px-10 py-3.5 rounded-xl text-base font-semibold transition-colors duration-200 ${
            filledCount < 9 || isJudging
              ? 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-accent-glow hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
          }`}
        >
          {isJudging ? (
            <span className="flex items-center gap-2 justify-center">
              <Loader2 className="animate-spin" size={20} />
              {judgeMode === 'local' ? 'Crunching the numbers...' : 'Consulting the aura realm...'}
            </span>
          ) : (
            judgeMode === 'local' ? 'Judge My Grid (No AI)' : 'Judge My Grid'
          )}
        </button>
      </div>

      {/* Mobile bottom-sheet anime picker */}
      {mobilePickerOpen && (
        <div className="sm:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeMobilePicker}
          />
          {/* Sheet */}
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] flex flex-col bg-zinc-950 border-t border-zinc-800 rounded-t-2xl shadow-2xl">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                  <Search size={13} />
                </span>
                <span className="text-sm font-semibold text-zinc-100">
                  {slots[activeSlot] ? `Replace ${mediumNoun}` : `Add ${mediumNoun}`}
                </span>
                <span className="text-xs font-mono text-zinc-500">Slot {activeSlot + 1}</span>
              </div>
              <button
                type="button"
                onClick={closeMobilePicker}
                className="p-2 -mr-2 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors cursor-pointer"
                aria-label="Close picker"
              >
                <X size={20} />
              </button>
            </div>
            <div className="relative px-4 pb-6 overflow-y-auto">
              {searchPanel}
              <button
                type="button"
                onClick={closeMobilePicker}
                className="mt-4 w-full py-3 rounded-xl text-sm font-semibold bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
