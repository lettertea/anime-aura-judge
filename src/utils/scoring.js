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

// ---------------------------------------------------------------------------
// RPG Character Sheet — deterministic stats derived from grid genres + seed.
// ---------------------------------------------------------------------------

const STAT_GENRE_MAP = {
  Chaos: ['Action', 'Horror', 'Thriller', 'Sports', 'Mecha', 'Samurai'],
  Comf: ['Slice of Life', 'Music', 'Kids', 'Gourmet', 'Parody'],
  Brainrot: ['Mystery', 'Psychological', 'Sci-Fi', 'Space', 'Military', 'Avant'],
  Suffering: ['Drama', 'Horror', 'Thriller', 'Psychological', 'Boys'],
  Rizz: ['Romance', 'Comedy', 'Ecchi', 'Harem', 'Girls', 'School'],
}

export const STAT_KEYS = ['Chaos', 'Comf', 'Brainrot', 'Suffering', 'Rizz']

const STAT_ICONS = {
  Chaos: '⚡',
  Comf: '🫧',
  Brainrot: '🧠',
  Suffering: '😭',
  Rizz: '😏',
}

const STAT_BLURBS = {
  Chaos: 'you main high-APM content and it shows',
  Comf: 'your nervous system is sponsored by iyashikei',
  Brainrot: 'you watch anime with a spreadsheet open',
  Suffering: 'you collect emotional damage like trading cards',
  Rizz: 'somehow every pick has a confession scene',
}

const CLASS_PREFIX = {
  Chaos: 'Chaotic',
  Comf: 'Comfy',
  Brainrot: 'Brainrotted',
  Suffering: 'Doomed',
  Rizz: 'Rizzler',
}

const CLASS_NOUNS = {
  Chaos: ['Warlock', 'Berserker', 'Monk', 'Bard'],
  Comf: ['Healer', 'Druid', 'Bard', 'Innkeeper'],
  Brainrot: ['Archmage', 'Artificer', 'Scribe', 'Oracle'],
  Suffering: ['Necromancer', 'Warlock', 'Rogue', 'Martyr'],
  Rizz: ['Rogue', 'Bard', 'Enchanter', 'Duke'],
}

const CLASS_SUFFIXES = [
  'of the Backlog',
  'of Peak Fiction',
  'of the 2am Watchlist',
  'of Seasonal Rot',
  'of the Infinite PTW',
  'of Sub-Only Truth',
  'of the Dropped Manga',
  'of Dub Disrespect',
]

export function computeStats(selectedAnime, seed) {
  const raw = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]))
  for (const anime of selectedAnime) {
    const genres = (anime.genres || []).map((g) => g.name)
    for (const stat of STAT_KEYS) {
      for (const g of genres) {
        if (STAT_GENRE_MAP[stat].includes(g)) raw[stat] += 1
      }
    }
  }
  // Seed-based jitter so sparse grids still produce varied bars, then
  // normalize to 0-100 with a floor so nothing reads as literally zero.
  const jittered = STAT_KEYS.map((k, i) => raw[k] * 10 + ((seed >> (i * 3)) % 25))
  const max = Math.max(...jittered, 1)
  const stats = {}
  STAT_KEYS.forEach((k, i) => {
    stats[k] = Math.max(8, Math.round((jittered[i] / max) * 100))
  })

  // Class: prefix from top stat, noun from runner-up, suffix from seed.
  const ranked = [...STAT_KEYS].sort((a, b) => stats[b] - stats[a] || a.localeCompare(b))
  const top = ranked[0]
  const second = ranked[1]
  const nouns = CLASS_NOUNS[second]
  const className = `${CLASS_PREFIX[top]} ${nouns[seed % nouns.length]} ${CLASS_SUFFIXES[(seed >> 5) % CLASS_SUFFIXES.length]}`

  return {
    stats,
    icons: STAT_ICONS,
    blurbs: STAT_BLURBS,
    topStat: top,
    className,
  }
}

// ---------------------------------------------------------------------------
// Offline roast templates — deterministic per-anime one-liners.
// ---------------------------------------------------------------------------

const ROAST_TEMPLATES = {
  Action: 'picked for the plot. the plot was fighting. respect.',
  Adventure: 'wanderlust so strong you forgot season 2 exists',
  Avant: 'nobody knows what happened and you refuse to explain',
  Comedy: 'your humor is legally distinct from brain damage',
  Drama: 'you did this to yourself and you would do it again',
  Ecchi: 'we all saw it. we are not going to talk about it.',
  Fantasy: 'escapism speedrun, any% no grass',
  Gourmet: 'watched on an empty stomach. criminal.',
  Harem: 'the protagonist chose nobody and neither did you',
  Horror: 'you call this fun. HR would like a word.',
  Kids: 'healing your inner child or just avoiding adulthood?',
  Mecha: 'big robot enjoyer. the robot is doing the heavy lifting.',
  Military: 'you have opinions about logistics now',
  Music: 'cried at a concert that never happened',
  Mystery: 'you guessed the twist. you tell everyone. constantly.',
  Parody: 'irony levels critical. sincerity not found.',
  Psychological: 'this is not entertainment, this is homework',
  Romance: 'kicked your feet. denied it in public.',
  School: 'graduated years ago. still enrolled spiritually.',
  'Sci-Fi': 'will explain the tech tree unprompted',
  'Slice of Life': 'nothing happened and it changed you',
  Space: 'the final frontier was your couch',
  Sports: 'screamed at fictional teenagers. no regrets.',
  Supernatural: 'spiritually unwell, aesthetically correct',
  Thriller: 'resting heart rate: cancelled',
  Boys: 'the shipping wall sees everything',
  Girls: 'moe tolerance: maximum',
  Samurai: 'honor-bound and chronically online',
  Unknown: 'defied categorization. the judge is concerned.',
}

export function offlineRoast(anime, seed, index) {
  const g = primaryGenre(anime)
  const base = ROAST_TEMPLATES[g] || ROAST_TEMPLATES.Unknown
  const variants = [
    base,
    `${anime.title}: ${base}`,
    `${base} (${anime.title} was the tell.)`,
  ]
  return variants[(seed + index * 7) % variants.length]
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

export function localFallbackVerdict(seed, selectedAnime) {
  const sheet = computeStats(selectedAnime || [], seed)
  const roasts = (selectedAnime || []).map((a, i) => offlineRoast(a, seed, i))
  return {
    archetype: sheet.className,
    subtitle: 'The grid speaks for itself, and it is not apologizing.',
    callout: 'Touch grass or start a cult, honestly.',
    characterBio: `A level ${((seed % 40) + 10)} ${sheet.className}. Specializes in ${sheet.topStat.toLowerCase()} builds and refuses to respec.`,
    roasts,
    sheet,
  }
}
