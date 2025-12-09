import { useEffect, useMemo, useState } from 'react'

const GENDER_COLORS = {
  F: '#c62828', // rød for kvinner
  M: '#1d4ed8', // blå for menn
  '?': '#555',  // ukjent
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

function NetworkSection({ title, network, femaleMap }) {
  const { nodes, edges } = useMemo(() => computeSpeechStats(network, femaleMap), [network, femaleMap])

  return (
    <div style={{ flex: 1, minWidth: '0' }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p style={{ marginTop: '-0.25rem' }}>
        Noder: <strong>{nodes.length}</strong> &nbsp;|&nbsp; Kanter: <strong>{edges.length}</strong>
      </p>
      <NetworkGraph nodes={nodes} edges={edges} />

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

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h3>Statistikk</h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div style={{ minWidth: '18rem' }}>
          <h4>Bechdel</h4>
          {bechdel ? (
            <ul style={{ marginTop: '0.25rem' }}>
              <li>Status: <strong>{bechdel.status}</strong> ({bechdel.passes ? 'passer' : 'passer ikke'})</li>
              <li>Kvinnelige dialoger: {bechdel.female_dialog_count}</li>
              <li>Uten mannlige pronomen: {bechdel.female_dialogs_no_male_pron}</li>
            </ul>
          ) : (
            <p>Ingen Bechdel-info.</p>
          )}

          <h4 style={{ marginTop: '0.75rem' }}>Dialoger</h4>
          <p>
            Totalt: {dialogs.length} &nbsp;|&nbsp; Kvinnelige par: {femaleDialogs.length}
          </p>
        </div>

        {topWords.length > 0 && (
          <div style={{ minWidth: '18rem', flex: 1 }}>
            <h4>Ordtelling (hele stykket)</h4>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '0.25rem' }}>Karakter</th>
                  <th style={{ borderBottom: '1px solid #ccc', textAlign: 'right', padding: '0.25rem' }}>Ord</th>
                </tr>
              </thead>
              <tbody>
                {topWords.map(row => (
                  <tr key={row.character}>
                    <td style={{ padding: '0.25rem' }}>{row.character}</td>
                    <td style={{ padding: '0.25rem', textAlign: 'right' }}>{row.words}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {actWords.length > 0 && (
          <div style={{ minWidth: '18rem', flex: 1 }}>
            <h4>Ordtelling (valgt akt)</h4>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', padding: '0.25rem' }}>Karakter</th>
                  <th style={{ borderBottom: '1px solid #ccc', textAlign: 'right', padding: '0.25rem' }}>Ord</th>
                </tr>
              </thead>
              <tbody>
                {actWords.map(row => (
                  <tr key={row.character}>
                    <td style={{ padding: '0.25rem' }}>{row.character}</td>
                    <td style={{ padding: '0.25rem', textAlign: 'right' }}>{row.words}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            {p.title}
          </option>
        ))}
      </select>
    </label>
  )
}

function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [selectedAct, setSelectedAct] = useState('')

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

  if (error) {
    return <div>Feil ved lasting av data: {error}</div>
  }

  if (!data) {
    return <div>Laster Ibsen-data…</div>
  }

  const actOptions = selectedPlay?.acts ?? []
  const actData = actOptions.find(a => a.act_n === selectedAct)
  const actNetwork = actData?.speech_network
  const actWordCounts = actData?.word_counts

  return (
    <div style={{ padding: '1rem 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Ibsen drama ecology</h1>
      <p>{plays.length} skuespill lastet.</p>

      {plays.length > 0 && (
        <div style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          <PlaySelector plays={plays} selectedId={selectedId} onChange={setSelectedId} />
        </div>
      )}

      {!selectedPlay ? (
        <p>Velg et stykke fra nedtrekkslisten.</p>
      ) : (
        <>
          <h2 style={{ marginTop: '0.5rem' }}>{selectedPlay.title}</h2>
          <div style={{ color: '#555', marginBottom: '0.75rem' }}>
            {selectedPlay.acts?.length ?? 0} akter &nbsp;|&nbsp; noder i globalt nettverk: {selectedPlay.speech_network?.nodes?.length ?? 0}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            <NetworkSection
              title="Globalt talenettverk"
              network={selectedPlay.speech_network}
              femaleMap={femaleMap}
            />

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: 0 }}>Talenettverk per akt</h3>
                {actOptions.length > 0 && (
                  <select
                    value={selectedAct}
                    onChange={(e) => setSelectedAct(e.target.value)}
                    style={{ padding: '0.35rem', borderRadius: '4px' }}
                  >
                    {actOptions.map(act => (
                      <option key={act.act_n} value={act.act_n}>
                        Akt {act.act_n}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {actNetwork ? (
                <NetworkSection
                  title={`Akt ${selectedAct}`}
                  network={actNetwork}
                  femaleMap={femaleMap}
                />
              ) : (
                <p>Ingen akt valgt eller ingen nettverksdata for akt.</p>
              )}
            </div>
          </div>

          <StatsPanel play={selectedPlay} selectedActWordCounts={actWordCounts} />
        </>
      )}
    </div>
  )
}

export default App
