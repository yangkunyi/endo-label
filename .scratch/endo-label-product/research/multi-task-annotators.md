# Which annotators host several task families on one video / Clip / project

Inventory only. Does not pick a desk for this product.

Question: can one project (or the same video / Clip) hold **more than one** of these families together: Phase, Frame class, action Triplet, instance / Track pixel mask?

Sources are first-party docs, native schemas, and (for this org) on-disk `scribble_service` files. No blog roundups.

## How this note maps words

Domain words from root `CONTEXT.md`. Each tool’s own names stay in quotes.

| Domain family | What `CONTEXT.md` means | Closest first-party names in this inventory |
|---|---|---|
| **Clip** | Ordered Frames as one labeling unit | CVAT **task** (one video or image sequence). Label Studio **task** (one video URL). Encord **data unit** (one video). `scribble_service` **clip** / **mini clip**. |
| **Phase** | Exclusive surgical step along a Clip; each Frame has at most one | Timeline span / frame-range **classification** with a single value (radio). Not a dedicated “phase” type in any tool below. |
| **Frame class** | Per-Frame labels that can stack | Frame **tags**, timeline labels with `choice="multiple"`, **checklist** classifications. |
| **Triplet** | Frame row: instrument + verb + target; several rows per Frame; does not require a Track | No first-party “triplet” type in CVAT / Label Studio / Encord. `scribble_service` **reads** filled Triplet GT; it does not host Triplet as a labeler-filled family. |
| **Track / Annotation** | Cross-frame instance identity + durable pixel masks | CVAT **track** + **mask**. Label Studio **VideoRectangle** / **VideoVector** (Enterprise). Encord **instance** + **bitmask**. `scribble_service` `anatomy_track_id` / `propagation_track_id` + `obj*.png`. |

`CONTEXT.md` still uses **Annotation** only for pixel masks on Tracks. This note does not rename that.

## Compact inventory

| Tool | Phase-like on same video | Frame class on same video | Triplet on same video | Track pixel mask on same video | How mixed | Documented ceiling |
|---|---|---|---|---|---|---|
| **CVAT** | Workaround only: per-frame **tags**, not exclusive, not an interval type | Yes: multiple **tags** per frame | No native I-V-T row | Yes: **mask** inside a **track** | One **task** / **job** holds several **label** types; UI modes switch; **project** shares the label list | Video dump format drops classification; one object cannot occupy two places on one frame; 2D+3D cannot mix in one task |
| **Label Studio** | Yes-ish: **TimelineLabels** spans, or **Labels** on a synced **Audio** timeline | Yes-ish: TimelineLabels / Labels `choice="multiple"`; **Choices** is clip-level unless used per-region | No native I-V-T row | Pixel mask on **video**: **VideoVector** (Enterprise / Starter Cloud). Open-source video SAM2 tutorial is **boxes**, and says it does not support video segmentation. **BrushLabels** / **BitmaskLabels** are **image** | One **project** = one XML config; several **control** tags; one **task** annotation `result[]` | Changing the config after work exists is restricted; VideoVector not in Community; official SAM2-video path is not pixel masks |
| **Encord Annotate** (commercial medical/video desk) | Yes: **Radio** frame **classification** with start/end ranges | Yes: **Checklist** classification (multiple values) | No native I-V-T row. **Relation** attributes link two **objects** with free text | Yes: **Bitmask** **objects** with a UUID across frames; interpolation; SAM 2 tracking | One **Ontology** (objects + classifications) attached to one **Project**; one **Label Row** per data unit | Glossary calls classification mutually exclusive, while Ontology also documents Checklist; Global vs frame-range classification cannot be flipped after attach |
| **`scribble_service`** | No surgical Phase family | No Frame class family | Consumes Triplet GT as a **read-only schedule**. Labeler does not fill I-V-T rows. Target-name correction does not rewrite the source Triplet CSV | Yes: per-Frame PNG masks + stable tracks | Same **clip** folder: mask **Annotation** + GT Triplet schedule. One SQLite **task** per parent clip | Explicitly “只标 target 组织，不标器械”; Triplet CSV is immutable GT |

None of the four hosts **all four** families as first-class, labeler-filled types on one video. CVAT, Label Studio, and Encord can mix **timeline/frame class** with **instance geometry** on one video. Pixel-mask tracks on video are first-class in CVAT, Encord, and `scribble_service`; Label Studio’s documented pixel-mask video path is Enterprise **VideoVector**, not Community **BrushLabels**.

---

## CVAT

Official docs: [docs.cvat.ai](https://docs.cvat.ai). Native dump: **CVAT for image / video 1.1** XML.

### What lives in one project vs one task

- A **project** groups tasks that share one **label list**. “In CVAT, you can create a project containing tasks of the same type. All tasks related to the project will inherit a list of labels.” ([Projects](https://docs.cvat.ai/docs/workspace/projects/))
- A **task** is one video or image set. Labels for a standalone task are edited on the task; once the task sits in a project, it uses the project labels. ([Tasks](https://docs.cvat.ai/docs/workspace/tasks-page/))
- One job’s workspace switcher lists **Standard**, **Attribute**, **Single Shape**, **Tag annotation**, **Review** — same job, different modes, not separate tasks. ([Navbar](https://docs.cvat.ai/docs/annotation/annotation-editor/navbar/))

So: mix is **one task / one job with several label types**, not “one CVAT task per family.” A project is a shared schema over many videos.

### Label schema (constructor + raw JSON + XML)

Each label has a name, optional color, optional **label shape** (`Any` or a single tool), and optional **attributes**.

XML 1.1 `meta.labels.label`:

- `<type>`: `any`, `bbox`, `cuboid`, `ellipse`, `mask`, `polygon`, `polyline`, `points`, `skeleton`, `tag`
- `<attributes>`: `mutable`, `input_type` (`select`, `checkbox`, `radio`, `number`, `text`), `default_value`, `values`

([CVAT format](https://docs.cvat.ai/docs/dataset_management/formats/format-cvat/))

**Label shape** “limits the use of the label to certain shape tool.” `Any` is default. Several labels in one task may use different shapes; the sidebar then shows the union of those tools. Changing shape does not convert existing objects. Skeleton shape cannot be changed. ([Tasks — Label shape](https://docs.cvat.ai/docs/workspace/tasks-page/#label-shape))

**Attributes** are properties of an object (or tag), not a separate task type. Immutable = unique across frames; mutable = can change per frame. Checkbox “enables the selection of multiple options.” ([Add an attribute](https://docs.cvat.ai/docs/workspace/tasks-page/#add-an-attribute))

### Family mapping

**Phase**

- No exclusive timeline-step type.
- Closest: **tags** on frames. Tag mode: “It is used to annotate frames, tags are not displayed in the workspace.” You pick a label and add it with Plus. “If you need to use only one label for one frame, then enable the Automatically go to the next frame checkbox” — so stacking tags is the default; single-tag is an opt-in workflow, not a schema constraint. ([Annotation with tags](https://docs.cvat.ai/docs/annotation/manual-annotation/modes/annotation-with-tags/))
- Tags in the image XML sit under `<image>` as `<tag label="...">`, one frame at a time. There is no start/end interval element for tags in the interpolation schema. ([CVAT format — Annotation](https://docs.cvat.ai/docs/dataset_management/formats/format-cvat/))
- Video **interpolation** mode is for **tracks**, not classification. Vocabulary: Interpolation = video, uses track objects; Annotation = images, uses shape objects. ([Vocabulary](https://docs.cvat.ai/docs/getting_started/vocabulary/))

**Frame class**

- Multiple tags per frame, plus checkbox attributes on a tag or on a shape.
- Same job as shapes/tracks via the mode switcher.

**Triplet**

- No instrument-verb-target row type, no relation type in the official label schema.
- Three attributes on a tag (or one label per closed triplet string) would be a convention, not a documented family.

**Track pixel mask**

- Vocabulary: “Track is a set of shapes on different frames which corresponds to one object. Tracks are created in Track mode.” ([Vocabulary](https://docs.cvat.ai/docs/getting_started/vocabulary/))
- Interpolation XML: `<track id="..." label="...">` contains per-frame `<box|polygon|polyline|points|mask|skeleton>`. **Mask** uses RLE plus `left`, `top`, `width`, `height`. “Each track corresponds to an object which can be presented on multiple frames. The same object cannot be presented on the same frame in multiple locations.” ([CVAT format — Interpolation](https://docs.cvat.ai/docs/dataset_management/formats/format-cvat/))
- Mask export notes: boxes and polygons convert to masks; grouped objects become one instance. ([Creating masks](https://docs.cvat.ai/docs/annotation/manual-annotation/shapes/annotation-with-polygons/creating-mask/))

### Storage

- Native dump: one `annotations.xml` per task (zip with frames).
- **CVAT for image 1.1**: “Applicable for all computer vision tasks in 2D except for Video Tracking.” Supported: Tags, boxes, polygons, polylines, points, cuboids, ellipses, skeletons, **masks**. Tracks via extra `track_id`. ([format-cvat](https://docs.cvat.ai/docs/dataset_management/formats/format-cvat/))
- **CVAT for video 1.1**: “Applicable for all computer vision tasks in 2D except for Classification.” Supported: boxes, polygons, polylines, points, cuboids, ellipses, skeletons, **masks**, attributes, tracks. “Shapes are exported as single-frame tracks.” **Tags are not in this list.**
- **Datumaro** export lists Tags **and** Masks **and** Tracks (`track_id`) together. ([Datumaro](https://docs.cvat.ai/docs/dataset_management/formats/format-datumaro/))

### Documented limitations (mix-related)

- Video 1.1 dump is not a classification format; use image XML or Datumaro if tags must leave the server with masks.
- One track, one location per frame.
- “You can’t mix 2D and 3D data in the same task.” ([Tasks](https://docs.cvat.ai/docs/workspace/tasks-page/#data-formats-for-a-3d-task))
- Overlap/segment merge “only works for bounding boxes.” ([Advanced configuration](https://docs.cvat.ai/docs/workspace/tasks-page/#advanced-configuration))
- Auto-QA example: a video with tracks has only Ground Truth mode; “Tracks are not supported” in some image-only QA setups. ([Auto QA](https://docs.cvat.ai/docs/qa-analytics/auto-qa/))

---

## Label Studio

Official docs: [labelstud.io](https://labelstud.io). Mix is defined by one project **labeling configuration** (XML tags).

### What lives in one project vs one task

- “All labeling activities in Label Studio occur in the context of a project.” One project has one labeling interface. ([Configure labeling interface](https://labelstud.io/guide/setup))
- “You can combine multiple control and object tags in the same configuration and use names to connect them.” ([Tags introduction](https://labelstud.io/tags/))
- A **task** is one imported item (here: one video URL). The annotation JSON has `annotations[].result[]` — one array of results from **all** control tags on that task. `result.from_name` is the control tag; `result.type` is the tag type. ([Export](https://labelstud.io/guide/export#How-Label-Studio-saves-results-in-annotations), [Tasks JSON](https://labelstud.io/guide/tasks#Basic-Label-Studio-JSON-format))
- After work exists: “You cannot remove labels or change the type of labeling being performed unless you delete any existing annotations that are using those labels.” ([Setup](https://labelstud.io/guide/setup#Modify-the-labeling-interface))

So: mix is **one project config / one task result list**, not separate Label Studio projects per family unless you choose that.

### Family mapping

**Phase**

- **TimelineLabels**: “Use the TimelineLabels tag to classify video frames. This can be a single frame or a span of frames.” Result: `value.ranges[{start,end}]` plus `value.timelinelabels`. Example config is one `<Video>` plus one `<TimelineLabels>` group. ([TimelineLabels](https://labelstud.io/tags/timelinelabels))
- Docs do not say spans of different labels are exclusive. Exclusive Phase would be a convention on a single-choice label set, not a documented constraint.
- Older **video timeline segmentation** template labels an **Audio** channel synced to **Video**, with `<Labels ... choice="multiple">`. That is overlapping timeline classes on the audio axis, not an exclusive Phase. ([Video timeline segmentation](https://labelstud.io/templates/video_timeline_segmentation))

**Frame class**

- TimelineLabels / Labels with multiple values on a frame or short span.
- **Choices** on `<Video>` is **clip-level** classification in the official video classification template (`Blurry` / `Sharp` for the whole clip). ([Video classification](https://labelstud.io/templates/video_classification))
- `Choices` supports `choice="multiple"` and `perRegion="true"` (choice on a region, not on a Frame). ([Choices](https://labelstud.io/tags/choices))

**Triplet**

- No Triplet control tag.
- **Relations**: “create label relations between regions” with values such as similar/dissimilar. Data types include video. This is a labeled link between two regions, not a three-slot Frame row, and it requires regions first. ([Relations](https://labelstud.io/tags/relations))
- **Taxonomy**: hierarchical classification; works with video; `perRegion` exists. A nested instrument → verb → target tree would be a convention. Default is classify the whole object unless `perRegion` is set. ([Taxonomy](https://labelstud.io/tags/taxonomy))

**Track pixel mask**

- **VideoRectangle** + **Labels**: object **tracking** with rectangles (not pixel masks). Result type `videorectangle`, `value.sequence` of box keyframes, `id` is the tracked region. ([Video object detection](https://labelstud.io/templates/video_object_detector), [VideoRectangle](https://labelstud.io/tags/videorectangle))
- **VideoVector**: “vector annotation capabilities to videos” including closable paths (polygons) and keyframe interpolation. “The `VideoVector` and `VideoVectorLabels` tags are currently available in Label Studio Enterprise (including self-hosted) and Starter Cloud only.” Docs position it with SAM 2 video segmentation. ([VideoVector](https://labelstud.io/tags/videovector))
- **BrushLabels** / **BitmaskLabels**: “Use with the following data types: **image**.” RLE or PNG data-URL. Not a video object tag. ([BrushLabels](https://labelstud.io/tags/brushlabels), [BitmaskLabels](https://labelstud.io/tags/bitmasklabels))
- Official **SAM2 video** ML tutorial labeling config is `<VideoRectangle ... smart="true"/>`. Known limitations (dated 8/11/2024 in that page): “Currently, we only support the tracking of one object in video… Currently, we do not support video segmentation.” ([SAM2 with videos](https://labelstud.io/guide/ml_tutorials/segment_anything_2_video))

### Storage

- SQLite / Postgres / target storage: one JSON per labeled task (`task_id.json` in buckets). ([Export](https://labelstud.io/guide/export))
- Mixed families in one annotation = several objects in `result[]` with different `type` / `from_name`.
- CSV/TSV export: columns from `from_name` and `to_name`. JSON export supports all project types. Brush-to-PNG is an **image** brush export, not a video-track export.

### Documented limitations (mix-related)

- One labeling config per project; type changes need deleting annotations that use the old labels.
- Community video path documented for classification + rectangle tracks. Pixel-mask video is **VideoVector**, Enterprise/Starter Cloud.
- Official SAM2-video backend documents no video segmentation (boxes only, one object).
- `Choices` on Video without TimelineLabels is not per-Frame.
- Video codec/CFR constraints on `<Video>`. ([Video tag](https://labelstud.io/tags/video))

---

## Encord Annotate (commercial medical / video desk)

First-party docs: [docs.encord.com](https://docs.encord.com). Picked because the docs are public and cover **video + DICOM + bitmask + frame classification** in one Ontology. This is a commercial medical/video annotation product, not a surgical-only OR desk. Public first-party **label schemas** for Caresyntax / Theator / Proximie were not used (none found that describe mixing these families).

### What lives in one project vs one task

- An **Ontology** is the taxonomy: top-level **Classes** are **Objects** or **Classifications**, plus nested **Attributes**. DICOM wording: “labeling protocol.” ([Ontology structure](https://docs.encord.com/platform-documentation/Annotate/annotate-ontologies/annotate-ontologies))
- “Once an Ontology is attached to a Project, Global Classifications cannot be changed to non-Global Classifications.” Same page.
- **Data unit**: “a package of data that constitutes a single annotation task. For example, a video…” ([Glossary](https://docs.encord.com/platform-documentation/General/annotate-glossary))
- Label Editor Classes panel “shows you the available Ontology classes, both objects and classifications.” ([Videos](https://docs.encord.com/platform-documentation/Annotate/annotate-label-editor/annotate-videos))
- Storage unit in the SDK types: **Label Row** — “a collection of labels belonging to a particular data unit in a Project.” Frame objects and frame classifications are separate blobs on that row (`FrameObject`, `FrameClassification`). ([Glossary](https://docs.encord.com/platform-documentation/General/annotate-glossary); [objects.types](https://docs.encord.com/sdk-documentation/sdk-references/objects.types))

So: mix is **one Ontology / one Project / one Label Row**, not one Encord project per family.

### Family mapping

**Phase**

- **Radio** classification: “Allows a single value.” Classifications “apply to the entire frame.” On video, a classification instance has a UUID “across a range of frames”; UI sets start/end (`Set start to current` / `Set end to current`) and can add extra ranges. ([Ontology — Classifications](https://docs.encord.com/platform-documentation/Annotate/annotate-ontologies/annotate-ontologies); [Frame classification](https://docs.encord.com/platform-documentation/Annotate/annotate-label-editor/annotate-videos#frame-classification))
- Glossary: “Classification: A mutually-exclusive category applied to a frame.” That matches Radio. Exclusive Phase along the Clip is Radio + one range covering each Frame; the docs do not say two Radio classes cannot overlap in time.

**Frame class**

- **Checklist**: “Allows multiple values. For example, Weather could be both cloudy and rainy.” Same Ontology page.
- That is the stacked Frame-class analogue. It sits next to Radio in the same Ontology.

**Triplet**

- No I-V-T row type.
- **Relation** attributes: “link objects and define their relationship using free-text, regardless of annotation type.” Text field only; “can be applied to any object label but not to classifications.” Linking happens in the editor after both instances exist. ([Relation attributes](https://docs.encord.com/platform-documentation/Annotate/annotate-ontologies/annotate-ontologies#relation-attributes); [Linking objects](https://docs.encord.com/platform-documentation/Annotate/annotate-label-editor/annotate-videos#linking-objects))
- Nested Radio attributes on an **object** (instrument instance → verb → target) would sit on a Track, which `CONTEXT.md` says a Triplet does **not** require.

**Track pixel mask**

- **Bitmask** object type, supported on videos. Brush, threshold brush, eraser. Copy/paste between frames. Interpolation supported; automated SAM 2 tracking listed for Bitmask in the later automation table. Instance: “unique instantiation of an ontology entity, which depending on the data type, may contain many frame labels.” ([Ontology objects](https://docs.encord.com/platform-documentation/Annotate/annotate-ontologies/annotate-ontologies); [Bitmasks](https://docs.encord.com/platform-documentation/Annotate/annotate-label-editor/annotate-videos#segmentation-masks--bitmasks); [Glossary — Instance](https://docs.encord.com/platform-documentation/General/annotate-glossary))
- Instantiating “generates a UUID that uniquely identifies that instance across a range of frames (i.e., in the temporal dimension). The identifier is sometimes called a track.” ([Videos — Annotation types](https://docs.encord.com/platform-documentation/Annotate/annotate-label-editor/annotate-videos#annotation-types))
- PNG download of bitmasks is **per current frame**, not a multi-frame bundle. Same bitmasks section.

### Storage

- One Label Row per video data unit: object instances (geometry per frame, including RLE `segmentation` on `SegmentationObject`) plus classification instances (frame ranges + answers).
- Dynamic attributes on objects are stored as frame-range blocks, not as Frame-class rows.

### Documented limitations (mix-related)

- Relation is object↔object, not classification, not a three-slot Triplet.
- Global classification vs frame-range classification is frozen after the Ontology is attached to a Project.
- Nested attributes: Radio nests up to 7 layers; Checklist and text do not nest.
- Bitmask PNG export is current-frame only.
- Glossary “mutually-exclusive” vs Ontology Checklist: two first-party sentences; Checklist is the multi-label path.

---

## This org’s `scribble_service`

Read-only tree: `/data5/jj/proj/Grasp/scribble_service`. Docs and schema files only; `app.py` was not imported into this product.

### What the desk actually labels

README (opening): the service is for `SJTU_triplet_annotation_package_v2_reduced`. “Triplet GT 给出 target 组织出现区间，标注员在推荐锚点上用 ScribbleSam2Memory（SAM2.1）制作多实例组织 mask，再由独立的 SAM 3.1 worker 传播。” “只标 target 组织，不标器械。”

ANNOTATION_GUIDE §1: “为每个 clip 做**像素级组织(tissue)分割**。triplet 已标好…这里只圈组织，不标器械。”

So the **editable** family is instance / Track pixel **Annotation**. Triplet is **upstream GT**, used as a schedule.

### How Triplet is stored vs how masks are stored

**Triplet GT (read-only schedule)**

- `triplet_schedule.py` module docstring: “Read-only target schedules derived from the filled triplet GT.” Schema id `triplet-target-schedule/v2`.
- Source: annotation CSV columns `clip_name,instrument,action,target,start_time,end_time` plus `label_space.json` with `instruments`, `actions`, `targets`, `triplets`.
- Closed integer-second intervals at 1 fps become half-open local Frame ranges. Same-target touching rows merge into one **mini clip** = “one target's maximal continuous GT span.”
- HTTP: `GET /api/triplet_schedule` returns mini clips, triplet refs, coverage. (README interface table)

**Track masks (writable Annotation)**

- Pixel files: `annotations/<clip>/<frame>/manifest.json` + `obj*.png`. README: “像素真身位于” that tree. Guide §8: each instance is a binary PNG (white = tissue) plus manifest fields for class, mask, source, review, target span / triplet association, provenance.
- Tests show object fields: `obj_id`, `instance_id`, `anatomy_track_id`, `propagation_track_id`, `target_id`, `target_span_id`, `mini_clip_id`, `tissue_class`, `source`, `mask_file`. (`tests/test_triplet_schedule.py`, `tests/test_mask_eraser_api.py`)
- Cross-frame identity is `anatomy_track_id` / `propagation_track_id`. README: “跨帧只有显式 `propagation_track_id` 才合并；普通 `instance_id` 是帧内身份。”
- SQLite `annotations.db` indexes frames, propagation runs, and **tasks** (one parent clip per assignment). Trajectory ledger (`annotation_ledger.py`) is a side audit of mask strokes; it “has no dependency on `app.py`” and stores mask PNG blobs, not Phase/Triplet rows.

**Same Clip, two layers**

- One parent **clip** (media + GT). Work unit shown to the labeler is a **mini clip** (one target’s continuous span). Overlapping tissues on one Frame are overlapping mini clips, “并不需要造一个混合组织工作单元.” (README)
- Mask objects copy `target_span_id` / `triplet_ids` as association. That is not a Triplet editor.

**Target correction is not Triplet labeling**

- README: 任务负责人 may “纠正当前连续 mini clip 的目标”. “该操作保留现有 Mask、审核及传播 provenance，只迁移 manifest 元数据；**源 Triplet CSV 与 PNG Mask 均不改写**.”
- Test `test_assigned_annotator_retargets_schedule_and_migrates_metadata_without_mask_loss` (`tests/test_target_correction_api.py`): PATCH retargets Bladder → Bladder neck, PNG bytes unchanged, `mask_files_modified` is false, schedule `target_spans` name changes.

### Family mapping

| Family | In this desk? |
|---|---|
| Phase | No. The word `phase` in `app.py` / `sam31_pipeline.py` is **job progress** (`queued` / `propagating` / `completed`), not a surgical step. |
| Frame class | No stacked per-Frame class family. Coverage is “组织×帧” against GT-required targets. |
| Triplet | **Input GT only.** Labeler does not create I-V-T rows. Instruments are not labeled. |
| Track pixel mask | **Yes.** This is the product. Several tracks on one Frame; sources may mix (`manual` / `human_corrected` / `propagated`) per object. |

### Mix on the same Clip

Yes, in a narrow sense: **one Clip** holds writable Track **Annotation** and a **read-only** Triplet schedule (and optional reviewed target spans). No, as “several editable task families in one project”: the human task is tissue masks, assigned as one SQLite task per parent clip (`unassigned → … → completed`).

### Documented limitations (from this tree)

- Do not label instruments. Suture is the exception when GT names it. (Guide §1, §6)
- Mini clip outside = `not_required`, not a negative empty mask. (README)
- Multi-instance same tissue: identity must be proven across anchors; the service refuses guessed track merges. (README)
- Physical `_split001` windows are media cuts, not tissue mini clips. (README)
- CUHK/NUS media are not mounted as separate datasets on this service; account names are not `source_school`. (README, `TASK_PARTITION_20260715.md`)

---

## First-party gaps (so later tickets do not over-read this note)

- No inspected tool ships a type named **Triplet** with instrument + verb + target as a Frame row that is independent of a Track.
- No inspected tool ships a type named **Phase** with “at most one per Frame” as a schema constraint. Closest: Encord Radio ranges, Label Studio TimelineLabels, CVAT tags (per-Frame, stackable).
- Dedicated surgical commercial desks (Caresyntax, Theator, Proximie, Touch Surgery) were not inventoried: no first-party public label schema was found that states how those families mix. Encord is the commercial stand-in because its Ontology + video editor docs are public.
- This note does not say which mix this product should copy.

## Sources

- CVAT: [Tasks](https://docs.cvat.ai/docs/workspace/tasks-page/), [Projects](https://docs.cvat.ai/docs/workspace/projects/), [Tags](https://docs.cvat.ai/docs/annotation/manual-annotation/modes/annotation-with-tags/), [Track mode](https://docs.cvat.ai/docs/annotation/manual-annotation/modes/track-mode-basics/), [Navbar](https://docs.cvat.ai/docs/annotation/annotation-editor/navbar/), [Vocabulary](https://docs.cvat.ai/docs/getting_started/vocabulary/), [CVAT XML 1.1](https://docs.cvat.ai/docs/dataset_management/formats/format-cvat/), [Datumaro](https://docs.cvat.ai/docs/dataset_management/formats/format-datumaro/), [Creating masks](https://docs.cvat.ai/docs/annotation/manual-annotation/shapes/annotation-with-polygons/creating-mask/), [Auto QA](https://docs.cvat.ai/docs/qa-analytics/auto-qa/)
- Label Studio: [Setup](https://labelstud.io/guide/setup), [Tags](https://labelstud.io/tags/), [TimelineLabels](https://labelstud.io/tags/timelinelabels), [Video](https://labelstud.io/tags/video), [VideoRectangle](https://labelstud.io/tags/videorectangle), [VideoVector](https://labelstud.io/tags/videovector), [BrushLabels](https://labelstud.io/tags/brushlabels), [BitmaskLabels](https://labelstud.io/tags/bitmasklabels), [Choices](https://labelstud.io/tags/choices), [Relations](https://labelstud.io/tags/relations), [Taxonomy](https://labelstud.io/tags/taxonomy), [Video classification](https://labelstud.io/templates/video_classification), [Video object detection](https://labelstud.io/templates/video_object_detector), [Video timeline segmentation](https://labelstud.io/templates/video_timeline_segmentation), [SAM2 video](https://labelstud.io/guide/ml_tutorials/segment_anything_2_video), [Export](https://labelstud.io/guide/export), [Tasks](https://labelstud.io/guide/tasks)
- Encord: [Ontology](https://docs.encord.com/platform-documentation/Annotate/annotate-ontologies/annotate-ontologies), [Videos](https://docs.encord.com/platform-documentation/Annotate/annotate-label-editor/annotate-videos), [Glossary](https://docs.encord.com/platform-documentation/General/annotate-glossary), [objects.types](https://docs.encord.com/sdk-documentation/sdk-references/objects.types)
- `scribble_service` (disk): `README.md`, `ANNOTATION_GUIDE.md`, `ANNOTATION_TRAJECTORY_STORAGE.md`, `TASK_PARTITION_20260715.md`, `triplet_schedule.py`, `annotation_ledger.py`, `tests/test_triplet_schedule.py`, `tests/test_target_correction_api.py`, `tests/test_mask_eraser_api.py`
