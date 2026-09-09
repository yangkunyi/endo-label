# 01 — Dual Editor Cards and soft Library selection

**What to build:** Wrap Now and Library in the right editor rail into distinct, bounded Editor Cards with micro-headers and count badge pills (`NOW · 1`, `LIBRARY · 5`), replacing bare text headings and hairlines. In Now, display compact colored badges and calm muted empty states (`No phase on frame N`, `No class tags on frame N`) when current Frame has no labels. In Library rows (Phase and Class), replace harsh blue stripes and flat gray fills with soft 12%–15% semantic-tint backgrounds matching the label's color, delicate matching borders, crisp text, and a right-aligned checkmark icon (`✓`). Keep trash buttons dimmed at low opacity until row hover, and anchor Add Vocab inputs as a permanent compact footer inside the Library Card.

**Blocked by:** None — can start immediately.

Status: MERGED

- [x] Now and Library render as two distinct bounded Editor Cards with subtle surface background and fine border (`rounded-lg p-3`)
- [x] Card headers display uppercase titles and item count badge pills (`NOW · N`, `LIBRARY · N`)
- [x] When current Frame has no labels, Now displays calm muted text (`No phase on frame N`, `No class tags on frame N`) instead of bare text
- [x] Selected Library rows render with a soft 12%–15% semantic background tint derived from `labelColor`, subtle border, high-contrast text, and a right-aligned checkmark icon (`✓`)
- [x] Unselected Library rows render transparently with muted text and gentle hover highlights, with no layout shift upon selection
- [x] Row delete trash buttons remain dimmed at low opacity by default and transition to clear destructive red on hover
- [x] Add Vocab input area is embedded as an internal card footer separated by a top border hairline inside the Library Card
- [x] Phase and Class single-click toggles, span painting, and rename/delete workflows continue working without regression
