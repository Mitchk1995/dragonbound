"""Humanoid poses for the Blender audits (fitcheck.py, plate_variants.py), mirrored from src/render/anim.ts: rotation
offsets per rig part for the walk and every attack, the bow shot's two-bone reach and hand turns, and pose_scene,
which applies them to a built character the way the game does. Keep the constants in step with anim.ts (same names).
"""
import math
import re

import bpy
from mathutils import Matrix, Quaternion, Vector

_strip = lambda n: re.sub(r'\.\d{3}$', '', n)

IMPACT = 0.55                                  # src/data/tuning.ts COMBAT_TUNING.impact
FOLLOW = 0.75                                  # SHOULDER_FOLLOW
SPLAY = 0.1                                    # ARM_SPLAY
ELBOW_REST, HOLD_BEND, HOLD_WRIST, SIDE_WRIST = -0.25, -1.57, 0.17, 0.5
BOW_OUT, BOW_CARRY, BOW_PLUMB = 0.2, -0.5, -0.2
WIND_ARM, WIND_ELBOW, SWING_WRIST, STRIKE_ELBOW = 2.6, -1.0, 1.3, -0.15
CAST_ARM, CAST_ELBOW, CAST_WRIST, CAST_REACH = 2.1, -0.1, 0.885, 1.7
BOW_TURN, BOW_HEAD = math.pi / 2, 0.85
BOW_AIM = (-0.807, 0.07, 0.586)
BOW_ROLL = (0, 1, 0.3)
BOW_MID, DRAW_GRAB, DRAW_ANCHOR = 0.15, 1.29, 1.35
BOW_STRING = (1, 0, 0)
DRAW_POLE = (1, 0.1, 0.6)
RELEASE = IMPACT                               # bowDraw.ts
_ease = lambda t: t * t * (3 - 2 * t)
_lerp = lambda a, b, t: a + (b - a) * t


def draw_amount(a):
    """bowDraw.ts bowDrawAmount."""
    if a < 0:
        return 0.0
    if a < RELEASE:
        return _ease(max(0.0, (a - 0.12) / (RELEASE - 0.12)))
    return max(0.0, 1 - (a - RELEASE) / 0.06)


def hold_of(weapon):
    """registry.ts holdOf: how the hero's right hand carries a weapon model (anim.ts Hold)."""
    if not weapon:
        return 'empty'
    if weapon.startswith('bow_') or weapon == 'u_emberstring':
        return 'bow'
    return 'upright' if weapon.startswith('staff_') or weapon == 'u_kindled_ash' else 'side'


def anim_pose(kind=None, a=-1.0, sw=0.0, hold='empty'):
    """anim.ts Rig.update for a humanoid: rotation offsets {part: (x, y, z)} for the walk phase sw (sin of the stride,
    at full speed) and attack `kind` at progress a (-1: none), the right hand carrying in `hold`, and 'lift', how far
    the body (arms, torso and head; the legs hang from the root) rises in the stride. The bow shot's arms are placed
    by pose_scene (anim.ts bowPose), which this marks with 'bow': a."""
    move = 1.0 if sw else 0.0
    fore, bow = hold in ('upright', 'bow'), hold == 'bow'     # the forearm level and forward; a bow out from the body
    swl, swr = -sw * 0.5 * move, sw * (0.15 if fore else 0.3) * move
    p = {'body': (0.08 * move, 0, 0), 'lift': abs(sw) * 0.06 * move,
         'armL': (swl, 0, SPLAY), 'armR': (swr, 0, -SPLAY - (BOW_OUT if bow else 0)),
         'legL': (sw * 0.7 * move, 0, 0), 'legR': (-sw * 0.7 * move, 0, 0),
         'elbowL': (ELBOW_REST + min(0, swl) * 0.5, 0, 0),
         'elbowR': (HOLD_BEND - swr if fore else ELBOW_REST + min(0, swr) * 0.5, BOW_CARRY if bow else 0, 0),
         'handL': (0, 0, 0),
         'handR': (SIDE_WRIST - swr if hold == 'side' else HOLD_WRIST if hold == 'upright' else 0, BOW_PLUMB if bow else 0, 0)}
    if a < 0 or kind is None:
        return p
    e0 = HOLD_BEND if fore else ELBOW_REST
    w0 = SIDE_WRIST if hold == 'side' else HOLD_WRIST if hold == 'upright' else 0
    if kind == 'swing':
        up, down = IMPACT - 0.1, IMPACT + 0.1
        if a < up:
            k = _ease(a / up)
            x, e = -WIND_ARM * k, _lerp(e0, WIND_ELBOW, k)
        elif a < down:
            k = _ease((a - up) / (down - up))
            x, e = -WIND_ARM + (WIND_ARM - 0.35) * k, _lerp(WIND_ELBOW, STRIKE_ELBOW, k)
        else:
            k = _ease((a - down) / (1 - down))
            x, e = -0.35 * (1 - k), _lerp(STRIKE_ELBOW, e0, k)
        w = _lerp(w0, SWING_WRIST, _ease(min(1, a / up))) if a < IMPACT else _lerp(SWING_WRIST, w0, _ease((a - IMPACT) / (1 - IMPACT)))
        p['armR'], p['elbowR'], p['handR'] = (x, 0, -SPLAY), (e, 0, 0), (w, 0, 0)
        p['body'] = (-0.1, 0.3 * _ease(a / up), 0) if a < up else (0.15, -0.3 * (1 - a), 0)
    elif kind == 'slam':
        lift = _ease(a / IMPACT) if a < IMPACT else 1 - _ease((a - IMPACT) / (1 - IMPACT))
        x = -3.0 * _ease(a / IMPACT) if a < IMPACT else -3.0 + 2.8 * _ease((a - IMPACT) / (1 - IMPACT))
        p['armR'], p['armL'] = (x, 0, -SPLAY), (x, 0, SPLAY)
        p['elbowR'], p['elbowL'] = (_lerp(e0, -0.5, lift), 0, 0), (_lerp(ELBOW_REST, -0.5, lift), 0, 0)
        p['body'] = (-0.2 if a < IMPACT else 0.25, 0, 0)
    elif kind == 'bow':
        p['bow'] = a
        p['head'] = (0, -BOW_TURN * BOW_HEAD * _ease(min(1, a / 0.2)), 0)
    elif kind == 'cast':
        lift = _ease(a / IMPACT) if a < IMPACT else 1 - _ease((a - IMPACT) / (1 - IMPACT))
        p['armR'], p['elbowR'], p['handR'] = (-CAST_ARM * lift, 0, -SPLAY), (_lerp(e0, CAST_ELBOW, lift), 0, 0), (_lerp(w0, CAST_WRIST, lift), 0, 0)
        p['armL'], p['elbowL'] = (-CAST_REACH * lift, 0, SPLAY), (_lerp(ELBOW_REST, -0.35, lift), 0, 0)
        p['body'] = (-0.1 * lift, 0, 0)
    elif kind == 'throw':
        x = -2.6 * _ease(a / IMPACT) if a < IMPACT else -2.6 + 2.0 * _ease((a - IMPACT) / (1 - IMPACT))
        e = _lerp(e0, -1.1, _ease(a / IMPACT)) if a < IMPACT else _lerp(-1.1, e0, _ease((a - IMPACT) / (1 - IMPACT)))
        p['armR'], p['elbowR'] = (x, 0, 0), (e, 0, 0)
    return p


# The frames each attack is checked at: wind-up, impact and follow-through (the bow: taking the string, mid-draw, full
# draw and after the release). The bow coming up from the carry (before 0.2) is a quick blend, not checked: in it the
# draw arm's shoulder dips up to 0.075 into the chest, under the shoulder cap.
ATTACK_FRAMES = {'swing': (0.36, 0.45, 0.55, 0.67), 'slam': (0.45, 0.6), 'cast': (0.4, 0.55, 0.8), 'throw': (0.36, 0.55),
                 'bow': (0.2, 0.35, 0.5, 0.8)}


def pose_list(kinds, hold='empty'):
    out = [('idle', anim_pose(hold=hold)), ('walk+', anim_pose(sw=1.0, hold=hold)), ('walk-', anim_pose(sw=-1.0, hold=hold))]
    for k in kinds:
        out += [(f'{k}@{a}', anim_pose(k, a, hold=hold)) for a in ATTACK_FRAMES[k]]
    return out


def _quat(o):
    return o.rotation_quaternion.copy() if o.rotation_mode == 'QUATERNION' else o.rotation_euler.to_quaternion()


def _set_quat(o, q):
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = q


def _basis(x, y, z):
    """Rotation with local axes x, y, z (body space)."""
    return Matrix((x, y, z)).transposed().to_quaternion()


def _body_space(parts, o):
    bpy.context.view_layer.update()
    return parts['body'].matrix_world.inverted() @ o.matrix_world


def _point_arm(arm, d, front, k):
    """anim.ts Rig.pointArm."""
    y = -d.normalized()
    z = (front - y * front.dot(y)).normalized()
    _set_quat(arm, _quat(arm).slerp(_basis(y.cross(z), y, z), k))


def _reach(parts, side, target, pole, k):
    """anim.ts Rig.reach."""
    arm, elbow, hand = parts[f'arm{side}'], parts[f'elbow{side}'], parts[f'hand{side}']
    sock = parts['sock_handL' if side == 'L' else 'sock_gloveR']
    l1, l2 = elbow.location.length, (hand.location + sock.location).length
    to_t = target - Vector(arm['rest_loc'])
    dist = min(max(to_t.length, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
    t_dir = to_t.normalized()
    cos_b = min(1.0, max(-1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)))
    out = (pole - t_dir * pole.dot(t_dir)).normalized()
    u = t_dir * cos_b + out * math.sqrt(1 - cos_b * cos_b)
    f = (t_dir * dist - u * l1).normalized()
    bend = math.acos(min(1.0, max(-1.0, u.dot(f))))
    z = (f - u * f.dot(u)).normalized()
    y = -u
    _set_quat(arm, _quat(arm).slerp(_basis(y.cross(z), y, z), k))
    e = elbow.rotation_euler
    elbow.rotation_euler = (_lerp(e[0], elbow['rest_rot'][0] - bend, k), e[1], e[2])


def _orient_hand(parts, side, axis, along, k):
    """anim.ts Rig.orientHand."""
    hand = parts[f'hand{side}']
    fore = _body_space(parts, hand.parent).to_quaternion()
    if along is not None:
        z = axis.normalized()
        y = (along - z * along.dot(z)).normalized()
    else:
        y = fore @ Vector((0, 1, 0))
        z = (axis - y * axis.dot(y)).normalized()
    want = _basis(y.cross(z), y, z)
    _set_quat(hand, _quat(hand).slerp(fore.inverted() @ want, k))


def bow_pose(parts, a):
    """anim.ts Rig.bowPose (the body's own turn is left out: it moves nothing relative to the body)."""
    raise_ = _ease(min(1, a / 0.2))
    if not all(n in parts for n in ('body', 'armR', 'armL', 'elbowL', 'handL', 'handR', 'sock_handR')):
        return
    _point_arm(parts['armR'], Vector(BOW_AIM), Vector(BOW_ROLL), raise_)
    er = parts['elbowR']
    er.rotation_euler = (er['rest_rot'][0] + _lerp(HOLD_BEND, 0, raise_), er['rest_rot'][1] + _lerp(BOW_CARRY, 0, raise_),
                         er.rotation_euler[2])
    _orient_hand(parts, 'R', Vector((0, 1, 0)), Vector((0, 0, -1)), raise_)
    s = _body_space(parts, parts['sock_handR'])
    target = s @ Vector((0, BOW_MID, 0))
    back = (s.to_3x3() @ Vector(BOW_STRING)).normalized()
    target += back * _lerp(DRAW_GRAB, DRAW_ANCHOR, draw_amount(a) if a < IMPACT else 1)
    _reach(parts, 'L', target, Vector(DRAW_POLE).normalized(), raise_)
    s = _body_space(parts, parts['sock_handR'])
    _orient_hand(parts, 'L', s.to_3x3() @ Vector((0, 1, 0)), None, raise_)


def pose_scene(scene, offsets):
    """Rest rotation + offsets on every rig part present, the bow shot's arms (anim.ts bowPose), then the shoulder
    sockets follow their arms (anim.ts followShoulders)."""
    parts = {_strip(o.name): o for o in scene.objects}
    for name in ('armL', 'armR', 'body'):
        if name in parts and parts[name].get('rest_loc') is None:
            parts[name]['rest_loc'] = tuple(parts[name].location)
    if 'body' in parts:
        parts['body'].location = Vector(parts['body']['rest_loc']) + Vector((0, offsets.get('lift', 0.0), 0))
    for name, r in offsets.items():
        o = parts.get(name)
        if o is None or name in ('bow', 'lift'):
            continue
        base = o.get('rest_rot')
        if base is None:
            o['rest_rot'] = base = tuple(o.rotation_euler)
        # three.js Euler order 'XYZ' (Blender 'ZYX'); an elbow's is 'YXZ' (Blender 'ZXY'): it bends, then turns.
        o.rotation_mode = 'ZXY' if name in ('elbowL', 'elbowR') else 'ZYX'
        o.rotation_euler = tuple(b + v for b, v in zip(base, r))
    if 'bow' in offsets:
        bow_pose(parts, offsets['bow'])
    for side in ('L', 'R'):
        arm, sock = parts.get(f'arm{side}'), parts.get(f'sock_shoulder{side}')
        if not arm or not sock or arm.parent is not sock.parent:
            continue
        if sock.get('rest_loc') is None:
            sock['rest_loc'] = tuple(sock.location)
        turn = Quaternion().slerp(_quat(arm), FOLLOW)
        rest = Vector(arm['rest_loc'])
        sock.location = rest + turn @ (Vector(sock['rest_loc']) - rest)
        _set_quat(sock, turn)
    bpy.context.view_layer.update()
