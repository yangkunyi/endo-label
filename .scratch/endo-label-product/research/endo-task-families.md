# Task families in endoscopic / laparoscopic surgical-video datasets

Fact inventory. Primary sources only (dataset papers, official dataset pages, challenge READMEs, first-party annotation protocols). Not a product recommendation.

**Project words** (from root `CONTEXT.md`) are used only in the *maps to* column: **Clip**, **Frame**, **Phase**, **Frame class**, **Triplet**, **Track**, **Annotation**. Source’s own words stay in *Source family* and *What is labeled*. **Annotation** in this repo still means pixel masks on Tracks; this file does not lock an umbrella term.

**Durable-unit codes** used below:

| Code | Meaning |
| --- | --- |
| exclusive Phase along Clip | one surgical-step class at a time; a Frame belongs to at most one phase (idle time usually folded into the current phase) |
| per-Frame class | a label on a Frame that can stack with others (tool presence, event, quality, CVS criterion) |
| interval start/end | annotators mark begin/end on a timeline; Frames inside inherit the label |
| instance row | one row per object/event on a Frame (triplet, box, instance id) without requiring a Track |
| pixel mask | per-pixel class or instance silhouette |
| Track across Frames | same identity id across Frames in a Clip |
| Clip-level score | one value (or vector) for a whole procedure or a named Phase, not per Frame |

**Exclusive vs multi-label** is always *on one Frame* unless the row says otherwise.

---

## Cross-dataset family table

| Source family (their words) | Datasets | Durable unit | One Frame | Maps to |
| --- | --- | --- | --- | --- |
| Phase recognition / surgical phase / surgical workflow | Cholec80, m2cai16-workflow, CholecT50 (also ships phases), HeiChole, HeiCo, AutoLaparo, MultiBypass140, PhaKIR, CATARACTS (phase/activity later editions) | exclusive Phase along Clip; stored as per-Frame class *or* interval start timestamps | exclusive | **Phase** |
| Step recognition | MultiBypass140 | exclusive along Clip at finer grain than phase | exclusive | **Phase**-like (finer exclusive step; not in CONTEXT yet) |
| Tool / instrument presence detection | Cholec80, m2cai16-tool, HeiChole, CATARACTS 2017 | per-Frame class (binary vector) | multi-label | **Frame class** |
| Surgical action triplet ⟨instrument, verb, target⟩ | CholecT45 / CholecT50 / CholecTriplet | instance row per Frame (binary presence of 100 classes); optional box on tool tip | multi-label (several triplets on one Frame) | **Triplet** |
| Surgical action / gesture (verb-only, no target anatomy) | HeiChole (4 actions), SAR-RARP50 (7 gestures + other) | HeiChole: per-Frame class (4-D binary). SAR-RARP: exclusive interval along Clip, evaluated per Frame | HeiChole multi-label; SAR-RARP exclusive | **Frame class** (HeiChole) or exclusive **Phase**-like gesture (SAR-RARP) |
| Instrument binary / parts / type segmentation | EndoVis 2015, 2017; SAR-RARP50 (semantic parts) | pixel mask | exclusive per pixel; several instruments can occupy different pixels | **Annotation** (mask); not a Track unless instance ids persist |
| Instrument instance segmentation | EndoVis 2017 (instance images), HeiCo / ROBUST-MIS 2019, PhaKIR, AutoLaparo (parts per instrument type) | pixel mask + instance numbers on that Frame | exclusive per pixel; multiple instances | **Annotation**; Track only if ids are reused across Frames (sources usually do not) |
| Semantic scene segmentation (anatomy + tools) | CholecSeg8k, EndoVis 2018, CaDIS, Endoscapes-Seg | pixel mask (class id per pixel) | exclusive per pixel; several classes on one Frame | **Annotation** (semantic, not instance Track) |
| Instrument tracking (2-D pose: center + shaft axis) | EndoVis 2015 tracking | per-Frame coordinates per instrument | several instruments | pose row, not CONTEXT **Track** |
| Multi-class multi-tool identity tracking | CholecTrack20 | Track across Frames (three ID policies) + box | several tools | **Track** |
| Instrument keypoint estimation | PhaKIR | instance row of (x,y) on a Frame | several instruments | not in CONTEXT; pose points, not a mask |
| Bounding-box localization / object detection | CholecT50 subset + CholecTriplet test; Endoscapes-BBox; m2cai16-tool-locations; ROBUST-MIS detection task | instance row (box) | several | not a Track |
| Surgical skill | HeiChole | Clip-level score (and two named Phases) | n/a (not a Frame label) | not in CONTEXT |
| Critical View of Safety (CVS) criteria | Endoscapes | per-Frame class: three binary criteria | multi-label | **Frame class** (clinical, not tool presence) |
| Laparoscope motion | AutoLaparo | interval / clip-level exclusive class | exclusive on that short clip | not in CONTEXT |
| Intraoperative adverse events (IAEs) | MultiBypass140 (CAMMA page + later IAE paper) | not fully specified in the 2023 phase/step paper | — | **Frame class**-like event (see that section) |
| Scene visual challenges / operator | CholecTrack20 | per-Frame class (and operator on a tool) | can stack | **Frame class** |

---

## Cholec80

Official page: [CAMMA datasets](https://camma.unistra.fr/datasets/). Paper: Twinanda et al., *EndoNet*, IEEE TMI 2017, [arXiv:1602.03012](https://arxiv.org/abs/1602.03012). Challenge sibling: [m2cai16](https://camma.unistra.fr/m2cai2016/index.php/program-challenge/).

80 cholecystectomy videos, 13 surgeons, captured at 25 fps.

### Phase recognition

- **Source family:** “phase recognition”; “surgical workflow”.
- **What is labeled:** one of seven phases defined by a senior surgeon. Paper Table I: Preparation; Calot triangle dissection; Clipping and cutting; Gallbladder dissection; Gallbladder packaging; Cleaning and coagulation; Gallbladder retraction.
- **Durable unit:** exclusive Phase along the Clip. Official CAMMA page: phase labeled **at 25 fps**. Paper processes video **downsampled to 1 fps**. Loss is softmax multi-class (`N_p = 7`). HHMM top-level states = the seven phases; transitions among them are modeled (P5↔P6 is not strictly sequential).
- **Exclusive vs multi-label:** exclusive. One phase per Frame.
- **Maps to:** **Phase**.

### Tool presence detection

- **Source family:** “tool presence detection” — “automatically determining all types of tools present in an image”; explicitly *not* localization.
- **What is labeled:** seven tools (paper Fig. 3 / Table II): grasper, bipolar, hook, scissors, clipper, irrigator, specimen bag. A tool is present “if at least half of the tool tip is visible.”
- **Durable unit:** per-Frame class. Official CAMMA page: tool presence **at 1 fps**. Stored as a 7-D binary vector. Ten videos also have tool **bounding boxes** (used to train DPM, not the public presence task).
- **Exclusive vs multi-label:** multi-label. `N_t = 7` independent binary classifications. Several tools on one Frame.
- **Maps to:** **Frame class**.

Citation: [CAMMA](https://camma.unistra.fr/datasets/); Twinanda et al. [arXiv:1602.03012](https://arxiv.org/abs/1602.03012).

**m2cai16-workflow** (41 cholecystectomy videos, eight phases, online phase at time *t*) and **m2cai16-tool** (15 videos, same seven-tool binary vector, “localization of the tools is not the concern”) are the 2016 challenge cuts of the same families ([m2cai 2016 challenges](https://camma.unistra.fr/m2cai2016/index.php/program-challenge/)). **m2cai16-tool-locations** (Jin et al.; 2,532 frames with boxes on the first 10 m2cai16-tool videos) adds bounding-box rows, not a new family beyond localization.

---

## CholecT45 / CholecT50

Official: [CAMMA](https://camma.unistra.fr/datasets/), [CholecTriplet2022 data](https://cholectriplet2022.grand-challenge.org/data/), [annotation protocol](https://cholectriplet2022.grand-challenge.org/annotation-protocol/). Papers: Nwoye et al., *Rendezvous*, MedIA 2022, [arXiv:2109.03223](https://arxiv.org/abs/2109.03223); Nwoye & Padoy, splits/metrics, [arXiv:2204.05235](https://arxiv.org/abs/2204.05235).

CholecT50 = 50 cholecystectomy videos (45 from Cholec80 + 5 in-house). CholecT45 = first public 45-video release. Labels at **1 fps**. Splits paper Table 1: 100 triplet classes from 6 instruments, 10 verbs, 15 targets; 7 phases; CholecT50 also has 13.0K bounding boxes.

### Surgical action triplet recognition (and later detection)

- **Source family:** “surgical action triplet recognition”; “tool-tissue interaction”; challenge name “triplet detection”. Formalism ⟨instrument, verb, target⟩. Katić et al. 2014 cited as the ontology; this dataset is the first large video set labeled *for* triplet recognition.
- **What is labeled:** 100 triplet classes (examples: ⟨grasper, retract, gallbladder⟩, ⟨clipper, clip, cystic-artery⟩). Components: 6 instruments, 10 verbs, 15 targets. “A target can be simultaneously involved in multiple distinct actions.” Liver is a target only when an instrument acts on it. “Without an instrument, there cannot be a verb.”
- **Durable unit:**
  1. Annotators set **beginning and end on a timeline** for each action, then assign instrument/verb/target (Surgery Workflow Toolbox-Annotate). “An action ends when the corresponding instrument exits the frame, or if the verb or target changes.”
  2. Engineers **downsample to 1 fps** into a `.txt` per video: **rows = Frames, columns = categories, binary presence** of triplets and of the three components.
  3. CholecTriplet2022 test (and some val) add **bounding boxes over the tool tips**, paired to triplets. CAMMA page: boxes on a **subset of 5 videos**. Rendezvous Fig. 1 caption: “The localization is not part of the dataset” for the recognition paper itself.
- **Exclusive vs multi-label:** multi-label. “Multiple triplets can occur in one frame.” Recognition is “three multi-label classification problems” plus association. Not exclusive along the Clip.
- **Maps to:** **Triplet** (instance row on a Frame). Does not require a **Track**. Boxes, when present, are instance rows, not Tracks.

### Phase labels (shipped with the set)

- **Source family:** “phases” (CholecTriplet protocol lists phase names, begin/end markers, transitions). Splits paper Table 1: 7 phase categories.
- **Durable unit / exclusive:** same exclusive Phase family as Cholec80 (7 classes).
- **Maps to:** **Phase**.

Citation: [arXiv:2109.03223](https://arxiv.org/abs/2109.03223); [arXiv:2204.05235](https://arxiv.org/abs/2204.05235); [protocol](https://cholectriplet2022.grand-challenge.org/annotation-protocol/); [CAMMA](https://camma.unistra.fr/datasets/).

---

## EndoVis instrument segmentation and later years

Index: [EndoVis datasets & publications](https://opencas.dkfz.de/endovis/datasetspublications/).

### 2015 — Instrument segmentation and tracking

Paper: Bodenstedt et al., [arXiv:1805.02475](https://arxiv.org/abs/1805.02475). Data: [open-cas](http://open-cas.org/?q=node/31). Challenge: [endovissub-instrument](https://endovissub-instrument.grand-challenge.org/).

Two scenarios: **articulated robotic** (ex-vivo) and **rigid conventional laparoscopic** (in-vivo). Two tasks: segmentation and tracking.

**Instrument segmentation**

- **Source family:** “instrument segmentation”; binary instrument vs background.
- **What is labeled:** instrument pixels. Robotic: CAD model back-projected from hand-corrected kinematics (shaft vs metal head in the mask values). Conventional: crowd + manual correction, binary masks.
- **Durable unit:** pixel mask on annotated Frames (robotic: every frame in the tracking sequences; conventional segmentation as released masks).
- **Exclusive vs multi-label:** exclusive per pixel (instrument / background). Several instruments can appear; the public task is binary, not instance ids.
- **Maps to:** **Annotation** (silhouette), not a **Track**.

**Instrument tracking**

- **Source family:** “instrument tracking”.
- **What is labeled:** CSV of **center point** (shaft/manipulator intersection) and **normalized shaft axis** per instrument; robotic also **head axis** and **clasper angle**.
- **Durable unit:** per-Frame coordinates per instrument (robotic: every frame; conventional: 1 fps). Not a persistent identity Track in the MOT sense.
- **Exclusive vs multi-label:** several instruments per Frame.
- **Maps to:** pose rows, not CONTEXT **Track**.

### 2017 — Robotic instrument segmentation

Paper: Allan et al., [arXiv:1902.06426](https://arxiv.org/abs/1902.06426). Challenge: [endovissub2017-roboticinstrumentsegmentation](https://endovissub2017-roboticinstrumentsegmentation.grand-challenge.org/).

10 porcine da Vinci Xi sequences, 300 frames at 1 Hz each. Labels on the left stereo eye. “Labels were provided on an instance level with separate annotated images per object.”

Three sub-problems (source words):

1. **Binary instrument segmentation** — da Vinci Xi instruments vs background (background includes ultrasound probe, clips, tissue).
2. **Instrument part segmentation** — articulating parts (shaft / wrist / claspers; MCS sheath labeled as shaft).
3. **Instrument type segmentation** — classify the instrument (Large Needle Driver, Prograsp Forceps, MCS, Cadiere, Bipolar Forceps, Vessel Sealer, plus drop-in US probe).

- **Durable unit:** pixel mask, instance-level files per object on that Frame.
- **Exclusive vs multi-label:** exclusive per pixel within a task head; multiple instances on one Frame.
- **Maps to:** **Annotation**. Instance ids are per Frame, not described as Tracks across the 300-frame Clip.

### 2018 — Robotic scene segmentation

Paper: Allan et al., [arXiv:2001.11190](https://arxiv.org/abs/2001.11190). Challenge: [endovissub2018-roboticscenesegmentation](https://endovissub2018-roboticscenesegmentation.grand-challenge.org).

19 porcine sequences, 300 frames at 1 Hz, left eye labeled.

- **Source family:** “semantic segmentation of surgical images into a set of medical device classes and a set of anatomical classes.”
- **What is labeled:** devices — da Vinci shaft/wrist/jaws (same 2017 split), drop-in US, suturing needles, suturing thread, suction-irrigation, surgical clips. Anatomy — kidney parenchyma, “covered kidney” (fascia/fat on kidney), small intestine, plus a background class for remaining anatomy.
- **Durable unit:** pixel mask (polygons around each semantic class).
- **Exclusive vs multi-label:** exclusive per pixel among the listed classes; several classes on one Frame.
- **Maps to:** **Annotation** (semantic scene), not a Track.

### 2019 — ROBUST-MIS (instrument instance) on HeiCo

See [HeiCo](#heico-heidelberg-colorectal) below. EndoVis 2019 also ran **Surgical Workflow and Skill Analysis** ([HeiChole](#heichole)) and **SCARED** (stereo depth / reconstruction, [arXiv:2101.01133](https://arxiv.org/abs/2101.01133)) — depth is a different family (dense geometry), not a Frame class / Phase / Triplet / mask Track.

### 2021–2022 — CholecTriplet

EndoVis uses CholecT45/T50 for triplet **recognition** (2021) then triplet **detection** with boxes (2022). Same families as [CholecT50](#cholect45--cholect50).

### 2022 — SAR-RARP50

See [SAR-RARP50](#sar-rarp50).

### 2024 — PhaKIR

See [PhaKIR](#phakir-endovis-2024). Adds **instrument keypoint estimation** plus phase and instance masks on full cholecystectomy videos.

---

## CholecSeg8k

Paper: Hong et al., [arXiv:2012.12453](https://arxiv.org/abs/2012.12453). Official dump: [Kaggle CholecSeg8k](https://www.kaggle.com/datasets/newslab/cholecseg8k) (NEWSLab / NTU).

8,080 Frames from 17 Cholec80 videos, packed as 101 folders of **80 consecutive Frames** (854×480). Preparation and ending phases were skipped. PixelAnnotationTool PNG masks (color, annotation, watershed).

- **Source family:** “semantic segmentation”; “pixel-level” labels for “thirteen classes”.
- **What is labeled:** class 0–12: Black Background, Abdominal Wall, Liver, Gastrointestinal Tract, Fat, Grasper, Connective Tissue, Blood, Cystic Duct, L-hook Electrocautery, Gallbladder, Hepatic Vein, Liver Ligament. GI tract and liver ligament are super-classes. “Not all 13 classes appear in every frame.”
- **Durable unit:** pixel mask. Semantic, **not instance**. Consecutive short Clips, not the full source video.
- **Exclusive vs multi-label:** exclusive **per pixel** (one class id). Several classes on one Frame. Two instrument classes (grasper, L-hook) can co-occur as different pixels.
- **Maps to:** **Annotation** as a semantic mask. Not a **Track**. Not Cholec80’s Phase / tool-presence vectors (those live on the parent Cholec80 set).

---

## HeiCo (Heidelberg Colorectal)

Paper: Maier-Hein et al., [arXiv:2005.03501](https://arxiv.org/abs/2005.03501). Synapse: [syn21903917](https://www.synapse.org/Synapse:syn21903917). Used for EndoVis 2017 workflow-in-sensor-OR and EndoVis 2019 **ROBUST-MIS**.

30 laparoscopic videos (10 proctocolectomy, 10 rectal resection, 10 sigmoid) plus OR device streams.

### Surgical phase

- **Source family:** “surgical phase”. They quote a hierarchy: phases ⊃ steps ⊃ activities. This release labels **phases only**.
- **What is labeled:** phase IDs by dominant activity then anatomical region (orientation; lymph-node/vessel dissection; several colon mobilizations; rectal dissection; extra-/intra-abdominal anastomosis; stoma; finalization; ID 13 “exceptional phases”). A phase **can occur multiple times**. Not all phases appear in every procedure type.
- **Durable unit:** **interval**. Annotator writes a list of phase IDs with **timestamps of starting points**. “Phases are defined by their starting point. The end of a phase thus occurs when the next phase starts.” Idle time assigned to the preceding phase. Start rule: instrument for the first activity of that phase enters the screen (or camera move to a new region).
- **Exclusive vs multi-label:** exclusive along the Clip (one current phase; repeats allowed over time).
- **Maps to:** **Phase** stored as interval starts, expanded to Frames.

### Instrument presence + instance-wise segmentation (ROBUST-MIS)

- **Source family:** ROBUST-MIS three tasks: “binary segmentation”; “multi-instance segmentation”; “multi-instance detection”.
- **What is labeled:** >10,000 Frames with instance masks. Binary: pixel 1 = any instrument, 0 = none. Multi-instance: mask values `'1','2',…` = different instrument instances on **that Frame**. Detection: locate instances (boxes or similar). Context: device activity + phase for every Frame of the 30 videos.
- **Durable unit:** pixel mask on sampled Frames (every 60 s plus dense 1 fps around phase transitions). Each “case” for the challenge is a **10 s snippet (250 Frames) + mask on the last Frame**. Instance numbers are on that annotated Frame; the paper does not describe identity Tracks across the full procedure.
- **Exclusive vs multi-label:** exclusive per pixel; several instances on one Frame.
- **Maps to:** **Annotation** (instance masks). **Phase** as context. Presence is implied by the mask, also shipped as Frame context.

---

## HeiChole

Paper: Wagner et al., *HeiChole benchmark*, [arXiv:2109.14956](https://arxiv.org/abs/2109.14956). EndoVis 2019: [Surgical Workflow and Skill Analysis](https://endovissub-workflowandskill.grand-challenge.org/). Synapse: [syn18824884](https://www.synapse.org/Synapse:syn18824884).

33 laparoscopic cholecystectomies, three German centers, 22 h. Anvil framewise labels. Challenge output: CSV from a video.

### Phase

- **Source family:** “surgical phase”; “framewise annotation of seven surgical phases”.
- **What is labeled:** seven phases “analogous to the Cholec80 data set”: P0 preparation, P1 calot triangle dissection, P2 clipping and cutting, P3 gallbladder dissection, P4 gallbladder packaging, P5 cleaning and coagulation, P6 gallbladder retraction. “The phases did not necessarily occur in a fixed order.” 250 phase transitions in the set.
- **Durable unit:** exclusive Phase along the Clip, stored **one value per Frame**.
- **Exclusive vs multi-label:** exclusive. “Annotations for surgical phase were one value per frame.”
- **Maps to:** **Phase**.

### Action

- **Source family:** “surgical action”; “functional component” of an activity (grasp, hold, cut, clip). Challenge did **not** require recognizing the performer.
- **What is labeled:** four actions A0 grasp, A1 hold, A2 cut, A3 clip. Also (in the full annotation, not all used in the challenge) performer: surgeon left / right / assistant. “A sequence of related gestures.”
- **Durable unit:** per-Frame class. “Annotations for action were a 4D binary vector per frame.”
- **Exclusive vs multi-label:** multi-label. Several of the four bits can be 1.
- **Maps to:** **Frame class** (verb-only; **not** a **Triplet** — no target anatomy).

### Instrument presence

- **Source family:** “instrument presence detection”.
- **What is labeled:** 21 named instruments + “undefined instrument shaft”, grouped in 7 categories (grasper, clipper, coagulation, scissors, suction-irrigation, specimen bag, stapler). Visible as soon as the characteristic tip appears; remains labeled if only the shaft stays; unknown shaft if a shaft enters without a prior tip (except clipper / suction / stapler, which have characteristic shafts).
- **Durable unit:** per-Frame class. Challenge used a 21-D (plus reserved slots) binary vector; category vector also defined.
- **Exclusive vs multi-label:** multi-label.
- **Maps to:** **Frame class**.

### Skill

- **Source family:** “surgical skill”; modified GOALS.
- **What is labeled:** five integer 1–5 dimensions (depth perception, bimanual dexterity, efficiency, tissue handling, difficulty). Autonomy omitted (cannot score from intra-abdominal video alone).
- **Durable unit:** **Clip-level score**, plus the same vector for Phase P1 and Phase P3 as their own “videos”. Not per Frame. Challenge: “an entire video could be used as input.”
- **Exclusive vs multi-label:** n/a at Frame; five scores per scored Clip.
- **Maps to:** not in CONTEXT (procedure-level scores).

---

## SAR-RARP50

Paper: Psychogyios et al., [arXiv:2401.00496](https://arxiv.org/abs/2401.00496). EndoVis 2022. Data: [UCL RDR](https://rdr.ucl.ac.uk/projects/SAR-RARP50_Segmentation_of_surgical_instrumentation_and_Action_Recognition_on_Robot-Assisted_Radical_Prostatectomy_Challenge/191091). Eval: [surgical-vision/SAR_RARP50-evaluation](https://github.com/surgical-vision/SAR_RARP50-evaluation).

50 DVC-suturing segments from in-vivo robot-assisted radical prostatectomy (da Vinci Si). Three challenge tasks: action recognition, semantic instrumentation segmentation, multitask.

### Action recognition (gestures)

- **Source family:** “action recognition”; “decomposing real surgical demonstrations into fine-grained temporal segments”; “surgical gestures”.
- **What is labeled:** seven bi-manual gestures + Other (Table 1): G0 Other; G1 Picking-up the needle; G2 Positioning the needle tip; … G5 Tying a knot; G6 Cutting the suture; G7 Returning/dropping the needle.
- **Durable unit:** **interval** on the Clip, then **every Frame** between transitions. Annotators “assigned [labels] to frames where a new surgical action began, effectively annotating all frames between action transitions.” Released as frame list + label list at **10 Hz**. Metrics: frame-wise accuracy and segmental F1@10.
- **Exclusive vs multi-label:** exclusive. One gesture class per Frame (including Other).
- **Maps to:** exclusive step/gesture along the Clip — **Phase**-like, but the source word is **gesture / action**, not surgical phase. Not a **Triplet**.

### Surgical instrumentation semantic segmentation

- **Source family:** “surgical instrumentation semantic segmentation”; “semantic labels at the pixel level.”
- **What is labeled:** nine classes: shaft, wrist, claspers, suturing needle, suture thread, surgical clip, suction tool, needle holder, catheter. **Each pixel one class**; occluder wins. Not instance ids. Sampled at **1 Hz**, 12,998 train + 3,252 test Frames.
- **Durable unit:** pixel mask.
- **Exclusive vs multi-label:** exclusive per pixel; several classes on one Frame.
- **Maps to:** **Annotation** (semantic parts), not a **Track**.

---

## CATARACTS (endoscopic-adjacent: surgical microscope)

2017 challenge home: [cataracts.grand-challenge.org](https://cataracts.grand-challenge.org/). Paper: Al Hajj et al., *CATARACTS: Challenge on automatic tool annotation for cataRACT surgery*, MedIA 52:24–41, 2019 (IEEE DataPort cites this). Dump: [IEEE DataPort CATARACTS](https://ieee-dataport.org/open-access/cataracts). Later: [CATARACTS 2018](https://cataracts2018.grand-challenge.org/), [CATARACTS 2020](https://cataracts2020.grand-challenge.org/) (EndoVis 2020 **activity recognition**). Pixel follow-on: [CaDIS](#cadis).

50 cataract surgeries, Brest. Two videos each: **microscope** (~30 fps, tool–tissue) and **surgical tray** (~50 fps). ~9 h per stream.

### 2017 — Tool presence (“tool annotation”)

- **Source family:** “automatic tool annotation”; “indicate which tools are being used by the surgeon at each instant”; “tool usage”; **not** “precisely locate tools in images.”
- **What is labeled:** presence of **21 surgical tools**, two expert annotators.
- **Durable unit:** per-Frame class on the microscope (and tray) streams. IEEE DataPort: train/test split for presence.
- **Exclusive vs multi-label:** multi-label (21 tools; several can be in use).
- **Maps to:** **Frame class**.

### Later editions — Activity / phase

- **Source family:** CATARACTS 2020: “recognize the activities done by the surgeons throughout the surgery.” IEEE DataPort: the same 50 videos “annotated for two main tasks: surgical tool presence detection and surgical activity recognition” (train/dev/test for activity). CaDIS paper states CATARACTS also has “frame-level surgical phase labels” and samples 14 phases from [Al Hajj 2019] and a follow-on activity paper.
- **Durable unit:** exclusive activity/phase along the Clip, stored per Frame (as used to sample CaDIS).
- **Maps to:** **Phase** (cataract workflow), source word often **activity**.

Microscope video is not laparoscopy; it is the standard public **endoscopic-adjacent** cataract set.

---

## Additional first-party sets that add a family

### MultiBypass140 — steps (and later IAEs)

Paper: Lavanchy, Ramesh et al., [arXiv:2312.11250](https://arxiv.org/abs/2312.11250). Official: [CAMMA](https://camma.unistra.fr/datasets/) / [CAMMA-public/MultiBypass140](https://github.com/CAMMA-public/MultiBypass140).

140 LRYGB videos, two centers. Two board-certified surgeons, MOSaiC. Ontology: **12 phases** and **46 finer-grained steps** (Table 1; S0 Null step … S45 Specimen retrieval). Cohen’s kappa 96% phases, 81% steps.

- **Source family:** “phase and step recognition”; “multi-level surgical activity recognition”.
- **Durable unit:** exclusive labels along the Clip at two grains; statistics quoted at **1 fps**.
- **Exclusive vs multi-label:** exclusive at each grain (one phase, one step).
- **Maps to:** **Phase** plus a finer exclusive **step** family (not named in CONTEXT).

CAMMA page also lists **intraoperative adverse events (IAEs)** with a 2025 MICCAI paper ([arXiv:2504.16749](https://arxiv.org/abs/2504.16749)). The 2023 phase/step paper does not define the IAE schema; treat IAEs as a later event family on the same Clips.

### Endoscapes — Critical View of Safety

Paper: Murali et al., [arXiv:2312.12429](https://arxiv.org/abs/2312.12429). Repo cited there: CAMMA-public/Endoscapes.

201 LC videos. Three annotation densities:

| Subset | What | Unit | Exclusive? |
| --- | --- | --- | --- |
| Endoscapes-CVS201 | three CVS criteria (C1 Two Structures, C2 Hepatocystic Triangle Dissection, C3 Cystic Plate), each a **binary image-level** flag; three experts, majority vote | per-Frame class, 1 Frame / 5 s in the dissection window | **multi-label** (criteria stack). Overall CVS = all three | 
| Endoscapes-BBox201 | boxes for 5 anatomy classes + 1 tool class | instance row, 1 / 30 s | several boxes |
| Endoscapes-Seg50 | instance + semantic masks, same 6 classes | pixel mask | exclusive per pixel |

- **Source family:** “automated assessment of the Critical View of Safety (CVS)”; also “instance segmentation, object detection, and CVS prediction.”
- **Maps to:** **Frame class** (CVS criteria). Boxes/masks → **Annotation** / detection rows. Not a **Triplet**.

### CholecTrack20 — identity Tracks

Paper: Nwoye et al., CVPR 2025, [arXiv:2312.07352](https://arxiv.org/abs/2312.07352). Project page cited in the paper: [camma-public/cholectrack20](https://github.com/camma-public/cholectrack20). Official blurb: [CAMMA](https://camma.unistra.fr/datasets/).

20 full-length cholecystectomy videos from Cholec80/CholecT50, annotated at **1 fps** (~35K Frames, ~65K tool instances).

- **Source family:** “multi-class multi-tool tracking”; “multi-perspective trajectories” — **intraoperative**, **intracorporeal**, **visibility**.
- **What is labeled:** spatial location (box), category, **track identity (ID)**, operator/trocar, **phase**, **scene visual challenge**. IDs reassigned from class, location, and which hand/trocar. Visibility tracks end when the tool leaves the camera (2 s tolerance). Intracorporeal tracks survive off-camera until the tool exits the body. Intraoperative tracks last from first to last in-body appearance, including re-insertion.
- **Durable unit:** **Track across Frames** (three parallel ID schemes) + per-Frame box.
- **Exclusive vs multi-label:** several tools on one Frame; one identity per tool trajectory.
- **Maps to:** **Track** (the first public cholecystectomy set whose stated product is cross-Frame identity). Phase and visual-challenge flags → **Phase** / **Frame class**.

### PhaKIR (EndoVis 2024) — keypoints

Challenge: [phakir.re-mic.de](https://phakir.re-mic.de/). Dataset paper: Rueckert et al., [arXiv:2511.06549](https://arxiv.org/abs/2511.06549). Zenodo: [record 15740620](https://zenodo.org/records/15740620).

Challenge text: 13 real cholecystectomy videos, three hospitals. Public dataset paper describes **eight complete videos** (one is a re-annotation of HeiChole2). Phase on **every Frame at 25 fps**. Instance masks + keypoints on **1 fps**.

- **Source family:** “surgical phase recognition”; “instrument instance segmentation”; “instrument keypoint estimation.”
- **Phase:** Cholec80’s seven phases **plus an undefined phase for transitions**. Timestamps of transitions; Frames between start/end inherit the phase. Start = first appearance of characteristic instruments; end = those instruments gone. Exclusive. Maps to **Phase**.
- **Instance segmentation:** 19 instrument categories; “Multiple instances of the same class were distinguished.” Pixel mask. Maps to **Annotation**.
- **Keypoints:** “instrument tip(s), shaft-tip transition, shaft” as coordinates. Instance rows of points. **New family** relative to the ticket list. Not a mask Track.

### AutoLaparo — laparoscope motion (and hysterectomy phases + part masks)

Paper: Wang et al., MICCAI 2022, [arXiv:2208.02049](https://arxiv.org/abs/2208.02049). Official: [autolaparo.github.io](https://autolaparo.github.io/).

21 full-length laparoscopic hysterectomy videos.

1. **Surgical workflow recognition** — 7 exclusive phases (Preparation … Washing). “Each frame is annotated with a phase label.” Maps to **Phase**.
2. **Laparoscope motion prediction** — 300 × 10 s clips; motion time T at second 5; **seven exclusive modes**: Static, Up, Down, Left, Right, Zoom-in, Zoom-out. Clip-level / interval class. **New family** (camera motion, not tissue action).
3. **Instrument and key anatomy segmentation** — 1,800 Frames, LabelMe, **shaft vs manipulator** per instrument type + uterus. Pixel masks. Maps to **Annotation**.

### CaDIS — pixel scene on CATARACTS

Paper: Grammatikopoulou et al., [arXiv:1906.11586](https://arxiv.org/abs/1906.11586). 4,670 microscope Frames from CATARACTS train videos. **36 classes** (4 anatomy, 29 instruments, 3 other). Semantic pixel masks; exclusive per pixel. Complements CATARACTS presence/activity with the same **semantic-mask** family as CholecSeg8k / EndoVis 2018.

---

## How families sit on a Frame (checkable)

On **one Frame** of a cholecystectomy Clip, public sets actually put:

| Stack | Example source | Exclusive? |
| --- | --- | --- |
| One phase | Cholec80, HeiChole, PhaKIR | yes |
| Zero or more tool-presence bits | Cholec80, HeiChole | no (multi-hot) |
| Zero or more triplet rows | CholecT50 | no |
| Zero or more verb-only action bits | HeiChole | no |
| Semantic or instance pixel mask | CholecSeg8k, EndoVis, HeiCo, PhaKIR | exclusive **per pixel** |
| Zero or more identity Tracks / boxes | CholecTrack20 | several Tracks |
| Zero or more CVS bits | Endoscapes | no (three criteria) |

Phase is the only family the cited cholecystectomy sets treat as **mutually exclusive along the Clip**. Tool presence, triplets, HeiChole actions, and CVS **stack**. Pixel tasks are exclusive at the pixel, not at the Frame.

HeiCo colorectal phases **repeat** and are stored as **start timestamps**, not a second concurrent phase. SAR-RARP gestures are exclusive on their short suturing Clip, like a Phase, but the source name is gesture/action.

---

## Sources not treated as primary here

Blog roundups and secondary surveys were not used except to find a paper URL, which was then opened. GitHub raw READMEs for CAMMA repos were blocked from this environment; CAMMA’s official dataset page, arXiv HTML/PDF, grand-challenge protocol pages, Kaggle dataset card, IEEE DataPort, AutoLaparo site, PhaKIR site, and the papers above are the cited first-party record.

JIGSAWS is widely cited for **gesture + skill** on **bench-top** robotic tasks (kinematics + video). It is not an in-vivo endoscopic procedure set; HeiChole and SAR-RARP already document those families on real surgical video.

This file does not choose v1 task types for the product.
