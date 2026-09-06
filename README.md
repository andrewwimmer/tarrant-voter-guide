# Tarrant County Voter Guide

A static voter guide for Tarrant County, Texas. Races are grouped by jurisdiction
(city or school district) and can be filtered; every endorsement and donation
shows a clickable link to its source.

> **⚠️ The data in this repo is fake.** `candidates.json` ships with obvious
> placeholder entries — names like `PLACEHOLDER Candidate A`, jurisdictions like
> `PLACEHOLDER Westfield ISD`, and source links pointing at `example.com`.
> Replace the whole file before treating this as a real guide.

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
  "id": "plc-001",
  "race": "PLACEHOLDER City Council, Place 1",
  "jurisdiction": { "name": "PLACEHOLDER City of Northaven", "type": "city" },
  "electionDate": "2026-05-02",
  "candidate": "PLACEHOLDER Candidate A",
  "endorsements": [
    {
      "organization": "PLACEHOLDER Firefighters Association",
      "date": "2026-02-10",
      "note": "PLACEHOLDER sole endorsement in this race.",
      "sourceUrl": "https://example.com/placeholder/endorsement/...",
      "sourceLabel": "PLACEHOLDER press release"
    }
  ],
  "donations": [
    {
      "donor": "PLACEHOLDER Donor One LLC",
      "amount": 5000,
      "date": "2026-01-15",
      "note": "PLACEHOLDER in-kind contribution.",
      "sourceUrl": "https://example.com/placeholder/finance/report-001",
      "sourceLabel": "PLACEHOLDER campaign finance report"
    }
  ]
}
```

Field notes:

- `jurisdiction.type` must be `"city"` or `"school-district"` — the type filter
  and the jurisdiction badge both key off it.
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
