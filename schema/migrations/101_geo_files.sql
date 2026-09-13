-- Выгрузки MaxMind, загруженные из панели: файл целиком на вид (страны, ASN).
-- Каталог пространства (ip_countries, ip_asns) -- разобранные строки той же
-- выгрузки; сам файл забирает кодер гео: GET /api/geo/files/<вид> по документу
-- policy/geo в KV. Один на контур, как и кодер: последняя загрузка вида.

create table if not exists geo_files (
    kind           text primary key check (kind in ('country', 'asn')),
    sha256         text not null,
    size           bigint not null,
    database_type  text not null,
    build_epoch    bigint not null default 0,
    data           bytea not null,
    uploaded_at    timestamptz not null default now()
);
