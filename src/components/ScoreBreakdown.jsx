import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const STAT_BAR_COLORS = {
  Chaos: 'from-rose-500 to-orange-400',
  Comf: 'from-sky-500 to-cyan-400',
  Brainrot: 'from-violet-500 to-fuchsia-400',
  Suffering: 'from-indigo-500 to-violet-400',
  Rizz: 'from-emerald-500 to-lime-400',
}

function Section({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-800/40 transition-colors cursor-pointer"
      >
        <span className="font-medium text-zinc-200 tracking-tight">
          <span className="mr-2">{icon}</span>
          {title}
        </span>
        {open ? (
          <ChevronUp size={18} className="text-indigo-400 shrink-0" />
        ) : (
          <ChevronDown size={18} className="text-zinc-500 shrink-0" />
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
        <span className="text-sm font-medium text-zinc-200">
          {icon} {stat}
        </span>
        <span className="text-xs font-mono text-zinc-400">{value}/100</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${STAT_BAR_COLORS[stat]} transition-[width] duration-700`}
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="text-[11px] text-zinc-500 mt-1 italic">{blurb}</p>
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
              <p className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-1">
                Class
              </p>
              <p className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-emerald-300 leading-tight">
                {sheet.className}
              </p>
              <p className="text-xs font-mono text-zinc-500 mt-1">
                top stat: {sheet.icons[sheet.topStat]} {sheet.topStat}
              </p>
              {characterBio && (
                <p className="text-sm text-zinc-300 mt-4 italic leading-relaxed">
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
                className="flex items-start gap-3 bg-zinc-900/30 border border-zinc-800/80 rounded-lg px-4 py-3"
              >
                <img
                  src={anime.images?.jpg?.small_image_url || anime.images?.jpg?.image_url}
                  alt=""
                  className="w-9 h-12 object-cover rounded shrink-0 border border-zinc-800"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">
                    {anime.title}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">{roasts[i]}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* The Math */}
      <Section title="The Math" icon="🧮">
        <div className="font-mono text-sm space-y-2">
          <div className="flex justify-between text-zinc-400">
            <span>seed (from your 9 mal_ids)</span>
            <span className="text-zinc-200">{seed}</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>base grid resonance</span>
            <span className="text-zinc-200">
              +{scoreResult.baseDetails?.baseline?.toLocaleString() || '10,000'}
            </span>
          </div>
          {scoreResult.baseDetails?.diversityBonus > 0 && (
            <div className="flex justify-between text-zinc-400">
              <span>
                genre diversity bonus ({scoreResult.baseDetails.uniqueGenres} unique genres)
              </span>
              <span className="text-emerald-400">
                +{scoreResult.baseDetails.diversityBonus.toLocaleString()}
              </span>
            </div>
          )}
          {scoreResult.baseDetails?.harmonyBonus > 0 && (
            <div className="flex justify-between text-zinc-400">
              <span>score harmony bonus</span>
              <span className="text-emerald-400">
                +{scoreResult.baseDetails.harmonyBonus.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between text-zinc-300 border-b border-zinc-800/80 pb-2 font-medium">
            <span>total base score</span>
            <span className="text-zinc-100">+{baseScore.toLocaleString()}</span>
          </div>

          <div className="pt-2 pb-1 text-xs text-zinc-500 uppercase tracking-wider font-semibold">
            All 9 Anime Contributions
            {scoreResult.aiScored && (
              <span className="ml-2 normal-case tracking-normal text-violet-400 font-medium">
                ✦ AI-evaluated
              </span>
            )}
          </div>
          {modifiers.map((m, i) => (
            <div key={i} className="flex justify-between items-center text-xs sm:text-sm">
              <span className="text-zinc-400 truncate mr-4">
                <span className="text-zinc-600 mr-2 font-mono">#{i + 1}</span>
                {m.animeTitle} <span className="text-zinc-600">—</span>{' '}
                <span className="text-zinc-500">{m.label}</span>
              </span>
              <span
                className={`shrink-0 font-medium ${
                  m.sign === '+' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {m.sign}
                {m.pts.toLocaleString()}
              </span>
            </div>
          ))}
          <div className="border-t border-zinc-800 pt-2 flex justify-between font-semibold">
            <span className="text-zinc-300">final aura</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-emerald-300">
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
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-800/60 border border-zinc-700/60 text-zinc-300"
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
