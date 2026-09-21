# pipeline/_parked/

Code that is written, working, and measured — but not currently imported by
the live pipeline. Nothing here runs on any code path from `run.py`,
`stagerun.py`, or `service/`.

Why keep it instead of deleting it: each of these is a candidate for
**Stage 6's calibration**, and the decision to keep M1 (the current, simpler
method) over M10 (this file) was a measured call, not an oversight — see
`docs/stage06_experiments.md` and `docs/experiments.md` (`E-m10-tested`).
Whoever revisits Stage 6's scale derivation should start here rather than
re-deriving it.

## Contents

`stage6_m10_candidate.py` — everything needed to calibrate Stage 6 from the
reference cube's **fitted faces** instead of its volume ratio:

1. **Fitted-face edge measurement** (originally `pipeline/core/faces.py`) —
   `fit_box_faces`, `reference_edges`. Groups a box mesh's triangles into
   faces by normal direction and measures opposite-face separation through
   the mesh centroid.
2. **Marker cross-check** (originally `pipeline/core/markers3d.py`) —
   `detect_marker_quads`, `quad_metrics`, `edge_lengths_by_axis`,
   `infer_up_axis`. An independent length measurement from the printed
   ArUco markers, which the M1 calibration never touches.
3. **The parked Stage 6 rewrite** (originally the commented-out block at the
   bottom of `pipeline/stages/volume.py`) — the full `compute_volumes`
   variant that uses (1) and (2) instead of the volume-ratio scale.

## The verdict, in one line

Measured against five water-displacement ground-truth captures
(`docs/experiments.md`, `E-m10-tested`, 2026-08-27): M1 (ships) scores 1.7%
mean absolute error; M10 (this file) scores 4.1%. M10 is not a straightforward
upgrade — keep it parked until a reason to prefer it shows up in the ground
truth, not just in the geometry argument for it (which is still sound; see the
file's own docstrings).

## If you want to try it

Nothing here is wired into `compute_volumes()` in
`pipeline/stages/volume.py`. To experiment, import the pieces you need from
this file directly rather than uncommenting anything in the live stage —
that keeps the working M1 path untouched while you test.
