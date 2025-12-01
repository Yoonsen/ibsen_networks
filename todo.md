
---

### `todo.md`

```markdown
# Ibsen Networks – TODO

## Kjernefunksjon

- [ ] Sørge for at `ibsen_networks.json` har stabil struktur:
  - [ ] `plays[]` med id, title, mean_drama, mean_cast, max_cast, n_scenes.
  - [ ] `acts[]` med scener og speakers_in_scene.
  - [ ] talenettverk (overganger + lengde).
  - [ ] co-occurrence-nettverk per scene (par + counts).
- [ ] Legge inn en enkel “about”-tekst i UI som forklarer dramafaktor og cast-størrelse.

## UI / komponenter

- [ ] Flytte liste over skuespill til egen komponent (`PlayList`).
- [ ] Legge til `PlayStats`:
  - [ ] tabell med dramafaktor, cast, scener.
  - [ ] liten tekstforklaring (“drama-økologi”).
- [ ] Legge til `ScatterPlot`:
  - [ ] 2D-plot med mean_cast (x) og mean_drama (y).
  - [ ] punktstørrelse = n_scenes.
  - [ ] labels med ryddig tittel (uten årstall).
- [ ] Legge til `NetworkView` (senere):
  - [ ] talenettverk for ett stykke.
  - [ ] co-occurrence-nettverk for én scene.
  - [ ] valg mellom forskjellige layout/visualiseringer.

## Data / titler

- [ ] Rense titler for visning:
  - [ ] fjerne årstall,
  - [ ] beholde versjonsinfo (“1. versjon”, “2. versjon”),
  - [ ] erstatte `_` med mellomrom.
- [ ] Evt. legge til eksplisitt årstall som eget felt i JSON (`year`).

## Github Pages / PWA

- [ ] Sjekke at `npm run build` lager `docs/` med:
  - [ ] `index.html`,
  - [ ] `assets/...`,
  - [ ] `ibsen_networks.json`.
- [ ] Verifisere at appen fungerer på GitHub Pages (`/ibsen_networks/`).
- [ ] (Senere) legge til enkel `manifest.webmanifest` for PWA-støtte.

## Metode / dokumentasjon

- [ ] Dokumentere hvordan `ibsen_networks.json` genereres (notebook).
- [ ] Kort tekst om dramafaktor:
  - [ ] definisjon (actual_pairs / possible_pairs),
  - [ ] tolkning (dramaturgisk tetthet, ikke “komedie” i snever forstand).
- [ ] Kort tekst om “L-formen” i cast vs dramafaktor.
