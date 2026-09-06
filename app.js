/* Tarrant County Voter Guide — vanilla JS, no dependencies.
   Reads candidates.json, groups races by jurisdiction, and renders every
   endorsement and donation with a clickable source link. */

(function () {
  'use strict';

  var DATA_URL = 'candidates.json';

  var TYPE_LABELS = {
    'city': 'City',
    'school-district': 'School district'
  };

  var state = {
    candidates: [],
    type: 'all',
    jurisdiction: 'all',
    search: ''
  };

  var els = {
    results: document.getElementById('results'),
    count: document.getElementById('result-count'),
    type: document.getElementById('filter-type'),
    jurisdiction: document.getElementById('filter-jurisdiction'),
    search: document.getElementById('filter-search'),
    reset: document.getElementById('filter-reset'),
    lastUpdated: document.getElementById('last-updated')
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
      jurisdictionName(c),
      (c.endorsements || []).map(function (e) { return e.organization; }).join(' '),
      (c.donations || []).map(function (d) { return d.donor; }).join(' ')
    ].join(' ').toLowerCase();
    return haystack.indexOf(needle) !== -1;
  }

  function applyFilters() {
    var needle = state.search.trim().toLowerCase();
    return state.candidates.filter(function (c) {
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
    box.appendChild(el('h4', null, c.candidate || 'Unnamed candidate'));
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
    box.appendChild(head);
    race.candidates.forEach(function (c) { box.appendChild(renderCandidate(c)); });
    return box;
  }

  function renderJurisdiction(group) {
    var section = el('section', 'jurisdiction');
    var head = el('div', 'jurisdiction-head');
    head.appendChild(el('h2', null, group.name));
    head.appendChild(el('span',
      'badge' + (group.type === 'school-district' ? ' badge-school' : ''),
      TYPE_LABELS[group.type] || 'Other'));
    section.appendChild(head);
    group.races.forEach(function (race) { section.appendChild(renderRace(race)); });
    return section;
  }

  function render() {
    var filtered = applyFilters();
    var groups = groupByJurisdiction(filtered);

    var raceCount = groups.reduce(function (n, g) { return n + g.races.length; }, 0);
    els.count.textContent = filtered.length + ' candidate' + (filtered.length === 1 ? '' : 's') +
      ' · ' + raceCount + ' race' + (raceCount === 1 ? '' : 's') +
      ' · ' + groups.length + ' jurisdiction' + (groups.length === 1 ? '' : 's');

    if (!filtered.length) {
      setStatus('No candidates match the current filters.');
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

    els.reset.addEventListener('click', function () {
      state.type = 'all';
      state.jurisdiction = 'all';
      state.search = '';
      els.type.value = 'all';
      els.search.value = '';
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
