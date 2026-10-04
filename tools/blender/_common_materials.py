"""Colour palettes and material resolution for Dragonbound model scripts."""
import bpy

PAL = {
    'skin': 0xF2C49B, 'steel': 0xB9C6D2, 'steelDark': 0x7D8A99, 'gold': 0xE8B64A,
    'leather': 0x8A5A34, 'leatherDark': 0x5A3A22, 'cloth': 0x2F6DB5, 'clothDark': 0x1F4A80,
    'red': 0xC0392B, 'wood': 0x6B4426, 'goblin': 0x74B347, 'goblinDark': 0x4E7F2C,
    'kobold': 0xC77B3A, 'koboldDark': 0x8F5222, 'belly': 0xF2B45A, 'robe': 0x762438,
    'robeDark': 0x4A1426, 'fire': 0xFF7A1A, 'ember': 0xFFB040, 'bone': 0xEEE4CC,
    'black': 0x1A1414, 'eye': 0xFFE070, 'arcane': 0x6AA8FF, 'white': 0xFFFFFF,
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h):
    return tuple(srgb_to_linear(((h >> s) & 255) / 255) for s in (16, 8, 0)) + (1.0,)


def mat(color, emissive=None, strength=2.0, double_sided=False, metal=False):
    """Fixed-colour material. `metal` marks forged metal: the game gives it the shiny metal finish."""
    key = f'db_{color:06x}_{emissive or 0:06x}_{strength}_{int(double_sided)}' + ('_metal' if metal else '')
    m = bpy.data.materials.get(key)
    if m:
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    m.use_backface_culling = not double_sided
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = hex_rgba(color)
    bsdf.inputs['Roughness'].default_value = 0.35 if metal else 0.75
    bsdf.inputs['Metallic'].default_value = 1.0 if metal else 0.0
    if emissive is not None:
        bsdf.inputs['Emission Color'].default_value = hex_rgba(emissive)
        bsdf.inputs['Emission Strength'].default_value = strength
    return m


def c(name):
    return PAL[name] if isinstance(name, str) else name


def metallic(color):
    """Colour spec for a forged-metal part of a fixed colour (unique gear): pass it anywhere a colour is accepted."""
    return mat(c(color), metal=True)


# ─── Role materials (recoloured at runtime, see docs/ART_NAMES.md) ────────────
# Neutral placeholder colours; the game replaces them per skin tone / cloth dye / gear tier.
ROLE_COLORS = {
    'skin': 0xE0AC84, 'hair': 0x5A3A22, 'cloth': 0x3A6EA5, 'clothDark': 0x1F3F66, 'cloth2': 0x4B4B58, 'leather': 0x6A4428,
    'metal': 0xA9B3BD, 'trim': 0xD4A84A, 'dark': 0x3A3A44, 'glow': 0xFFB040,
}


def role(name):
    """Material named exactly ROLE_<name>; `glow` is emissive."""
    if name not in ROLE_COLORS:
        raise ValueError(f'unknown role {name}')
    key = f'ROLE_{name}'
    m = bpy.data.materials.get(key)
    if m:
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = hex_rgba(ROLE_COLORS[name])
    bsdf.inputs['Roughness'].default_value = 0.75
    bsdf.inputs['Metallic'].default_value = 0.0
    if name == 'glow':
        bsdf.inputs['Emission Color'].default_value = hex_rgba(ROLE_COLORS[name])
        bsdf.inputs['Emission Strength'].default_value = 3.0
    return m


class _Roles:
    """`R.metal` == 'ROLE:metal' -- pass anywhere a colour is accepted."""
    def __getattr__(self, n):
        if n.startswith('__'):
            raise AttributeError(n)
        return 'ROLE:' + n


R = _Roles()


def resolve_mat(color, emissive=None, strength=2.0, double_sided=False):
    """Colour spec -> material. Accepts a PAL key, a hex int, 'ROLE:<name>' or a bpy Material."""
    if isinstance(color, bpy.types.Material):
        return color
    if isinstance(color, str) and color.startswith('ROLE:'):
        return role(color[5:])
    return mat(c(color), c(emissive) if emissive is not None else None, strength, double_sided)
