import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const STAT_BAR_COLORS = {
  Chaos: 'from-red-500 to-orange-400',
  Comf: 'from-sky-400 to-cyan-300',
  Brainrot: 'from-violet-500 to-fuchsia-400',
  Suffering: 'from-aura-purple to-aura-pink',
  Rizz: 'from-emerald-400 to-lime-300',
}

function Section({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-void border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/40 transition-colors cursor-pointer"
      >
        <span className="font-bold text-slate-200 tracking-wide">
          <span className="mr-2">{icon}</span>
          {title}
        </span>
        {open ? (
          <ChevronUp size={18} className="text-aura-pink shrink-0" />
        ) : (
          <ChevronDown size={18} className="text-slate-500 shrink-0" />
        )}
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  )
}

function StatBar({ stat, value, icon, blurb }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-bold text-slate-200">
          {icon} {stat}
        </span>
        <span className="text-xs font-mono text-slate-400">{value}/100</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${STAT_BAR_COLORS[stat]} transition-all duration-700`}
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="text-[11px] text-slate-500 mt-1 italic">{blurb}</p>
    </div>
  )
}

export default function ScoreBreakdown({ selectedAnime, scoreResult, verdict }) {
  const { seed, baseScore, finalScore, modifiers } = scoreResult
  const sheet = verdict.sheet
  const roasts = verdict.roasts || []
  const characterBio = verdict.characterBio || ''

  const genreTags = []
  const seen = new Set()
  for (const anime of selectedAnime) {
    for (const g of anime.genres || []) {
      if (!seen.has(g.name)) {
        seen.add(g.name)
        genreTags.push(g.name)
      }
    }
  }

  return (
    <div className="w-[900px] mx-auto mt-6 space-y-3">
      {/* Stat Sheet — open by default, it's the star of the show */}
      {sheet && (
        <Section title="Character Sheet" icon="⚔️" defaultOpen>
          <div className="grid grid-cols-2 gap-6">
            <div>
              {Object.entries(sheet.stats).map(([stat, value]) => (
                <StatBar
                  key={stat}
                  stat={stat}
                  value={value}
                  icon={sheet.icons[stat]}
                  blurb={sheet.blurbs[stat]}
                />
              ))}
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-xs font-bold tracking-[0.3em] text-slate-500 uppercase mb-1">
                Class
              </p>
              <p className="text-2xl font-black text-aura-neon leading-tight">
                {sheet.className}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                top stat: {sheet.icons[sheet.topStat]} {sheet.topStat}
              </p>
              {characterBio && (
                <p className="text-sm text-slate-300 mt-4 italic leading-relaxed">
                  {characterBio}
                </p>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* The Roasts */}
      {roasts.length > 0 && (
        <Section title="The Roasts" icon="🔥">
          <div className="space-y-2">
            {selectedAnime.map((anime, i) => (
              <div
                key={anime.mal_id}
                className="flex items-start gap-3 bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-3"
              >
                <img
                  src={anime.images?.jpg?.small_image_url || anime.images?.jpg?.image_url}
                  alt=""
                  className="w-9 h-12 object-cover rounded shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-200 truncate">
                    {anime.title}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{roasts[i]}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* The Math */}
      <Section title="The Math" icon="🧮">
        <div className="font-mono text-sm space-y-2">
          <div className="flex justify-between text-slate-400">
            <span>seed (from your 9 mal_ids)</span>
            <span className="text-slate-200">{seed}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>base score</span>
            <span className="text-slate-200">+{baseScore.toLocaleString()}</span>
          </div>
          {modifiers.map((m, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-slate-500 truncate mr-4">
                {m.animeTitle} — {m.label}
              </span>
              <span className={m.sign === '+' ? 'text-emerald-400' : 'text-aura-pink'}>
                {m.sign}
                {m.pts.toLocaleString()}
              </span>
            </div>
          ))}
          <div className="border-t border-slate-800 pt-2 flex justify-between font-bold">
            <span className="text-slate-300">final aura</span>
            <span className="bg-gradient-to-r from-aura-purple to-aura-pink bg-clip-text text-transparent">
              {finalScore.toLocaleString()}
            </span>
          </div>
        </div>
      </Section>

      {/* Genre Tags */}
      {genreTags.length > 0 && (
        <Section title="Genre Autopsy" icon="🏷️">
          <div className="flex flex-wrap gap-2">
            {genreTags.map((g) => (
              <span
                key={g}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-800/80 border border-aura-purple/30 text-slate-300"
              >
                {g}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
