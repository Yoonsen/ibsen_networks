import { useEffect, useMemo, useState, useCallback } from 'react'

const GENDER_COLORS = {
  F: '#c62828', // rød for kvinner
  M: '#1d4ed8', // blå for menn
  '?': '#555',  // ukjent
}

// Kontraststerk palett (gjenbrukes på tvers av skuespill)
const TURN_COLORS = [
  '#2563eb', // blå
  '#dc2626', // rød
  '#059669', // grønn
  '#d97706', // oransje
  '#7c3aed', // lilla
  '#0ea5e9', // cyan
  '#d946ef', // magenta
  '#16a34a', // mørk grønn
  '#f97316', // lys oransje
  '#1d4ed8', // mørk blå
  '#e11d48', // rosa/rød
  '#10b981', // jade
  '#a16207', // bronse
  '#9333ea', // fiolett
  '#0891b2', // turkis
  '#b91c1c', // dyp rød
  '#22c55e', // lime
  '#f59e0b', // gul-oransje
  '#0f766e', // teal
  '#4b5563', // gråblå
  '#c026d3', // klar lilla
  '#475569', // grå
  '#14b8a6', // aqua
  '#f43f5e', // korall
]

const TURN_BAR_WIDTH = 18

const THEME = {
  bg: '#f6f8fb',
  card: '#ffffff',
  border: '#e5e7eb',
  text: '#0f172a',
  subtle: '#475569',
  accent: '#2563eb',
  accentSoft: '#e0e7ff',
  shadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
}

function displayTitle(title) {
  if (!title) return ''
  return String(title).replace(/_/g, ' ')
}

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return h
}

function colorForSpeaker(name, gender) {
  if (!name) return GENDER_COLORS[gender] ?? '#6b7280'
  const idx = Math.abs(hashString(name)) % TURN_COLORS.length
  return TURN_COLORS[idx] ?? GENDER_COLORS[gender] ?? '#6b7280'
}

function computeBechdelStatus(dialogCount = 0, noMaleCount = 0) {
  if (!dialogCount || dialogCount === 0) return 'NR'
  if (noMaleCount > 0) return 'bestått'
  return 'ikke bestått'
}

function normalizeGender(name, rawGender, femaleMap = {}) {
  if (rawGender === 'F' || rawGender === 'M' || rawGender === '?') return rawGender
  if (typeof rawGender === 'boolean') return rawGender ? 'F' : 'M'
  if (name in femaleMap) return femaleMap[name] ? 'F' : 'M'
  return '?'
}

function computeSpeechStats(network, femaleMap = {}, wordCounts = null) {
  const edges = network?.edges ?? []
  const nodeDefs = network?.nodes ?? []
  const nodeMap = new Map()
  const genderLookup = new Map()

  nodeDefs.forEach(n => {
    if (n?.id) {
      genderLookup.set(n.id, normalizeGender(n.id, n.gender, femaleMap))
    }
  })

  function ensureNode(name) {
    if (!name) return null
    if (!nodeMap.has(name)) {
      const gender = genderLookup.get(name) ?? normalizeGender(name, undefined, femaleMap)
      nodeMap.set(name, { name, gender, speeches: 0, totalLen: 0 })
    }
    return nodeMap.get(name)
  }

  // sørg for at alle noder finnes, også de uten kanter
  nodeDefs.forEach(n => ensureNode(n.id))

  // Hvis vi har word_counts, bruk dem som sann taletid/ord.
  if (Array.isArray(wordCounts)) {
    for (const row of wordCounts) {
      if (!row?.character) continue
      const node = ensureNode(row.character)
      const words = Number(row.words ?? 0)
      if (node) {
        node.speeches = words
        node.totalLen = words
      }
    }
  } else {
    // fallback: estimer fra overgangene
    edges.forEach(e => {
      const from = e.source
      const to = e.target
      if (!from || !to) return

      const count = Number.isFinite(e.count) ? e.count : Number.isFinite(e.weight) ? e.weight : 0
      const avgA = Number.isFinite(e.avg_len_A) ? e.avg_len_A : null
      const avgB = Number.isFinite(e.avg_len_B) ? e.avg_len_B : null

      const totalA = avgA !== null ? count * avgA : count
      const totalB = avgB !== null ? count * avgB : count

      const fromNode = ensureNode(from)
      const toNode = ensureNode(to)
      if (!fromNode || !toNode) return

      fromNode.speeches += count
      fromNode.totalLen += totalA

      toNode.speeches += count
      toNode.totalLen += totalB
    })
  }

  const nodes = Array.from(nodeMap.values()).map(n => ({
    ...n,
    avgLen: n.speeches > 0 ? n.totalLen / n.speeches : 0,
  }))

  nodes.sort((a, b) => b.totalLen - a.totalLen)

  return { nodes, edges }
}

function computeTurnSequence(dialogs, femaleMap = {}) {
  const turns = []
  for (const d of dialogs ?? []) {
    const speakers = Array.isArray(d?.speakers) ? d.speakers.filter(Boolean) : []
    if (speakers.length === 0) continue
    const turnCount = Math.max(1, Number(d.length ?? 0))
    const wordsPerTurn = turnCount > 0 ? (Number(d.total_words ?? 0) / turnCount) : 0
    for (let i = 0; i < turnCount; i++) {
      const speaker = speakers[i % speakers.length]
      if (!speaker) continue
      turns.push({
        speaker,
        gender: normalizeGender(speaker, undefined, femaleMap),
        words: wordsPerTurn,
      })
    }
  }
  const totalWords = turns.reduce((s, t) => s + t.words, 0)
  return { turns, totalWords }
}

function buildSceneNetwork(dialogs, femaleMap = {}) {
  const nodesMap = new Map()
  const edgeMap = new Map()

  const ensureNode = (id) => {
    if (!id) return
    if (!nodesMap.has(id)) {
      nodesMap.set(id, { id, gender: normalizeGender(id, undefined, femaleMap) })
    }
  }

  for (const d of dialogs) {
    const speakers = Array.isArray(d.speakers) ? d.speakers : []
    if (speakers.length < 2) continue
    speakers.forEach(ensureNode)
    const wordsPerSpeaker = (d.total_words ?? 0) / speakers.length
    for (const s of speakers) {
      const n = nodesMap.get(s)
      n.words = (n.words ?? 0) + wordsPerSpeaker
    }
    // behandle parvis (typisk 2-speakers dialog)
    for (let i = 0; i < speakers.length; i++) {
      for (let j = i + 1; j < speakers.length; j++) {
        const a = speakers[i]
        const b = speakers[j]
        const key = `${a}|${b}`
        if (!edgeMap.has(key)) {
          edgeMap.set(key, { source: a, target: b, count: 0, weight: 0 })
        }
        const e = edgeMap.get(key)
        e.count += d.length ?? 1
        e.weight += d.total_words ?? 0
      }
    }
  }

  const nodes = Array.from(nodesMap.values())
  const edges = Array.from(edgeMap.values())
  const wordCounts = nodes.map(n => ({ character: n.id, words: Math.round(n.words ?? 0) }))
  return {
    network: { nodes, edges },
    wordCounts,
  }
}

function computePositions(nodes = [], width = 420, height = 420) {
  if (!nodes || nodes.length === 0) return null
  const sorted = [...nodes].sort((a, b) => (a.id || '').localeCompare(b.id || ''))
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.35
  const map = new Map()
  const n = sorted.length
  sorted.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    map.set(node.id || node.name, { x, y })
  })
  return map
}

function genderSymbol(g) {
  if (g === 'F') return '♀'
  if (g === 'M') return '♂'
  return ''
}

// Enkel sirkulær nettverksgraf i SVG
function NetworkGraph({ nodes, edges, width = 420, height = 420, positions = null, dimInactive = false }) {
  if (!nodes || nodes.length === 0) return <p>Ingen noder å vise.</p>

  const nodePositions = new Map()
  if (positions && positions.size > 0) {
    nodes.forEach(node => {
      const pos = positions.get(node.name) || positions.get(node.id)
      if (pos) nodePositions.set(node.name, pos)
    })
  }
  if (nodePositions.size === 0) {
    const cx = width / 2
    const cy = height / 2
    const radius = Math.min(width, height) * 0.35
    const n = nodes.length
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2
      const x = cx + radius * Math.cos(angle)
      const y = cy + radius * Math.sin(angle)
      nodePositions.set(node.name, { x, y })
    })
  }

  const maxWeight = edges.reduce((m, e) => Math.max(m, e.count ?? e.weight ?? 0), 0)
  const maxTotalLen = nodes.reduce((m, nd) => Math.max(m, nd.totalLen ?? 0), 0)

  return (
    <svg
      width={width}
      height={height}
      style={{ border: '1px solid #ddd', borderRadius: '4px', background: '#fafafa' }}
    >
      {edges.map((e, i) => {
        const fromPos = nodePositions.get(e.source)
        const toPos = nodePositions.get(e.target)
        if (!fromPos || !toPos) return null
        const weight = e.count ?? e.weight ?? 0
        const w = maxWeight > 0 ? 0.5 + 3 * (weight / maxWeight) : 1
        return (
          <line
            key={i}
            x1={fromPos.x}
            y1={fromPos.y}
            x2={toPos.x}
            y2={toPos.y}
            stroke="#9aa0a6"
            strokeWidth={w}
            strokeOpacity={0.85}
          />
        )
      })}

      {nodes.map(node => {
        const pos = nodePositions.get(node.name)
        if (!pos) return null
        const r = maxTotalLen > 0 ? 4 + 10 * ((node.totalLen ?? 0) / maxTotalLen) : 6
        const fill = colorForSpeaker(node.name, node.gender)
        const sym = genderSymbol(node.gender)
        const label = sym ? `${node.name} ${sym}` : node.name
        return (
          <g key={node.name}>
            <circle cx={pos.x} cy={pos.y} r={r} fill={fill} stroke="#0f172a" strokeWidth="0.6" />
            <text
              x={pos.x}
              y={pos.y - r - 4}
              fontSize="10"
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        )
      })}

      {/* liten legend: symbol forklaring */}
      <g transform={`translate(${width - 126}, ${height - 55})`}>
        <rect width="116" height="48" fill="white" stroke="#ddd" rx="4" />
        <LegendRow y={14} color="#0f172a" label="♀ kvinne" />
        <LegendRow y={30} color="#0f172a" label="♂ mann" />
        <LegendRow y={46} color="#0f172a" label="? ukjent" />
      </g>
    </svg>
  )
}

function LegendRow({ y, color, label }) {
  return (
    <g transform={`translate(8, ${y})`}>
      <circle cx="0" cy="0" r="5" fill={color} />
      <text x="12" y="4" fontSize="10">
        {label}
      </text>
    </g>
  )
}

function StatChip({ label, value, color = THEME.text }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.2rem',
      padding: '0.65rem 0.75rem',
      borderRadius: '10px',
      border: `1px solid ${THEME.border}`,
      background: THEME.card,
      boxShadow: THEME.shadow,
      minWidth: '120px',
    }}>
      <span style={{ color: THEME.subtle, fontSize: '0.9rem' }}>{label}</span>
      <span style={{ fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

function NetworkSection({ title, network, femaleMap, width = 420, height = 420, wordCounts = null, positions = null, dimInactive = false, showWords = true, note = null }) {
  const { nodes, edges } = useMemo(() => computeSpeechStats(network, femaleMap, wordCounts), [network, femaleMap, wordCounts])

  return (
    <div style={{ flex: 1, minWidth: '0' }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p style={{ marginTop: '-0.25rem' }}>
        Noder: <strong>{nodes.length}</strong> &nbsp;|&nbsp; Kanter: <strong>{edges.length}</strong>
      </p>
      <NetworkGraph nodes={nodes} edges={edges} width={width} height={height} positions={positions} dimInactive={dimInactive} />

      {note && (
        <p style={{ color: THEME.subtle, fontSize: '0.9rem', marginTop: '0.5rem' }}>{note}</p>
      )}

      {showWords && nodes.length > 0 && (
        <>
          <h4 style={{ marginTop: '0.75rem' }}>Ord (topp 10)</h4>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '0.25rem' }}>Karakter</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'right', padding: '0.25rem' }}>Ord</th>
              </tr>
            </thead>
            <tbody>
              {nodes.slice(0, 10).map(n => (
                <tr key={n.name}>
                  <td style={{ padding: '0.25rem' }}>{n.name}</td>
                  <td style={{ padding: '0.25rem', textAlign: 'right' }}>{Math.round(n.totalLen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function StatsPanel({ play, selectedActWordCounts, onShowDialogList }) {
  if (!play) return null
  const bechdel = play.bechdel
  const dialogs = play.dialogs ?? []
  const femaleDialogs = dialogs.filter(d => d.female_pair)
  const topWords = (play.word_counts ?? []).slice(0, 8)
  const actWords = (selectedActWordCounts ?? []).slice(0, 8)
  const actWordMatrix = useMemo(() => {
    const source = play.act_word_counts ?? {}
    let acts = Object.keys(source)
    if (acts.length === 0 && Array.isArray(play.acts)) {
      acts = play.acts.map(a => a.act_n)
    }
    acts = acts.sort((a, b) => Number(a) - Number(b))
    const charMap = new Map()
    let maxWord = 0

    const addWord = (character, act, words) => {
      if (!character) return
      if (!charMap.has(character)) {
        charMap.set(character, { character, totals: {}, sum: 0 })
      }
      const row = charMap.get(character)
      const val = Number(words ?? 0)
      row.totals[act] = val
      row.sum += val
      if (val > maxWord) maxWord = val
    }

    if (Object.keys(source).length > 0) {
      for (const act of acts) {
        for (const row of source[act] ?? []) {
          addWord(row.character, act, row.words)
        }
      }
    } else if (Array.isArray(play.acts)) {
      for (const act of play.acts) {
        for (const row of act.word_counts ?? []) {
          addWord(row.character, act.act_n, row.words)
        }
      }
    }

    const rows = Array.from(charMap.values()).sort((a, b) => b.sum - a.sum)
    return { acts, rows, maxWord }
  }, [play])

  function computeHeuristic(dialogCount, noMaleCount) {
    if (!dialogCount || dialogCount === 0) return 'NR'
    if (noMaleCount > 0) return 'bestått'
    return 'ikke bestått' // har kvinnelige dialoger, men alle nevner menn
  }

  const hStatus = computeHeuristic(bechdel?.female_dialog_count, bechdel?.female_dialogs_no_male_pron)

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h3>Statistikk</h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div style={{ minWidth: '18rem', background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '10px', padding: '1rem', boxShadow: THEME.shadow }}>
          <h4 style={{ marginTop: 0 }}>Bechdel</h4>
          {bechdel ? (
            <ul style={{ marginTop: '0.25rem', color: THEME.subtle }}>
              <li>Status: <strong>{bechdel.status}</strong> ({bechdel.passes ? 'passer' : 'passer ikke'})</li>
              <li>Kvinnelige dialoger: {bechdel.female_dialog_count}</li>
              <li>Uten mannlige pronomen: {bechdel.female_dialogs_no_male_pron}</li>
            </ul>
          ) : (
            <p>Ingen Bechdel-info.</p>
          )}

          <h4 style={{ marginTop: '0.75rem' }}>Dialoger</h4>
          <p style={{ color: THEME.subtle }}>
            Totalt: {dialogs.length} &nbsp;|&nbsp; Kvinnelige par: {femaleDialogs.length}
          </p>
          <p style={{ color: THEME.subtle }}>
            Heuristikk (female dialogs / uten mannlige pronomen): {bechdel?.female_dialog_count ?? 0} / {bechdel?.female_dialogs_no_male_pron ?? 0} → <strong>{hStatus}</strong>
          </p>
          {femaleDialogs.length > 0 && (
            <button
              onClick={() => onShowDialogList?.(femaleDialogs, play.title)}
              style={{
                marginTop: '0.35rem',
                padding: '0.45rem 0.6rem',
                borderRadius: '8px',
                border: `1px solid ${THEME.border}`,
                background: THEME.accentSoft,
                color: THEME.text,
                cursor: 'pointer',
              }}
            >
              Vis kvinnelige dialoger ({femaleDialogs.length})
            </button>
          )}
        </div>

        {topWords.length > 0 && (
          <div style={{ minWidth: '18rem', flex: 1, background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '10px', padding: '1rem', boxShadow: THEME.shadow }}>
            <h4 style={{ marginTop: 0 }}>Ordtelling (hele stykket)</h4>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: `1px solid ${THEME.border}`, textAlign: 'left', padding: '0.35rem' }}>Karakter</th>
                  <th style={{ borderBottom: `1px solid ${THEME.border}`, textAlign: 'right', padding: '0.35rem' }}>Ord</th>
                </tr>
              </thead>
              <tbody>
                {topWords.map(row => (
                  <tr key={row.character}>
                    <td style={{ padding: '0.35rem' }}>{row.character}</td>
                    <td style={{ padding: '0.35rem', textAlign: 'right' }}>{row.words}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {actWords.length > 0 && (
          <div style={{ minWidth: '18rem', flex: 1, background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '10px', padding: '1rem', boxShadow: THEME.shadow }}>
            <h4 style={{ marginTop: 0 }}>Ordtelling (valgt akt)</h4>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: `1px solid ${THEME.border}`, textAlign: 'left', padding: '0.35rem' }}>Karakter</th>
                  <th style={{ borderBottom: `1px solid ${THEME.border}`, textAlign: 'right', padding: '0.35rem' }}>Ord</th>
                </tr>
              </thead>
              <tbody>
                {actWords.map(row => (
                  <tr key={row.character}>
                    <td style={{ padding: '0.35rem' }}>{row.character}</td>
                    <td style={{ padding: '0.35rem', textAlign: 'right' }}>{row.words}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {actWordMatrix?.rows?.length > 0 && (
          <div style={{ minWidth: '18rem', flexBasis: '100%', background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '10px', padding: '1rem', boxShadow: THEME.shadow }}>
            <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Ord per karakter per akt</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ borderBottom: `1px solid ${THEME.border}`, textAlign: 'left', padding: '0.35rem', position: 'sticky', left: 0, background: THEME.card }}>Karakter</th>
                    {actWordMatrix.acts.map(act => (
                      <th key={act} style={{ borderBottom: `1px solid ${THEME.border}`, textAlign: 'right', padding: '0.35rem' }}>
                        Akt {act}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {actWordMatrix.rows.map(row => (
                    <tr key={row.character}>
                      <td style={{ padding: '0.35rem', textAlign: 'left', position: 'sticky', left: 0, background: THEME.card }}>
                        {row.character}
                      </td>
                      {actWordMatrix.acts.map(act => {
                        const val = row.totals[act] ?? 0
                        const ratio = actWordMatrix.maxWord > 0 ? val / actWordMatrix.maxWord : 0
                        const bg = ratio === 0
                          ? '#f8fafc'
                          : `rgba(37, 99, 235, ${0.12 + 0.55 * ratio})`
                        const color = ratio > 0.6 ? '#0b1f4a' : '#0f172a'
                        return (
                          <td
                            key={act}
                            style={{
                              padding: '0.35rem',
                              textAlign: 'right',
                              background: bg,
                              color,
                              borderBottom: `1px solid ${THEME.border}`,
                            }}
                          >
                            {val}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PlaySelector({ plays, selectedId, onChange, filterQuery, onFilterChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxWidth: '26rem' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span>Velg skuespill</span>
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Søk etter tittel/id..."
          style={{ padding: '0.55rem', borderRadius: '10px', border: `1px solid ${THEME.border}` }}
        />
      </label>
      <div style={{ maxHeight: '14rem', overflowY: 'auto', border: `1px solid ${THEME.border}`, borderRadius: '10px', background: '#fff' }}>
        {plays.map(p => {
          const isSel = (p.id || p.title) === selectedId
          return (
            <button
              key={p.id || p.title}
              onClick={() => onChange(p.id || p.title)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.5rem 0.65rem',
                background: isSel ? THEME.accentSoft : 'transparent',
                color: THEME.text,
                border: 'none',
                borderBottom: `1px solid ${THEME.border}`,
                cursor: 'pointer',
              }}
            >
              {displayTitle(p.title)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function InfoModal({ open, onClose }) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.35)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: THEME.card,
          borderRadius: '14px',
          border: `1px solid ${THEME.border}`,
          boxShadow: THEME.shadow,
          maxWidth: '560px',
          width: '100%',
          padding: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Om data og visning</h3>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: THEME.accentSoft,
              color: THEME.accent,
              borderRadius: '999px',
              padding: '0.35rem 0.65rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Lukk
          </button>
        </div>
        <ul style={{ color: THEME.subtle, lineHeight: 1.6, paddingLeft: '1rem' }}>
          <li>Globalt nettverk: talenettverk for hele stykket.</li>
          <li>Akter: hvert akt-nettverk rendres under i en scrollbar kolonne.</li>
          <li>Noder fargekodes etter kjønn (F=rød, M=blå, ukjent=grå).</li>
          <li>Bechdel- og dialogtall finnes i statistikkfeltet nederst.</li>
          <li>Data kommer fra `ibsen_networks.json` (FEMALE_CHARACTERS, nettverk, ordtall).</li>
        </ul>
      </div>
    </div>
  )
}

function DialogModal({ open, onClose, dialogs = [], title }) {
  if (!open) return null
  const [sortKey, setSortKey] = useState('length')
  const [hideMalePron, setHideMalePron] = useState(false)
  const [pairSortKey, setPairSortKey] = useState('words')
  const [pairSortDir, setPairSortDir] = useState('desc')

  const filtered = useMemo(() => {
    return hideMalePron ? dialogs.filter(d => (d.male_pron ?? 0) === 0) : dialogs
  }, [dialogs, hideMalePron])

  const sorted = useMemo(() => {
    const list = [...filtered]
    const cmp = {
      length: (a, b) => (b.length ?? 0) - (a.length ?? 0),
      words: (a, b) => (b.total_words ?? 0) - (a.total_words ?? 0),
      male_pron: (a, b) => (a.male_pron ?? 0) - (b.male_pron ?? 0),
    }[sortKey] ?? (() => 0)
    return list.sort(cmp)
  }, [filtered, sortKey])

  const pairStats = useMemo(() => {
    const map = new Map()
    for (const d of filtered) {
      const sp = Array.isArray(d.speakers) ? d.speakers.slice().sort() : []
      if (sp.length !== 2) continue
      const key = sp.join(' | ')
      if (!map.has(key)) {
        map.set(key, { speakers: sp, dialogs: 0, totalWords: 0, maxLength: 0, totalTurns: 0 })
      }
      const rec = map.get(key)
      rec.dialogs += 1
      rec.totalWords += d.total_words ?? 0
      rec.totalTurns += d.length ?? 0
      rec.maxLength = Math.max(rec.maxLength, d.length ?? 0)
    }
    const arr = Array.from(map.values())
    const maxWords = arr.reduce((m, r) => Math.max(m, r.totalWords), 0)
    return { pairs: arr, maxWords }
  }, [filtered])

  const sortedPairs = useMemo(() => {
    const cmp = {
      words: (a, b) => (b.totalWords ?? 0) - (a.totalWords ?? 0),
      dialogs: (a, b) => (b.dialogs ?? 0) - (a.dialogs ?? 0),
      turns: (a, b) => (b.totalTurns ?? 0) - (a.totalTurns ?? 0),
      maxlen: (a, b) => (b.maxLength ?? 0) - (a.maxLength ?? 0),
    }[pairSortKey] ?? (() => 0)
    const list = [...pairStats.pairs].sort(cmp)
    if (pairSortDir === 'asc') list.reverse()
    return list
  }, [pairStats, pairSortKey, pairSortDir])

  const togglePairSort = (key) => {
    if (pairSortKey === key) {
      setPairSortDir(pairSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setPairSortKey(key)
      setPairSortDir('desc')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.35)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: THEME.card,
          borderRadius: '14px',
          border: `1px solid ${THEME.border}`,
          boxShadow: THEME.shadow,
          maxWidth: '820px',
          width: '100%',
          padding: '1.25rem',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>{title || 'Dialoger'}</h3>
            <p style={{ margin: 0, color: THEME.subtle }}>{filtered.length} dialoger (kvinnelige par)</p>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: THEME.accentSoft,
              color: THEME.accent,
              borderRadius: '999px',
              padding: '0.35rem 0.65rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Lukk
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input
              type="checkbox"
              checked={hideMalePron}
              onChange={(e) => setHideMalePron(e.target.checked)}
            />
            <span style={{ color: THEME.subtle }}>Skjul dialoger med mannlige pronomen</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ color: THEME.subtle }}>Sorter på:</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: THEME.accentSoft, color: THEME.text }}
            >
              <option value="length">Lengde (turer)</option>
              <option value="words">Ord</option>
              <option value="male_pron">Færrest mannlige pronomen</option>
            </select>
          </div>
        </div>

        <div style={{ overflowY: 'auto', paddingRight: '0.25rem', flex: 1 }}>
          {pairStats.pairs.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <h4 style={{ margin: '0 0 0.35rem 0' }}>Intensitet per par</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ borderBottom: `1px solid ${THEME.border}`, textAlign: 'left', padding: '0.35rem' }}>Par</th>
                      <th onClick={() => togglePairSort('words')} style={{ cursor: 'pointer', borderBottom: `1px solid ${THEME.border}`, textAlign: 'right', padding: '0.35rem' }}>Ord (sum){pairSortKey === 'words' ? (pairSortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                      <th onClick={() => togglePairSort('dialogs')} style={{ cursor: 'pointer', borderBottom: `1px solid ${THEME.border}`, textAlign: 'right', padding: '0.35rem' }}>Dialoger{pairSortKey === 'dialogs' ? (pairSortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                      <th onClick={() => togglePairSort('turns')} style={{ cursor: 'pointer', borderBottom: `1px solid ${THEME.border}`, textAlign: 'right', padding: '0.35rem' }}>Tot. turer{pairSortKey === 'turns' ? (pairSortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                      <th onClick={() => togglePairSort('maxlen')} style={{ cursor: 'pointer', borderBottom: `1px solid ${THEME.border}`, textAlign: 'right', padding: '0.35rem' }}>Maks lengde{pairSortKey === 'maxlen' ? (pairSortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPairs.map((p, idx) => {
                      const ratio = pairStats.maxWords > 0 ? p.totalWords / pairStats.maxWords : 0
                      const bg = ratio === 0 ? '#f8fafc' : `rgba(37, 99, 235, ${0.12 + 0.55 * ratio})`
                      const color = ratio > 0.6 ? '#0b1f4a' : '#0f172a'
                      return (
                        <tr key={idx} style={{ background: bg, color }}>
                          <td style={{ padding: '0.35rem' }}>{p.speakers.join(' ↔ ')}</td>
                          <td style={{ padding: '0.35rem', textAlign: 'right' }}>{p.totalWords}</td>
                          <td style={{ padding: '0.35rem', textAlign: 'right' }}>{p.dialogs}</td>
                          <td style={{ padding: '0.35rem', textAlign: 'right' }}>{p.totalTurns}</td>
                          <td style={{ padding: '0.35rem', textAlign: 'right' }}>{p.maxLength}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sorted.map((d, idx) => (
              <div key={idx} style={{ border: `1px solid ${THEME.border}`, borderRadius: '10px', padding: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong>{d.speakers?.join(' ↔ ')}</strong>
                  <span style={{ color: THEME.subtle }}>Akt {d.act}, Scene {d.scene}</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.35rem', color: THEME.subtle }}>
                  <span>Lengde (turer): {d.length ?? '–'}</span>
                  <span>Ord: {d.total_words ?? '–'}</span>
                  <span>M-pron: {d.male_pron ?? 0}</span>
                  <span>F-pron: {d.female_pron ?? 0}</span>
                </div>
                {(d.male_pron ?? 0) === 0 && (
                  <span style={{ marginTop: '0.25rem', display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '999px', background: '#d1fae5', color: '#065f46', fontSize: '0.85rem' }}>
                    Ingen mannlige pronomen
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [selectedAct, setSelectedAct] = useState('')
  const [playFilter, setPlayFilter] = useState('')
  const [isWide, setIsWide] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth >= 900 : true)
  )
  const [showInfo, setShowInfo] = useState(false)
  const [sortKey, setSortKey] = useState('female-nodes')
  const [dialogModal, setDialogModal] = useState({ open: false, dialogs: [], title: '' })
const [pairSortKeyAll, setPairSortKeyAll] = useState('words')
const [pairSortDirAll, setPairSortDirAll] = useState('desc')
const [sceneAct, setSceneAct] = useState('')
const [sceneId, setSceneId] = useState('')
const [sceneIndex, setSceneIndex] = useState(0)
const [networkView, setNetworkView] = useState('speech')
const [showTurnDetails, setShowTurnDetails] = useState(false)
const [turnHover, setTurnHover] = useState(null)     // stripe hover (scene)
const [turnBarHover, setTurnBarHover] = useState(null) // bar hover (scene)
const [actTurnHover, setActTurnHover] = useState(null) // stripe hover (act)
const [actBarHover, setActBarHover] = useState(null)   // bar hover (act)
const [showSandbox, setShowSandbox] = useState(false)
const [sandboxPlaying, setSandboxPlaying] = useState(false)
const [sandboxIndex, setSandboxIndex] = useState(0)
const [sandboxSpeed, setSandboxSpeed] = useState(1)
const [showPulseNet, setShowPulseNet] = useState(false)
const [pulsePlaying, setPulsePlaying] = useState(false)
const [pulseIndex, setPulseIndex] = useState(0)
const [pulseSpeed, setPulseSpeed] = useState(2)
const [pulseWeights, setPulseWeights] = useState(new Map())
const [pulsePositions, setPulsePositions] = useState(new Map())
const [pulseSeed, setPulseSeed] = useState(1)
const [draggingId, setDraggingId] = useState(null)

  useEffect(() => {
    fetch('./ibsen_networks.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load JSON')
        return res.json()
      })
      .then(setData)
      .catch(err => setError(err.message))
  }, [])

  const plays = useMemo(() => {
    const raw = data?.plays ?? []
    return raw.filter(p => {
      const total = (p.word_counts ?? []).reduce((s, r) => s + (r.words ?? 0), 0)
      return total > 0
    })
  }, [data])
  const femaleMap = data?.FEMALE_CHARACTERS ?? {}
  const filteredPlays = useMemo(() => {
    const q = playFilter.trim().toLowerCase()
    if (!q) return plays
    const res = plays.filter(p => {
      const id = (p.id || '').toLowerCase()
      const title = (p.title || '').toLowerCase()
      return id.includes(q) || title.includes(q) || displayTitle(p.title).toLowerCase().includes(q)
    })
    // sørg for at valgt stykke fortsatt er synlig i listen selv om filtret ekskluderer det
    if (selectedId) {
      const has = res.some(p => (p.id || p.title) === selectedId)
      if (!has) {
        const sel = plays.find(p => (p.id || p.title) === selectedId)
        if (sel) res.unshift(sel)
      }
    }
    return res
  }, [plays, playFilter, selectedId])

  const playsWithMeta = useMemo(() => {
    return plays.map(p => {
      const nodes = p.speech_network?.nodes ?? []
      const femaleNodes = nodes.filter(n => normalizeGender(n.id, n.gender, femaleMap) === 'F').length
      let femaleWords = 0
      let maleWords = 0
      let unknownWords = 0
      for (const row of p.word_counts ?? []) {
        const val = row.words ?? 0
        if (row.character in femaleMap) {
          if (femaleMap[row.character]) femaleWords += val
          else maleWords += val
        } else {
          unknownWords += val
        }
      }
      const totalWords = femaleWords + maleWords + unknownWords
      const femaleShare = totalWords > 0 ? femaleWords / totalWords : 0
      const dialogCount = p.bechdel?.female_dialog_count ?? 0
      const noMaleCount = p.bechdel?.female_dialogs_no_male_pron ?? 0
      const bechdelStatus = computeBechdelStatus(dialogCount, noMaleCount)
      const bechdelRank = bechdelStatus === 'bestått' ? 0 : bechdelStatus === 'ikke bestått' ? 1 : 2
      return {
        ...p,
        femaleNodes,
        femaleWords,
        maleWords,
        unknownWords,
        femaleShare,
        totalWords,
        bechdelStatus,
        bechdelRank,
        dialogCount,
        noMaleCount,
      }
    })
  }, [plays, femaleMap])

  const globalStats = useMemo(() => {
    const totalPlays = playsWithMeta.length
    const femaleWords = playsWithMeta.reduce((s, p) => s + (p.femaleWords ?? 0), 0)
    const maleWords = playsWithMeta.reduce((s, p) => s + (p.maleWords ?? 0), 0)
    const unknownWords = playsWithMeta.reduce((s, p) => s + (p.unknownWords ?? 0), 0)
    const bechdelPass = playsWithMeta.filter(p => p.bechdelStatus === 'bestått').length
    const bechdelFail = playsWithMeta.filter(p => p.bechdelStatus === 'ikke bestått').length
    const bechdelNR = playsWithMeta.filter(p => p.bechdelStatus === 'NR').length
    return { totalPlays, femaleWords, maleWords, unknownWords, bechdelPass, bechdelFail, bechdelNR }
  }, [playsWithMeta])

  useEffect(() => {
    if (!selectedId && plays.length > 0) {
      const first = plays[0]
      setSelectedId(first.id || first.title)
    }
  }, [plays, selectedId])

  const selectedPlay = useMemo(
    () => plays.find(p => (p.id || p.title) === selectedId),
    [plays, selectedId],
  )

  useEffect(() => {
    if (selectedPlay?.acts?.length) {
      setSelectedAct(selectedPlay.acts[0].act_n)
    } else {
      setSelectedAct('')
    }
  }, [selectedPlay])

  useEffect(() => {
    function handleResize() {
      setIsWide(window.innerWidth >= 900)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const actOptions = selectedPlay?.acts ?? []
  const actData = actOptions.find(a => a.act_n === selectedAct)
  const actWordCounts = actData?.word_counts

  const handleShowDialogList = (dialogs, title) => {
    setDialogModal({ open: true, dialogs: dialogs ?? [], title: displayTitle(title) })
  }

  const scenesByAct = useMemo(() => {
    const byAct = new Map()
    const ds = selectedPlay?.dialogs ?? []
    for (const d of ds) {
      const act = d.act
      const scene = d.scene
      if (!act || !scene) continue
      if (!byAct.has(act)) byAct.set(act, new Set())
      byAct.get(act).add(scene)
    }
    const result = Array.from(byAct.entries()).map(([act, scenes]) => ({
      act,
      scenes: Array.from(scenes).sort((a, b) => Number(a) - Number(b)),
    })).sort((a, b) => Number(a.act) - Number(b.act))
    return result
  }, [selectedPlay])

const hasCoNetwork = Boolean(selectedPlay?.co_network?.nodes?.length)
const activeNetwork =
  networkView === 'co' && hasCoNetwork
    ? selectedPlay?.co_network
    : selectedPlay?.speech_network

const activePositions = useMemo(() => {
  const size = isWide ? 520 : 360
  return computePositions(activeNetwork?.nodes ?? [], size, size)
}, [activeNetwork, isWide])

const networkNote = networkView === 'co'
  ? 'Kantvekt = antall scener der begge står på scenen samtidig.'
  : 'Kantvekt = taleturer A→B (replikk-sekvenser) med snittlengder.'
const activeNodeCount = activeNetwork?.nodes?.length ?? 0

  const sceneSequence = useMemo(() => {
    const seq = []
    for (const entry of scenesByAct) {
      for (const s of entry.scenes) {
        seq.push({ act: entry.act, scene: s })
      }
    }
    return seq
  }, [scenesByAct])

  useEffect(() => {
    if (sceneSequence.length === 0) {
      setSceneAct('')
      setSceneId('')
      setSceneIndex(0)
      return
    }
    const idx = Math.min(sceneIndex, sceneSequence.length - 1)
    const entry = sceneSequence[idx]
    if (entry) {
      setSceneAct(entry.act)
      setSceneId(entry.scene)
    }
  }, [sceneSequence, sceneIndex])

  useEffect(() => {
    if (sceneSequence.length === 0) return
    const idx = sceneSequence.findIndex(e => e.act === sceneAct && e.scene === sceneId)
    if (idx >= 0 && idx !== sceneIndex) {
      setSceneIndex(idx)
    }
  }, [sceneAct, sceneId, sceneSequence])

  useEffect(() => {
    setShowTurnDetails(false)
  }, [sceneAct, sceneId])

  const sceneDialogs = useMemo(() => {
    if (!sceneAct || !sceneId) return []
    return (selectedPlay?.dialogs ?? []).filter(d => d.act === sceneAct && d.scene === sceneId && Array.isArray(d.speakers) && d.speakers.length >= 2)
  }, [selectedPlay, sceneAct, sceneId])

  const sceneNet = useMemo(() => buildSceneNetwork(sceneDialogs, femaleMap), [sceneDialogs, femaleMap])
const scenePositions = useMemo(() => {
  const size = isWide ? 520 : 360
  return computePositions(sceneNet.network?.nodes ?? [], size, size)
}, [sceneNet, isWide])
const sceneTurnsData = useMemo(() => {
  if (!selectedPlay || !sceneAct || !sceneId) return null
  const entries = selectedPlay.scene_turns ?? []
  const hit = entries.find(e => e.act === sceneAct && e.scene === sceneId)
  if (!hit) return null
  const turns = (hit.turns ?? []).map(t => ({
    speaker: t.speaker,
    gender: normalizeGender(t.speaker, undefined, femaleMap),
    words: t.words ?? 0,
  }))
  const totalWords = turns.reduce((s, t) => s + t.words, 0)
  return { turns, totalWords }
}, [selectedPlay, sceneAct, sceneId, femaleMap])
const sceneTurnColors = useMemo(() => {
  const map = new Map()
  for (const t of sceneTurnsData?.turns ?? []) {
    if (!map.has(t.speaker)) {
      map.set(t.speaker, colorForSpeaker(t.speaker, t.gender))
    }
  }
  return map
}, [sceneTurnsData])
const sandboxTurns = useMemo(() => {
  if (!sceneTurnsData?.turns) return []
  const maxWords = sceneTurnsData.totalWords || 1
  const positions = []
  const lastPos = new Map()
  let cursorX = 20
  let cursorY = 20
  const wrapWidth = 620
  const rowHeight = 80
  const jitter = (speaker, idx) => {
    const h = hashString(`${speaker}-${idx}`)
    return (h % 9) - 4
  }
  sceneTurnsData.turns.forEach((t, idx) => {
    const color = sceneTurnColors.get(t.speaker) ?? GENDER_COLORS[t.gender] ?? '#6b7280'
    let pos
    if (lastPos.has(t.speaker)) {
      pos = lastPos.get(t.speaker)
    } else {
      pos = { x: cursorX, y: cursorY }
      const jitterVal = jitter(t.speaker, idx)
      pos.x += jitterVal
      pos.y += jitterVal
      cursorX += TURN_BAR_WIDTH
      if (cursorX > wrapWidth) {
        cursorX = 20
        cursorY += rowHeight
      }
    }
    lastPos.set(t.speaker, pos)
    positions.push({ ...pos, color, words: t.words ?? 0, speaker: t.speaker })
  })
  const maxH = Math.max(...positions.map(p => p.words || 0), 1)
  return positions.map(p => ({
    ...p,
    height: Math.max(10, (p.words / maxH) * 120),
  }))
}, [sceneTurnsData, sceneTurnColors])
const sandboxVisibleTurns = useMemo(() => sandboxTurns.slice(0, sandboxIndex), [sandboxTurns, sandboxIndex])
const pulseNodes = useMemo(() => {
  const ids = new Set()
  for (const t of sceneTurnsData?.turns ?? []) ids.add(t.speaker)
  return Array.from(ids)
}, [sceneTurnsData])
const pulseAnchors = useMemo(() => {
  const map = new Map()
  const size = isWide ? 520 : 360
  const nodes = pulseNodes.map(id => ({ id }))
  const seed = pulseSeed
  const pos = computePositions(nodes.map(n => ({ ...n, id: `${n.id}-${seed}` })), size, size) || new Map()
  nodes.forEach(n => {
    // map back to original id (strip seed suffix)
    const p = pos.get(`${n.id}-${seed}`)
    if (p) map.set(n.id, p)
  })
  return map
}, [pulseNodes, isWide, pulseSeed])
const nextActInfo = useMemo(() => {
  if (!scenesByAct || scenesByAct.length === 0) return null
  const idx = scenesByAct.findIndex(a => a.act === sceneAct)
  if (idx >= 0 && idx < scenesByAct.length - 1) return scenesByAct[idx + 1]
  return null
}, [scenesByAct, sceneAct])
const handleNextAct = useCallback(() => {
  if (!nextActInfo) return
  const firstScene = nextActInfo.scenes?.[0]
  setSceneAct(nextActInfo.act)
  if (firstScene) setSceneId(firstScene)
  setSceneIndex(0)
  setPulseIndex(0)
  setPulsePlaying(false)
}, [nextActInfo])
const pulseTurnPairs = useMemo(() => {
  const arr = []
  const turns = sceneTurnsData?.turns ?? []
  for (let i = 1; i < turns.length; i++) {
    arr.push({ from: turns[i - 1].speaker, to: turns[i].speaker })
  }
  return arr
}, [sceneTurnsData])

useEffect(() => {
  setSandboxIndex(0)
  setSandboxPlaying(false)
  setTurnBarHover(null)
  setActBarHover(null)
}, [sceneAct, sceneId, selectedPlay])

useEffect(() => {
  if (!sandboxPlaying) return
  if (!sandboxTurns || sandboxTurns.length === 0) return
  if (sandboxIndex >= sandboxTurns.length) {
    setSandboxPlaying(false)
    return
  }
  const words = sandboxTurns[sandboxIndex]?.words ?? 1
  const duration = Math.max(300, Math.min(2200, (200 + words * 30) / sandboxSpeed))
  const t = setTimeout(() => {
    setSandboxIndex((idx) => Math.min(idx + 1, sandboxTurns.length))
  }, duration)
  return () => clearTimeout(t)
}, [sandboxPlaying, sandboxIndex, sandboxTurns, sandboxSpeed])

useEffect(() => {
  // reset pulse state on scene change
  const initPos = new Map()
  pulseNodes.forEach(id => {
    const anchor = pulseAnchors.get(id)
    if (anchor) initPos.set(id, { x: anchor.x, y: anchor.y })
  })
  setPulsePositions(initPos)
  setPulseWeights(new Map())
  setPulseIndex(0)
  setPulsePlaying(false)
}, [sceneAct, sceneId, pulseAnchors, pulseNodes])

useEffect(() => {
  if (!pulsePlaying) return
  if (pulseTurnPairs.length === 0) return
  if (pulseIndex >= pulseTurnPairs.length) {
    setPulsePlaying(false)
    return
  }
  if (pulseAnchors.size === 0) return
  const viewSize = isWide ? 520 : 360
  const clampCoord = (v) => Math.max(8, Math.min(viewSize - 8, v ?? 0))
  const pair = pulseTurnPairs[pulseIndex]
  // simple attraction between current pair and anchor spring
  setPulsePositions(prev => {
    const next = new Map(prev)
    const a = next.get(pair.from) || pulseAnchors.get(pair.from)
    const b = next.get(pair.to) || pulseAnchors.get(pair.to)
    if (a && b) {
      const k = 0.07 // mutual pull
      const ax = a.x + (b.x - a.x) * k
      const ay = a.y + (b.y - a.y) * k
      const bx = b.x + (a.x - b.x) * k
      const by = b.y + (a.y - b.y) * k
      next.set(pair.from, { x: clampCoord(ax), y: clampCoord(ay) })
      next.set(pair.to, { x: clampCoord(bx), y: clampCoord(by) })
    }
    // pull all nodes slightly toward anchors to avoid drift
    for (const id of pulseNodes) {
      const p = next.get(id)
      const anchor = pulseAnchors.get(id)
      if (anchor) {
        const px = p?.x ?? anchor.x
        const py = p?.y ?? anchor.y
        const ka = 0.04
        next.set(id, {
          x: clampCoord(px + (anchor.x - px) * ka),
          y: clampCoord(py + (anchor.y - py) * ka),
        })
      }
    }
    return next
  })
  setPulseWeights(prev => {
    const next = new Map(prev)
    const key = `${pair.from}|${pair.to}`
    next.set(key, (next.get(key) ?? 0) + 1)
    return next
  })
  const delay = Math.max(80, Math.min(800, 220 / pulseSpeed))
  const t = setTimeout(() => setPulseIndex(i => Math.min(i + 1, pulseTurnPairs.length)), delay)
  return () => clearTimeout(t)
}, [pulsePlaying, pulseIndex, pulseTurnPairs, pulseSpeed, pulseAnchors, pulseNodes])
const sceneTurnLegend = useMemo(() => {
  if (!sceneTurnsData?.turns) return []
  const map = new Map()
  for (const t of sceneTurnsData.turns) {
    if (!map.has(t.speaker)) {
      map.set(t.speaker, {
        speaker: t.speaker,
        gender: t.gender,
        words: 0,
        color: sceneTurnColors.get(t.speaker) ?? GENDER_COLORS[t.gender] ?? '#6b7280',
      })
    }
    const rec = map.get(t.speaker)
    rec.words += t.words ?? 0
  }
  return Array.from(map.values()).sort((a, b) => b.words - a.words)
}, [sceneTurnsData, sceneTurnColors])
// Bars følger turn-sekvensen (én stolpe per ytring, samme rekkefølge som stripen)
const sceneTurnSeqBars = useMemo(() => {
  if (!sceneTurnsData?.turns) return []
  return sceneTurnsData.turns.map(t => ({
    speaker: t.speaker,
    gender: t.gender,
    words: t.words ?? 0,
    color: sceneTurnColors.get(t.speaker) ?? GENDER_COLORS[t.gender] ?? '#6b7280',
  }))
}, [sceneTurnsData, sceneTurnColors])
const playTurnLegend = useMemo(() => {
  if (!selectedPlay?.scene_turns) return []
  const map = new Map()
  for (const entry of selectedPlay.scene_turns) {
    for (const t of entry.turns ?? []) {
      if (!t?.speaker) continue
      if (!map.has(t.speaker)) {
        const gender = normalizeGender(t.speaker, undefined, femaleMap)
        map.set(t.speaker, { speaker: t.speaker, gender, words: 0 })
      }
      const rec = map.get(t.speaker)
      rec.words += t.words ?? 0
    }
  }
  const rows = Array.from(map.values()).map(r => ({
    ...r,
    color: colorForSpeaker(r.speaker, r.gender),
  }))
  rows.sort((a, b) => b.words - a.words)
  return rows
}, [selectedPlay, femaleMap])
const actTurnStrips = useMemo(() => {
  if (!selectedPlay?.scene_turns) return []
  const actMap = new Map()
  for (const entry of selectedPlay.scene_turns) {
    const actKey = entry.act ?? '?'
    if (!actMap.has(actKey)) {
      actMap.set(actKey, { act: actKey, totalWords: 0, segments: [], barAgg: new Map() })
    }
    const bucket = actMap.get(actKey)
    for (const t of entry.turns ?? []) {
      if (!t?.speaker) continue
      const gender = normalizeGender(t.speaker, undefined, femaleMap)
      const words = t.words ?? 0
      bucket.segments.push({
        speaker: t.speaker,
        gender,
        words,
        color: colorForSpeaker(t.speaker, gender),
      })
      bucket.totalWords += words
      if (!bucket.barAgg.has(t.speaker)) {
        bucket.barAgg.set(t.speaker, { speaker: t.speaker, gender, words: 0 })
      }
      bucket.barAgg.get(t.speaker).words += words
    }
  }
  const acts = Array.from(actMap.values()).map(a => {
    const bars = Array.from(a.barAgg.values())
      .map(b => ({ ...b, color: colorForSpeaker(b.speaker, b.gender) }))
      .sort((x, y) => (y.words ?? 0) - (x.words ?? 0))
    return { act: a.act, totalWords: a.totalWords, segments: a.segments, bars }
  })
  acts.sort((a, b) => {
    const ai = parseInt(a.act, 10)
    const bi = parseInt(b.act, 10)
    if (!Number.isNaN(ai) && !Number.isNaN(bi)) return ai - bi
    return String(a.act).localeCompare(String(b.act))
  })
  return acts
}, [selectedPlay, femaleMap])

  const pairStatsAll = useMemo(() => {
    const map = new Map()
    const ds = selectedPlay?.dialogs ?? []
    for (const d of ds) {
      const sp = Array.isArray(d.speakers) ? d.speakers.slice().sort() : []
      if (sp.length !== 2) continue
      const key = sp.join(' | ')
      if (!map.has(key)) {
        map.set(key, { speakers: sp, dialogs: 0, totalWords: 0, totalTurns: 0, maxLength: 0 })
      }
      const rec = map.get(key)
      rec.dialogs += 1
      rec.totalWords += d.total_words ?? 0
      rec.totalTurns += d.length ?? 0
      rec.maxLength = Math.max(rec.maxLength, d.length ?? 0)
    }
    const arr = Array.from(map.values()).sort((a, b) => b.totalWords - a.totalWords)
    const maxWords = arr.reduce((m, r) => Math.max(m, r.totalWords), 0)
    return { pairs: arr, maxWords }
  }, [selectedPlay])

  const sortedPairsAll = useMemo(() => {
    const cmp = {
      words: (a, b) => (b.totalWords ?? 0) - (a.totalWords ?? 0),
      dialogs: (a, b) => (b.dialogs ?? 0) - (a.dialogs ?? 0),
      turns: (a, b) => (b.totalTurns ?? 0) - (a.totalTurns ?? 0),
      maxlen: (a, b) => (b.maxLength ?? 0) - (a.maxLength ?? 0),
    }[pairSortKeyAll] ?? (() => 0)
    const list = [...pairStatsAll.pairs].sort(cmp)
    if (pairSortDirAll === 'asc') list.reverse()
    return list.slice(0, 10)
  }, [pairStatsAll, pairSortKeyAll, pairSortDirAll])

  const togglePairSortAll = (key) => {
    if (pairSortKeyAll === key) {
      setPairSortDirAll(pairSortDirAll === 'asc' ? 'desc' : 'asc')
    } else {
      setPairSortKeyAll(key)
      setPairSortDirAll('desc')
    }
  }

  const sortedPlays = useMemo(() => {
    const list = [...playsWithMeta]
    const cmp = {
      'female-nodes': (a, b) => b.femaleNodes - a.femaleNodes || b.femaleWords - a.femaleWords,
      'female-words': (a, b) => b.femaleWords - a.femaleWords || b.femaleNodes - a.femaleNodes,
      'male-words': (a, b) => b.maleWords - a.maleWords || b.femaleWords - a.femaleWords,
      'female-share': (a, b) => b.femaleShare - a.femaleShare || b.femaleWords - a.femaleWords,
    }[sortKey] ?? (() => 0)
    return list.sort(cmp)
  }, [playsWithMeta, sortKey])

  if (error) {
    return <div>Feil ved lasting av data: {error}</div>
  }

  if (!data) {
    return <div>Laster Ibsen-data…</div>
  }

  return (
    <div style={{ padding: '1rem 1.5rem 2rem', fontFamily: 'Inter, system-ui, sans-serif', background: THEME.bg, minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div>
            <h1 style={{ marginBottom: '0.15rem' }}>Ibsen drama ecology</h1>
            <p style={{ marginTop: 0, color: THEME.subtle }}>{plays.length} skuespill lastet.</p>
          </div>
          <button
            onClick={() => setShowInfo(true)}
            style={{
              border: 'none',
              background: THEME.accentSoft,
              color: THEME.accent,
              padding: '0.55rem 0.9rem',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: '0 6px 16px rgba(37, 99, 235, 0.15)',
            }}
          >
            Info
          </button>
        </div>

        {plays.length > 0 && (
          <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '1rem', boxShadow: THEME.shadow, marginTop: '0.75rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              <StatChip label="Skuespill" value={globalStats.totalPlays} />
              <StatChip label="Bechdel bestått" value={globalStats.bechdelPass} color="#0b7a34" />
              <StatChip label="Ikke bestått" value={globalStats.bechdelFail} color="#b45309" />
              <StatChip label="NR" value={globalStats.bechdelNR} color="#475569" />
              <StatChip label="Kvinnelige ord (sum)" value={globalStats.femaleWords} />
              <StatChip label="Mannlige ord (sum)" value={globalStats.maleWords} />
              <StatChip label="Ukjent kjønn (ord)" value={globalStats.unknownWords} color="#6b7280" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Sorterte høydepunkter</h3>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                style={{ padding: '0.45rem 0.6rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: THEME.accentSoft, color: THEME.text }}
              >
                <option value="female-nodes">Flest kvinnelige roller</option>
                <option value="female-words">Flest kvinnelige ord</option>
                <option value="male-words">Flest mannlige ord</option>
                <option value="female-share">Høy andel kvinnelige ord</option>
              </select>
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {sortedPlays.map((p, idx) => (
                <button
                  key={p.id || p.title}
                  onClick={() => setSelectedId(p.id || p.title)}
                  style={{
                    textAlign: 'left',
                    border: `1px solid ${THEME.border}`,
                    background: '#fff',
                    borderRadius: '10px',
                    padding: '0.55rem 0.65rem',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <span style={{ fontWeight: 600 }}>{idx + 1}. {displayTitle(p.title)}</span>
                    {sortKey === 'female-nodes' && (
                      <span style={{ color: THEME.subtle, fontSize: '0.9rem' }}>
                        Kvinnelige noder: {p.femaleNodes} · Kvinnelige ord: {p.femaleWords}
                      </span>
                    )}
                    {sortKey === 'female-words' && (
                      <span style={{ color: THEME.subtle, fontSize: '0.9rem' }}>
                        Kvinnelige ord: {p.femaleWords} · Mannlige ord: {p.maleWords} · Ukjent: {p.unknownWords}
                      </span>
                    )}
                    {sortKey === 'male-words' && (
                      <span style={{ color: THEME.subtle, fontSize: '0.9rem' }}>
                        Mannlige ord: {p.maleWords} · Kvinnelige ord: {p.femaleWords} · Ukjent: {p.unknownWords}
                      </span>
                    )}
                    {sortKey === 'female-share' && (
                      <span style={{ color: THEME.subtle, fontSize: '0.9rem' }}>
                        Andel kvinnelige ord: {(p.femaleShare * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      color: p.bechdelStatus === 'bestått' ? '#0b7a34' : p.bechdelStatus === 'ikke bestått' ? '#b45309' : '#475569',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '999px',
                      background: '#f3f4f6',
                    }}
                  >
                    {p.bechdelStatus}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: '0.75rem', marginBottom: '1rem' }}>
          <PlaySelector
            plays={filteredPlays}
            selectedId={selectedId}
            onChange={setSelectedId}
            filterQuery={playFilter}
            onFilterChange={setPlayFilter}
          />
        </div>

        {!selectedPlay ? (
          <p>Velg et stykke fra nedtrekkslisten.</p>
        ) : (
          <>
            <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '1rem 1.25rem', boxShadow: THEME.shadow, marginBottom: '1rem' }}>
              <h2 style={{ marginTop: 0, marginBottom: '0.35rem' }}>{displayTitle(selectedPlay.title)}</h2>
              <div style={{ color: THEME.subtle }}>
                {selectedPlay.acts?.length ?? 0} akter &nbsp;|&nbsp; noder i valgt nettverk: {activeNodeCount}
              </div>
            </div>

            {pulseTurnPairs.length > 0 && (
              <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '1rem', boxShadow: THEME.shadow, marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Eksperimentell: pulserende scenenettverk{sceneAct ? ` – Akt ${sceneAct}` : ''}{sceneId ? `, scene ${sceneId}` : ''}</h3>
                    <p style={{ margin: 0, color: THEME.subtle, fontSize: '0.9rem' }}>Spill av replikker som pulser på scenenettverket (akt/scene).</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      onClick={() => setShowPulseNet(v => !v)}
                      style={{ padding: '0.45rem 0.75rem', borderRadius: '10px', border: `1px solid ${THEME.border}`, background: showPulseNet ? THEME.accentSoft : '#fff', color: showPulseNet ? THEME.accent : THEME.text, cursor: 'pointer' }}
                    >
                      {showPulseNet ? 'Skjul puls' : 'Vis puls'}
                    </button>
                    <button
                      onClick={handleNextAct}
                      disabled={!nextActInfo}
                      style={{ padding: '0.45rem 0.75rem', borderRadius: '10px', border: `1px solid ${THEME.border}`, background: nextActInfo ? '#fff' : '#f1f5f9', color: nextActInfo ? THEME.text : THEME.subtle, cursor: nextActInfo ? 'pointer' : 'not-allowed' }}
                    >
                      Neste akt
                    </button>
                  </div>
                </div>
                {showPulseNet && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        onClick={() => {
                          if (pulseIndex >= pulseTurnPairs.length) setPulseIndex(0)
                          setPulsePlaying(p => !p)
                        }}
                        style={{ padding: '0.4rem 0.7rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: pulsePlaying ? THEME.accentSoft : '#fff', color: pulsePlaying ? THEME.accent : THEME.text, cursor: 'pointer' }}
                      >
                        {pulsePlaying ? 'Pause' : 'Spill'}
                      </button>
                    <button
                      onClick={() => setPulseIndex(i => Math.min(i + 1, pulseTurnPairs.length))}
                      style={{ padding: '0.4rem 0.7rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: '#fff', cursor: 'pointer' }}
                    >
                      Steg
                    </button>
                      <button
                        onClick={() => { setPulseIndex(0); setPulsePlaying(false); setPulseWeights(new Map()); setPulsePositions(pulseAnchors); setDraggingId(null) }}
                        style={{ padding: '0.4rem 0.7rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: '#fff', cursor: 'pointer' }}
                      >
                        Reset
                      </button>
                      <button
                        onClick={() => {
                          setPulseSeed(s => s + 1)
                          setPulseWeights(new Map())
                          setPulseIndex(0)
                          setPulsePlaying(false)
                          setDraggingId(null)
                        }}
                        style={{ padding: '0.4rem 0.7rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: '#fff', cursor: 'pointer' }}
                      >
                        Reroll layout
                      </button>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: THEME.subtle }}>
                        Hastighet:
                        <input type="range" min="0.5" max="5" step="0.1" value={pulseSpeed} onChange={e => setPulseSpeed(Number(e.target.value))} />
                        <span style={{ minWidth: '2.5rem', textAlign: 'right', color: THEME.text }}>{pulseSpeed.toFixed(1)}x</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: THEME.subtle }}>
                        Pos:
                        <input
                          type="range"
                          min="0"
                          max={pulseTurnPairs.length}
                          step="1"
                          value={pulseIndex}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setPulsePlaying(false)
                            setPulseIndex(v)
                          }}
                        />
                        <span style={{ minWidth: '3.5rem', textAlign: 'right', color: THEME.text }}>
                          {Math.min(pulseIndex, pulseTurnPairs.length)} / {pulseTurnPairs.length}
                        </span>
                      </label>
                    </div>
                    <svg width={isWide ? 520 : 360} height={isWide ? 520 : 360} style={{ border: `1px solid ${THEME.border}`, borderRadius: '12px', background: '#f8fafc' }}>
                      {/* edges */}
                      {[...pulseWeights.entries()].map(([key, w]) => {
                        const [a, b] = key.split('|')
                        const pa = pulsePositions.get(a)
                        const pb = pulsePositions.get(b)
                        if (!pa || !pb) return null
                        const stroke = Math.min(10, 1 + w * 0.8)
                        return (
                          <line key={key} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#2563eb" strokeWidth={stroke} strokeOpacity="0.35" />
                        )
                      })}
                      {/* nodes */}
                      {pulseNodes.map(id => {
                        const p = pulsePositions.get(id)
                        if (!p) return null
                        const color = sceneTurnColors.get(id) ?? '#94a3b8'
                        const active = draggingId === id
                        return (
                          <g
                            key={id}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setDraggingId(id)
                            }}
                            onMouseUp={() => setDraggingId(null)}
                            onMouseLeave={() => setDraggingId(null)}
                            onMouseMove={(e) => {
                              if (draggingId !== id) return
                              const svg = e.currentTarget.closest('svg')
                              if (!svg) return
                              const rect = svg.getBoundingClientRect()
                              const x = e.clientX - rect.left
                              const y = e.clientY - rect.top
                              setPulsePositions(prev => {
                                const next = new Map(prev)
                                next.set(id, { x, y })
                                return next
                              })
                            }}
                            style={{ cursor: 'grab' }}
                          >
                            <circle cx={p.x} cy={p.y} r={active ? 14 : 12} fill={color} stroke="#0f172a" strokeWidth="0.6" />
                            <text x={p.x} y={p.y - 16} fontSize="10" textAnchor="middle" fill={THEME.text}>
                              {id}
                            </text>
                          </g>
                        )
                      })}
                    </svg>
                  </div>
                )}
              </div>
            )}
            {playTurnLegend.length > 0 && (
              <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '1rem', boxShadow: THEME.shadow, marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Fargekode (hele stykket)</h3>
                  <p style={{ margin: '0.15rem 0 0', color: THEME.subtle, fontSize: '0.95rem' }}>
                    Stabil farge per aktør for alle scener og akter.
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {playTurnLegend.slice(0, 48).map(row => (
                    <span
                      key={row.speaker}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.25rem 0.45rem',
                        borderRadius: '12px',
                        background: '#f8fafc',
                        border: `1px solid ${THEME.border}`,
                        color: THEME.text,
                        fontSize: '0.9rem',
                      }}
                    >
                      <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: row.color }} />
                      {row.speaker}
                      <span style={{ color: THEME.subtle }}>· {Math.round(row.words)} ord</span>
                    </span>
                  ))}
                  {playTurnLegend.length > 48 && (
                    <span style={{ color: THEME.subtle, fontSize: '0.9rem' }}>… {playTurnLegend.length - 48} flere</span>
                  )}
                </div>
                {actTurnStrips.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {actTurnStrips.map(act => (
                      <div key={act.act} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: THEME.subtle }}>
                          <strong style={{ color: THEME.text }}>Akt {act.act}</strong>
                          {act.totalWords > 0 && <span style={{ fontSize: '0.9rem' }}>{Math.round(act.totalWords)} ord</span>}
                        </div>
                        <div
                          style={{ display: 'flex', flexWrap: 'wrap', minHeight: '12px', borderRadius: '8px', overflow: 'visible', border: `1px solid ${THEME.border}`, position: 'relative' }}
                          onMouseLeave={() => setActTurnHover(null)}
                        >
                          {(() => {
                            return act.segments.map((seg, idx) => {
                              const pct = act.totalWords > 0 ? (seg.words / act.totalWords) * 100 : 0
                              return (
                                <div
                                  key={`${seg.speaker}-${idx}`}
                                  title={`${seg.speaker}: ${Math.round(seg.words)} ord`}
                                  style={{
                                    flexBasis: `${pct}%`,
                                    flexGrow: 0,
                                    flexShrink: 0,
                                    minWidth: '3px',
                                    background: seg.color,
                                    height: '12px',
                                  }}
                                  onMouseEnter={(e) => {
                                    const parentRect = e.currentTarget.parentNode?.getBoundingClientRect()
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    const parentWidth = parentRect?.width ?? 0
                                    const leftPx = parentRect ? rect.left - parentRect.left + rect.width / 2 : rect.width / 2
                                    setActTurnHover({
                                      act: act.act,
                                      speaker: seg.speaker,
                                      words: seg.words ?? 0,
                                      parentWidth,
                                      leftPx,
                                    })
                                  }}
                                />
                              )
                            })
                          })()}
                          {actTurnHover && actTurnHover.act === act.act && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '-30px',
                                left: `${Math.max(6, Math.min((actTurnHover.parentWidth ?? 0) - 6, actTurnHover.leftPx ?? 0))}px`,
                                transform: 'translateX(-50%)',
                                background: '#0f172a',
                                color: '#fff',
                                padding: '0.2rem 0.45rem',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
                                pointerEvents: 'none',
                                whiteSpace: 'nowrap',
                                zIndex: 5,
                              }}
                            >
                              {actTurnHover.speaker}: {Math.round(actTurnHover.words)} ord
                            </div>
                          )}
                        </div>
                      <div style={{ marginTop: '0.55rem' }}>
                        <div style={{ fontSize: '0.9rem', color: THEME.subtle, marginBottom: '0.2rem' }}>Stolper (én per ytring, samme rekkefølge som stripen)</div>
                        <div
                          style={{ display: 'flex', alignItems: 'flex-end', gap: 0, height: '110px', borderBottom: `1px solid ${THEME.border}`, paddingBottom: '0.3rem', overflowX: 'auto', position: 'relative' }}
                          onMouseLeave={() => setActBarHover(null)}
                        >
                          {(() => {
                            const bars = act.segments ?? []
                            const maxBarWords = bars.reduce((m, b) => Math.max(m, b.words || 0), 0) || 1
                            const maxHeight = 110
                            return bars.map((bar, idx) => {
                              const h = Math.max(6, (bar.words / maxBarWords) * maxHeight)
                              return (
                                <div key={`${bar.speaker}-${idx}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: `${TURN_BAR_WIDTH}px`, height: `${maxHeight}px`, justifyContent: 'flex-end' }}>
                                  <div
                                    style={{
                                      width: '100%',
                                      height: `${h}px`,
                                      background: bar.color ?? colorForSpeaker(bar.speaker, bar.gender),
                                      borderRadius: '6px 6px 2px 2px',
                                      boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                                    }}
                                    title={`${bar.speaker}: ${Math.round(bar.words)} ord`}
                                    onMouseEnter={(e) => {
                                      const parentRect = e.currentTarget.parentNode?.getBoundingClientRect()
                                      const rect = e.currentTarget.getBoundingClientRect()
                                      const fallbackWidth = (act.segments?.length || 0) * TURN_BAR_WIDTH
                                      const parentWidth = parentRect?.width ?? fallbackWidth
                                      const leftPx = parentRect ? rect.left - parentRect.left + rect.width / 2 : rect.width / 2
                                      setActBarHover({ act: act.act, speaker: bar.speaker, words: bar.words ?? 0, leftPx, parentWidth })
                                    }}
                                    onMouseLeave={() => setActBarHover(null)}
                                  />
                                </div>
                              )
                            })
                          })()}
                          {actBarHover && actBarHover.act === act.act && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '-30px',
                                left: `${Math.max(6, Math.min((actBarHover.parentWidth ?? 0) - 6, actBarHover.leftPx ?? 0))}px`,
                                transform: 'translateX(-50%)',
                                background: '#0f172a',
                                color: '#fff',
                                padding: '0.2rem 0.45rem',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
                                pointerEvents: 'none',
                                whiteSpace: 'nowrap',
                                zIndex: 5,
                              }}
                            >
                              {actBarHover.speaker}: {Math.round(actBarHover.words)} ord
                            </div>
                          )}
                        </div>
                      </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              style={
                isWide
                  ? { display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'start' }
                  : { display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'stretch' }
              }
            >
              <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '1rem', boxShadow: THEME.shadow }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  {[
                    { key: 'speech', label: 'Talenettverk', desc: 'replikk-sekvenser' },
                    { key: 'co', label: 'Scenenettverk', desc: 'på scenen sammen' },
                  ].map(tab => {
                    const isActive = networkView === tab.key
                    const isDisabled = tab.key === 'co' && !hasCoNetwork
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setNetworkView(tab.key)}
                        disabled={isDisabled}
                        style={{
                          padding: '0.45rem 0.85rem',
                          borderRadius: '999px',
                          border: `1px solid ${isActive ? THEME.accent : THEME.border}`,
                          background: isActive ? THEME.accentSoft : '#fff',
                          color: isActive ? THEME.accent : THEME.text,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          opacity: isDisabled ? 0.5 : 1,
                          fontWeight: 600,
                        }}
                      >
                        {tab.label}
                        <span style={{ color: THEME.subtle, fontWeight: 400 }}> · {tab.desc}</span>
                        {isDisabled ? ' (mangler data)' : ''}
                      </button>
                    )
                  })}
                </div>

                <NetworkSection
                  title={networkView === 'co' ? 'Globalt scenenettverk' : 'Globalt talenettverk'}
                  network={activeNetwork}
                  femaleMap={femaleMap}
                  positions={activePositions}
                  wordCounts={networkView === 'speech' ? selectedPlay.word_counts : null}
                  showWords={networkView === 'speech'}
                  note={networkNote}
                  width={isWide ? 520 : 360}
                  height={isWide ? 520 : 360}
                />
              </div>

              <div
                style={{
                  flex: 1,
                  maxHeight: isWide ? '80vh' : 'none',
                  overflowY: isWide ? 'auto' : 'visible',
                  padding: '0.85rem',
                  border: `1px solid ${THEME.border}`,
                  borderRadius: '12px',
                  background: THEME.card,
                  boxShadow: THEME.shadow,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 0 }}>Talenettverk per akt</h3>
                  {actOptions.length > 0 && (
                    <select
                      value={selectedAct}
                      onChange={(e) => setSelectedAct(e.target.value)}
                      style={{ padding: '0.4rem 0.55rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: THEME.accentSoft, color: THEME.text }}
                    >
                      {actOptions.map(act => (
                        <option key={act.act_n} value={act.act_n}>
                          Akt {act.act_n}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <p style={{ marginTop: '0.35rem', color: THEME.subtle, fontSize: '0.9rem' }}>
                  Alle akter listes under – scroll for å se flere.
                </p>

                {actOptions.length === 0 ? (
                  <p>Ingen nettverksdata for akter.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {actOptions.map(act => (
                      <NetworkSection
                        key={act.act_n}
                        title={`Akt ${act.act_n}`}
                        network={act.speech_network}
                        femaleMap={femaleMap}
                        wordCounts={act.word_counts}
                        width={isWide ? 380 : 340}
                        height={isWide ? 380 : 340}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

          {pairStatsAll.pairs.length > 0 && (
            <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '1rem', boxShadow: THEME.shadow, marginTop: '1rem' }}>
              <h3 style={{ marginTop: 0 }}>Par-intensitet (topp 10)</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ borderBottom: `1px solid ${THEME.border}`, textAlign: 'left', padding: '0.35rem' }}>Par</th>
                      <th onClick={() => togglePairSortAll('words')} style={{ cursor: 'pointer', borderBottom: `1px solid ${THEME.border}`, textAlign: 'right', padding: '0.35rem' }}>Ord (sum){pairSortKeyAll === 'words' ? (pairSortDirAll === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                      <th onClick={() => togglePairSortAll('dialogs')} style={{ cursor: 'pointer', borderBottom: `1px solid ${THEME.border}`, textAlign: 'right', padding: '0.35rem' }}>Dialoger{pairSortKeyAll === 'dialogs' ? (pairSortDirAll === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                      <th onClick={() => togglePairSortAll('turns')} style={{ cursor: 'pointer', borderBottom: `1px solid ${THEME.border}`, textAlign: 'right', padding: '0.35rem' }}>Tot. turer{pairSortKeyAll === 'turns' ? (pairSortDirAll === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                      <th onClick={() => togglePairSortAll('maxlen')} style={{ cursor: 'pointer', borderBottom: `1px solid ${THEME.border}`, textAlign: 'right', padding: '0.35rem' }}>Maks lengde{pairSortKeyAll === 'maxlen' ? (pairSortDirAll === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPairsAll.map((p, idx) => {
                      const ratio = pairStatsAll.maxWords > 0 ? p.totalWords / pairStatsAll.maxWords : 0
                      const bg = ratio === 0 ? '#f8fafc' : `rgba(37, 99, 235, ${0.12 + 0.55 * ratio})`
                      const color = ratio > 0.6 ? '#0b1f4a' : '#0f172a'
                      return (
                        <tr key={idx} style={{ background: bg, color }}>
                          <td style={{ padding: '0.35rem' }}>{p.speakers.join(' ↔ ')}</td>
                          <td style={{ padding: '0.35rem', textAlign: 'right' }}>{p.totalWords}</td>
                          <td style={{ padding: '0.35rem', textAlign: 'right' }}>{p.dialogs}</td>
                          <td style={{ padding: '0.35rem', textAlign: 'right' }}>{p.totalTurns}</td>
                          <td style={{ padding: '0.35rem', textAlign: 'right' }}>{p.maxLength}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {scenesByAct.length > 0 ? (
            <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '1rem', boxShadow: THEME.shadow, marginTop: '1rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <h3 style={{ marginTop: 0, marginBottom: 0 }}>Scenenettverk (fra dialoger)</h3>
                  <label>
                    Akt:{' '}
                    <select value={sceneAct} onChange={(e) => setSceneAct(e.target.value)} style={{ padding: '0.35rem', borderRadius: '8px', border: `1px solid ${THEME.border}` }}>
                      {scenesByAct.map(a => (
                        <option key={a.act} value={a.act}>
                          {a.act}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Scene:{' '}
                    <select value={sceneId} onChange={(e) => setSceneId(e.target.value)} style={{ padding: '0.35rem', borderRadius: '8px', border: `1px solid ${THEME.border}` }}>
                      {(scenesByAct.find(s => s.act === sceneAct)?.scenes ?? []).map(s => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span style={{ color: THEME.subtle }}>
                    Dialoger i scene: {sceneDialogs.length}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    onClick={() => setSceneIndex(Math.max(0, sceneIndex - 1))}
                    disabled={sceneSequence.length === 0 || sceneIndex <= 0}
                    style={{ padding: '0.4rem 0.65rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: '#fff', cursor: sceneIndex <= 0 ? 'not-allowed' : 'pointer' }}
                  >
                    ◀
                  </button>
                  <span style={{ color: THEME.subtle }}>
                    {sceneSequence.length > 0 ? `Scene ${sceneIndex + 1} / ${sceneSequence.length}` : 'Ingen scener'}
                  </span>
                  <button
                    onClick={() => setSceneIndex(Math.min(sceneSequence.length - 1, sceneIndex + 1))}
                    disabled={sceneSequence.length === 0 || sceneIndex >= sceneSequence.length - 1}
                    style={{ padding: '0.4rem 0.65rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: '#fff', cursor: sceneIndex >= sceneSequence.length - 1 ? 'not-allowed' : 'pointer' }}
                  >
                    ▶
                  </button>
                </div>
              </div>
              {sceneAct && sceneId && sceneDialogs.length > 0 ? (
                <div style={{ marginTop: '0.75rem' }}>
                  {sceneTurnsData?.totalWords > 0 && (
                    <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
                      <h4 style={{ margin: 0, marginBottom: '0.35rem' }}>Vekslinger (per replikk)</h4>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <button
                          onClick={() => setShowTurnDetails(v => !v)}
                          style={{
                            padding: '0.35rem 0.6rem',
                            borderRadius: '999px',
                            border: `1px solid ${THEME.border}`,
                            background: showTurnDetails ? THEME.accentSoft : '#fff',
                            color: showTurnDetails ? THEME.accent : THEME.text,
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                          }}
                        >
                          {showTurnDetails ? 'Skjul detaljer' : 'Vis detaljer'}
                        </button>
                      </div>
                      <div
                        style={{ display: 'flex', height: '14px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${THEME.border}`, position: 'relative' }}
                        onMouseLeave={() => setTurnHover(null)}
                      >
                        {(() => {
                          let acc = 0
                          return sceneTurnsData.turns.map((t, idx) => {
                            const pct = sceneTurnsData.totalWords > 0 ? (t.words / sceneTurnsData.totalWords) * 100 : 0
                            const col = sceneTurnColors.get(t.speaker) ?? GENDER_COLORS[t.gender] ?? '#6b7280'
                            const center = acc + pct / 2
                            acc += pct
                            return (
                              <div
                                key={idx}
                                title={`${t.speaker}: ca ${Math.round(t.words)} ord`}
                                style={{
                                  width: `${pct}%`,
                                  background: col,
                                  minWidth: '4px',
                                }}
                                onMouseEnter={(e) => {
                                  const parentRect = e.currentTarget.parentNode?.getBoundingClientRect()
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  const parentWidth = parentRect?.width ?? 0
                                  const leftPx = parentRect ? rect.left - parentRect.left + rect.width / 2 : 0
                                  setTurnHover({ speaker: t.speaker, words: t.words ?? 0, leftPx, parentWidth })
                                }}
                              />
                            )
                          })
                        })()}
                      </div>
                      {turnHover && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '-34px',
                            left: `${Math.max(6, Math.min((turnHover.parentWidth ?? 0) - 6, turnHover.leftPx ?? 0))}px`,
                            transform: 'translateX(-50%)',
                            background: '#0f172a',
                            color: '#fff',
                            padding: '0.25rem 0.45rem',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                            boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap',
                            zIndex: 6,
                          }}
                        >
                          {turnHover.speaker}: {Math.round(turnHover.words)} ord
                        </div>
                      )}
                      {sceneTurnSeqBars.length > 0 && (
                        <div style={{ marginTop: '0.6rem' }}>
                          <div
                            style={{ display: 'flex', alignItems: 'flex-end', gap: 0, height: '120px', borderBottom: `1px solid ${THEME.border}`, paddingBottom: '0.35rem', overflowX: 'auto', position: 'relative' }}
                            onMouseLeave={() => setTurnBarHover(null)}
                          >
                            {(() => {
                              const maxBarWords = sceneTurnSeqBars.reduce((m, b) => Math.max(m, b.words || 0), 0) || 1
                              const maxHeight = 120
                              return sceneTurnSeqBars.map((bar, idx) => {
                                const h = Math.max(6, (bar.words / maxBarWords) * maxHeight)
                                return (
                                  <div key={`${bar.speaker}-${idx}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: `${TURN_BAR_WIDTH}px`, height: `${maxHeight}px`, justifyContent: 'flex-end' }}>
                                    <div
                                      style={{
                                        width: '100%',
                                        height: `${h}px`,
                                        background: bar.color,
                                        borderRadius: '6px 6px 2px 2px',
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                                      }}
                                      title={`${bar.speaker}: ${Math.round(bar.words)} ord`}
                                      onMouseEnter={(e) => {
                                        const parentRect = e.currentTarget.parentNode?.getBoundingClientRect()
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        const fallbackWidth = sceneTurnSeqBars.length * TURN_BAR_WIDTH
                                        const parentWidth = parentRect?.width ?? fallbackWidth
                                        const leftPx = parentRect ? rect.left - parentRect.left + rect.width / 2 : rect.width / 2
                                        setTurnBarHover({
                                          speaker: bar.speaker,
                                          words: bar.words ?? 0,
                                          leftPx,
                                          parentWidth,
                                        })
                                      }}
                                      onMouseLeave={() => setTurnBarHover(null)}
                                    />
                                  </div>
                                )
                              })
                            })()}
                            {turnBarHover && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '-34px',
                                  left: `${Math.max(6, Math.min((turnBarHover.parentWidth ?? 0) - 6, turnBarHover.leftPx ?? 0))}px`,
                                  transform: 'translateX(-50%)',
                                  background: '#0f172a',
                                  color: '#fff',
                                  padding: '0.25rem 0.45rem',
                                  borderRadius: '8px',
                                  fontSize: '0.9rem',
                                  boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
                                  pointerEvents: 'none',
                                  whiteSpace: 'nowrap',
                                  zIndex: 6,
                                }}
                              >
                                {turnBarHover.speaker}: {Math.round(turnBarHover.words)} ord
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {sceneTurnLegend.length > 0 && (
                        <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                          <span style={{ color: THEME.subtle, fontSize: '0.9rem' }}>Fargekode:</span>
                          {sceneTurnLegend.map(row => (
                            <span
                              key={row.speaker}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.25rem 0.4rem',
                                borderRadius: '12px',
                                background: '#f8fafc',
                                border: `1px solid ${THEME.border}`,
                                color: THEME.text,
                                fontSize: '0.9rem',
                              }}
                            >
                              <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: row.color }} />
                              {row.speaker}
                            </span>
                          ))}
                        </div>
                      )}
                      {showTurnDetails && (
                        <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {sceneTurnLegend.map(row => (
                            <span
                              key={row.speaker}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.28rem 0.45rem',
                                borderRadius: '12px',
                                background: '#f8fafc',
                                border: `1px solid ${THEME.border}`,
                                color: THEME.text,
                                fontSize: '0.9rem',
                              }}
                            >
                              <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: row.color }} />
                              {row.speaker}: {Math.round(row.words)} ord
                              {sceneTurnsData.totalWords > 0 ? ` (${Math.round((row.words / sceneTurnsData.totalWords) * 100)}%)` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <NetworkSection
                    title={`Akt ${sceneAct}, scene ${sceneId}`}
                    network={sceneNet.network}
                    femaleMap={femaleMap}
                    wordCounts={sceneNet.wordCounts}
                    positions={scenePositions}
                    width={isWide ? 520 : 360}
                    height={isWide ? 520 : 360}
                  />
                </div>
              ) : (
                <p style={{ marginTop: '0.75rem', color: THEME.subtle }}>Ingen dialoger i valgt scene.</p>
              )}
            </div>
          ) : (
            <p style={{ color: THEME.subtle, marginTop: '1rem' }}>Ingen scenedialoger tilgjengelig for dette stykket.</p>
          )}

          {sandboxTurns.length > 0 && (
            <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '1rem', boxShadow: THEME.shadow, marginTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Eksperimentell: animert turn-sandbox</h3>
                  <p style={{ margin: 0, color: THEME.subtle, fontSize: '0.9rem' }}>Visualiser replikker som bevegelige ovale figurer. Påvirker ikke øvrig UI.</p>
                </div>
                <button
                  onClick={() => setShowSandbox(v => !v)}
                  style={{ padding: '0.45rem 0.75rem', borderRadius: '10px', border: `1px solid ${THEME.border}`, background: showSandbox ? THEME.accentSoft : '#fff', color: showSandbox ? THEME.accent : THEME.text, cursor: 'pointer' }}
                >
                  {showSandbox ? 'Skjul sandbox' : 'Vis sandbox'}
                </button>
              </div>
              {showSandbox && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      onClick={() => {
                        if (sandboxIndex >= sandboxTurns.length) setSandboxIndex(0)
                        setSandboxPlaying(p => !p)
                      }}
                      style={{ padding: '0.4rem 0.7rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: sandboxPlaying ? THEME.accentSoft : '#fff', color: sandboxPlaying ? THEME.accent : THEME.text, cursor: 'pointer' }}
                    >
                      {sandboxPlaying ? 'Pause' : 'Spill'}
                    </button>
                    <button
                      onClick={() => setSandboxIndex(i => Math.min(i + 1, sandboxTurns.length))}
                      style={{ padding: '0.4rem 0.7rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: '#fff', cursor: 'pointer' }}
                    >
                      Steg
                    </button>
                    <button
                      onClick={() => { setSandboxIndex(0); setSandboxPlaying(false); setTurnBarHover(null) }}
                      style={{ padding: '0.4rem 0.7rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: '#fff', cursor: 'pointer' }}
                    >
                      Reset
                    </button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: THEME.subtle }}>
                      Pos:
                      <input
                        type="range"
                        min="0"
                        max={sandboxTurns.length}
                        step="1"
                        value={sandboxIndex}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setSandboxPlaying(false)
                          setSandboxIndex(v)
                        }}
                      />
                      <span style={{ minWidth: '3.5rem', textAlign: 'right', color: THEME.text }}>
                        {Math.min(sandboxIndex, sandboxTurns.length)} / {sandboxTurns.length}
                      </span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: THEME.subtle }}>
                      Hastighet:
                      <input type="range" min="0.5" max="3" step="0.1" value={sandboxSpeed} onChange={e => setSandboxSpeed(Number(e.target.value))} />
                      <span style={{ minWidth: '2.5rem', textAlign: 'right', color: THEME.text }}>{sandboxSpeed.toFixed(1)}x</span>
                    </label>
                    <span style={{ color: THEME.subtle }}>Tur {Math.min(sandboxIndex, sandboxTurns.length)} / {sandboxTurns.length}</span>
                  </div>

                  <div style={{ position: 'relative', border: `1px solid ${THEME.border}`, borderRadius: '12px', background: '#f8fafc', height: 260, overflow: 'hidden' }}>
                    {sandboxVisibleTurns.map((t, idx) => (
                      <div
                        key={`${t.speaker}-${idx}`}
                        style={{
                          position: 'absolute',
                          left: `${t.x}px`,
                          top: `${t.y}px`,
                          width: 26,
                          height: t.height,
                          borderRadius: '50% / 70%',
                          background: t.color,
                          boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                          transition: 'transform 0.4s ease, opacity 0.4s ease',
                        }}
                        title={`${t.speaker}: ${Math.round(t.words)} ord`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}


            <StatsPanel play={selectedPlay} selectedActWordCounts={actWordCounts} onShowDialogList={handleShowDialogList} />
          </>
        )}
      </div>

      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} />
      <DialogModal
        open={dialogModal.open}
        dialogs={dialogModal.dialogs}
        title={dialogModal.title}
        onClose={() => setDialogModal({ open: false, dialogs: [], title: '' })}
      />
    </div>
  )
}

export default App
