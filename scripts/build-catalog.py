"""Rebuild the public catalog from a local, previously prepared sprite index.

Inputs stay outside the repository. No absolute source paths are published.
Image files are prepared separately; this script writes metadata and copies
the small, official web images with their provenance.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil


def read_js(path, variable):
    text = path.read_text(encoding="utf-8")
    prefix = "window." + variable + "="
    if not text.startswith(prefix):
        raise ValueError("Unexpected data script: " + path.name)
    return json.loads(text[len(prefix):].strip().removesuffix(";"))


def write_js(path, variable, payload):
    content = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    path.write_text("window." + variable + "=" + content + ";\n", encoding="utf-8")


def unpack(path, key):
    if path is None:
        return []
    value = json.loads(path.read_text(encoding="utf-8"))
    return value if isinstance(value, list) else value[key]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-site", type=Path, required=True)
    parser.add_argument("--image-map", type=Path)
    parser.add_argument("--archive-map", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "dist")
    parser.add_argument("--repository", default="zhenbai012-rgb/otome-sprite-search")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    catalog = read_js(args.source_site / "catalog-data.js", "CATALOG_DATA")
    excluded = [r for r in catalog["official"] if r["kind"] == "product_preview"]
    catalog["official"] = [r for r in catalog["official"] if r["kind"] != "product_preview"]
    for r in excluded:
        for key in ["file", "thumb"]:
            unused = (output / r[key]).resolve()
            if not unused.is_relative_to(output):
                raise ValueError("Unsafe excluded asset path")
            unused.unlink(missing_ok=True)
    games = read_js(args.source_site / "game-data.js", "CATALOG_GAME_DATA")
    image_map = {r["raw_sha256"]: r for r in unpack(args.image_map, "images")}
    archives = {r["character"]: r for r in unpack(args.archive_map, "archives")}
    extras = {
        "ルナ": ["露娜", "Luna", "桜小路ルナ", "櫻小路露娜"],
        "桜小路才華": ["才华", "才華", "Saika", "櫻小路才華"],
        "朝日": ["小倉朝日", "大藏游星", "大蔵遊星", "Asahi"],
        "大蔵りそな": ["理想奈", "里想奈", "Risona"],
        "エスト": ["Est", "艾斯特"], "ユルシュール": ["尤希尔", "尤希爾", "Ursule"],
        "大蔵ルミネ": ["露米涅", "Lumine"], "柳ヶ瀬湊": ["凑", "湊", "Minato"],
        "花之宮瑞穂": ["瑞穗", "瑞穂", "Mizuho"],
    }
    for r in games:
        digest = Path(r["file"]).stem
        image = image_map.get(digest, {})
        r["file"] = image.get("file", f"assets/sprites/{digest[:2]}/{digest}.webp")
        r["thumb"] = image.get("thumb", f"assets/thumbs/{digest[:2]}/{digest}.webp")
        r["webWidth"] = image.get("webWidth", 0)
        r["webHeight"] = image.get("webHeight", 0)
        r["outfit"] = r["label"].split(" · ", 1)[-1]
        r["sourceLabel"] = " / ".join(re.sub(r"^\d+_", "", s).replace("_", " ") for s in r["sourceLabel"].split("；"))
        r.pop("notes", None)
        r.pop("primaryCropped", None)

    notes = {
        "single_png": "官方公开的单人透明 PNG。",
        "group": "官方组合图，包含同框角色。",
        "product_preview": "官方商品展示图，保留完整页面构图。",
    }
    for r in catalog["official"]:
        for key in ["file", "thumb"]:
            source = args.source_site / r[key]
            target = output / r[key]
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or target.stat().st_size != source.stat().st_size:
                shutil.copy2(source, target)
        r["notes"] = notes.get(r["kind"], "官方公开图片。")
        r.pop("characterNotes", None)
        if len(r["characters"]) > 1:
            r["label"] = r["label"].replace("官方全身商品预览", "官方商品预览")

    first_game = {}
    for r in games:
        first_game.setdefault(r["character"], r)
    for c in catalog["characters"]:
        c["aliases"] = list(dict.fromkeys(c["aliases"] + extras.get(c["id"], [])))
        c.pop("note", None)
        c.pop("checkedPages", None)
        archive = archives.get(c["id"], {})
        asset = archive.get("asset", "character-" + hashlib.sha256(c["id"].encode("utf-8")).hexdigest()[:12] + ".zip")
        c["archiveUrl"] = f"https://github.com/{args.repository}/releases/download/originals-v1/{asset}"
        size = archive.get("size", 0)
        c["archiveSize"] = f"{size / 1024**2:.1f} MB" if size else "全部差分"
        official_for_role = [r for r in catalog["official"] if c["id"] in r["characters"]]
        c["officialCount"] = len(official_for_role)
        c["singleCount"] = sum(r["kind"] == "single_png" for r in official_for_role)
        c["groupCount"] = sum(r["kind"] == "group" for r in official_for_role)
        c["previewCount"] = 0
        if not official_for_role:
            c["thumbnail"] = first_game[c["id"]]["thumb"]
        else:
            c["thumbnail"] = official_for_role[0]["thumb"]

    catalog["game"] = []
    catalog["stats"]["officialImages"] = len(catalog["official"])
    catalog["stats"]["officialRoles"] = sum(c["officialCount"] > 0 and not c["resourceGroup"] for c in catalog["characters"])
    write_js(output / "game-data.js", "CATALOG_GAME_DATA", games)
    game_revision = hashlib.sha256((output / "game-data.js").read_bytes()).hexdigest()[:12]
    catalog["gameScript"] = "game-data.js?v=" + game_revision
    write_js(output / "catalog-data.js", "CATALOG_DATA", catalog)
    (output / "data").mkdir(exist_ok=True)
    sources = {"updated": catalog["updated"], "official": catalog["official"], "gameWorks": sorted({s for r in games for s in r["sourceLabel"].split(" / ")})}
    (output / "data" / "sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")
    downloads = [{"character": c["id"], "display": c["display"], "count": c["gameCount"], "url": c["archiveUrl"], "size": archives.get(c["id"], {}).get("size", 0), "sha256": archives.get(c["id"], {}).get("sha256", "")} for c in catalog["characters"]]
    (output / "data" / "downloads.json").write_text(json.dumps(downloads, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / ".nojekyll").touch()
    html_path = output / "index.html"
    html = html_path.read_text(encoding="utf-8")
    for filename in ["styles.css", "app.js", "catalog-data.js"]:
        revision = hashlib.sha256((output / filename).read_bytes()).hexdigest()[:12]
        html = re.sub(r'(["\'])' + re.escape(filename) + r'(?:\?v=[a-zA-Z0-9-]+)?(["\'])', lambda m: m[1] + filename + "?v=" + revision + m[2], html)
    html_path.write_text(html, encoding="utf-8")
    print(json.dumps({"game": len(games), "official": len(catalog["official"]), "characters": catalog["stats"]["characterCount"], "mappedImages": len(image_map), "archives": len(archives)}))


if __name__ == "__main__":
    main()
