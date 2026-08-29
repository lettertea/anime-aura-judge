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
  border: '#27272a',
  text: '#f4f4f5',
  textDim: '#a1a1aa',
  textFaint: '#71717a',
  indigo: '#818cf8',
  emerald: '#34d399',
  rose: '#fb7185',
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

export async function renderCardCanvas({ selectedAnime, scoreResult, verdict, mediaType }) {
  const { baseScore, finalScore, modifiers } = scoreResult
  const { archetype, explanation, subtitle, callout, offline } = verdict
  const modifierSum = modifiers.reduce(
    (acc, m) => acc + (m.sign === '+' ? m.pts : -m.pts),
    0,
  )
  const isManga = (mediaType || selectedAnime?.[0]?.mediaType) === 'MANGA'
  const mediumNoun = isManga ? 'manga' : 'anime'
  const headerTitle = isManga ? 'Manga Aura Judge' : 'Anime Aura Judge'

  // Measure dynamic height first (dry run for text wrapping)
  const measure = document.createElement('canvas').getContext('2d')

  const images = await Promise.all(
    selectedAnime.map((a) =>
      loadImage(a.images?.jpg?.large_image_url || a.images?.jpg?.image_url),
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
  const innerW = W - PAD * 2

  measure.font = '14px system-ui, sans-serif'
  const explanationLines = wrapText(measure, explanation || subtitle || '', innerW - 40)
  const analysisTextH = explanationLines.length * 20
  const analysisH = 110 + (callout ? 44 : 0) + analysisTextH
  const footerH = 60
  const H = analysisTop + analysisH + footerH + PAD

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)

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
      ctx.fillText('image unavailable', x + cell / 2, y + cell / 2)
      ctx.textAlign = 'left'
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

  // Contributions panel
  const contribPanelH = 30 + contribRows * contribRowH
  ctx.fillStyle = 'rgba(24,24,27,0.5)'
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
    let title = `${i + 1}. ${m.animeTitle}`
    while (ctx.measureText(title).width > colW - 70 && title.length > 4) {
      title = `${title.slice(0, -2)}…`
    }
    ctx.fillText(title, x, y + 10)

    ctx.font = '11px ui-monospace, monospace'
    ctx.fillStyle = COLORS.textFaint
    let label = m.label || ''
    while (ctx.measureText(label).width > colW - 70 && label.length > 4) {
      label = `${label.slice(0, -2)}…`
    }
    ctx.fillText(label, x, y + 28)

    ctx.font = '600 12px ui-monospace, monospace'
    ctx.textAlign = 'right'
    ctx.fillStyle = m.sign === '+' ? COLORS.emerald : COLORS.rose
    ctx.fillText(`${m.sign}${m.pts.toLocaleString()}`, x + colW, y + 18)
    ctx.textAlign = 'left'
  })

  // Analysis summary
  const ay = analysisTop
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillStyle = COLORS.textDim
  ctx.fillText('ANALYSIS SUMMARY', PAD, ay + 8)
  ctx.font = '700 24px system-ui, sans-serif'
  ctx.fillStyle = COLORS.indigo
  let arch = archetype || ''
  while (ctx.measureText(arch).width > innerW && arch.length > 4) {
    arch = `${arch.slice(0, -2)}…`
  }
  ctx.fillText(arch, PAD, ay + 40)

  let ty = ay + 62
  if (callout) {
    ctx.font = '500 14px system-ui, sans-serif'
    ctx.fillStyle = COLORS.text
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

  // Footer
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillStyle = COLORS.textFaint
  ctx.textAlign = 'center'
  const footer = [
    offline ? 'offline mode' : null,
    'deterministic scoring',
    offline ? 'Powered by Jikan (Local Fallback)' : 'Powered by Jikan + OpenRouter (Gemini 3.7 Flash)',
  ]
    .filter(Boolean)
    .join('  ·  ')
  ctx.fillText(footer, W / 2, H - PAD + 10)
  ctx.textAlign = 'left'

  return canvas
}

export async function downloadCardImage(params) {
  const canvas = await renderCardCanvas(params)
  const link = document.createElement('a')
  link.download = isManga ? 'manga-aura-card.png' : 'anime-aura-card.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
}
