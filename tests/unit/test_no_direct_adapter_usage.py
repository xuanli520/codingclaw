import ast
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCAN_ROOTS = ("control", "core", "ops", "scripts", "adapters")
ALLOWED_IMPORTERS = {
    Path("scripts/verify.py"),
}


def _imports_adapter(module_name: str) -> bool:
    return module_name == "adapters" or module_name.startswith("adapters.")


def _violations_for_file(path: Path) -> list[str]:
    relative_path = path.relative_to(REPO_ROOT)
    if relative_path in ALLOWED_IMPORTERS:
        return []
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    violations: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if _imports_adapter(alias.name):
                    violations.append(f"{relative_path.as_posix()} imports {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            module_name = node.module or ""
            if _imports_adapter(module_name):
                violations.append(f"{relative_path.as_posix()} imports {module_name}")
    return violations


def test_non_runner_code_cannot_import_adapters_directly():
    violations: list[str] = []
    for scan_root in SCAN_ROOTS:
        root = REPO_ROOT / scan_root
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            violations.extend(_violations_for_file(path))
    assert violations == []
