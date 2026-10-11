"""Refresh official Korean files through documented public download workflows.

No API keys, account login, geocoding, or TLS exceptions are used. Inherited
proxy/CA settings are retained. This tool only writes ignored raw research files.
"""

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

from normalize import RAW, SOURCE_CONFIG, normalize

MAX_BYTES = 10 * 1024 * 1024


def fetch(url, body=None, referer=None):
    if not url.startswith("https://www.data.go.kr/"):
        raise ValueError("Download destination is not the official HTTPS portal")
    headers = {"User-Agent": "Relief-Toilet-Map public dataset refresh", "Accept": "*/*"}
    if referer:
        headers["Referer"] = referer
    if body is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(body).encode() if body is not None else None,
        headers=headers,
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        content = response.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise ValueError("Official download exceeds bounded research size")
    return content


def download(config):
    catalog_bytes = fetch(config["url"])
    catalog = catalog_bytes.decode("utf-8")
    if "이용허락범위 제한 없음" not in catalog:
        raise ValueError("Source reuse conditions changed; review the official catalog")
    match = re.search(r'"contentUrl":\s*"([^"]+fileDownload[^\"]+)"', catalog)
    metadata = None
    if match:
        url = match[1]
    else:
        detail = re.search(r"fn_fileDataDown\('([0-9]+)',\s*'(uddi:[^']+)'", catalog)
        if not detail:
            raise ValueError("Official public download workflow changed")
        metadata_bytes = fetch(
            "https://www.data.go.kr/tcs/dss/selectFileDataDownload.do",
            {
                "publicDataPk": detail[1],
                "publicDataDetailPk": detail[2],
                "atchFileId": "",
                "fileDetailSn": "1",
                "publicDataTyCode": "PR0051",
            },
            config["url"],
        )
        metadata = json.loads(metadata_bytes)
        if not metadata.get("status") or not metadata.get("atchFileId"):
            raise ValueError("Official file metadata lookup failed")
        url = "https://www.data.go.kr/cmm/cmm/fileDownload.do?" + urllib.parse.urlencode(
            {
                "atchFileId": metadata["atchFileId"],
                "fileDetailSn": metadata["fileDetailSn"],
                "insertDataPrcus": "N",
            }
        )
    content = fetch(url, referer=config["url"])
    return catalog_bytes, content, metadata


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    snapshots = []
    for source_id, config in SOURCE_CONFIG.items():
        catalog, content, metadata = download(config)
        snapshots.append((source_id, config, catalog, content, metadata))
    # Finish all network requests before replacing local snapshots.
    for source_id, config, catalog, content, metadata in snapshots:
        for filename, value in [(config["catalog"], catalog), (config["file"], content)]:
            path = RAW / filename
            pending = Path(str(path) + ".pending")
            pending.write_bytes(value)
            pending.replace(path)
        if metadata is not None:
            (RAW / "busan-download-metadata.json").write_text(
                json.dumps(metadata, ensure_ascii=False)
            )
        print(f"Downloaded {source_id}: {len(content)} bytes")
    result = normalize()
    print(f"Validated {len(result['records'])} official Korean positions")


if __name__ == "__main__":
    main()
