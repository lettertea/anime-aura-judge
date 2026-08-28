import { useState } from 'react'
import GridSelector from './components/GridSelector.jsx'
import AuraCard from './components/AuraCard.jsx'
import { computeAuraScore, localFallbackVerdict } from './utils/scoring.js'
import { getAuraVerdict } from './services/gemini.js'

const EMPTY_SLOTS = Array(9).fill(null)

export default function App() {
  const [view, setView] = useState('selection')
  const [slots, setSlots] = useState(EMPTY_SLOTS)
  const [scoreResult, setScoreResult] = useState(null)
  const [verdict, setVerdict] = useState(null)
  const [isJudging, setIsJudging] = useState(false)
  const [fade, setFade] = useState(true)
  // 'ai' = LLM verdict with local fallback; 'local' = fully deterministic, no AI.
  const [judgeMode, setJudgeMode] = useState('ai')

  const handleSelectSlot = (index, anime) => {
    setSlots((prev) => {
      const next = [...prev]
      next[index] = anime
      return next
    })
  }

  const transitionTo = (nextView) => {
    setFade(false)
    setTimeout(() => {
      setView(nextView)
      window.scrollTo({ top: 0, behavior: 'instant' })
      setFade(true)
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
      setScoreResult(score)
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
    setSlots(EMPTY_SLOTS)
    setScoreResult(null)
    setVerdict(null)
    transitionTo('selection')
  }

  return (
    <div className="min-w-[1280px] min-h-screen bg-void relative">
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
    </div>
  )
}
