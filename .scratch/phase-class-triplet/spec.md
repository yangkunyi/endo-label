Status: resolved

# Spec: phase, class, and triplet on one Clip

Parent map: `.scratch/endo-label-product/map.md` (destination met). This spec is the three Task types that do not use a Session. mask / Track / SAM is a later spec.

## Problem Statement

A labeler sits with a surgical Clip (a folder of JPEG Frames) and must write three kinds of labels on the same Frames, in one sitting, without switching “modes”:

- **phase** — one exclusive surgical step on each Frame (paint a span of Frames at once).
- **class** — stackable named flags on a Frame (tool present, `blurred`, …).
- **triplet** — zero or more rows on a Frame, each instrument + verb + target. A row does not need a Track.

Today the HTTP stores exist and a throwaway HTML desk proved the shared shape. There is no product desk for these three, and writes do not yet refuse names that are not on the desk’s lists. The labeler still cannot do a real sitting for phase / class / triplet without GPU or a mask Session.

## Solution

A local one-labeler Vite SPA (`web/`) talking to the existing Python compose HTTP. Stack: ADR 0001.

The labeler picks an allowlisted Clip, scrubs Frames (JPEG from the Frame Pool, never written), and uses three editors that stay on screen together for the current Frame. Each successful write is stored immediately. No Session. No SAM. Name lists are one desk-wide vocab the labeler can extend. A write that uses a name not on the matching list is rejected.

The three stores stay independent: writing phase never changes class or triplet on that Frame, and the reverse. The same Frame may hold all three at once.

## User Stories

1. As a labeler, I want to open the desk without starting a Session or a GPU worker, so that a sitting that is only phase / class / triplet does not wait on SAM.
2. As a labeler, I want to see the allowlisted Clips and each Clip’s Frame count, so that I pick a real Clip from the Frame Pool rather than browsing the whole disk.
3. As a labeler, I want a missing or non-allowlisted Clip to fail clearly, so that I do not write labels against a folder the desk is not allowed to see.
4. As a labeler, I want to pick a Clip and see the JPEG for Frame index `0`, so that I know I am looking at the start of the Clip.
5. As a labeler, I want to scrub to any Frame index `0..N-1` and see that Frame’s JPEG, so that I can walk the Clip without writing anything.
6. As a labeler, I want scrubbing to leave phase, class, and triplet unchanged, so that moving along the Clip is not a save.
7. As a labeler, I want the current Frame highlighted on a filmstrip, so that I know which index I am editing.
8. As a labeler, I want the three editors (phase, class, triplet) visible together on the current Frame, so that I do not switch a Task-focus mode to use the next kind.
9. As a labeler, I want to ignore any editor I am not using in this sitting, so that a phase-only pass is still the same desk.
10. As a labeler, I want each successful write persisted immediately, so that a process restart does not drop work I already confirmed.
11. As a labeler, I want a Clip I have never labeled to load with no phase, no class flags, and no triplet rows, so that empty is the starting state.
12. As a labeler, I want labels on Clip A to stay off Clip B, so that two Clips never share a store.
13. As a labeler, I want the Frame Pool JPEGs to stay read-only, so that labeling never rewrites the source frames.
14. As a labeler, I want a health check that succeeds with no Session and no GPU, so that I know the labels-only desk is up.

### phase

15. As a labeler, I want to paint a phase name on an inclusive span of Frames (`from` and `to`), so that I do not click every Frame in a surgical step.
16. As a labeler, I want `from` and `to` accepted in either order, so that dragging backward still writes the same span.
17. As a labeler, I want a span with `from = to` to write exactly that one Frame, so that a single-Frame fix uses the same gesture.
18. As a labeler, I want every Frame in the span to receive that one phase name, so that the durable form is still one exclusive Phase per Frame.
19. As a labeler, I want a later span that overlaps an earlier one to overwrite those Frames, so that a correction replaces the old phase rather than stacking.
20. As a labeler, I want Frames outside the span to keep whatever phase they already had, so that a local correction does not blank the rest of the Clip.
21. As a labeler, I want at most one phase name on a Frame (or none), so that phase never stacks the way class does.
22. As a labeler, I want to clear phase on the current Frame only, so that I can mark a Frame unlabeled without wiping the span around it.
23. As a labeler, I want a Frame with no phase to show as unlabeled, so that I can see gaps in the Clip.
24. As a labeler, I want a span that steps outside `0..N-1` to be rejected, so that I cannot write a phase onto a Frame that does not exist.
25. As a labeler, I want a phase name that is not on the desk’s phase list to be rejected, so that I cannot invent a spelling that will not appear in the picker.
26. As a labeler, I want to add a new phase name to the desk list, then paint it, so that the list is not locked to a public dataset.
27. As a labeler, I want adding a phase name that is already on the list to be rejected, so that I do not get duplicates in the picker.
28. As a labeler, I want a blank or whitespace-only phase name to be rejected, so that the list stays usable.
29. As a labeler, I want the filmstrip to show each Frame’s current phase (or empty), so that I can see the exclusive strip along the Clip.
30. As a labeler, I want painting a phase span to leave class flags and triplet rows on those Frames untouched, so that phase is not a wipe of the other two.

### class

31. As a labeler, I want to turn a class name on for the current Frame, so that I can flag tool presence or `blurred` on that Frame.
32. As a labeler, I want to turn a class name off for the current Frame, so that a mistaken flag is removable.
33. As a labeler, I want several class names on at once on one Frame (for example `grasper` and `blurred`), so that class stays stackable.
34. As a labeler, I want the same class name at most once on a Frame, so that toggling twice does not duplicate the flag.
35. As a labeler, I want a Frame with every flag off to store as unlabeled for class, so that empty is absence, not a sentinel.
36. As a labeler, I want class flags on Frame `i` not to copy to Frame `i+1` by themselves, so that class is not a span paint and not a Propagate.
37. As a labeler, I want a class name that is not on the desk’s class list to be rejected, so that flags stay on the list I edit.
38. As a labeler, I want to add a new class name (for example `smoke`) to the desk list, then turn it on, so that the list can grow during a sitting.
39. As a labeler, I want adding a class name that is already on the list to be rejected, so that the chip row stays unique.
40. As a labeler, I want toggling class on the current Frame to leave that Frame’s phase and triplet rows untouched.
41. As a labeler, I want to see which class names are on for the current Frame without opening another panel, so that the stack is visible next to the JPEG.

### triplet

42. As a labeler, I want to add a triplet row on the current Frame by picking instrument, verb, and target, so that I can record one ⟨instrument, verb, target⟩ without drawing a mask.
43. As a labeler, I want several triplet rows on the same Frame, so that more than one action can be true at once.
44. As a labeler, I want two rows with the same three names to be allowed, so that two instances of the same action are not collapsed.
45. As a labeler, I want a triplet row to have no Track id, so that I am not forced to create mask identity to record the row.
46. As a labeler, I want each row on a Frame to have a stable id among the rows currently on that Frame, so that I can delete one row without naming it by position only.
47. As a labeler, I want to delete one triplet row on the current Frame by its id, so that a bad row is removable.
48. As a labeler, I want deleting the last row on a Frame to leave that Frame with no triplet list, so that empty is absence.
49. As a labeler, I want adding or deleting a triplet row to leave that Frame’s phase and class untouched.
50. As a labeler, I want a triplet row whose instrument, verb, or target is not on the matching desk list to be rejected, so that rows cannot drift off the pickers.
51. As a labeler, I want to add a new instrument, verb, or target name to the matching list, then use it in a row, so that those three lists are customizable like phase and class.
52. As a labeler, I want adding a duplicate name on instruments, verbs, or targets to be rejected.
53. As a labeler, I want triplet rows on Frame `i` not to appear on Frame `i+1` unless I add them there, so that there is no temporal fill for triplet.
54. As a labeler, I want to see the current Frame’s triplet rows as a list I can delete from, so that I can audit what I just wrote.

### vocab and shared desk

55. As a labeler, I want one phase list, one class list, and one instruments / verbs / targets trio for the whole desk, so that Clip B’s pickers match Clip A’s.
56. As a labeler, I want the seed names to load when no custom list has been saved yet, so that a first sitting has something to pick (examples, not a Cholec lock).
57. As a labeler, I want GET of the vocab to work without picking a Clip, so that the pickers can fill before a Clip is open.
58. As a labeler, I want names I add to survive a process restart, so that custom vocab is as durable as the Frame labels.
59. As a labeler, I want the desk copy to say phase, class, and triplet — not “Annotation” — so that those three are not confused with the mask disk store.
60. As a labeler, I want to write all three kinds on the same current Frame in one sitting (phase span that covers it, class flags, triplet rows), so that the shared address is Frame index for all three.
61. As a labeler, I want a Frame index below `0` or at or past `N` to be rejected when writing, so that I cannot address a Frame the catalog does not have.
62. As an operator, I want only `CLIP_ALLOWLIST` Clips to appear, so that other folders under the Frame Pool stay invisible.
63. As an operator, I want these three backends to run with the mask backend composed in or left unused, so that a labels-only sitting does not have to delete mask from the process.

## Implementation Decisions

- **Seam:** the compose HTTP is the product interface for this spec. Callers and tests use phase / class / triplet / vocab routes plus the shared Clip catalog (Clip list, Clip meta, Frame JPEG). They do not open a Session.
- **Process (ADR 0002).** Bind `127.0.0.1:7880` by default (`--port` overrides; Playwright uses 7881), no auth. One uvicorn worker, no JSON flock. CORS: Vite `5173` origins only. Empty clip allowlist → no Clips. One compose app (fake predictor idle). Sitting: serve `web/dist` at `/`; unknown GET → `index.html`; `/api/*` unchanged. Dev without `dist` is fine. After desk source changes, rebuild `web/dist` or sitting still serves the old JS/CSS. Repo-root `config.yaml` is local (gitignored); missing file still refuses to start.
- **Config (ADR 0003).** Sitting reads repo-root `config.yaml` or `--config path`. No env (`FRAMES_ROOT`, `CLIP_ALLOWLIST`, …). Missing file: refuse to start. Tests construct `Settings` in memory.
- **Three sibling backends.** Each Task type has its own store and its own HTTP. They compose on one process. They do not share a live working state. Session stays mask-only and stays inactive for every story above.
- **Catalog is shared, read-only Frame Pool.** Clip must be on the allowlist. Frame index is `0..N-1` with a stable stem. JPEG bytes come from the pool. These three backends never write into the pool.
- **Durable form is per Frame, keyed by Frame index as a string.** Missing key means unlabeled for that kind. Independent documents per Clip per kind:
  - phase: `{ "clip_id", "frames": { "<i>": "<phase name>" } }` — one string, or key absent.
  - class: `{ "clip_id", "frames": { "<i>": ["<name>", ...] } }` — unique names, or key absent when the list would be empty.
  - triplet: `{ "clip_id", "frames": { "<i>": [ { "id", "instrument", "verb", "target" }, ... ] } }` — or key absent when the list would be empty. No Track field.
- **Immediate persist.** Each successful write replaces that kind’s Clip document on disk. There is no draft, no snapshot, and no “save Session” for these three (those gestures in the throwaway HTML were Session-shaped and do not apply here).
- **phase span.** `POST` with `phase`, `from`, `to`. Inclusive both ends. If `from > to`, swap. Reject when the normalized span is outside `0..N-1`. Overwrite every Frame in the span with that name. Single-Frame write and clear remain a `PUT` on one Frame (`phase: null` clears).
- **class write** replaces the set for that Frame. The desk UI toggles by read-modify-write: load current tags, add or remove one name, PUT the new list. Empty list clears the Frame key. Server de-duplicates while keeping first-seen order.
- **triplet write** is add-row and delete-by-id. No in-place edit of a row (delete + add). `id` is an integer unique among **current** rows on that Frame; next id is `max(existing ids)+1` or `1` if none. After deleting the current max, that integer may be reused. Duplicate ⟨instrument, verb, target⟩ rows are allowed.
- **Desk-wide vocab** (map default, locked here). One document for the desk, not per Clip and not per operator. Lists: `phases`, `class_tags`, `instruments`, `verbs`, `targets`. Seed lists are cholecystectomy-shaped examples only; they are not a public-dataset lock. Add-name: strip whitespace, reject empty, reject unknown list, reject a name already in that list. No delete and no rename in this spec (later: those need a rule for Frames that still hold the old name).
- **Vocab membership on write.** phase name, each class tag, and each of instrument / verb / target must already be on the matching list. Otherwise reject (client error). Clear / empty writes do not need a name. This is a contract the current HTTP is missing and must grow.
- **Independence invariant.** A write to one kind loads and saves only that kind’s Clip document. It does not read or write the other two stores. It does not call Predict, Propagate, or Session save.
- **Desk UI (ADR 0001).** New Vite SPA at `web/` — React, TypeScript, Tailwind only (no shadcn), SWR, Zustand, React Router, npm. Do not copy the old `video_label_service/web` sources.
  - Routes: `/` Clip list; `/clips/:clipId` desk. Current Frame index lives in Zustand (scrub does not write history).
  - Dev: Vite `:5173`, proxy `/api` → FastAPI `:7880` (override proxy target with `ENDO_LABEL_API` for Playwright’s Vite `:5174`). Sitting: `vite build`; FastAPI serves `web/dist` (one process).
  - Page: filmstrip + current JPEG + three editor panels always shown. Phase: name picker, from/to, write span, clear this Frame, add phase name. class: one chip per class name, click toggles, add class name. triplet: three pickers, add row, list with delete, add names to the three lists. No Task-focus switch. No “Open Session” to edit these three. mask tools are omitted on this page; a later spec may add them beside these panels, not behind a mode.
- **Throwaway HTML** (`four-task-desk.html`) is the primary source for gestures (span overwrite, class toggle, triplet rows without Track). It is not the product. Its Session open/save/load and Fake Predict/Propagate are not part of this spec.
- **Words.** UI and HTTP speak phase, class, triplet. **Annotation** remains the mask disk store. Do not add a Track field “for later.”

## Testing Decisions

- **Good test:** drive the compose HTTP (and, if present, the desk as a client of that HTTP). Assert status codes and response bodies the labeler would see. Do not assert JSON file layout, module names, or in-memory maps. Do not start a Session to prove these stories. Do not use a GPU.
- **Seam:** one compose app, TestClient, temporary Frame Pool (tiny JPEG files) and temporary labels root. Prior art: the existing compose tests that already paint a phase span, PUT class tags, POST a triplet row, add a vocab name, and assert Session stays inactive on the same Frame.
- **Must cover beyond current tests:**
  - Vocab membership rejection for phase, class, and triplet.
  - Span overwrite, `from > to` swap, single-Frame span, span out of range, clear this Frame only.
  - class unique tags, empty list clears, flags do not copy to the next Frame.
  - Several triplet rows, delete one, delete last, no Track field in the row.
  - Independence: after mixed writes, GET of each kind shows only that kind’s data.
  - Persistence: new app instance on the same labels root still returns the writes.
  - Unknown Clip / Frame index errors.
  - Duplicate vocab name rejected; custom name then usable on a write.
- **Do not test:** mask Predict/Propagate, Protected Mask, review, export, Triplet→Track, per-Clip vocab, vocab delete.
- **Config tests:** sitting entry refuses to start with no yaml; `--config` temp file loads allowlist/roots. HTTP tests keep injecting `Settings` (no yaml required).
- **Desk page:** Vitest covers pure front logic (URL → Clip id, Frame index in Zustand, toggle math). Product HTTP behaviour stays on compose TestClient.
- **Local Playwright (not CI).** `cd web && npm run test:e2e` drives Chromium against isolated FastAPI `127.0.0.1:7881` (`--config web/e2e/config.yaml`, labels under `web/e2e/.work/`) and Vite `5174`. It does not use sitting `:7880` or the operator Frame Pool. `npm run test:e2e:ui` opens the runner. Needs repo `.venv` (FastAPI). Uses system Google Chrome (`channel: "chrome"`). `npx playwright install chromium` only if Chrome is missing. No Playwright in pytest CI / GitHub Actions.

## Out of Scope

- mask, Track, Track-on-Frame, Session, Predict, Propagate, Scribble, Concept Prompt, Geometric Prompt, Protected Mask, the Annotation store.
- A Task-focus switch, or bolting these three into Session.
- Export / interchange formats (later).
- Review rules for non-mask records (later).
- Pointing a triplet row at a Track (later; not required).
- Per-Clip or per-operator vocab (this spec is desk-wide). Per-labeler vocab is later (ADR 0004).
- Vocab delete / rename.
- Logins, clip assignments, concurrent Predict / a second Session (ADR 0004).
- Multi-user ops, live OR, training models, CVAT / Label Studio as the primary UI.
- Env vars as sitting config (ADR 0003).
- Research extras as their own Task types (step, skill, CVS, keypoints, boxes, laparoscope motion). class may still include tags like `blurred`.
- Copying the old Vite desk or old `.scratch` feature piles.
- Next.js, a Go public API, shadcn/ui, TanStack Query as the desk data layer.
- Writing into `scribble_service` paths.

## Further Notes

- UI: [ADR 0001](../../docs/adr/0001-frontend-stack.md). Process: [ADR 0002](../../docs/adr/0002-local-fastapi-process.md). Config: [ADR 0003](../../docs/adr/0003-yaml-config.md). Multi-user: [ADR 0004](../../docs/adr/0004-multi-user-later.md). Canvas library waits for the mask spec.
- Map leftovers parked as **later** (not a new wayfinder): export, review for non-mask, triplet→Track, vocab delete/rename, logins / assignments / per-labeler vocab / concurrent Predict.
- Tickets 01–07 for this spec are resolved. Next product slice is a **mask** spec (`/to-spec` for mask / Track / SAM). Do not re-run `/to-tickets` or `/wayfinder` on this spec.
- A later mask spec must keep Session lazy and mask-only, and must keep all four editors usable on one Frame without a focus switch.
