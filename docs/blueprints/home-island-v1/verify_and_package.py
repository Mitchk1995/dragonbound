"""Codex transport/tests only. Never import or execute the visual renderer."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import struct
import xml.etree.ElementTree as ET
import zipfile
import zlib

ROOT = Path(__file__).resolve().parent
PREFIX = ROOT.as_posix().lower() + '/'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_png(path):
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', path.name
    i = 8
    compressed = []
    width = height = bits = color = None
    ended = False
    while i < len(data):
        size = struct.unpack_from('>I', data, i)[0]
        kind = data[i + 4:i + 8]
        payload = data[i + 8:i + 8 + size]
        crc = struct.unpack_from('>I', data, i + 8 + size)[0]
        assert zlib.crc32(kind + payload) & 0xffffffff == crc, (path.name, kind)
        if kind == b'IHDR':
            width, height, bits, color, compression, filtering, interlaced = struct.unpack('>IIBBBBB', payload)
            assert bits == 8 and color in (2, 6) and not interlaced, path.name
            assert width >= 1200 and height >= 900, (path.name, width, height)
        elif kind == b'IDAT':
            compressed.append(payload)
        elif kind == b'IEND':
            ended = True
        i += 12 + size
    assert ended and i == len(data), path.name
    decoded = zlib.decompress(b''.join(compressed))
    channels = {2: 3, 6: 4}[color]
    assert len(decoded) == height * (1 + width * channels), path.name
    return {'width': width, 'height': height, 'size_bytes': len(data), 'sha256': digest(path)}


design = json.loads((ROOT / 'design.json').read_text(encoding='utf-8'))
assert 'PROPOSAL' in design['status'] and 'NOT IMPLEMENTED' in design['status']
assert 'PROVISIONAL' in design['castle_status']
assert {p['id'] for p in design['portals']} == {'mine', 'foothills', 'ruin', 'lair', 'mirefen', 'frostspire'}
assert all(p.get('state') != 'live' for p in design['portals']), 'Unconditional live-state assumption remains'
assert all({'slot', 'open_rule', 'open_state'} <= set(p) for p in design['portals'])
castle_path = ROOT / design['castle']['source']
assert castle_path.resolve().is_relative_to(ROOT)
assert digest(castle_path) == design['castle']['source_sha256']
castle = json.loads(castle_path.read_text(encoding='utf-8'))
current_castle_path = ROOT.parents[2] / 'docs/blueprints/castle-v2/design.json'
current_castle = json.loads(current_castle_path.read_text(encoding='utf-8'))
assert castle['curtain'] == current_castle['curtain']
assert castle['curtain_thickness'] == current_castle['curtain_thickness']
assert [(t['x'], t['y'], t['r']) for t in castle['towers']] == [(t['x'], t['y'], t['r']) for t in current_castle['towers']]

# Conservative axis bounds of the source wall band and circular towers, not only curtain centres.
poly = castle['curtain']
half = castle['curtain_thickness']/2
envelope_points = [(x+dx,z+dz) for x,z in poly for dx,dz in [(-half,0),(half,0),(0,-half),(0,half)]]
for tower in castle['towers']:
    x,z,r = tower['x'],tower['y'],tower['r']
    envelope_points.extend([(x-r,z),(x+r,z),(x,z-r),(x,z+r)])
envelope = [min(x for x,z in envelope_points), min(z for x,z in envelope_points),
            max(x for x,z in envelope_points), max(z for x,z in envelope_points)]
assert all(abs(a-b)<0.02 for a,b in zip(envelope,[6.9,2.4,95.8,81.6])), envelope
assert design['castle']['transform']['rotation_deg'] == 0
tx,tz = design['castle']['transform']['translate']
world_envelope = [envelope[0]+tx,envelope[1]+tz,envelope[2]+tx,envelope[3]+tz]

outputs = ['home-island-topdown.svg', 'home-island-topdown.png',
           'home-island-oblique.svg', 'home-island-oblique.png']
manifest = json.loads((ROOT / 'render-manifest.json').read_text(encoding='utf-8'))
pngs = {}
for name in outputs:
    path = ROOT / name
    assert path.is_file() and digest(path) == manifest['outputs'][name], name
    if path.suffix == '.png':
        pngs[name] = verify_png(path)
    else:
        ET.fromstring(path.read_text(encoding='utf-8'))
        text = path.read_text(encoding='utf-8')
        assert 'design-sha256:' + digest(ROOT / 'design.json') in text
        assert 'PROPOSAL' in text and 'OPUS-AUTHORED' in text and 'PROVISIONAL' in text

sessions = []
mutations = []
render_calls = []
all_models = set()
for tag in ['network-authorized', 'final-quality', 'upstream-sync']:
    status = json.loads((ROOT / f'{tag}-runner-status.json').read_text(encoding='utf-8'))
    result = json.loads((ROOT / f'{tag}-opus-result.json').read_text(encoding='utf-8'))
    assert status['status'] == 'finished' and status['exit_code'] == 0
    assert not result.get('is_error') and result['subtype'] == 'success'
    assert 'opus' in status['actual_model'].lower()
    models = set()
    for line in (ROOT / f'{tag}-opus-events.jsonl').read_text(encoding='utf-8').splitlines():
        event = json.loads(line)
        if event.get('type') != 'assistant':
            continue
        msg = event.get('message', {})
        model = msg.get('model')
        if model:
            models.add(model)
            all_models.add(model)
        for block in msg.get('content', []):
            if block.get('type') != 'tool_use':
                continue
            tool = block.get('name')
            data = block.get('input', {})
            if tool in ('Write', 'Edit'):
                target = data['file_path'].replace('\\', '/').lower()
                assert target.startswith(PREFIX), target
                assert not target.startswith(PREFIX + 'references/'), target
                assert model and 'opus' in model.lower(), model
                mutations.append({'session_tag': tag, 'tool': tool, 'path': data['file_path'], 'model': model})
            if tool == 'Bash' and 'python render.py' in data.get('command', ''):
                render_calls.append({'session_tag': tag, 'model': model, 'tool_use_id': block['id']})
    sessions.append({
        'tag': tag, 'started_at_utc': status['started_at_utc'],
        'finished_at_utc': status['finished_at_utc'], 'actual_model': status['actual_model'],
        'session_id': status['session_id'], 'assistant_models': sorted(models),
        'terminal_result': result['subtype'],
        'permission_denials_count': len(result.get('permission_denials', [])),
    })
assert all('opus' in model.lower() for model in all_models), all_models
assert render_calls, 'No Opus rendering calls were observed'

report = (ROOT / 'validation-report.txt').read_text(encoding='utf-8')
assert not any(line.startswith('FAIL ') for line in report.splitlines())
assert 'passed' in report.lower()
provenance = json.loads((ROOT / 'provenance.json').read_text(encoding='utf-8'))

evidence = {
    'purpose': 'Codex nonvisual execution, integrity and transport evidence. No Codex design, drawing, rendering or visual patching.',
    'compiled_at_utc': datetime.now(timezone.utc).isoformat(),
    'ownership': 'Opus authored and repaired the design, renderer, SVGs and PNGs. Codex orchestrated, copied evidence, checked integrity and packaged bytes.',
    'scope_check': 'Every observed Claude Write/Edit mutation stayed in home-island-v1 and outside its read-only references. No game edits or castle-v2 edits by these sessions.',
    'sessions': sessions, 'opus_visual_renderer_calls': render_calls,
    'observed_mutations_count': len(mutations), 'assistant_models': sorted(all_models),
    'native_png_integrity': pngs, 'source_sha256': digest(ROOT / 'design.json'),
    'castle_reference_sha256': digest(castle_path),
    'castle_outer_envelope_source': envelope, 'castle_outer_envelope_proposed_world': world_envelope,
    'castle_outer_envelope_basis': 'Conservative axis bounds of curtain-centre vertices padded by half the current 2.2-unit wall thickness, union circular tower bounds; agrees with parent-provided 6.9,2.4-95.8,81.6 envelope. Not a 3D collision test.',
    'castle_revision_coordination': 'Current castle-v2 curtain, wall thickness and tower x/z/r match the snapshot. The parent reports the separate courtyard correction leaves the outer envelope unchanged. Interior furnishings are omitted from island drawings; courtyard/W2 fixes stay with that task.',
    'current_castle_geometry_checked_at_utc': datetime.now(timezone.utc).isoformat(),
    'validation_report_sha256': digest(ROOT / 'validation-report.txt'),
    'review_limits': 'Opus geometry validator and source/hash/PNG integrity checks only; no navmesh, runtime collision or gameplay playtest.',
}
(ROOT / 'execution-evidence.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')

bundle_names = outputs + ['design.json', 'render.py', 'validate.py', 'validation-report.txt',
                         'render-manifest.json', 'provenance.json', 'checkpoint.json', 'REVIEW.txt',
                         'reference-manifest.json', 'execution-evidence.json']
paths = [ROOT / name for name in bundle_names]
paths.extend(sorted((ROOT / 'references').rglob('*')))
paths = [p for p in paths if p.is_file()]
archive_path = ROOT / 'dragonbound-home-island-v1-source.zip'
with zipfile.ZipFile(archive_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=7) as archive:
    for path in paths:
        assert path.resolve().is_relative_to(ROOT) and not path.is_symlink(), path
        archive.write(path, path.relative_to(ROOT).as_posix())
with zipfile.ZipFile(archive_path) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == {p.relative_to(ROOT).as_posix() for p in paths}
delivery = {
    'outputs': [{'local_path': str(ROOT / name), 'sha256': digest(ROOT / name),
                 'size_bytes': (ROOT / name).stat().st_size} for name in ['home-island-topdown.png', 'home-island-oblique.png']],
    'source_bundle': {'local_path': str(archive_path), 'sha256': digest(archive_path),
                      'size_bytes': archive_path.stat().st_size, 'files': len(paths)},
}
(ROOT / 'delivery-manifest.json').write_text(json.dumps(delivery, indent=2), encoding='utf-8')
print(json.dumps({'scope': 'passed', 'opus_models': sorted(all_models), 'pngs': pngs,
                  'archive_files': len(paths), 'archive_size_bytes': archive_path.stat().st_size,
                  'validation_summary': [s for s in report.splitlines() if 'passed' in s.lower()]}, indent=2))
