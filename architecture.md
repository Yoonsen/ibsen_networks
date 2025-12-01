# Ibsen Networks – ARCHITECTURE

## Teknisk stack

- Frontend: React + Vite (ESM, `type: "module"`).
- Bygg: `npm run build` → output til `docs/` (for GitHub Pages).
- Data: statisk JSON-fil `public/ibsen_networks.json` kopieres til `docs/` ved build.
- Hosting: GitHub Pages med `base: '/ibsen_networks/'` i `vite.config.js`.

## Filstruktur (frontend)

- `index.html` – rot for Vite/React.
- `src/main.jsx` – entrypoint, monterer `<App />`.
- `src/App.jsx` – hovedkomponent (per nå):
  - laster `./ibsen_networks.json`,
  - viser liste over skuespill,
  - viser detaljer for valgt skuespill.
- `public/ibsen_networks.json` – alle nettverksdata.

Planlagt utvidelse:

- `src/components/PlayList.jsx` – liste / filtrering av stykker.
- `src/components/PlayStats.jsx` – tabell + små grafer for ett stykke.
- `src/components/ScatterPlot.jsx` – 2D-plot (mean_cast vs mean_drama).
- `src/components/NetworkView.jsx` – talenettverk / co-occurrence-nettverk for valgt stykke.
- `src/components/SceneTimeline.jsx` – oversikt over scener, dramafaktor per scene, hvem som er til stede.

## UI-arkitektur (første versjon)

Layout:

- Venstre panel:
  - liste over skuespill (scrollbar),
  - én valgt om gangen.
- Høyre panel:
  - tittel for valgt stykke,
  - tabell med:
    - mean_cast,
    - max_cast,
    - mean_drama,
    - n_scenes,
  - senere: tabs for “Stats”, “Network”, “Scenes”.

Dette gir en stabil base for å la senere versjoner av LLM/assistenten:

- legge til flere komponenter uten å endre grunnlayout,
- koble på ulike grafbiblioteker (f.eks. Cytoscape.js eller d3),
- utvide fra enkel liste → full visualiseringsapp.

## Dataflyt

1. `App` laster `ibsen_networks.json` én gang på mount.
2. JSON forventes å ha formen:

   ```json
   {
     "plays": [
       {
         "id": "...",
         "title": "Rosmersholm_1886",
         "mean_drama": ...,
         "mean_cast": ...,
         "max_cast": ...,
         "n_scenes": ...,
         "acts": [...],
         "networks": {
           "speech": {...},
           "cooccurrence": {...}
         }
       }
     ]
   }
