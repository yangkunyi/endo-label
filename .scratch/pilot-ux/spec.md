# Pilot UX: what the local multi-user trial surfaced

The multi-user product is laid out locally (`.runtime/sitting-pilot.yaml`, admin `boss`, real
SAM 3.1 + real scribble, four real CASE Clips) and is being driven by hand. This feature collects
what the trial actually produced: two grilling rounds with the product owner, the decisions they
settled, and the tickets that carry them.

Ticket statuses here are hand-delivered (`MERGED`) or `ready-for-agent`; this feature is not run
through the Archon drain.

## Decisions

Reads stay open to every Account; **writes stay gated by Assignment**. The trial confirmed the
gate is right and that the *message* was the defect (a bare `Forbidden` reads as a bug) — see 04.

| # | Decision | Rejected |
|---|----------|----------|
| D1 | A mouse click on a desk control releases focus (`pointerup` → `blur()`); a focused button must not be re-fired by Enter | Blurring every key target; capture-phase Space/Enter that breaks Tab users |
| D2 | `[`/`]` act even from inside a Vocab field (brackets never belong to a name); `i`/`o` stay suppressed while typing | Treating every field as shortcut-dead; letting `i`/`o` fire mid-word |
| D3 | An empty Brush answers `[`/`]` with a notice instead of silence | Making `[` fall back to the Frame's identities |
| D4 | The Ruler shows how far the Playhead has come, and the transport row sits above it (picture → transport → Ruler → Lanes) | Leaving the Ruler a bare hairline; putting the Ruler under the Lane well |
| D5 | Coverage is per Task type: the focused phase/class/triplet editor shows *its* coverage; mask is **not** in that strip and gets its own row | One merged strip for all four; a single "progress" number for the Clip |
| D6 | Coverage means "this Frame carries at least one identity of this Task type". There is no explicit "checked, nothing here" record | Adding a Frame-level `cleared` bit (a store change; deferred, see ADR) |
| D7 | Coverage is decoration plus click-to-jump. No drag-select on it | Drag-select (fights Ruler seek and Lane bar selection) |
| D8 | `n` jumps to the next unlabeled Frame of the focused Task type; Submit warns but never blocks | Blocking Submit on coverage |
| D9 | Non-admin Accounts see only Clips where they hold an Assignment (enforced server-side, no switch); admin defaults to "assigned to me" with a toggle for all | Client-side hiding; giving annotators an all-seeing toggle |
| D10 | "mine" means assignee **or** reviewer, any state | Assignee only; excluding terminal states |
| D11 | A Project's members are explicit (`project_members`), not derived from past assignments; assignment outside membership is refused | Deriving membership from assignment history; no membership at all |
| D12 | Batch assignment is item-first or account-first, whichever is quicker; spread-across-accounts stays the `auto-assign` path | Forcing one order |

## Glossary additions (see `CONTEXT.md`)

**Coverage Strip**, **Unlabeled gap**, **Track lane**, **Project membership**.

## Out of scope (deliberately)

- A "cleared / nothing here" Frame record (D6) and any completion-percentage notion.
- Admin as a super-writer, and claim-on-first-write (rejected in round 1).
- Cross-Project batch assignment.

## Tickets

| # | Title | Status |
|---|-------|--------|
| 01 | Track delete control | MERGED (`8d55638`) |
| 02 | Desk focus, span keys, empty Brush | MERGED (`e7287f2`) |
| 03 | Ruler progress and the transport above it | MERGED (`e7287f2`) |
| 04 | A refused write explains itself | MERGED (`d4f3311`) |
| 05 | Coverage Strip for the focused Task type | ready-for-agent |
| 06 | Mask coverage: its own row and Track lanes | ready-for-agent |
| 07 | Unlabeled jumps and the Submit hint | ready-for-agent |
| 08 | Clips: scope and filters | ready-for-agent |
| 09 | Project membership | ready-for-agent |
| 10 | Batch assign bar | ready-for-agent (Blocked by 09) |
| 11 | Domain docs for these decisions | ready-for-agent |
| 12 | Test gaps from this feature | ready-for-agent |
