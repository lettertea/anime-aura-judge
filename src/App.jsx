import { useState } from 'react'
import GridSelector from './components/GridSelector.jsx'
import AuraCard from './components/AuraCard.jsx'
import { computeAuraScore } from './utils/scoring.js'
import { getAuraVerdict } from './services/gemini.js'

const EMPTY_SLOTS = Array(9).fill(null)

export default function App() {
  const [view, setView] = useState('selection')
  const [slots, setSlots] = useState(EMPTY_SLOTS)
  const [scoreResult, setScoreResult] = useState(null)
  const [verdict, setVerdict] = useState(null)
  const [isJudging, setIsJudging] = useState(false)
  const [fade, setFade] = useState(true)

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
    try {
      const score = computeAuraScore(slots)
      const v = await getAuraVerdict(score, slots)
      setScoreResult(score)
      setVerdict(v)
      transitionTo('results')
    } catch (err) {
      console.error('Judging failed:', err)
      const score = computeAuraScore(slots)
      setScoreResult(score)
      setVerdict({
        archetype: 'Aura Reader Error',
        subtitle: 'The judge tripped over the cable, but your grid remains guilty.',
        callout: 'Touch grass or start a cult, honestly.',
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
    <div className="min-w-[1280px] min-h-screen bg-void">
      <div
        className={`transition-opacity duration-200 ${fade ? 'opacity-100' : 'opacity-0'}`}
      >
        {view === 'selection' ? (
          <GridSelector
            slots={slots}
            onSelectSlot={handleSelectSlot}
            onJudge={handleJudge}
            isJudging={isJudging}
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
