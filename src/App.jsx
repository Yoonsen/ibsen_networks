import { useEffect, useState } from 'react'

// beregn taletid og talestatistikk fra speech_network
function computeSpeechStats(play) {
  const net = play.speech_network || {}
  const edges = net.edges || []
  const nodeDefs = net.nodes || []

  const nodeMap = new Map()

  function ensureNode(name) {
    if (!nodeMap.has(name)) {
      nodeMap.set(name, {
        name,
        speeches: 0,
        totalLen: 0,
      })
    }
    return nodeMap.get(name)
  }

  // sørg for at alle noder finnes, selv om de ikke har kanter
  for (const n of nodeDefs) {
    if (n.id) {
      ensureNode(n.id)
    }
  }

  for (const e of edges) {
    const from = e.source
    const to = e.target
    if (!from || !to) continue

    const count = e.count ?? 0
    const avgA = e.avg_len_A ?? 0
    const avgB = e.avg_len_B ?? 0

    const totalA = count * avgA
    const totalB = count * avgB

    // A snakker før overgangen
    const fromNode = ensureNode(from)
    fromNode.speeches += count
    fromNode.totalLen += totalA

    // B snakker etter overgangen
    const toNode = ensureNode(to)
    toNode.speeches += count
    toNode.totalLen += totalB
  }

  const nodes = Array.from(nodeMap.values()).map(n => ({
    ...n,
    avgLen: n.speeches > 0 ? n.totalLen / n.speeches : 0,
  }))

  // sortér etter taletid
  nodes.sort((a, b) => b.totalLen - a.totalLen)

  return { nodes, edges }
}

// enkel sirkulær nettverksgraf i SVG
function NetworkGraph({ nodes, edges, width = 450, height = 450 }) {
  if (!nodes || nodes.length === 0) return null

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

  const maxCount = edges.reduce((m, e) => Math.max(m, e.count ?? 0), 0)
  const maxTotalLen = nodes.reduce((m, nd) => Math.max(m, nd.totalLen ?? 0), 0)

  return (
    <svg
      width={width}
      height={height}
      style={{ border: '1px solid #ddd', borderRadius: '4px', background: '#fafafa' }}
    >
      {/* kanter */}
      {edges.map((e, i) => {
        const fromPos = nodePositions.get(e.source)
        const toPos = nodePositions.get(e.target)
        if (!fromPos || !toPos) return null
        const w = maxCount > 0 ? 0.5 + 3 * ((e.count ?? 0) / maxCount) : 1
        return (
          <line
            key={i}
            x1={fromPos.x}
            y1={fromPos.y}
            x2={toPos.x}
            y2={toPos.y}
            stroke="#999"
            strokeWidth={w}
            strokeOpacity={0.8}
          />
        )
      })}

      {/* noder */}
      {nodes.map(node => {
        const pos = nodePositions.get(node.name)
        if (!pos) return null
        const r = maxTotalLen > 0 ? 4 + 10 * ((node.totalLen ?? 0) / maxTotalLen) : 6
        return (
          <g key={node.name}>
            <circle cx={pos.x} cy={pos.y} r={r} fill="#333" />
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
    </svg>
  )
}

function PlaySpeechView({ play }) {
  if (!play || !play.speech_network) return null

  const { nodes, edges } = computeSpeechStats(play)

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h3>Talenettverk og taletid</h3>

      {edges.length === 0 ? (
        <p>Ingen talenettverksdata funnet for dette stykket.</p>
      ) : (
        <>
          <p>
            Noder (karakterer): <strong>{nodes.length}</strong> &nbsp;|&nbsp;
            Kanter (talerelasjoner): <strong>{edges.length}</strong>
          </p>

          {/* graf */}
          <NetworkGraph nodes={nodes} edges={edges} />

          <h4 style={{ marginTop: '1rem' }}>Taletid per karakter</h4>
          <table style={{ borderCollapse: 'collapse', minWidth: '60%' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'left', paddingRight: '0.5rem' }}>Karakter</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'right', paddingRight: '0.5rem' }}>Antall replikker (estimert)</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'right', paddingRight: '0.5rem' }}>Total lengde</th>
                <th style={{ borderBottom: '1px solid #ccc', textAlign: 'right', paddingRight: '0.5rem' }}>Snittlengde</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(n => (
                <tr key={n.name}>
                  <td style={{ paddingRight: '0.5rem' }}>{n.name}</td>
                  <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>{n.speeches}</td>
                  <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>{n.totalLen.toFixed(1)}</td>
                  <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>
                    {n.avgLen.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 style={{ marginTop: '1rem' }}>Kanter i talenettverket</h4>
          <ul style={{ maxHeight: '16rem', overflowY: 'auto', paddingLeft: '1.2rem' }}>
            {edges.map((e, idx) => (
              <li key={idx}>
                {e.source} → {e.target}{' '}
                (<em>{e.count} overganger</em>, A-snittslenge={
                  e.avg_len_A?.toFixed?.(1) ?? e.avg_len_A
                }, B-snittslenge={
                  e.avg_len_B?.toFixed?.(1) ?? e.avg_len_B
                })
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetch('./ibsen_networks.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load JSON')
        return res.json()
      })
      .then(setData)
      .catch(err => setError(err.message))
  }, [])

  if (error) {
    return <div>Feil ved lasting av data: {error}</div>
  }

  if (!data) {
    return <div>Laster Ibsen-data…</div>
  }

  const plays = data.plays || []

  const handleSelect = (play) => {
    setSelected(play)
  }

  const hasStats = selected && (
    'mean_cast' in selected ||
    'max_cast' in selected ||
    'mean_drama' in selected ||
    'n_scenes' in selected
  )

  return (
    <div style={{ padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Ibsen drama ecology</h1>
      <p>{plays.length} skuespill lastet.</p>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        {/* venstreside: liste over stykker */}
        <div style={{ maxHeight: '80vh', overflowY: 'auto', minWidth: '18rem' }}>
          <h2>Stykker</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {plays.map(p => (
              <li key={p.id || p.title}>
                <button
                  onClick={() => handleSelect(p)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.25rem 0.5rem',
                    marginBottom: '0.15rem',
                    borderRadius: '4px',
                    border: 'none',
                    background:
                      selected && (selected.id || selected.title) === (p.id || p.title)
                        ? '#eee'
                        : 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* høyreside: detaljer */}
        <div style={{ flex: 1 }}>
          <h2>Detaljer</h2>
          {selected ? (
            <div>
              <h3>{selected.title}</h3>

              {hasStats && (
                <table>
                  <tbody>
                    {'mean_cast' in selected && (
                      <tr>
                        <td>Gjennomsnittlig rollebesetning per scene</td>
                        <td style={{ paddingLeft: '0.5rem' }}>
                          {selected.mean_cast?.toFixed
                            ? selected.mean_cast.toFixed(2)
                            : selected.mean_cast}
                        </td>
                      </tr>
                    )}
                    {'max_cast' in selected && (
                      <tr>
                        <td>Maksimalt antall på scenen</td>
                        <td style={{ paddingLeft: '0.5rem' }}>
                          {selected.max_cast}
                        </td>
                      </tr>
                    )}
                    {'mean_drama' in selected && (
                      <tr>
                        <td>Gjennomsnittlig dramafaktor</td>
                        <td style={{ paddingLeft: '0.5rem' }}>
                          {selected.mean_drama?.toFixed
                            ? selected.mean_drama.toFixed(3)
                            : selected.mean_drama}
                        </td>
                      </tr>
                    )}
                    {'n_scenes' in selected && (
                      <tr>
                        <td>Antall scener (minst to på scenen)</td>
                        <td style={{ paddingLeft: '0.5rem' }}>
                          {selected.n_scenes}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              <PlaySpeechView play={selected} />
            </div>
          ) : (
            <p>Klikk på et stykke til venstre for å se detaljer.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
