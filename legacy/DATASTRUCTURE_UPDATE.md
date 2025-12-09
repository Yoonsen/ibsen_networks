# Ibsen PWA – data structure update (legacy reference)

Dette dokumentet beskriver den **nye strukturen** i `ibsen_networks.json` som PWA-klienten skal bruke.  
Dataene er generert fra TEI-XML med Python (`ibsen_networks_acts.py`).

---

## 1. Top level

```jsonc
{
  "FEMALE_CHARACTERS": {
    "Nora": true,
    "Fru Helene Alving": true,
    "Professor Arnold Rubek": false
  },
  "plays": [
    { /* play 1 */ },
    { /* play 2 */ },
    ...
  ]
}
```

- `FEMALE_CHARACTERS`  
  - keys: **normaliserte** karakternavn (tittel-case, uten trailing punktum osv.)
  - value: `true` = kvinne, `false` = mann  
  - brukes til å sette `gender` på noder og til Bechdel-beregninger.

---

## 2. Per play

Hvert element i `plays` har denne formen:

```jsonc
{
  "id": "Rosmersholm_1886",
  "title": "Rosmersholm 1886",
  "speech_network": { ... },
  "co_network": { ... },
  "acts": [ ... ],
  "word_counts": [ ... ],
  "act_word_counts": { ... },
  "dialogs": [ ... ],
  "bechdel": { ... }
}
```

### 2.1 `speech_network` (globalt for stykket)

```jsonc
"speech_network": {
  "nodes": [
    { "id": "Johannes Rosmer", "gender": "M" },
    { "id": "Rebekka West",    "gender": "F" },
    { "id": "Fru Helseth",     "gender": "F" }
  ],
  "edges": [
    {
      "source": "Johannes Rosmer",
      "target": "Rebekka West",
      "count": 12,        // hvor mange ganger Rosmer→Rebekka
      "avg_len_A": 37.5,  // gj.sn. ordlengde i replikkene fra A
      "avg_len_B": 22.0   // gj.sn. ordlengde i svarene fra B
    },
    ...
  ]
}
```

- `gender` er én av `"F"`, `"M"`, `"?"`.
- Nettverket beskriver **taletur-sekvenser**: edge A→B = A snakker, så snakker B.

### 2.2 `co_network` (globalt for stykket)

```jsonc
"co_network": {
  "nodes": [
    { "id": "Johannes Rosmer" },
    { "id": "Rebekka West" },
    ...
  ],
  "edges": [
    {
      "source": "Johannes Rosmer",
      "target": "Rebekka West",
      "weight": 42   // hvor mange ganger de opptrer i samme scene
    },
    ...
  ]
}
```

- Co-occurence på scenenivå (ikke nødvendigvis direkte dialog).

---

## 3. Akter

```jsonc
"acts": [
  {
    "act_n": "1",
    "speech_network": {
      "nodes": [
        { "id": "Johannes Rosmer", "gender": "M" },
        { "id": "Rebekka West",    "gender": "F" }
      ],
      "edges": [
        {
          "source": "Johannes Rosmer",
          "target": "Rebekka West",
          "count": 5,
          "avg_len_A": 40.0,
          "avg_len_B": 23.0
        }
      ]
    },
    "word_counts": [
      { "character": "Johannes Rosmer", "words": 1234 },
      { "character": "Rebekka West",    "words": 987  }
    ]
  },
  {
    "act_n": "2",
    "speech_network": { ... },
    "word_counts": [ ... ]
  }
]
```

- `act_n` er en streng (`"1"`, `"2"`, `"3"` …).
- Vi har **talenettverk per akt** + ordtall per karakter per akt.

---

## 4. Ordtellinger på stykkenivå

```jsonc
"word_counts": [
  { "character": "Johannes Rosmer", "words": 3000 },
  { "character": "Rebekka West",    "words": 2500 },
  ...
]
```

```jsonc
"act_word_counts": {
  "1": [
    { "character": "Johannes Rosmer", "words": 1200 },
    { "character": "Rebekka West",    "words": 900  }
  ],
  "2": [
    { "character": "Johannes Rosmer", "words": 1000 },
    { "character": "Rebekka West",    "words": 800  }
  ]
}
```

- `word_counts`: hele stykket.
- `act_word_counts`: ordtall pr. akt.

---

## 5. Dialoger

`dialogs` beskriver **vekselvise dialoger** mellom to karakterer (minst N turer, typisk 4).

```jsonc
"dialogs": [
  {
    "speakers": ["Hedda Gabler", "Fru Thea Elvsted"],
    "act_n": "2",
    "turns": 6,             // hvor mange replikker total (f.eks. K-Q-K-Q-K-Q)
    "female_pair": true,    // begge er F (ifølge FEMALE_CHARACTERS)
    "male_pron": 3,         // antall mannlige pronomen i tekstfragmentet (han/ham osv.)
    "female_pron": 5,       // antall kvinnelige pronomen (hun/henne osv.)
    "text_span": null       // evt. kan fylles senere (utdrag)
  },
  ...
]
```

- PWA kan for eksempel:
  - vise liste over kvinnelige dialoger i et stykke,
  - filtrere på `female_pair == true`,
  - vise `turns`, `male_pron`, `female_pron`.

---

## 6. Bechdel-informasjon

```jsonc
"bechdel": {
  "passes": true,
  "female_dialog_count": 19,
  "female_dialogs_no_male_pron": 8,
  "status": "pass"   // vi kan legge inn status=”pass|near|fail|NR”
}
```

Forklaring:

- `female_dialog_count`  
  antall dialoger der begge talerne er kvinner (`female_pair == true`).

- `female_dialogs_no_male_pron`  
  antall av disse dialogene uten mannlige pronomen.

- `passes`  
  enkel Bechdel-heuristikk slik den er nå:
  - `True` hvis det finnes minst én kvinnelig dialog uten mannlige pronomen.
  - `False` ellers.

- `status`:
  - `"pass"` – klassisk Bechdel “pass”  
  - `"near"` – kvinnelige dialoger, noen uten menn, men ikke full pass etter vår strengeste regel  
  - `"fail"` – kvinnelige dialoger finnes, men alle inneholder mannsfokus  
  - `"NR"` – ingen kvinnelige dialoger → testen ikke relevant

---

## 7. Praktisk bruk i PWA

Typiske ting klienten skal gjøre mot denne strukturen:

- Finne et stykke:
  ```ts
  const play = data.plays.find(p => p.id === "Hedda_Gabler_1890");
  ```

- Tegne globalt talenettverk for stykket:
  ```ts
  const { nodes, edges } = play.speech_network;
  // nodes[i].gender === "F" | "M" | "?"
  ```

- Tegne nettverk per akt:
  ```ts
  const act1 = play.acts.find(a => a.act_n === "1");
  const { nodes, edges } = act1.speech_network;
  ```

- Vise Bechdel-status og tall:
  ```ts
  const b = play.bechdel;
  // b.passes, b.female_dialog_count, b.female_dialogs_no_male_pron, b.status
  ```

- Vise kvinnelige dialoger:
  ```ts
  const femaleDialogs = play.dialogs.filter(d => d.female_pair);
  ```

Dette er dagens “kontrakt” mellom backend (`ibsen_networks.json`) og PWA-klienten (JS/Codex). Codex kan anta at strukturen er stabil og ferdig definert.

