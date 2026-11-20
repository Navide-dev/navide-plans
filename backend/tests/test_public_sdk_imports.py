"""The Plans backend reaches the Navide core only through the public SDK.

The plugin half of the Navide repository's backend/tests/test_plugin_sdk_surface.py;
the SDK's own surface is checked where it is built.
"""
from __future__ import annotations

import ast
from pathlib import Path

import navide_plugin_sdk

PLANS_BACKEND = Path(__file__).resolve().parents[1] / "plans_backend.py"


def test_the_plans_backend_imports_only_public_names() -> None:
    tree = ast.parse(PLANS_BACKEND.read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            modules.add(node.module or "")
            if node.module == "navide_plugin_sdk":
                names = [alias.name for alias in node.names]
                assert not [name for name in names if name.startswith("_")]
                assert not [name for name in names if name not in navide_plugin_sdk.__all__]
        elif isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
    assert "navide_plugin_sdk" in modules
    assert not [module for module in modules if module.split(".")[0] == "agent_team_backend"]
