# Ibsen Networks – MANIFEST

Dette prosjektet skal bli en liten nettapp (PWA) som viser Henrik Ibsens skuespill som nettverk.

## Formål

- Utforske **dramaturgisk økologi** i Ibsens skuespill.
- Vise **talenettverk** (hvem snakker etter hvem, hvor mye de snakker).
- Vise **scene-nettverk** (hvem er på scenen sammen, co-occurrence).
- Gi et interaktivt grensesnitt der brukeren kan:
  - bla i skuespillene,
  - se aggregert statistikk (dramafaktor, rollebesetning),
  - gå ned på nivå av enkeltstykker, scener og karakterer.

Målet er at en Ibsen-forsker skal kunne:

- peke på et stykke,
- se “økologien” i ett blikk (cast-størrelse vs dramafaktor),
- og deretter utforske hvem som faktisk bærer dialogen.

## Datagrunnlag

- Kilden er TEI-XML fra Ibsensenteret.
- XML er parsat til en samlet JSON-struktur: `ibsen_networks.json`.
- Per stykke inneholder JSON-en:
  - tittel, id, årstall (implisitt i navnet),
  - akter og scener,
  - talere og talelengde,
  - talenettverk (overganger mellom talere),
  - co-occurrence-nettverk (hvem er på scenen samtidig),
  - aggregert statistikk (mean_drama, mean_cast, max_cast, n_scenes).

## Hva appen skal kunne (første versjon)

1. Liste alle skuespill med tittel.
2. La brukeren velge ett skuespill.
3. Vise grunnstatistikk for valgt stykke:
   - gjennomsnittlig dramafaktor,
   - gjennomsnittlig og maksimal cast-størrelse,
   - antall scener (med minst to på scenen).
4. Forberede videre visning av:
   - scatter-plot over alle stykker (mean_cast vs mean_drama),
   - nettverksgraf for talenettverket i ett stykke,
   - oversikt over karakterer med taletid og interaksjoner.

Prosjektet er tenkt som et utgangspunkt; både data og app skal være enkle å bygge videre på for en senere versjon av LLM (GPT/Cursor/Claude/…).
