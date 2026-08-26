# class and triplet may paint an interval; durable form stays per Frame

Phase already has `POST /api/phase/{clip}/span`. The labeler also paints class flags and triplet rows across a Frame range, using the same inclusive `from`/`to` (order-insensitive). The store does **not** grow a new document shape: still one class set and one triplet list per Frame. class **unions** one flag on, or removes that one flag, across the range — it does not replace the whole set. triplet **adds** a triple to each Frame that does not already have it, or **removes** matching triples by name (ids stay per-Frame). Each kind gets its own span HTTP so a 500-Frame range is one request, not a client loop. Independent stores: a class span does not read or write phase or triplet. Immediate persist. Not Task-focus: other editors stay usable.

## Considered Options

- **Client loops PUT/POST per Frame** — rejected; long Clips stall and can stop halfway.
- **Replace the whole class set on the range** — rejected; stackable flags would drop (`grasper` lost when painting `blurred`).
- **Always append duplicate triplet rows on the range** — rejected; a second paint would double every Frame.
- **Timestamps / fps in the JSON** — rejected; Frame Pool is JPEG indexes `0..N-1`. Playback fps is chrome only.

## Consequences

- Parent spec stories 36 and 53 (class/triplet do not copy in time by themselves) still hold: a span is an explicit paint, not an implicit copy on scrub or play.
- `CONTEXT.md` now says class and triplet may paint an interval.
- Single-Frame chip toggle, Add row, Delete, and Clear this Frame stay; they are not replaced by span.
