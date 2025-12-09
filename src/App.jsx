import { useEffect, useMemo, useState } from 'react'

const GENDER_COLORS = {
  F: '#c62828', // rød for kvinner
  M: '#1d4ed8', // blå for menn
  '?': '#555',  // ukjent
}

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

function computeSpeechStats(network, femaleMap = {}) {
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

  edges.forEach(e => {
    const from = e.source
    const to = e.target
    if (!from || !to) return

    const count = Number.isFinite(e.count) ? e.count : Number.isFinite(e.weight) ? e.weight : 0
    const avgA = e.avg_len_A ?? 0
    const avgB = e.avg_len_B ?? 0

    const totalA = count * avgA
    const totalB = count * avgB

    const fromNode = ensureNode(from)
    const toNode = ensureNode(to)
    if (!fromNode || !toNode) return

    fromNode.speeches += count
    fromNode.totalLen += totalA

    toNode.speeches += count
    toNode.totalLen += totalB
  })

  const nodes = Array.from(nodeMap.values()).map(n => ({
    ...n,
    avgLen: n.speeches > 0 ? n.totalLen / n.speeches : 0,
  }))

  nodes.sort((a, b) => b.totalLen - a.totalLen)

  return { nodes, edges }
}

// Enkel sirkulær nettverksgraf i SVG
function NetworkGraph({ nodes, edges, width = 420, height = 420 }) {
  if (!nodes || nodes.length === 0) return <p>Ingen noder å vise.</p>

  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.35

  const nodePositions = new Map()
  const n = nodes.length

  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    nodePositions.set(node.name, { x, y })
  })

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
        const fill = GENDER_COLORS[node.gender] ?? GENDER_COLORS['?']
        return (
          <g key={node.name}>
            <circle cx={pos.x} cy={pos.y} r={r} fill={fill} />
            <text
              x={pos.x}
              y={pos.y - r - 4}
              fontSize="10"
              textAnchor="middle"
            >
              {node.name}
            </text>
          </g>
        )
      })}

      {/* liten legend */}
      <g transform={`translate(${width - 110}, ${height - 55})`}>
        <rect width="100" height="48" fill="white" stroke="#ddd" rx="4" />
        <LegendRow y={14} color={GENDER_COLORS.F} label="Kvinne (F)" />
        <LegendRow y={30} color={GENDER_COLORS.M} label="Mann (M)" />
        <LegendRow y={46} color={GENDER_COLORS['?']} label="Ukjent" />
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

function NetworkSection({ title, network, femaleMap, width = 420, height = 420 }) {
  const { nodes, edges } = useMemo(() => computeSpeechStats(network, femaleMap), [network, femaleMap])

  return (
    <div style={{ flex: 1, minWidth: '0' }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p style={{ marginTop: '-0.25rem' }}>
        Noder: <strong>{nodes.length}</strong> &nbsp;|&nbsp; Kanter: <strong>{edges.length}</strong>
      </p>
      <NetworkGraph nodes={nodes} edges={edges} width={width} height={height} />

      {nodes.length > 0 && (
        <>
          <h4 style={{ marginTop: '0.75rem' }}>Taletid (topp 10)</h4>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '0.25rem' }}>Karakter</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'right', padding: '0.25rem' }}>Replikker*</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'right', padding: '0.25rem' }}>Tot. ord</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'right', padding: '0.25rem' }}>Snitt</th>
              </tr>
            </thead>
            <tbody>
              {nodes.slice(0, 10).map(n => (
                <tr key={n.name}>
                  <td style={{ padding: '0.25rem' }}>{n.name}</td>
                  <td style={{ padding: '0.25rem', textAlign: 'right' }}>{n.speeches}</td>
                  <td style={{ padding: '0.25rem', textAlign: 'right' }}>{n.totalLen.toFixed(1)}</td>
                  <td style={{ padding: '0.25rem', textAlign: 'right' }}>{n.avgLen.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '0.85rem', color: '#555' }}>*Replikker estimert fra overganger.</p>
        </>
      )}
    </div>
  )
}

function StatsPanel({ play, selectedActWordCounts }) {
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

function PlaySelector({ plays, selectedId, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxWidth: '24rem' }}>
      <span>Velg skuespill</span>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: '0.5rem', fontSize: '1rem', borderRadius: '4px' }}
      >
        {plays.map(p => (
          <option key={p.id || p.title} value={p.id || p.title}>
            {displayTitle(p.title)}
          </option>
        ))}
      </select>
    </label>
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

function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [selectedAct, setSelectedAct] = useState('')
  const [isWide, setIsWide] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth >= 900 : true)
  )
  const [showInfo, setShowInfo] = useState(false)
  const [sortKey, setSortKey] = useState('female-nodes')

  useEffect(() => {
    fetch('./ibsen_networks.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load JSON')
        return res.json()
      })
      .then(setData)
      .catch(err => setError(err.message))
  }, [])

  const plays = data?.plays ?? []
  const femaleMap = data?.FEMALE_CHARACTERS ?? {}

  const playsWithMeta = useMemo(() => {
    return plays.map(p => {
      const nodes = p.speech_network?.nodes ?? []
      const femaleNodes = nodes.filter(n => normalizeGender(n.id, n.gender, femaleMap) === 'F').length
      const femaleWords = (p.word_counts ?? []).reduce((acc, row) => {
        return femaleMap[row.character] ? acc + (row.words ?? 0) : acc
      }, 0)
      const dialogCount = p.bechdel?.female_dialog_count ?? 0
      const noMaleCount = p.bechdel?.female_dialogs_no_male_pron ?? 0
      const bechdelStatus = computeBechdelStatus(dialogCount, noMaleCount)
      const bechdelRank = bechdelStatus === 'bestått' ? 0 : bechdelStatus === 'ikke bestått' ? 1 : 2
      return {
        ...p,
        femaleNodes,
        femaleWords,
        bechdelStatus,
        bechdelRank,
        dialogCount,
        noMaleCount,
      }
    })
  }, [plays, femaleMap])

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

  const sortedPlays = useMemo(() => {
    const list = [...playsWithMeta]
    const cmp = {
      'female-nodes': (a, b) => b.femaleNodes - a.femaleNodes || b.femaleWords - a.femaleWords,
      'female-words': (a, b) => b.femaleWords - a.femaleWords || b.femaleNodes - a.femaleNodes,
      'bechdel': (a, b) =>
        a.bechdelRank - b.bechdelRank ||
        (b.noMaleCount ?? 0) - (a.noMaleCount ?? 0) ||
        (b.dialogCount ?? 0) - (a.dialogCount ?? 0),
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

        <div style={{ marginTop: '0.75rem', marginBottom: '1rem' }}>
          <PlaySelector plays={plays} selectedId={selectedId} onChange={setSelectedId} />
        </div>

        {plays.length > 0 && (
          <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '1rem', boxShadow: THEME.shadow, marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Sorterte høydepunkter</h3>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                style={{ padding: '0.45rem 0.6rem', borderRadius: '8px', border: `1px solid ${THEME.border}`, background: THEME.accentSoft, color: THEME.text }}
              >
                <option value="female-nodes">Flest kvinnelige roller (globalt nettverk)</option>
                <option value="female-words">Flest kvinnelige ord (total)</option>
                <option value="bechdel">Bechdel: bestått → ikke bestått → NR</option>
              </select>
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto', marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
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
                        Kvinnelige ord: {p.femaleWords} · Kvinnelige noder: {p.femaleNodes}
                      </span>
                    )}
                    {sortKey === 'bechdel' && (
                      <span style={{ color: THEME.subtle, fontSize: '0.9rem' }}>
                        Bechdel: {p.bechdelStatus} · Kvinnelige dialoger: {p.dialogCount} ({p.noMaleCount} uten mannlige pron.)
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

        {!selectedPlay ? (
          <p>Velg et stykke fra nedtrekkslisten.</p>
        ) : (
          <>
            <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '1rem 1.25rem', boxShadow: THEME.shadow, marginBottom: '1rem' }}>
              <h2 style={{ marginTop: 0, marginBottom: '0.35rem' }}>{displayTitle(selectedPlay.title)}</h2>
              <div style={{ color: THEME.subtle }}>
                {selectedPlay.acts?.length ?? 0} akter &nbsp;|&nbsp; noder i globalt nettverk: {selectedPlay.speech_network?.nodes?.length ?? 0}
              </div>
            </div>

            <div
              style={
                isWide
                  ? { display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'start' }
                  : { display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'stretch' }
              }
            >
              <div style={{ background: THEME.card, border: `1px solid ${THEME.border}`, borderRadius: '12px', padding: '1rem', boxShadow: THEME.shadow }}>
                <NetworkSection
                  title="Globalt talenettverk"
                  network={selectedPlay.speech_network}
                  femaleMap={femaleMap}
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
                        width={isWide ? 380 : 340}
                        height={isWide ? 380 : 340}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <StatsPanel play={selectedPlay} selectedActWordCounts={actWordCounts} />
          </>
        )}
      </div>

      <InfoModal open={showInfo} onClose={() => setShowInfo(false)} />
    </div>
  )
}

export default App
