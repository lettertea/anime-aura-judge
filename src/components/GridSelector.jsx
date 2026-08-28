import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Loader2, X, Sparkles } from 'lucide-react'

const JIKAN_SEARCH = 'https://api.jikan.moe/v4/anime?q='

export default function GridSelector({ slots, onSelectSlot, onJudge, isJudging }) {
  const [modalSlot, setModalSlot] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)

  const filledCount = slots.filter(Boolean).length
  const busy = isJudging || searching

  const openModal = (index) => {
    if (slots[index] || isJudging) return
    setModalSlot(index)
    setQuery('')
    setResults([])
    setSearchError(null)
  }

  const closeModal = () => {
    setModalSlot(null)
    setQuery('')
    setResults([])
    setSearchError(null)
  }

  const doSearch = useCallback(async (q) => {
    setSearching(true)
    setSearchError(null)
    try {
      const res = await fetch(
        `${JIKAN_SEARCH}${encodeURIComponent(q)}&limit=6`,
      )
      if (!res.ok) throw new Error(`Jikan error ${res.status}`)
      const data = await res.json()
      setResults(data.data || [])
    } catch (err) {
      setSearchError('Search failed. Try again.')
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!modalSlot) return undefined
    if (!query.trim()) {
      setResults([])
      setSearching(false)
      return undefined
    }
    setSearching(true)
    const t = setTimeout(() => doSearch(query.trim()), 400)
    return () => clearTimeout(t)
  }, [query, modalSlot, doSearch])

  useEffect(() => {
    if (modalSlot && inputRef.current) inputRef.current.focus()
  }, [modalSlot])

  const pick = (anime) => {
    onSelectSlot(modalSlot, anime)
    closeModal()
  }

  return (
    <div className="w-[1280px] mx-auto py-10">
      <header className="text-center mb-10">
        <h1 className="text-5xl font-black tracking-tight bg-gradient-to-r from-aura-purple via-aura-neon to-aura-pink bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(168,85,247,0.5)]">
          ANIME AURA JUDGE
        </h1>
        <p className="mt-3 text-slate-400 text-lg">
          Pick 9 anime. Receive judgment. No mercy.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-5 w-[820px] mx-auto">
        {slots.map((anime, i) => (
          <button
            key={i}
            onClick={() => openModal(i)}
            disabled={busy}
            className={`group relative w-[260px] h-[380px] rounded-xl overflow-hidden border-2 transition-all duration-200 ${
              anime
                ? 'border-aura-purple/60 shadow-glow'
                : 'border-slate-700/60 bg-abyss hover:border-aura-pink/70 hover:shadow-glow-pink'
            } ${busy ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {anime ? (
              <>
                <img
                  src={anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}
                  alt={anime.title}
                  crossOrigin="anonymous"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-void via-void/80 to-transparent p-3">
                  <p className="text-sm font-semibold text-slate-100 line-clamp-2">
                    {anime.title}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 group-hover:text-aura-pink transition-colors">
                <Sparkles size={36} />
                <span className="text-sm font-medium">Slot {i + 1}</span>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="text-center mt-10">
        <p className="text-slate-400 mb-4">
          {filledCount}/9 slots filled
        </p>
        <button
          onClick={onJudge}
          disabled={filledCount < 9 || isJudging}
          className={`px-10 py-4 rounded-xl text-lg font-bold transition-all duration-200 ${
            filledCount < 9 || isJudging
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-aura-purple to-aura-pink text-white shadow-glow hover:scale-105 active:scale-95 cursor-pointer'
          }`}
        >
          {isJudging ? (
            <span className="flex items-center gap-2 justify-center">
              <Loader2 className="animate-spin" size={20} />
              Consulting the aura realm...
            </span>
          ) : (
            'Judge My Grid'
          )}
        </button>
      </div>

      {modalSlot !== null && (
        <div className="fixed inset-0 bg-void/90 flex items-center justify-center z-50">
          <div className="w-[720px] bg-abyss border border-aura-purple/40 rounded-2xl shadow-glow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-100">
                Search for slot {modalSlot + 1}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-aura-pink transition-colors cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>

            <div className="relative mb-4">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type an anime title..."
                disabled={isJudging}
                className="w-full bg-void border border-slate-700 rounded-lg py-3 pl-10 pr-4 text-slate-100 placeholder-slate-600 focus:border-aura-purple focus:outline-none"
              />
              {searching && (
                <Loader2
                  size={18}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-aura-pink animate-spin"
                />
              )}
            </div>

            {searchError && (
              <p className="text-aura-pink text-sm mb-3">{searchError}</p>
            )}

            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {results.map((anime) => {
                const alreadyPicked = slots.some(
                  (s, i) => s && s.mal_id === anime.mal_id && i !== modalSlot,
                )
                return (
                  <button
                    key={anime.mal_id}
                    onClick={() => pick(anime)}
                    disabled={alreadyPicked}
                    className={`w-full flex items-center gap-4 p-3 rounded-lg border transition-all duration-150 text-left ${
                      alreadyPicked
                        ? 'border-slate-800 bg-slate-900/50 opacity-40 cursor-not-allowed'
                        : 'border-slate-700 bg-void hover:border-aura-pink/60 hover:bg-slate-900 cursor-pointer'
                    }`}
                  >
                    <img
                      src={anime.images?.jpg?.small_image_url || anime.images?.jpg?.image_url}
                      alt={anime.title}
                      crossOrigin="anonymous"
                      className="w-10 h-14 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 truncate">
                        {anime.title}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {(anime.genres || []).map((g) => g.name).join(', ') || 'Unknown genre'}
                        {anime.year ? ` · ${anime.year}` : ''}
                      </p>
                    </div>
                    {alreadyPicked && (
                      <span className="text-xs text-slate-500">already picked</span>
                    )}
                  </button>
                )
              })}
              {!searching && query.trim() && results.length === 0 && !searchError && (
                <p className="text-slate-500 text-sm text-center py-6">
                  No results found.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
