import { load } from "./config.ts";
import { createApp } from "./app.ts";
import { loadContourCrypto, type ContourCrypto } from "./crypto.ts";
import { attachAgentHealthSocket } from "./agent-health-socket.ts";
import { routeUpgrades } from "./ws-upgrade.ts";
import { CertificateRepo } from "./certificates.ts";
import { IpCompiler, RulesCompiler, NginxCompiler } from "./compile.ts";
import { CompileRedis } from "./compile/redis.ts";
import {
  ipBlobKeys,
  nginxBlobKeys,
  rulesBlobKeys,
  startBlobKeepalive,
} from "./compile/keepalive.ts";
import { exportNginx } from "./compile/nginx-export.ts";
import { BLOB_TTL_SEC } from "./compile/pointer.ts";
import { CryptoServiceClient } from "./crypto-service-client.ts";
import { DatasetRepo } from "./datasets.ts";
import { GeoFileRepo } from "./geo-files.ts";
import { GeoImports } from "./geo-import.ts";
import { InspectorRepo } from "./inspectors.ts";
import { createPool } from "./db.ts";
import { migrate } from "./migrate.ts";
import { currentLevel, log, setLevel } from "./log.ts";
import { levelFor } from "./log-levels.ts";
import { startLogShip } from "./log-ship.ts";
import { LocationRepo } from "./locations.ts";
import { PortRepo } from "./ports.ts";
import { IpAsnRepo } from "./ip-asns.ts";
import { IpCountryRepo } from "./ip-countries.ts";
import { IpProfileRepo } from "./ip-profiles.ts";
import { IpSetRepo } from "./ip-sets.ts";
import { AuthProfileRepo } from "./auth-profiles.ts";
import { AuthSourceRepo } from "./auth-sources.ts";
import { CaptchaProfileRepo } from "./captcha-profiles.ts";
import { JsonProfileRepo } from "./json-profiles.ts";
import { ActionProfileRepo } from "./action-profiles.ts";
import { CookieProfileRepo } from "./cookie-profiles.ts";
import { buildActionManifest } from "./action-manifest.ts";
import { buildCookieManifest } from "./cookie-manifest.ts";
import { listBlobKeys, listSourceOf } from "./static-lists.ts";
import { CounterProfileRepo } from "./counter-profiles.ts";
import { VlaiProfileRepo } from "./vlai-profiles.ts";
import { RewriteProfileRepo } from "./rewrite-profiles.ts";
import { RuleFileRepo } from "./rule-files.ts";
import { RuleSetRepo } from "./rule-sets.ts";
import { ServerRepo } from "./servers.ts";
import { SpaceRepo } from "./spaces.ts";
import { UpstreamRepo } from "./upstreams.ts";
import {
  createControllerStore,
  hydrateModel,
  ipCountriesReplaced,
  startFleetTicker,
} from "./state/index.ts";
import { startDataBus } from "./data-bus.ts";
import { startDesiredStore } from "./desired.ts";
import { createPlanners } from "./convergence/planner.ts";
import { startConvergenceService } from "./convergence/service.ts";
import { AgentSettingsRepo } from "./agent-settings.ts";
import { HaproxySettingsRepo } from "./haproxy-settings.ts";
import { startFleetBus } from "./fleet-bus.ts";
import { startFleetDemo } from "./state/fleet-demo.ts";
import { StoreRepo } from "./store.ts";

const cfg = load();
setLevel(cfg.logLevel);

const logShip =
  cfg.logShip && cfg.natsUrl !== ""
    ? startLogShip({ url: cfg.natsUrl, writer: cfg.logWriter, service: cfg.name })
    : null;

let crypto: ContourCrypto | undefined;
try {
  crypto = loadContourCrypto(cfg.cryptoPublicKey);
} catch (err) {
  log("error", "contour public key rejected", { error: String(err) });
  process.exit(1);
}

if (crypto !== undefined) {
  log("info", "contour public key", {
    alg: crypto.alg,
    fingerprint: crypto.fingerprint,
  });
} else {
  log("warn", "contour public key missing", {
    hint: "CONTROLLER_CRYPTO_PUBLIC_KEY",
  });
}

const pool = createPool(cfg.databaseUrl);

try {
  const schema = await migrate(pool, { schemaDir: cfg.schemaDir });
  log("info", "schema ready", {
    dir: cfg.schemaDir,
    initialized: schema.initialized,
  });
} catch (err) {
  log("error", "schema init failed", { error: String(err) });
  process.exit(1);
}

const store = new StoreRepo(pool);
const datasets = new DatasetRepo(
  pool,
  cfg.redisInternalUrl === "" ? null : new CompileRedis(cfg.redisInternalUrl),
);
const inspectors = new InspectorRepo(pool);
const ruleFiles = new RuleFileRepo(pool);
const ruleSets = new RuleSetRepo(pool);
const authProfiles = new AuthProfileRepo(pool);
const authSources = new AuthSourceRepo(pool);
const captchaProfiles = new CaptchaProfileRepo(pool);
const jsonProfiles = new JsonProfileRepo(pool);
const actionProfiles = new ActionProfileRepo(pool);
const cookieProfiles = new CookieProfileRepo(pool);
const counterProfiles = new CounterProfileRepo(pool);
const vlaiProfiles = new VlaiProfileRepo(pool);
const rewriteProfiles = new RewriteProfileRepo(pool);
const ipCountries = new IpCountryRepo(pool);
const ipAsns = new IpAsnRepo(pool);
const ipSets = new IpSetRepo(pool, ipCountries, ipAsns);
const ipProfiles = new IpProfileRepo(pool);
const servers = new ServerRepo(pool);
const locations = new LocationRepo(pool);
const ports = new PortRepo(pool);
const certificates = new CertificateRepo(pool);
const upstreams = new UpstreamRepo(pool);
const spaces = new SpaceRepo(pool);
const cryptoService = new CryptoServiceClient(cfg.cryptoServiceUrl);
if (cfg.cryptoServiceUrl === "") {
  log("warn", "crypto service url missing", {
    hint: "CONTROLLER_CRYPTO_SERVICE_URL",
  });
}
const dataBus = await startDataBus(cfg.natsUrl);
const model = createControllerStore({
  spaces,
  datasets,
  inspectors,
  ruleFiles,
  ruleSets,
  ipCountries,
  ipProfiles,
  servers,
  locations,
  ports,
  certificates,
  upstreams,
  bus: dataBus,
});

try {
  await store.ping();
  await model.dispatch(hydrateModel()).unwrap();
} catch (err) {
  const detail =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : err !== null && typeof err === "object"
        ? JSON.stringify(err)
        : String(err);
  log("error", "postgres unavailable", { error: detail });
  await pool.end();
  process.exit(1);
}

const desired = await startDesiredStore(cfg.natsUrl, model.dispatch);

const stopLogLevels = await desired
  .watchLogLevels((doc) => {
    const next = levelFor(doc, cfg.name, cfg.logLevel);
    if (next.level === currentLevel() || !setLevel(next.level)) {
      return;
    }
    log("info", "log level applied", {
      log_level: next.level,
      source: next.source,
      rev: doc?.rev ?? 0,
    });
  })
  .catch((err: unknown) => {
    log("warn", "log levels watch failed", { error: String(err) });
    return () => {};
  });
const geoFiles = new GeoFileRepo(pool);
const geoImports = new GeoImports({
  pool,
  files: geoFiles,
  desired,
  async countriesChanged(spaceId) {
    model.dispatch(ipCountriesReplaced({ spaceId, rows: await ipCountries.list(spaceId) }));
  },
});
void geoImports.publish();
const compileRedis =
  cfg.redisInternalUrl === "" ? null : new CompileRedis(cfg.redisInternalUrl);
const inspectorSettings = inspectors.settingsSource();
const compiler = new RulesCompiler(
  cfg.compileDir,
  ruleFiles,
  ruleSets,
  inspectorSettings,
  compileRedis,
  desired,
);
const ipCompiler = new IpCompiler(
  cfg.compileDir,
  ipProfiles,
  inspectorSettings,
  compileRedis,
  desired,
);
const nginxCompiler = new NginxCompiler(
  store,
  compileRedis,
  desired,
);
const blobKeepalive =
  compileRedis === null
    ? null
    : startBlobKeepalive({
        redis: compileRedis,
        ttlSec: BLOB_TTL_SEC,
        everyMs: 60_000,
        spaces: async () => (await spaces.list()).map((space) => space.id),
        channels: [
          {
            id: "nginx",
            async published() {
              const p = await desired.getNginxPack();
              return p === null ? null : { rev: p.rev, sha256: p.sha256, keys: nginxBlobKeys(p) };
            },
            blobs: async (spaceId) => nginxCompiler.blobItems(await exportNginx(pool, spaceId)),
          },
          {
            id: "rules",
            async published() {
              const p = await desired.getRulesPack();
              return p === null ? null : { rev: p.rev, sha256: p.sha256, keys: rulesBlobKeys(p) };
            },
            blobs: (spaceId) => compiler.blobItems(spaceId),
          },
          {
            id: "ip",
            async published() {
              const p = await desired.getIpPack();
              return p === null ? null : { rev: p.rev, sha256: p.sha256, keys: ipBlobKeys(p) };
            },
            blobs: (spaceId) => ipCompiler.blobItems(spaceId),
          },
          {
            // Static lists the conditions of auto-actions compare with.
            id: "action",
            async published() {
              const m = await desired.getAction();
              return m === null ? null : { rev: m.rev, sha256: m.config_hash, keys: listBlobKeys(m.lists) };
            },
            async blobs(spaceId) {
              const built = await buildActionManifest(
                actionProfiles,
                spaceId,
                1,
                inspectorSettings,
                listSourceOf(datasets),
              );
              return "error" in built ? null : { sha256: built.manifest.config_hash, items: built.blobs };
            },
          },
          {
            // Static lists the cookie rules compare with.
            id: "cookie",
            async published() {
              const m = await desired.getCookie();
              return m === null ? null : { rev: m.rev, sha256: m.config_hash, keys: listBlobKeys(m.lists) };
            },
            async blobs(spaceId) {
              const built = await buildCookieManifest(
                cookieProfiles,
                spaceId,
                1,
                inspectorSettings,
                listSourceOf(datasets),
              );
              return "error" in built ? null : { sha256: built.manifest.config_hash, items: built.blobs };
            },
          },
        ],
        log,
      });
const agentSettings = new AgentSettingsRepo(pool);
const haproxySettings = new HaproxySettingsRepo(pool);
const convergence = startConvergenceService(
  createPlanners({
    pool,
    nginx: nginxCompiler,
    rules: compiler,
    ip: ipCompiler,
    auth: authProfiles,
    authSources,
    captcha: captchaProfiles,
    json: jsonProfiles,
    action: actionProfiles,
    cookie: cookieProfiles,
    datasets,
    counter: counterProfiles,
    vlai: vlaiProfiles,
    rewrite: rewriteProfiles,
    agent: agentSettings,
    haproxy: haproxySettings,
    settings: inspectorSettings,
  }),
  model.dispatch,
  model.getState,
  model.subscribe,
);

desired.onPublished = (channel) => convergence.published(channel);

const app = createApp(cfg, {
  pool,
  store,
  datasets,
  inspectors,
  ruleFiles,
  ruleSets,
  authProfiles,
  authSources,
  captchaProfiles,
  jsonProfiles,
  actionProfiles,
  cookieProfiles,
  counterProfiles,
  vlaiProfiles,
  rewriteProfiles,
  ipCountries,
  ipAsns,
  ipSets,
  ipProfiles,
  geoFiles,
  geoImports,
  desired,
  compiler,
  ipCompiler,
  nginxCompiler,
  blobs: compileRedis,
  dispatch: model.dispatch,
  getState: model.getState,
  crypto,
  cryptoService,
  convergence,
});
const onListening = (): void => {
  log("info", "listening", {
    host: cfg.host ?? "*",
    port: cfg.port,
    version: cfg.version,
    revision: cfg.revision,
    name: cfg.name,
    cors: cfg.corsOrigins.join(",") || "off",
    ux: cfg.uxDir ?? "off",
  });
};

// CONTROLLER_HOST keeps an API without login off the outside addresses where no container
// boundary does it: an install without Docker.
const server =
  cfg.host === undefined
    ? app.listen(cfg.port, onListening)
    : app.listen(cfg.port, cfg.host, onListening);

const healthSocket = attachAgentHealthSocket(model.getState, model.subscribe);
const stopUpgrades = routeUpgrades(server, [healthSocket], cfg.corsOrigins);

const stopFleetTick = startFleetTicker(model, {
  tickMs: cfg.fleetTickMs,
  degradedMs: cfg.fleetDegradedMs,
  expireMs: cfg.fleetExpireMs,
});

const stopFleetDemo = cfg.fleetDemo ? startFleetDemo(model.dispatch) : () => {};
const stopFleetBus =
  cfg.natsUrl === ""
    ? () => {}
    : await startFleetBus(cfg.natsUrl, model.dispatch);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log("info", "shutting down", { signal });
    stopFleetDemo();
    stopFleetTick();
    convergence.stop();
    geoImports.stop();
    blobKeepalive?.stop();
    healthSocket.close();
    stopUpgrades();
    stopFleetBus();
    dataBus.close();
    stopLogLevels();
    desired.close();
    void logShip?.close();
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
