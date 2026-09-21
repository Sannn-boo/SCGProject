"""Stage 0's call into prepare_frames() — the one piece of stage glue that is
genuinely identical between orchestrator.py and stagerun.py, and the one that
has already diverged twice (see the comment this replaces in orchestrator.py,
and docs/progress.md's "stage0_bypass_bug"). Both entry points call
`run_prep_stage()` now instead of each hand-copying the prepare_frames(...)
call and its argument list, so that class of bug -- one entry point passing
an argument the other forgot -- is no longer possible: there is only one call
site left to get right.

Extracted 2026-08-30. Behaviour is unchanged: the argument list and defaults
below were compared against both orchestrator.py's and stagerun.py's own
argparsers before extraction (see pipeline/cli.py's `--prep-size` absence,
which is why prep_size is read with getattr and a 518 default here, matching
what orchestrator.py already did defensively; stagerun.py's own parser
defines --prep-size with the same default=518, so the same getattr call
returns the identical value for both callers).
"""
import os


def run_prep_stage(image_folder, output_dir, args):
    """Run Stage 0 (framing gate) and return (images_dir, manifest).

    Args:
        image_folder: the raw input folder Stage 0 reads.
        output_dir: this run's 00_prep directory; images are written to
            output_dir/images.
        args: the argparse.Namespace from either entry point's parser. Only
            attributes read below need to exist; prep_size and prep_crop are
            read defensively because pipeline/cli.py (orchestrator.py's
            parser) does not define --prep-size at all, and used to omit
            --prep-crop from the call.

    Returns:
        (images_dir, manifest) -- manifest is prepare_frames()'s return
        value, unchanged, so callers can still read manifest["marker_colour"],
        manifest["frames"], etc. exactly as before.
    """
    from pipeline.stages.prep import prepare_frames

    images_dir = os.path.join(output_dir, "images")
    manifest = prepare_frames(
        image_folder, images_dir,
        band_heights=args.prep_band,
        pad=args.prep_pad,
        centre_on_subject=args.prep_recentre,
        output_size=getattr(args, "prep_size", 518),
        strict=args.prep_strict,
        crop=getattr(args, "prep_crop", True),
        min_frames=args.prep_min_frames,
    )
    return images_dir, manifest
