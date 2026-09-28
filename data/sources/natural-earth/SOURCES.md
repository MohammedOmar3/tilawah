# Natural Earth sources

| File | URL | Downloaded | SHA-256 | Licence |
|---|---|---|---|---|
| `ne_110m_admin_0_countries.geojson` | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson | 2026-09-27 | `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f` | Public domain (Natural Earth, https://www.naturalearthdata.com/about/terms-of-use/) |

Committed exactly as downloaded. `apps/web/globe/scripts/build-land-dots.mjs` derives
`apps/web/public/globe/land-dots.json` from it (an even ~1° grid of points on land).
