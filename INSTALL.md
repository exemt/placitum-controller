# Installation

English · [Русский](INSTALL.ru.md)

The controller is installed together with the rest of Placitum: it delivers configuration to the
nodes and inspectors and is of no use without them. Usually the installer in
[placitum-core](https://github.com/exemt/placitum-core) brings it up. This document covers what
the controller needs, how it is configured and how to check that it is running.

## Required services

| Service | Required | Why |
| --- | --- | --- |
| PostgreSQL | yes | configuration: spaces, servers, routes, profiles, drafts |
| NATS with JetStream | yes | KV through which configuration generations reach nodes and inspectors |
| Internal Redis | yes | generation blobs: KV carries a pointer, the body lives here |
| `crypto` | for certificates uploaded in the panel | decrypts private keys with the contour key; the controller never sees them in plain text |
| `search` (logger) | for the log and incidents | the panel reaches it through the controller; it is not exposed |
| `geo` | for address cards | country and ASN by address |

The controller can be down without affecting traffic: nodes keep working on the last applied
configuration.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `CONTROLLER_PORT` | `8080` | API and panel port |
| `CONTROLLER_HOST` | — | address to listen on; unset means all addresses, which suits a container. Without Docker set `127.0.0.1` |
| `CONTROLLER_CORS_ORIGIN` | — | origins, comma-separated, allowed to call the API from a browser; unset means none. The panel and its dev server do not need it |
| `CONTROLLER_DATABASE_URL` | `postgres://waf:waf@127.0.0.1:5432/waf` | PostgreSQL |
| `CONTROLLER_NATS_URL` | `nats://127.0.0.1:4222` | NATS |
| `CONTROLLER_NATS_USER`, `_PASS`, `_TOKEN` | — | NATS credentials written into the node configuration |
| `CONTROLLER_REDIS_URL` | — | body store Redis: the controller does not write to it, it only writes its address into the node configuration |
| `CONTROLLER_REDIS_INTERNAL_URL` | same as `CONTROLLER_REDIS_URL` | internal Redis: generation blobs |
| `CONTROLLER_NODE_NATS_URL`, `_REDIS_URL`, `_REDIS_INTERNAL_URL` | the controller's own | NATS and Redis addresses written into the node configuration when the nodes reach them by other addresses than the controller does, such as nginx on the machine outside the container network |
| `CONTROLLER_CRYPTO_SERVICE_URL` | — | `http://crypto:8093` |
| `CONTROLLER_CRYPTO_PUBLIC_KEY` | — | public half of the contour key: PEM or a file path |
| `CONTROLLER_SEARCH_URL` | — | `http://search:8091` |
| `CONTROLLER_GEO_URL` | — | `http://geo:8092` |
| `CONTROLLER_UX_DIR` | `/app/ux/dist` | built panel inside the image |
| `CONTROLLER_SCHEMA_DIR` | `/app/schema` | database schema inside the image |
| `CONTROLLER_COMPILE_DIR` | `/app/data/compile` | where the compiler writes built configurations |
| `CONTROLLER_LOG` | `info` | log level |

The NATS address written into the node configuration comes from the controller's own environment,
not from a saved document: saving a document must not change where the installation connects.

## First start

1. **Bring up PostgreSQL** and give the controller `CONTROLLER_DATABASE_URL`.
2. **Schema.** On an empty database the controller applies `schema/01-schema.sql` and the shipped
   data `schema/02-seed.sql` on first start. If the database already has a schema, it is left
   alone.
3. **Contour key.** The public half is mounted into the controller
   (`CONTROLLER_CRYPTO_PUBLIC_KEY`); the private half goes only to `crypto` and the node agents.
4. **Panel.** It opens on `CONTROLLER_PORT`. A fresh installation has one space, `default`, the
   inspector catalog and the shipped profiles. There are no servers or routes: the operator
   creates them.
5. **Geo catalog.** Countries and ASN are loaded separately: the MaxMind export has its own
   license and is not part of the image.

## Docker Compose

```yaml
services:
  controller:
    image: placitum/controller
    ports: ["127.0.0.1:8080:8080"]
    environment:
      CONTROLLER_DATABASE_URL: postgres://waf:waf@postgres:5432/waf
      CONTROLLER_NATS_URL: nats://nats:4222
      CONTROLLER_REDIS_URL: redis://redis:6379
      CONTROLLER_REDIS_INTERNAL_URL: redis://redis-internal:6379
      CONTROLLER_CRYPTO_SERVICE_URL: http://crypto:8093
      CONTROLLER_CRYPTO_PUBLIC_KEY: /run/secrets/waf_node_pub
      CONTROLLER_SEARCH_URL: http://search:8091
      CONTROLLER_GEO_URL: http://geo:8092
    secrets: [waf_node_pub]
    depends_on: [postgres, nats, redis-internal]
```

The API has no login of its own, so the port is published on 127.0.0.1 only. A browser is the
other way in: a request that changes state, or a WebSocket handshake, is refused with
`403 cross_origin` when its `Origin` or `Sec-Fetch-Site` names another site. Tools that send neither
header pass. Responses carry `Content-Security-Policy`, `X-Frame-Options: DENY` and `nosniff`.

## Checking the installation

```sh
curl -fsS http://127.0.0.1:8080/healthz

# The panel is served by the same process
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/

# The database answers and the schema is in place
psql "$CONTROLLER_DATABASE_URL" -c "select name from http_spaces"
```

A fresh installation shows an empty configuration tree, an inspector catalog of the processes the
installation runs and a `default` profile for every subsystem. The catalog ships ten processes; the
core installer marks the ones it runs through `PUT /api/<space>/inspectors/installed`, and the rest
do not exist for the panel, routes and the build. `vlai` ships turned off. If the panel shows a yellow warning about the key
fingerprint, no `contour-pin.json` with the installation fingerprint is mounted and the browser
does not verify the public key.

## Upgrading

The schema is not upgraded on a live database. A new image with the same schema starts on top of
the existing database; if the schema changed, the installation is done again on an empty
database.

## Pitfalls

- **The key fingerprint is baked in at build time.** After changing the contour key, rebuild the
  image, otherwise the panel reports a mismatch.
- **Configuration lives in process memory.** A manual change in the database is not visible until
  a restart: the controller keeps state in memory and writes to the database rather than reading
  it on every request.
- **Do not expose `:8091` and `:8093`.** The controller talks to `search` and `crypto`, not the
  browser.
