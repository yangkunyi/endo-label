# Phase stored per Frame or as intervals

Type: grilling
Status: resolved
Blocked by: 01

## Question

Given how primary datasets store Phase ([What task families endoscopic datasets annotate](01-endo-task-families.md)), what durable form does **this** product use?

- One exclusive Phase label on each Frame
- Intervals with start Frame and end Frame (Frames inside inherit)
- Both (one is canonical, the other is a view)

Do not pick the Phase name list here (taxonomy is still fog).

## Answer

**Both:** one exclusive Phase **per Frame** is canonical (same address as class, Triplet, mask). The labeler paints an **interval**; every Frame in that span is written. Taxonomy still fog.
