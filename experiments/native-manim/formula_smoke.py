"""Optional native MathTex check; requires LaTeX and dvisvgm on PATH."""

from manim import MathTex, Scene, Write


class FormulaSmoke(Scene):
    def construct(self):
        self.play(Write(MathTex(r"x^2+y^2=1")), run_time=1)
        self.wait(0.5)
