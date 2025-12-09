
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

# TODO

## 1. Per-akt og per-scene-grafer

- Utvide `ibsen_networks.json` til å inkludere struktur per akt/scene:
  - `acts`: liste med `act`, `scenes`, `cast`, og ev. co-occurrence per scene.
  - Strukturidé:

    ```json
    {
      "id": "Rosmersholm_1886",
      "title": "Rosmersholm_1886",
      "speech_network": { ... },
      "acts": [
        {
          "act": 1,
          "scenes": [
            {
              "scene": 1,
              "cast": ["ROS", "REBEKKA", "KROLL"],
              "cooccurrence_edges": [
                { "source": "ROS", "target": "REBEKKA", "weight": 1 }
              ]
            }
          ]
        }
      ]
    }
    ```

- I appen:
  - Legge til panel/meny for å velge:
    - Hele stykket
    - Akt-nivå
    - Scene-nivå
  - Når akt/scene velges:
    - filtrere noder og kanter til relevant delsett
    - vise samme sirkelgraf, men for valgt akt/scene
  - Brukssak: vise hvordan ensemblet endrer seg mellom akter (musikaler, Ibsen).

## 2. Dramatiske kurver over tid

- Lage “curves” per stykke:
  - `cast_size` per scene (linjeplott)
  - `comedy/drama factor` per scene
  - eventuelt antall aktive kanter (nettverkstetthet) per scene.
- Visualisere dette som:
  - enkel tidslinje per stykke
  - eller “small multiples” for flere stykker.

## 3. UTF-8 / navn-opprydding

- Fikse feilaktige navn som `INSPEKTÃREN ved badet` → `INSPEKTØREN ved badet`:
  - enten i XML→JSON-pipelinen (riktig encoding og `ensure_ascii=False`)
  - eller via en “rens” av eksisterende `ibsen_networks.json`:
    - funksjon ala `s.encode("latin1").decode("utf-8")` på:
      - `speech_network.nodes[*].id`
      - `speech_network.edges[*].source/target`.

## 4. Videre grafikk og analyse

- Finere nettverksvisning:
  - vurdere Cytoscape/d3 for mer interaktiv graf (hover, klikk på node, filtrering).
- Rolleprofiler:
  - mer detaljert taletidsfordeling per karakter (andel av total taletid).
- Sammenlikning på tvers:
  - scatterplot: `mean_cast` vs `mean_drama` inne i appen.
  - filtrering på “høy dramafaktor”, få opp typiske Ibsen-triangler.

