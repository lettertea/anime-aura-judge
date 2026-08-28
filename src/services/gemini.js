import { OpenRouter } from '@openrouter/sdk'
import {
  localFallbackVerdict,
  computeStats,
  offlineRoast,
  generateHolisticExplanation,
} from '../utils/scoring.js'

const MODEL = 'google/gemini-3.7-flash'

const SYSTEM_PROMPT =
  `You are a perceptive anime critic who reads people's taste from their 3x3 anime grids. ` +
  `Write in a clear, grounded, conversational tone — insightful and specific, never gimmicky. ` +
  `Avoid internet slang, forced jokes, and meme phrasing. Favor genuine observations about what the ` +
  `selection says about the person.\n\n` +
  `Instructions:\n` +
  `1. archetype: The user's RPG class name is pre-computed — do NOT modify it.\n` +
  `2. callout: One short, memorable line that captures the essence of their taste. Plain and confident, not a joke.\n` +
  `3. explanation: Write a 2-4 paragraph holistic evaluation. Synthesize all 9 titles: how their contrasting or ` +
  `complementary genres interact (e.g., heavy drama balanced by comfort shows, psychological picks alongside ` +
  `straightforward action). Connect this to their character sheet stats (Chaos, Comf, Brainrot, Suffering, Rizz) ` +
  `and Class, and offer a genuine psychological read of what their taste reveals about them — specific, honest, ` +
  `and thoughtful rather than exaggerated. In a final paragraph, zoom out: reflect on the overall trajectory or ` +
  `throughline of their taste (what they seem to seek from anime, how their picks complement or clash with each ` +
  `other as a collection), and close with a grounded, forward-looking note about what this says about the viewer ` +
  `they are becoming.\n` +
  `4. characterBio: 2-3 sentences of RPG-style flavor text about the user as a character of that class, referencing their top stats. Keep it understated.\n` +
  `5. roasts: An array containing exactly 9 entries (one per anime title in the exact same order): a gentle, ` +
  `witty one-line observation about why they picked that show. Affectionate teasing at most — no cruelty, no slang.\n\n` +
  `Respond with ONLY valid JSON matching the schema.`

const VERDICT_SCHEMA = {
  name: 'aura_verdict',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      archetype: { type: 'string' },
      callout: { type: 'string' },
      explanation: { type: 'string' },
      characterBio: { type: 'string' },
      roasts: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['archetype', 'callout', 'explanation', 'characterBio', 'roasts'],
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

      return {
        archetype: sheet.className,
        callout: verdict.callout,
        explanation,
        subtitle: explanation.split('\n\n')[0],
        characterBio: typeof verdict.characterBio === 'string' ? verdict.characterBio : '',
        roasts: roastsOk
          ? verdict.roasts
          : selectedAnime.map((a, i) => offlineRoast(a, seed, i)),
        sheet,
        offline: false,
      }
    } catch (err) {
      console.warn(`Aura verdict attempt ${attempt + 1} failed:`, err)
    }
  }

  return { ...localFallbackVerdict(seed, selectedAnime), offline: true }
}
