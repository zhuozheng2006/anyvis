#!/usr/bin/env python3
"""One native Manim render per process. The editor never supplies raw Python."""

import argparse
from fractions import Fraction
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import time
import traceback


def emit(event, **data):
    print("ANYVIS_EVENT " + json.dumps({"event": event, **data}, ensure_ascii=False), flush=True)


def has_encoder(av, name):
    try:
        av.codec.Codec(name, "w")
        return True
    except (ValueError, RuntimeError):
        return False


def health():
    try:
        import av
        import manim
        import manimpango
        fonts = set(manimpango.list_fonts())
        chinese = next((name for name in ("Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "Heiti SC", "Arial Unicode MS") if name in fonts), None)
        x264, vp9, openh264 = (has_encoder(av, name) for name in ("libx264", "libvpx-vp9", "libopenh264"))
        emit("health", available=x264 or vp9, version=manim.__version__, pythonVersion=sys.version.split()[0],
             latex=bool(shutil.which("latex") and shutil.which("dvisvgm")), chineseFont=chinese,
             codec="libx264" if x264 else "libopenh264" if vp9 and openh264 else "vp9" if vp9 else None,
             nativeMp4=x264, renderer="cairo", capabilities={"mp4": x264 or (vp9 and openh264), "webm": vp9, "formulas": bool(shutil.which("latex") and shutil.which("dvisvgm")), "threeD": True})
    except Exception as error:
        emit("health", available=False, error=str(error), pythonVersion=sys.version.split()[0])


def transcode(av, source, destination, fps, progress):
    """Preserve rendered frames. Keep WebM when its audio cannot be copied safely."""
    with av.open(str(source)) as incoming:
        if incoming.streams.audio:
            return source
        original = incoming.streams.video[0]
        with av.open(str(destination), mode="w", options={"movflags": "+faststart"}) as outgoing:
            encoded = outgoing.add_stream("libopenh264", rate=Fraction(fps))
            encoded.width, encoded.height = original.width, original.height
            encoded.pix_fmt = "yuv420p"
            encoded.bit_rate = max(2_000_000, original.width * original.height * fps // 12)
            for index, frame in enumerate(incoming.decode(original)):
                frame = frame.reformat(format="yuv420p")
                frame.pts, frame.time_base = index, Fraction(1, fps)
                for packet in encoded.encode(frame):
                    outgoing.mux(packet)
                if index and index % (fps * 2) == 0:
                    progress(index)
            for packet in encoded.encode():
                outgoing.mux(packet)
    return destination


def inspect_video(av, path, poster):
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        duration = float(stream.duration * stream.time_base) if stream.duration is not None else float(container.duration or 0) / av.time_base
        info = {"duration": duration, "width": stream.width, "height": stream.height,
                "fps": float(stream.average_rate or 0), "codec": stream.codec_context.name}
        target = max(0, duration * 0.84)
        chosen = None
        for frame in container.decode(stream):
            chosen = frame
            if frame.time is not None and frame.time >= target:
                break
        if chosen is not None:
            chosen.to_image().save(str(poster))
        else:
            raise RuntimeError("Manim 没有输出任何画面；请至少加入一个动画或等待积木。")
    return info


def render(job_dir):
    import av
    import manim
    from manim import tempconfig

    settings = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    source = job_dir / "scene.py"
    fps = int(settings["fps"])
    native_format = "mp4" if has_encoder(av, "libx264") else "webm"
    if native_format == "webm" and not has_encoder(av, "libvpx-vp9"):
        raise RuntimeError("当前 Python 缺少 H.264 和 VP9 编码器。请选择含视频编码支持的 Manim 环境。")
    config = {
        "renderer": settings.get("renderer", "cairo"), "pixel_width": int(settings["width"]), "pixel_height": int(settings["height"]),
        "frame_width": 8 * settings.get("frameAspect", settings["width"] / settings["height"]), "frame_height": 8,
        "frame_rate": fps, "background_color": settings["background"],
        "media_dir": str(job_dir / "media"), "output_file": "render." + native_format,
        "format": native_format, "write_to_movie": True, "save_last_frame": False,
        "preview": False, "disable_caching": True, "progress_bar": "none",
        "verbosity": "WARNING",
    }
    expected = settings.get("duration") or 10
    emit("progress", progress=0.04, message="正在加载真实 Manim 场景…")
    with tempconfig(config):
        spec = importlib.util.spec_from_file_location("anyvis_generated_scene", source)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        base = getattr(module, "AnyVisScene")

        class InstrumentedScene(base):
            def play(self, *args, **kwargs):
                emit("progress", progress=min(0.86, 0.08 + 0.76 * float(self.time) / max(expected, 0.1)),
                     message=f"正在渲染动画 · {float(self.time):.1f} 秒")
                result = super().play(*args, **kwargs)
                emit("progress", progress=min(0.87, 0.08 + 0.76 * float(self.time) / max(expected, 0.1)),
                     message=f"已渲染 {float(self.time):.1f} 秒")
                return result

        try:
            scene = InstrumentedScene()
        except (ImportError, RuntimeError) as error:
            if config["renderer"] == "opengl":
                raise RuntimeError("本机 OpenGL 离屏渲染不可用。可切回 Cairo 使用普通图形，或导出 Python 在支持 OpenGL 的 Manim 环境运行。详情: " + str(error)) from error
            raise
        # Publish actual Cairo frames at a bounded rate while the video is still
        # rendering. Atomic replacement prevents the UI reading a half-written PNG.
        original_render = scene.renderer.render
        last_preview = -1.0
        preview_index = 0

        def render_with_preview(*args, **kwargs):
            nonlocal last_preview, preview_index
            result = original_render(*args, **kwargs)
            now = time.monotonic()
            if now - last_preview >= 0.6:
                from PIL import Image
                temporary = job_dir / "preview.pending.png"
                Image.fromarray(scene.renderer.get_frame()).save(temporary)
                os.replace(temporary, job_dir / "preview.png")
                last_preview = now
                preview_index += 1
                emit("preview", frame=preview_index, time=float(scene.time))
            return result

        scene.renderer.render = render_with_preview
        scene.render()
        output = Path(scene.renderer.file_writer.movie_file_path)
    if not output.is_file():
        raise RuntimeError("Manim 未生成视频，请检查动画是否有正时长。")
    emit("progress", progress=0.89, message="正在整理视频…")
    result_path = output
    if native_format == "webm" and has_encoder(av, "libopenh264"):
        result_path = transcode(av, output, job_dir / "video.mp4", fps,
                                lambda count: emit("progress", progress=0.92, message=f"正在编码视频 · {count / fps:.1f} 秒"))
    destination = job_dir / ("video.mp4" if result_path.suffix == ".mp4" else "video.webm")
    if result_path.resolve() != destination.resolve():
        shutil.copyfile(result_path, destination)
    info = inspect_video(av, destination, job_dir / "poster.png")
    emit("done", filename=destination.name, poster="poster.png", version=manim.__version__, nativeFormat=native_format,
         encodingPath="native" if native_format == destination.suffix[1:] else "webm-to-h264", **info)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--health", action="store_true")
    parser.add_argument("job_dir", nargs="?")
    args = parser.parse_args()
    if args.health:
        health()
        return
    try:
        if not args.job_dir:
            raise ValueError("job_dir is required")
        render(Path(args.job_dir).resolve())
    except BaseException as error:
        lines = traceback.format_exc()
        line = getattr(error, "lineno", None) if Path(str(getattr(error, "filename", ""))).name == "scene.py" else None
        for frame in traceback.extract_tb(error.__traceback__):
            if Path(frame.filename).name == "scene.py":
                line = frame.lineno
        emit("error", error=str(error) or type(error).__name__, errorType=type(error).__name__, line=line, details=lines[-12000:])
        raise SystemExit(1)


if __name__ == "__main__":
    main()
