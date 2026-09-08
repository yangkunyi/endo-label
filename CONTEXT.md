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
A desk-wide identity: a phase name, a class tag, or an exact triple. Lists start empty; the labeler adds. Renaming or deleting a phase, class tag, or exact triple rewrites every Clip of that kind (delete clears that phase, drops that flag, or drops that triplet row). Typeahead words for a new triple come from triples that already exist.
_Avoid_: built-in seed names the labeler cannot remove; changing only the picker while leaving old strings on disk; treating a class-tag `grasper` as the same identity as a word inside a triple; independent instrument/verb/target lists; orphan Frame strings

**mask**:
Pixel silhouette on a Track-on-Frame. Predict writes this Frame only. Propagate (SAM 3.1) fills other Frames. Propagate does not write phase, class, or triplet.
_Avoid_: using Annotation as a name for phase/class/triplet

**Track**:
One object identity across Frames in a Clip. Used by mask only. Optional **Track Label**.
_Avoid_: Object (ambiguous with class)

**Track Label**:
Editable display name on a Track (`track-N` until set).
_Avoid_: Class (the Frame class list) until that identity is decided

**Active Track**:
The Track that later Geometric Prompts and Scribble Prompts on this Frame apply to. When set, Predict refines it. When none is set, a positive prompt may create a Track.
_Avoid_: Selected object, current instance, focused track, Task focus

**Track-on-Frame**:
One Track’s pixel mask on one Frame, plus its Source. Live address is track id and frame index.
_Avoid_: Instance (ambiguous), label row, overlay

**Geometric Prompt**:
A point on a Frame, positive or negative, used to select or refine a Track. Click, not drag.
_Avoid_: Scribble Prompt, box (not a desk Geometric Prompt)

**Scribble Prompt**:
A positive or negative open stroke on a Frame, used to create or refine a complete Track-on-Frame mask. A positive stroke may create a Track; a negative stroke alone may not. Same tool as Geometric Prompt: drag, not click.
_Avoid_: Edge Scribble, brush, polygon, thin Mask Prior strip; a separate Scribble mode

**Scribble Model**:
The per-Frame segmentation model that turns Scribble Prompts into a complete pixel mask. It does not own Tracks, Annotations, or Propagate.
_Avoid_: Brush engine, SAM 3.1 stroke input

**Mask Handoff**:
Passing the Scribble Model's complete pixel mask to SAM 3.1 for the same Track-on-Frame. It is not pixel union/intersection and must not reduce the mask to a box.
_Avoid_: Merge (ambiguous), mask fusion, box handoff

**Predict**:
Running the applicable segmentation path on the current Frame only. Geometric and Scribble Prompts may use different model paths but produce the same Track-on-Frame form. Does not write other Frames.
_Avoid_: Infer, segment (when meaning the button action), round (when meaning one Predict)

**Geometric Memory**:
The Session-owned leftover point Geometric Prompts for one Track on one Frame that still condition later Geometric Predicts, always with the current Mask Prior. Not stored in Annotation.
_Avoid_: click memory, dot memory, SAM 3.1 session memory, Scribble Memory, Undo

**Scribble Memory**:
The Scribble Model's per Session, Track, and Frame correction state. After any successful Predict that writes this Track-on-Frame, mask-memory is re-initialized from the final SAM 3.1 silhouette, and accumulated stroke ink is kept.
_Avoid_: SAM 3.1 session memory, accumulated scribble, Geometric Memory

**Undo**:
A Session action that restores this Frame's Track-on-Frame (silhouette, Source), Geometric Memory, and Scribble Memory from immediately before the last undoable committed edit: a successful Predict, a leftover-point delete, or Clear mask. Distinct from leftover-point delete, which re-Predicts remaining pins plus Mask Prior. Same lifetime as Geometric Memory; not stored in Annotation. There is no Redo.
_Avoid_: leftover delete, pending clear, fail-rollback, history, Redo

**Mask Prior**:
A complete Track-on-Frame silhouette used as conditioning for further Predict or as a Seed for Propagate. A Scribble Prompt is not a Mask Prior; the Scribble Model's complete output may become one through Mask Handoff.
_Avoid_: Mask upload, Scribble Prompt, thin stroke raster

**Propagate**:
Extending existing Track seeds along the Clip in time (forward, backward, or both), within an optional frame range. Explicit user action, not automatic after every Predict. Does not write phase, class, or triplet.
_Avoid_: Track (verb), auto-label, propagation

**Propagate Job**:
An asynchronous run of Propagate for the current Session, with progress the UI can poll. Distinct from the Session itself.
_Avoid_: Task (ambiguous with human work items)

**Seed**:
The Frame(s) and prompts or masks that condition Propagate for a Track.
_Avoid_: Keyframe (unless UI label only), anchor

**Source** (of a mask on a Frame):
How that mask was produced: `manual` (human seed work), `refined` (human edited after model), or `propagated` (model-only temporal fill).
_Avoid_: Status; using Source for phase/class/triplet

**Protected Mask**:
A Track-on-Frame that Propagate must not overwrite: Source is `manual` or `refined`.
_Avoid_: Locked (UI-only), frozen track

**Session**:
Live **mask** working state (prompts, Tracks, SAM / Scribble memory, Geometric Memory). At most one. Opens when mask Predict / Propagate actually runs. Phase, class, and triplet do not need a Session.
_Avoid_: requiring a Session to edit phase/class/triplet

**Annotation**:
Disk store of mask silhouettes only (`data/mask/`). Not an umbrella word.

**Frame Pool**:
Read-only source media (JPEG Clip folders and video files). This service never writes into the pool. Transcoded JPEG caches live outside it (`data/video-cache/`).

**Ruler**:
The always-present unlabeled seek track directly under the picture. Not a label lane. An empty Clip has only this track.
_Avoid_: progress bar; MediaTimeRange; treating an unlabeled dim lane as the seek

**Playhead**:
The cursor on the Ruler showing the current Frame. Draggable on the Ruler only, frame-snapped. A display-only stem may cross label lanes; interval bars are not draggable. Play/pause is Space, the player button, or the Ruler — not a click on the picture. Picture clicks are Geometric Prompts or Scribble Prompts.
_Avoid_: cursor (text caret); using Playhead to mean the Frame index itself; dragging Playhead on interval bars; click-to-play on the picture

**Task focus**:
Which of phase / class / triplet the right rail’s vocab editor is editing. One at a time. The other two show as a read-only summary on this Frame. Disk is unchanged: several Task types may exist on the same Frame. The Track list stays on this rail and scrolls with it. mask is not a focus tab.
_Avoid_: hiding another kind’s stored labels; exclusive stores; using focus to mean Session; hiding Tracks when the vocab editor changes

**Editor Card**:
A bounded panel in the right rail (one for **Now**, one for **Library**) with a subtle surface background, hairline border, and header count badge.
_Avoid_: bare unbordered text headings with plain `<hr>` dividers

**Library Selection**:
The visual state of a Library row when its identity is present on the current Frame: a soft semantic-tint background, subtle border, and a checkmark (`✓`) indicator.
_Avoid_: aggressive indigo stripe / scale rings; unselected-indistinguishable dark fills

**Triplet Grid**:
The structured three-column table for exact triples (instrument, verb, target) with vertical hairline dividers (`divide-x`) between cells, supporting inline editing inside each cell.
_Avoid_: unseparated text columns running together without grid lines
