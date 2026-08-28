// Unified Anime Search Service with reliable fallbacks (AniList -> Kitsu -> Jikan)

// NormalizedAnime contract (all providers map to this shape):
// {
//   mal_id: number,
//   title: string,
//   english_title: string | null,
//   romaji_title: string | null,
//   images: { jpg: { image_url, large_image_url, small_image_url } },
//   genres: Array<{ name: string }>,
//   year: number | null,
//   score: number | null,
//   // Optional enrichment fields (best-effort, may be null):
//   format: string | null,     // e.g. 'TV', 'MOVIE', 'OVA', 'ONA'
//   status: string | null,     // e.g. 'FINISHED', 'RELEASING'
//   episodes: number | null,
//   popularity: number | null, // provider popularity count
//   favourites: number | null, // provider favourites count
// }

const ANILIST_URL = 'https://graphql.anilist.co'
const KITSU_URL = 'https://kitsu.io/api/edge/anime'
const JIKAN_URL = 'https://api.jikan.moe/v4/anime'

const ANILIST_QUERY = `
  query ($search: String) {
    Page(page: 1, perPage: 12) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        genres
        seasonYear
        startDate {
          year
        }
        averageScore
        format
        status
        episodes
        popularity
        favourites
        coverImage {
          extraLarge
          large
          medium
        }
      }
    }
  }
`

async function searchAniList(query, signal) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: ANILIST_QUERY,
      variables: { search: query },
    }),
    signal,
  })

  if (!res.ok) throw new Error(`AniList error ${res.status}`)
  const json = await res.json()
  const mediaList = json.data?.Page?.media || []

  const mapped = mediaList.map((m) => {
    const title = m.title?.english || m.title?.romaji || m.title?.native || 'Unknown Title'
    const year = m.seasonYear || m.startDate?.year || null
    const genres = (m.genres || []).map((name) => ({ name }))
    const imageUrl = m.coverImage?.large || m.coverImage?.medium
    const largeImageUrl = m.coverImage?.extraLarge || m.coverImage?.large || imageUrl
    const smallImageUrl = m.coverImage?.medium || imageUrl

    return {
      mal_id: m.idMal || m.id,
      title,
      english_title: m.title?.english,
      romaji_title: m.title?.romaji,
      images: {
        jpg: {
          image_url: imageUrl,
          large_image_url: largeImageUrl,
          small_image_url: smallImageUrl,
        },
      },
      genres,
      year,
      score: m.averageScore ? Number((m.averageScore / 10).toFixed(2)) : null,
      format: m.format ?? null,
      status: m.status ?? null,
      episodes: m.episodes ?? null,
      popularity: m.popularity ?? null,
      favourites: m.favourites ?? null,
    }
  })

  return rankByRelevanceAndPopularity(mapped)
}

/**
 * Deterministic hybrid re-rank: blends AniList SEARCH_MATCH position (relevance)
 * with log-normalized popularity, weighted 60/40.
 *
 * For item at index i in a list of length N:
 *   relevance = 1 - i / (N - 1)
 *   popNorm   = log2(1 + popularity) / log2(1 + maxPopularity)
 *   blend     = 0.6 * relevance + 0.4 * popNorm
 *
 * Ties break by popularity desc, then mal_id asc — fully deterministic.
 */
export function rankByRelevanceAndPopularity(mediaList) {
  if (!Array.isArray(mediaList) || mediaList.length < 2) return mediaList || []

  const N = mediaList.length
  const maxP = Math.max(...mediaList.map((item) => item.popularity ?? 0))
  const logMaxP = maxP > 0 ? Math.log2(1 + maxP) : 0

  const scored = mediaList.map((item, i) => {
    const relevance = 1 - i / (N - 1)
    const popNorm = logMaxP > 0 ? Math.log2(1 + (item.popularity ?? 0)) / logMaxP : 0
    const blend = 0.6 * relevance + 0.4 * popNorm
    return { item, blend, popularity: item.popularity ?? 0, mal_id: item.mal_id ?? 0 }
  })

  scored.sort((a, b) => {
    if (b.blend !== a.blend) return b.blend - a.blend
    if (b.popularity !== a.popularity) return b.popularity - a.popularity
    return a.mal_id - b.mal_id
  })

  return scored.map((s) => s.item)
}

async function searchKitsu(query, signal) {
  const url = `${KITSU_URL}?filter[text]=${encodeURIComponent(query)}&page[limit]=12`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Kitsu error ${res.status}`)
  const json = await res.json()
  const data = json.data || []

  return data.map((item) => {
    const attr = item.attributes || {}
    const title = attr.canonicalTitle || attr.titles?.en || attr.titles?.en_jp || 'Unknown Title'
    const year = attr.startDate ? parseInt(attr.startDate.slice(0, 4), 10) : null
    const imageUrl = attr.posterImage?.medium || attr.posterImage?.small
    const largeImageUrl = attr.posterImage?.large || attr.posterImage?.original || imageUrl

    return {
      mal_id: parseInt(item.id, 10) || Math.floor(Math.random() * 100000),
      title,
      images: {
        jpg: {
          image_url: imageUrl,
          large_image_url: largeImageUrl,
          small_image_url: imageUrl,
        },
      },
      genres: [{ name: attr.subtype || 'Anime' }],
      year,
      score: attr.averageRating ? Number((parseFloat(attr.averageRating) / 10).toFixed(2)) : null,
      format: attr.subtype ?? null,
      status: attr.status ?? null,
      episodes: attr.episodeCount ?? null,
      popularity: attr.userCount ?? null,
      favourites: attr.favoritesCount ?? null,
    }
  })
}

async function searchJikan(query, signal) {
  const url = `${JIKAN_URL}?q=${encodeURIComponent(query)}&limit=12`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Jikan error ${res.status}`)
  const json = await res.json()
  return (json.data || []).map((a) => ({
    mal_id: a.mal_id,
    title: a.title_english || a.title,
    images: a.images,
    genres: a.genres || [],
    year: a.year || (a.aired?.from ? parseInt(a.aired.from.slice(0, 4), 10) : null),
    score: a.score,
    format: a.type ?? null,
    status: a.status ?? null,
    episodes: a.episodes ?? null,
    popularity: a.members ?? null,
    favourites: a.favorites ?? null,
  }))
}

export async function searchAnime(query, signal) {
  if (!query || !query.trim()) return []
  const cleanQuery = query.trim()

  // 1. Try AniList
  try {
    const results = await searchAniList(cleanQuery, signal)
    if (results && results.length > 0) return results
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('AniList search failed, falling back to Kitsu/Jikan:', err)
  }

  // 2. Try Kitsu fallback
  try {
    const results = await searchKitsu(cleanQuery, signal)
    if (results && results.length > 0) return results
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('Kitsu search failed, falling back to Jikan:', err)
  }

  // 3. Try Jikan fallback
  try {
    const results = await searchJikan(cleanQuery, signal)
    return results
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('All anime search providers failed:', err)
    throw new Error('Unable to search anime. Please check your internet connection and try again.')
  }
}
