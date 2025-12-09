# Ibsen Networks – MANIFEST

Dette prosjektet er en liten nettapp (PWA) som viser Henrik Ibsens skuespill som nettverk, med taleøkologi og kjønnsfargete nettverk.

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

## Hva appen gjør nå

- Nedtrekksmeny for alle stykker (titler vises uten underscores).
- Globalt talenettverk pr. stykke med noder farget etter kjønn (F=rød, M=blå, ukjent=grå).
- Alle akter renderes i et scrollbart panel med egne nettverk.
- Statistikkpanel:
  - Bechdel-status og dialogtall,
  - ordtall per stykke og per valgt akt,
  - kvinnelige dialoger filtrerbare i data.
- Info-modal som forklarer data og visning.

## Videre retning / backlog

- Scatter-plot over alle stykker (mean_cast vs mean_drama).
- Co-occurrence-visning og scenetidslinje.
- Caching i service worker når datastørrelse krever det.
- Evt. dark mode / tema-velger.
- Koble inn Python-datagenerering (TEI → `ibsen_networks.json`) og dokumentere kjøring.
