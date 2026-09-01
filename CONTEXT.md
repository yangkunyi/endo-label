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
A row on a Frame: instrument, verb, target. Several *different* rows per Frame. One Frame holds at most one row per exact triple; submitting that triple again toggles the row off. Does not require a Track. Vocabularies are customizable lists. The labeler may paint one row on or off across an interval; painting on skips a Frame that already holds that triple.
_Avoid_: action, relation; subject–verb–object as the column names; two identical triples on one Frame

**Vocab name**:
A string on a desk-wide list (phases, class tags, instruments, verbs, targets). Lists start empty; the labeler adds names. Renaming or deleting a phase or class-tag name rewrites every Clip of that kind (delete clears that phase or drops that flag). Deleting an instrument, verb, or target name is refused while any triplet row still uses it.
_Avoid_: built-in seed names the labeler cannot remove; changing only the picker while leaving old strings on disk; treating a class-tag `grasper` as the same list as triplet instrument `grasper`

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

**Playhead**:
The cursor on the timeline showing the current Frame. Draggable to seek, frame-snapped. The timeline under the player carries it; interval bars are not draggable.
_Avoid_: cursor (text caret); using Playhead to mean the Frame index itself

**Task focus**:
Which of phase / class / triplet the right rail is editing. One at a time. The other two show as a read-only summary on this Frame. Disk is unchanged: several Task types may exist on the same Frame. mask is not a focus tab.
_Avoid_: hiding another kind’s stored labels; exclusive stores; using focus to mean Session
