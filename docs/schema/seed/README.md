# GeoLite2 seed

Полные каталоги стран и ASN. Не схема: `011` и `014` создают таблицы,
здесь только данные. На пустой том файлы накатывает `019_ip_geo_seed.sh`,
если они лежат рядом.

| Файл | Таблицы |
| --- | --- |
| `ip_countries.sql` | `ip_countries`, `ip_country_addresses` |
| `ip_asns.sql` | `ip_asns`, `ip_asn_addresses` |

UUID пространства в дамп не пишется: заливка ищет `http_spaces` по имени.
Сырые `.mmdb` в репозиторий не кладём (лицензия MaxMind и размер).

```sh
cd controller
npm run load-geo -- --docker --dump
npm run dump-geo -- --docker
```

Без путей `load-geo` берёт `GeoLite2-Country.mmdb` и `GeoLite2-ASN.mmdb`
из `~/Downloads`, `GEO_MMDB_DIR` или `data/geo/`.
