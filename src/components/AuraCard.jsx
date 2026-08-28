import { useState } from 'react'
import { Download, RotateCcw, Loader2, WifiOff, AlertCircle, ChevronDown, ChevronUp, Gauge } from 'lucide-react'
import ScoreBreakdown from './ScoreBreakdown.jsx'
import { downloadCardImage } from '../utils/cardCanvas.js'

export default function AuraCard({ selectedAnime, scoreResult, verdict, onReset }) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(true)

  const { baseScore, finalScore, modifiers } = scoreResult
  const { archetype, explanation, subtitle, callout, offline, noAi } = verdict
  const modifierSum = modifiers.reduce(
    (acc, m) => acc + (m.sign === '+' ? m.pts : -m.pts),
    0,
  )

  const handleDownload = async () => {
    if (exporting) return
    setExporting(true)
    setExportError(null)
    try {
      await downloadCardImage({ selectedAnime, scoreResult, verdict })
    } catch (err) {
      console.error('Card export failed:', err)
      setExportError(
        'Card export failed. Some anime images may be blocked by CORS or network restrictions.',
      )
    } finally {
      setExporting(false)
    }
  }

  // Shared card body — rendered both on screen and inside the offscreen
  // export node so the downloaded image always contains the full card with
  // the complete analysis expanded.
  const cardBody = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-accent-glow">
            <Gauge size={18} />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Anime Aura Judge
          </h1>
        </div>
        <span className="px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900 text-xs font-mono uppercase tracking-widest text-zinc-400">
          Official Aura Assessment
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-8">
        {selectedAnime.map((anime) => (
          <div
            key={anime.mal_id}
            className="relative w-full aspect-[2/3] rounded-lg overflow-hidden border border-zinc-800"
          >
            <img
              src={anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}
              alt={anime.title}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>

      {/* Final Score — KPI card */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center shadow-2xl mb-8">
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-400">
          Final Aura Score
        </p>
        <p className="text-5xl font-extrabold tracking-tight mt-3 bg-gradient-to-b from-white to-zinc-300 bg-clip-text text-transparent">
          {finalScore.toLocaleString()}
        </p>
        <p className="text-xs font-mono text-zinc-500 mt-3">
          base {baseScore.toLocaleString()} + 9 anime modifiers ({modifierSum >= 0 ? '+' : ''}{modifierSum.toLocaleString()})
        </p>
      </div>

      {/* All 9 Anime Contributions */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-400">
            Grid Anime Contributions (All 9 Titles)
          </p>
          <span className="text-xs font-mono text-zinc-500">
            9 of 9 accounted
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {modifiers.map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700 transition-colors"
            >
              <div className="min-w-0 pr-3">
                <p className="font-medium text-sm text-zinc-200 truncate">
                  <span className="text-zinc-500 font-mono text-xs mr-1.5">#{i + 1}</span>
                  {m.animeTitle}
                </p>
                <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">{m.label}</p>
              </div>
              <span
                className={`shrink-0 px-2.5 py-1 rounded-md border font-mono text-xs font-semibold ${
                  m.sign === '+'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                }`}
              >
                {m.sign}
                {m.pts.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Analysis Summary */}
      <div className="border-t border-zinc-800 pt-8">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-400">
            Analysis Summary
          </p>
          <span className="px-2.5 py-0.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 text-xs font-mono">
            Holistic Evaluation
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-emerald-300">
          {archetype}
        </h2>
        {callout && (
          <div className="mt-3 inline-block bg-zinc-800/60 border border-zinc-700/50 px-4 py-2 rounded-lg text-zinc-200 font-medium text-sm">
            “{callout}”
          </div>
        )}
        <div className="mt-5 space-y-3 bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-xl border-l-4 border-l-indigo-500">
          {(explanation || subtitle || '')
            .split('\n\n')
            .filter(Boolean)
            .map((paragraph, idx) => (
              <p key={idx} className="text-sm text-zinc-300 leading-relaxed">
                {paragraph}
              </p>
            ))}
        </div>
      </div>

      {/* Status footer strip */}
      <div className="mt-8 pt-4 border-t border-zinc-800/60 flex items-center justify-center gap-3 text-xs font-mono text-zinc-500">
        {offline && (
          <span className="inline-flex items-center gap-1.5">
            <WifiOff size={12} />
            offline mode
          </span>
        )}
        <span>
          {offline
            ? 'deterministic fallback scoring'
            : noAi
              ? 'deterministic scoring'
              : 'AI-evaluated scoring'}
        </span>
        <span>·</span>
        <span>
          {offline
            ? 'Powered by Jikan (Local Fallback)'
            : noAi
              ? 'Powered by Jikan (No AI)'
              : 'Powered by Jikan + OpenRouter (Gemini 3.7 Flash)'}
        </span>
      </div>
    </>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      {/* Visible card */}
      <div className="max-w-[900px] mx-auto bg-zinc-900/60 backdrop-blur-md border border-zinc-800 rounded-2xl shadow-card p-4 sm:p-8">
        {cardBody}
      </div>

      {/* On-screen breakdown (display only, not part of the card) */}
      {showBreakdown && (
        <ScoreBreakdown
          selectedAnime={selectedAnime}
          scoreResult={scoreResult}
          verdict={verdict}
        />
      )}

      <div className="max-w-[900px] mx-auto mt-4 flex justify-center">
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors cursor-pointer"
        >
          {showBreakdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showBreakdown ? 'Hide full analysis' : 'Show full analysis'}
        </button>
      </div>

      {exportError && (
        <div className="max-w-[900px] mx-auto mt-4 p-4 rounded-xl bg-rose-950/30 border border-rose-500/20 flex items-center gap-3 text-rose-300 text-sm">
          <AlertCircle size={18} className="shrink-0 text-rose-400" />
          <p className="flex-1">{exportError}</p>
          <button
            onClick={handleDownload}
            className="text-xs font-semibold underline hover:text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-8">
        <button
          onClick={handleDownload}
          disabled={exporting}
          className={`flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 rounded-xl font-semibold transition-colors duration-200 ${
            exporting
              ? 'bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-accent-glow hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
          }`}
        >
          {exporting ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Download size={18} />
          )}
          {exporting ? 'Exporting...' : 'Download Card'}
        </button>
        {confirmReset ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              disabled={exporting}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold bg-rose-600 text-white hover:bg-rose-500 hover:scale-[1.02] active:scale-[0.98] transition-colors duration-200 cursor-pointer"
            >
              <RotateCcw size={18} />
              Confirm Reset?
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              disabled={exporting}
              className="px-4 py-3 rounded-xl font-medium border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            disabled={exporting}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 rounded-xl font-semibold border border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={18} />
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
