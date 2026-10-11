"""Check pinned direct dependencies against official stable-release metadata."""

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


def main():
    package = json.loads((ROOT / "package.json").read_text())
    python = tomllib.loads((ROOT / "pyproject.toml").read_text())
    dependencies = package["dependencies"] | package["devDependencies"]
    items = [(name, version, "javascript") for name, version in dependencies.items()]
    for dependency in python["dependency-groups"]["dev"]:
        name, version = dependency.split("==", 1)
        items.append((name, version, "python"))
    items.append(("bun", package["packageManager"].split("@", 1)[1], "runtime"))
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
