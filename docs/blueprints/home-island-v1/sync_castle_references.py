"""Byte transport of the parent-coordinated castle revision; no design or rendering."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import shutil
root = Path(__file__).resolve().parent
repo = root.parents[2]
current = root / 'references/castle-v2'
initial = root / 'references/castle-v2-initial'
initial.mkdir(exist_ok=True)
manifest_path = root / 'reference-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
for name in ['design.json', 'provenance.json', 'castle-v2-overview.png', 'castle-v2-ground.png', 'castle-v2-upper.png']:
    old = current / name
    previous = initial / name
    if not previous.exists():
        shutil.copy2(old, previous)
    shutil.copy2(repo / 'docs/blueprints/castle-v2' / name, old)
    record = next(item for item in manifest['files'] if item['snapshot'] == old.relative_to(root).as_posix())
    record['previous_snapshot'] = previous.relative_to(root).as_posix()
    record['previous_sha256'] = hashlib.sha256(previous.read_bytes()).hexdigest()
    record['sha256'] = hashlib.sha256(old.read_bytes()).hexdigest()
    record['updated_snapshot_at_utc'] = datetime.now(timezone.utc).isoformat()
manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print('Preserved initial castle references and staged the current parent-owned revision.')
