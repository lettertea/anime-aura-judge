import { OpenRouter } from '@openrouter/sdk'
import {
  localFallbackVerdict,
  computeStats,
  offlineRoast,
  generateHolisticExplanation,
  STAT_KEYS,
} from '../utils/scoring.js'

const MODEL = 'google/gemini-3.7-flash'

const SYSTEM_PROMPT =
  `You are a perceptive anime critic who reads people's taste from their 3x3 anime grids. ` +
  `Write with wit and a sharp eye: playful, teasing, and honest — the humor comes from being ` +
  `"funny because it's true." Roast the user's taste a little; call out their patterns, guilty ` +
  `pleasures, and self-inflicted suffering with affectionate jabs. Never cruel or offensive, ` +
  `but don't sugarcoat either — if their grid screams something about them, say it. Avoid internet ` +
  `slang and meme phrasing; the comedy should come from precision, not memes.\n\n` +
  `Instructions:\n` +
  `1. stats: Rate the user's taste profile across five RPG stats, each an integer 0-100: ` +
  `Chaos (high-energy, high-stakes picks), Comf (calm, restorative picks), Brainrot (psychological, ` +
  `cerebral, demanding picks), Suffering (emotionally heavy picks), Rizz (romance and character ` +
  `chemistry). Judge from the actual genre mix of their 9 titles — at least one stat should be ` +
  `their clear standout, and no stat should be literally 0 unless truly absent.\n` +
  `2. className: Invent a short RPG class name (2-5 words) that captures their taste, e.g. ` +
  `"Doomed Archmage of the Backlog". It should reflect their top stats. Be creative but understated — no memes.\n` +
  `3. modifiers: An array of exactly 9 entries (one per anime title in the exact same order) evaluating each ` +
  `pick. Each entry has: sign ("+" or "-"), pts (an integer between 1200 and 4500 — stronger picks earn ` +
  `more points; critically acclaimed or personally resonant picks score high, guilty pleasures or weak ` +
  `picks get fewer points or a minus), and reason (a short lowercase phrase explaining the contribution, ` +
  `e.g. "peak fiction, no notes" or "we know what you are"). Judge honestly based on the title's reputation, ` +
  `genre, and how it fits the grid. At least 6 entries should be "+".\n` +
  `4. callout: One short, memorable line that captures the essence of their taste — dry, confident, ` +
  `with a slight edge. It should land like a knowing smirk, not a compliment.\n` +
  `5. explanation: Write a 2-4 paragraph holistic evaluation. Synthesize all 9 titles: how their contrasting or ` +
  `complementary genres interact (e.g., heavy drama balanced by comfort shows, psychological picks alongside ` +
  `straightforward action). Connect this to their character sheet stats (Chaos, Comf, Brainrot, Suffering, Rizz) ` +
  `and Class, and offer a genuine psychological read of what their taste reveals about them — specific, honest, ` +
  `and thoughtful rather than exaggerated, with light teasing woven in where their picks invite it. ` +
  `In a final paragraph, zoom out: reflect on the overall trajectory or ` +
  `throughline of their taste (what they seem to seek from anime, how their picks complement or clash with each ` +
  `other as a collection), and close with a grounded, forward-looking note about what this says about the viewer ` +
  `they are becoming.\n` +
  `6. characterBio: 2-3 sentences of RPG-style flavor text about the user as a character of that class, referencing their top stats. Keep it understated.\n` +
  `7. roasts: An array containing exactly 9 entries (one per anime title in the exact same order): a witty, ` +
  `teasing one-liner about why they picked that show — the kind of joke that stings slightly because it's ` +
  `accurate. Jab at their tropes, their type, their patterns. Punchy and specific, never mean-spirited, no slang.\n\n` +
  `Respond with ONLY valid JSON matching the schema.`

const VERDICT_SCHEMA = {
  name: 'aura_verdict',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      stats: {
        type: 'object',
        properties: {
          Chaos: { type: 'integer' },
          Comf: { type: 'integer' },
          Brainrot: { type: 'integer' },
          Suffering: { type: 'integer' },
          Rizz: { type: 'integer' },
        },
        required: ['Chaos', 'Comf', 'Brainrot', 'Suffering', 'Rizz'],
        additionalProperties: false,
      },
      className: { type: 'string' },
      modifiers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sign: { type: 'string', enum: ['+', '-'] },
            pts: { type: 'integer' },
            reason: { type: 'string' },
          },
          required: ['sign', 'pts', 'reason'],
          additionalProperties: false,
        },
      },
      callout: { type: 'string' },
      explanation: { type: 'string' },
      characterBio: { type: 'string' },
      roasts: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: [
      'stats',
      'className',
      'modifiers',
      'callout',
      'explanation',
      'characterBio',
      'roasts',
    ],
    additionalProperties: false,
  },
}

function buildUserPayload(scoreResult, selectedAnime, sheet) {
  const { seed, baseScore, baseDetails, finalScore, modifiers } = scoreResult
  return JSON.stringify({
    anime: selectedAnime.map((a, i) => ({
      slot: i + 1,
      title: a.title,
      genre: (a.genres && a.genres[0] && a.genres[0].name) || 'Unknown',
      score: a.score ?? null,
      year: a.year ?? null,
      auraContribution: modifiers[i]
        ? `${modifiers[i].sign}${modifiers[i].pts} pts (${modifiers[i].label})`
        : undefined,
    })),
    scoring: {
      seed,
      baseScore,
      baseDetails,
      finalScore,
    },
    characterSheet: {
      className: sheet.className,
      stats: sheet.stats,
      topStat: sheet.topStat,
    },
  })
}

// Defensive parsing: strip code fences, extract first balanced {...}, parse.
export function parseVerdictJSON(text) {
  if (!text || typeof text !== 'string') throw new Error('empty response')
  let cleaned = text.trim()
  cleaned = cleaned.replace(/```json/gi, '```')
  if (cleaned.includes('```')) {
    const parts = cleaned.split('```')
    cleaned = parts.find((p) => p.includes('{')) || cleaned
  }
  const start = cleaned.indexOf('{')
  if (start === -1) throw new Error('no JSON object found')
  let depth = 0
  let end = -1
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') inString = !inString
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) throw new Error('unbalanced JSON object')
  const parsed = JSON.parse(cleaned.slice(start, end + 1))
  if (
    typeof parsed.callout !== 'string' ||
    (typeof parsed.explanation !== 'string' && typeof parsed.subtitle !== 'string') ||
    typeof parsed.characterBio !== 'string' ||
    !Array.isArray(parsed.roasts)
  ) {
    throw new Error('schema mismatch')
  }
  // AI-generated stats/class are optional extras — validate shape if present,
  // otherwise drop them so the deterministic engine's values are used.
  if (parsed.stats && typeof parsed.stats === 'object') {
    const valid = STAT_KEYS.every((k) => {
      const v = parsed.stats[k]
      return typeof v === 'number' && Number.isFinite(v)
    })
    if (!valid) delete parsed.stats
  } else {
    delete parsed.stats
  }
  if (typeof parsed.className !== 'string' || !parsed.className.trim()) {
    delete parsed.className
  }
  // AI-generated score modifiers — validate shape, drop if malformed so the
  // deterministic scoring is used instead.
  const modsOk =
    Array.isArray(parsed.modifiers) &&
    parsed.modifiers.length === 9 &&
    parsed.modifiers.every(
      (m) =>
        m &&
        (m.sign === '+' || m.sign === '-') &&
        typeof m.pts === 'number' &&
        Number.isFinite(m.pts) &&
        typeof m.reason === 'string',
    )
  if (!modsOk) delete parsed.modifiers
  if (!parsed.explanation && parsed.subtitle) {
    parsed.explanation = parsed.subtitle
  }
  return parsed
}

function extractResponseText(response) {
  try {
    const choice = response?.choices?.[0]
    const msg = choice?.message
    if (typeof msg?.content === 'string') return msg.content
    if (Array.isArray(msg?.content)) {
      return msg.content.map((p) => p?.text ?? '').join('')
    }
    if (typeof choice?.text === 'string') return choice.text
  } catch {
    /* fall through */
  }
  return undefined
}

async function requestOnce(scoreResult, selectedAnime, sheet) {
  const client = new OpenRouter({
    apiKey: import.meta.env.VITE_OPENROUTER_API_KEY,
  })
  const response = await client.chat.send({
    model: MODEL,
    reasoning: {
      effort: 'medium',
    },
    temperature: 1.0,
    responseFormat: {
      type: 'json_schema',
      jsonSchema: VERDICT_SCHEMA,
    },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPayload(scoreResult, selectedAnime, sheet) },
    ],
  })
  return extractResponseText(response)
}

export async function getAuraVerdict(scoreResult, selectedAnime) {
  const { seed } = scoreResult
  const sheet = computeStats(selectedAnime, seed)

  if (!import.meta.env.VITE_OPENROUTER_API_KEY) {
    return { ...localFallbackVerdict(seed, selectedAnime), offline: true }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await requestOnce(scoreResult, selectedAnime, sheet)
      const verdict = parseVerdictJSON(text)
      const roastsOk =
        Array.isArray(verdict.roasts) && verdict.roasts.length === selectedAnime.length
      const explanation =
        verdict.explanation ||
        verdict.subtitle ||
        generateHolisticExplanation(selectedAnime, sheet, seed)

      // AI-assisted character sheet: use the model's stats/class when valid,
      // falling back to the deterministic engine's values otherwise.
      let finalSheet = sheet
      if (verdict.stats || verdict.className) {
        const stats = verdict.stats
          ? Object.fromEntries(
              STAT_KEYS.map((k) => [
                k,
                Math.max(1, Math.min(100, Math.round(verdict.stats[k]))),
              ]),
            )
          : sheet.stats
        const ranked = [...STAT_KEYS].sort(
          (a, b) => stats[b] - stats[a] || a.localeCompare(b),
        )
        finalSheet = {
          ...sheet,
          stats,
          topStat: verdict.stats ? ranked[0] : sheet.topStat,
          className: verdict.className || sheet.className,
        }
      }

      // AI-assisted scoring: use the model's per-anime modifiers when valid,
      // keeping the deterministic base score and recomputing the final total.
      let finalScoreResult = scoreResult
      if (Array.isArray(verdict.modifiers)) {
        const mods = verdict.modifiers.map((m, i) => ({
          mal_id: selectedAnime[i]?.mal_id,
          animeTitle: selectedAnime[i]?.title || `Pick #${i + 1}`,
          pts: Math.max(100, Math.min(6000, Math.round(m.pts))),
          sign: m.sign === '-' ? '-' : '+',
          label: m.reason,
          genre:
            (selectedAnime[i]?.genres?.[0] && selectedAnime[i].genres[0].name) || 'Unknown',
        }))
        const delta = mods.reduce((acc, m) => acc + (m.sign === '+' ? m.pts : -m.pts), 0)
        finalScoreResult = {
          ...scoreResult,
          modifiers: mods,
          finalScore: scoreResult.baseScore + delta,
          aiScored: true,
        }
      }

      return {
        archetype: finalSheet.className,
        callout: verdict.callout,
        explanation,
        subtitle: explanation.split('\n\n')[0],
        characterBio: typeof verdict.characterBio === 'string' ? verdict.characterBio : '',
        roasts: roastsOk
          ? verdict.roasts
          : selectedAnime.map((a, i) => offlineRoast(a, seed, i)),
        sheet: finalSheet,
        scoreResult: finalScoreResult,
        offline: false,
      }
    } catch (err) {
      console.warn(`Aura verdict attempt ${attempt + 1} failed:`, err)
    }
  }

  return { ...localFallbackVerdict(seed, selectedAnime), offline: true }
}
