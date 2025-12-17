"""
Parse TEI-XML plays into the intermediate ibsen_parsed.json, then build
ibsen_networks.json using ibsen_networks_acts.py.

Layout (already present):
- data/raw/plays/   # TEI XML input (added by user)
- data/output/      # generated JSON
- public/           # optional copy of final ibsen_networks.json

Run:
    python data/scripts/parse_tei.py --copy-to-public

This parser is intentionally simple: it pulls acts/scenes/speeches with word
counts, ignoring stage directions. It assumes TEI elements with default TEI
namespace and HIS extensions; adjust if source changes.
"""

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw" / "plays"
OUT_DIR = ROOT / "data" / "output"
PUBLIC_JSON = ROOT / "public" / "ibsen_networks.json"

# allow importing sibling script
sys.path.append(str(Path(__file__).parent))
from ibsen_networks_acts import export_ibsen_networks  # noqa: E402

NS = {"tei": "http://www.tei-c.org/ns/1.0", "his": "http://www.example.org/ns/HIS"}
WORD_RE = re.compile(r"\w+", re.UNICODE)


def local(tag: Optional[str]) -> str:
    if not tag:
        return ""
    return tag.split("}")[-1]


def clean(text: str) -> str:
    return " ".join((text or "").split())


def count_words(text: str) -> int:
    return len(WORD_RE.findall(text or ""))


def collect_text(node: ET.Element) -> List[str]:
    skip = {"speaker", "stage", "hisStage", "spOpener", "pb", "lb", "anchor", "note"}
    if local(node.tag) in skip:
        return []
    parts: List[str] = []
    if node.text:
        parts.append(node.text)
    for child in list(node):
        parts.extend(collect_text(child))
        if child.tail:
            parts.append(child.tail)
    return parts


def get_speaker(sp: ET.Element) -> Optional[str]:
    who = sp.attrib.get("who")
    if who:
        who_clean = clean(who)
        if who_clean:
            return who_clean
    for child in sp.iter():
        if local(child.tag) == "speaker":
            txt = clean("".join(child.itertext()))
            if txt:
                return txt
    return None


def parse_speech(sp: ET.Element) -> Optional[Dict[str, object]]:
    speaker = get_speaker(sp)
    if not speaker:
        return None
    text = clean(" ".join(collect_text(sp)))
    length = count_words(text)
    return {"speaker": speaker, "text": text, "length": length}


def parse_scene(scene: ET.Element, fallback_idx: int) -> Optional[Dict[str, object]]:
    speeches: List[Dict[str, object]] = []
    speakers_in_scene = set()

    for sp in scene.iter():
        if local(sp.tag) in {"sp", "hisSp"}:
            parsed = parse_speech(sp)
            if parsed:
                speeches.append(parsed)
                speakers_in_scene.add(parsed["speaker"])

    if not speeches:
        return None

    scene_n = scene.attrib.get("n") or str(fallback_idx)
    return {
        "scene_n": str(scene_n),
        "speakers_in_scene": sorted(speakers_in_scene),
        "speeches": speeches,
    }


def parse_act(act_div: ET.Element, fallback_idx: int) -> Optional[Dict[str, object]]:
    act_n = act_div.attrib.get("n") or str(fallback_idx)
    scenes: List[Dict[str, object]] = []

    scene_elems = list(act_div.findall("./tei:div[@type='scene']", NS))
    if not scene_elems:
        # fallback: treat any child div as a scene
        scene_elems = list(act_div.findall("./tei:div", NS))

    if scene_elems:
        for i, scene in enumerate(scene_elems, start=1):
            parsed = parse_scene(scene, fallback_idx=i)
            if parsed:
                scenes.append(parsed)
    else:
        # No explicit scene divs; treat the whole act as one scene
        speeches: List[Dict[str, object]] = []
        speakers_in_scene = set()
        for sp in act_div.iter():
            if local(sp.tag) in {"sp", "hisSp"}:
                parsed = parse_speech(sp)
                if parsed:
                    speeches.append(parsed)
                    speakers_in_scene.add(parsed["speaker"])
        if speeches:
            scenes.append(
                {
                    "scene_n": "1",
                    "speakers_in_scene": sorted(speakers_in_scene),
                    "speeches": speeches,
                }
            )

    if not scenes:
        return None

    return {"act_n": str(act_n), "scenes": scenes}


def parse_play(xml_path: Path) -> Dict[str, object]:
    tree = ET.parse(xml_path)
    root = tree.getroot()

    acts: List[Dict[str, object]] = []
    act_divs = list(root.findall(".//tei:div[@type='act']", NS))
    if act_divs:
        for idx, act_div in enumerate(act_divs, start=1):
            parsed_act = parse_act(act_div, fallback_idx=idx)
            if parsed_act:
                acts.append(parsed_act)
    else:
        # No acts at all: treat whole play as Act 1 with a single scene collecting all speeches
        speeches: List[Dict[str, object]] = []
        speakers_in_scene = set()
        for sp in root.iter():
            if local(sp.tag) in {"sp", "hisSp"}:
                parsed = parse_speech(sp)
                if parsed:
                    speeches.append(parsed)
                    speakers_in_scene.add(parsed["speaker"])
        if speeches:
            acts.append(
                {
                    "act_n": "1",
                    "scenes": [
                        {
                            "scene_n": "1",
                            "speakers_in_scene": sorted(speakers_in_scene),
                            "speeches": speeches,
                        }
                    ],
                }
            )

    title = xml_path.stem
    return {
        "title": title,
        "file": f"plays/{xml_path.name}",
        "acts": acts,
    }


def parse_all_plays(raw_dir: Path) -> Dict[str, object]:
    plays: List[Dict[str, object]] = []
    for xml in sorted(raw_dir.glob("*.xml")):
        plays.append(parse_play(xml))
    return {"plays": plays}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--copy-to-public", action="store_true", help="Copy generated JSON to public/ibsen_networks.json")
    parser.add_argument("--no-export", action="store_true", help="Skip building ibsen_networks.json (only write ibsen_parsed.json)")
    args = parser.parse_args()

    if not RAW_DIR.exists():
        print(f"Input dir missing: {RAW_DIR}", file=sys.stderr)
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    parsed = parse_all_plays(RAW_DIR)
    parsed_path = OUT_DIR / "ibsen_parsed.json"
    parsed_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote parsed: {parsed_path}")

    if not args.no_export:
        networks_path = OUT_DIR / "ibsen_networks.json"
        export_ibsen_networks(parsed["plays"], outfile=str(networks_path))
        print(f"Wrote networks: {networks_path}")

        if args.copy_to_public:
            PUBLIC_JSON.write_text(networks_path.read_text(encoding="utf-8"), encoding="utf-8")
            print(f"Copied to {PUBLIC_JSON}")


if __name__ == "__main__":
    main()
