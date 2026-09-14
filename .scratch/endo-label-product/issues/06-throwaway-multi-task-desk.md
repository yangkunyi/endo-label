# endo-label-product/06 — Throwaway desk for all four tasks on one Clip

## Question

Does one desk, on one Clip, let a labeler run **all four** task types from [Which 2-3 task types the throwaway prototype runs](04-prototype-task-pick.md) (Phase, Frame class, Triplet, mask/Track) without the tasks fighting over Frame / Session / the durable word from [What word names a durable label across task types](03-umbrella-durable-term.md)?

Use `/prototype`. Throwaway. Not the product. Phase form follows [Phase stored per Frame or as intervals](05-phase-durable-form.md). Capture the prototype as a primary source (`prototype/<name>` branch) and link it from this ticket. The answer is what we learned about **shared shape**, not a pretty UI.

Prototype file: [prototype/four-task-desk.html](../prototype/four-task-desk.html)

## Answer

The four can share one Clip without fighting. Verdict from clicking the throwaway desk: **good enough** as shared shape.

Learned (and already folded into `CONTEXT.md` / map Notes while iterating):

- Address is Frame index for phase, class, triplet, and mask.
- No umbrella word: **phase**, **class**, **triplet**, **mask**.
- **class** is a stack of named flags (tools, blur, …), customizable list.
- **phase** / **triplet** vocabs are customizable lists too.
- **mask** uses this desk’s SAM contract: Predict on this Frame, explicit Propagate for other Frames. Propagate does not write the other three.
- HTML Fake Predict is a dummy box; real SAM stays in `video_label_service` until reuse is decided.

Primary source: the HTML file above (not a `prototype/` git branch yet).
