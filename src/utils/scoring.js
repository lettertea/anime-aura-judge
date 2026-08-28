// Deterministic scoring engine — all math reproducible in pure JS.
// The LLM never touches these numbers.

const GENRE_LABELS = {
  Drama: 'peak suffering',
  'Slice of Life': 'top-tier comfy vibes',
  Psychological: 'certified brainrot',
  Romance: 'heart-on-sleeve energy',
  Ecchi: 'guilty pleasure',
  Harem: 'guilty pleasure',
  Action: 'adrenaline junkie certified',
  Comedy: 'certified clown connoisseur',
  Fantasy: 'isekai-brained dreamer',
  'Sci-Fi': 'galaxy-bred tech optimist',
  Horror: 'connoisseur of suffering',
  Sports: 'sweat-and-tears believer',
  Mystery: 'professional overthinker',
  Supernatural: 'spiritually unwell',
  Mecha: 'big robot enjoyer',
  Music: 'emotional damage via soundtracks',
  Adventure: 'wanderlust terminal case',
  Thriller: 'chronic heart-rate offender',
  Gourmet: 'food-coma philosopher',
  Award: 'prestige pilled',
  Avant: 'too artsy for this world',
  Boys: 'fujoshi enrolled',
  Girls: 'moe-ified beyond repair',
  Parody: 'irony-poisoned memelord',
  Samurai: 'honor-bound weeb',
  Space: 'astral escapism enjoyer',
  Military: 'tactics-brained strategist',
  School: 'never left the classroom',
  Kids: 'inner child thriving',
}

export function primaryGenre(anime) {
  if (anime.genres && anime.genres.length > 0) return anime.genres[0].name
  return 'Unknown'
}

export function genreLabel(anime) {
  const g = primaryGenre(anime)
  return GENRE_LABELS[g] || 'objectively a certified pick'
}

export function computeAuraScore(selectedAnime) {
  // Canonical order: same 9 titles always yield identical output regardless
  // of the order they were selected in.
  const canonical = [...selectedAnime].sort((a, b) => a.mal_id - b.mal_id)
  const seed = canonical.reduce((acc, a) => acc + a.mal_id * 31, 0)

  const baseScore = 10000 + (seed % 25000)

  // --- Three modifiers ---
  let idx = [seed, seed >> 3, seed >> 6].map((x) => x % 9)
  // resolve index collisions: offset each colliding index by +1 (mod 9) until distinct
  const usedIdx = new Set()
  idx = idx.map((i) => {
    let j = i
    while (usedIdx.has(j)) {
      j = (j + 1) % 9
    }
    usedIdx.add(j)
    return j
  })

  let vals = idx.map((i) => ((seed >> (i * 4)) % 5000) + 3000)
  // resolve value collisions: add (i + 1) * 777 to the later colliding value
  const seenVals = new Set()
  vals = vals.map((v, i) => {
    let out = v
    while (seenVals.has(out)) {
      out = out + (i + 1) * 777
    }
    seenVals.add(out)
    return out
  })

  const modifiers = idx.map((i, k) => {
    const anime = canonical[i]
    const label = genreLabel(anime)
    let sign = ((seed >> (k * 5)) % 2 === 0) ? '+' : '-'
    if (label === 'guilty pleasure') sign = '-'
    return {
      animeTitle: anime.title,
      pts: vals[k],
      sign,
      label,
    }
  })

  const modifierDelta = modifiers.reduce(
    (acc, m) => acc + (m.sign === '+' ? m.pts : -m.pts),
    0,
  )
  const finalScore = baseScore + modifierDelta

  return {
    seed,
    baseScore,
    finalScore,
    modifiers,
  }
}

const FALLBACK_ARCHETYPES = [
  'Chaotic Sentimentalist',
  'Egoist Terminal Online',
  'Comfy Cozy Cult Leader',
  'Tsundere With A Database',
  'Certified Yapper Prime',
  'Suffering Sommelier',
  'Isekai Escape Artist',
  'Brainrot Archivist',
  'Doomed By The Backlog',
  'Peak Fiction Preacher',
  'Cozmaxxer Supreme',
  'Manifesting A Season 2',
]

export function localFallbackVerdict(seed) {
  const archetype = FALLBACK_ARCHETYPES[seed % 12]
  return {
    archetype,
    subtitle: 'The grid speaks for itself, and it is not apologizing.',
    callout: 'Touch grass or start a cult, honestly.',
  }
}
