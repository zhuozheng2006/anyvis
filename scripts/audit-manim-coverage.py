#!/usr/bin/env python3
"""Build a reproducible Manim API inventory and AnyVis native-block entry audit.

Run with the Python environment being inspected (no installation or rendering):
    python scripts/audit-manim-coverage.py --expected-version 0.20.1

The catalogue is read from installed Node's TypeScript support. Alternatively,
pass --catalog path/to/catalog.json to audit a previously exported catalogue.
"""
from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import importlib.util
import inspect
import json
from pathlib import Path
import subprocess
import sys
from typing import Any

import manim

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("anyvis_inventory", ROOT / "docs/research/inventory_manim.py")
assert _spec and _spec.loader
inventory_tools = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(inventory_tools)


def clean(value: Any) -> Any:
    if isinstance(value, str):
        return inventory_tools.clean_text(value)
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean(item) for item in value]
    return value


def canonical(value: Any) -> str:
    return inventory_tools.symbol_id(value)


def public_member(value: Any) -> bool:
    return inspect.isfunction(value) or isinstance(value, inventory_tools.MEMBER_TYPES)


def load_catalog(path: Path | None) -> tuple[list[dict[str, Any]], list[str]]:
    if path:
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        # Argument arrays avoid shell interpolation; the child only imports project metadata.
        code = "import { BLOCK_CATALOG } from './src/studio/core/catalog.ts'; import { NATIVE_RUNTIME_APIS } from './src/studio/core/native-api-map.ts'; process.stdout.write(JSON.stringify({blocks:BLOCK_CATALOG,runtimeApis:NATIVE_RUNTIME_APIS}));"
        completed = subprocess.run(["node", "--input-type=module", "-e", code], cwd=ROOT, text=True, capture_output=True, check=False)
        if completed.returncode:
            raise ValueError("Cannot read BLOCK_CATALOG with Node. Use Node with native TypeScript support, or --catalog JSON.\n" + completed.stderr)
        data = json.loads(completed.stdout)
    runtime_refs = data.get("runtimeApis", []) if isinstance(data, dict) else []
    if not isinstance(runtime_refs, list) or any(not isinstance(ref, str) for ref in runtime_refs):
        raise ValueError("Catalogue runtimeApis must be a string list.")
    if isinstance(data, dict) and "blocks" in data:
        data = data["blocks"]
    if not isinstance(data, list) or any(not isinstance(item, dict) or not isinstance(item.get("type"), str) for item in data):
        raise ValueError("Catalogue must be an array of block definitions.")
    if len({item["type"] for item in data}) != len(data):
        raise ValueError("Catalogue contains duplicate block types.")
    return sorted(data, key=lambda item: item["type"]), sorted(set(runtime_refs))


def build_entries(inventory: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, type[Any]]]:
    """MRO normalization prevents inherited names being counted hundreds of times."""
    entries: dict[str, dict[str, Any]] = {}
    exported_classes: dict[str, type[Any]] = {}
    for info in inventory["classes"]:
        value = getattr(manim, info["name"])
        exported_classes[info["name"]] = value
        cid = info["canonical_id"]
        if cid not in entries:
            entries[cid] = {
                "id": cid, "kind": "class", "name": value.__qualname__, "module": value.__module__,
                "export_names": [], "signature": info.get("signature"),
                "signature_status": info.get("signature_status"), "parameters": info.get("parameters", []),
                "return_annotation": info.get("return_annotation"),
                "bases": [canonical(base) for base in value.__bases__],
                "constructor_owner": canonical(next(owner for owner in value.__mro__ if "__init__" in vars(owner))),
                "constructor": inventory_tools.describe_callable(value.__init__),
            }
        entries[cid]["export_names"].append(info["name"])
    for info in inventory["functions"]:
        cid = info["canonical_id"]
        if cid not in entries:
            entries[cid] = {
                "id": cid, "kind": "function", "name": getattr(manim, info["name"]).__qualname__,
                "module": info["module"], "export_names": [],
                **{key: info[key] for key in ("signature", "signature_status", "parameters", "return_annotation") if key in info},
            }
        entries[cid]["export_names"].append(info["name"])
    # Include public members inherited from Manim owners that are not themselves
    # top-level exports, while keeping their actual declaring owner explicit.
    for export_name, cls in sorted(exported_classes.items()):
        visible: dict[str, tuple[type[Any], Any]] = {}
        for owner in cls.__mro__:
            for name, value in vars(owner).items():
                if name not in visible:
                    visible[name] = (owner, value)
        for name, (owner, value) in sorted(visible.items()):
            if name.startswith("_") or not owner.__module__.startswith("manim") or not public_member(value):
                continue
            cid = f"{canonical(owner)}.{name}"
            if cid not in entries:
                member = inventory_tools.describe_member(owner, name, value)
                entries[cid] = {"id": cid, "module": owner.__module__, "owner": canonical(owner),
                                "owner_exported": canonical(owner) in entries, **member, "visible_on_exports": []}
            entries[cid]["visible_on_exports"].append(export_name)
    for entry in entries.values():
        for key in ("export_names", "visible_on_exports"):
            if key in entry:
                entry[key] = sorted(set(entry[key]))
    return entries, exported_classes


def resolve_reference(reference: str) -> str:
    """Resolve e.g. Circle, Mobject.shift, Axes.plot or rate_functions.smooth."""
    parts = reference.split(".")
    if parts and parts[0] == "manim":
        parts = parts[1:]
    if not parts or any(not part.isidentifier() or part.startswith("_") for part in parts):
        raise ValueError("Only public Manim identifiers are accepted.")
    value: Any = manim
    for index, part in enumerate(parts):
        if inspect.isclass(value):
            if index != len(parts) - 1:
                raise ValueError("Nested traversal past a class member is not an API mapping.")
            owner = next((owner for owner in value.__mro__ if part in vars(owner)), None)
            if owner is None:
                raise ValueError("Member is not declared in the actual class MRO.")
            member = vars(owner)[part]
            if not owner.__module__.startswith("manim") or not public_member(member):
                raise ValueError("Member is not a Manim public callable/property in the inventory scope.")
            return f"{canonical(owner)}.{part}"
        value = getattr(value, part)
    if not (inspect.isclass(value) or inspect.isfunction(value)) or not getattr(value, "__module__", "").startswith("manim"):
        raise ValueError("Target is not a public Manim class or function.")
    return canonical(value)


def describe_module_reference(reference: str) -> dict[str, Any]:
    """Describe a runtime-only module export without expanding the API denominator."""
    value: Any = manim
    parts = reference.split(".")
    if parts[0] == "manim":
        parts = parts[1:]
    for part in parts:
        value = getattr(value, part)
    return {"id": canonical(value), "module": value.__module__, "name": value.__qualname__,
            "kind": "class" if inspect.isclass(value) else "function", **inventory_tools.describe_callable(value)}


def read_evidence(paths: list[Path], version: str, entries: dict[str, Any]) -> list[dict[str, Any]]:
    """Keep block-level runtime evidence separate from explicit API-level evidence."""
    records: list[dict[str, Any]] = []
    for path in paths:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, (dict, list)):
            raise ValueError(f"Evidence {path.name} must be a record, record list or evidence bundle.")
        values = raw if isinstance(raw, list) else raw.get("evidence", raw.get("coverageEvidence", [raw]))
        if not isinstance(values, list):
            raise ValueError(f"Evidence bundle {path.name} must contain a record list.")
        for value in values:
            if not isinstance(value, dict) or not isinstance(value.get("id"), str):
                raise ValueError(f"Evidence in {path.name} needs a stable id.")
            engine = value.get("engine_version", value.get("engineVersion"))
            if engine != version:
                raise ValueError(f"Evidence {value['id']} engine {engine} differs from inspected {version}.")
            mode = value.get("mode")
            if mode not in ("native_video", "native_last_frame", "native_behavior", "compile_test"):
                raise ValueError(f"Evidence {value['id']} has an unknown mode.")
            refs = value.get("api_refs", [])
            if not isinstance(refs, list) or any(not isinstance(ref, str) for ref in refs):
                raise ValueError("Evidence api_refs must be a string list.")
            ids = sorted({resolve_reference(ref) for ref in refs})
            if any(cid not in entries for cid in ids):
                raise ValueError(f"Evidence {value['id']} refers to API outside the bounded inventory.")
            blocks = value.get("block_types", value.get("blockTypes", []))
            if not isinstance(blocks, list) or any(not isinstance(block, str) for block in blocks):
                raise ValueError("Evidence block_types must be a string list.")
            source = value.get("source", path.name)
            if not isinstance(source, str):
                raise ValueError("Evidence source must be a string.")
            if Path(source).is_absolute():
                try:
                    source = Path(source).resolve().relative_to(ROOT).as_posix()
                except ValueError:
                    source = Path(source).name
            records.append({"id": value["id"], "engine_version": engine, "renderer": value.get("renderer"),
                            "mode": mode, "block_types": sorted(set(blocks)), "api_refs": sorted(set(refs)),
                            "api_ids": ids, "checks": value.get("checks", []), "limitations": value.get("limitations", []),
                            "source": source})
    if len({item["id"] for item in records}) != len(records):
        raise ValueError("Evidence IDs must be unique.")
    return sorted(records, key=lambda item: item["id"])


def build_report(catalog: list[dict[str, Any]], evidence_paths: list[Path], runtime_refs: list[str] | None = None) -> dict[str, Any]:
    inventory = inventory_tools.build_inventory()
    entries, _ = build_entries(inventory)
    mappings: list[dict[str, Any]] = []
    unresolved: list[dict[str, str]] = []
    linked: dict[str, list[str]] = collections.defaultdict(list)
    runtime_mappings: list[dict[str, Any]] = []
    unresolved_runtime: list[dict[str, str]] = []
    for ref in sorted(set(runtime_refs or [])):
        try:
            cid = resolve_reference(ref)
            item: dict[str, Any] = {"reference": ref, "api_id": cid, "inventory_scope": cid in entries}
            if cid not in entries:
                item["description"] = describe_module_reference(ref)
            runtime_mappings.append(item)
        except (AttributeError, ValueError) as error:
            unresolved_runtime.append({"reference": ref, "reason": str(error)})
    runtime_ids = {item["api_id"] for item in runtime_mappings}
    for block in catalog:
        refs = block.get("nativeApis", [])
        if not isinstance(refs, list) or any(not isinstance(ref, str) for ref in refs):
            raise ValueError(f"Block {block['type']} nativeApis must be a string list.")
        if (block.get("requiresTrust") or block["type"] == "code") and refs:
            raise ValueError("Trusted Python extensions cannot be counted as native block API coverage.")
        if block["type"] in ("sequence", "repeat") and refs:
            raise ValueError("Sequence/repeat are language controls, not native Manim API entry points.")
        resolved: list[dict[str, str]] = []
        for ref in sorted(set(refs)):
            try:
                cid = resolve_reference(ref)
                if cid not in entries:
                    raise ValueError("Resolved API is outside the bounded discovered inventory.")
                linked[cid].append(block["type"])
                resolved.append({"reference": ref, "api_id": cid})
            except (AttributeError, ValueError) as error:
                unresolved.append({"block_type": block["type"], "reference": ref, "reason": str(error)})
        mappings.append({"block_type": block["type"], "label": block.get("label"), "category": block.get("category"),
                         "native_api_mappings": resolved,
                         "classification": "extension_only" if block.get("requiresTrust") or block["type"] == "code" else "native_entry" if resolved else "language_control" if block.get("container") else "unmapped_block",
                         "parameter_coverage": "not_audited", "behavior_verified": False,
                         "representative_render_evidence": [],
                         "note": "API mapping records an entry point; it does not claim every parameter, value type, renderer or behavior is supported."})
    evidence = read_evidence(evidence_paths, inventory["version"], entries)
    block_index = {block["block_type"]: block for block in mappings}
    for proof in evidence:
        for block_type in proof["block_types"]:
            if block_type not in block_index:
                raise ValueError(f"Evidence {proof['id']} names unknown block {block_type}.")
            if proof["mode"] in ("native_video", "native_last_frame"):
                block_index[block_type]["representative_render_evidence"].append(proof["id"])
            if proof["mode"] == "native_behavior":
                block_index[block_type]["behavior_verified"] = True
    for cid, entry in entries.items():
        proofs = [proof for proof in evidence if cid in proof["api_ids"]]
        entry["coverage"] = {
            "native_blocks": sorted(set(linked.get(cid, []))), "block_available": bool(linked.get(cid)), "runtime_used": cid in runtime_ids,
            "inputs_constructible": "not_audited", "parameter_coverage": "not_audited",
            "render_verified": any(proof["mode"] in ("native_video", "native_last_frame") for proof in proofs),
            "behavior_verified": any(proof["mode"] == "native_behavior" for proof in proofs),
            "renderer_support": {renderer: "representative_render_verified" if any(proof["renderer"] == renderer and proof["mode"] in ("native_video", "native_last_frame") for proof in proofs) else "not_audited" for renderer in ("cairo", "opengl")},
            "evidence_ids": [proof["id"] for proof in proofs],
            "novice_task_verified": False,
        }
    counts: dict[str, Any] = {}
    for group, kinds in (("classes", {"class"}), ("functions", {"function"}),
                         ("callable_members", {"method", "classmethod", "staticmethod"}),
                         ("properties", {"property"})):
        values = [entry for entry in entries.values() if entry["kind"] in kinds]
        counts[group] = {"discovered": len(values), "with_native_entry": sum(bool(item["coverage"]["block_available"]) for item in values),
                         "render_verified": sum(item["coverage"]["render_verified"] for item in values),
                         "behavior_verified": sum(item["coverage"]["behavior_verified"] for item in values)}
    counts["class_export_names"] = inventory["class_count"]
    counts["function_export_names"] = inventory["function_count"]
    counts["catalog_blocks"] = len(catalog)
    counts["native_entry_blocks"] = sum(item["classification"] == "native_entry" for item in mappings)
    counts["extension_blocks"] = sum(item["classification"] == "extension_only" for item in mappings)
    counts["language_control_blocks"] = sum(item["classification"] == "language_control" for item in mappings)
    counts["unmapped_blocks"] = [item["block_type"] for item in mappings if item["classification"] == "unmapped_block"]
    counts["runtime_api_count"] = len(runtime_ids)
    counts["unresolved_mapping_count"] = len(unresolved)
    counts["unresolved_runtime_mapping_count"] = len(unresolved_runtime)
    previous_path = ROOT / "docs/research" / f"manim-ce-{inventory['version']}-inventory.json"
    baseline = json.loads(previous_path.read_text(encoding="utf-8")) if previous_path.exists() else None
    compare_keys = ("class_count", "unique_class_count", "function_count", "unique_function_count", "declared_public_member_count", "declared_public_callable_member_count", "declared_public_property_count")
    baseline_comparison = {key: {"previous": baseline.get(key) if baseline else None, "current": inventory[key], "changed": baseline is not None and baseline.get(key) != inventory[key]} for key in compare_keys}
    metadata = sorted(catalog, key=lambda item: item["type"])
    catalog_digest = hashlib.sha256(json.dumps({"blocks": metadata, "runtimeApis": sorted(set(runtime_refs or []))}, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return clean({
        "schema_version": 1, "engine": "Manim Community Edition", "engine_version": inventory["version"], "python_version": inventory["python_version"],
        "catalog_sha256": catalog_digest,
        "scope": {
            "top_level": "Public names exported by manim whose defining module begins with manim; classes/functions only; aliases deduplicated by canonical defining object.",
            "members": "Public callable/property names visible on those exported classes; declaration owner resolved by actual MRO; Manim-origin owners only; inherited duplicates normalized to declaring owner + member name.",
            "constructor_policy": "Class entry includes constructor signature and parameters; __init__ is not counted again as a public method.",
            "exclusions": ["Private names", "Plain class data attributes and enum values", "C-level descriptors and dynamically synthesized methods not exposed as Python functions/properties", "Public module-only APIs not exported at package top level, except inherited public member owners", "Third-party plugins and ManimGL"],
            "denominator_status": "Bounded runtime discovery inventory; not yet the reviewed full public authoring API denominator. Every discovered entry is retained even if authoring relevance is unknown.",
            "coverage_policy": "A native mapping proves an implemented graphical entry only. Complete parameter/value construction, behavior equivalence, renderer parity and novice usability remain independent audits. Python extension blocks never count as native API coverage.",
            "evidence_policy": "Block render evidence does not automatically mark all mapped APIs verified; API-level verification requires explicit api_refs in version-matched evidence. Last-frame smoke is not continuous animation validation. Compile tests do not set render_verified.",
        },
        "counts": counts, "baseline_comparison": baseline_comparison,
        "additional_mro_member_count": sum(entry["kind"] not in ("class", "function") for entry in entries.values()) - inventory["declared_public_member_count"],
        "blocks": mappings, "unresolved_mappings": unresolved, "runtime_api_mappings": runtime_mappings,
        "unresolved_runtime_mappings": unresolved_runtime, "evidence": evidence,
        "unmapped_api_ids": sorted(cid for cid, entry in entries.items() if not entry["coverage"]["block_available"]),
        "api_entries": [entries[cid] for cid in sorted(entries)],
    })


def markdown(report: dict[str, Any], evidence_paths: list[Path]) -> str:
    counts = report["counts"]
    rows = []
    for name, key in (("公开类（去别名）", "classes"), ("公开函数（去别名）", "functions"), ("公开可调用成员（按实际声明类去重）", "callable_members"), ("公开属性", "properties")):
        row = counts[key]
        rows.append(f"| {name} | {row['discovered']} | {row['with_native_entry']} | {row['render_verified']} | {row['behavior_verified']} |")
    modules: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for entry in report["api_entries"]:
        modules[entry["module"]].append(entry)
    module_rows = []
    for module, values in sorted(modules.items()):
        mapped = sum(item["coverage"]["block_available"] for item in values)
        module_rows.append(f"| `{module}` | {len(values)} | {mapped} | {len(values)-mapped} |")
    mapping_rows = [f"| `{block['block_type']}` | {block['label']} | " + ("、".join(f"`{item['reference']}`" for item in block["native_api_mappings"]) or ("扩展，不计覆盖" if block["classification"] == "extension_only" else "编排语言控制" if block["classification"] == "language_control" else "尚未映射")) + " |" for block in report["blocks"]]
    evidence_rows = [f"| `{proof['id']}` | {proof['mode']} | {proof['renderer'] or '—'} | {len(proof['block_types'])} | {len(proof['api_ids'])} |" for proof in report["evidence"]]
    reproduce = f"python scripts/audit-manim-coverage.py --expected-version {report['engine_version']}"
    for path in evidence_paths:
        try:
            shown = path.resolve().relative_to(ROOT).as_posix()
        except ValueError:
            shown = path.name
        reproduce += f" --evidence {shown}"
    changes = [key for key, value in report["baseline_comparison"].items() if value["changed"]]
    return "\n".join([
        "# Manim API 入口覆盖审计", "",
        f"本报告由本机 **Manim CE {report['engine_version']} / Python {report['python_version']}** 的只读 introspection 与当前积木目录生成。它不是“完整支持 Manim”的声明。", "",
        "## 当前计数", "",
        "“有原生入口”只表示至少一个积木使用了对应公开 API；不表示全部参数、Python 值、组合方式或渲染器行为都已支持。", "",
        "| 类别 | 已发现 | 有原生积木入口 | 有明确 API 渲染证据 | 有明确行为证据 |", "| --- | ---: | ---: | ---: | ---: |", *rows, "",
        f"顶层导出名为 {counts['class_export_names']} 个类名、{counts['function_export_names']} 个函数名；别名去重后见上表。目录共有 {counts['catalog_blocks']} 种积木，其中 {counts['native_entry_blocks']} 种带原生 API 映射、{counts['language_control_blocks']} 种为编排语言控制、{counts['extension_blocks']} 种为代码扩展。", "",
        f"此前库存的直接声明成员为 {report['baseline_comparison']['declared_public_member_count']['current']} 项。本次补充沿公开类 MRO 可访问、但声明者未被顶层直接导出的成员 {report['additional_mro_member_count']} 项，统一按真实声明者去重。此前库存计数对比：{'、'.join(changes) if changes else '无变化'}。", "",
        f"未解析的积木 API 映射：{counts['unresolved_mapping_count']}；未解析运行时 API：{counts['unresolved_runtime_mapping_count']}。未提供原生映射的普通积木：{', '.join(counts['unmapped_blocks']) or '无'}。", "",
        "## 分母与证据口径", "",
        "1. 类与函数取自 `manim` 包顶层公开导出，定义模块必须属于 Manim；同一对象的不同导出名不重复计数。", 
        "2. 方法与属性沿导出类的真实 MRO 解析，例如 `Axes.plot` 归属 `CoordinateSystem.plot`。同一继承方法不会因出现在多种几何类上而重复增加覆盖数；类方法、静态方法和属性均保留类型与归属。", 
        "3. 每个条目保存签名、参数、默认值描述、模块、声明类及当前积木映射。所有未映射 API 在 JSON 的 `unmapped_api_ids` 中逐项列出，其完整描述保留在 `api_entries`。", 
        "4. 这仍是边界明确的发现库存：尚未穷尽未在包顶层导出的公开模块 API、动态生成成员、C 层描述符、枚举或普通类数据属性。没有把这些未知项伪装成已排除的无用 API，也不据此给出“完整覆盖百分比”。", 
        "5. `inputs_constructible` 和 `parameter_coverage` 保持 `not_audited`，直到逐 API 的参数适配审计完成。代表积木视频不会自动证明它映射的所有 API 参数路径都被运行过。", 
        "6. `render_verified` 只接受明确列出 `api_refs`、引擎版本匹配的原生渲染证据；最后帧冒烟与连续视频分开记录。编译测试不能充当渲染测试。`behavior_verified` 另需状态、身份或时序断言证据。", 
        "7. Python 扩展不计入原生入口；序列和重复属于 AnyVis 编排语言，不能靠给它们附上任意 Manim 名称抬高计数。", "",
        "## 可复现命令", "", "在要审计的 Manim 环境中运行；脚本不会安装依赖、访问网络、启动服务或渲染作品。", "", "```sh", "conda activate manim", reproduce, "```", "",
        "Node 需要支持直接加载 TypeScript。也可以先导出目录 JSON，再通过 `--catalog catalog.json` 输入；输入支持积木数组或 `{\"blocks\": [...], \"runtimeApis\": [...]}`。输出位置由 `--output` 和 `--markdown` 指定。默认清单为 `.json.gz`，gzip 时间戳固定为 0；显式指定 `--output path.json` 则输出普通 JSON。`--expected-version` 不匹配即停止，防止把另一个安装环境的结果混入当前记录。", "",
        "压缩清单保留全部 JSON 数据，可解压后查看：", "", "```sh", f"gzip -dc docs/research/manim-ce-{report['engine_version']}-coverage.json.gz > docs/research/manim-ce-{report['engine_version']}-coverage.json", "```", "",
        "也可直接用 Python 读取，无需另建解压文件：", "", "```python", "import gzip, json", f"with gzip.open('docs/research/manim-ce-{report['engine_version']}-coverage.json.gz', 'rt', encoding='utf-8') as stream:", "    report = json.load(stream)", "print(len(report['api_entries']))", "```", "",
        f"目录元数据 SHA-256：`{report['catalog_sha256']}`。报告不包含生成时间、私有安装路径或进程内存地址，输入不变时重复生成应字节一致。", "",
        "## 验证证据", "",
        *( ["| 证据 | 类型 | 渲染器 | 积木条目数 | 显式 API 条目数 |", "| --- | --- | --- | ---: | ---: |", *evidence_rows] if evidence_rows else ["此次未附 API 级渲染或行为证据，因此相应栏位保持未核验。已运行的模板验证应以其独立记录为准，不能自动扩大为全 API 验收。"] ), "",
        "## 各模块尚未覆盖的入口", "",
        "| 模块 | 发现条目 | 已有入口 | 尚无入口 |", "| --- | ---: | ---: | ---: |", *module_rows, "",
        "## 当前积木到公开 API 的映射", "",
        "| 积木类型 | 中文名称 | 映射的公开 API |", "| --- | --- | --- |", *mapping_rows, "",
        "## 独立运行时 API", "",
        f"编译器或运行时使用的 {counts['runtime_api_count']} 个 API 单独记录，不能增加“有原生积木入口”的数字：" + ("、".join(f"`{item['reference']}`" for item in report["runtime_api_mappings"]) or "无") + "。模块公开但未顶层导出的函数保留签名并标记 `inventory_scope: false`，不混入上表的顶层 API 分母。", "",
        "## 后续验收方向", "",
        "先从 `unmapped_api_ids` 中筛选创作 API，逐项记录用途和排除理由，再补对应积木、可构造参数、错误定位、行为对照与渲染器验证。自动清单提供检查入口，无法代替这一过程。增加几个常用积木只是进度，不代表完整 API 工作已经完成。", "",
        f"完整机器清单：[manim-ce-{report['engine_version']}-coverage.json.gz](research/manim-ce-{report['engine_version']}-coverage.json.gz)。", "",
    ])


def write_report(output: Path, report: dict[str, Any]) -> None:
    """Gzip stores no filename or timestamp; plain .json remains an explicit option."""
    payload = (json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(gzip.compress(payload, mtime=0) if output.suffix == ".gz" else payload)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-version", required=True, help="Fail if a different Manim environment is selected.")
    parser.add_argument("--catalog", type=Path, help="Catalogue JSON; otherwise read current BLOCK_CATALOG via Node.")
    parser.add_argument("--evidence", action="append", type=Path, default=[], help="Explicit versioned evidence JSON; repeatable.")
    parser.add_argument("--output", type=Path, help="Coverage output path; .gz compresses deterministically, .json writes plain JSON.")
    parser.add_argument("--markdown", type=Path, help="Readable report output path.")
    args = parser.parse_args()
    if args.expected_version != manim.__version__:
        parser.error(f"Expected Manim {args.expected_version}, found {manim.__version__}.")
    try:
        catalog, runtime_refs = load_catalog(args.catalog)
        report = build_report(catalog, args.evidence, runtime_refs)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.error(str(error))
    output = args.output or ROOT / f"docs/research/manim-ce-{manim.__version__}-coverage.json.gz"
    markdown_output = args.markdown or ROOT / "docs/Manim-API-Coverage.md"
    markdown_output.parent.mkdir(parents=True, exist_ok=True)
    write_report(output, report)
    markdown_output.write_text(markdown(report, args.evidence), encoding="utf-8")
    print(json.dumps({"engine_version": report["engine_version"], "counts": report["counts"], "additional_mro_member_count": report["additional_mro_member_count"]}, ensure_ascii=False))
    if report["unresolved_mappings"] or report["unresolved_runtime_mappings"]:
        for item in report["unresolved_mappings"] + report["unresolved_runtime_mappings"]:
            print(json.dumps(item, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
