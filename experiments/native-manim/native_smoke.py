"""P0: standard Manim semantics, with no AnyVis renderer or compiler involved."""

from pathlib import Path
import json

import manimpango
from manim import (
    Circle, Create, LEFT, PI, PURPLE_C, Scene, Square, TEAL_C, Text,
    Transform, UP, Write, YELLOW, linear,
)


def chinese_font() -> str:
    available = set(manimpango.list_fonts())
    for candidate in ("PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", "Heiti SC", "Arial Unicode MS"):
        if candidate in available:
            return candidate
    raise RuntimeError("Install a supported Chinese font before this experiment.")


class NativeSmoke(Scene):
    def construct(self):
        font = chinese_font()
        shape = Circle(radius=1, color=TEAL_C).set_fill(TEAL_C, opacity=0.18)
        original_identity = id(shape)
        self.play(Create(shape), run_time=1, rate_func=linear)

        # Transform changes the existing source object; it does not replace its identity.
        target = Square(side_length=2, color=PURPLE_C).set_fill(PURPLE_C, opacity=0.18)
        self.play(Transform(shape, target), run_time=1, rate_func=linear)
        assert id(shape) == original_identity and shape in self.mobjects
        assert target not in self.mobjects

        title = Text("让形状动起来", font=font, font_size=42).to_edge(UP, buff=0.55)
        self.play(Write(title), run_time=1, rate_func=linear)

        # One chain composes movement and rotation of the same object. A second
        # animation runs simultaneously inside the same native Scene.play call.
        self.play(
            shape.animate.shift(LEFT * 1.8).rotate(PI / 4),
            title.animate.set_color(YELLOW),
            run_time=1.5,
            rate_func=linear,
        )
        self.wait(0.5)
        assert abs(shape.get_center()[0] + 1.8) < 1e-7
        assert abs(shape.get_center()[1]) < 1e-7
        assert abs(shape.width - 2 ** 1.5) < 1e-7
        Path("output").mkdir(exist_ok=True)
        Path("output/scene-state.json").write_text(json.dumps({
            "font": font,
            "transform_preserved_source_identity": True,
            "transform_target_added_to_scene": False,
            "final_shape_center": shape.get_center().tolist(),
            "final_shape_width": shape.width,
            "planned_duration_seconds": 5.0,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
