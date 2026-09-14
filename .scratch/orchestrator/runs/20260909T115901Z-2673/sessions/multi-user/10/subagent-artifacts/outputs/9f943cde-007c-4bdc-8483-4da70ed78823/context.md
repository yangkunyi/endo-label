# Code Context

## Files Retrieved
1. `tests/test_compose.py` (lines 1955-1990) - failing test `test_vocab_triple_migrate_once_keeps_plus_row` uses `seed_admin(second_settings)` which is not defined.

## Key Code
```python
seed_admin(second_settings)
second = TestClient(create_app(second_settings))
login(second)
```
`/data3/yky/endo_label/worktrees/multi-user-10-project-and-clip-registration/tests/test_compose.py:1977`

Error: `NameError: name 'seed_admin' is not defined`

## Architecture
Targeted durability/project tests all pass. Full suite has one NameError in compose vocab migration test.

## Start Here
`tests/test_compose.py` around line 1977 — define or import `seed_admin` (or replace with existing fixture pattern used by other durability tests).

## Pytest results

### Command 1 (targeted)
```
/data3/yky/endo_label/.venv/bin/python -m pytest tests/test_projects.py tests/test_compose.py::test_class_span_is_durable_across_app_instances tests/test_compose.py::test_triplet_span_is_durable_across_app_instances tests/test_compose.py::test_class_survives_new_app_instance tests/test_compose.py::test_triplet_survives_new_app_instance tests/test_compose.py::test_phase_survives_new_app_instance -q --tb=short
```
**10 passed**, 1 warning, 5.11s. **PASS**

### Command 2 (full suite)
```
/data3/yky/endo_label/.venv/bin/python -m pytest tests -q --tb=line
```
Timeout 180s. **1 failed, 160 passed, 1 skipped**, 1 warning, 61.56s.

**Remaining failure:** `tests/test_compose.py::test_vocab_triple_migrate_once_keeps_plus_row`

Diff / traceback:
```
E   NameError: name 'seed_admin' is not defined
/data3/yky/endo_label/worktrees/multi-user-10-project-and-clip-registration/tests/test_compose.py:1977: NameError: name 'seed_admin' is not defined
```

No assertion mismatch; test crashes before asserts on second app instance vocab triples.
