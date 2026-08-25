# Which annotators host several task families in one project

Type: research
Status: resolved
Blocked by: None

## Question

From primary sources (official docs, product manuals, open-source UI/schema code), which widely used annotators can hold **more than one** of these families on the **same** video/clip/project: Phase (or equivalent timeline class), per-frame multi-label class, action Triplet, instance/Track pixel mask?

Inventory at least: CVAT, Label Studio, one commercial surgical or medical video desk if docs are first-party, and this org’s `scribble_service` if the tree is reachable on disk. For each tool: can one project mix those families; how they are stored (separate tasks vs one task with several label types); any documented limitation (e.g. masks yes, triplets no).

This is an inventory, not a recommendation. Do not lock our desk.

Write findings to `.scratch/endo-label-product/research/multi-task-annotators.md`.

## Answer

None of CVAT, Label Studio, Encord, or this org’s `scribble_service` host all four families as first-class, labeler-filled types on one video. CVAT / Label Studio / Encord can put timeline or frame class next to instance geometry in **one** task/config/ontology. Pixel-mask **Tracks** are first-class in CVAT, Encord, and `scribble_service`; Label Studio’s documented video pixel path is Enterprise `VideoVector` (Community SAM2-video is boxes). No inspected tool has a native Frame-row **Triplet**. `scribble_service` writes tissue Track masks on a Clip and only **reads** Triplet GT.

Detail: [../research/multi-task-annotators.md](../research/multi-task-annotators.md)
