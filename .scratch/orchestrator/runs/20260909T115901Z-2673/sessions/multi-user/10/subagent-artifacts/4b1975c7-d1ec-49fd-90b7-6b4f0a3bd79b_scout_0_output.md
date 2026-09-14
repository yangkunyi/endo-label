# Test run report

Worktree: `/data3/yky/endo_label/worktrees/multi-user-10-project-and-clip-registration`

Interpreter: `/data3/yky/endo_label/.venv/bin/python` (worktree has no `.venv`; system `python3` has no pytest).

No files were modified.

## 1. `python -m pytest tests/test_projects.py -q --tb=short`

Result: **1 failed, 4 passed**, 1 warning, ~1.87s

### FAILED `tests/test_projects.py::test_yaml_projects_register_when_sitting_starts`

Assertion / exception:

```
tests/test_projects.py:99: in test_yaml_projects_register_when_sitting_starts
    yaml_path = _bare_yaml(
tests/test_projects.py:25: in _bare_yaml
    frames.mkdir()
.../pathlib/_local.py:722: in mkdir
    os.mkdir(self, mode)
E   FileExistsError: [Errno 17] File exists: '/tmp/pytest-of-yky/pytest-575/test_yaml_projects_register_wh0/frames'
```

Cause: the test first calls `_jpeg_clip(tmp_path / "frames", "YAMLCASE")`, which creates `tmp_path/frames`. Then `_bare_yaml(tmp_path)` does `frames.mkdir()` without `exist_ok=True`.

Reproduced in isolation (`pytest-577`): same `FileExistsError`.

Warning (both suites):

```
StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
```

## 2. `python -m pytest tests/test_auth.py tests/test_sitting_config.py tests/test_compose.py tests/test_sitting_desk.py tests/test_transcode.py -q --tb=line`

Result: **5 failed, 114 passed, 1 skipped**, 1 warning, ~44.79s

All five failures are `assert 404 == 200` on write endpoints after `create_app(settings)` with `clip_allowlist=("CLIPA",)` (no project/clip registry). `--tb=line` did not print a full Python traceback stack; only the assertion line.

### FAILED `tests/test_compose.py::test_class_span_is_durable_across_app_instances`

```
E   assert 404 == 200
     +  where 404 = <Response [404 Not Found]>.status_code
tests/test_compose.py:739: assert 404 == 200
```

Site: `first.post("/api/class/CLIPA/span", json={"tag": "blurred", "from": 0, "to": 1, "on": True})` then `assert painted.status_code == 200`.

### FAILED `tests/test_compose.py::test_triplet_span_is_durable_across_app_instances`

```
E   assert 404 == 200
     +  where 404 = <Response [404 Not Found]>.status_code
tests/test_compose.py:906: assert 404 == 200
```

Site: `first.post("/api/triplet/CLIPA/span", ...)` then `assert painted.status_code == 200`.

### FAILED `tests/test_compose.py::test_class_survives_new_app_instance`

```
E   assert 404 == 200
     +  where 404 = <Response [404 Not Found]>.status_code
tests/test_compose.py:1014: assert 404 == 200
```

Site: `first.put("/api/class/CLIPA/frames/0", json={"tags": ["grasper", "blurred"]})` then `assert put.status_code == 200`.

### FAILED `tests/test_compose.py::test_triplet_survives_new_app_instance`

```
E   assert 404 == 200
     +  where 404 = <Response [404 Not Found]>.status_code
tests/test_compose.py:1365: assert 404 == 200
```

Site: `first.post("/api/triplet/CLIPA/frames/0", json={...})` then `assert added.status_code == 200`.

### FAILED `tests/test_compose.py::test_phase_survives_new_app_instance`

```
E   assert 404 == 200
     +  where 404 = <Response [404 Not Found]>.status_code
tests/test_compose.py:1405: assert 404 == 200
```

Site: `first.post("/api/phase/CLIPA/span", json={"phase": "Preparation", "from": 0, "to": 1})` then `assert painted.status_code == 200`.

`test_auth.py`, `test_sitting_config.py`, `test_sitting_desk.py`, `test_transcode.py`: no failures in this invocation.

## Summary

Not everything passed. **6 failures total** across the two invocations (1 in `test_projects.py`, 5 in `test_compose.py`).