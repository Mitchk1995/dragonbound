"""Humanoid poses for the Blender audits (fitcheck.py, plate_variants.py), mirrored from src/render/anim.ts: rotation
offsets per rig part for the walk and every attack, the bow shot's two-bone reach and hand turns, and pose_scene,
which applies them to a built character the way the game does. Keep the constants in step with anim.ts (same names).
"""
import math
import re

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

_strip = lambda n: re.sub(r'\.\d{3}$', '', n)

IMPACT = 0.55                                  # src/data/tuning.ts COMBAT_TUNING.impact
FOLLOW = 0.75                                  # SHOULDER_FOLLOW
SPLAY = 0.1                                    # ARM_SPLAY
LEG_SWING = 0.7
ELBOW_REST, HOLD_BEND, HOLD_WRIST, SIDE_WRIST = -0.25, -1.57, 0.17, 0.5
BOW_DEPTH, BOW_SWING = 0.3, 0.045
BOW_FWD, BOW_OUT, BOW_OUT_K = -0.42, 0.24, 1.63
BOW_BEND, BOW_ELBOW_TURN, BOW_TIP, BOW_WRIST_ROLL = 0.69, -0.08, -0.07, 0.46
BOW_SPIN, BOW_SPIN_K = 0.64, 0.58
WIND_ARM, WIND_ELBOW, SWING_WRIST, STRIKE_ELBOW = 2.6, -1.0, 1.3, -0.15
CAST_ARM, CAST_ELBOW, CAST_WRIST, CAST_REACH = 2.1, -0.1, 0.885, 1.7
BOW_TURN, BOW_HEAD, BOW_RAISE = math.pi / 2, 1.0, 0.2
BOW_AIM = (-0.8097, -0.0192, 0.5865)
BOW_ROLL = (0, 1, 0.3)
BOW_MID, DRAW_GRAB, DRAW_ANCHOR = 0.15, 1.289, 1.349
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


def anim_pose(kind=None, a=-1.0, sw=0.0, hold='empty', move=None, hurt=0.0, stance=None):
    """anim.ts Rig.update for a humanoid: rotation offsets {part: (x, y, z)} for the walk phase sw (sin of the stride)
    at `move` of full speed (by default full speed whenever sw is not 0), `hurt` (0..1, just hit) and attack `kind` at
    progress a (-1: none), the right hand carrying in `hold`, and 'lift', how far the body (arms, torso and head; the
    legs hang from the root) rises in the stride. The bow shot's arms are placed by pose_scene (anim.ts bowPose),
    which this marks with 'bow': a and 'stance', the weight the shot's pose is blended in by (anim.ts: the eased
    Rig.stance): by default as far as the shot's own rise has taken it; less while lowering the bow after it, a = 1."""
    move = (1.0 if sw else 0.0) if move is None else move
    upright, bow = hold == 'upright', hold == 'bow'
    swl = -sw * 0.5 * move
    swr = sw * (0.15 if upright else BOW_SWING if bow else 0.3) * move
    p = {'body': (-hurt * 0.3 + 0.08 * move, 0, 0), 'lift': abs(sw) * 0.06 * move, 'head': (-0.05 * move, 0, 0),
         'armL': (swl, 0, SPLAY), 'armR': (swr + (BOW_FWD if bow else 0), 0, -SPLAY - (BOW_OUT if bow else 0)),
         'legL': (sw * LEG_SWING * move, 0, 0), 'legR': (-sw * LEG_SWING * move, 0, 0),
         'elbowL': (ELBOW_REST + min(0, swl) * 0.5, 0, 0),
         'elbowR': ((HOLD_BEND - swr, 0, 0) if upright else (-BOW_BEND, BOW_ELBOW_TURN, 0) if bow
                    else (ELBOW_REST + min(0, swr) * 0.5, 0, 0)),
         'handL': (0, 0, 0),
         'handR': ((SIDE_WRIST - swr, 0, 0) if hold == 'side' else (HOLD_WRIST, 0, 0) if upright
                   else (BOW_TIP - swr, BOW_WRIST_ROLL, 0) if bow else (0, 0, 0))}
    if bow:
        # The bow turned in the hand, its string toward the archer, and held further forward and out the deeper it
        # is (pose_scene, from the bow in the scene: anim.ts Rig.update).
        p['bowspin'] = 1.0
    if a < 0 or kind is None:
        return p
    # Every attack starts and ends at the carry (anim.ts Rig.carry).
    x0, e0, w0, xl, el = p['armR'][0], p['elbowR'][0], p['handR'][0], p['armL'][0], p['elbowL'][0]
    if kind == 'swing':
        up, down = IMPACT - 0.1, IMPACT + 0.1
        if a < up:
            k = _ease(a / up)
            x, e = _lerp(x0, -WIND_ARM, k), _lerp(e0, WIND_ELBOW, k)
        elif a < down:
            k = _ease((a - up) / (down - up))
            x, e = -WIND_ARM + (WIND_ARM - 0.35) * k, _lerp(WIND_ELBOW, STRIKE_ELBOW, k)
        else:
            k = _ease((a - down) / (1 - down))
            x, e = _lerp(-0.35, x0, k), _lerp(STRIKE_ELBOW, e0, k)
        w = _lerp(w0, SWING_WRIST, _ease(min(1, a / up))) if a < IMPACT else _lerp(SWING_WRIST, w0, _ease((a - IMPACT) / (1 - IMPACT)))
        p['armR'], p['elbowR'], p['handR'] = (x, 0, -SPLAY), (e, 0, 0), (w, 0, 0)
        p['body'] = (-0.1 if a < up else 0.15, 0, 0)
        # The whole character turns into the swing (anim.ts: the root, legs and all), so its hips never twist against
        # its legs. A turn of the whole moves nothing against anything else: pose_scene leaves it out.
        p['root'] = (0, 0.3 * _ease(a / up) if a < up else -0.3 * (1 - a), 0)
    elif kind == 'slam':
        lift = _ease(a / IMPACT) if a < IMPACT else 1 - _ease((a - IMPACT) / (1 - IMPACT))
        k = _ease(a / IMPACT) if a < IMPACT else _ease((a - IMPACT) / (1 - IMPACT))
        xr, xL = (_lerp(x0, -3.0, k), _lerp(xl, -3.0, k)) if a < IMPACT else (_lerp(-3.0, x0, k), _lerp(-3.0, xl, k))
        p['armR'], p['armL'] = (xr, 0, -SPLAY), (xL, 0, SPLAY)
        p['elbowR'], p['elbowL'] = (_lerp(e0, -0.5, lift), 0, 0), (_lerp(el, -0.5, lift), 0, 0)
        p['body'] = (-0.2 if a < IMPACT else 0.25, 0, 0)
    elif kind == 'bow':
        w = _ease(min(1, a / BOW_RAISE)) if stance is None else stance
        p['bow'], p['stance'] = a, w
        p['head'] = (0, -BOW_TURN * BOW_HEAD * w, 0)
    elif kind == 'cast':
        lift = _ease(a / IMPACT) if a < IMPACT else 1 - _ease((a - IMPACT) / (1 - IMPACT))
        p['armR'], p['elbowR'] = (_lerp(x0, -CAST_ARM, lift), 0, -SPLAY), (_lerp(e0, CAST_ELBOW, lift), 0, 0)
        p['handR'] = (_lerp(w0, CAST_WRIST, lift), 0, 0)
        p['armL'], p['elbowL'] = (_lerp(xl, -CAST_REACH, lift), 0, SPLAY), (_lerp(el, -0.35, lift), 0, 0)
        p['body'] = (-0.1 * lift, 0, 0)
    elif kind == 'throw':
        k = _ease(a / IMPACT) if a < IMPACT else _ease((a - IMPACT) / (1 - IMPACT))
        x, e = (_lerp(x0, -2.6, k), _lerp(e0, -1.1, k)) if a < IMPACT else (_lerp(-2.6, x0, k), _lerp(-1.1, e0, k))
        p['armR'], p['elbowR'] = (x, 0, -SPLAY), (e, 0, 0)
    return p


# The frames each attack is checked at: wind-up, impact and follow-through (the bow: taking the string, mid-draw, full
# draw and after the release, then lowering it). The bow coming up from the carry (before 0.2, a sixth of a second) is
# not checked for arms: in it the chain shirt's draw arm dips up to 0.045 into the chest, under the shoulder cap
# (bowcheck.py checks those frames for the bow itself).
ATTACK_FRAMES = {'swing': (0.36, 0.45, 0.55, 0.67), 'slam': (0.45, 0.6), 'cast': (0.4, 0.55, 0.8), 'throw': (0.36, 0.55),
                 'bow': (0.2, 0.35, 0.5, 0.8)}
# The bow lowered after the last shot, back to the carry (anim.ts Rig.stance), at these weights of the shot's pose.
BOW_FADE = (0.75, 0.5, 0.25)


def pose_list(kinds, hold='empty'):
    out = [('idle', anim_pose(hold=hold)), ('walk+', anim_pose(sw=1.0, hold=hold)), ('walk-', anim_pose(sw=-1.0, hold=hold))]
    for k in kinds:
        out += [(f'{k}@{a}', anim_pose(k, a, hold=hold)) for a in ATTACK_FRAMES[k]]
        if k == 'bow':
            out += [(f'bow lowering {w}', anim_pose(k, 1.0, hold=hold, stance=w)) for w in BOW_FADE]
    return out


# The whole stride, step by step, at every lean the body takes while the legs swing (anim.ts update and attackPose):
# walking (and so running and the dodge roll, which only stride faster), walking just hit (leaning back), and the
# sword's wind-up and strike, in which the hero steps after a target backing out of reach (tuning.ts meleeTrack);
# then standing, hurt and in every attack's frames. skirtcheck.py skirt_clip_all checks the legs against everything
# hanging from the hips in all of them.
STRIDE_STEPS = 8
TRACK_FRAMES = (0.2, 0.4, 0.46, 0.54)


def stride_poses(kinds=(), hold='empty', steps=STRIDE_STEPS):
    out = []
    for k in range(-steps, steps + 1):
        sw = k / steps
        out.append((f'walk {sw:+.2f}', anim_pose(sw=sw, hold=hold, move=1.0)))
        out.append((f'walk hurt {sw:+.2f}', anim_pose(sw=sw, hold=hold, move=1.0, hurt=1.0)))
        if 'swing' in kinds:
            out += [(f'swing@{a} {sw:+.2f}', anim_pose('swing', a, sw=sw, hold=hold, move=1.0)) for a in TRACK_FRAMES]
    out.append(('stand hurt', anim_pose(hold=hold, hurt=1.0)))
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


def _orient_hand(parts, side, axis, along, k, start=None):
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
    if start is not None:
        _set_quat(hand, fore.inverted() @ start.slerp(want, k))
    else:
        _set_quat(hand, _quat(hand).slerp(fore.inverted() @ want, k))


def bow_string(parts):
    """The middle of a held bow's static string in the hand socket's frame, as BowDraw (bowDraw.ts) finds it: the
    longest long, thin piece under the socket. None without a bow."""
    sock = parts.get('sock_handR')
    if sock is None:
        return None
    bpy.context.view_layer.update()
    inv = sock.matrix_world.inverted()
    best = None
    for o in sock.children_recursive:
        if o.type != 'MESH' or not len(o.data.vertices):
            continue
        pts = [inv @ (o.matrix_world @ v.co) for v in o.data.vertices]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        dims = sorted(hi - lo)
        if dims[0] < 0.035 and dims[1] < 0.035 and dims[2] > 0.6 and (best is None or dims[2] > best[0]):
            best = (dims[2], (lo + hi) / 2)
    return best and best[1]


def bow_depth(parts):
    """How far a bow's string lies from its grip (the socket's axis, through the hand's hole): what BowDraw measures.
    None without a bow."""
    c = bow_string(parts)
    return c and math.hypot(c.x, c.z)


def bow_spin(depth):
    """anim.ts bowSpin: how far the carried bow is turned in the hand (about the grip) from its frame in the draw, for
    a string `depth` from the grip."""
    return BOW_SPIN + BOW_SPIN_K * (depth - BOW_DEPTH) if depth else 0.0


def _spin(parts, w):
    """Turns the bow in the hand: the carry's turn, by w (anim.ts Rig: sock_handR)."""
    sock = parts.get('sock_handR')
    if sock is None:
        return
    if sock.get('rest_rot') is None:
        sock['rest_rot'] = tuple(sock.rotation_euler)
    sock.rotation_mode = 'ZYX'
    r = sock['rest_rot']
    sock.rotation_euler = (r[0], r[1] + bow_spin(bow_depth(parts)) * w, r[2])


def bow_pose(parts, a, w):
    """anim.ts Rig.bowPose at stance w (the body's own turn is left out: it moves nothing relative to the body)."""
    if not all(n in parts for n in ('body', 'armR', 'elbowR', 'armL', 'elbowL', 'handL', 'handR', 'sock_handR')):
        return
    arm, er = parts['armR'], parts['elbowR']
    carried = _body_space(parts, parts['handR']).to_quaternion()      # the bow hand as carried, before the arm moves
    carry = (_quat(arm), tuple(er.rotation_euler))                     # the bow arm's carry (anim.ts Rig.carry)
    # The draw hand's target, measured on the bow as it is aimed (the stance in full).
    _aim_bow(parts, 1.0, carried, carry)
    s = _body_space(parts, parts['sock_handR'])
    target = s @ Vector((0, BOW_MID, 0))
    back = (s.to_3x3() @ Vector(BOW_STRING)).normalized()
    target += back * _lerp(DRAW_GRAB, DRAW_ANCHOR, draw_amount(a) if a < IMPACT else 1)
    along = s.to_3x3() @ Vector((0, 1, 0))
    _set_quat(arm, carry[0])
    _aim_bow(parts, w, carried, carry)
    _reach(parts, 'L', target, Vector(DRAW_POLE).normalized(), w)
    _orient_hand(parts, 'L', along, None, w)


def _aim_bow(parts, w, carried, carry):
    """anim.ts Rig.aimBow: the bow arm into the shot by w from its carry (the arm's quaternion and the elbow's Euler)."""
    _spin(parts, 1 - w ** 4)
    _point_arm(parts['armR'], Vector(BOW_AIM), Vector(BOW_ROLL), w)
    er, (_, e) = parts['elbowR'], carry
    r = er['rest_rot']
    er.rotation_euler = (r[0] + _lerp(e[0] - r[0], 0, w), r[1] + _lerp(e[1] - r[1], 0, w), e[2])
    _orient_hand(parts, 'R', Vector((0, 1, 0)), Vector((-math.cos(BOW_TURN), 0, -math.sin(BOW_TURN))), w, carried)


def pose_scene(scene, offsets):
    """Rest rotation + offsets on every rig part present, the bow shot's arms (anim.ts bowPose), then the shoulder
    sockets follow their arms (anim.ts followShoulders) and the hips stay level with the legs (anim.ts levelHips)."""
    parts = {_strip(o.name): o for o in scene.objects}
    for name in ('armL', 'armR', 'body'):
        if name in parts and parts[name].get('rest_loc') is None:
            parts[name]['rest_loc'] = tuple(parts[name].location)
    if 'body' in parts:
        parts['body'].location = Vector(parts['body']['rest_loc']) + Vector((0, offsets.get('lift', 0.0), 0))
    # Legs hinged low under level hips swing further (anim.ts Rig: swing).
    leg, body = parts.get('legL'), parts.get('body')
    hip = Vector(body['rest_loc']).y if body is not None else 0.0
    k = math.sqrt(hip / leg.location.y) if 'sock_hips' in parts and leg and 0 < leg.location.y < hip else 1.0
    # A deeper bow is carried further out (anim.ts Rig.update: BOW_OUT_K).
    depth = bow_depth(parts) if 'bowspin' in offsets else None
    dd = depth - BOW_DEPTH if depth else 0.0
    for name, r in offsets.items():
        o = parts.get(name)
        if o is None or name in ('bow', 'stance', 'bowspin', 'lift', 'root'):
            continue
        if name in ('legL', 'legR'):
            r = (r[0] * k, r[1], r[2])
        if name == 'armR' and dd:
            r = (r[0], r[1], r[2] - BOW_OUT_K * dd)
        base = o.get('rest_rot')
        if base is None:
            o['rest_rot'] = base = tuple(o.rotation_euler)
        # three.js Euler order 'XYZ' (Blender 'ZYX'); an elbow's is 'YXZ' (Blender 'ZXY'): it bends, then turns.
        o.rotation_mode = 'ZXY' if name in ('elbowL', 'elbowR') else 'ZYX'
        o.rotation_euler = tuple(b + v for b, v in zip(base, r))
    _spin(parts, offsets.get('bowspin', 0.0))
    if 'bow' in offsets:
        bow_pose(parts, offsets['bow'], offsets['stance'])
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
    hips, body = parts.get('sock_hips'), parts.get('body')
    if hips and body and hips.parent is body:
        if hips.get('rest_rot') is None:
            hips['rest_rot'] = tuple(hips.rotation_euler)
        rest = lambda o: Euler(o.get('rest_rot', (0, 0, 0)), 'ZYX').to_quaternion()
        _set_quat(hips, _quat(body).inverted() @ rest(body) @ rest(hips))
    bpy.context.view_layer.update()
    ponytail(scene, parts)


# The tied hair's tail (src/render/ponytail.ts, the same names and values), settled: no follow-through in a still pose.
PONYTAIL = 'ponytail'
PONYTAIL_BACK, PONYTAIL_OUT = math.radians(55), math.radians(10)


def ponytail(scene, parts):
    """ponytail.ts Ponytail.update, settled: the tail (hair.py hair_3, on its pivot at the foot of the tie) turns with
    the head but hangs from the tie in the root's frame, leaning back and out over the shoulder as far as the tie has
    come round to it (ponytailHang), and resting on the back as the body leans forward."""
    tail, head = parts.get(PONYTAIL), parts.get('head')
    if tail is None or head is None:
        return
    root = next(o for o in scene.objects if o.parent is None and _strip(o.name).endswith('_root'))
    bpy.context.view_layer.update()
    q_root = root.matrix_world.to_quaternion()
    front = (q_root.inverted() @ head.matrix_world.to_quaternion()) @ Vector((0, 0, 1))
    turn = math.atan2(front.x, front.z)
    s = math.sin(turn)
    hang = (Quaternion((0, 0, 1), -PONYTAIL_OUT * s) @ Quaternion((1, 0, 0), PONYTAIL_BACK * abs(s))
            @ Quaternion((0, 1, 0), turn))
    body = parts.get('body')
    up = (q_root.inverted() @ body.matrix_world.to_quaternion()) @ Vector((0, 1, 0)) if body else Vector((0, 1, 0))
    lean = Quaternion((1, 0, 0), max(0.0, math.atan2(up.z, up.y)))
    _set_quat(tail, tail.parent.matrix_world.to_quaternion().inverted() @ q_root @ lean @ hang)
    bpy.context.view_layer.update()
