"""Check locked direct dependencies against official stable-release metadata."""

import json
import tomllib
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def get_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "jpkr-map-version-check"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def check_package(item):
    name, installed, ecosystem = item
    if ecosystem == "javascript":
        encoded = urllib.parse.quote(name, safe="")
        latest = get_json(f"https://registry.npmjs.org/{encoded}/latest")["version"]
    elif ecosystem == "python":
        latest = get_json(f"https://pypi.org/pypi/{name}/json")["info"]["version"]
    else:
        latest = get_json("https://api.github.com/repos/oven-sh/bun/releases/latest")[
            "tag_name"
        ].removeprefix("bun-v")
    return {
        "name": name,
        "ecosystem": ecosystem,
        "pinned": installed,
        "latestStable": latest,
        "current": installed == latest,
    }


def dependency_items(root):
    package = json.loads((root / "package.json").read_text())
    python = tomllib.loads((root / "pyproject.toml").read_text())
    lock = tomllib.loads((root / "uv.lock").read_text())
    project = next(entry for entry in lock["package"] if entry["name"] == python["project"]["name"])
    dependencies = package["dependencies"] | package["devDependencies"]
    items = [(name, version, "javascript") for name, version in dependencies.items()]
    for dependency in project["dev-dependencies"]["dev"]:
        name = dependency["name"]
        versions = {entry["version"] for entry in lock["package"] if entry["name"] == name}
        if len(versions) != 1:
            raise ValueError(f"Expected one locked version for {name}, found {sorted(versions)}")
        items.append((name, versions.pop(), "python"))
    items.append(("bun", (root / ".bun-version").read_text().strip(), "runtime"))
    return items


def main():
    items = dependency_items(ROOT)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(check_package, items))
    report = {"checkedAt": datetime.now(UTC).isoformat(), "dependencies": results}
    output = ROOT / ".cache" / "dependency-versions.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    for result in results:
        print(f"{result['name']}: {result['pinned']} / latest {result['latestStable']}")
    return 0 if all(result["current"] for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
