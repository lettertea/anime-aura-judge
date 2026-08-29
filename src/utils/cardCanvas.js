// Canvas-based card renderer.
//
// We deliberately do NOT use html-to-image / DOM cloning here: Tailwind v4's
// oklch() colors and offscreen positioning break SVG foreignObject rendering,
// producing blank white images. Drawing directly on a canvas is deterministic,
// dependency-free, and works in every browser.

const W = 900 // logical card width
const PAD = 40
const SCALE = 2 // export at 2x for crispness

const COLORS = {
  bg: '#101013',
  panel: '#18181b',
  panelSoft: 'rgba(24,24,27,0.5)',
  border: '#27272a',
  text: '#f4f4f5',
  textDim: '#a1a1aa',
  textFaint: '#71717a',
  indigo: '#818cf8',
  emerald: '#34d399',
  rose: '#fb7185',
  violet: '#a78bfa',
}

const STAT_BAR_COLORS = {
  Chaos: '#fb7185',
  Comf: '#38bdf8',
  Brainrot: '#a78bfa',
  Suffering: '#818cf8',
  Rizz: '#34d399',
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrapText(ctx, text, maxWidth) {
  const lines = []
  for (const paragraph of String(text || '').split('\n\n').filter(Boolean)) {
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) lines.push(line)
    lines.push('') // paragraph break
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function truncateToWidth(ctx, text, maxWidth) {
  let t = String(text || '')
  while (ctx.measureText(t).width > maxWidth && t.length > 4) {
    t = `${t.slice(0, -2)}…`
  }
  return t
}

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

// draw image with object-fit: cover semantics
function drawCover(ctx, img, x, y, w, h) {
  const iw = img.width
  const ih = img.height
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

// Draw a collapsible-style section header. Returns y advanced past the header.
function drawSectionHeader(ctx, y, icon, title) {
  ctx.fillStyle = COLORS.panel
  ctx.strokeStyle = COLORS.border
  roundRect(ctx, PAD, y, W - PAD * 2, 44, 12)
  ctx.fill()
  ctx.stroke()
  ctx.font = '500 15px system-ui, sans-serif'
  ctx.fillStyle = COLORS.text
  ctx.textBaseline = 'middle'
  ctx.fillText(`${icon}  ${title}`, PAD + 20, y + 22)
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillStyle = COLORS.textFaint
  ctx.textAlign = 'right'
  ctx.fillText('▾', W - PAD - 20, y + 22)
  ctx.textAlign = 'left'
  return y + 44
}

export async function renderCardCanvas({ selectedAnime, scoreResult, verdict, mediaType }) {
  const { baseScore, finalScore, modifiers, seed, baseDetails } = scoreResult
  const { archetype, explanation, subtitle, callout, offline } = verdict
  const modifierSum = modifiers.reduce(
    (acc, m) => acc + (m.sign === '+' ? m.pts : -m.pts),
    0,
  )
  const isManga = (mediaType || selectedAnime?.[0]?.mediaType) === 'MANGA'
  const mediumNoun = isManga ? 'manga' : 'anime'
  const headerTitle = isManga ? 'Manga Aura Judge' : 'Anime Aura Judge'

  const sheet = verdict.sheet
  const roasts = verdict.roasts || []
  const characterBio = verdict.characterBio || ''

  const genreTags = []
  const seenGenres = new Set()
  for (const anime of selectedAnime) {
    for (const g of anime.genres || []) {
      if (!seenGenres.has(g.name)) {
        seenGenres.add(g.name)
        genreTags.push(g.name)
      }
    }
  }

  // Measure dynamic height first (dry run for text wrapping)
  const measure = document.createElement('canvas').getContext('2d')
  const innerW = W - PAD * 2

  const images = await Promise.all(
    selectedAnime.map((a) =>
      loadImage(a.images?.jpg?.large_image_url || a.images?.jpg?.image_url),
    ),
  )
  const smallImages = await Promise.all(
    selectedAnime.map((a) =>
      loadImage(a.images?.jpg?.small_image_url || a.images?.jpg?.image_url),
    ),
  )

  // ---- layout constants ----
  const gridTop = 120
  const cell = 260
  const gap = 12
  const gridH = cell * 3 + gap * 2
  const scoreTop = gridTop + gridH + 32
  const scoreH = 150
  const contribTop = scoreTop + scoreH + 32
  const contribRowH = 56
  const contribRows = Math.ceil(modifiers.length / 2)
  const contribH = 30 + contribRows * contribRowH
  const analysisTop = contribTop + contribH + 32

  measure.font = '14px system-ui, sans-serif'
  const explanationLines = wrapText(measure, explanation || subtitle || '', innerW - 40)
  const analysisTextH = explanationLines.length * 20
  const analysisH = 110 + (callout ? 44 : 0) + analysisTextH

  // ---- breakdown section heights (measured with dry-run ctx) ----
  const SECTION_GAP = 16

  // Character Sheet
  let sheetH = 0
  let statNames = []
  if (sheet?.stats) {
    statNames = Object.keys(sheet.stats)
    const statsH = statNames.length * 56
    measure.font = '13px system-ui, sans-serif'
    const bioLines = characterBio ? wrapText(measure, characterBio, innerW / 2 - 60).length : 0
    const classColH = 24 + 34 + 20 + (bioLines ? bioLines * 18 + 16 : 0)
    sheetH = 44 + 20 + Math.max(statsH, classColH) + 20
  }

  // Roasts
  const roastRowH = 64
  const roastsH = roasts.length > 0 ? 44 + 16 + roasts.length * roastRowH + 16 : 0

  // The Math
  measure.font = '13px ui-monospace, monospace'
  const mathRows = []
  mathRows.push(['seed (from your 9 mal_ids)', String(seed ?? '')])
  mathRows.push(['base grid resonance', `+${baseDetails?.baseline?.toLocaleString() || '10,000'}`])
  if (baseDetails?.diversityBonus > 0) {
    mathRows.push([
      `genre diversity bonus (${baseDetails.uniqueGenres} unique genres)`,
      `+${baseDetails.diversityBonus.toLocaleString()}`,
    ])
  }
  if (baseDetails?.harmonyBonus > 0) {
    mathRows.push(['score harmony bonus', `+${baseDetails.harmonyBonus.toLocaleString()}`])
  }
  mathRows.push(['total base score', `+${baseScore.toLocaleString()}`])
  const mathHeaderRows = mathRows.length
  const mathH =
    44 + 16 + mathHeaderRows * 24 + 34 + modifiers.length * 24 + 36 + 16

  // Genre Autopsy (wrap pills)
  let genreRows = 0
  if (genreTags.length > 0) {
    measure.font = '12px system-ui, sans-serif'
    let lineW = 0
    genreRows = 1
    for (const g of genreTags) {
      const pillW = measure.measureText(g).width + 28
      if (lineW + pillW > innerW - 32 && lineW > 0) {
        genreRows += 1
        lineW = pillW
      } else {
        lineW += pillW + 10
      }
    }
  }
  const genresH = genreTags.length > 0 ? 44 + 16 + genreRows * 34 + 16 : 0

  const breakdownH =
    (sheetH ? sheetH + SECTION_GAP : 0) +
    (roastsH ? roastsH + SECTION_GAP : 0) +
    (mathH ? mathH + SECTION_GAP : 0) +
    (genresH ? genresH + SECTION_GAP : 0)

  const footerH = 60
  const H = analysisTop + analysisH + 32 + breakdownH + footerH + PAD

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'

  // Background
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, H)

  // Header
  ctx.fillStyle = COLORS.indigo
  roundRect(ctx, PAD, 32, 32, 32, 8)
  ctx.fill()
  ctx.fillStyle = COLORS.text
  ctx.font = '600 20px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(headerTitle, PAD + 44, 49)
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillStyle = COLORS.textFaint
  const badge = 'OFFICIAL AURA ASSESSMENT'
  const badgeW = ctx.measureText(badge).width + 24
  roundRect(ctx, W - PAD - badgeW, 36, badgeW, 24, 12)
  ctx.fill()
  ctx.fillStyle = COLORS.textDim
  ctx.fillText(badge, W - PAD - badgeW + 12, 49)
  ctx.textBaseline = 'alphabetic'

  // Image grid 3x3
  for (let i = 0; i < 9; i++) {
    const x = PAD + (i % 3) * (cell + gap)
    const y = gridTop + Math.floor(i / 3) * (cell + gap)
    ctx.save()
    roundRect(ctx, x, y, cell, cell, 8)
    ctx.clip()
    if (images[i]) {
      drawCover(ctx, images[i], x, y, cell, cell)
    } else {
      ctx.fillStyle = COLORS.panel
      ctx.fillRect(x, y, cell, cell)
      ctx.fillStyle = COLORS.textFaint
      ctx.font = '12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('image unavailable', x + cell / 2, y + cell / 2)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
    ctx.restore()
    ctx.strokeStyle = COLORS.border
    roundRect(ctx, x, y, cell, cell, 8)
    ctx.stroke()
  }

  // Final score panel
  ctx.fillStyle = COLORS.panel
  ctx.strokeStyle = COLORS.border
  roundRect(ctx, PAD, scoreTop, innerW, scoreH, 16)
  ctx.fill()
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillStyle = COLORS.textDim
  ctx.fillText('FINAL AURA SCORE', W / 2, scoreTop + 34)
  ctx.font = '800 52px system-ui, sans-serif'
  ctx.fillStyle = COLORS.text
  ctx.fillText(finalScore.toLocaleString(), W / 2, scoreTop + 82)
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillStyle = COLORS.textFaint
  ctx.fillText(
    `base ${baseScore.toLocaleString()} + 9 ${mediumNoun} modifiers (${modifierSum >= 0 ? '+' : ''}${modifierSum.toLocaleString()})`,
    W / 2,
    scoreTop + 122,
  )
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // Contributions panel
  const contribPanelH = 30 + contribRows * contribRowH
  ctx.fillStyle = COLORS.panelSoft
  ctx.strokeStyle = COLORS.border
  roundRect(ctx, PAD, contribTop, innerW, contribPanelH, 12)
  ctx.fill()
  ctx.stroke()
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillStyle = COLORS.textDim
  ctx.fillText(
    `GRID ${isManga ? 'MANGA' : 'ANIME'} CONTRIBUTIONS (ALL 9 TITLES)`,
    PAD + 16,
    contribTop + 22,
  )
  modifiers.forEach((m, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = PAD + 16 + col * ((innerW - 32) / 2)
    const y = contribTop + 40 + row * contribRowH
    const colW = (innerW - 32) / 2 - 12

    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = COLORS.text
    ctx.fillText(truncateToWidth(ctx, `${i + 1}. ${m.animeTitle}`, colW - 70), x, y + 10)

    ctx.font = '11px ui-monospace, monospace'
    ctx.fillStyle = COLORS.textFaint
    ctx.fillText(truncateToWidth(ctx, m.label || '', colW - 70), x, y + 28)

    ctx.font = '600 12px ui-monospace, monospace'
    ctx.textAlign = 'right'
    ctx.fillStyle = m.sign === '+' ? COLORS.emerald : COLORS.rose
    ctx.fillText(`${m.sign}${m.pts.toLocaleString()}`, x + colW, y + 18)
    ctx.textAlign = 'left'
  })

  // Analysis summary
  let y = analysisTop
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillStyle = COLORS.textDim
  ctx.fillText('ANALYSIS SUMMARY', PAD, y + 8)
  ctx.font = '700 24px system-ui, sans-serif'
  ctx.fillStyle = COLORS.indigo
  ctx.fillText(truncateToWidth(ctx, archetype || '', innerW), PAD, y + 40)

  let ty = y + 62
  if (callout) {
    ctx.font = '500 14px system-ui, sans-serif'
    const calloutLines = wrapText(ctx, `“${callout}”`, innerW - 32)
    ctx.fillStyle = COLORS.panel
    ctx.strokeStyle = COLORS.border
    roundRect(ctx, PAD, ty, innerW, calloutLines.length * 20 + 20, 8)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = COLORS.text
    calloutLines.forEach((l, i) => ctx.fillText(l, PAD + 16, ty + 20 + i * 20))
    ty += calloutLines.length * 20 + 36
  }

  ctx.font = '14px system-ui, sans-serif'
  ctx.fillStyle = '#d4d4d8'
  explanationLines.forEach((l, i) => {
    if (l) ctx.fillText(l, PAD, ty + 14 + i * 20)
  })

  // ---- Breakdown sections ----
  y = analysisTop + analysisH + 32

  // Character Sheet
  if (sheetH) {
    y = drawSectionHeader(ctx, y, '⚔️', 'Character Sheet')
    y += 20
    const colW = (innerW - 40) / 2
    // Left: stat bars
    let sy = y
    statNames.forEach((stat) => {
      const value = sheet.stats[stat]
      ctx.font = '600 13px system-ui, sans-serif'
      ctx.fillStyle = COLORS.text
      ctx.fillText(`${sheet.icons?.[stat] || ''} ${stat}`, PAD + 20, sy + 10)
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillStyle = COLORS.textDim
      ctx.textAlign = 'right'
      ctx.fillText(`${value}/100`, PAD + 20 + colW, sy + 10)
      ctx.textAlign = 'left'
      // bar
      const barY = sy + 18
      ctx.fillStyle = '#27272a'
      roundRect(ctx, PAD + 20, barY, colW, 8, 4)
      ctx.fill()
      ctx.fillStyle = STAT_BAR_COLORS[stat] || COLORS.indigo
      roundRect(ctx, PAD + 20, barY, Math.max(8, (colW * value) / 100), 8, 4)
      ctx.fill()
      ctx.font = 'italic 11px system-ui, sans-serif'
      ctx.fillStyle = COLORS.textFaint
      ctx.fillText(truncateToWidth(ctx, sheet.blurbs?.[stat] || '', colW), PAD + 20, barY + 24)
      sy += 56
    })
    // Right: class
    const rx = PAD + 20 + colW + 40
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillStyle = COLORS.textDim
    ctx.fillText('CLASS', rx, y + 10)
    ctx.font = '700 22px system-ui, sans-serif'
    ctx.fillStyle = COLORS.violet
    ctx.fillText(truncateToWidth(ctx, sheet.className || '', colW), rx, y + 38)
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillStyle = COLORS.textFaint
    ctx.fillText(
      `top stat: ${sheet.icons?.[sheet.topStat] || ''} ${sheet.topStat || ''}`,
      rx,
      y + 58,
    )
    if (characterBio) {
      ctx.font = 'italic 13px system-ui, sans-serif'
      ctx.fillStyle = '#d4d4d8'
      wrapText(ctx, characterBio, colW).forEach((l, i) => {
        ctx.fillText(l, rx, y + 82 + i * 18)
      })
    }
    y += sheetH - 44 + SECTION_GAP
  }

  // The Roasts
  if (roastsH) {
    y = drawSectionHeader(ctx, y, '🔥', 'The Roasts')
    y += 16
    selectedAnime.forEach((anime, i) => {
      const rowY = y
      ctx.fillStyle = COLORS.panelSoft
      ctx.strokeStyle = COLORS.border
      roundRect(ctx, PAD + 16, rowY, innerW - 32, roastRowH - 8, 8)
      ctx.fill()
      ctx.stroke()
      const img = smallImages[i]
      if (img) {
        ctx.save()
        roundRect(ctx, PAD + 28, rowY + 10, 36, 38, 4)
        ctx.clip()
        drawCover(ctx, img, PAD + 28, rowY + 10, 36, 38)
        ctx.restore()
      }
      const tx = PAD + 76
      ctx.font = '600 13px system-ui, sans-serif'
      ctx.fillStyle = COLORS.text
      ctx.fillText(truncateToWidth(ctx, anime.title, innerW - 120), tx, rowY + 24)
      ctx.font = '12px system-ui, sans-serif'
      ctx.fillStyle = COLORS.textDim
      const roastLines = wrapText(ctx, roasts[i] || '', innerW - 120)
      ctx.fillText(truncateToWidth(ctx, roastLines[0] || '', innerW - 120), tx, rowY + 42)
      y += roastRowH
    })
    y += 16 + SECTION_GAP
  }

  // The Math
  if (mathH) {
    y = drawSectionHeader(ctx, y, '🧮', 'The Math')
    y += 16
    const rowX = PAD + 20
    const valX = W - PAD - 20
    mathRows.forEach(([label, value]) => {
      ctx.font = '13px ui-monospace, monospace'
      ctx.fillStyle = COLORS.textDim
      ctx.fillText(truncateToWidth(ctx, label, innerW - 200), rowX, y + 14)
      ctx.textAlign = 'right'
      ctx.fillStyle = value.startsWith('+') ? COLORS.emerald : COLORS.text
      ctx.fillText(value, valX, y + 14)
      ctx.textAlign = 'left'
      y += 24
    })
    // modifiers
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = COLORS.textFaint
    ctx.fillText(
      `ALL 9 ${isManga ? 'MANGA' : 'ANIME'} CONTRIBUTIONS${scoreResult.aiScored ? '  ✦ AI-EVALUATED' : ''}`,
      rowX,
      y + 14,
    )
    y += 34
    modifiers.forEach((m, i) => {
      ctx.font = '12px ui-monospace, monospace'
      ctx.fillStyle = COLORS.textDim
      const label = `#${i + 1}  ${m.animeTitle} — ${m.label || ''}`
      ctx.fillText(truncateToWidth(ctx, label, innerW - 140), rowX, y + 12)
      ctx.textAlign = 'right'
      ctx.fillStyle = m.sign === '+' ? COLORS.emerald : COLORS.rose
      ctx.fillText(`${m.sign}${m.pts.toLocaleString()}`, valX, y + 12)
      ctx.textAlign = 'left'
      y += 24
    })
    // final
    y += 6
    ctx.strokeStyle = COLORS.border
    ctx.beginPath()
    ctx.moveTo(rowX, y)
    ctx.lineTo(valX, y)
    ctx.stroke()
    y += 8
    ctx.font = '600 14px ui-monospace, monospace'
    ctx.fillStyle = COLORS.text
    ctx.fillText('final aura', rowX, y + 16)
    ctx.textAlign = 'right'
    ctx.fillStyle = COLORS.emerald
    ctx.fillText(finalScore.toLocaleString(), valX, y + 16)
    ctx.textAlign = 'left'
    y += 36 + SECTION_GAP
  }

  // Genre Autopsy
  if (genresH) {
    y = drawSectionHeader(ctx, y, '🏷️', 'Genre Autopsy')
    y += 16
    let px = PAD + 16
    ctx.font = '12px system-ui, sans-serif'
    genreTags.forEach((g) => {
      const pillW = ctx.measureText(g).width + 28
      if (px + pillW > W - PAD - 16 && px > PAD + 16) {
        px = PAD + 16
        y += 34
      }
      ctx.fillStyle = '#27272a'
      ctx.strokeStyle = '#3f3f46'
      roundRect(ctx, px, y, pillW, 26, 13)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = COLORS.textDim
      ctx.textBaseline = 'middle'
      ctx.fillText(g, px + 14, y + 13)
      ctx.textBaseline = 'alphabetic'
      px += pillW + 10
    })
    y += 34 + SECTION_GAP
  }

  // Footer
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillStyle = COLORS.textFaint
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const footer = [
    offline ? 'offline mode' : null,
    'deterministic scoring',
    offline ? 'Powered by Jikan (Local Fallback)' : 'Powered by Jikan + OpenRouter (Gemini 3.7 Flash)',
  ]
    .filter(Boolean)
    .join('  ·  ')
  ctx.fillText(footer, W / 2, H - PAD + 10)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  return canvas
}

export async function downloadCardImage(params) {
  const canvas = await renderCardCanvas(params)
  const isManga =
    (params.mediaType || params.selectedAnime?.[0]?.mediaType) === 'MANGA'
  const link = document.createElement('a')
  link.download = isManga ? 'manga-aura-card.png' : 'anime-aura-card.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
}
