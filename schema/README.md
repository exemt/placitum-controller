# Database schema

English · [Русский](README.ru.md)

| File | What it is |
| --- | --- |
| `01-schema.sql` | structure: tables, indexes, constraints |
| `02-seed.sql` | shipped data: the `default` space, reference tables, deny pages, CRS, the inspector catalog, the node port, `default` profiles |

The controller applies `01-schema.sql` and `02-seed.sql` itself, in one transaction, on first
start against an empty database (`src/migrate.ts`). If the database already has a schema, it is
left alone. There are no schema upgrades on a live database: when the schema changes, the
installation is done again.

To change the schema, edit `01-schema.sql`; to change the shipped data, edit `02-seed.sql`. Data
rows find the space by its name, `default`, not by uuid.

Servers, routes, upstreams, certificates, address lists and inspector declarations are not
shipped. A fresh installation listens on nothing; the operator creates the configuration.
