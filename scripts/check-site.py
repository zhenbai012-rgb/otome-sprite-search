"""Check catalog completeness, image references, and public metadata."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "dist"


def load(name):
    return json.loads((SITE / name).read_text(encoding="utf-8").split("=", 1)[1].strip().removesuffix(";"))


def main():
    catalog = load("catalog-data.js")
    games = load("game-data.js")
    assert len(games) == catalog["stats"]["gamePngs"]
    assert len(catalog["official"]) == catalog["stats"]["officialImages"]
    assert all(r["kind"] != "product_preview" for r in catalog["official"])
    paths = set()
    ids = set()
    for r in games + catalog["official"]:
        assert r["id"] not in ids, r["id"]
        ids.add(r["id"])
        for key in ("file", "thumb"):
            p = Path(r[key])
            assert not p.is_absolute() and ".." not in p.parts, p
            assert (SITE / p).is_file(), p
            paths.add(str(p))
    for c in catalog["characters"]:
        assert (SITE / c["thumbnail"]).is_file(), c["id"]
        assert c["archiveUrl"].startswith("https://github.com/")
        assert len([r for r in games if r["character"] == c["id"]]) == c["gameCount"]
    for p in SITE.rglob("*"):
        if p.suffix in {".html", ".js", ".css", ".json"}:
            text = p.read_text(encoding="utf-8")
            assert not re.search(r"(?<![A-Za-z0-9_])[A-Za-z]:[\\/]", text), p
            assert not re.search(r"gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}", text), p
            if "vendor" not in p.relative_to(SITE).parts:
                assert "立牌" not in text and "PPI" not in text, p
    total = sum(p.stat().st_size for p in SITE.rglob("*") if p.is_file())
    assert total < 900_000_000, total
    print(json.dumps({"status": "passed", "game": len(games), "official": len(catalog["official"]), "roles": catalog["stats"]["characterCount"], "imageReferences": len(paths), "siteBytes": total}))


if __name__ == "__main__":
    main()
