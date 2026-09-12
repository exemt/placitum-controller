# crs-src

Файлы из `modsec-rules.zip` (CRS 4.25) и словари `@pmFromFile`:

- `ssrf.data` / `ssrf-no-scheme.data` — облачные metadata URL и localhost
  для правил 934110 / 934190
- `java-classes.data` — имена классов для 944130 (Struts / log4j)

Compile кладёт `*.data` в pack, инспектор пишет их рядом с `.conf` и
переписывает `@pmFromFile ssrf.data` в абсолютный путь. Без этого Coraza
открывает файл от cwd (`/app/ssrf.data`) и падает.
