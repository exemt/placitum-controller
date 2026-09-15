#!/bin/sh
# Полный GeoLite2, если есть дампы schema/seed/*.sql.
# Без файлов каталог гео пуст: выгрузку заливают из панели.
# UUID пространства в дампах нет: join по http_spaces.name.

set -eu

seed=/docker-entrypoint-initdb.d/seed

apply() {
    f=$1
    if [ -f "$f" ]; then
        echo "geo seed: $f"
        psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
    fi
}

apply "$seed/ip_countries.sql"
apply "$seed/ip_asns.sql"
