import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Download, RotateCcw, Loader2, WifiOff, AlertCircle } from 'lucide-react'

export default function AuraCard({ selectedAnime, scoreResult, verdict, onReset }) {
  const cardRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const { baseScore, finalScore, modifiers } = scoreResult
  const { archetype, subtitle, callout, offline } = verdict

  const handleDownload = async () => {
    if (exporting || !cardRef.current) return
    setExporting(true)
    setExportError(null)
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        skipFonts: true,
      })
      const link = document.createElement('a')
      link.download = 'anime-aura-card.png'
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Card export failed:', err)
      setExportError(
        'Card export failed. Some anime images may be blocked by CORS or network restrictions.',
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="w-[1280px] mx-auto py-10">
      <div ref={cardRef} className="w-[900px] mx-auto bg-abyss border-2 border-aura-purple/50 rounded-2xl shadow-glow p-8">
        <div className="text-center mb-6">
          <p className="text-xs font-bold tracking-[0.4em] text-aura-pink uppercase">
            Official Aura Assessment
          </p>
          <h1 className="text-3xl font-black mt-1 bg-gradient-to-r from-aura-purple to-aura-pink bg-clip-text text-transparent">
            ANIME AURA JUDGE
          </h1>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {selectedAnime.map((anime) => (
            <div
              key={anime.mal_id}
              className="relative w-full h-[220px] rounded-lg overflow-hidden border border-aura-purple/30"
            >
              <img
                src={anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}
                alt={anime.title}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>

        <div className="bg-void rounded-xl border border-aura-pink/30 p-6 text-center mb-6">
          <p className="text-slate-400 text-sm font-semibold tracking-widest uppercase">
            Final Aura Score
          </p>
          <p className="text-6xl font-black mt-2 bg-gradient-to-r from-aura-purple via-aura-neon to-aura-pink bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(217,70,239,0.4)]">
            {finalScore.toLocaleString()}
          </p>
          <p className="text-slate-500 text-xs mt-2">
            base {baseScore.toLocaleString()} + modifiers
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {modifiers.map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-void border border-slate-700 rounded-lg px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-100 truncate">{m.animeTitle}</p>
                <p className="text-xs text-slate-500">{m.label}</p>
              </div>
              <span
                className={`ml-4 shrink-0 text-xl font-black ${
                  m.sign === '+' ? 'text-emerald-400' : 'text-aura-pink'
                }`}
              >
                {m.sign}
                {m.pts.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <div className="text-center border-t border-slate-800 pt-6">
          <p className="text-xs font-bold tracking-[0.3em] text-slate-500 uppercase mb-2">
            Archetype
          </p>
          <h2 className="text-3xl font-black text-aura-neon drop-shadow-[0_0_10px_rgba(217,70,239,0.5)]">
            {archetype}
          </h2>
          <p className="text-slate-300 mt-3 italic">{subtitle}</p>
          <p className="text-aura-pink font-bold mt-4">“{callout}”</p>
        </div>

        {offline && (
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
            <WifiOff size={14} />
            <span>offline mode — verdict generated locally</span>
          </div>
        )}

        <div className="text-center mt-6 text-[10px] text-slate-600 tracking-widest uppercase">
          Deterministic scoring · {offline ? 'Powered by Jikan (Local Fallback)' : 'Powered by Jikan + OpenRouter'}
        </div>
      </div>

      {exportError && (
        <div className="w-[900px] mx-auto mt-4 p-4 rounded-xl bg-red-950/40 border border-red-500/40 flex items-center gap-3 text-red-300 text-sm">
          <AlertCircle size={18} className="shrink-0 text-red-400" />
          <p className="flex-1">{exportError}</p>
          <button
            onClick={handleDownload}
            className="text-xs font-bold underline hover:text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex items-center justify-center gap-4 mt-8">
        <button
          onClick={handleDownload}
          disabled={exporting}
          className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all duration-200 ${
            exporting
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-aura-purple to-aura-pink text-white shadow-glow hover:scale-105 active:scale-95 cursor-pointer'
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
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-aura-pink text-white shadow-glow-pink hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
            >
              <RotateCcw size={18} />
              Confirm Reset?
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              disabled={exporting}
              className="px-4 py-3 rounded-xl font-semibold border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            disabled={exporting}
            className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold border border-slate-700 text-slate-300 hover:border-aura-pink/60 hover:text-aura-pink transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={18} />
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
