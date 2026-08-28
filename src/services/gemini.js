import { OpenRouter } from '@openrouter/sdk'
import { localFallbackVerdict, computeStats, offlineRoast } from '../utils/scoring.js'

const MODEL = 'anthropic/claude-3.5-sonnet'

const SYSTEM_PROMPT =
  'You are an unhinged, perceptive anime analyst. You judge people\'s souls ' +
  'from their watchlists with brutal wit and affection. The user\'s RPG ' +
  'class name is pre-computed — do NOT change it. Your subtitle (1-2 ' +
  'sentences) MUST reference specific titles from the user\'s list. Your ' +
  'callout is exactly one punchy line (e.g., \'Touch grass or start a cult, ' +
  'honestly.\'). characterBio is 2-3 sentences of D&D-style flavor text ' +
  'about the user as a character of that class, referencing their stats. ' +
  'roasts must contain exactly one entry per title, in the same order: a ' +
  'one-line savage-but-affectionate roast of why they picked that anime. ' +
  'Respond with ONLY valid JSON — no markdown, no code fences, no preamble.'

const VERDICT_SCHEMA = {
  name: 'aura_verdict',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      archetype: { type: 'string' },
      subtitle: { type: 'string' },
      callout: { type: 'string' },
      characterBio: { type: 'string' },
      roasts: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['archetype', 'subtitle', 'callout', 'characterBio', 'roasts'],
    additionalProperties: false,
  },
}

function buildUserPayload(scoreResult) {
  const { seed, baseScore, finalScore, modifiers } = scoreResult
  return JSON.stringify({
    titles: scoreResult.titles ?? undefined,
    seed,
    baseScore,
    finalScore,
    modifiers: modifiers.map((m) => ({
      animeTitle: m.animeTitle,
      pts: m.pts,
      sign: m.sign,
      label: m.label,
    })),
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
    typeof parsed.subtitle !== 'string' ||
    typeof parsed.callout !== 'string' ||
    typeof parsed.characterBio !== 'string' ||
    !Array.isArray(parsed.roasts)
  ) {
    throw new Error('schema mismatch')
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

async function requestOnce(scoreResult) {
  const client = new OpenRouter({
    apiKey: import.meta.env.VITE_OPENROUTER_API_KEY,
  })
  const response = await client.chat.send({
    model: MODEL,
    temperature: 1.0,
    responseFormat: {
      type: 'json_schema',
      jsonSchema: VERDICT_SCHEMA,
    },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPayload(scoreResult) },
    ],
  })
  return extractResponseText(response)
}

export async function getAuraVerdict(scoreResult, selectedAnime) {
  const { seed, baseScore, finalScore, modifiers } = scoreResult
  const sheet = computeStats(selectedAnime, seed)
  const payload = {
    ...scoreResult,
    titles: selectedAnime.map((a) => ({
      title: a.title,
      genre: (a.genres && a.genres[0] && a.genres[0].name) || 'Unknown',
      score: a.score ?? null,
    })),
    sheet: { className: sheet.className, stats: sheet.stats, topStat: sheet.topStat },
  }

  if (!import.meta.env.VITE_OPENROUTER_API_KEY) {
    return { ...localFallbackVerdict(seed, selectedAnime), offline: true }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await requestOnce(payload)
      const verdict = parseVerdictJSON(text)
      // Defensive: the class name stays deterministic, and roasts must line
      // up 1:1 with the grid. Fall back per-field if the LLM misbehaves.
      const roastsOk =
        Array.isArray(verdict.roasts) && verdict.roasts.length === selectedAnime.length
      return {
        archetype: sheet.className,
        subtitle: verdict.subtitle,
        callout: verdict.callout,
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
