import { useState } from 'react'
import GridSelector from './components/GridSelector.jsx'
import AuraCard from './components/AuraCard.jsx'
import { computeAuraScore, localFallbackVerdict } from './utils/scoring.js'
import { getAuraVerdict } from './services/gemini.js'

const EMPTY_SLOTS = Array(9).fill(null)

function loadMediaType() {
  try {
    return localStorage.getItem('aura-media-type') === 'MANGA' ? 'MANGA' : 'ANIME'
  } catch {
    return 'ANIME'
  }
}

export default function App() {
  const [view, setView] = useState('selection')
  const [slots, setSlots] = useState(EMPTY_SLOTS)
  const [scoreResult, setScoreResult] = useState(null)
  const [verdict, setVerdict] = useState(null)
  const [isJudging, setIsJudging] = useState(false)
  const [fade, setFade] = useState(true)
  // 'ai' = LLM verdict with local fallback; 'local' = fully deterministic, no AI.
  const [judgeMode, setJudgeMode] = useState('ai')
  // 'ANIME' | 'MANGA' — persisted so the mode survives reloads.
  const [mediaType, setMediaType] = useState(loadMediaType)
  // Pending mode switch awaiting user confirmation (grid is non-empty).
  const [pendingMediaType, setPendingMediaType] = useState(null)

  const handleSelectSlot = (index, anime) => {
    setSlots((prev) => {
      const next = [...prev]
      next[index] = anime
      return next
    })
  }

  const transitionTo = (nextView, onComplete) => {
    setFade(false)
    setTimeout(() => {
      setView(nextView)
      window.scrollTo({ top: 0, behavior: 'instant' })
      setFade(true)
      if (onComplete) onComplete()
    }, 200)
  }

  const handleJudge = async () => {
    if (slots.some((s) => !s) || isJudging) return
    setIsJudging(true)
    const score = computeAuraScore(slots)
    if (judgeMode === 'local') {
      // No-AI mode: skip the LLM entirely, use the deterministic verdict.
      setScoreResult(score)
      setVerdict({
        ...localFallbackVerdict(score.seed, slots),
        noAi: true,
      })
      transitionTo('results')
      setIsJudging(false)
      return
    }
    try {
      const v = await getAuraVerdict(score, slots)
      // AI mode may return its own AI-evaluated scoreResult; fall back to the
      // deterministic one if the model didn't provide valid modifiers.
      setScoreResult(v.scoreResult || score)
      setVerdict(v)
      transitionTo('results')
    } catch (err) {
      console.error('Judging failed:', err)
      setScoreResult(score)
      setVerdict({
        ...localFallbackVerdict(score.seed, slots),
        subtitle: 'The judge tripped over the cable, but your grid remains guilty.',
        offline: true,
      })
      transitionTo('results')
    } finally {
      setIsJudging(false)
    }
  }

  const handleReset = () => {
    // Switch views first, then clear state — clearing while AuraCard is still
    // mounted would crash it (it reads scoreResult.baseScore) and blank the page.
    transitionTo('selection', () => {
      setSlots(Array(9).fill(null))
      setScoreResult(null)
      setVerdict(null)
    })
  }

  const filledCount = slots.filter(Boolean).length

  const applyMediaType = (next) => {
    setMediaType(next)
    try {
      localStorage.setItem('aura-media-type', next)
    } catch {
      /* private mode — persistence is best-effort */
    }
  }

  const handleMediaTypeChange = (next) => {
    if (next === mediaType) return
    if (filledCount > 0) {
      // Non-empty grid: ask before wiping it.
      setPendingMediaType(next)
    } else {
      applyMediaType(next)
    }
  }

  const confirmMediaTypeSwitch = () => {
    if (pendingMediaType) {
      applyMediaType(pendingMediaType)
      setSlots(EMPTY_SLOTS)
      setScoreResult(null)
      setVerdict(null)
    }
    setPendingMediaType(null)
  }

  const cancelMediaTypeSwitch = () => setPendingMediaType(null)

  return (
    <div className="min-h-screen bg-void relative">
      {/* Subtle radial spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99, 102, 241, 0.05), transparent 70%), radial-gradient(ellipse 40% 40% at 80% 0%, rgba(16, 185, 129, 0.03), transparent 70%)',
        }}
      />
      <div
        className={`relative transition-opacity duration-200 ${fade ? 'opacity-100' : 'opacity-0'}`}
      >
        {view === 'selection' ? (
          <GridSelector
            slots={slots}
            onSelectSlot={handleSelectSlot}
            onJudge={handleJudge}
            isJudging={isJudging}
            judgeMode={judgeMode}
            onJudgeModeChange={setJudgeMode}
            mediaType={mediaType}
            onMediaTypeChange={handleMediaTypeChange}
          />
        ) : (
          <AuraCard
            selectedAnime={slots}
            scoreResult={scoreResult}
            verdict={verdict}
            onReset={handleReset}
          />
        )}
      </div>

      {/* Mode switch confirmation — shown only when the grid has picks */}
      {pendingMediaType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={cancelMediaTypeSwitch}
          />
          <div className="relative max-w-sm w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-zinc-100">
              Switch to {pendingMediaType === 'MANGA' ? 'Manga' : 'Anime'} mode?
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Switching to {pendingMediaType === 'MANGA' ? 'Manga' : 'Anime'} mode will clear your
              current grid. Continue?
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelMediaTypeSwitch}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMediaTypeSwitch}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
