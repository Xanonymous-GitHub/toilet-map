import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "check_dependencies", Path(__file__).resolve().parent.parent / "scripts/check-dependencies.py"
)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class DependencyItemsTest(unittest.TestCase):
    def write_project(self, root, constraints):
        (root / "package.json").write_text(
            json.dumps({"dependencies": {"react": "19.3.0"}, "devDependencies": {}})
        )
        (root / ".bun-version").write_text("1.4.3\n")
        (root / "pyproject.toml").write_text(
            f'[project]\nname = "tools"\n[dependency-groups]\ndev = {json.dumps(constraints)}\n'
        )
        (root / "uv.lock").write_text(
            '[[package]]\nname = "tools"\nversion = "1.0.0"\n'
            '[package.dev-dependencies]\ndev = [{name = "ruff"}, {name = "playwright"}]\n'
            '[[package]]\nname = "ruff"\nversion = "0.17.0"\n'
            '[[package]]\nname = "playwright"\nversion = "1.63.0"\n'
            '[[package]]\nname = "greenlet"\nversion = "3.5.6"\n'
        )

    def test_ranges_use_locked_versions_without_package_manager(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_project(root, ["ruff>=0", "playwright>=1"])
            self.assertEqual(
                checker.dependency_items(root),
                [
                    ("react", "19.3.0", "javascript"),
                    ("ruff", "0.17.0", "python"),
                    ("playwright", "1.63.0", "python"),
                    ("bun", "1.4.3", "runtime"),
                ],
            )

    def test_exact_constraints_still_use_locked_versions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_project(root, ["ruff==0.17.0", "playwright==1.63.0"])
            self.assertIn(("ruff", "0.17.0", "python"), checker.dependency_items(root))

    def test_ambiguous_lock_versions_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_project(root, ["ruff>=0", "playwright>=1"])
            with (root / "uv.lock").open("a") as lock:
                lock.write('[[package]]\nname = "ruff"\nversion = "0.18.0"\n')
            with self.assertRaisesRegex(ValueError, "Expected one locked version for ruff"):
                checker.dependency_items(root)

    def test_missing_locked_dependency_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_project(root, ["ruff>=0", "playwright>=1"])
            lock = root / "uv.lock"
            lock.write_text(
                lock.read_text().replace('name = "ruff"\nversion', 'name = "other"\nversion')
            )
            with self.assertRaisesRegex(ValueError, "Expected one locked version for ruff"):
                checker.dependency_items(root)


if __name__ == "__main__":
    unittest.main()
