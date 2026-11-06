"""Audit semantics: inherited ownership, bounded counts, and evidence separation."""
from __future__ import annotations

import importlib.util
import gzip
import json
from pathlib import Path
import tempfile
import unittest

import manim

_spec = importlib.util.spec_from_file_location("anyvis_api_audit", Path(__file__).with_name("audit-manim-coverage.py"))
assert _spec and _spec.loader
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)


class CoverageAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.inventory = audit.inventory_tools.build_inventory()
        cls.entries, cls.exported_classes = audit.build_entries(cls.inventory)

    def test_inherited_members_resolve_to_actual_owner(self) -> None:
        inherited = audit.resolve_reference("Axes.plot")
        self.assertEqual(inherited, audit.resolve_reference("CoordinateSystem.plot"))
        self.assertEqual(self.entries[inherited]["owner"], audit.canonical(manim.CoordinateSystem))
        self.assertIn("Axes", self.entries[inherited]["visible_on_exports"])
        self.assertIn("NumberPlane", self.entries[inherited]["visible_on_exports"])
        self.assertEqual(sum(entry["id"] == inherited for entry in self.entries.values()), 1)

    def test_export_aliases_do_not_inflate_class_count(self) -> None:
        class_entries = [entry for entry in self.entries.values() if entry["kind"] == "class"]
        self.assertEqual(len(class_entries), len({id(value) for value in self.exported_classes.values()}))
        self.assertEqual(sum(len(entry["export_names"]) for entry in class_entries), self.inventory["class_count"])

    def test_members_preserve_parameters_and_property_kind(self) -> None:
        shift = self.entries[audit.resolve_reference("Mobject.shift")]
        self.assertEqual(shift["kind"], "method")
        self.assertTrue(any(parameter["name"] == "vectors" for parameter in shift["parameters"]))
        self.assertEqual(self.entries[audit.resolve_reference("Mobject.animate")]["kind"], "property")
        with self.assertRaises(ValueError):
            audit.resolve_reference("Mobject.set_opacity")
        self.assertIn(audit.resolve_reference("VMobject.set_opacity"), self.entries)

    def test_runtime_module_exports_do_not_expand_top_level_denominator(self) -> None:
        report = audit.build_report([], [], ["rate_functions.ease_in_sine", "Scene.play"])
        by_ref = {item["reference"]: item for item in report["runtime_api_mappings"]}
        self.assertFalse(by_ref["rate_functions.ease_in_sine"]["inventory_scope"])
        self.assertIn("parameters", by_ref["rate_functions.ease_in_sine"]["description"])
        self.assertTrue(by_ref["Scene.play"]["inventory_scope"])
        self.assertEqual(report["counts"]["functions"]["discovered"], self.inventory["unique_function_count"])
        self.assertEqual(report["counts"]["native_entry_blocks"], 0)

    def test_extension_and_control_blocks_do_not_count_as_native_entries(self) -> None:
        report = audit.build_report([
            {"type": "circle", "nativeApis": ["Circle"]},
            {"type": "code", "requiresTrust": True},
            {"type": "sequence", "container": "sequence"},
        ], [])
        self.assertEqual(report["counts"]["native_entry_blocks"], 1)
        self.assertEqual(report["counts"]["extension_blocks"], 1)
        self.assertEqual(report["counts"]["language_control_blocks"], 1)
        with self.assertRaises(ValueError):
            audit.build_report([{"type": "code", "requiresTrust": True, "nativeApis": ["Circle"]}], [])
        with self.assertRaises(ValueError):
            audit.build_report([{"type": "repeat", "container": "repeat", "nativeApis": ["Circle"]}], [])

    def test_block_and_compile_evidence_do_not_imply_api_render_verification(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "evidence.json"
            path.write_text(json.dumps({"evidence": [
                {"id": "block-smoke", "engine_version": manim.__version__, "renderer": "cairo", "mode": "native_video", "block_types": ["circle"]},
                {"id": "compile-only", "engine_version": manim.__version__, "mode": "compile_test", "api_refs": ["Circle"]},
            ]}))
            report = audit.build_report([{"type": "circle", "nativeApis": ["Circle"]}], [path])
        circle = next(entry for entry in report["api_entries"] if entry["id"] == audit.resolve_reference("Circle"))
        self.assertFalse(circle["coverage"]["render_verified"])
        self.assertFalse(circle["coverage"]["behavior_verified"])
        self.assertEqual(report["blocks"][0]["representative_render_evidence"], ["block-smoke"])
        self.assertEqual(circle["coverage"]["parameter_coverage"], "not_audited")

    def test_explicit_api_evidence_keeps_renderers_and_behavior_separate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "evidence.json"
            path.write_text(json.dumps({"id": "api-smoke", "engine_version": manim.__version__, "renderer": "cairo", "mode": "native_last_frame", "api_refs": ["Circle"]}))
            report = audit.build_report([{"type": "circle", "nativeApis": ["Circle"]}], [path])
        circle = next(entry for entry in report["api_entries"] if entry["id"] == audit.resolve_reference("Circle"))
        self.assertTrue(circle["coverage"]["render_verified"])
        self.assertFalse(circle["coverage"]["behavior_verified"])
        self.assertEqual(circle["coverage"]["renderer_support"]["opengl"], "not_audited")
        self.assertEqual(circle["coverage"]["renderer_support"]["cairo"], "representative_render_verified")

    def test_invalid_mappings_are_retained_as_unresolved(self) -> None:
        report = audit.build_report([{"type": "broken", "nativeApis": ["Mobject.does_not_exist"]}], [], ["does_not_exist"])
        self.assertEqual(report["counts"]["unresolved_mapping_count"], 1)
        self.assertEqual(report["counts"]["unresolved_runtime_mapping_count"], 1)
        self.assertEqual(report["counts"]["native_entry_blocks"], 0)

    def test_unknown_evidence_version_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "evidence.json"
            path.write_text(json.dumps({"id": "wrong-engine", "engine_version": "0.0.invalid", "mode": "native_video"}))
            with self.assertRaises(ValueError):
                audit.read_evidence([path], manim.__version__, self.entries)

    def test_compressed_output_is_reproducible_and_lossless(self) -> None:
        report = {"api_entries": [{"name": "中文", "parameters": [1, False, None]}]}
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.json.gz"
            second = Path(directory) / "second.json.gz"
            plain = Path(directory) / "report.json"
            for output in (first, second, plain):
                audit.write_report(output, report)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertEqual(first.read_bytes()[4:8], b"\x00\x00\x00\x00")
            self.assertEqual(gzip.decompress(first.read_bytes()), plain.read_bytes())
            self.assertEqual(json.loads(plain.read_text(encoding="utf-8")), report)
            with gzip.open(first, "rt", encoding="utf-8") as stream:
                self.assertEqual(json.load(stream), report)


if __name__ == "__main__":
    unittest.main()
