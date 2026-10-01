"""Orchestration only: copy evidence; never design, draw, or render."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import shutil

root = Path(__file__).resolve().parent
repo = root.parents[2]
refs = root / 'references'
refs.mkdir(exist_ok=True)
sources = [
    'docs/WORKING_DESIGN_PLAN.md', 'src/data/zoneMaps.ts', 'src/data/zones.ts',
    'src/data/keep.ts', 'src/world/worldView.ts', 'src/world/trees.ts',
    'src/world/portalFx.ts', 'src/world/layout.ts', 'src/world/terrain.ts',
    'src/world/props.ts', 'src/render/kit.ts', 'src/world/building.ts',
    'src/world/buildingModel.ts', 'src/entities/player.ts',
    'inspect/browser-checkpoint.png',
    'docs/blueprints/castle-v2/references/02-castle-exterior-path.png',
]
records = []
for name in sources:
    source = repo / name
    target = refs / source.name
    shutil.copy2(source, target)
    records.append({'source': name, 'snapshot': target.relative_to(root).as_posix(),
                    'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
castle = refs / 'castle-v2'
castle.mkdir(exist_ok=True)
for name in ['design.json', 'provenance.json', 'castle-v2-overview.png',
             'castle-v2-ground.png', 'castle-v2-upper.png']:
    source = repo / 'docs/blueprints/castle-v2' / name
    target = castle / name
    shutil.copy2(source, target)
    records.append({'source': source.relative_to(repo).as_posix(),
                    'snapshot': target.relative_to(root).as_posix(),
                    'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
(root / 'reference-manifest.json').write_text(json.dumps({
    'snapshotted_at_utc': datetime.now(timezone.utc).isoformat(), 'files': records
}, indent=2), encoding='utf-8')
runner = (repo / 'docs/blueprints/castle-v2/run_opus.py').read_text(encoding='utf-8')
(root / 'run_opus.py').write_text(runner.replace('castle-v2 reviewable plans only',
                                               'home-island-v1 reviewable plans only'), encoding='utf-8')
(root / 'mcp-empty.json').write_text(json.dumps({'mcpServers': {}}), encoding='utf-8')
print(f'Prepared {len(records)} evidence snapshots and copied the authorized local runner to {root}')
