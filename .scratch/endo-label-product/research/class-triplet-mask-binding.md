# Frame class / Triplet vs mask: do desks bind them?

Fact inventory for grilling. Not a product lock.

Question: when a Frame has a class (e.g. `bleeding`) or a Triplet row, must a Track-on-Frame exist for the same thing? What do mainstream annotators and public surgical datasets actually do?

## Short answer

There is **no** mainstream schema that says: “this Frame class / Triplet row is invalid until a mask exists.”

Two separate jobs are standard:

| Job | What it records | Cheap? |
| --- | --- | --- |
| Image / Frame classification | This Frame **has** bleeding / a tool / a triplet | Yes (chip / interval) |
| Instance mask | **These pixels** are that object | No (draw / Predict) |

Desks keep both in **one project**, as **different types**. Category of a mask lives **on the Track** (Track Label), not by pointing at a Frame class row. Surgical triplets started **ungrounded**; linking a triplet to an instrument mask is a later, extra dataset.

## Annotator desks

### Encord

Primary: [Images — Label Editor](https://docs.encord.com/platform-documentation/Annotate/annotate-label-editor/annotate-images), [Ontology structure](https://docs.encord.com/platform-documentation/Annotate/annotate-ontologies/annotate-ontologies).

- **Objects** (box, polygon, bitmask, …) vs **Classifications** (radio / checklist / text) are different Ontology nodes.
- Quote: “Frame-level classifications consider the frame as a whole, not any given object’s localization.”
- An object may have **static classifications** (properties of *that instance*: species, color). That is attributes on the object, not a Frame class.
- **Relation** attributes link **two objects** (chicken ↔ wing). Docs: “can be applied to any object label but not to classifications.”
- So: Frame class is not required to have a bitmask. Bitmask is not required to have a Frame class. Object–object link exists; classification–object link does not.

### CVAT

Primary: [Annotation with tags](https://docs.cvat.ai/docs/annotation/manual-annotation/modes/annotation-with-tags/), [Vocabulary](https://docs.cvat.ai/docs/getting_started/vocabulary/), [CVAT format](https://docs.cvat.ai/docs/dataset_management/formats/format-cvat/).

- **Tags** = labels on a Frame. “Tags are not displayed in the workspace.” Stacking tags is default.
- **Track** + **mask** = one object across Frames. The track’s **label** is the instance category.
- One task may hold tags and tracks together. No schema that a tag must own a mask.
- Video dump even **drops tags**; masks/tracks stay. That only makes sense if they are not one record.

Same inventory as [multi-task-annotators.md](multi-task-annotators.md).

### Label Studio

Primary: [Tags](https://labelstud.io/tags/), [TimelineLabels](https://labelstud.io/tags/timelinelabels.html), [Configure labeling interface](https://labelstud.io/guide/setup).

- One project XML may mix **TimelineLabels** / **Choices** (Frame or span class) with region controls (**Rectangle**, **BrushLabels**, …).
- `result[]` is a list of independent items (`from_name` = which control). A timeline label is not a foreign key to a brush region.

### MD.ai (medical)

Primary: [Label types](https://docs.md.ai/annotator/ui/labels/label-types/).

- **Global label**: whole image / series / exam (e.g. Normal).
- **Local label**: a region (e.g. Lung Nodule), with Mask / box / polygon modes; several instances of the same local label on one image.
- Same English word may exist at both scopes. They are **two label types**, not a required pair.

### Metrics Reloaded (validation, not a desk)

Primary: Maier-Hein et al., [PMC11182665](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11182665/).

Problem categories are distinct: **image-level classification**, **object detection**, **semantic segmentation**, **instance segmentation**. A “bleeding present” flag and a “bleeding pixels” mask are different fingerprints. The paper does not treat them as one annotation.

## Surgical datasets (this product’s families)

Detail in [endo-task-families.md](endo-task-families.md). Binding-relevant cuts:

### Cholec80 — Frame class without mask

Twinanda et al., [arXiv:1602.03012](https://arxiv.org/abs/1602.03012); [CAMMA](https://camma.unistra.fr/datasets/).

- Tool **presence**: 7-D binary per Frame. Quote from the paper’s task: determining types present; **not** localization.
- Ten videos also have boxes, used to train a detector, **not** required to write presence.

`bleeding` as a Frame class is this job: the Frame has it.

### CholecT50 — Triplet without a Track

Nwoye et al., [arXiv:2109.03223](https://arxiv.org/abs/2109.03223); [annotation protocol](https://cholectriplet2022.grand-challenge.org/annotation-protocol/).

- Annotators mark begin/end on a **timeline**, then assign instrument / verb / target. Stored as binary presence of triplet classes per Frame.
- Spatial boxes exist only on a **subset** (protocol: test boxes on tool tips; public set: boxes on 5 videos / 13k boxes).
- CholecTriplet2022 splits **recognition** (frame binary triplets) from **detection** (box + which triplet). They are different sub-tasks, not one bound record.

### CholecInstanceSeg — masks with their own instrument class

Alabi et al., [PMC12092654](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12092654/).

- Instance masks + 7 instrument classes on frames that overlap Cholec80 / CholecT50.
- Quote: those sets “share frames … but are annotated for **different tasks**.”

### CholecTriplet-Seg — grounding is a later merge, and it breaks

Wei et al., [arXiv:2511.00643](https://arxiv.org/abs/2511.00643) (and Springer ESM).

- “The first large-scale dataset to pair … instrument instance masks with action verb and anatomical target.”
- Built by **aligning** CholecT50 triplets with CholecInstanceSeg masks after the fact. CholecT50 “does not ground triplets to specific instances.”
- Automatic match failed when **two graspers** on one Frame had **different** verbs. Manual repair required.
- So: public default = ungrounded Triplet rows. Forcing a row to own a Track is the hard extra job, not the starting desk.

## What the bleeding example actually is

| If you mean | Mainstream record | This glossary |
| --- | --- | --- |
| This Frame has bleeding | Frame / global classification | **Frame class** `bleeding` |
| These pixels are the bleed | Instance / semantic mask whose **category** is bleeding | **Track** + **Track Label** `bleeding` + **Track-on-Frame** |
| This grasper is retracting gallbladder | Frame triplet row; spatial optional / later | **Triplet** row; Track not required |
| This *specific* grasper’s pixels + that verb/target | Grounded triplet (CholecTriplet-Seg) | Not a Task type here (`triplet-on-track` was avoided) |

A desk can show both on one Frame (Encord / CVAT / this product’s sibling backends). That is **coexistence**, not a foreign key.

Hard bind (class on ⇒ mask required, or mask write ⇒ class on) is **not** what these desks or the public cholecystectomy sets do. Soft convenience (“New Track Label defaults to the class chip you just painted”) is a UI hint, not a store merge.
