import cors from "cors";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";

import { agentRouter } from "./agent-http.ts";
import { AgentSettingsRepo } from "./agent-settings.ts";
import { originGuard, securityHeaders } from "./browser-guard.ts";
import { haproxyRouter } from "./haproxy-http.ts";
import { HaproxySettingsRepo } from "./haproxy-settings.ts";
import { certificatesRouter } from "./certificates-http.ts";
import type { Config } from "./config.ts";
import { catalogRouter } from "./catalog-http.ts";
import {
  bodyStoresRouter,
  denyResponsesRouter,
  logFormatsRouter,
} from "./catalogs-http.ts";
import { configRouter } from "./config-http.ts";
import { convergenceRouter } from "./convergence-http.ts";
import type { ConvergenceService } from "./convergence/service.ts";
import type { NginxCompiler } from "./compile.ts";
import type { ContourCrypto } from "./crypto.ts";
import { cryptoRouter } from "./crypto-http.ts";
import type { CryptoServiceClient } from "./crypto-service-client.ts";
import type { Pool } from "./db.ts";
import {
  addressesRouter,
  contentTypesRouter,
  datasetsRouter,
} from "./datasets-http.ts";
import { inspectorsRouter } from "./inspectors-http.ts";
import type { InspectorRepo } from "./inspectors.ts";
import type { DatasetRepo } from "./datasets.ts";
import { fleetRouter } from "./fleet-http.ts";
import type { GeoFileRepo } from "./geo-files.ts";
import { geoRouter } from "./geo-http.ts";
import type { GeoImports } from "./geo-import.ts";
import { GEO_SERVICE, geoFilesRouter, geoImportRouter } from "./geo-import-http.ts";
import { searchRouter } from "./search-http.ts";
import { log } from "./log.ts";
import { logLevelsRouter } from "./log-levels-http.ts";
import { actionsRouter } from "./actions-http.ts";
import { buildMeta } from "./meta.ts";
import { ipAsnsRouter } from "./ip-asns-http.ts";
import type { IpAsnRepo } from "./ip-asns.ts";
import { ipCountriesRouter } from "./ip-countries-http.ts";
import type { IpCountryRepo } from "./ip-countries.ts";
import { ipProfilesRouter } from "./ip-profiles-http.ts";
import type { IpProfileRepo } from "./ip-profiles.ts";
import { ipSetsRouter } from "./ip-sets-http.ts";
import type { IpSetRepo } from "./ip-sets.ts";
import { authRouter } from "./auth-http.ts";
import type { AuthProfileRepo } from "./auth-profiles.ts";
import type { AuthSourceRepo } from "./auth-sources.ts";
import { captchaRouter } from "./captcha-http.ts";
import type { CaptchaProfileRepo } from "./captcha-profiles.ts";
import { jsonRouter } from "./json-http.ts";
import type { JsonProfileRepo } from "./json-profiles.ts";
import { counterRouter } from "./counter-http.ts";
import type { CounterProfileRepo } from "./counter-profiles.ts";
import { actionProfilesRouter } from "./action-profiles-http.ts";
import { cookieProfilesRouter } from "./cookie-profiles-http.ts";
import type { ActionProfileRepo } from "./action-profiles.ts";
import type { CookieProfileRepo } from "./cookie-profiles.ts";
import { vlaiRouter } from "./vlai-http.ts";
import type { VlaiProfileRepo } from "./vlai-profiles.ts";
import { rewriteRouter } from "./rewrite-http.ts";
import type { RewriteProfileRepo } from "./rewrite-profiles.ts";
import { ruleFilesRouter } from "./rule-files-http.ts";
import type { RuleFileRepo } from "./rule-files.ts";
import type { IpCompiler, RulesCompiler } from "./compile.ts";
import type { DesiredStore } from "./desired.ts";
import { ruleSetsRouter } from "./rule-sets-http.ts";
import type { RuleSetRepo } from "./rule-sets.ts";
import { rulesRouter } from "./rules-http.ts";
import { requireScope } from "./scope.ts";
import { locationsRouter } from "./locations-http.ts";
import { portsRouter } from "./ports-http.ts";
import { serversRouter } from "./servers-http.ts";
import { upstreamsRouter } from "./upstreams-http.ts";
import { spaceSettingsRouter } from "./space-settings-http.ts";
import { spacesRouter } from "./spaces-http.ts";
import { serviceSelectors } from "./state/slices/fleet.ts";
import type { AppDispatch, RootState } from "./state/types.ts";
import { storeRouter } from "./store-http.ts";
import type { StoreRepo } from "./store.ts";
import { mountUx } from "./ux-static.ts";

export interface AppServices {
  pool: Pool;
  store: StoreRepo;
  datasets: DatasetRepo;
  inspectors: InspectorRepo;
  ruleFiles: RuleFileRepo;
  ruleSets: RuleSetRepo;
  authProfiles: AuthProfileRepo;
  authSources: AuthSourceRepo;
  captchaProfiles: CaptchaProfileRepo;
  jsonProfiles: JsonProfileRepo;
  actionProfiles: ActionProfileRepo;
  cookieProfiles: CookieProfileRepo;
  counterProfiles: CounterProfileRepo;
  vlaiProfiles: VlaiProfileRepo;
  rewriteProfiles: RewriteProfileRepo;
  ipCountries: IpCountryRepo;
  ipAsns: IpAsnRepo;
  ipSets: IpSetRepo;
  ipProfiles: IpProfileRepo;
  geoFiles: GeoFileRepo;
  geoImports: GeoImports;
  desired: DesiredStore;
  compiler: RulesCompiler;
  ipCompiler: IpCompiler;
  nginxCompiler: NginxCompiler;
  dispatch: AppDispatch;
  getState: () => RootState;
  crypto?: ContourCrypto;
  cryptoService: CryptoServiceClient;
  convergence: ConvergenceService;
}

export function createApp(cfg: Config, services: AppServices): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders());

  // The panel is served from this origin and the dev server proxies to it: CORS is for an
  // operator who names the origins, never for any page that asks.
  if (cfg.corsOrigins.length > 0) {
    app.use(cors({ origin: cfg.corsOrigins }));
  }

  app.use(originGuard(cfg.corsOrigins));
  app.use(express.json({ limit: Math.ceil(cfg.storeMaxBytes * 1.4) + 4096 }));

  app.use((req, res, next) => {
    const started = performance.now();
    res.on("finish", () => {
      log("info", "request", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        took_ms: Math.round((performance.now() - started) * 1000) / 1000,
      });
    });
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.type("text/plain").send("ok");
  });

  app.get("/api/health", async (_req, res, next) => {
    try {
      await services.store.ping();
      res.json({ ok: true, db: true });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/meta", (_req, res) => {
    res.json(buildMeta(cfg));
  });

  app.use("/api/actions", actionsRouter());
  app.use("/api/spaces", spacesRouter(services.getState));
  app.use("/api/fleet", fleetRouter(services.dispatch, services.getState));
  app.use("/api/search", searchRouter(cfg.searchUrl));
  app.use("/api/log-levels", logLevelsRouter(services.desired));
  app.use("/api/geo/files", geoFilesRouter(services.geoFiles));

  const scoped = express.Router({ mergeParams: true });
  const settingsOf = services.inspectors.settingsSource();
  scoped.use(requireScope(services.getState));
  scoped.use("/crypto", cryptoRouter(services.crypto));
  scoped.use("/store", storeRouter(services.store, cfg.storeMaxBytes));
  scoped.use("/content-types", contentTypesRouter(services.datasets));
  scoped.use(
    "/inspectors",
    inspectorsRouter(
      services.dispatch,
      services.getState,
      services.inspectors,
    ),
  );
  scoped.use(
    "/datasets",
    datasetsRouter(
      services.dispatch,
      services.getState,
      services.datasets,
      cfg.storeMaxBytes,
      (space) => services.authSources.userLists(space),
    ),
  );
  scoped.use(
    "/addresses",
    addressesRouter(services.dispatch, services.getState, services.datasets),
  );
  scoped.use(
    "/rule-files",
    ruleFilesRouter(services.dispatch, services.getState, services.ruleFiles),
  );
  scoped.use(
    "/rule-sets",
    ruleSetsRouter(services.dispatch, services.getState, services.ruleSets),
  );
  scoped.use(
    "/rules",
    rulesRouter(services.desired, services.compiler),
  );
  scoped.use(
    "/auth",
    authRouter(
      services.getState,
      services.authSources,
      services.authProfiles,
      services.desired,
      settingsOf,
    ),
  );
  scoped.use(
    "/captcha",
    captchaRouter(
      services.getState,
      services.captchaProfiles,
      services.desired,
      settingsOf,
    ),
  );
  scoped.use(
    "/json",
    jsonRouter(services.getState, services.jsonProfiles, services.desired, settingsOf),
  );
  scoped.use(
    "/action",
    actionProfilesRouter(
      services.getState,
      services.actionProfiles,
      services.desired,
      settingsOf,
      services.datasets,
    ),
  );
  scoped.use(
    "/cookie",
    cookieProfilesRouter(
      services.getState,
      services.cookieProfiles,
      services.desired,
      settingsOf,
      services.datasets,
    ),
  );
  scoped.use(
    "/counter",
    counterRouter(
      services.getState,
      services.counterProfiles,
      services.desired,
      settingsOf,
    ),
  );
  scoped.use(
    "/vlai",
    vlaiRouter(services.getState, services.vlaiProfiles, services.desired, settingsOf),
  );
  scoped.use(
    "/rewrite",
    rewriteRouter(
      services.getState,
      services.rewriteProfiles,
      services.desired,
      settingsOf,
    ),
  );
  scoped.use(
    "/ip-countries",
    ipCountriesRouter(services.getState, services.ipCountries),
  );
  scoped.use("/ip-asns", ipAsnsRouter(services.ipAsns));
  scoped.use(
    "/geo/import",
    geoImportRouter({
      imports: services.geoImports,
      files: services.geoFiles,
      desired: services.desired,
      coders: () =>
        serviceSelectors
          .selectAll(services.getState())
          .filter((row) => row.name === GEO_SERVICE),
    }),
  );
  scoped.use(
    "/geo",
    geoRouter(services.ipCountries, services.ipAsns, cfg.geoUrl),
  );
  scoped.use("/ip-sets", ipSetsRouter(services.ipSets));
  scoped.use(
    "/ip-profiles",
    ipProfilesRouter(
      services.dispatch,
      services.getState,
      services.ipProfiles,
      services.ipCompiler,
      services.desired,
    ),
  );
  scoped.use(
    "/http",
    spaceSettingsRouter(services.dispatch, services.getState, {
      natsUrl: cfg.natsUrl,
      redisUrl: cfg.redisUrl,
      redisInternalUrl: cfg.redisInternalUrl,
    }),
  );
  scoped.use(
    "/servers",
    serversRouter(services.dispatch, services.getState),
  );
  scoped.use(
    "/locations",
    locationsRouter(services.dispatch, services.getState),
  );
  scoped.use(
    "/ports",
    portsRouter(services.dispatch, services.getState),
  );
  scoped.use(
    "/upstreams",
    upstreamsRouter(services.dispatch, services.getState),
  );
  scoped.use(
    "/certificates",
    certificatesRouter(services.dispatch, services.getState, services.cryptoService),
  );
  scoped.use("/catalog", catalogRouter(services.pool));
  scoped.use("/deny-responses", denyResponsesRouter(services.pool, services.getState));
  scoped.use("/body-stores", bodyStoresRouter(services.pool, cfg.redisUrl));
  scoped.use("/log-formats", logFormatsRouter(services.pool));
  scoped.use(
    "/config",
    configRouter(services.pool, services.nginxCompiler),
  );
  scoped.use(
    "/convergence",
    convergenceRouter(services.getState, services.convergence),
  );
  scoped.use(
    "/agent",
    agentRouter(new AgentSettingsRepo(services.pool), services.desired),
  );
  scoped.use(
    "/haproxy",
    haproxyRouter(new HaproxySettingsRepo(services.pool), services.desired),
  );
  app.use("/api/:scopeUuid", scoped);

  if (cfg.uxDir !== undefined) {
    mountUx(app, cfg.uxDir);
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const known = err as { status?: number; body?: unknown } | null;
    if (known !== null && typeof known.status === "number") {
      if (!res.headersSent) {
        res.status(known.status).json(known.body ?? { error: "request_failed" });
      }
      return;
    }
    log("error", "handler failed", {
      error:
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : err !== null && typeof err === "object"
            ? JSON.stringify(err)
            : String(err),
    });
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error" });
    }
  });

  return app;
}
