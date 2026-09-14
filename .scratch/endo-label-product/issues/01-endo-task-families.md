# endo-label-product/01 — What task families endoscopic datasets annotate

## Question

From primary sources (dataset papers, official dataset pages, annotation READMEs, and first-party schemas — not blog roundups), what **task families** do widely used endoscopic / laparoscopic surgical-video datasets actually annotate?

Cover at least: Cholec80, CholecT45 or CholecT50, EndoVis instrument segmentation (and later EndoVis years if they add tasks), CholecSeg8k or equivalent pixel datasets, HeiChole / HeiCo, SAR-RARP (or SAR-RARP50), CATARACTS if it is endoscopic-adjacent and widely cited, and any other first-party surgical-video set that clearly adds a family not in that list.

For each dataset, record:

- Task family name in the source’s words (phase, tool presence, triplet, instrument mask, action, workflow, …)
- What is labeled (the object of annotation)
- Durable unit: per-Frame class, exclusive Phase along the Clip, interval with start/end, instance row, pixel mask, Track across Frames
- Exclusive vs multi-label on one Frame
- Citation (paper, official repo, or schema file)

This is a fact ticket. Do not recommend which families our product should include.

Write findings to `.scratch/endo-label-product/research/endo-task-families.md`.

## Answer

Public endoscopic sets actually label these families (source words): **phase / workflow** (exclusive along the Clip), **tool presence** (multi-hot Frame class), **action triplet** ⟨instrument, verb, target⟩ (several rows on one Frame), **pixel masks** (binary / parts / type / instance / semantic scene), **identity Tracks** (CholecTrack20), **verb-only action / gesture**, **skill** (Clip-level), **step** (finer exclusive workflow), **CVS criteria**, **keypoints**, **boxes**, **laparoscope motion**. Phase is the only cholecystectomy family treated as mutually exclusive along the Clip; tools, triplets, HeiChole actions, and CVS stack on one Frame.

Cited record: [research/endo-task-families.md](../research/endo-task-families.md). No product pick.
