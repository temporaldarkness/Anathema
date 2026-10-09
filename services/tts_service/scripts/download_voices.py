#!/usr/bin/env python3

import os
import sys
import urllib.request
from pathlib import Path

VOICES_DIR = Path("/app/voices")
VOICES_DIR.mkdir(parents=True, exist_ok=True)

BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU"

VOICES = [
    "dmitri/medium/ru_RU-dmitri-medium",
    "ruslan/medium/ru_RU-ruslan-medium",
    "irina/medium/ru_RU-irina-medium",
    "denis/medium/ru_RU-denis-medium",
]


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  already exists: {dest.name}")
        return
    print(f"  downloading: {dest.name}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
        while chunk := r.read(1 << 16):
            f.write(chunk)
    tmp.rename(dest)


def main() -> int:
    for v in VOICES:
        name = v.split("/")[-1]
        try:
            download(f"{BASE}/{v}.onnx", VOICES_DIR / f"{name}.onnx")
            download(f"{BASE}/{v}.onnx.json", VOICES_DIR / f"{name}.onnx.json")
        except Exception as e:
            print(f"  FAILED {name}: {e}", file=sys.stderr)
            return 1
    print("\nDownloaded voices:")
    for f in sorted(VOICES_DIR.iterdir()):
        print(f"  {f.name} ({f.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())