# Mask Annotation is written on each successful edit

phase / class / triplet already persist on a successful write. A successful Predict, leftover-point delete, Clear mask, Undo restore, or completed Propagate Job immediately replaces `data/mask/<clip>/annotation.json` (full document, atomic). There is no Save button. GPU Session and Geometric Memory are unchanged: memory is still not on disk. The extra cost is a JSON rewrite, not extra GPU.

Rejected: CVAT-style explicit Save; keeping a single-frame Predict only in Session until close.
