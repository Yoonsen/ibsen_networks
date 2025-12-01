# Ibsen Networks

**Ibsen Networks** er en liten forskningsorientert webapp som visualiserer dramaturgiske strukturer i Henrik Ibsens skuespill ved hjelp av nettverksanalyse.

Appen viser:

- **talenettverk**: hvem snakker etter hvem, og hvor mye.
- **scene-nettverk (co-occurrence)**: hvem er på scenen samtidig.
- **dramafaktor**: hvor tett en scene er koblet (faktisk / mulig interaksjon).
- **rolleøkologi**: rollebesetning, taletid, dominans og struktur.

Målet er å gjøre det mulig å utforske **dramaturgisk økologi** i Ibsens verk — ikke bare gjennom tekstnær lesning, men gjennom strukturer som springer ut av TEI-XML-data.

---

## ✨ Funksjoner (per nå)

- Laster alle Ibsens skuespill via en samlet JSON-datafil.
- Viser oversiktlig liste over dramaene.
- Ved valg av ett skuespill vises:
  - gjennomsnittlig dramafaktor,
  - gjennomsnittlig rollebesetning per scene,
  - maks antall karakterer på scenen,
  - antall scener med mer enn én karakter.
- Grunnstruktur klar for:
  - visualisering av talenettverk,
  - scene-nettverk,
  - scatter-plott av dramafaktor vs cast-størrelse,
  - rolleprofiler og taletidsstatistikk.

---

## 📦 Datagrunnlag

Dataene er hentet fra **Ibsensenterets TEI-korpora**, og parset til `public/ibsen_networks.json`.

For hvert skuespill inneholder JSON-filen:

- **metadata**: tittel, id, årstall (implisitt i filnavn)
- **akter og scener**:
  - liste over hvilke karakterer som er til stede
  - replikker og rekkefølge
- **talenettverk**:
  - overgang A → B med teller og total talelengde
- **co-occurrence-nettverk** per scene
- **aggregert statistikk**:
  - `mean_drama`
  - `mean_cast`
  - `max_cast`
  - `n_scenes`

Analysene er generert i Jupyter via uv/Python.

---

## 🔧 Teknologi

- **Frontend**: React + Vite  
- **Bygg**: `npm run build` → output legges i `docs/` for GitHub Pages  
- **Hosting**: GitHub Pages med `base: '/ibsen_networks/'`  
- **Data**: statisk JSON i `public/`  

Prosjek
