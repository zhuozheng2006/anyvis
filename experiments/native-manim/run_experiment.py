#!/usr/bin/env python3
"""Render and inspect a real Manim P0 movie using the current Python environment."""

from fractions import Fraction
from importlib.metadata import version
import json
from pathlib import Path
import subprocess
import sys

import av
from PIL import Image, ImageDraw
import manim

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "output"
EXPECTED_VERSION = "0.20.1"


def transcode_to_mp4(source):
    """Re-encode existing native output; never replace Manim animation semantics."""
    destination = OUTPUT / "native-smoke.mp4"
    with av.open(source) as incoming, av.open(destination, mode="w") as outgoing:
        original = incoming.streams.video[0]
        encoded = outgoing.add_stream("libopenh264", rate=30)
        encoded.width, encoded.height = original.width, original.height
        encoded.pix_fmt = "yuv420p"
        encoded.bit_rate = 2_000_000
        for index, frame in enumerate(incoming.decode(original)):
            frame = frame.reformat(format="yuv420p")
            frame.pts, frame.time_base = index, Fraction(1, 30)
            for packet in encoded.encode(frame):
                outgoing.mux(packet)
        for packet in encoded.encode():
            outgoing.mux(packet)
    return destination


def main():
    if manim.__version__ != EXPECTED_VERSION:
        raise SystemExit(f"This P0 record targets Manim {EXPECTED_VERSION}; found {manim.__version__}. Audit a new version separately.")
    OUTPUT.mkdir(exist_ok=True)
    try:
        av.codec.Codec("libx264", "w")
        native_format = "mp4"
    except av.codec.codec.UnknownCodecError:
        native_format = "webm"
        print("libx264 is unavailable: rendering native WebM, then transcoding with libopenh264.")
    command = [
        sys.executable, "-m", "manim", "render", "--renderer", "cairo",
        "--format", native_format, "--fps", "30", "-r", "960,540",
        "--media_dir", "output/media", "--disable_caching", "--progress_bar", "none",
        "-o", f"native-smoke.{native_format}", "native_smoke.py", "NativeSmoke",
    ]
    completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    (OUTPUT / "render.log").write_text(completed.stdout + completed.stderr, encoding="utf-8")
    if completed.returncode:
        print("\n".join((completed.stdout + completed.stderr).splitlines()[-8:]))
        print("Full diagnostic: experiments/native-manim/output/render.log")
        raise SystemExit(completed.returncode)
    candidates = sorted((OUTPUT / "media").rglob(f"native-smoke.{native_format}"))
    if len(candidates) != 1:
        raise SystemExit(f"Expected one native movie, found {len(candidates)}.")
    native_movie = candidates[0]
    movie = native_movie if native_format == "mp4" else transcode_to_mp4(native_movie)
    targets = {15: "create-0.50s", 45: "transform-1.50s", 75: "write-2.50s", 112: "parallel-3.73s", 144: "wait-4.80s"}
    frames = []
    with av.open(movie) as container:
        stream = container.streams.video[0]
        width, height = stream.width, stream.height
        rate = stream.average_rate
        duration = float(stream.duration * stream.time_base)
        codec = stream.codec_context.name
        index = -1
        for index, frame in enumerate(container.decode(stream)):
            if index in targets:
                name = targets[index]
                image = frame.to_image()
                image.save(OUTPUT / f"{name}.png")
                frames.append((name, image))
        decoded_frames = index + 1
    assert (width, height) == (960, 540), (width, height)
    assert rate == Fraction(30), rate
    assert codec == "h264", codec
    assert decoded_frames == 150, decoded_frames
    assert abs(duration - 5.0) < 1 / 30, duration
    assert len(frames) == 5, len(frames)

    sheet = Image.new("RGB", (960, 3 * 302), "#141922")
    draw = ImageDraw.Draw(sheet)
    for i, (name, image) in enumerate(frames):
        x, y = (i % 2) * 480, (i // 2) * 302
        image.thumbnail((480, 270))
        sheet.paste(image, (x, y))
        draw.text((x + 10, y + 278), name, fill="#dce4ed")
    sheet.save(OUTPUT / "contact-sheet.png")
    state = json.loads((OUTPUT / "scene-state.json").read_text(encoding="utf-8"))
    result = {
        "scope": "P0 native Manim smoke test, not AnyVis block compilation or UI verification",
        "environment": {
            "manim": manim.__version__, "python": sys.version.split()[0], "renderer": "cairo",
            "pyav": av.__version__, "manimpango": version("manimpango"),
            "pycairo": version("pycairo"), "numpy": version("numpy"),
        },
        "export": {
            "native_format": native_format,
            "native_path": native_movie.relative_to(ROOT).as_posix(),
            "native_mp4_available": native_format == "mp4",
            "fallback_reason": "PyAV build has no libx264 encoder" if native_format == "webm" else None,
            "mp4_transcode_encoder": "libopenh264" if native_format == "webm" else None,
        },
        "video": {"path": movie.relative_to(ROOT).as_posix(), "width": width, "height": height,
                  "fps": str(rate), "duration_seconds": duration, "decoded_frames": decoded_frames, "codec": codec},
        "scene": state,
        "keyframes": [f"output/{name}.png" for name, _ in frames],
        "contact_sheet": "output/contact-sheet.png",
    }
    (OUTPUT / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
