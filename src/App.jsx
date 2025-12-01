import { useEffect, useState } from 'react'

function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    // relativ sti → funker både lokalt og på GitHub Pages
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

  return (
    <div style={{ padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Ibsen drama ecology</h1>
      <p>{plays.length} plays loaded.</p>
      <ul>
        {plays.map(p => (
          <li key={p.id}>{p.title}</li>
        ))}
      </ul>
    </div>
  )
}

export default App
