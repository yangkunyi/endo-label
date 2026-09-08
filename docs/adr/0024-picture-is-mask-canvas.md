# Picture clicks are mask prompts, never play

media-chrome defaults to click-to-play. CVAT and Encord play with Space / a play button and treat the picture as an annotation canvas. This sitting does the same once mask overlay is on: the overlay captures pointer; left click/drag is a positive Geometric / Scribble Prompt, right is negative. Play is Space, `MediaPlayButton`, and the Ruler. Click-to-play on the `<video>` is off.

Rejected: arming a Point tool to switch the picture back to YouTube-style click-to-play; requiring a modifier key to draw.
