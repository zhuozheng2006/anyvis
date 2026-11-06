#!/usr/bin/env python3
"""Reproduce the versioned Manim API research inventory without rendering.

Run with the Python environment whose Manim installation is being audited:
    python docs/research/inventory_manim.py --expected-version 0.20.1

This records a deliberately bounded discovery inventory, not a support claim.
No application source, user scene, network resource, or environment secret is read.
"""

from __future__ import annotations

import argparse
import collections
import inspect
import json
from pathlib import Path
import re
import sys
from typing import Any

import manim


MEMBER_TYPES = (property, classmethod, staticmethod)


def public_manim_symbol(name: str, value: Any) -> bool:
    """Match the discovery filter used by the design document's counts."""
    return not name.startswith("_") and (getattr(value, "__module__", "") or "").startswith("manim")


def symbol_id(value: Any) -> str:
    module = getattr(value, "__module__", "") or ""
    name = getattr(value, "__qualname__", None) or getattr(value, "__name__", type(value).__name__)
    return f"{module}.{name}" if module else name


def clean_text(value: str) -> str:
    # Function/object repr addresses are process-specific, not API information.
    value = re.sub(r" at 0x[0-9a-fA-F]+", "", value)
    # Never publish an absolute private home path if a third-party default uses one.
    home = str(Path.home())
    if home and home != "/":
        value = value.replace(home, "<USER_HOME>")
    return value


def describe_default(value: Any) -> dict[str, Any]:
    if value is inspect.Parameter.empty:
        return {"kind": "required"}
    if value is None or isinstance(value, (bool, int, float, str)):
        return {"kind": "literal", "value": clean_text(value) if isinstance(value, str) else value}
    if inspect.isclass(value):
        return {"kind": "class_reference", "symbol": symbol_id(value)}
    if inspect.isfunction(value) or inspect.ismethod(value) or inspect.isbuiltin(value):
        return {"kind": "callable_reference", "symbol": symbol_id(value)}
    # Repr is descriptive only. It is never evaluated by this audit or AnyVis.
    return {"kind": "descriptive_repr", "type": symbol_id(type(value)), "repr": clean_text(repr(value))}


def describe_callable(value: Any) -> dict[str, Any]:
    try:
        signature = inspect.signature(value)
    except (TypeError, ValueError):
        return {"signature": None, "signature_status": "unavailable"}
    return {
        "signature": clean_text(str(signature)),
        "signature_status": "inspected",
        "parameters": [
            {
                "name": p.name,
                "kind": p.kind.name.lower(),
                "annotation": None if p.annotation is inspect.Parameter.empty else clean_text(inspect.formatannotation(p.annotation)),
                "default": describe_default(p.default),
            }
            for p in signature.parameters.values()
        ],
        "return_annotation": None if signature.return_annotation is inspect.Signature.empty else clean_text(inspect.formatannotation(signature.return_annotation)),
    }


def describe_member(owner: type[Any], name: str, value: Any) -> dict[str, Any]:
    member: dict[str, Any] = {"name": name, "declared_on": symbol_id(owner)}
    if isinstance(value, property):
        member["kind"] = "property"
        member["readable"] = value.fget is not None
        member["writable"] = value.fset is not None
        member["deletable"] = value.fdel is not None
        member["accessors"] = {
            key: describe_callable(fn)
            for key, fn in (("get", value.fget), ("set", value.fset), ("delete", value.fdel))
            if fn is not None
        }
    else:
        member["kind"] = "classmethod" if isinstance(value, classmethod) else "staticmethod" if isinstance(value, staticmethod) else "method"
        fn = value.__func__ if isinstance(value, (classmethod, staticmethod)) else value
        member.update(describe_callable(fn))
    return member


def build_inventory() -> dict[str, Any]:
    classes: list[dict[str, Any]] = []
    functions: list[dict[str, Any]] = []
    unique: dict[int, dict[str, Any]] = {}
    modules: set[str] = set()
    callable_modules: set[str] = set()
    other_exports: list[dict[str, str]] = []
    for name, value in sorted(vars(manim).items()):
        if not public_manim_symbol(name, value):
            continue
        module = value.__module__
        modules.add(module)
        if inspect.isclass(value):
            classes.append({"name": name, "module": module, "canonical_id": symbol_id(value), **describe_callable(value)})
            if id(value) not in unique:
                members = [
                    describe_member(value, member_name, member_value)
                    for member_name, member_value in sorted(vars(value).items())
                    if not member_name.startswith("_") and (inspect.isfunction(member_value) or isinstance(member_value, MEMBER_TYPES))
                ]
                unique[id(value)] = {
                    "canonical_id": symbol_id(value),
                    "module": module,
                    "qualname": value.__qualname__,
                    "export_names": [],
                    "bases": [symbol_id(base) for base in value.__bases__],
                    "declared_public_members": members,
                    "declared_public_member_count": len(members),
                    "constructor": describe_callable(value.__init__),
                }
            unique[id(value)]["export_names"].append(name)
            callable_modules.add(module)
        elif inspect.isfunction(value):
            functions.append({"name": name, "module": module, "canonical_id": symbol_id(value), **describe_callable(value)})
            callable_modules.add(module)
        else:
            other_exports.append({"name": name, "module": module, "type": symbol_id(type(value))})
    unique_classes = sorted(unique.values(), key=lambda c: c["canonical_id"])
    all_members = [m for c in unique_classes for m in c["declared_public_members"]]
    member_kinds = collections.Counter(m["kind"] for m in all_members)
    unique_functions = {f["canonical_id"] for f in functions}
    return {
        "schema_version": 2,
        "version": manim.__version__,
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "audit": {
            "engine": "Manim Community Edition",
            "mode": "read-only runtime introspection; no scene construction or rendering",
            "source": "the Manim installation imported by the selected Python interpreter",
            "reproduce": "python docs/research/inventory_manim.py --expected-version " + manim.__version__,
            "public_name_filter": "exported attribute name does not start with '_'",
            "origin_filter": "getattr(value, '__module__', '').startswith('manim')",
            "top_level_class_filter": "inspect.isclass(value)",
            "top_level_function_filter": "inspect.isfunction(value)",
            "unique_class_rule": "deduplicate top-level exports by Python object identity during this audit; IDs are not serialized",
            "declared_member_filter": "vars(class) items with a public name whose value is inspect.isfunction, property, classmethod, or staticmethod",
            "module_count_policy": "module_count covers all origin-filtered public exports, including instance exports; class_or_function_module_count covers only inventoried classes/functions",
            "inheritance_policy": "only members declared directly on each unique class are counted; inherited duplicates are excluded",
            "signature_policy": "inspect.signature; class __init__ additionally recorded; unavailable signatures remain explicit; repr addresses normalized",
            "limitations": [
                "This is a discovery inventory, not the complete public authoring API denominator or an implementation coverage claim.",
                "Public APIs not exported at the top level are not enumerated here.",
                "Class data attributes, enum values, C-level descriptors, dynamically synthesized members, and private names are not included in declared-member counts.",
                "Public names from internal-origin modules may appear; authoring relevance requires a separate reviewed classification.",
                "Constructor kwargs forwarding, semantic constraints, callback constructibility, renderer compatibility, and rendering behavior require separate adaptation and tests.",
                "A descriptive repr is documentation only and must not be evaluated as code.",
            ],
            "privacy": "No absolute installation path, user home path, username, machine identifier, or environment variable values are included.",
        },
        "class_count": len(classes),
        "unique_class_count": len(unique_classes),
        "function_count": len(functions),
        "unique_function_count": len(unique_functions),
        "module_count": len(modules),
        "class_or_function_module_count": len(callable_modules),
        "public_origin_modules": sorted(modules),
        "other_exported_symbols": other_exports,
        "declared_public_member_count": len(all_members),
        "declared_public_callable_member_count": len(all_members) - member_kinds["property"],
        "declared_public_property_count": member_kinds["property"],
        "member_kind_counts": dict(sorted(member_kinds.items())),
        "class_modules": dict(sorted(collections.Counter(c["module"] for c in classes).items())),
        "classes": classes,
        "functions": functions,
        "unique_classes": unique_classes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-version", help="Fail rather than audit an unintended Manim version.")
    parser.add_argument("--output", type=Path, help="Output JSON path; defaults beside this script.")
    args = parser.parse_args()
    if args.expected_version and args.expected_version != manim.__version__:
        parser.error(f"Expected Manim {args.expected_version}, found {manim.__version__}.")
    inventory = build_inventory()
    output = args.output or Path(__file__).parent / f"manim-ce-{manim.__version__}-inventory.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(inventory, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({key: inventory[key] for key in ("version", "class_count", "unique_class_count", "function_count", "module_count", "declared_public_member_count", "declared_public_callable_member_count", "declared_public_property_count")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
