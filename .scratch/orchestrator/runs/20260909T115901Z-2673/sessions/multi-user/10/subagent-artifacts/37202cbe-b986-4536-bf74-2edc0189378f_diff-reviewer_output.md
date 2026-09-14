### Documented-Standard Breaches
None. Repo lacks `CODING_STANDARDS.md` / `CONTRIBUTING.md`.

---

### Baseline Smells

#### 1. `endo_label/__main__.py`
- **Duplicated Code (Hard)**:
  `_load_sitting` added at line 104 for `_create_project` and `_register_clip`, but lines 55–59 (`main`) and lines 81–85 (`_create_admin`) retain identical duplicated logic:
  ```python
  try:
      settings = load_settings(args.config)
  except ConfigError as exc:
      print(str(exc), file=sys.stderr)
      raise SystemExit(1) from exc
  ```
- **Repeated Switches (Judgement — Repo Pattern)**:
  ```python
  if argv and argv[0] == "create-project":
      _create_project(argv[1:])
  ```
  Follows ticket-09 `create-admin` pattern; subparsers preferred.

#### 2. `endo_label/coordination.py`
- **Feature Envy & Primitive Obsession (Judgement)**:
  ```python
  def projects_payload(path: Path) -> list[dict]:
      ...
      return [{"id": project.id, "name": project.name, "hospital": project.hospital, "clips": ...}]
  ```
  Assembles raw HTTP JSON dicts inside SQLite coordination module. In ticket-09 pattern, `coordination.py` returns domain dataclasses (`Account`), while presentation serialization (`_me()`) lives in `auth.py`.
- **Divergent Change (Judgement)**:
  `apply_config_registrations(settings: Settings)` couples persistence store to `Settings` and config-spec hierarchy.

#### 3. `endo_label/projects_router.py`
- **Middle Man (Judgement)**:
  ```python
  @router.get("/api/projects")
  def get_projects(request: Request) -> dict:
      return {"projects": projects_payload(db_path(request.app.state.settings))}
  ```
  Router is thin pass-through because serialization leaked into `coordination.projects_payload`.

#### 4. `endo_label/config.py` & `endo_label/catalog.py`
- **Speculative Generality / Zombie Fields (Judgement)**:
  `load_settings` maintains resolution for `clip_allowlist` and `Settings.clips`, but `catalog.clip_entries` now exclusively queries SQLite:
  ```python
  return tuple(
      ClipEntry(id=row.id, kind=row.kind, path=row.path)
      for row in list_registered_clips(db_path(settings))
  )
  ```
  Runtime ignores `settings.clips` and `settings.clip_allowlist`.

#### 5. `tests/test_projects.py`
- **Mysterious Name / Domain Vocab (Judgement)**:
  ```python
  media = _jpeg_clip(tmp_path / "frames", "CASE01")
  ...
  media = _jpeg_clip(tmp_path / "frames", "YAMLCASE")
  ```
  CONTEXT.md explicitly forbids "case" under Clip (*"Avoid: case; treating the video file as the label store"*). Test fixture IDs use `CASE01` and `YAMLCASE`.