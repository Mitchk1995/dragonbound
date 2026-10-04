"""The bow in the hero's hand (never exported): every bow, in the starting outfit and in armour, through the whole stride
at every lean, coming up into the shot, through the shot and lowered after it, checked for which way it faces and for
cutting into the hero (fitcheck.py builds and dresses him, animpose.py poses him as anim.ts does).

    exec(open(os.path.join(os.environ['DRAGONBOUND_ROOT'], 'tools', 'blender', 'bowcheck.py')).read())
    report = bow_check_all()          # every bow and outfit; who={'hero:bow_worn:plain'} for one
"""
import os
import sys

# Repo root: DRAGONBOUND_ROOT, else two levels above this script (when run as a file), else the old fixed path.
_ROOT = os.environ.get('DRAGONBOUND_ROOT') or (os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                                               if '__file__' in globals() else r'D:\gameplanning')
sys.path.insert(0, os.path.join(_ROOT, 'tools', 'blender'))
import bpy
from mathutils import Vector

_p = os.path.join(_ROOT, 'tools', 'blender', 'fitcheck.py')
_f = {'__name__': 'db_fit', '__file__': _p}
exec(open(_p, encoding='utf-8').read(), _f)
build_hero, dress, held_clip, _strip = _f['build_hero'], _f['dress'], _f['held_clip'], _f['_strip']
anim_pose, pose_scene, stride_poses, bow_string = _f['anim_pose'], _f['pose_scene'], _f['stride_poses'], _f['bow_string']
BOW_MID, BOW_FADE = _f['BOW_MID'], _f['BOW_FADE']

# ─── Which way the bow faces ─────────────────────────────────────────────────
# The owner: a held bow's string faces the archer and its limbs curve away from him, carried, drawn and after the
# shot. From the grip (the bow's middle, on the hand's hole), the string must lie toward the archer's chest (as the
# game measures it: src/render/bowMeasure.ts); string_side gives the cosine of the angle, and toward the shoulder of the
# arm holding it for reference.


def string_side(scene):
    """(toward the bow shoulder, toward the chest): cosines of the angles between grip -> string and grip -> each, or
    None without a bow. The chest's is the rule; the shoulder's is reported."""
    bpy.context.view_layer.update()
    parts = {_strip(o.name): o for o in scene.objects}
    middle = bow_string(parts)
    if middle is None:
        return None
    m = parts['sock_handR'].matrix_world
    grip = m @ Vector((0, BOW_MID, 0))
    s = (m @ middle - grip).normalized()
    to = lambda p: (p - grip).normalized()
    return (round(s.dot(to(parts['armR'].matrix_world.translation)), 3),
            round(s.dot(to(parts['sock_chest'].matrix_world.translation)), 3))


# Every bow, in the starting outfit and in plate (whose skirt, tassets and gauntlets are the widest), as the game
# dresses them.
BOWS = ('bow_worn', 'bow_hunter', 'bow_recurve', 'bow_drakebone', 'u_emberstring')
OUTFITS = {'plain': [], 'plate': ['pv_p_body_plate', 'pv_p_gloves', 'pv_p_boots']}
# Coming up into the shot (before the draw hand takes the string) and lowered after it, standing and in the stride.
RAISE = (0.05, 0.1, 0.15)


def bow_poses():
    out = stride_poses(('bow',), 'bow')
    out += [(f'bow@{a}', anim_pose('bow', a, hold='bow')) for a in RAISE]
    for sw in (0.0, 1.0, -1.0):
        out += [(f'lowering {w} {sw:+.0f}', anim_pose('bow', 1.0, sw=sw, hold='bow', move=1.0 if sw else 0.0, stance=w))
                for w in BOW_FADE]
    return out


def bow_check_all(facing=0.5, clip=0.03, who=None):
    """Every bow in every outfit and frame: {name: {'facing': (worst cosine, pose), 'clip': (depth, where, pose)}} plus
    'fails', where the string turns from the archer (a cosine under `facing`) or the bow cuts deeper than `clip` into
    him (fitcheck.py held_clip: legs, body, armour; the hand holding it left out)."""
    out, fails = {}, []
    gp = os.path.join(_ROOT, 'tools', 'blender', 'gear.py')
    g = {'DB_RUN': False, '__name__': 'db_gear', '__file__': gp}
    exec(open(gp, encoding='utf-8').read(), g)
    vp = os.path.join(_ROOT, 'tools', 'blender', 'plate_variants.py')
    v = {'__name__': 'db_plate', '__file__': vp}
    exec(open(vp, encoding='utf-8').read(), v)
    poses = bow_poses()
    built = False
    for bow in BOWS:
        for outfit, extra in OUTFITS.items():
            name = f'hero:{bow}:{outfit}'
            if who is not None and name not in who:
                continue
            if extra and not built:
                v['build_variant']('p')
                built = True
            if f'DB_gear_{bow}' not in bpy.data.scenes:
                g['build'](bow)
            scene, _ = build_hero('DB_bowcheck')
            dress(scene, [f'DB_gear_{bow}'] + [f'DB_{m}' for m in extra])
            face, cut = (2.0, None), (0.0, None, None)
            for pose, offs in poses:
                pose_scene(scene, offs)
                side = string_side(scene)
                if side is None:
                    fails.append(f'{name}: no bow string found')
                    break
                if side[1] < face[0]:
                    face = (side[1], pose)
                c = held_clip(scene)
                if c[0] > cut[0]:
                    cut = (*c, pose)
            out[name] = {'facing': face, 'clip': cut, 'poses': len(poses)}
            if face[0] < facing:
                fails.append(f'{name}: string turned from the archer {face}')
            if cut[0] > clip:
                fails.append(f'{name}: bow cuts into the hero {cut}')
    out['fails'] = fails
    return out
