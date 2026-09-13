#!/bin/sh
# Downloads the three statewide legislative district layers published by the
# Texas Legislative Council and the state GIO, as GeoJSON in WGS84 so the
# coordinates line up with the county precinct files already in data/.
#
#   https://feature.geographic.texas.gov/arcgis/rest/services/Legislative_Bnd/Legislative_Bnd/MapServer
#     layer 0  Texas Senate Districts
#     layer 1  Texas House of Rep Districts
#     layer 2  US Congressional Districts
#
# Run from the repo root, in a regular terminal (it needs network):
#   sh tools/fetch-districts.sh
#
# These are the authoritative source for congressional, state senate and state
# house boundaries statewide. Downloading them once means no county has to
# publish its own copy, and the ones that do can be ignored.

set -e
BASE="https://feature.geographic.texas.gov/arcgis/rest/services/Legislative_Bnd/Legislative_Bnd/MapServer"
Q="where=1%3D1&outFields=*&outSR=4326&returnGeometry=true&f=geojson"

mkdir -p data

fetch() {
  layer="$1"; out="data/$2"
  printf 'layer %s -> %s ... ' "$layer" "$out"
  curl -sS --max-time 180 "$BASE/$layer/query?$Q" -o "$out"
  # An ArcGIS error comes back as HTTP 200 with an {"error":...} body, so check
  # the content rather than the exit code.
  if head -c 200 "$out" | grep -q '"error"'; then
    echo "FAILED"; head -c 400 "$out"; echo; exit 1
  fi
  if ! head -c 200 "$out" | grep -q 'FeatureCollection'; then
    echo "FAILED - not GeoJSON (service may not support f=geojson)"
    head -c 400 "$out"; echo; exit 1
  fi
  n=$(python3 -c "import json,sys;print(len(json.load(open('$out'))['features']))")
  echo "ok, $n features, $(du -h "$out" | cut -f1)"
}

fetch 0 tx-senate-districts.geojson
fetch 1 tx-house-districts.geojson
fetch 2 tx-congressional-districts.geojson

echo
echo "Done. Now run:  python3 tools/validate-district-join.py"
