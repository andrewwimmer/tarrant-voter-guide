# Tarrant County Voter Guide

A static voter guide for Tarrant County, Texas. Races are grouped by jurisdiction
(federal, state, or county) and can be filtered; every endorsement and donation
shows a clickable link to its source.

Candidate data is extracted from `sources/ballot-certification-2026-11-03.pdf`,
the Texas Secretary of State's certified ballot report for the November 3, 2026
general election in Tarrant County, retrieved September 7, 2026.

> **⚠️ Endorsement and donation data is not populated yet.** Race names,
> candidate names, and party labels in `candidates.json` are real, but the
> `endorsements` and `donations` arrays are empty for every candidate.

## Stack

Plain HTML, CSS, and vanilla JavaScript. No framework, no build step, no
dependencies.

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, filter controls |
| `styles.css` | All styling |
| `app.js` | Loads the JSON, filters, groups, renders |
| `candidates.json` | The entire dataset |

## Running locally

`app.js` fetches `candidates.json`, and browsers block `fetch` over `file://`,
so serve the folder over HTTP:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Data format

`candidates.json` is a single object with `meta` and a `candidates` array. Each
candidate entry is one candidate in one race:

```json
{
  "id": "tc-2026-11-001",
  "race": "U. S. SENATOR",
  "jurisdiction": { "name": "United States", "type": "federal" },
  "electionDate": "2026-11-03",
  "candidate": "KEN PAXTON",
  "party": "REPUBLICAN",
  "unopposed": false,
  "source": "sources/ballot-certification-2026-11-03.pdf",
  "endorsements": [],
  "donations": []
}
```

Field notes:

- `jurisdiction.type` must be `"federal"`, `"state"`, or `"county"` — the type
  filter and the jurisdiction badge both key off it.
- `party` is the party name exactly as printed on the certification report:
  `REPUBLICAN`, `DEMOCRATIC`, `LIBERTARIAN`, or `GREEN`.
- `unopposed` is `true` when the race has only one certified candidate.
- `source` is the record the candidate entry was extracted from.
- Candidates are grouped into a race by `race` + `electionDate`, so those two
  values must match exactly across every candidate in the same contest.
- Dates are `YYYY-MM-DD` and are formatted for display; anything else is printed
  as-is.
- `sourceUrl` is required on every endorsement and donation. Only `http://` and
  `https://` URLs are rendered as links; anything else is shown as plain text
  noting the source URL is missing or invalid.
- `sourceLabel` is the link text. `note` and `amount` are optional.
- Empty `endorsements` / `donations` arrays render as "No endorsements recorded."

## Adding data

Edit `candidates.json` and reload. There is nothing to rebuild.

## Deployment

Served by GitHub Pages from the `main` branch, repo root.
