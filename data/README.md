# Data

- TEI-XML: legg i `data/raw/plays/`
- Parser: `data/scripts/parse_tei.py`
  - kjør `python data/scripts/parse_tei.py --copy-to-public`
- Output: `data/output/ibsen_networks.json` (kopieres til `public/` hvis flagget brukes)
- Kjønn: `data/gendered_ibsen.json` kan fylles med `{navn: true|false}` for å overstyre/utfylle FEMALE_CHARACTERS før eksport.
# Data pipeline (placeholder)

Denne mappen skal inneholde Python-skriptet som genererer `public/ibsen_networks.json` fra TEI-XML. Legg inn:

- `ibsen_networks_acts.py` (eller tilsvarende) med avhengigheter og CLI-usage.
- Kort beskrivelse av input (katalog med TEI-filer) og output (JSON som matcher `legacy/DATASTRUCTURE_UPDATE.md`).

Når skriptet er på plass, kan det kobles til et enkelt kjøreskript, f.eks.:

```bash
python3 ibsen_networks_acts.py --tei-dir <path> --out public/ibsen_networks.json
```

Synkroniser med docs (`manifest.md`, `architecture.md`) om hvordan data regenereres før `npm run build`.

## ID-normalisering (urn vs dhlabid)

Kolonnen kan ha både URN-er og DH-lab-id (tall). Forslag til tolerant normalisering:

```python
URN_PREFIX = "urn:"

def normalize_id(raw):
    if not raw:
        return None
    s = str(raw).strip()
    if s.lower().startswith(URN_PREFIX):
        return {"urn": s, "kind": "urn", "raw": raw}
    if s.isdigit():
        return {"urn": f"urn:dhlab:{s}", "kind": "dhlabid", "raw": raw}
    return {"urn": s, "kind": "other", "raw": raw}

# bruk:
# nid = normalize_id(row.get("urn") or row.get("dhlabid"))
# lagre gjerne id, id_kind, og raw for transparens
```

Loggfør antall per kategori (urn/dhlabid/other), og vurder å avbryte hvis du finner duplikate normaliserte URN-er.

