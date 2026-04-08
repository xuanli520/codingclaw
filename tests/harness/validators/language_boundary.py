from __future__ import annotations

import re


CHINESE_TEXT = re.compile(r"[\u4e00-\u9fff]")


def validate_language_boundaries(text_surfaces: dict[str, str]) -> list[str]:
    errors: list[str] = []
    for relative_path, content in text_surfaces.items():
        if not CHINESE_TEXT.search(content):
            continue
        if relative_path.startswith("approvals/") or relative_path.endswith(".zh.md"):
            continue
        errors.append(f"non-English repository-facing content: {relative_path}")
    return errors
