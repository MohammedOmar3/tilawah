# Tanzil sources

Downloaded by `pnpm --filter quran-data fetch-sources` and committed as-is. Never edit these files by hand.

| File | URL | Downloaded | sha256 |
|---|---|---|---|
| `quran-uthmani.txt` | https://tanzil.net/pub/download/index.php?marks=true&sajdah=true&rub=false&tatweel=true&quranType=uthmani&outType=txt-2&agree=true | 2026-09-27 | `7f30c647331a61100ebf24a80507dc0fcdd9f2df97f1312b5b2dfcb982a7f326` |
| `quran-data.xml` | https://tanzil.net/res/text/metadata/quran-data.xml | 2026-09-27 | `8867c1d88191472adec9db694b3cd9f135b1a2ef580574d32cf888dcb22c5c7a` |

## Licence

`quran-uthmani.txt` is Tanzil Quran Text (Uthmani, Version 1.1), licensed under Creative Commons Attribution 3.0. The text must be reproduced verbatim (changing it is not allowed), the source (Tanzil Project) must be clearly indicated with a link to https://tanzil.net, and the copyright notice must be included with verbatim copies and derived files. The full block, copied from the file:

```
# PLEASE DO NOT REMOVE OR CHANGE THIS COPYRIGHT BLOCK
#====================================================================
#
#  Tanzil Quran Text (Uthmani, Version 1.1)
#  Copyright (C) 2007-2026 Tanzil Project
#  License: Creative Commons Attribution 3.0
#
#  This copy of the Quran text is carefully produced, highly 
#  verified and continuously monitored by a group of specialists 
#  at Tanzil Project.
#
#  TERMS OF USE:
#
#  - Permission is granted to copy and distribute verbatim copies 
#    of this text, but CHANGING IT IS NOT ALLOWED.
#
#  - This Quran text can be used in any website or application, 
#    provided that its source (Tanzil Project) is clearly indicated, 
#    and a link is made to tanzil.net to enable users to keep
#    track of changes.
#
#  - This copyright notice shall be included in all verbatim copies 
#    of the text, and shall be reproduced appropriately in all files 
#    derived from or containing substantial portion of this text.
#
#  Please check updates at: http://tanzil.net/updates/
#
#====================================================================
```

`quran-data.xml` is Tanzil Quran metadata, `copyright="(C) 2008-2009 Tanzil.info" license="cc-by"` (Creative Commons Attribution).

## Notes on the text

- Ayah 1 of every surah except 1 and 9 begins with the basmala (Al-Fatihah's ayah 1 *is* the basmala; At-Tawbah has none). In surahs 95 and 97 it is spelled `بِّسْمِ` (shadda on the ba). It is kept verbatim.
- Tatweel (U+0640) appears in 3,698 ayahs (for example `ٱلرَّحْمَـٰنِ`), because the download sets `tatweel=true`.
- Sajdah marks (۩, U+06E9) appear in 15 ayahs; rub al-hizb marks (۞, U+06DE) appear in 199 despite `rub=false`.
- The file is UTF-8 without BOM, LF line endings, no `|` inside the text.

## Fetching in this environment

Node's `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is set. Behind a proxy, run `NODE_USE_ENV_PROXY=1 pnpm --filter quran-data fetch-sources`.
