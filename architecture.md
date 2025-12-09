# Ibsen Networks – ARCHITECTURE

## Teknisk stack

- Frontend: React + Vite (ESM, `type: "module"`).
- Bygg: `npm run build` → output til `docs/` (for GitHub Pages).
- Data: statisk JSON-fil `public/ibsen_networks.json` (kopieres til `docs/` ved build).
- Hosting: GitHub Pages med `base: '/ibsen_networks/'` i `vite.config.js`.

## Filstruktur (frontend)

- `index.html` – rot for Vite/React.
- `src/main.jsx` – entrypoint, monterer `<App />`.
- `src/App.jsx` – hovedkomponent:
  - laster `./ibsen_networks.json`,
  - dropdown for stykker (titler uten underscores),
  - globalt talenettverk + scrollbart panel med ett nettverk per akt,
  - statistikkpanel (Bechdel, dialoger, ordtall),
  - info-modal.
- `public/ibsen_networks.json` – alle nettverksdata.
- `docs/` – bygget PWA for GitHub Pages.
- `legacy/DATASTRUCTURE_UPDATE.md` – kontrakt for datastruktur (top-level FEMALE_CHARACTERS, plays med speech/co-nettverk, acts, dialogs, bechdel).
- `data/` – plass for Python-skript som genererer `ibsen_networks.json` fra TEI.

## UI-arkitektur (nåværende)

- Header med tittel, lastet-antall og Info-knapp (modal).
- Selektor for stykker.
- Innhold:
  - Venstre (grid-col 2fr): globalt talenettverk (fargede noder etter kjønn).
  - Høyre (grid-col 1fr): scrollbart aktpanel med alle akter.
- Under: statistikk-kort (Bechdel, dialogtall, ordtall stykke/akt).
- Responsiv: grid → stacked på smale skjermer.

## Dataflyt (kort)

1. `App` laster `ibsen_networks.json` én gang på mount.
2. `FEMALE_CHARACTERS` brukes til å sette node-kjønn (F/M/?).
3. Globalt nettverk: `play.speech_network`.
4. Aktpanel: `play.acts[*].speech_network`.
5. Statistikk: `play.bechdel`, `play.dialogs`, `play.word_counts`, `play.act_word_counts`.

## Vedlikehold / for LLM

- Data-generering: bruk Python-skriptet i `data/` (når lagt inn) for å regenerere `public/ibsen_networks.json` fra TEI-XML. Output må matche kontrakten i `legacy/DATASTRUCTURE_UPDATE.md`.
- Build/deploy: `npm run build` (output i `docs/`), så push til GitHub Pages.
- Caching: `sw.js` er minimal (ingen cache); hard refresh etter deploy.
- Styling/layout: se `src/App.jsx` for grid/scroll-arkitektur og kjønnsfarger. Responsivt fallback til stacked.

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
