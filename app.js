/* Tarrant County Voter Guide — vanilla JS, no dependencies.
   Reads candidates.json, groups races by jurisdiction, and renders every
   endorsement and donation with a clickable source link. */

(function () {
  'use strict';

  var DATA_URL = 'candidates.json';

  var TYPE_LABELS = {
    'federal': 'Federal',
    'state': 'State',
    'county': 'County & precinct'
  };

  var state = {
    candidates: [],
    type: 'all',
    jurisdiction: 'all',
    search: '',
    // Set once an address resolves to a precinct; ballotActive is the
    // "show only my races" / "show all races" switch over the same result.
    ballot: null,
    ballotActive: false
  };

  var els = {
    results: document.getElementById('results'),
    count: document.getElementById('result-count'),
    type: document.getElementById('filter-type'),
    jurisdiction: document.getElementById('filter-jurisdiction'),
    search: document.getElementById('filter-search'),
    reset: document.getElementById('filter-reset'),
    lastUpdated: document.getElementById('last-updated'),
    lookupForm: document.getElementById('lookup-form'),
    lookupAddress: document.getElementById('lookup-address'),
    lookupSubmit: document.getElementById('lookup-submit'),
    lookupStatus: document.getElementById('lookup-status'),
    lookupResult: document.getElementById('lookup-result')
  };

  /* ---------- helpers ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setStatus(message, isError) {
    els.results.innerHTML = '';
    els.results.appendChild(el('div', 'status' + (isError ? ' status-error' : ''), message));
  }

  // Only http(s) links become anchors — anything else is shown as plain text
  // so a bad data entry can't turn into a javascript: link.
  function safeUrl(url) {
    if (typeof url !== 'string') return null;
    var trimmed = url.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  }

  function formatDate(value) {
    if (typeof value !== 'string') return '';
    var m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return value; // pass through placeholder / non-ISO values as-is
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function formatAmount(value) {
    if (typeof value !== 'number' || !isFinite(value)) {
      return value === undefined || value === null ? '' : String(value);
    }
    return '$' + value.toLocaleString('en-US');
  }

  function jurisdictionName(c) {
    return (c.jurisdiction && c.jurisdiction.name) || 'Unspecified jurisdiction';
  }

  function jurisdictionType(c) {
    return (c.jurisdiction && c.jurisdiction.type) || 'other';
  }

  /* ---------- filtering ---------- */

  function matchesSearch(c, needle) {
    if (!needle) return true;
    var haystack = [
      c.candidate,
      c.race,
      c.party,
      jurisdictionName(c),
      (c.endorsements || []).map(function (e) { return e.organization; }).join(' '),
      (c.donations || []).map(function (d) { return d.donor; }).join(' ')
    ].join(' ').toLowerCase();
    return haystack.indexOf(needle) !== -1;
  }

  // True when this race is on the looked-up voter's ballot: countywide and
  // statewide races always are, district races only when the number matches.
  function matchesBallot(c) {
    if (!state.ballotActive || !state.ballot) return true;
    var rule = raceRule(c.race);
    if (!rule.field) return true;
    return rule.value !== null && rule.value === state.ballot.districts[rule.field];
  }

  function applyFilters() {
    var needle = state.search.trim().toLowerCase();
    return state.candidates.filter(function (c) {
      if (!matchesBallot(c)) return false;
      if (state.type !== 'all' && jurisdictionType(c) !== state.type) return false;
      if (state.jurisdiction !== 'all' && jurisdictionName(c) !== state.jurisdiction) return false;
      return matchesSearch(c, needle);
    });
  }

  /* ---------- grouping ---------- */

  // -> [{ name, type, races: [{ race, electionDate, candidates: [...] }] }]
  function groupByJurisdiction(list) {
    var order = [];
    var byName = {};

    list.forEach(function (c) {
      var name = jurisdictionName(c);
      if (!byName[name]) {
        byName[name] = { name: name, type: jurisdictionType(c), raceOrder: [], races: {} };
        order.push(name);
      }
      var group = byName[name];
      var raceKey = (c.race || 'Unspecified race') + '||' + (c.electionDate || '');
      if (!group.races[raceKey]) {
        group.races[raceKey] = {
          race: c.race || 'Unspecified race',
          electionDate: c.electionDate || '',
          candidates: []
        };
        group.raceOrder.push(raceKey);
      }
      group.races[raceKey].candidates.push(c);
    });

    return order
      .sort(function (a, b) { return a.localeCompare(b); })
      .map(function (name) {
        var group = byName[name];
        var races = group.raceOrder.map(function (key) { return group.races[key]; });
        races.sort(function (a, b) {
          if (a.electionDate !== b.electionDate) {
            return a.electionDate < b.electionDate ? -1 : 1;
          }
          return a.race.localeCompare(b.race);
        });
        races.forEach(function (r) {
          r.candidates.sort(function (a, b) {
            return String(a.candidate).localeCompare(String(b.candidate));
          });
        });
        return { name: group.name, type: group.type, races: races };
      });
  }

  /* ---------- rendering ---------- */

  function renderSourceLink(item) {
    var url = safeUrl(item.sourceUrl);
    var label = item.sourceLabel || 'Source';
    if (!url) {
      return el('span', 'item-meta', label + ': no valid source URL in data');
    }
    var a = el('a', 'source-link', label + ' ↗');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = url;
    return a;
  }

  function renderItemList(items, kind) {
    var ul = el('ul', 'item-list');

    items.forEach(function (item) {
      var li = el('li');

      var name = el('span', 'item-name',
        kind === 'donation' ? (item.donor || 'Unnamed donor')
                            : (item.organization || 'Unnamed organization'));
      li.appendChild(name);

      if (kind === 'donation' && item.amount !== undefined && item.amount !== null) {
        li.appendChild(document.createTextNode(' — '));
        li.appendChild(el('span', 'amount', formatAmount(item.amount)));
      }

      if (item.date) {
        li.appendChild(document.createTextNode(' '));
        li.appendChild(el('span', 'item-meta', '(' + formatDate(item.date) + ')'));
      }

      if (item.note) {
        li.appendChild(el('span', 'item-note', item.note));
      }

      li.appendChild(renderSourceLink(item));
      ul.appendChild(li);
    });

    return ul;
  }

  function renderDetail(title, items, kind, emptyText) {
    var wrap = el('div', 'detail');
    wrap.appendChild(el('p', 'detail-label', title));
    if (items && items.length) {
      wrap.appendChild(renderItemList(items, kind));
    } else {
      wrap.appendChild(el('p', 'empty-note', emptyText));
    }
    return wrap;
  }

  function renderCandidate(c) {
    var box = el('div', 'candidate');
    var name = el('h4', null, c.candidate || 'Unnamed candidate');
    if (c.party) name.appendChild(el('span', 'party', c.party));
    box.appendChild(name);
    box.appendChild(renderDetail('Endorsements', c.endorsements, 'endorsement',
      'No endorsements recorded.'));
    box.appendChild(renderDetail('Donations', c.donations, 'donation',
      'No donations recorded.'));
    return box;
  }

  function renderRace(race) {
    var box = el('article', 'race');
    var head = el('div', 'race-head');
    head.appendChild(el('h3', null, race.race));
    if (race.electionDate) {
      head.appendChild(el('span', 'election-date', 'Election: ' + formatDate(race.electionDate)));
    }
    if (race.candidates.length === 1 && race.candidates[0].unopposed) {
      head.appendChild(el('span', 'election-date', 'Unopposed'));
    }
    box.appendChild(head);
    race.candidates.forEach(function (c) { box.appendChild(renderCandidate(c)); });
    return box;
  }

  function renderJurisdiction(group) {
    var section = el('section', 'jurisdiction');
    var head = el('div', 'jurisdiction-head');
    head.appendChild(el('h2', null, group.name));
    head.appendChild(el('span',
      'badge' + (group.type === 'county' ? ' badge-school' : ''),
      TYPE_LABELS[group.type] || 'Other'));
    section.appendChild(head);
    group.races.forEach(function (race) { section.appendChild(renderRace(race)); });
    return section;
  }

  function render() {
    var filtered = applyFilters();
    var groups = groupByJurisdiction(filtered);

    var raceCount = groups.reduce(function (n, g) { return n + g.races.length; }, 0);
    els.count.textContent = (state.ballotActive && state.ballot
        ? 'Your ballot — precinct ' + state.ballot.precinct + ' · '
        : '') +
      filtered.length + ' candidate' + (filtered.length === 1 ? '' : 's') +
      ' · ' + raceCount + ' race' + (raceCount === 1 ? '' : 's') +
      ' · ' + groups.length + ' jurisdiction' + (groups.length === 1 ? '' : 's');

    if (!filtered.length) {
      setStatus(state.ballotActive
        ? 'No races on your ballot match the current filters.'
        : 'No candidates match the current filters.');
      return;
    }

    var frag = document.createDocumentFragment();
    groups.forEach(function (g) { frag.appendChild(renderJurisdiction(g)); });
    els.results.innerHTML = '';
    els.results.appendChild(frag);
  }

  /* ---------- jurisdiction dropdown ---------- */

  // Lists only jurisdictions valid for the selected type, keeping the current
  // selection if it survives the type change.
  function populateJurisdictions() {
    var names = [];
    state.candidates.forEach(function (c) {
      if (!matchesBallot(c)) return;
      if (state.type !== 'all' && jurisdictionType(c) !== state.type) return;
      var name = jurisdictionName(c);
      if (names.indexOf(name) === -1) names.push(name);
    });
    names.sort(function (a, b) { return a.localeCompare(b); });

    if (state.jurisdiction !== 'all' && names.indexOf(state.jurisdiction) === -1) {
      state.jurisdiction = 'all';
    }

    els.jurisdiction.innerHTML = '';
    var allOpt = el('option', null, 'All jurisdictions');
    allOpt.value = 'all';
    els.jurisdiction.appendChild(allOpt);
    names.forEach(function (name) {
      var opt = el('option', null, name);
      opt.value = name;
      els.jurisdiction.appendChild(opt);
    });
    els.jurisdiction.value = state.jurisdiction;
  }


  /* ============================================================
     Address lookup → precinct → personal ballot

     Three steps, all driven from the form at the top of the page:
       1. The typed address goes to the U.S. Census Bureau geocoder,
          which returns a lat/lon. That is the only network call that
          ever sees the address.
       2. data/precincts.geojson (4.7 MB) is fetched lazily and tested
          point-in-polygon, on this device, to find the precinct.
       3. The precinct's district numbers filter candidates.json down
          to the races this voter is actually eligible to vote in.
     ============================================================ */

  var GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
  var PRECINCTS_URL = 'data/precincts.geojson';
  var GEOCODE_TIMEOUT_MS = 15000;

  // Each district race in candidates.json is tied to exactly one property on
  // the precinct feature. Anything that matches none of these is a countywide
  // or statewide race that every Tarrant County voter votes in.
  var DISTRICT_FIELDS = [
    { key: 'Congress',  label: 'U.S. House',                  describe: function (v) { return 'Congressional District ' + v; } },
    { key: 'Senate',    label: 'Texas Senate',                describe: function (v) { return 'State Senate District ' + v; } },
    { key: 'House',     label: 'Texas House',                 describe: function (v) { return 'State House District ' + v; } },
    { key: 'Education', label: 'State Board of Education',    describe: function (v) { return 'SBOE District ' + v; } },
    { key: 'Commish',   label: 'County Commissioner',         describe: function (v) { return 'Commissioner Precinct ' + v; } },
    { key: 'JP',        label: 'Justice of the Peace',        describe: function (v) { return 'JP Precinct ' + v; } }
  ];

  // Race title -> which precinct property gates it. Order matters only in that
  // each pattern is specific enough not to catch another race's title; the
  // "DISTRICT JUDGE, 141ST JUDICIAL DISTRICT" and "JUSTICE, 2ND COURT OF
  // APPEALS DISTRICT" families deliberately fall through to universal.
  var RACE_PATTERNS = [
    { field: 'Congress',  re: /^U\.\s*S\.\s*REPRESENTATIVE DISTRICT (\d+)$/ },
    { field: 'Senate',    re: /^STATE SENATOR,\s*DISTRICT (\d+)$/ },
    { field: 'House',     re: /^STATE REPRESENTATIVE DISTRICT (\d+)$/ },
    { field: 'Education', re: /^MEMBER,\s*STATE BOARD OF EDUCATION,\s*DISTRICT (\d+)$/ },
    { field: 'Commish',   re: /^COUNTY COMMISSIONER PRECINCT (\d+)$/ },
    { field: 'JP',        re: /^JUSTICE OF THE PEACE PRECINCT (\d+)$/ }
  ];

  var raceRuleCache = Object.create(null);

  // -> { field: 'Congress', value: '12' } for district races,
  //    { field: null } for countywide / statewide races.
  function raceRule(raceName) {
    var name = String(raceName === undefined || raceName === null ? '' : raceName)
      .replace(/\s+/g, ' ').trim().toUpperCase();
    if (raceRuleCache[name]) return raceRuleCache[name];

    var rule = { field: null, value: null };
    for (var i = 0; i < RACE_PATTERNS.length; i++) {
      var m = name.match(RACE_PATTERNS[i].re);
      if (m) {
        rule = { field: RACE_PATTERNS[i].field, value: normalizeDistrict(m[1]) };
        break;
      }
    }
    raceRuleCache[name] = rule;
    return rule;
  }

  // "09" and "9" are the same district; compare on a canonical form.
  function normalizeDistrict(value) {
    if (value === undefined || value === null) return null;
    var n = String(value).trim();
    if (!/^\d+$/.test(n)) return null;
    return String(parseInt(n, 10));
  }

  // Districts that have a race on this ballot at all. Texas staggers its
  // senate, SBOE, and commissioner terms, so a voter can legitimately live in
  // a district with nothing to vote on this cycle — that is worth saying out
  // loud rather than silently showing them one fewer race.
  function districtsOnBallot(field) {
    var found = Object.create(null);
    state.candidates.forEach(function (c) {
      var rule = raceRule(c.race);
      if (rule.field === field && rule.value) found[rule.value] = true;
    });
    return found;
  }

  /* ---------- point in polygon ---------- */

  // Ray casting / crossing number against one linear ring. Counts how often a
  // ray heading in -x from the point crosses an edge; odd means inside. Edges
  // are treated as half-open in y ((yi > y) !== (yj > y)) so a vertex shared by
  // two edges is not counted twice.
  function ringContains(lon, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1];
      var xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat)) {
        if (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }

  // GeoJSON polygon: ring 0 is the outer boundary, any further rings are holes.
  function polygonContains(lon, lat, rings) {
    if (!rings.length || !ringContains(lon, lat, rings[0])) return false;
    for (var i = 1; i < rings.length; i++) {
      if (ringContains(lon, lat, rings[i])) return false;
    }
    return true;
  }

  /* ---------- lazy precinct index ---------- */

  var precinctsPromise = null;

  // Precompute each feature's bounding box once so a lookup rejects ~706 of
  // the 707 precincts with four numeric comparisons instead of walking their
  // rings. Only outer rings contribute to the box; a hole is inside its own.
  function indexPrecincts(geo) {
    var features = (geo && geo.features) || [];
    var index = [];

    for (var i = 0; i < features.length; i++) {
      var geom = features[i].geometry;
      if (!geom) continue;

      var polys;
      if (geom.type === 'Polygon') polys = [geom.coordinates];
      else if (geom.type === 'MultiPolygon') polys = geom.coordinates;
      else continue;

      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var p = 0; p < polys.length; p++) {
        var outer = polys[p][0] || [];
        for (var k = 0; k < outer.length; k++) {
          var x = outer[k][0], y = outer[k][1];
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (minX === Infinity) continue;

      index.push({
        minX: minX, minY: minY, maxX: maxX, maxY: maxY,
        polys: polys,
        props: features[i].properties || {}
      });
    }

    if (!index.length) throw new Error('precinct file contained no usable polygons');
    return index;
  }

  // Fetched on first use only — the file is 4.7 MB and most visitors never
  // touch the lookup. A failure clears the cached promise so a retry re-fetches
  // instead of replaying the same rejection forever.
  function loadPrecincts() {
    if (!precinctsPromise) {
      precinctsPromise = fetch(PRECINCTS_URL, { cache: 'force-cache' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(indexPrecincts)
        .catch(function (err) {
          precinctsPromise = null;
          throw err;
        });
    }
    return precinctsPromise;
  }

  function findPrecinct(index, lon, lat) {
    for (var i = 0; i < index.length; i++) {
      var f = index[i];
      if (lon < f.minX || lon > f.maxX || lat < f.minY || lat > f.maxY) continue;
      for (var p = 0; p < f.polys.length; p++) {
        if (polygonContains(lon, lat, f.polys[p])) return f.props;
      }
    }
    return null;
  }

  /* ---------- geocoding ---------- */

  var jsonpSeq = 0;

  // The Census geocoder does not send an Access-Control-Allow-Origin header,
  // so a normal fetch() is blocked by CORS from a static site with no backend.
  // Its documented JSONP mode is the supported way in. The response is executed
  // as script, so: https only, a single-use callback name, a hard timeout, the
  // tag torn down either way, and the payload shape checked before it is read.
  function geocode(address, onSuccess, onError) {
    var callbackName = '__tcvgGeocode' + (++jsonpSeq) + '_' + Date.now().toString(36);
    var script = document.createElement('script');
    var settled = false;
    var timer;

    function cleanup() {
      clearTimeout(timer);
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    function settle(fn, arg) {
      if (settled) return;
      settled = true;
      cleanup();
      fn(arg);
    }

    window[callbackName] = function (payload) { settle(onSuccess, payload); };
    script.onerror = function () { settle(onError, new Error('unreachable')); };
    timer = setTimeout(function () { settle(onError, new Error('timeout')); }, GEOCODE_TIMEOUT_MS);

    script.src = GEOCODER_URL +
      '?address=' + encodeURIComponent(address) +
      '&benchmark=Public_AR_Current' +
      '&format=jsonp' +
      '&callback=' + callbackName;
    document.head.appendChild(script);
  }

  // Pulls the first match out of the geocoder payload without trusting any of
  // its shape. Returns null when the response is well-formed but empty.
  function firstMatch(payload) {
    var matches = payload && payload.result && payload.result.addressMatches;
    if (!Array.isArray(matches) || !matches.length) return null;

    var m = matches[0];
    var coords = m && m.coordinates;
    if (!coords) return null;

    var lon = Number(coords.x);
    var lat = Number(coords.y);
    if (!isFinite(lon) || !isFinite(lat)) return null;

    return {
      lon: lon,
      lat: lat,
      matchedAddress: typeof m.matchedAddress === 'string' ? m.matchedAddress : ''
    };
  }

  /* ---------- lookup UI ---------- */

  function setLookupStatus(message, kind) {
    if (!message) {
      els.lookupStatus.hidden = true;
      els.lookupStatus.textContent = '';
      return;
    }
    els.lookupStatus.hidden = false;
    els.lookupStatus.className = 'lookup-status' + (kind ? ' lookup-status-' + kind : '');
    els.lookupStatus.textContent = message;
  }

  function setBusy(busy) {
    els.lookupSubmit.disabled = busy;
    els.lookupSubmit.textContent = busy ? 'Looking up…' : 'Find my races';
  }

  // The "why these races" panel: the precinct that matched, every district it
  // puts the voter in, and — for districts with nothing on this ballot — the
  // reason a race is missing.
  function renderBallotPanel() {
    var ballot = state.ballot;
    els.lookupResult.innerHTML = '';

    if (!ballot) {
      els.lookupResult.hidden = true;
      return;
    }
    els.lookupResult.hidden = false;

    var head = el('div', 'ballot-head');
    head.appendChild(el('p', 'ballot-precinct-label', 'Voting precinct'));
    head.appendChild(el('p', 'ballot-precinct', ballot.precinct));
    if (ballot.matchedAddress) {
      head.appendChild(el('p', 'ballot-address', 'Matched to ' + ballot.matchedAddress));
    }
    els.lookupResult.appendChild(head);

    els.lookupResult.appendChild(el('p', 'ballot-why',
      'You vote in every countywide and statewide race, plus the district races below.'));

    var list = el('ul', 'district-list');
    DISTRICT_FIELDS.forEach(function (field) {
      var value = ballot.districts[field.key];
      var li = el('li');
      li.appendChild(el('span', 'district-label', field.label));

      if (!value) {
        li.appendChild(el('span', 'district-value district-unknown', 'not recorded for this precinct'));
      } else {
        li.appendChild(el('span', 'district-value', field.describe(value)));
        if (!ballot.onBallot[field.key][value]) {
          li.appendChild(el('span', 'district-note', 'not on the 2026 ballot — this seat is not up for election this cycle'));
        }
      }
      list.appendChild(li);
    });
    els.lookupResult.appendChild(list);

    var actions = el('div', 'ballot-actions');
    var toggle = el('button', 'ballot-toggle',
      state.ballotActive ? 'Show all races' : 'Show only my races');
    toggle.type = 'button';
    toggle.addEventListener('click', function () {
      state.ballotActive = !state.ballotActive;
      renderBallotPanel();
      populateJurisdictions();
      render();
    });
    actions.appendChild(toggle);

    var clear = el('button', 'ballot-clear', 'Clear address');
    clear.type = 'button';
    clear.addEventListener('click', function () {
      state.ballot = null;
      state.ballotActive = false;
      els.lookupAddress.value = '';
      setLookupStatus('');
      renderBallotPanel();
      populateJurisdictions();
      render();
      els.lookupAddress.focus();
    });
    actions.appendChild(clear);

    els.lookupResult.appendChild(actions);
  }

  function applyPrecinct(props, matchedAddress) {
    var districts = {};
    var onBallot = {};
    DISTRICT_FIELDS.forEach(function (field) {
      districts[field.key] = normalizeDistrict(props[field.key]);
      onBallot[field.key] = districtsOnBallot(field.key);
    });

    state.ballot = {
      precinct: String(props.Precinct || props.Pct_Char || 'unknown'),
      matchedAddress: matchedAddress,
      districts: districts,
      onBallot: onBallot
    };
    state.ballotActive = true;

    setLookupStatus('');
    renderBallotPanel();
    populateJurisdictions();
    render();
    els.lookupResult.scrollIntoView({ block: 'nearest' });
  }

  function runLookup(address) {
    setBusy(true);
    setLookupStatus('Sending your address to the Census geocoder…');

    // Kick the precinct download off in parallel with the geocode — the two do
    // not depend on each other and the file is the slower of the two.
    var precincts = loadPrecincts();
    // Claim the rejection now: if the geocode fails below, nothing else ever
    // consumes this promise, and an unhandled rejection would hit the console.
    precincts.catch(function () {});

    geocode(address, function (payload) {
      var match;
      try {
        match = firstMatch(payload);
      } catch (e) {
        match = null;
      }

      if (!match) {
        setBusy(false);
        setLookupStatus(
          'The Census geocoder could not find that address. Check the spelling, and try ' +
          'including the city and ZIP — for example "100 Main St, Fort Worth, TX 76102".',
          'warn');
        return;
      }

      setLookupStatus('Address found. Loading the precinct map (4.7 MB) …');

      precincts.then(function (index) {
        setBusy(false);
        var props = findPrecinct(index, match.lon, match.lat);
        if (!props) {
          setLookupStatus(
            (match.matchedAddress || 'That address') + ' is outside Tarrant County, so none of ' +
            'these races are on its ballot. This guide only covers Tarrant County.',
            'warn');
          return;
        }
        applyPrecinct(props, match.matchedAddress);
      }, function (err) {
        setBusy(false);
        setLookupStatus(
          'Your address was found, but the precinct map could not be loaded (' + err.message +
          '). Check your connection and try again, or browse all races below.',
          'error');
      });

    }, function (err) {
      setBusy(false);
      setLookupStatus(
        err.message === 'timeout'
          ? 'The Census geocoder did not respond within 15 seconds. It may be down or blocked ' +
            'by your network — try again in a moment, or browse all races below.'
          : 'Could not reach the Census geocoder. It may be down or blocked by your network — ' +
            'try again in a moment, or browse all races below.',
        'error');
    });
  }

  function wireLookup() {
    // Warm the 4.7 MB precinct file the moment someone engages the field, so
    // it is usually cached by the time the geocode returns. Still never on page
    // load — a visitor who ignores the lookup never downloads it.
    var warmed = false;
    els.lookupAddress.addEventListener('focus', function () {
      if (warmed) return;
      warmed = true;
      loadPrecincts().catch(function () { /* surfaced on submit instead */ });
    });

    els.lookupForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var address = els.lookupAddress.value.trim();
      if (!address) {
        setLookupStatus('Type a street address first.', 'warn');
        els.lookupAddress.focus();
        return;
      }
      runLookup(address);
    });
  }

  /* ---------- events ---------- */

  function wireEvents() {
    els.type.addEventListener('change', function () {
      state.type = els.type.value;
      populateJurisdictions();
      render();
    });

    els.jurisdiction.addEventListener('change', function () {
      state.jurisdiction = els.jurisdiction.value;
      render();
    });

    els.search.addEventListener('input', function () {
      state.search = els.search.value;
      render();
    });

    // Resets the dropdowns and returns to the full race list, but keeps any
    // matched precinct on screen so it can be re-applied with one click.
    els.reset.addEventListener('click', function () {
      state.type = 'all';
      state.jurisdiction = 'all';
      state.search = '';
      state.ballotActive = false;
      els.type.value = 'all';
      els.search.value = '';
      renderBallotPanel();
      populateJurisdictions();
      render();
    });
  }

  /* ---------- boot ---------- */

  function start(data) {
    var list = (data && Array.isArray(data.candidates)) ? data.candidates
             : (Array.isArray(data) ? data : []);

    if (!list.length) {
      setStatus('candidates.json loaded but contains no candidate entries.', true);
      return;
    }

    state.candidates = list;

    if (data && data.meta && data.meta.lastUpdated) {
      els.lastUpdated.textContent = 'Data last updated: ' + data.meta.lastUpdated;
    }

    populateJurisdictions();
    wireEvents();
    wireLookup();
    render();
  }

  setStatus('Loading candidates…');

  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + DATA_URL);
      return res.json();
    })
    .then(start)
    .catch(function (err) {
      var hint = location.protocol === 'file:'
        ? ' Opening this page directly from disk blocks the fetch. Serve the folder over HTTP instead, e.g. "python3 -m http.server".'
        : '';
      setStatus('Could not load candidates.json: ' + err.message + '.' + hint, true);
    });
})();
