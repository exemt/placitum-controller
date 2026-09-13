/*
 * HTTP API контроллера. UX живёт отдельно (controller/ux) и ходит сюда
 * по /api/*. Store — ciphertext в Postgres, агент забирает объект по uuid.
 *
 * Запись конфигурации: HTTP → thunk → Postgres → редьюсер → listener.
 * Postgres — долговременная правда, Redux — живая модель процесса.
 */

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

/*
  Журнал контроллера -- в waf.log, как у всего контура (log-ship.ts).
  Приёмник поднимается первым и шины не ждёт: строки о ключе контура и базе
  -- ровно те, ради которых журнал собирают, и до подключения они копятся.
*/
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

/*
  Схема -- до всего остального: репозитории ниже читают таблицы, которых на
  пустой базе ещё нет. Ошибка миграции -- отказ старта, а не работа на схеме,
  которой код не соответствует (migrate.ts).
*/
try {
  const schema = await migrate(pool, { schemaDir: cfg.schemaDir, base: cfg.schemaBase });
  log("info", "schema ready", {
    dir: cfg.schemaDir,
    baseline: schema.baseline,
    applied: schema.applied.length,
  });
} catch (err) {
  log("error", "schema migration failed", { error: String(err) });
  process.exit(1);
}

const store = new StoreRepo(pool);
/* Состав активных наборов -- у keeper во внутреннем Redis; панель читает оттуда. */
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
  // `unwrap()` бросает SerializedError, и `String()` от него -- "[object Object]".
  // Стартовая ошибка, которую нельзя прочитать, стоит дороже двух строк здесь.
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

/*
  Свой уровень -- из того же документа, что у сервисов (log-levels.ts):
  панель правит контроллер одной строкой со всеми. CONTROLLER_LOG --
  стартовое значение и то, куда порог возвращается, когда ключ снят.
*/
const stopLogLevels = await desired
  .watchLogLevels((doc) => {
    const next = levelFor(doc, cfg.name, cfg.logLevel);
    if (next.level === currentLevel() || !setLevel(next.level)) {
      return;
    }
    // log_level, а не level: поле level -- уровень самой строки, и
    // одноимённое поле затёрло бы его в JSON.
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
/*
  Выгрузки гео из панели (geo-import.ts): каталог пространства сверяется с
  файлом, файл уходит кодеру документом policy/geo. Документ досылается и
  здесь, на старте: загрузка, чей документ не лёг в KV до рестарта, не должна
  ждать следующей загрузки.
*/
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
// Блобы поколений -- во внутренний Redis контура, не в обменник тел.
const compileRedis =
  cfg.redisInternalUrl === "" ? null : new CompileRedis(cfg.redisInternalUrl);
/*
  Настройки процесса (уровень журнала) -- из каталога инспекторов, одним
  источником для компиляторов, планировщиков и ручек send: второго чтения
  каталога быть не должно, иначе план и рассылка разойдутся в хеше.
*/
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
/*
  Блобы поколений живут в Redis со сроком BLOB_TTL_SEC, и продлевает его
  только это: раз в минуту -- опубликованным указателям nginx, правил и ip.
  Старые поколения не продлеваются и сгорают сами; пропавшие тела
  возвращаются из плана (compile/keepalive.ts).
*/
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
        ],
        log,
      });
/*
  Сходимость. Планировщики зовут ту же чистую половину компиляторов, которой
  пользуется `send`: второй реализации хеша быть не должно, иначе панель начнёт
  врать в одну сторону, а рассылка работать в другую.
*/
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

/*
  Публикация отмечается в службе: с этого момента любая правка базы -- правка
  «после рассылки», даже если компилятор её не печатает. Хук ставится здесь, а
  не в шести обработчиках `send`: шесть мест -- шесть возможностей забыть.
*/
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
  dispatch: model.dispatch,
  getState: model.getState,
  crypto,
  cryptoService,
  convergence,
});
const server = app.listen(cfg.port, () => {
  log("info", "listening", {
    port: cfg.port,
    version: cfg.version,
    revision: cfg.revision,
    name: cfg.name,
    cors: cfg.corsOrigin,
    ux: cfg.uxDir ?? "off",
  });
});

const healthSocket = attachAgentHealthSocket(model.getState, model.subscribe);
const stopUpgrades = routeUpgrades(server, [healthSocket]);

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
