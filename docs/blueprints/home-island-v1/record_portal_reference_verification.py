"""Post-delivery reference verification only; never render or alter visual/source deliverables."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import struct

root = Path(__file__).resolve().parent
image_path = root / 'references/01-portal-hub.png'
data = image_path.read_bytes()
assert data[:8] == b'\x89PNG\r\n\x1a\n'
width, height = struct.unpack_from('>II', data, 16)
reference_hash = hashlib.sha256(data).hexdigest()
assert reference_hash == '2007f55c67b13a441a34f0c4a5bc4771a609aa20947202cba77b6958307361c5'
delivery = json.loads((root / 'delivery-manifest.json').read_text(encoding='utf-8'))
unchanged = []
for record in delivery['outputs'] + [delivery['source_bundle']]:
    path = Path(record['local_path'])
    assert hashlib.sha256(path.read_bytes()).hexdigest() == record['sha256'], path
    unchanged.append({'filename': path.name, 'sha256': record['sha256'], 'unchanged': True})

report = {
    'purpose': 'Post-delivery read-only reference verification by Codex; no visual design, rendering, source edits or Library artifact replacements.',
    'verified_at_utc': datetime.now(timezone.utc).isoformat(),
    'reference': {
        'filename': image_path.name, 'local_path': str(image_path),
        'library_file_id': 'libfile_c4a34c2e2c84819194416fd921dd2d26',
        'file_id': 'file_00000000bd1081f7beb279261f8b72c4',
        'sha256': reference_hash, 'size_bytes': len(data), 'dimensions': [width, height],
        'capture_time': '2026-10-01 02:54 UTC', 'capture_time_source': 'parent supplied; not inferred from Library upload time',
        'materialization': 'Current resolved-reference Library flow and unchanged current metadata-preserving helper with native Windows extended-attribute adapter; helper exited 0.',
        'pixels_inspected': True,
    },
    'observed_pixels': [
        'Six upright oval portal windows on stepped stone bases with corner fittings and floating destination titles.',
        'Lit Mine, Foothills and Lair windows show destination imagery within coloured glowing rims/halos.',
        'The Sunken Ruin window is dark/sealed in this capture; Mirefen and Frostspire are also dark chapter placeholders. No quest/save-state cause is inferred from pixels alone.',
    ],
    'comparison': [
        'The proposed court retains the actual existing oval-window, destination-glimpse, coloured-halo, floating-title and stepped-stone-base identity; the existing runtime portal appearance/code is to be reused, not replaced by the schematic drawings.',
        'Code-grounded dimensions remain 2.2 by 3.0 window, 3.0 stepped base, radius-10.5 six-slot arrangement at the retained angles.',
        'The saved proposal distinguishes present slots from progression-dependent opening and marks lit examples as illustrative, so the sealed Ruin in this capture is not a contradiction.',
        'The drawings remain schematic and do not reproduce the runtime shaders or prove camera/gameplay behaviour.',
    ],
    'material_contradiction_found': False, 'redesign_or_regeneration_required': False,
    'unchanged_deliverables': unchanged,
    'history': 'Opus did not have these exact pixels during authoring; the original provenance correctly records that earlier limitation. This appendix records the later successful reference verification. Published PNGs and source ZIP are preserved unchanged.',
    'process_status': 'No Claude design job was started for this verification. The materialization helper exited; earlier task-owned Claude jobs were already finished.',
}
(root / 'portal-reference-verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
manifest_path = root / 'reference-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
snapshot = image_path.relative_to(root).as_posix()
if not any(item['snapshot'] == snapshot for item in manifest['files']):
    manifest['files'].append({'source': 'Library libfile_c4a34c2e2c84819194416fd921dd2d26',
                              'snapshot': snapshot, 'sha256': reference_hash,
                              'added_after_delivery_for_reference_verification_only': True})
manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({'reference_pixels_inspected': True, 'material_contradiction_found': False,
                  'unchanged_deliverables': [item['filename'] for item in unchanged],
                  'report': str(root / 'portal-reference-verification.json')}))
