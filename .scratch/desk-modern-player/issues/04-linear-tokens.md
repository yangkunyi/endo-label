# 04 — Linear-style tokens over the shadcn kit

**What to build:** Replace the sitting's dark theme with Linear-style tokens on the existing shadcn kit: canvas `#0a0a0b`; surfaces `#141516` / hover `#1a1b1c`; hairlines `#23252a` / `rgba(255,255,255,.06)`; radius 6/8/12 (buttons, cards, player); accent indigo `#5e6ad2` for selection, focus rings, Playhead; label colors keep their stable hue but desaturated (`HSL(…, 35%, 55%)`); Inter + tabular-nums small clock; no shadows — hierarchy by surface luminance and hairlines. Works on jpeg and video Clips alike.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Canvas, surface ladder, and hairline tokens applied desk-wide
- [ ] Radius 6/8/12 on buttons, cards, and the player
- [ ] Accent `#5e6ad2` on selection, focus rings, and Playhead
- [ ] Label colors keep stable hue, desaturated for dark surfaces
- [ ] Same style on jpeg and video Clips; no light theme
