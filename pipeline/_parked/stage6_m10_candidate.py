"""Stage 6, alternative calibration -- fitted reference faces + marker cross-check.

ARCHIVED / NOT IMPORTED BY THE LIVE PIPELINE. See README.md in this folder for
why this is kept and what it would take to adopt it. In one line: measured
against water-displacement ground truth, this method (M10) scores 4.1% mean
absolute error against 1.7% for what ships (M1, the volume-ratio calibration
in pipeline/stages/volume.py). See docs/stage06_experiments.md and
docs/experiments.md (E-m10-tested) for the full comparison.

This file consolidates three things that used to live in three separate
places, none of them imported by anything live:
  - pipeline/core/faces.py       -> section 1, FITTED-FACE EDGE MEASUREMENT
  - pipeline/core/markers3d.py   -> section 2, MARKER CROSS-CHECK
  - the "PARKED" block at the end of pipeline/stages/volume.py
                                  -> section 3, THE PARKED STAGE 6 REWRITE

Consolidated 2026-08-29 so a reader only has one file to open, not three.
Nothing in this file's behaviour changed in the move -- section boundaries
below mark exactly where each original file's content starts, and each
original file's own module docstring is kept intact (as a plain string
literal, not the module's docstring -- only the very first one above counts
as that) so nothing about the original explanation is lost.
"""

# ===========================================================================
# SECTION 1 — fitted-face edge measurement (was pipeline/core/faces.py)
# ===========================================================================

"""Measure a box-shaped reference by fitting its own faces.

Stage 6 needs one number from the reference cube: its edge length. That number
sets the scale for every result the pipeline produces.

Taking it from an oriented bounding box is unreliable, and measurably so. On
inputs/est_325 the OBB around the reference exceeded the convex hull of its own
points by 6.8% in volume — an OBB must *contain* the hull, so that excess is
pure fitting error. Spread over three axes it is +2.2% per edge, consistent with
the box being mis-rotated by roughly 1.3 degrees. On a cube that lands directly
on the edge length:

    face-to-face box       2505.7 cm3     the cube's real size
    convex hull of points  2479.2 cm3     -1.1%
    oriented bounding box  2647.8 cm3     +5.7%

A cube does not need a bounding box to be measured. Its face normals *are* its
axes, so fitting the faces recovers the orientation exactly instead of hoping a
hull-based algorithm finds it. Measured effect on the reference's own volume
error: -10.7% -> -4.7%.

This module is for box-shaped references only. It makes no sense for a limb and
is never applied to one.
"""
import numpy as np

# A face must hold at least this share of total surface area to be trusted.
# Corner and edge triangles are numerous but tiny; area weighting means they
# cannot outvote a real face, and this floor keeps a sliver from being fitted
# as though it were one.
MIN_FACE_AREA_FRAC = 0.02

# Two normals belong to the same face below this angle.
FACE_NORMAL_TOL_DEG = 25.0


def _triangle_normals_and_areas(vertices, triangles):
    """Unit normal, area and corner positions for every usable triangle.

    Degenerate triangles — zero area, or corners so close that the normal comes
    out non-finite — are dropped rather than carried with a fudged normal, since
    a meaningless direction would join whichever face cluster it happened to
    land nearest.
    """
    triangle_corners = vertices[triangles]
    cross_products = np.cross(triangle_corners[:, 1] - triangle_corners[:, 0],
                              triangle_corners[:, 2] - triangle_corners[:, 0])
    # |a x b| is twice the triangle's area.
    areas = np.linalg.norm(cross_products, axis=1) * 0.5
    with np.errstate(invalid="ignore", divide="ignore"):
        normals = cross_products / np.maximum(
            np.linalg.norm(cross_products, axis=1, keepdims=True), 1e-12)
    usable = np.isfinite(normals).all(axis=1) & (areas > 0)
    return normals[usable], areas[usable], triangle_corners[usable]


def fit_box_faces(vertices, triangles,
                  min_area_frac=MIN_FACE_AREA_FRAC,
                  tol_deg=FACE_NORMAL_TOL_DEG):
    """Group a box mesh's triangles into faces and measure opposite separations.

    Greedy area-weighted clustering on the unit normal sphere: repeatedly take
    the largest remaining area direction, absorb everything within `tol_deg` of
    it, and fit a plane offset as the area-weighted mean of the face's triangle
    centroids projected on that normal.

    Faces are then paired by anti-parallel normals. Separation is the distance
    between the two plane offsets along the shared axis.

    Returns a list of dicts, one per opposite-face pair, sorted by area:
        {"axis": unit normal (3,), "separation": float,
         "area": combined area, "n_tris": int}
    """
    vertices = np.asarray(vertices, dtype=np.float64)
    triangles = np.asarray(triangles, dtype=np.int64)
    if len(triangles) < 12:
        return []

    triangle_normals, triangle_areas, triangle_corners = \
        _triangle_normals_and_areas(vertices, triangles)
    if len(triangle_normals) == 0:
        return []
    total_area = float(triangle_areas.sum())
    triangle_centroids = triangle_corners.mean(axis=1)
    # Two normals count as the same face when their dot product clears this.
    same_face_cosine = np.cos(np.radians(tol_deg))

    unclaimed = np.ones(len(triangle_normals), dtype=bool)
    faces = []
    while unclaimed.any():
        # Stop once what is left cannot form a qualifying face.
        #
        # Without this the loop runs until every last sliver is claimed, and a
        # sliver whose normal matches nothing claims only itself -- one
        # iteration per triangle, each rebuilding a (4000 x unclaimed)
        # similarity matrix. On the Aug 2026 cubes (12-23k triangles) that did
        # not finish in 90 s on four of five captures, so this function, and
        # with it the whole fitted-face calibration, was unrunnable on them.
        #
        # A face has to clear min_area_frac to be recorded at all, so once the
        # remaining area is below that fraction no further iteration can
        # produce one. Breaking there is not an approximation: it cannot skip a
        # face the loop would otherwise have found.
        if float(triangle_areas[unclaimed].sum()) / total_area < min_area_frac:
            break
        # Seed on the direction carrying the most unclaimed area. Summing the
        # area of every candidate's neighbourhood is what makes this pick a
        # real face rather than one arbitrary large triangle.
        candidates = np.flatnonzero(unclaimed)
        if len(candidates) > 4000:
            # The similarity matrix below is candidates x unclaimed, so cap the
            # rows on a dense mesh. Largest-area first, since a real face is
            # never made only of slivers.
            candidates = candidates[np.argsort(-triangle_areas[candidates])[:4000]]
        similarity = triangle_normals[candidates] @ triangle_normals[unclaimed].T
        neighbourhood_area = (similarity >= same_face_cosine) @ triangle_areas[unclaimed]
        seed_triangle = candidates[int(np.argmax(neighbourhood_area))]

        on_this_face = unclaimed & (
            triangle_normals @ triangle_normals[seed_triangle] >= same_face_cosine)
        face_area = float(triangle_areas[on_this_face].sum())
        if face_area / total_area >= min_area_frac:
            face_normal = np.average(triangle_normals[on_this_face], axis=0,
                                     weights=triangle_areas[on_this_face])
            face_normal /= np.linalg.norm(face_normal) + 1e-12
            # Where the plane sits along its own normal.
            plane_offset = float(np.average(
                triangle_centroids[on_this_face] @ face_normal,
                weights=triangle_areas[on_this_face]))
            faces.append({"normal": face_normal, "offset": plane_offset,
                          "area": face_area, "n_tris": int(on_this_face.sum())})
        unclaimed &= ~on_this_face

    # Pair anti-parallel faces.
    #
    # Opposite faces are never *exactly* anti-parallel — on a real reconstructed
    # cube their normals differ by around a degree. Differencing the two plane
    # offsets then measures the gap where the planes would be if extended far
    # from the object, which on inputs/est_325 read 0.265 units against a true
    # 0.252. Measure the thickness through the mesh centroid instead: the sum of
    # the centroid's distances to the two planes. That is well defined however
    # the normals splay.
    mesh_centre = np.average(triangle_centroids, axis=0, weights=triangle_areas)
    pairs = []
    already_paired = set()
    for face_index, face in enumerate(faces):
        if face_index in already_paired:
            continue
        # The most anti-parallel partner, i.e. the smallest (most negative) dot
        # product. Starting the search at -same_face_cosine means a partner has
        # to be at least as anti-parallel as the tolerance allows.
        opposite_index, most_antiparallel = None, -same_face_cosine
        for other_index, other in enumerate(faces):
            if other_index == face_index or other_index in already_paired:
                continue
            alignment = float(face["normal"] @ other["normal"])
            if alignment < most_antiparallel:
                opposite_index, most_antiparallel = other_index, alignment
        if opposite_index is None:
            continue
        opposite = faces[opposite_index]
        already_paired.update({face_index, opposite_index})
        separation = (abs(face["offset"] - mesh_centre @ face["normal"]) +
                      abs(opposite["offset"] - mesh_centre @ opposite["normal"]))
        pairs.append({"axis": face["normal"], "separation": float(separation),
                      "area": face["area"] + opposite["area"],
                      "n_tris": face["n_tris"] + opposite["n_tris"]})

    pairs.sort(key=lambda p: -p["area"])
    return pairs


def reference_edges(vertices, triangles, up=(0.0, 0.0, 1.0)):
    """Edge lengths of a box reference, split into vertical and horizontal.

    Returns (vertical_or_None, [horizontal...], diagnostics dict). The vertical
    pair is the one whose axis is most aligned with `up`; it is reported but the
    caller should exclude it from the scale, because the reference rests on the
    floor and its underside is fabricated by Stage 3's floor extension.
    """
    pairs = fit_box_faces(vertices, triangles)
    diag = {"n_pairs": len(pairs),
            "pairs": [(p["separation"], p["n_tris"]) for p in pairs]}
    if not pairs:
        return None, [], diag

    up = np.asarray(up, dtype=np.float64)
    up = up / (np.linalg.norm(up) + 1e-12)
    align = [abs(float(p["axis"] @ up)) for p in pairs]
    vi = int(np.argmax(align))
    vertical = pairs[vi]["separation"] if align[vi] > 0.7 else None
    horiz = [p["separation"] for i, p in enumerate(pairs)
             if i != vi or vertical is None]
    diag["vertical_alignment"] = align[vi]
    return vertical, horiz, diag


# ===========================================================================
# SECTION 2 — marker cross-check (was pipeline/core/markers3d.py)
# ===========================================================================

"""Measure the reference cube with the markers printed on it.

Stage 6 derives scale from the cube's own fitted faces, so the cube always
measures REFERENCE_REAL_SIZE_CM whatever it really is, and the residual it
reports is a shape error that cannot see a wrong constant or a warped
reconstruction. The printed markers break that circularity: they are a second
structure in the scene that the calibration never touches.

They are also unusually good probes. ArUco locates corners to sub-pixel
accuracy, and those corner pixels index the pointmap directly — the frames in
predictions.npz are the exact tensors VGGT consumed — so a marker becomes a 3D
quadrilateral with no colour thresholding, no meshing and no coordinate
mapping between image and cloud.

Most of what that buys needs no physical constant at all. A printed marker is
flat and square, so any departure from flat or from square is reconstruction
error and nothing else. Measured on the two datasets:

    flatness     0.04-0.45 mm     the surface is locally accurate
    aspect       1.04-1.11        a square reconstructs 8% out of square
    diag ratio   0.999            so it is a rectangle, not a shear
    size spread  3.7-3.9%         one physical square, five faces

Only absolute size needs a ruler, and it is worth having: on inputs/small_leg
the photographs (rectified through the marker's own homography, no
reconstruction involved) put the printed square at 6.49-6.58 cm while the
reconstruction reads 6.325, a real -2.5 to -3.8% geometric error against a
length the calibration never used.
"""
import numpy as np

# ArUco family the reference cube carries. Confirmed against both datasets:
# ids 10-14, one per visible face, detected on every frame.
DEFAULT_DICT = "DICT_5X5_250"

# Minimum world_points_conf at all four corners. The pointmap is unreliable
# where confidence is low, and a single bad corner distorts every quantity
# derived from the quad. 1.5 keeps every marker in both datasets.
MIN_CONF = 1.5

# Reject a view whose marker is too foreshortened. A quad seen edge-on has a
# tiny image footprint, so its corners land within a pixel or two of each other
# and the plane through them is dominated by noise — this is what made naive
# normal averaging report impossible face geometry on est_325.
MIN_QUAD_PIXELS = 20.0


def _gray(frame):
    """One 518x518 uint8 image from the (3, H, W) float tensor VGGT was given."""
    import cv2
    rgb = (np.transpose(frame, (1, 2, 0)) * 255.0).clip(0, 255).astype(np.uint8)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)


def detect_marker_quads(predictions, min_conf=MIN_CONF, dict_name=DEFAULT_DICT):
    """Lift every detected marker into 3D.

    Returns {marker_id: [record, ...]}, one record per view, each holding the
    four 3D corners in pointmap units along with the frame it came from and its
    image-space size. Corners are kept per view rather than averaged: the views
    disagree, and that disagreement is signal.
    """
    import cv2

    images = predictions["images"]
    world = predictions["world_points"]
    conf = predictions["world_points_conf"]
    h, w = world.shape[1:3]

    dictionary = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, dict_name))
    detector = cv2.aruco.ArucoDetector(dictionary, cv2.aruco.DetectorParameters())

    out = {}
    for frame in range(images.shape[0]):
        corners, ids, _ = detector.detectMarkers(_gray(images[frame]))
        if ids is None:
            continue
        for quad, marker_id in zip(corners, ids.ravel()):
            px = quad.reshape(4, 2)
            side_px = float(np.mean([np.linalg.norm(px[i] - px[(i + 1) % 4])
                                     for i in range(4)]))
            if side_px < MIN_QUAD_PIXELS:
                continue
            u = np.round(px[:, 0]).astype(int)
            v = np.round(px[:, 1]).astype(int)
            if u.min() < 0 or v.min() < 0 or u.max() >= w or v.max() >= h:
                continue
            if float(conf[frame, v, u].min()) < min_conf:
                continue
            out.setdefault(int(marker_id), []).append({
                "frame": frame,
                "side_px": side_px,
                "corners": np.asarray(world[frame, v, u], dtype=np.float64),
            })
    return out


def quad_metrics(corners, scale=1.0):
    """Shape of one reconstructed marker, in whatever unit `scale` converts to.

    The marker is physically a flat square, so `aspect` and `flatness` are pure
    error terms and `diag_ratio` distinguishes a rectangle (sides unequal,
    diagonals still consistent) from a shear.
    """
    p = np.asarray(corners, dtype=np.float64) * scale
    sides = np.array([np.linalg.norm(p[i] - p[(i + 1) % 4]) for i in range(4)])
    diags = np.array([np.linalg.norm(p[0] - p[2]), np.linalg.norm(p[1] - p[3])])
    centred = p - p.mean(axis=0)
    normal = np.linalg.svd(centred)[2][2]
    return {
        "sides": sides,
        "side": float(sides.mean()),
        "aspect": float(sides.max() / sides.min()),
        "diag_ratio": float(diags.mean() / (sides.mean() * np.sqrt(2.0))),
        "flatness": float(np.abs(centred @ normal).max()),
        "normal": normal,
        "centre": p.mean(axis=0),
    }


def edge_lengths_by_axis(corners, up, scale=1.0, cos_tol=0.7):
    """Split a marker's four edges into those along `up` and those across it.

    A printed square has no long axis, so if its reconstruction stretches along
    one scene direction that is an anisotropic scale error and it transfers to
    every other measurement the pipeline makes.
    """
    p = np.asarray(corners, dtype=np.float64) * scale
    up = np.asarray(up, dtype=np.float64)
    up = up / np.linalg.norm(up)
    along, across = [], []
    for i in range(4):
        edge = p[(i + 1) % 4] - p[i]
        length = float(np.linalg.norm(edge))
        (along if abs(edge @ up) / length > cos_tol else across).append(length)
    return along, across


def infer_up_axis(quads):
    """The cube's vertical, from the marker layout alone.

    Only five faces carry markers; the sixth rests on the floor. So the top
    face is the one marked face with no antiparallel partner, and its normal is
    the vertical. This is a fallback for when the stage-3 levelling rotation is
    unavailable, and it is not always decisive — on est_325 every marker had a
    near-parallel partner, which cannot happen on a cube and means the normals
    there are too poorly conditioned to trust. Returns None in that case rather
    than a wrong axis.
    """
    normals = {}
    for marker_id, views in quads.items():
        per_view = [quad_metrics(v["corners"])["normal"] for v in views]
        # Sign is arbitrary per view; align them before averaging or they cancel.
        ref = per_view[0]
        aligned = [n if n @ ref >= 0 else -n for n in per_view]
        mean = np.mean(aligned, axis=0)
        norm = np.linalg.norm(mean)
        if norm > 0:
            normals[marker_id] = mean / norm
    if len(normals) < 3:
        return None, None
    partner = {k: max(abs(normals[k] @ normals[j]) for j in normals if j != k)
               for k in normals}
    top = min(partner, key=partner.get)
    # A genuine top face is perpendicular to all four sides; anything close to
    # parallel means the normals are noise and the answer would be arbitrary.
    if partner[top] > 0.5:
        return None, None
    return normals[top], top


# ===========================================================================
# PARKED — Stage 6 changes made on keng-branch, reverted to the main version
# ===========================================================================
#
# Everything above this line is main's Stage 6, restored verbatim. The work
# below was written on top of it during the Aug 2026 session and is kept here
# rather than deleted, because whether it is worth adopting is a call for
# whoever owns this stage.
#
# Four things changed. In rough order of how load-bearing they are:
#
# 1. SCALE FROM THE CUBE'S FITTED FACES, NOT ITS BOUNDING BOX
#    `_load_mesh_info` gained a `face_v/face_h` measurement via
#    `pipeline/core/faces.py:reference_edges`, and `compute_volumes` preferred
#    it over the OBB extents when available. The reasoning: an OBB around a
#    reconstruction with rounded rims and a grazing-incidence top face reports
#    the rim, not the face. Fitting the six face planes and measuring their
#    separations isolates the geometry from the alpha-shape rim rounding
#    (measured at 0.11-0.13 cm).
#    This is the change that MOVES EVERY REPORTED NUMBER, so it is the one to
#    scrutinise first. On small_leg it shifts the cube's own residual.
#
# 2. MARKER CROSS-CHECK (`_report_markers`, entirely new)
#    Reads the printed ArUco markers back out of stage 1's predictions.npz,
#    lifts their corners into 3D through the pointmap, and measures each as a
#    quad: flatness, aspect ratio, diagonal ratio, size spread across faces,
#    and vertical-vs-horizontal edge length. Needs `pipeline/core/markers3d.py`
#    and an `inference_dir` argument threaded in from the caller.
#    The point of it: every other number this stage prints is calibrated on the
#    cube, so the cube cannot disagree with itself. A printed marker is a
#    length the calibration never used, which makes it the only independent
#    check in the pipeline. Measured 0.4518 (small_leg) against 0.4507
#    (est_325) -- 0.24% agreement across two separate captures.
#
# 3. QUALITY GATES
#    Warnings beside the existing `h_disagree > 3` check: marker size spread
#    across faces (3.86% measured) and aspect departure from square (~8%).
#    Both are calibration-free, so they fire regardless of whether the
#    reference constant is right.
#
# 4. WARNINGS ON UNRELIABLE VOLUME METHODS
#    `_measure_volume` printed nothing when it fell back. Flood-fill leaks
#    through an open surface and can under-read by an order of magnitude while
#    still returning a plausible number; convex hull ignores the surface
#    entirely, so a broken mesh scores the same as a good one. These are the
#    cheapest change here and the least entangled with the rest.
#
# Also corrected two comments at the old lines 406 and 413, which attributed
# the cube's vertical deficit to the floor truncating it. Measurement
# contradicts that: the floor plane is right to ~1 mm (marker-centroid height
# 7.03 +- 0.14 cm against a physical 7.00). The deficit is a grazing-angle top
# face plus rim rounding.
#
# CALLERS: `inference_dir=` was being passed from stagerun.py run_stage6 and
# from pipeline/orchestrator.py. Both are commented out to match this revert --
# search for "PARKED" in those files.
#
# `pipeline/core/faces.py` and `pipeline/core/markers3d.py` are left in the
# tree. Nothing in the pipeline imports them now.
#
# --- full keng-branch implementation follows, commented out verbatim -------
#
# """Stage 6 — Compute real-world volumes using the ArUco reference (box).
#
# Scale derivation (from a measured LENGTH, not a volume ratio):
#     linear_scale = REFERENCE_REAL_SIZE_CM / mean(ref OBB edges)   # cm per unit
#     k            = linear_scale ** 3                              # cm³ per unit³
#     real_vol     = mesh_vol * k
#     size_cm      = mesh OBB extents * linear_scale
#
# Deriving scale as (real_vol / mesh_vol)^(1/3) instead uses mesh_vol^(1/3) as the
# reference edge, which only holds for a perfect cube; the cube root compounds any
# deviation three times. At 2.2% off cubic that under-read the edge by 3.1% and
# inflated every volume ~10%. Using the edge directly also leaves the reference's
# own volume free to disagree with nominal — that gap is a real error bar rather
# than something forced to zero.
#
# Volume method priority (per mesh):
#     1. watertight        — exact signed volume, no discretisation error
#     2. warp+floodfill    — GPU BVH surface mark + CPU flood-fill (leaks on open meshes)
#     3. trimesh voxel     — CPU fallback
#     4. convex_hull       — unreliable; ignores the surface entirely
#
# Voxel occupancy is also computed alongside the exact value as an independent
# cross-check. It over-reads by a few percent (boundary voxels counted whole) and
# converges downward onto exact; a result below exact indicates a self-intersecting
# or inverted surface.
#
# The reference is a 14 × 14 × 14 cm ArUco cube identified by 'box' in its filename.
# """
# import os
# import numpy as np
# import pandas as pd
# import trimesh
# from scipy import ndimage
#
# from pipeline.config import (REFERENCE_REAL_SIZE_CM, REFERENCE_MARKER_CM,
#                             REFERENCE_MARKER_DICT, MARKER_SPREAD_WARN,
#                             MARKER_ASPECT_WARN)
#
# DEFAULT_VOXEL_RES = 150
#
# # warp optional — GPU voxelization
# try:
#     import warp as wp
#     _WARP_AVAILABLE = True
# except ImportError:
#     _WARP_AVAILABLE = False
#
# # ---------------------------------------------------------------------------
# # Warp GPU kernel (must be at module level — warp requires file scope)
# # ---------------------------------------------------------------------------
#
# if _WARP_AVAILABLE:
#     wp.init()
#
#     @wp.kernel
#     def _warp_mark_surface(
#         mesh_id:   wp.uint64,
#         surface:   wp.array3d(dtype=wp.int32),
#         b_min:     wp.vec3,
#         pitch:     float,
#         threshold: float,
#     ):
#         i, j, k = wp.tid()
#         cx = b_min[0] + (float(i) + 0.5) * pitch
#         cy = b_min[1] + (float(j) + 0.5) * pitch
#         cz = b_min[2] + (float(k) + 0.5) * pitch
#         q = wp.mesh_query_point_sign_normal(mesh_id, wp.vec3(cx, cy, cz), threshold)
#         if q.result:
#             surface[i, j, k] = 1
#
#
# # ---------------------------------------------------------------------------
# # Volume methods
# # ---------------------------------------------------------------------------
#
# def _volume_voxel_warp(mesh: trimesh.Trimesh, resolution: int,
#                         device: str = "cuda:0") -> float:
#     """GPU surface-mark (warp BVH) + CPU flood-fill (scipy)."""
#     verts = mesh.vertices.astype(np.float32)
#     faces = mesh.faces.astype(np.int32)
#
#     wp_mesh = wp.Mesh(
#         points=wp.array(verts, dtype=wp.vec3, device=device),
#         indices=wp.array(faces.flatten(), dtype=wp.int32, device=device),
#     )
#
#     b_min  = verts.min(axis=0)
#     b_max  = verts.max(axis=0)
#     pitch  = float((b_max - b_min).max()) / resolution
#     nx = max(1, int(np.ceil((b_max[0] - b_min[0]) / pitch)))
#     ny = max(1, int(np.ceil((b_max[1] - b_min[1]) / pitch)))
#     nz = max(1, int(np.ceil((b_max[2] - b_min[2]) / pitch)))
#
#     threshold   = pitch * (3.0 ** 0.5) / 2.0
#     surface_gpu = wp.zeros((nx, ny, nz), dtype=wp.int32, device=device)
#     b_min_wp    = wp.vec3(float(b_min[0]), float(b_min[1]), float(b_min[2]))
#
#     wp.launch(_warp_mark_surface, dim=(nx, ny, nz),
#               inputs=[wp_mesh.id, surface_gpu, b_min_wp, pitch, threshold],
#               device=device)
#     wp.synchronize()
#
#     surface_np     = surface_gpu.numpy().astype(bool)
#     struct         = ndimage.generate_binary_structure(3, 1)
#     padded         = np.pad(surface_np, 1, constant_values=False)
#     labeled, _     = ndimage.label(~padded, structure=struct)
#     exterior_label = int(labeled[0, 0, 0])
#     interior       = (~padded) & (labeled != exterior_label)
#     interior       = interior[1:-1, 1:-1, 1:-1]
#
#     return float((interior.sum() + surface_np.sum()) * pitch**3)
#
#
# def _volume_voxel(mesh: trimesh.Trimesh, resolution: int) -> float:
#     pitch = float(mesh.extents.max()) / resolution
#     return float(mesh.voxelized(pitch=pitch).fill().volume)
#
#
# def _volume_convex_hull(mesh: trimesh.Trimesh) -> float:
#     return float(abs(mesh.convex_hull.volume))
#
#
# def auto_tune_voxel_res(
#     mesh: trimesh.Trimesh,
#     start: int = 50,
#     stop: int = 300,
#     step: int = 50,
#     tol: float = 0.015,
#     use_warp: bool = False,
# ) -> tuple[int, float]:
#     """Increase resolution until volume converges. Returns (best_res, volume)."""
#     backend = "warp+floodfill" if use_warp else "trimesh"
#     print(f"  {'res':>6}  {'pitch':>10}  {'volume':>14}  {'Δ%':>8}  [{backend}]")
#     print(f"  {'-'*6}  {'-'*10}  {'-'*14}  {'-'*8}")
#
#     prev_vol = None
#     best_res = start
#     best_vol = None
#
#     for res in range(start, stop + 1, step):
#         pitch = float(mesh.extents.max()) / res
#         try:
#             if use_warp:
#                 vol = _volume_voxel_warp(mesh, res)
#             else:
#                 vol = float(mesh.voxelized(pitch=pitch).fill().volume)
#         except Exception as e:
#             print(f"  {res:>6}  {pitch:>10.5f}  {'ERROR':>14}  {'—':>8}  (skipped: {e})")
#             continue
#
#         if prev_vol is not None and prev_vol > 0:
#             delta_pct = abs(vol - prev_vol) / prev_vol * 100
#             print(f"  {res:>6}  {pitch:>10.5f}  {vol:>14.6f}  {delta_pct:>7.2f}%")
#             if delta_pct < tol * 100:
#                 best_res = res
#                 best_vol = vol
#                 print(f"\n  converged at res={res}  (Δ < {tol*100:.1f}%)")
#                 return best_res, best_vol
#         else:
#             print(f"  {res:>6}  {pitch:>10.5f}  {vol:>14.6f}  {'—':>8}")
#
#         prev_vol = vol
#         best_res = res
#         best_vol = vol
#
#     print(f"\n  [warn] did not converge by res={stop}. using res={best_res}.")
#     return best_res, best_vol
#
#
# def _measure_volume(mesh: trimesh.Trimesh,
#                     voxel_res: int = DEFAULT_VOXEL_RES,
#                     auto_res: bool = False) -> tuple[float, str]:
#     """Return (volume_mesh_units3, method_label) using best available method."""
#     if mesh.is_watertight:
#         return float(abs(mesh.volume)), "watertight"
#
#     # Not closed: everything below is an approximation, and flood-fill in
#     # particular leaks through holes and can under-read by an order of
#     # magnitude while still returning a plausible-looking number.
#     print("  WARNING: mesh is NOT watertight — falling back to voxel "
#           "approximation. Flood fill leaks through open surfaces; treat this "
#           "volume as unreliable.")
#
#     if _WARP_AVAILABLE:
#         try:
#             if auto_res:
#                 best_res, vol = auto_tune_voxel_res(mesh, use_warp=True)
#                 method = f"warp+floodfill (auto res={best_res})"
#             else:
#                 vol = _volume_voxel_warp(mesh, voxel_res)
#                 method = f"warp+floodfill (res={voxel_res})"
#             if vol > 0:
#                 return vol, method
#         except Exception as e:
#             print(f"  [warn] warp failed: {e} — falling back to trimesh")
#
#     try:
#         if auto_res:
#             best_res, vol = auto_tune_voxel_res(mesh, use_warp=False)
#             method = f"trimesh voxel (auto res={best_res})"
#         else:
#             vol = _volume_voxel(mesh, voxel_res)
#             method = f"trimesh voxel (res={voxel_res})"
#         if vol > 0:
#             return vol, method
#     except Exception as e:
#         print(f"  [warn] trimesh voxel failed: {e}")
#
#     try:
#         print("  WARNING: convex hull fallback — ignores the surface entirely and "
#               "only uses vertex positions. A broken mesh scores the same as a good "
#               "one. Do not report this as a measurement.")
#         return _volume_convex_hull(mesh), "convex_hull (UNRELIABLE)"
#     except Exception as e:
#         print(f"  [ERROR] all volume methods failed: {e}")
#         return 0.0, "failed"
#
#
# # ---------------------------------------------------------------------------
# # Helpers
# # ---------------------------------------------------------------------------
#
# def _is_ref_mesh(path: str) -> bool:
#     name = os.path.splitext(os.path.basename(path).lower())[0]
#     return "box" in name
#
#
# def _load_mesh_info(path: str, voxel_res: int, auto_res: bool = False) -> dict | None:
#     if not os.path.exists(path):
#         print(f"  skipping (not found): {path}")
#         return None
#
#     mesh = trimesh.load(path, force="mesh", process=False)
#     if len(mesh.vertices) == 0:
#         print(f"  skipping (empty): {path}")
#         return None
#
#     mesh.merge_vertices()
#     volume, method = _measure_volume(mesh, voxel_res, auto_res=auto_res)
#
#     # Oriented extents, not axis-aligned. An AABB around a yaw-rotated object
#     # reports its diagonal, not its size — the can measures 6.09 cm wide by
#     # AABB and 5.75 cm by OBB, and the cube 14.95 vs 14.0.
#     # Keep the OBB extents ordered by ORIENTATION, not magnitude: index 0 is the
#     # axis most aligned with world up. Stage 3 levels the scene, so that axis is
#     # the one the floor truncates — identifying it by geometry beats guessing
#     # from which edges happen to agree, which picks the wrong edge whenever two
#     # are short in the same direction.
#     _ob = mesh.bounding_box_oriented
#     _ext = np.asarray(_ob.primitive.extents, dtype=float)
#     _R = np.asarray(_ob.primitive.transform)[:3, :3]
#     _align = [abs(float(np.dot(_R[:, i] / (np.linalg.norm(_R[:, i]) + 1e-12),
#                                np.array([0.0, 0.0, 1.0])))) for i in range(3)]
#     _vi = int(np.argmax(_align))
#     _hi = [i for i in range(3) if i != _vi]
#     obb = np.array([_ext[_vi], _ext[_hi[0]], _ext[_hi[1]]])  # [vertical, horiz, horiz]
#
#     # Euler number is the decisive integrity check. A closed surface with
#     # tunnels bounds a region perfectly well, so is_watertight passes and the
#     # volume integral correctly subtracts the tunnels — the mesh looks right
#     # from outside while reporting far too little volume. Only 2 means a simple
#     # closed surface.
#     euler = int(mesh.euler_number)
#     if euler != 2:
#         print(f"  WARNING: {os.path.basename(path)} has euler number {euler} "
#               f"(expected 2) — the surface has tunnels or cavities and its "
#               f"volume is NOT reliable.")
#
#     # Independent cross-check: voxel occupancy of the same mesh. It over-reads
#     # by a predictable few percent (boundary voxels counted whole) and converges
#     # down onto the exact value. A voxel result *below* exact, or wildly above,
#     # means the surface is self-intersecting or wrongly wound.
#     voxel_check = None
#     if method == "watertight":
#         try:
#             v = (_volume_voxel_warp(mesh, voxel_res) if _WARP_AVAILABLE
#                  else _volume_voxel(mesh, voxel_res))
#             voxel_check = float(v)
#         except Exception:
#             pass
#
#     # For the reference only, measure its edges from its own faces. An oriented
#     # bounding box was found to be mis-rotated by ~1.3 degrees on this cube,
#     # which inflates every edge by 2.2% and therefore under-reads every volume
#     # by ~6%. See pipeline/core/faces.py.
#     face_v, face_h = None, []
#     if _is_ref_mesh(path):
#         try:
#             from pipeline.core.faces import reference_edges
#             face_v, face_h, _d = reference_edges(
#                 np.asarray(mesh.vertices), np.asarray(mesh.faces))
#         except Exception as e:
#             print(f"  face fit failed on {os.path.basename(path)} "
#                   f"({type(e).__name__}) — falling back to the bounding box")
#
#     return {
#         "name":     os.path.basename(path),
#         "is_ref":   _is_ref_mesh(path),
#         "face_v":   face_v,
#         "face_h":   face_h,
#         "volume":   volume,
#         "method":   method,
#         "obb_a":    float(obb[0]),
#         "obb_b":    float(obb[1]),
#         "obb_c":    float(obb[2]),
#         "voxel":    voxel_check,
#         "euler":    euler,
#     }
#
#
# # ---------------------------------------------------------------------------
# # Main stage entry-point
# # ---------------------------------------------------------------------------
#
# def _report_markers(inference_dir: str, linear_scale: float) -> dict | None:
#     """Cross-check the scale against the markers printed on the reference.
#
#     The cube cannot check itself — the scale comes from its own faces, so it
#     always measures REFERENCE_REAL_SIZE_CM — and the squareness test above is
#     blind to a common-mode error for the same reason. The markers are the one
#     structure in the scene the calibration never touches, so they can see both.
#
#     Most of what is reported here needs no physical constant: a printed marker
#     is flat and square, so departures are reconstruction error and nothing else.
#     """
#     path = os.path.join(inference_dir, "predictions.npz")
#     if not os.path.exists(path):
#         return None
#     try:
#         from pipeline.core.markers3d import (detect_marker_quads, quad_metrics,
#                                              infer_up_axis, edge_lengths_by_axis)
#         predictions = np.load(path)
#         quads = detect_marker_quads(predictions, dict_name=REFERENCE_MARKER_DICT)
#     except Exception as e:
#         print(f"\n  Marker cross-check unavailable: {e}")
#         return None
#     if len(quads) < 2:
#         print(f"\n  Marker cross-check: only {len(quads)} marker(s) found — skipped")
#         return None
#
#     per_face, sides, aspects, flats = {}, [], [], []
#     for marker_id, views in sorted(quads.items()):
#         m = [quad_metrics(v["corners"], linear_scale) for v in views]
#         per_face[marker_id] = float(np.mean([x["side"] for x in m]))
#         sides.extend(np.concatenate([x["sides"] for x in m]))
#         aspects.extend(x["aspect"] for x in m)
#         flats.extend(x["flatness"] for x in m)
#
#     sides = np.asarray(sides)
#     face_sizes = np.asarray(list(per_face.values()))
#     spread = float((face_sizes.max() - face_sizes.min()) / face_sizes.mean())
#     aspect = float(np.mean(aspects))
#     out = {"marker_cm": float(np.median(sides)), "spread": spread,
#            "aspect": aspect, "flatness_mm": float(np.mean(flats) * 10),
#            "n_faces": len(per_face), "n_edges": int(sides.size)}
#
#     print(f"\n  Marker cross-check ({REFERENCE_MARKER_DICT}, {len(per_face)} faces, "
#           f"{sides.size} edges) — the one length the calibration never used:")
#     print("    per face      " + "  ".join(f"#{k}:{v:.3f}" for k, v in per_face.items()))
#     print(f"    size spread   {spread:.2%}  across faces "
#           f"(same physical square, so this is pure reconstruction error)")
#     print(f"    aspect        {aspect:.4f}  (a printed square; 1.0000 is perfect)")
#     print(f"    flatness      {out['flatness_mm']:.3f} mm off its own plane")
#
#     # Anisotropy, if the cube's vertical can be recovered from the marker layout.
#     up, top_id = infer_up_axis(quads)
#     if up is not None:
#         along, across = [], []
#         for marker_id, views in quads.items():
#             if marker_id == top_id:
#                 continue
#             for v in views:
#                 a, c = edge_lengths_by_axis(v["corners"], up, linear_scale)
#                 along.extend(a)
#                 across.extend(c)
#         if along and across:
#             ratio = float(np.mean(along) / np.mean(across))
#             out["vert_horiz"] = ratio
#             print(f"    vert/horiz    {ratio:.4f}  z relative to horizontal "
#                   f"(up from marker #{top_id})")
#
#     if REFERENCE_MARKER_CM:
#         err = out["marker_cm"] / REFERENCE_MARKER_CM - 1.0
#         out["abs_error"] = err
#         print(f"    absolute      {out['marker_cm']:.3f} cm vs a measured "
#               f"{REFERENCE_MARKER_CM:.2f} — {err:+.2%}")
#     else:
#         print(f"    absolute      {out['marker_cm']:.3f} cm; set "
#               f"REFERENCE_MARKER_CM to compare (see pipeline/config.py)")
#
#     if spread > MARKER_SPREAD_WARN:
#         print(f"    WARNING: the same printed square measures {spread:.1%} "
#               f"differently across faces — the reference reconstructed unevenly")
#     if aspect > MARKER_ASPECT_WARN:
#         print(f"    WARNING: a printed square reconstructs {aspect:.2f} out of "
#               f"square — the geometry is distorted, not merely noisy")
#     return out
#
#
# def compute_volumes(object_mesh_paths: list[str],
#                     voxel_res: int = DEFAULT_VOXEL_RES,
#                     auto_res: bool = True,
#                     inference_dir: str | None = None):
#     """Compute real-world volume of each object using ArUco box for scale."""
#     res_label = "auto" if auto_res else str(voxel_res)
#     print()
#     print("=" * 60)
#     print(f"STAGE 6: real-world volumes  "
#           f"(ref = {REFERENCE_REAL_SIZE_CM} cm ArUco cube  |  voxel_res={res_label})")
#     print("=" * 60)
#
#     rows = [_load_mesh_info(p, voxel_res, auto_res=auto_res) for p in object_mesh_paths]
#     rows = [r for r in rows if r is not None]
#     if not rows:
#         print("  No meshes loaded.")
#         return
#
#     df = pd.DataFrame(rows)
#
#     raw_cols = ["name", "method", "euler", "volume", "obb_a", "obb_b", "obb_c"]
#     print("\n  Raw mesh measurements (mesh units; obb_a = vertical axis, "
#           "obb_b/c horizontal):")
#     print(df[raw_cols].to_string(index=False))
#
#     # Voxel occupancy cross-check. Discretisation counts boundary voxels whole,
#     # so voxel should sit a few percent ABOVE exact and converge down onto it.
#     # Below exact, or far above, means a self-intersecting or inverted surface.
#     if df["voxel"].notna().any():
#         print("\n  Voxel cross-check (independent; expect +1..8% over exact):")
#         for _, r in df.iterrows():
#             if r["voxel"] is None or not np.isfinite(r["voxel"]) or r["volume"] <= 0:
#                 continue
#             dev = (r["voxel"] - r["volume"]) / r["volume"] * 100
#             flag = "" if 0 <= dev <= 15 else "   <-- SUSPECT: mesh may be self-intersecting"
#             print(f"    {r['name']:<16} exact {r['volume']:.6f}  "
#                   f"voxel {r['voxel']:.6f}  {dev:+.2f}%{flag}")
#
#     ref_rows = df[df["is_ref"]]
#     if ref_rows.empty:
#         print("\n  No box (reference) mesh found — cannot scale. Aborting.")
#         return
#
#     ref = ref_rows.iloc[0]
#     if ref["volume"] <= 0:
#         print(f"\n  Reference mesh '{ref['name']}' has zero volume. Aborting.")
#         return
#
#     # Scale from a measured LENGTH, not a volume ratio.
#     #
#     # The old route was linear_scale = (real_vol / mesh_vol)^(1/3), which uses
#     # mesh_vol^(1/3) as the reference's edge — only valid if the mesh is a
#     # perfect cube. Any deviation from cubic is compounded three times by the
#     # cube root: at 2.2% off cubic the edge came out 3.1% short and inflated
#     # every reported volume by ~10%.
#     #
#     # Scale comes from the two HORIZONTAL edges. obb_a is the vertical one (see
#     # _load_mesh_info) and is the axis the floor truncates, so it is excluded
#     # rather than averaged in — including it drags the estimate small and
#     # inflates every downstream volume.
#     #
#     # The two horizontal edges are then independent measurements of the same
#     # physical 14 cm length, and how far they disagree is a genuine error bar.
#     #
#     # The edges come from fitting the cube's own FACES, not from a bounding box.
#     # An OBB has to guess the orientation, and on this reference it guessed
#     # ~1.3 degrees wrong — enough to enclose 6.8% more volume than the convex
#     # hull of the same points. Spread over three axes that is +2.2% per edge,
#     # which under-reads every volume by ~6%. A cube's face normals *are* its
#     # axes, so fitting them removes that error by construction.
#     face_h = list(ref.get("face_h") or [])
#     face_v = ref.get("face_v")
#     if len(face_h) >= 2:
#         ref_h = np.array(sorted(face_h)[-2:], dtype=float)
#         ref_v = float(face_v) if face_v else float(ref["obb_a"])
#         edge_src = "fitted faces"
#     else:
#         ref_h = np.array([ref["obb_b"], ref["obb_c"]], dtype=float)
#         ref_v = float(ref["obb_a"])
#         edge_src = ("bounding box — FACE FIT UNAVAILABLE, expect the scale to "
#                     "run ~2% small")
#     ref_edge = float(ref_h.mean())
#     h_disagree = float(abs(ref_h[0] - ref_h[1]) / ref_edge * 100)
#     v_deficit = (ref_edge - ref_v) / ref_edge * 100
#
#     linear_scale = REFERENCE_REAL_SIZE_CM / ref_edge
#     k = linear_scale ** 3
#
#     print(f"\n  Scale factor (from the reference's two horizontal edges, "
#           f"{edge_src}):")
#     print(f"    horizontal    = {ref_h[0]:.4f}, {ref_h[1]:.4f} units "
#           f"— disagree by {h_disagree:.2f}%")
#     print(f"    vertical      = {ref_v:.4f} units ({ref_v * REFERENCE_REAL_SIZE_CM / ref_edge:.2f} cm "
#           f"of an expected {REFERENCE_REAL_SIZE_CM:.2f}), {v_deficit:+.2f}% short")
#     print(f"    ref edge      = {ref_edge:.6f} units  (vertical excluded — it "
#           f"reconstructs short; see below)")
#     print(f"    linear_scale  = {REFERENCE_REAL_SIZE_CM} / {ref_edge:.6f} "
#           f"= {linear_scale:.6f} cm/unit")
#     print(f"    k             = linear_scale³ = {k:.2f} cm³/unit³")
#     print(f"    residual height deficit = {(ref_edge - ref_v) * linear_scale:.2f} cm "
#           f"— a lid seen at grazing incidence in every view, plus rim rounding; "
#           f"NOT the floor, which measures correct to ~1 mm")
#     if h_disagree > 3:
#         print(f"    WARNING: the two horizontal edges differ by {h_disagree:.1f}% "
#               f"— scale is poorly constrained")
#
#     # Squareness self-check. The cube's three edges are three measurements of
#     # one physical length, so as shares of their sum they should each be
#     # 33.33%. Deviation is scale-free — it needs no ground truth and it is the
#     # only signal available that the reference reconstructed badly before its
#     # edge silently sets the scale for everything.
#     #
#     # It cannot see a COMMON-MODE error: inflate all three edges equally and the
#     # shares do not move. That is a real limitation, not an oversight — it is
#     # why the edge measurement itself had to be fixed rather than reweighted.
#     edges = np.array([ref_v, ref_h[0], ref_h[1]], dtype=float)
#     if np.all(np.isfinite(edges)) and edges.sum() > 0:
#         share = edges / edges.sum() * 100.0
#         dev = share - 100.0 / 3.0
#         print(f"    squareness    = shares {share[0]:.2f} / {share[1]:.2f} / "
#               f"{share[2]:.2f}%  (33.33 each if perfectly cubic)")
#         print(f"                    deviation {dev[0]:+.2f} / {dev[1]:+.2f} / "
#               f"{dev[2]:+.2f} pp  — vertical is expected low; the top face is "
#               f"grazing in every view")
#         if abs(dev[1]) > 2.0 or abs(dev[2]) > 2.0:
#             print(f"    WARNING: a horizontal edge deviates by more than 2 pp "
#                   f"from cubic — the reference reconstructed poorly and its "
#                   f"edge should not be trusted as the scale")
#
#     if inference_dir:
#         _report_markers(inference_dir, linear_scale)
#
#     df["real_vol_cm3"] = df["volume"] * k
#     df["real_vol_L"]   = df["real_vol_cm3"] / 1000.0
#     df["height_cm"]    = df["obb_a"] * linear_scale   # vertical axis
#     df["width_cm"]     = df["obb_b"] * linear_scale
#     df["depth_cm"]     = df["obb_c"] * linear_scale
#
#     # face_h is a LIST, and pandas writes it as a quoted field containing a
#     # comma. Every consumer of this file splits on commas without honouring
#     # quotes (see web/src/lib/data.ts, "volumes.csv has no quoted fields"), so
#     # leaving it in shifts every column after it — the web app read the
#     # reference volume as "2". These two are working values, not results.
#     df = df.drop(columns=[c for c in ("face_v", "face_h") if c in df.columns])
#
#     result_cols = ["name", "height_cm", "width_cm", "depth_cm",
#                    "real_vol_cm3", "real_vol_L", "method"]
#     print("\n  Real-world dimensions (OBB) and volumes:")
#     print(df[result_cols].to_string(index=False, float_format=lambda x: f"{x:.2f}"))
#     print(f"\n  Reference now reads {df[df['is_ref']].iloc[0]['real_vol_cm3']:.1f} cm³ "
#           f"vs {REFERENCE_REAL_SIZE_CM**3:.0f} cm³ nominal — the gap is the "
#           f"reference's own reconstruction error, no longer forced to zero.")
#
#     return df
#
