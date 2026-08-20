# Endoscopic labeling product

Local desk for one labeler on endoscopic surgical Clips. Four Task types on the same Clip and the same Frame at once: **phase**, **class**, **triplet**, **mask**. No Task-focus switch.

## Language

**Clip**:
A contiguous sequence of surgical frames treated as one labeling unit (one folder of JPEGs).
_Avoid_: Video file (unless source media), case

**Frame**:
One image in a Clip, index `0..N-1` plus a stable stem id.
_Avoid_: Image (when meaning a video position)

**Task type**:
A kind of label on a Clip. One Clip and one Frame may carry several Task types at once.
_Avoid_: annotation type, modality

**Phase** (spoken **phase**):
One exclusive surgical step along a Clip. Canonical store: one Phase per Frame. The labeler may paint an interval. Names are a customizable list.
_Avoid_: class (stackable), step (procedure documents)

**Frame class** (spoken **class**):
A named flag on a Frame that can stack with others (tool present, `blurred`, …). Names are a customizable list.
_Avoid_: Phase; CVS as its own task type

**Triplet** (spoken **triplet**):
A row on a Frame: instrument, verb, target. Several rows per Frame. Does not require a Track. Vocabularies are customizable lists.
_Avoid_: action, relation

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
Read-only JPEG Clip folders. This service never writes into the pool.

**Task focus**:
Do not use. All four Task types can be edited on the same Frame at the same time.
