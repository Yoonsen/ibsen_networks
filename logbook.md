# Ibsen Networks – LOGBOOK

## 2025-12-01

- Opprettet nytt repo/katalog `ibsen_networks` for frontend + data.
- Lagt inn:
  - `ibsen_networks.json` i `public/` (samlet nettverks- og scene-data for Ibsens skuespill).
  - Vite + React-konfig (`vite.config.js`, `src/App.jsx`, `src/main.jsx`).
- Fikk Vite-devserveren til å kjøre (`npm run dev`), og ser nå:
  - liste over alle skuespill,
  - valg av enkeltstykke med visning av `mean_drama`, `mean_cast`, `max_cast`, `n_scenes` der de finnes.
- Definert begrepet **dramafaktor**:
  - actual_pairs / possible_pairs per scene,
  - aggregert til mean_drama per stykke.
- Identifisert “L-formen” i rommet:
  - få karakterer → høy tetthet (kammerdrama),
  - mange karakterer → lav tetthet (episk/ensemble),
  - nesten ingen stykker med få + lav tetthet eller mange + høy tetthet.
- Opprettet:
  - `manifest.md` – formål og scope for appen.
  - `architecture.md` – kort beskrivelse av stack, layout og dataflyt.
  - `todo.md` – liste over videre arbeid (scatterplot, nettverk, PWA).
  - `logbook.md` – denne loggen.
