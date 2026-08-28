// Deterministic scoring engine — all math reproducible in pure JS.
// The LLM never touches these numbers.

const GENRE_LABELS = {
  Drama: 'peak suffering',
  'Slice of Life': 'top-tier comfy vibes',
  Psychological: 'certified brainrot',
  Romance: 'heart-on-sleeve energy',
  Ecchi: 'guilty pleasure hazard',
  Harem: 'guilty pleasure hazard',
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
  Samurai: 'honor-bound warrior ethos',
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
  // Canonical order for seed generation:
  // Same 9 titles always yield identical seed regardless of selection order.
  const canonical = [...selectedAnime].sort((a, b) => a.mal_id - b.mal_id)
  const seed = canonical.reduce((acc, a) => acc + a.mal_id * 31, 0)

  // 1. Transparent Base Score Calculation
  const baseline = 10000
  const uniqueGenres = new Set(
    selectedAnime.flatMap((a) => (a.genres || []).map((g) => g.name)),
  ).size
  const diversityBonus = uniqueGenres * 500

  const scoredAnime = selectedAnime.filter((a) => typeof a.score === 'number' && a.score > 0)
  const avgScore =
    scoredAnime.length > 0
      ? scoredAnime.reduce((acc, a) => acc + a.score, 0) / scoredAnime.length
      : 7.5
  const harmonyBonus = Math.max(0, Math.round((avgScore - 5.0) * 400))

  const baseScore = baseline + diversityBonus + harmonyBonus
  const baseDetails = {
    baseline,
    diversityBonus,
    uniqueGenres,
    harmonyBonus,
    avgScore: Number(avgScore.toFixed(2)),
  }

  // 2. All 9 Anime Modifiers in grid order
  const modifiers = selectedAnime.map((anime, idx) => {
    const label = genreLabel(anime)
    const g = primaryGenre(anime)
    const scoreVal = typeof anime.score === 'number' && anime.score > 0 ? anime.score : 7.5

    // Seed per anime
    const animeSeed = Math.abs((anime.mal_id * 37 + (seed >> (idx * 2))) % 10000)

    // Base points scaled from rating plus deterministic variance
    const scorePoints = Math.round((scoreVal / 10) * 2200)
    const variance = (animeSeed % 950) + 450
    const pts = Math.min(4500, Math.max(1200, scorePoints + variance))

    // Sign logic based on genre dynamics and deterministic seed
    let sign = '+'
    if (label.includes('guilty pleasure') || g === 'Ecchi' || g === 'Harem') {
      sign = '-'
    } else if (g === 'Drama' || g === 'Horror' || g === 'Supernatural') {
      sign = animeSeed % 3 === 0 ? '-' : '+'
    } else if (g === 'Parody' || g === 'Comedy') {
      sign = animeSeed % 4 === 0 ? '-' : '+'
    } else if (scoreVal < 6.5) {
      sign = '-'
    }

    return {
      mal_id: anime.mal_id,
      animeTitle: anime.title,
      pts,
      sign,
      label,
      genre: g,
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
    baseDetails,
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
  Chaos: 'you gravitate toward high-energy, high-stakes shows',
  Comf: 'you value calm, restorative viewing',
  Brainrot: 'you like shows that reward close attention',
  Suffering: 'you don\'t shy away from emotionally heavy stories',
  Rizz: 'romance and character chemistry show up often in your picks',
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
  Action: 'picked for the spectacle, and the spectacle delivered',
  Adventure: 'a journey worth taking, even if the sequel never came',
  Avant: 'you picked something deliberately hard to explain',
  Comedy: 'a reliable source of laughs — no irony required',
  Drama: 'you chose the emotional weight, and you\'d do it again',
  Ecchi: 'a guilty pleasure you\'re not fully apologizing for',
  Fantasy: 'a well-crafted escape from the everyday',
  Gourmet: 'best watched on a full stomach, in hindsight',
  Harem: 'you tolerated a lot of tropes for these characters',
  Horror: 'you genuinely enjoy being unsettled',
  Kids: 'either healing your inner child or just genuinely charming',
  Mecha: 'the robots carried it, and you\'re fine with that',
  Military: 'you appreciate a story that takes its strategy seriously',
  Music: 'the soundtrack did more emotional work than most dialogue',
  Mystery: 'you saw the twist coming and enjoyed it anyway',
  Parody: 'you appreciate a show that doesn\'t take itself seriously',
  Psychological: 'more of a mental exercise than light entertainment',
  Romance: 'you\'re a sucker for a well-earned confession scene',
  School: 'school settings clearly still work on you',
  'Sci-Fi': 'you enjoy the world-building as much as the plot',
  'Slice of Life': 'nothing much happened, and it mattered anyway',
  Space: 'the final frontier, from the comfort of home',
  Sports: 'you got invested in fictional athletes and don\'t regret it',
  Supernatural: 'grounded stories were never quite enough',
  Thriller: 'your pulse was not safe during this one',
  Boys: 'the relationships were the real draw',
  Girls: 'charm and character design won you over',
  Samurai: 'drawn to codes of honor and disciplined storytelling',
  Unknown: 'hard to categorize, which is part of the appeal',
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

export function generateHolisticExplanation(selectedAnime, sheet, seed) {
  const titles = (selectedAnime || []).map((a) => a.title).filter(Boolean)
  const genres = [...new Set((selectedAnime || []).flatMap((a) => (a.genres || []).map((g) => g.name)))]
  const topStat = sheet?.topStat || 'Chaos'
  const stats = sheet?.stats || { Chaos: 70, Comf: 50, Brainrot: 60, Suffering: 80, Rizz: 40 }
  const className = sheet?.className || 'Chaotic Scribe of Dub Disrespect'

  const titleA = titles[0] || 'your anchor title'
  const titleB = titles[Math.floor(titles.length / 2)] || 'your mid-grid pick'
  const titleC = titles[titles.length - 1] || 'your capstone anime'
  const genreList = genres.slice(0, 3).join(', ') || 'eclectic genres'

  const p1 =
    `Your grid spans ${genreList}, and the mix says a lot. Anchored by "${titleA}" and ` +
    `balanced against "${titleB}", your taste doesn't stay in one lane — you pair ` +
    `thematically ambitious picks with lighter fare, and the contrast is deliberate rather than random.`

  const p2 =
    `Your strongest stat is ${topStat} (${stats[topStat] || 75}/100), which is what earns you the ` +
    `${className} class. Whether you're drawn to emotionally demanding stories or high-energy ` +
    `picks like "${titleC}", you consistently favor series with a distinct authorial voice ` +
    `over safe, formulaic seasonal fare.`

  const p3 =
    `Taken together, this grid reflects genuine conviction in your taste. It's specific, ` +
    `a little idiosyncratic, and consistent — the kind of selection that tells people ` +
    `who you are as a viewer before you say a word.`

  return `${p1}\n\n${p2}\n\n${p3}`
}

export function localFallbackVerdict(seed, selectedAnime) {
  const sheet = computeStats(selectedAnime || [], seed)
  const roasts = (selectedAnime || []).map((a, i) => offlineRoast(a, seed, i))
  const explanation = generateHolisticExplanation(selectedAnime, sheet, seed)
  return {
    archetype: sheet.className,
    callout: 'A taste with conviction — and the range to back it up.',
    explanation,
    subtitle: explanation.split('\n\n')[0],
    characterBio: `A level ${((seed % 40) + 10)} ${sheet.className}. Specializes in ${sheet.topStat.toLowerCase()} builds and rarely respecs — commitment is part of the build.`,
    roasts,
    sheet,
  }
}
