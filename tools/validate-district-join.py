"""Does a spatial join against the statewide TLC district layers reproduce the
district assignments a county already publishes?

If it does, no county needs to carry congressional, senate or house fields on
its precinct polygons, and the counties whose fields are stale (Harris) or null
(El Paso) or fake (Bell) stop being a problem. That is the whole question this
script exists to answer, and Tarrant is the place to ask it: 707 precincts
whose Congress, Senate and House values are already known good, because the
live site has been serving them.

Run from the repo root, in a regular terminal:
    python3 tools/validate-district-join.py

Standard library only. The point-in-polygon functions are a direct port of the
ones in app.js so the build step and the browser cannot disagree about which
polygon a point falls in - two implementations would eventually differ at a
boundary and nothing would catch it.
"""

import json
import os
import sys

# ---------- point in polygon (ported from app.js) ----------

def ring_contains(lon, lat, ring):
    """Ray casting / crossing number against one linear ring. Edges are
    half-open in y so a vertex shared by two edges is not counted twice."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat):
            if lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                inside = not inside
        j = i
    return inside


def polygon_contains(lon, lat, rings):
    """GeoJSON polygon: ring 0 is the outer boundary, the rest are holes."""
    if not rings or not ring_contains(lon, lat, rings[0]):
        return False
    for hole in rings[1:]:
        if ring_contains(lon, lat, hole):
            return False
    return True


# ---------- shared helpers ----------

def read_json(path):
    if not os.path.exists(path):
        sys.exit("Missing %s\nRun: sh tools/fetch-districts.sh" % path)
    with open(path) as fh:
        return json.load(fh)


def index(geo):
    """Each feature's polygons plus a bounding box, so containment rejects most
    candidates on four comparisons. Same shape as indexPrecincts in app.js."""
    out = []
    for f in geo.get('features', []):
        g = f.get('geometry')
        if not g:
            continue
        if g['type'] == 'Polygon':
            polys = [g['coordinates']]
        elif g['type'] == 'MultiPolygon':
            polys = g['coordinates']
        else:
            continue
        xs, ys = [], []
        for p in polys:
            for c in (p[0] if p else []):
                xs.append(c[0])
                ys.append(c[1])
        if not xs:
            continue
        out.append({
            'minX': min(xs), 'maxX': max(xs),
            'minY': min(ys), 'maxY': max(ys),
            'polys': polys,
            'props': f.get('properties') or {},
        })
    return out


def contains(entry, lon, lat):
    if lon < entry['minX'] or lon > entry['maxX']:
        return False
    if lat < entry['minY'] or lat > entry['maxY']:
        return False
    return any(polygon_contains(lon, lat, rings) for rings in entry['polys'])


def interior_point(entry):
    """A point guaranteed to be inside the precinct, not merely near it. The
    average of the vertices falls outside any sufficiently concave shape, so it
    is tested first and only used if it holds; otherwise the bounding box is
    scanned on a grid. Testing against the precinct's own polygon is what makes
    the result trustworthy - a point outside its own precinct would silently be
    tested against the wrong district."""
    xs, ys = [], []
    for p in entry['polys']:
        for c in (p[0] if p else []):
            xs.append(c[0])
            ys.append(c[1])
    if xs:
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        if contains(entry, cx, cy):
            return (cx, cy)
    mx = (entry['minX'] + entry['maxX']) / 2.0
    my = (entry['minY'] + entry['maxY']) / 2.0
    if contains(entry, mx, my):
        return (mx, my)
    STEPS = 40
    for i in range(1, STEPS):
        for j in range(1, STEPS):
            x = entry['minX'] + (entry['maxX'] - entry['minX']) * i / STEPS
            y = entry['minY'] + (entry['maxY'] - entry['minY']) * j / STEPS
            if contains(entry, x, y):
                return (x, y)
    return None


def district_field(entries, label):
    """District layers name their number column differently, so find the field
    whose values are distinct across every feature and look like district
    numbers, rather than hard-coding a guess that breaks on the next layer."""
    best = None
    for name in entries[0]['props'].keys():
        low = name.lower()
        if low.startswith(('objectid', 'shape', 'globalid', 'created', 'last_edit')):
            continue
        seen, numeric = set(), 0
        for e in entries:
            v = e['props'].get(name)
            if v is None or v == '':
                continue
            seen.add(str(v))
            if str(v).strip().isdigit() and len(str(v).strip()) <= 3:
                numeric += 1
        score = (1000 if len(seen) == len(entries) else 0) + numeric
        score += 500 if 'dist' in low else 0
        if best is None or score > best[1]:
            best = (name, score, len(seen))
    print('  %s: using field "%s" (%d distinct values across %d features)'
          % (label, best[0], best[2], len(entries)))
    return best[0]


def norm(v):
    """"05" and "5" are the same district."""
    if v is None:
        return None
    s = str(v).strip()
    return str(int(s)) if s.isdigit() else s.upper()


# ---------- run ----------

LAYERS = [
    ('data/tx-congressional-districts.geojson', 'Congress', 'Congressional'),
    ('data/tx-senate-districts.geojson',        'Senate',   'State Senate'),
    ('data/tx-house-districts.geojson',         'House',    'State House'),
]

print('Loading Tarrant precincts...')
precincts = index(read_json('data/precincts.geojson'))
print('  %d precincts\n' % len(precincts))

print('Loading district layers and detecting their number fields:')
layers = []
for path, truth, label in LAYERS:
    entries = index(read_json(path))
    layers.append({'entries': entries, 'truth': truth, 'label': label,
                   'field': district_field(entries, label)})
print('')

print('Computing an interior point for each precinct...')
pts, no_point = [], []
for p in precincts:
    pt = interior_point(p)
    if pt:
        pts.append((p, pt))
    else:
        no_point.append(p['props'].get('Pct_Char') or p['props'].get('Precinct'))
msg = '  %d placed' % len(pts)
if no_point:
    msg += ', %d FAILED: %s' % (len(no_point), ', '.join(str(x) for x in no_point))
print(msg + '\n')

exit_code = 0

for L in layers:
    match, mismatch, nohit = 0, [], []
    for p, pt in pts:
        expected = norm(p['props'].get(L['truth']))
        got = None
        for d in L['entries']:
            if contains(d, pt[0], pt[1]):
                got = norm(d['props'].get(L['field']))
                break
        pid = p['props'].get('Pct_Char') or p['props'].get('Precinct')
        if got is None:
            nohit.append('%s (expected %s)' % (pid, expected))
        elif got == expected:
            match += 1
        else:
            mismatch.append((pid, expected, got))

    total = len(pts)
    print('=== %s ===' % L['label'])
    print('  match      %d / %d  (%.2f%%)' % (match, total, 100.0 * match / total))
    print('  mismatch   %d' % len(mismatch))
    print('  no district found  %d' % len(nohit))
    if mismatch:
        print('  first mismatches (precinct: county says -> join says):')
        for pid, exp, got in mismatch[:15]:
            print('    %s: %s -> %s' % (pid, exp, got))
        if len(mismatch) > 15:
            print('    ... and %d more' % (len(mismatch) - 15))
    if nohit:
        print('  precincts landing in no district: %s%s'
              % (', '.join(nohit[:10]),
                 ' ... and %d more' % (len(nohit) - 10) if len(nohit) > 10 else ''))
    print('')
    if mismatch or nohit:
        exit_code = 1

if exit_code == 0:
    print('PASS - the statewide join reproduces every district Tarrant publishes.\n'
          'The method generalises: counties only need to publish precinct geometry.')
else:
    print('NOT CLEAN - see mismatches above.\n'
          'A handful usually means precincts split by a district line, which is real\n'
          'and has to be handled. Large numbers mean the join is wrong - check the\n'
          'detected field names above and that both files are in WGS84 lon/lat.')
sys.exit(exit_code)
