# Placitum controller

English · [Русский](README.ru.md)

The admin panel and API of Placitum. In the panel you define servers, routes, inspector profiles
and address lists; the controller builds a configuration from them and delivers it to the edge
nodes and inspectors.

Traffic does not pass through the controller. If it stops, the nodes keep working on the last
configuration they received.

The controller is not usually installed on its own: the installer in
[placitum-core](https://github.com/exemt/placitum-core) brings it up together with everything
else. This README covers how the controller works, how to build the image and how to work on it.

## How it works

Settings live in PostgreSQL. When an operator publishes the configuration from the panel, the
controller builds it: an nginx config for the nodes, profiles and rules for the inspectors. The
configuration itself goes to the internal Redis, and a pointer to it goes to NATS JetStream.
Nodes and inspectors pick up the new version from there.

A single Node.js process serves both the API and the panel. The built panel ships inside the
image, so no separate web server is needed.

## Required services

| Service | When | Why |
| --- | --- | --- |
| PostgreSQL | always | stores the configuration |
| NATS with JetStream | always | tells nodes and inspectors about new configurations |
| Redis (internal) | always | holds the configuration being delivered |
| `crypto` | for certificates uploaded in the panel | decrypts certificate keys; the controller never sees them in plain text |
| `search` | for the log and incidents | event search |
| `geo` | for address cards | country and ASN by IP |

## Configuration

The controller is configured with environment variables. The main ones:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CONTROLLER_PORT` | `8080` | API and panel port |
| `CONTROLLER_DATABASE_URL` | `postgres://waf:waf@127.0.0.1:5432/waf` | PostgreSQL |
| `CONTROLLER_NATS_URL` | `nats://127.0.0.1:4222` | NATS |
| `CONTROLLER_REDIS_INTERNAL_URL` | same as `CONTROLLER_REDIS_URL` | internal Redis for configuration delivery |
| `CONTROLLER_REDIS_URL` | — | body store Redis: the controller does not use it, it only passes the address to the nodes |
| `CONTROLLER_CRYPTO_PUBLIC_KEY` | — | public contour key: PEM or a file path |
| `CONTROLLER_CRYPTO_SERVICE_URL` | — | `crypto` address, e.g. `http://crypto:8093` |
| `CONTROLLER_SEARCH_URL` | — | `search` address, e.g. `http://search:8091`; without it the panel has no log |
| `CONTROLLER_GEO_URL` | — | `geo` address, e.g. `http://geo:8092`; without it addresses have no country or ASN |
| `CONTROLLER_LOG` | `info` | log level |

The full list is in [INSTALL.md](INSTALL.md) and [src/config.ts](src/config.ts).

The controller keeps the configuration in memory. If you change something directly in the
database, it only sees the change after a restart.

## Building the image

```sh
docker build -t placitum/controller .
```

Or straight from GitHub, without a clone:

```sh
docker buildx build -t placitum/controller "https://github.com/exemt/placitum-controller.git#develop"
```

The fingerprint of the public contour key is baked into the panel at build time. The browser uses
it to check that the API returned the real key. `sh bootstrap/secrets.sh --fingerprint` in
placitum-core prints the fingerprint; pass it like this:

```sh
docker build --build-arg VITE_CONTOUR_FINGERPRINT=sha256:… -t placitum/controller .
```

Without the fingerprint the image still builds, but the panel shows a warning. Rebuild the image
after changing the key. The core installer does all of this for you.

Check that the controller is up:

```sh
curl -fsS http://127.0.0.1:8080/healthz
```

## Database schema

The schema ships in the image as two files: `schema/01-schema.sql` with the structure and
`schema/02-seed.sql` with the shipped data. On an empty database the controller applies both on
first start: the `default` space, reference tables, deny pages, CRS rules, the inspector catalog,
the node port and default profiles. Servers and routes are not included; the operator creates
them.

If the database already has a schema, the controller leaves it alone. There are no schema
upgrades on a live database: when the schema changes, the installation is done again on an empty
database. See [schema/README.md](schema/README.md).

The country and ASN catalog (GeoLite2) is not included: the MaxMind export has its own license.
Load it through the panel or with `npm run load-geo`.

## Security

- The controller itself does not ask for a password. In a full installation the panel is opened
  through the edge node, which handles login, and the controller port listens on 127.0.0.1 only.
  Do not publish this port or put a proxy in front of it.
- The controller only accepts the public half of the contour key; it rejects the private one.
- The `search` (8091) and `crypto` (8093) ports stay internal: the controller talks to them, not
  the browser.

## Development

You need Node.js 22.18 or newer: the controller runs straight from its TypeScript sources, with no
build step.

It needs PostgreSQL, NATS and Redis. The easiest way to get them is
[placitum-core](https://github.com/exemt/placitum-core): set `PLC_INFRA_PORTS=loopback` in its
`.env` and run `./install.sh infra`. The services come up on 127.0.0.1, where the controller
defaults already point. You only need to set Redis:

```sh
npm ci
CONTROLLER_REDIS_URL=redis://127.0.0.1:6379 CONTROLLER_REDIS_INTERNAL_URL=redis://127.0.0.1:6380 npm run dev
```

The API starts on http://127.0.0.1:8080 and restarts on changes.

The panel with hot reload runs as a separate process:

```sh
npm ci --prefix ux
npm run ux
```

It opens on http://localhost:5173 and sends `/api` requests to the controller on :8080, so the
controller must be running. The dev server takes the key fingerprint from
`VITE_CONTOUR_FINGERPRINT` in `ux/.env` or the environment; without it the panel shows a warning.
To have the controller serve the panel on :8080 itself, build it with `npm run ux:build`.

Type check:

```sh
npm run typecheck
```

On every push to `develop` and on pull requests, CI checks types and builds the panel and the
image.

## Repository layout

```
src/            API, configuration build and delivery, node state
ux/             panel: React, Vite, MUI
ux/help/        admin help shown in the panel
schema/         database schema and shipped data
```

## License

[Placitum License Agreement](LICENSE.md). A Russian translation is in
[LICENSE.ru.md](LICENSE.ru.md); the English text is the legally binding one.
