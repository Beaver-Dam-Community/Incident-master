"""Generate the web catalog from the reviewed November 1 compilation.
compiled-catalog.json is authoritative; older source/copy files are historical.
"""
from pathlib import Path
import json, string
ROOT=Path(__file__).resolve().parent
payload=json.loads((ROOT/'compiled-catalog.json').read_text(encoding='utf-8'))
codes=json.loads((ROOT/'scenario-codes.json').read_text(encoding='utf-8'))
cards=payload['scenarios']
tokens={'tomato','pepper','meat','shrimp','cheese','bacon'}
assert len(cards)==len({s['id'] for s in cards})==19
assert [s['code'] for s in cards]==list(string.ascii_uppercase[:19])
assert codes=={s['id']:s['code'] for s in cards}
for s in cards:
    assert s['accepted'][0]==s['recipe'],s['id']
    assert len(s['recipe'])==len(set(s['recipe'])),s['id']
    assert set(s['recipe']).isdisjoint(s['unused']),s['id']
    assert set(s['recipe'])|set(s['unused'])==tokens,s['id']
    assert [a['token'] for a in s['steps']]==s['recipe'],s['id']
    for a in s['steps']:
        assert all(a[k].strip() for k in ['label','shortLabel','reason']),s['id']
    for order in s['accepted']:
        assert len(order)==len(set(order))==len(s['recipe']),s['id']
        assert set(order)==set(s['recipe']),s['id']
for g in payload['groups']:
    assert len([s for s in cards if s['group']==g['id']])==g['count']
(ROOT/'dist/scenarios.js').write_text('globalThis.BOOTH_CONTENT = '+json.dumps(payload,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
print('Prepared 19 compiled scenarios in A-S order; independent AI pieces preserved.')
