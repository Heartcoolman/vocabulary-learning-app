#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class Endpoint:
    method: str
    path: str


@dataclass(frozen=True)
class NestCall:
    prefix: str
    module: str


@dataclass
class ParsedRouterFile:
    endpoints: set[Endpoint]
    nests: list[NestCall]


METHOD_NAMES: dict[str, str] = {
    "get": "GET",
    "post": "POST",
    "put": "PUT",
    "patch": "PATCH",
    "delete": "DELETE",
    "head": "HEAD",
    "options": "OPTIONS",
}


def _repo_root() -> Path:
    # .../packages/backend-rust/scripts/contract_coverage.py -> repo root
    return Path(__file__).resolve().parents[3]


def _unescape_rust_string(raw: str) -> str:
    return raw.replace("\\\\", "\\").replace('\\"', '"')


def _extract_string_literal(expr: str) -> str | None:
    m = re.match(r'\s*"((?:\\.|[^"\\])*)"', expr)
    if not m:
        return None
    return _unescape_rust_string(m.group(1))


def _split_top_level_comma(args: str) -> tuple[str, str] | None:
    depth = 0
    in_str = False
    esc = False
    for i, ch in enumerate(args):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == "(":
            depth += 1
            continue
        if ch == ")":
            depth = max(0, depth - 1)
            continue
        if ch == "," and depth == 0:
            return args[:i], args[i + 1 :]
    return None


def _extract_two_arg_calls(text: str, needle: str) -> list[tuple[str, str]]:
    calls: list[tuple[str, str]] = []
    i = 0
    while True:
        idx = text.find(needle, i)
        if idx == -1:
            break
        start = idx + len(needle)
        depth = 1
        in_str = False
        esc = False
        j = start
        while j < len(text) and depth > 0:
            ch = text[j]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            else:
                if ch == '"':
                    in_str = True
                elif ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
            j += 1

        args = text[start : j - 1]
        parts = _split_top_level_comma(args)
        if parts:
            path_arg, router_expr = parts
            calls.append((path_arg, router_expr))
        i = j
    return calls


def _extract_methods(router_expr: str) -> set[str]:
    methods: set[str] = set()
    for m in re.finditer(
        r"(?<![A-Za-z0-9_])(get|post|put|patch|delete|head|options)\s*\(",
        router_expr,
    ):
        methods.add(METHOD_NAMES[m.group(1)])
    return methods


def _join_paths(prefix: str, path: str) -> str:
    if prefix == "":
        if path == "":
            return "/"
        if not path.startswith("/"):
            path = "/" + path
        if path != "/" and path.endswith("/"):
            return path.rstrip("/")
        return path

    if not prefix.startswith("/"):
        prefix = "/" + prefix
    if prefix != "/" and prefix.endswith("/"):
        prefix = prefix[:-1]

    if path == "/":
        return prefix
    if not path.startswith("/"):
        path = "/" + path
    if prefix == "/":
        return path
    return prefix + path


def _extract_router_module(router_expr: str) -> str | None:
    m = re.search(
        r"(?<![A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)::router\s*\(",
        router_expr,
    )
    if not m:
        return None
    return m.group(1)


def _extract_endpoints_from_file(path: Path) -> ParsedRouterFile:
    text = path.read_text(encoding="utf-8")
    endpoints: set[Endpoint] = set()
    nests: list[NestCall] = []

    for route_path, expr in _extract_two_arg_calls(text, ".route("):
        path_literal = _extract_string_literal(route_path)
        if path_literal is None:
            continue
        for method in _extract_methods(expr):
            endpoints.add(Endpoint(method=method, path=path_literal))

    for nest_prefix, expr in _extract_two_arg_calls(text, ".nest("):
        prefix_literal = _extract_string_literal(nest_prefix)
        if prefix_literal is None:
            continue
        module = _extract_router_module(expr)
        if module is None:
            continue
        nests.append(NestCall(prefix=prefix_literal, module=module))

    return ParsedRouterFile(endpoints=endpoints, nests=nests)


def _resolve_module_file(routes_root: Path, current_file: Path, module: str) -> Path | None:
    module = module.strip()
    if not module:
        return None

    base_dir = current_file.parent
    parts = [part for part in module.split("::") if part]

    if parts[:2] == ["crate", "routes"]:
        parts = parts[2:]
        base_dir = routes_root
    elif parts and parts[0] == "crate":
        return None

    while parts and parts[0] == "super":
        parts = parts[1:]
        base_dir = base_dir.parent

    while parts and parts[0] in {"self"}:
        parts = parts[1:]

    if not parts:
        return None

    candidates: list[Path] = []

    def add_candidates(root: Path) -> None:
        candidates.append(root.joinpath(*parts[:-1], f"{parts[-1]}.rs"))
        candidates.append(root.joinpath(*parts, "mod.rs"))

    add_candidates(base_dir)
    if base_dir != routes_root:
        add_candidates(routes_root)

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return None


def _extract_health_prefixes(mod_text: str) -> list[str]:
    prefixes = [
        _unescape_rust_string(m)
        for m in re.findall(
            r'health_paths\.push\(\s*"((?:\\.|[^"\\])*)"\s*\.to_string\(\)\s*\)',
            mod_text,
        )
    ]
    return prefixes


def _extract_rust_endpoints(repo_root: Path) -> set[Endpoint]:
    routes_root = repo_root / "packages/backend-rust/src/routes"
    mod_rs = routes_root / "mod.rs"
    cache: dict[Path, ParsedRouterFile] = {}
    stack: list[Path] = []

    def parse_file(path: Path) -> ParsedRouterFile:
        parsed = cache.get(path)
        if parsed is not None:
            return parsed
        parsed = _extract_endpoints_from_file(path)
        cache[path] = parsed
        if path == mod_rs:
            mod_text = path.read_text(encoding="utf-8")
            health_prefixes = _extract_health_prefixes(mod_text)
            for prefix in health_prefixes:
                parsed.nests.append(NestCall(prefix=prefix, module="health"))
        return parsed

    def walk(path: Path, prefix: str) -> set[Endpoint]:
        if path in stack:
            return set()
        stack.append(path)
        parsed = parse_file(path)
        endpoints: set[Endpoint] = set()
        for ep in parsed.endpoints:
            endpoints.add(Endpoint(method=ep.method, path=_join_paths(prefix, ep.path)))
        for nest in parsed.nests:
            child_prefix = _join_paths(prefix, nest.prefix)
            nested_file = _resolve_module_file(routes_root, path, nest.module)
            if nested_file is None:
                continue
            endpoints |= walk(nested_file, child_prefix)
        stack.pop()
        return endpoints

    return walk(mod_rs, "")


def _load_contract_endpoints(repo_root: Path) -> set[Endpoint]:
    contract_path = repo_root / "packages/backend/contract/api-contract.json"
    data = json.loads(contract_path.read_text(encoding="utf-8"))
    return {
        Endpoint(method=ep["method"].upper(), path=ep["path"])
        for ep in data.get("endpoints", [])
    }


def _percent(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 100.0
    return (numerator / denominator) * 100.0


def _format_ep(ep: Endpoint) -> str:
    return f"{ep.method} {ep.path}"


def _iter_sorted(eps: Iterable[Endpoint]) -> list[Endpoint]:
    return sorted(eps, key=lambda e: (e.path, e.method))


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Rust router coverage against TS API contract.")
    parser.add_argument(
        "--fail-under",
        type=float,
        default=None,
        help="Exit 1 if coverage percent is below this threshold.",
    )
    parser.add_argument(
        "--show-missing",
        action="store_true",
        help="Print all missing contract endpoints.",
    )
    args = parser.parse_args()

    repo_root = _repo_root()
    contract = _load_contract_endpoints(repo_root)
    rust = _extract_rust_endpoints(repo_root)

    covered = contract & rust
    missing = contract - rust

    coverage = _percent(len(covered), len(contract))
    print(f"contract_endpoints: {len(contract)}")
    print(f"rust_endpoints:     {len(rust)}")
    print(f"covered:            {len(covered)}")
    print(f"missing:            {len(missing)}")
    print(f"coverage_percent:   {coverage:.2f}")

    if args.show_missing and missing:
        print("\nmissing_endpoints:")
        for ep in _iter_sorted(missing):
            print(_format_ep(ep))

    if args.fail_under is not None and coverage < args.fail_under:
        print(
            f"\nFAIL: coverage {coverage:.2f}% < {args.fail_under:.2f}%",
            file=sys.stderr,
        )
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
