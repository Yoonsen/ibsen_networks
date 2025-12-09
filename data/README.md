# Data pipeline (placeholder)

Denne mappen skal inneholde Python-skriptet som genererer `public/ibsen_networks.json` fra TEI-XML. Legg inn:

- `ibsen_networks_acts.py` (eller tilsvarende) med avhengigheter og CLI-usage.
- Kort beskrivelse av input (katalog med TEI-filer) og output (JSON som matcher `legacy/DATASTRUCTURE_UPDATE.md`).

Når skriptet er på plass, kan det kobles til et enkelt kjøreskript, f.eks.:

```bash
python3 ibsen_networks_acts.py --tei-dir <path> --out public/ibsen_networks.json
```

Synkroniser med docs (`manifest.md`, `architecture.md`) om hvordan data regenereres før `npm run build`.

