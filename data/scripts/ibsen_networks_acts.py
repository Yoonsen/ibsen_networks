from __future__ import annotations

import json
import re
from pathlib import Path
from itertools import combinations
from typing import Any, Dict, List, Tuple

import networkx as nx

# Base gender map
# ---------------------------------------------------------------------------
# 1. Normalisering av navn
# ---------------------------------------------------------------------------

def normalize_name(name: str | None) -> str | None:
    if not name:
        return None
    name = name.split(",")[0]
    name = re.sub(r"[.\s]+$", "", name)
    name = " ".join(name.split())
    name = name.title()
    return name

# Optional external ground truth
ROOT = Path(__file__).resolve().parents[2]
GENDER_FILE = ROOT / "data" / "gendered_ibsen.json"


def _parse_gender_value(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        val = v.strip().lower()
        if val in {"f", "female", "k", "kv", "kvinne", "kvinnelig"}:
            return True
        if val in {"m", "male", "mann", "mannlig"}:
            return False
        if val in {"u", "ukjent", "unknown", "?", "unk"}:
            return None
        return None
    return None


def _load_gender_file():
    """
    Supports flat or per-play structure:
    - {"Name": "F", "Other": "M"}
    - {"Play_ID": {"Name": "F", "Other": "M"}}
    Values: "M" | "F" | "U" (or booleans, True=F, False=M).
    """
    if not GENDER_FILE.exists():
        return {}, {}
    try:
        raw = json.loads(GENDER_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}, {}

    global_map = {}
    per_play = {}

    if isinstance(raw, dict):
        # detect per-play if any value is a dict
        if any(isinstance(v, dict) for v in raw.values()):
            for play_id, mapping in raw.items():
                if not isinstance(mapping, dict):
                    continue
                for k, v in mapping.items():
                    nk = normalize_name(k)
                    if not nk:
                        continue
                    gv = _parse_gender_value(v)
                    if gv is None:
                        continue
                    per_play.setdefault(play_id, {})[nk] = gv
        else:
            for k, v in raw.items():
                nk = normalize_name(k)
                if not nk:
                    continue
                gv = _parse_gender_value(v)
                if gv is None:
                    continue
                global_map[nk] = gv

    return global_map, per_play

# Merge in FEMALE_CHARACTERS from existing public/output ibsen_networks.json if present
def _load_public_gender():
    candidates = [
        ROOT / "public" / "ibsen_networks.json",
        ROOT / "data" / "output" / "ibsen_networks.json",
    ]
    merged = {}
    for path in candidates:
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                raw = data.get("FEMALE_CHARACTERS", {})
                for k, v in raw.items():
                    nk = normalize_name(k)
                    if nk:
                        merged[nk] = bool(v)
            except Exception:
                continue
    return merged

# Build gender maps
_flat_gender, _per_play_gender = _load_gender_file()
FEMALE_CHARACTERS: Dict[str, bool] = {}
GENDER_PER_PLAY: Dict[str, Dict[str, bool]] = {}

FEMALE_CHARACTERS.update(_load_public_gender())
FEMALE_CHARACTERS.update(_flat_gender)
GENDER_PER_PLAY.update(_per_play_gender)



# ---------------------------------------------------------------------------
# 2. Kjønnstabell – lastes fra eksisterende ibsen_networks.json hvis mulig
# ---------------------------------------------------------------------------

def _load_female_characters_from_existing(path: str = "ibsen_networks.json") -> Dict[str, bool]:
    """
    Prøver å hente FEMALE_CHARACTERS fra en eksisterende ibsen_networks.json.
    Hvis filen ikke finnes eller ikke har feltet, returneres en tom dict.
    """
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        raw = data.get("FEMALE_CHARACTERS", {})
        return {str(k): bool(v) for k, v in raw.items()}
    except FileNotFoundError:
        return {}
    except Exception:
        return {}


#FEMALE_CHARACTERS: Dict[str, bool] = _load_female_characters_from_existing()


def gender_of(name: str, play_id: Optional[str] = None) -> str:
    """
    Gir 'F', 'M' eller '?' basert på per-stykke mapping først, deretter global.
    """
    if play_id and play_id in GENDER_PER_PLAY:
        lookup = GENDER_PER_PLAY.get(play_id, {})
        if name in lookup:
            return "F" if lookup[name] else "M"
    if name in FEMALE_CHARACTERS:
        return "F" if FEMALE_CHARACTERS[name] else "M"
    return "?"


# ---------------------------------------------------------------------------
# 3. Enkel ordtelling og pronomen
# ---------------------------------------------------------------------------

WORD_RE = re.compile(r"\w+", re.UNICODE)

MALE_PRONOUNS = {"han", "ham"}
FEMALE_PRONOUNS = {"hun", "henne", "hende"}


def count_words(text: str | None) -> int:
    return len(WORD_RE.findall(text or ""))


# ---------------------------------------------------------------------------
# 4. Globalt talenettverk per stykke + transitions
# ---------------------------------------------------------------------------

def build_speech_network_and_transitions(
    play: Dict[str, Any], play_id: Optional[str] = None
) -> Tuple[nx.DiGraph, List[Dict[str, Any]]]:
    """
    Bygg et rettet talenettverk for ett stykke + liste med transitions.
    """
    G = nx.DiGraph()
    transitions: List[Dict[str, Any]] = []

    for act in play.get("acts", []):
        act_n = act.get("act_n", "")
        for scene in act.get("scenes", []):
            scene_n = scene.get("scene_n", "")
            speeches = scene.get("speeches", [])
            speakers_in_scene_raw = scene.get("speakers_in_scene", []) or []

            speakers_in_scene = sorted(
                {
                    normalize_name(s)
                    for s in speakers_in_scene_raw
                    if normalize_name(s)
                }
            )

            seq: List[Dict[str, Any]] = []
            for sp in speeches:
                raw_speaker = sp.get("speaker")
                speaker = normalize_name(raw_speaker)
                if not speaker:
                    continue

                text = sp.get("text", "") or ""
                length = sp.get("length")
                if length is None:
                    length = count_words(text)

                seq.append({"speaker": speaker, "length": length})

            if len(seq) < 2:
                continue

            for i in range(len(seq) - 1):
                a = seq[i]["speaker"]
                b = seq[i + 1]["speaker"]
                len_a = seq[i]["length"]
                len_b = seq[i + 1]["length"]

                if not a or not b:
                    continue

                if not G.has_node(a):
                    G.add_node(a)
                if not G.has_node(b):
                    G.add_node(b)

                if G.has_edge(a, b):
                    G[a][b]["count"] += 1
                    G[a][b]["len_A_sum"] += len_a
                    G[a][b]["len_B_sum"] += len_b
                else:
                    G.add_edge(
                        a,
                        b,
                        count=1,
                        len_A_sum=len_a,
                        len_B_sum=len_b,
                    )

                transitions.append(
                    {
                        "play": play.get("title", ""),
                        "act": act_n,
                        "scene": scene_n,
                        "pos_in_scene": i,
                        "current_speaker": a,
                        "next_speaker": b,
                        "len_current": len_a,
                        "len_next": len_b,
                        "scene_speakers": speakers_in_scene,
                    }
                )

    # fjern selv-loops
    loops = [(u, v) for u, v in G.edges() if u == v]
    if loops:
        G.remove_edges_from(loops)

    return G, transitions


# ---------------------------------------------------------------------------
# 5. Sceniske turer (for faktisk rekkefølge og lengde)
# ---------------------------------------------------------------------------

def build_scene_turns(play: Dict[str, Any]) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for act in play.get("acts", []):
        act_n = str(act.get("act_n", ""))
        for scene in act.get("scenes", []):
            scene_n = str(scene.get("scene_n", ""))
            turns = []
            for sp in scene.get("speeches", []):
                speaker = normalize_name(sp.get("speaker"))
                if not speaker:
                    continue
                length = sp.get("length")
                if length is None:
                    length = count_words(sp.get("text", "") or "")
                turns.append({"speaker": speaker, "words": int(length or 0)})
            if turns:
                entries.append({"act": act_n, "scene": scene_n, "turns": turns})
    return entries


# ---------------------------------------------------------------------------
# 5. Globalt co-occurrence-nettverk per stykke
# ---------------------------------------------------------------------------

def build_cooccurrence_network(play: Dict[str, Any]) -> nx.Graph:
    G = nx.Graph()

    for act in play.get("acts", []):
        for scene in act.get("scenes", []):
            speakers_raw = scene.get("speakers_in_scene", []) or []
            speakers = sorted(
                {
                    normalize_name(s)
                    for s in speakers_raw
                    if normalize_name(s)
                }
            )
            if len(speakers) < 2:
                continue

            for s in speakers:
                if not G.has_node(s):
                    G.add_node(s)

            for a, b in combinations(speakers, 2):
                if G.has_edge(a, b):
                    G[a][b]["weight"] += 1
                else:
                    G.add_edge(a, b, weight=1)

    return G


# ---------------------------------------------------------------------------
# 6. Talenettverk per akt
# ---------------------------------------------------------------------------

def build_speech_network_for_act(act: Dict[str, Any]) -> nx.DiGraph:
    G = nx.DiGraph()

    for scene in act.get("scenes", []):
        speeches = scene.get("speeches", [])

        seq: List[Dict[str, Any]] = []
        for sp in speeches:
            speaker = normalize_name(sp.get("speaker"))
            if not speaker:
                continue
            text = sp.get("text", "") or ""
            length = sp.get("length")
            if length is None:
                length = count_words(text)
            seq.append({"speaker": speaker, "length": length})

        if len(seq) < 2:
            continue

        for i in range(len(seq) - 1):
            a = seq[i]["speaker"]
            b = seq[i + 1]["speaker"]
            len_a = seq[i]["length"]
            len_b = seq[i + 1]["length"]

            if not a or not b:
                continue

            if not G.has_node(a):
                G.add_node(a)
            if not G.has_node(b):
                G.add_node(b)

            if G.has_edge(a, b):
                G[a][b]["count"] += 1
                G[a][b]["len_A_sum"] += len_a
                G[a][b]["len_B_sum"] += len_b
            else:
                G.add_edge(
                    a,
                    b,
                    count=1,
                    len_A_sum=len_a,
                    len_B_sum=len_b,
                )

    loops = [(u, v) for u, v in G.edges() if u == v]
    if loops:
        G.remove_edges_from(loops)

    return G


# ---------------------------------------------------------------------------
# 7. Ordtelling per akt og per stykke
# ---------------------------------------------------------------------------

def compute_word_counts(
    play: Dict[str, Any]
) -> Tuple[Dict[str, int], Dict[str, Dict[str, int]]]:
    play_counts: Dict[str, int] = {}
    act_counts: Dict[str, Dict[str, int]] = {}

    for act in play.get("acts", []):
        act_n = str(act.get("act_n", ""))
        if act_n not in act_counts:
            act_counts[act_n] = {}

        for scene in act.get("scenes", []):
            for sp in scene.get("speeches", []):
                speaker = normalize_name(sp.get("speaker"))
                if not speaker:
                    continue
                words = count_words(sp.get("text", "") or "")
                if not words:
                    continue

                play_counts[speaker] = play_counts.get(speaker, 0) + words
                act_counts[act_n][speaker] = act_counts[act_n].get(speaker, 0) + words

    return play_counts, act_counts


# ---------------------------------------------------------------------------
# 8. Dialoger (KQ)^n
# ---------------------------------------------------------------------------

def _find_pair_dialogs_in_scene(
    seq: List[Dict[str, Any]],
    play_title: str,
    act_n: str,
    scene_n: str,
    min_len: int = 4,
) -> List[Dict[str, Any]]:
    dialogs: List[Dict[str, Any]] = []

    speakers = [x["speaker"] for x in seq]
    n = len(speakers)
    i = 0

    while i < n - 1:
        a = speakers[i]
        b = speakers[i + 1]
        if not a or not b or a == b:
            i += 1
            continue

        A, B = a, b
        idxs = [i, i + 1]
        j = i + 2

        while j < n:
            s = speakers[j]
            if s not in (A, B):
                break
            if s == speakers[j - 1]:
                break
            idxs.append(j)
            j += 1

        if len(idxs) >= min_len:
            male_pron = 0
            female_pron = 0
            total_words = 0

            for k in idxs:
                text = seq[k].get("text", "") or ""
                tokens = WORD_RE.findall(text)
                total_words += len(tokens)
                for tok in tokens:
                    t = tok.lower()
                    if t in MALE_PRONOUNS:
                        male_pron += 1
                    elif t in FEMALE_PRONOUNS:
                        female_pron += 1

            female_pair = (
                FEMALE_CHARACTERS.get(A, False)
                and FEMALE_CHARACTERS.get(B, False)
            )

            dialogs.append(
                {
                    "play": play_title,
                    "act": act_n,
                    "scene": scene_n,
                    "speakers": [A, B],
                    "length": len(idxs),
                    "start_index": idxs[0],
                    "end_index": idxs[-1],
                    "male_pron": male_pron,
                    "female_pron": female_pron,
                    "total_words": total_words,
                    "female_pair": bool(female_pair),
                }
            )

        i = max(i + 1, j - 1)

    return dialogs


def compute_dialogs_for_play(
    play: Dict[str, Any],
    min_len: int = 4,
) -> List[Dict[str, Any]]:
    title = play.get("title", "")
    dialogs: List[Dict[str, Any]] = []

    for act in play.get("acts", []):
        act_n = act.get("act_n", "")
        for scene in act.get("scenes", []):
            scene_n = scene.get("scene_n", "")
            seq: List[Dict[str, Any]] = []

            for sp in scene.get("speeches", []):
                speaker = normalize_name(sp.get("speaker"))
                if not speaker:
                    continue
                text = sp.get("text", "") or ""
                seq.append({"speaker": speaker, "text": text})

            if len(seq) < min_len:
                continue

            dialogs.extend(
                _find_pair_dialogs_in_scene(
                    seq,
                    play_title=title,
                    act_n=str(act_n),
                    scene_n=str(scene_n),
                    min_len=min_len,
                )
            )

    return dialogs


# ---------------------------------------------------------------------------
# 9. Bechdel-aggregat
# ---------------------------------------------------------------------------

def summarize_bechdel(dialogs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    En enkel Bechdel-aggregat:
    - passes: minst én kvinnelig dialog (female_pair=True) med
      female_pron > 0 og male_pron == 0
    """
    female_dialogs = [d for d in dialogs if d.get("female_pair")]
    passes = any(
        (d.get("female_pron", 0) > 0 and d.get("male_pron", 0) == 0)
        for d in female_dialogs
    )

    return {
        "passes": passes,
        "female_dialog_count": len(female_dialogs),
        "female_dialogs_no_male_pron": sum(
            1
            for d in female_dialogs
            if d.get("male_pron", 0) == 0
        ),
    }


# ---------------------------------------------------------------------------
# 10. Eksport til ibsen_networks.json
# ---------------------------------------------------------------------------

def export_ibsen_networks(
    all_plays: List[Dict[str, Any]],
    outfile: str = "ibsen_networks.json",
) -> str:
    """
    Bygg:
    - talenettverk per stykke
    - co-occurrence per stykke
    - talenettverk per akt
    - ordtelling (akt + stykke)
    - dialoger (KQ)^n
    - Bechdel-aggregat

    og skriv alt til én JSON-fil med FEMALE_CHARACTERS på toppnivå.
    """
    export: Dict[str, Any] = {
        "FEMALE_CHARACTERS": FEMALE_CHARACTERS,
        "plays": [],
    }

    for play in all_plays:
        title = play.get("title", "")
        play_id = title

        # talenettverk (globalt)
        G_speech, _transitions = build_speech_network_and_transitions(play, play_id)

        speech_nodes = [
            {"id": n, "gender": gender_of(n, play_id)}
            for n in G_speech.nodes()
        ]
        speech_edges: List[Dict[str, Any]] = []
        for u, v, d in G_speech.edges(data=True):
            c = d.get("count", 1)
            len_A_sum = d.get("len_A_sum", 0)
            len_B_sum = d.get("len_B_sum", 0)
            speech_edges.append(
                {
                    "source": u,
                    "target": v,
                    "count": c,
                    "avg_len_A": len_A_sum / c if c else 0.0,
                    "avg_len_B": len_B_sum / c if c else 0.0,
                }
            )

        # co-occurrence (globalt)
        G_co = build_cooccurrence_network(play)
        co_nodes = [
            {"id": n, "gender": gender_of(n, play_id)}
            for n in G_co.nodes()
        ]
        co_edges: List[Dict[str, Any]] = []
        for u, v, d in G_co.edges(data=True):
            co_edges.append(
                {
                    "source": u,
                    "target": v,
                    "weight": d.get("weight", 1),
                }
            )

        # ordtelling
        play_word_counts, act_word_counts = compute_word_counts(play)

        # per-akt talenettverk + ordtelling
        acts_export: List[Dict[str, Any]] = []
        for act in play.get("acts", []):
            act_n = str(act.get("act_n", ""))
            G_act = build_speech_network_for_act(act)

            act_nodes = [
            {"id": n, "gender": gender_of(n, play_id)}
                for n in G_act.nodes()
            ]
            act_edges: List[Dict[str, Any]] = []
            for u, v, d in G_act.edges(data=True):
                c = d.get("count", 1)
                len_A_sum = d.get("len_A_sum", 0)
                len_B_sum = d.get("len_B_sum", 0)
                act_edges.append(
                    {
                        "source": u,
                        "target": v,
                        "count": c,
                        "avg_len_A": len_A_sum / c if c else 0.0,
                        "avg_len_B": len_B_sum / c if c else 0.0,
                    }
                )

            act_wc_raw = act_word_counts.get(act_n, {})
            act_wc = [
                {"character": c, "words": w}
                for c, w in sorted(
                    act_wc_raw.items(),
                    key=lambda x: (-x[1], x[0]),
                )
            ]

            acts_export.append(
                {
                    "act_n": act_n,
                    "speech_network": {
                        "nodes": act_nodes,
                        "edges": act_edges,
                    },
                    "word_counts": act_wc,
                }
            )

        # dialoger + Bechdel
        dialogs = compute_dialogs_for_play(play, min_len=4)
        bechdel_info = summarize_bechdel(dialogs)

        # spill-nivå ordtelling som liste
        play_wc_list = [
            {"character": c, "words": w}
            for c, w in sorted(
                play_word_counts.items(),
                key=lambda x: (-x[1], x[0]),
            )
        ]

        # akt-nivå ordtelling som dict[str, list]
        act_wc_export: Dict[str, List[Dict[str, Any]]] = {}
        for act_n, counts in act_word_counts.items():
            act_wc_export[act_n] = [
                {"character": c, "words": w}
                for c, w in sorted(
                    counts.items(),
                    key=lambda x: (-x[1], x[0]),
                )
            ]

        scene_turns = build_scene_turns(play)

        export["plays"].append(
            {
                "id": play_id,
                "title": title,
                "speech_network": {
                    "nodes": speech_nodes,
                    "edges": speech_edges,
                },
                "co_network": {
                    "nodes": co_nodes,
                    "edges": co_edges,
                },
                "acts": acts_export,
                "word_counts": play_wc_list,
                "act_word_counts": act_wc_export,
                "dialogs": dialogs,
                "scene_turns": scene_turns,
                "bechdel": bechdel_info,
            }
        )

    with open(outfile, "w", encoding="utf-8") as f:
        json.dump(export, f, ensure_ascii=False, indent=2)

    return outfile


# ---------------------------------------------------------------------------
# 11. Hjelpefunksjon for å lese parsed-data + CLI
# ---------------------------------------------------------------------------

def load_parsed(path: str = "ibsen_parsed.json") -> List[Dict[str, Any]]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


if __name__ == "__main__":
    plays = load_parsed("ibsen_parsed.json")
    out = export_ibsen_networks(plays, "ibsen_networks.json")
    print("Skrev:", out)
