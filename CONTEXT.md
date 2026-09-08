# Endoscopic labeling product

Local desk for one labeler on endoscopic surgical Clips. A Clip’s source media is a JPEG folder or a video file. Labels still sit on **Frames** (`0..N-1`). Sitting chrome shows **one** of phase / class / triplet at a time (Task focus); the other two are a read-only summary. Disk may still hold several Task types on the same Frame. mask is not in this switch.

## Language

**Clip**:
A contiguous sequence of surgical Frames treated as one labeling unit. Source media is either a folder of JPEGs or one video file (`kind` in sitting YAML).
_Avoid_: case; treating the video file as the label store

**Frame**:
One position in a Clip, index `0..N-1`. JPEG: that file. Video: `round(currentTime × fps)` (container fps, else 25). Stem id applies to JPEG files. The desk plays a JPEG Clip through a lazy-transcoded mp4 cache, but the Frame index stays the JPEG file order.
_Avoid_: Image (when meaning a video position); seconds as the durable key

**Task type**:
A kind of label on a Clip. One Clip and one Frame may carry several Task types at once.
_Avoid_: annotation type, modality

**Assignment**:
The (Clip, Task type) pair handed to one labeler. One assignee at a time per pair; the assignee is the only one who edits that Task type's labels on that Clip while the item is in labeling — during Review the assigned reviewer may also edit. Reassignment and unassignment move the write permission only — labels stay on the Clip. Auto-assign balances by holding count.
_Avoid_: task (that is Task type); one assignee per Clip across all Task types; deleting labels on unassignment; labels belonging to the person (they belong to the Clip)

**Project**:
One study: the long-lived grouping a Clip belongs to (exactly one). Carries a hospital field and study name; scopes the enabled Vocab subset. One source media may be registered as separate Clips under different Projects — the Clip is the labeling unit, the media is shared read-only. Clips may carry extra free tags for cross-cutting filtering; tags never confer ownership or vocab.
_Avoid_: import batch (an informal grouping, not an entity); hospital as Clip ownership; one Clip in two Projects; tags deciding vocab or assignment

**Account**:
One person's login, created by the admin (name + password, changed by its owner). Carries stacked role flags — admin, reviewer, annotator — any combination. Roles gate what the Account may call; being the item's assignee gates whether a given write is theirs.
_Avoid_: Session (that is the mask working state); one role per person; self-signup; email recovery

**Review**:
The optional second phase of an Assignment: a reviewer other than the assignee inspects and may edit the labels. Submitting from labeling always lands the item in **Submitted** (labeled, unreviewed) — there is no skip-review branch at submit; the item is usable downstream from Submitted onward, and reviewed-by tells reviewed from unreviewed. States: Unassigned → Labeling → Submitted → Reviewing → Done; **Done** means reviewed-and-passed and is the only terminal state. A delivered flag (with timestamp, set by admin/reviewer) records that the item was taken for downstream use; it rides outside the state machine, and the item may still be reviewed afterwards. Reviewer assignment mirrors annotation assignment (manual or balanced auto); reject sends the item back to Labeling with one short note.
_Avoid_: a skip-review transition at submit; treating delivery as a workflow state; reading Done as covering unreviewed items; reviewer = assignee; frame-level authorship records (only item-level reviewed-by)

**Phase** (spoken **phase**):
One exclusive surgical step along a Clip. Canonical store: one Phase per Frame. The labeler may paint an interval. Names are a customizable list.
_Avoid_: class (stackable), step (procedure documents)

**Frame class** (spoken **class**):
A named flag on a Frame that can stack with others (tool present, `blurred`, …). Names are a customizable list. The labeler may paint one flag on or off across an interval; other flags on those Frames stay.
_Avoid_: Phase; CVS as its own task type

**Triplet** (spoken **triplet**):
A row on a Frame: instrument, verb, target. The desk-wide identity is that exact triple, not three independent name lists. Several *different* rows per Frame. One Frame holds at most one row per exact triple; submitting that triple again toggles the row off. Deleting a Vocab triple drops that row from every Clip. Renaming one cell of a Vocab triple rewrites every matching row, and is refused if a Frame would then hold two identical triples. The labeler may paint a row on or off across an interval; painting on skips a Frame that already holds that triple.
_Avoid_: action, relation; subject–verb–object as the column names; two identical triples on one Frame; instruments/verbs/targets as separate vocabs; a cartesian product of three lists

**Vocab name**:
An identity in the global Vocab registry, held as a stable id: a phase name, a class tag, or an exact triple. Lists start empty. Each Project enables a subset for its labelers; the labeler adds project-local candidates and only the admin writes the registry (including promoting candidates). Renaming by id applies to every Clip of every Project at once. Retiring a name is disabling it per Project or archiving it globally — existing labels stay; hard delete is only for zero-reference names. Typeahead words for a new triple come from triples that already exist.
_Avoid_: bare strings as the durable key; the labeler writing the registry; per-project spellings of one word; hard-deleting a referenced name; built-in seed names the labeler cannot remove; changing only the picker while leaving old strings on disk; treating a class-tag `grasper` as the same identity as a word inside a triple; independent instrument/verb/target lists; orphan Frame strings

**mask**:
Pixel silhouette on a Track-on-Frame. Predict writes this Frame only. Propagate (SAM 3.1) fills other Frames. Propagate does not write phase, class, or triplet.
_Avoid_: using Annotation as a name for phase/class/triplet

**Track**:
One object identity across Frames in a Clip. Used by mask only.

**Track-on-Frame**:
One Track’s pixel mask on one Frame.

**Session**:
Live **mask** working state (prompts, Tracks, SAM / Scribble memory). At most one. Opens when mask Predict / Propagate actually runs. Phase, class, and triplet do not need a Session.
_Avoid_: requiring a Session to edit phase/class/triplet

**Annotation**:
Disk store of mask silhouettes only (`data/mask/`). Not an umbrella word.

**Frame Pool**:
Read-only source media (JPEG Clip folders and video files). This service never writes into the pool. Transcoded JPEG caches live outside it (`data/video-cache/`).

**Ruler**:
The always-present unlabeled seek track directly under the picture. Not a label lane. An empty Clip has only this track.
_Avoid_: progress bar; MediaTimeRange; treating an unlabeled dim lane as the seek

**Playhead**:
The cursor on the Ruler showing the current Frame. Draggable on the Ruler only, frame-snapped. A display-only stem may cross label lanes; interval bars are not draggable.
_Avoid_: cursor (text caret); using Playhead to mean the Frame index itself; dragging Playhead on interval bars

**Task focus**:
Which of phase / class / triplet the right rail is editing. One at a time. The other two show as a read-only summary on this Frame. Disk is unchanged: several Task types may exist on the same Frame. mask is not a focus tab.
_Avoid_: hiding another kind’s stored labels; exclusive stores; using focus to mean Session

**Editor Card**:
A bounded panel in the right rail (one for **Now**, one for **Library**) with a subtle surface background, hairline border, and header count badge.
_Avoid_: bare unbordered text headings with plain `<hr>` dividers

**Library Selection**:
The visual state of a Library row when its identity is present on the current Frame: a soft semantic-tint background, subtle border, and a checkmark (`✓`) indicator.
_Avoid_: aggressive indigo stripe / scale rings; unselected-indistinguishable dark fills

**Triplet Grid**:
The structured three-column table for exact triples (instrument, verb, target) with vertical hairline dividers (`divide-x`) between cells, supporting inline editing inside each cell.
_Avoid_: unseparated text columns running together without grid lines
