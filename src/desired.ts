import { connect, type NatsConnection } from "nats";

import {
  AGENT_CONF_KEY,
  AGENT_CONF_SUBJECT,
  parseAgentConfPointer,
  type AgentConfPointer,
} from "./compile/agent-conf.ts";
import {
  HAPROXY_CONF_KEY,
  HAPROXY_CONF_SUBJECT,
  parseHaproxyConfPointer,
  type HaproxyConfPointer,
} from "./compile/haproxy.ts";
import {
  IP_PACK_KEY,
  IP_PACK_SUBJECT,
  parseIpPointer,
  type IpPackPointer,
} from "./compile/ip-pack.ts";
import {
  NGINX_PACK_KEY,
  NGINX_PACK_SUBJECT,
  parseNginxPointer,
  type NginxPackPointer,
} from "./compile/nginx-pack.ts";
import {
  parsePointer,
  RULES_PACK_KEY,
  RULES_PACK_SUBJECT,
  type RulesPackPointer,
} from "./compile/pointer.ts";
import { log } from "./log.ts";
import {
  LOG_LEVELS_KEY,
  parseLogLevelsDoc,
  type LogLevelsDoc,
} from "./log-levels.ts";
import {
  DESIRED_BUCKET,
  MODSEC_KEY,
  parseManifest,
  type RulesManifest,
} from "./rules-manifest.ts";
import { AUTH_KEY, parseAuthManifest } from "./auth-manifest.ts";
import type { AuthManifest } from "./auth-manifest.ts";
import { CAPTCHA_KEY, parseCaptchaManifest } from "./captcha-manifest.ts";
import { JSON_KEY, parseJsonManifest } from "./json-manifest.ts";
import { ACTION_KEY, parseActionManifest } from "./action-manifest.ts";
import { COOKIE_KEY, parseCookieManifest } from "./cookie-manifest.ts";
import { COUNTER_KEY, parseCounterManifest } from "./counter-manifest.ts";
import { VLAI_KEY, parseVlaiManifest } from "./vlai-manifest.ts";
import { REWRITE_KEY, parseRewriteManifest } from "./rewrite-manifest.ts";
import type { CaptchaManifest } from "./captcha-manifest.ts";
import type { JsonManifest } from "./json-manifest.ts";
import type { ActionManifest } from "./action-manifest.ts";
import type { CookieManifest } from "./cookie-manifest.ts";
import type { CounterManifest } from "./counter-manifest.ts";
import type { VlaiManifest } from "./vlai-manifest.ts";
import type { RewriteManifest } from "./rewrite-manifest.ts";
import type { ChannelId } from "./convergence/channels.ts";
import { CHANNELS } from "./convergence/channels.ts";
import {
  convergenceDesiredSeen,
  convergenceLedgerSeen,
} from "./state/slices/convergence.ts";
import type { AppDispatch } from "./state/types.ts";

/**
 * Поколение канала в форме, которая нужна сходимости: хеш, ревизия и имена
 * наборов. Имена -- не для показа: по ним межканальная проверка отвечает,
 * издан ли профиль, на который сослался шаблон nginx.
 */
export interface DesiredFact {
  hash: string;
  rev: number;
  profiles?: string[];
}

/** Достать факт из значения ключа, каким бы ни был его формат. */
const FACT_OF: Record<ChannelId, (input: unknown) => DesiredFact | null> = {
  nginx: (input) => {
    const row = parseNginxPointer(input);
    return row === null ? null : { hash: row.sha256, rev: row.rev };
  },
  agent: (input) => {
    const row = parseAgentConfPointer(input);
    return row === null ? null : { hash: row.sha256, rev: row.rev };
  },
  haproxy: (input) => {
    const row = parseHaproxyConfPointer(input);
    return row === null ? null : { hash: row.sha256, rev: row.rev };
  },
  rules: (input) => {
    const row = parsePointer(input);
    return row === null
      ? null
      : { hash: row.sha256, rev: row.rev, profiles: Object.keys(row.profiles).sort() };
  },
  ip: (input) => {
    const row = parseIpPointer(input);
    return row === null
      ? null
      : { hash: row.sha256, rev: row.rev, profiles: Object.keys(row.profiles).sort() };
  },
  auth: (input) => {
    const row = parseAuthManifest(input);
    return row === null
      ? null
      : {
          hash: row.config_hash,
          rev: row.rev,
          profiles: Object.keys(row.profiles).sort(),
        };
  },
  captcha: (input) => {
    const row = parseCaptchaManifest(input);
    return row === null
      ? null
      : {
          hash: row.config_hash,
          rev: row.rev,
          profiles: Object.keys(row.profiles).sort(),
        };
  },
  json: (input) => {
    const row = parseJsonManifest(input);
    return row === null
      ? null
      : {
          hash: row.config_hash,
          rev: row.rev,
          profiles: Object.keys(row.profiles).sort(),
        };
  },
  action: (input) => {
    const row = parseActionManifest(input);
    return row === null
      ? null
      : {
          hash: row.config_hash,
          rev: row.rev,
          profiles: Object.keys(row.profiles).sort(),
        };
  },
  cookie: (input) => {
    const row = parseCookieManifest(input);
    return row === null
      ? null
      : {
          hash: row.config_hash,
          rev: row.rev,
          profiles: Object.keys(row.profiles).sort(),
        };
  },
  counter: (input) => {
    const row = parseCounterManifest(input);
    return row === null
      ? null
      : {
          hash: row.config_hash,
          rev: row.rev,
          profiles: Object.keys(row.profiles).sort(),
        };
  },
  vlai: (input) => {
    const row = parseVlaiManifest(input);
    return row === null
      ? null
      : {
          hash: row.config_hash,
          rev: row.rev,
          profiles: Object.keys(row.profiles).sort(),
        };
  },
  rewrite: (input) => {
    const row = parseRewriteManifest(input);
    return row === null
      ? null
      : {
          hash: row.config_hash,
          rev: row.rev,
          profiles: Object.keys(row.profiles).sort(),
        };
  },
};

export interface DesiredStore {
  getModsec(): Promise<RulesManifest | null>;
  putModsec(manifest: RulesManifest): Promise<void>;
  getAuth(): Promise<AuthManifest | null>;
  putAuth(manifest: AuthManifest): Promise<void>;
  getCaptcha(): Promise<CaptchaManifest | null>;
  putCaptcha(manifest: CaptchaManifest): Promise<void>;
  getJson(): Promise<JsonManifest | null>;
  putJson(manifest: JsonManifest): Promise<void>;
  getAction(): Promise<ActionManifest | null>;
  putAction(manifest: ActionManifest): Promise<void>;
  getCookie(): Promise<CookieManifest | null>;
  putCookie(manifest: CookieManifest): Promise<void>;
  getCounter(): Promise<CounterManifest | null>;
  putCounter(manifest: CounterManifest): Promise<void>;
  getVlai(): Promise<VlaiManifest | null>;
  putVlai(manifest: VlaiManifest): Promise<void>;
  getRewrite(): Promise<RewriteManifest | null>;
  putRewrite(manifest: RewriteManifest): Promise<void>;
  getRulesPack(): Promise<RulesPackPointer | null>;
  putRulesPack(pointer: RulesPackPointer): Promise<void>;
  getIpPack(): Promise<IpPackPointer | null>;
  putIpPack(pointer: IpPackPointer): Promise<void>;
  getNginxPack(): Promise<NginxPackPointer | null>;
  putNginxPack(pointer: NginxPackPointer): Promise<void>;
  /**
   * Настройки агента. Блобов у них нет: документ мелкий и лежит в значении
   * ключа целиком.
   */
  getAgentConf(): Promise<AgentConfPointer | null>;
  putAgentConf(pointer: AgentConfPointer): Promise<void>;
  /**
   * Конфигурация haproxy. Файл лежит в значении ключа целиком: он мелкий и
   * не секретный, как настройки агента.
   */
  getHaproxyConf(): Promise<HaproxyConfPointer | null>;
  putHaproxyConf(pointer: HaproxyConfPointer): Promise<void>;
  /**
   * Уровни журнала сервисов (`policy/log-levels`, log-levels.ts). Не
   * поколение: ни хеша, ни сходимости -- сервисы применяют документ сразу, и
   * «разослать» здесь нечего.
   */
  getLogLevels(): Promise<LogLevelsDoc | null>;
  putLogLevels(doc: LogLevelsDoc): Promise<void>;
  /** Подписка на документ: первым событием приходит то, что лежит сейчас. */
  watchLogLevels(onChange: (doc: LogLevelsDoc | null) => void): Promise<() => void>;
  /**
   * Что делать после успешной публикации. Ставится снаружи (main.ts) и ведёт
   * в службу сходимости: та запоминает отпечаток источника на этот момент.
   * Хук здесь, а не в шести обработчиках `send`, ровно потому, что шесть мест
   * -- это шесть возможностей забыть.
   */
  onPublished?: (channel: ChannelId) => Promise<void> | void;
  /**
   * Рассылка прошла, но записывать в KV было нечего: поколение совпало с уже
   * изданным. Для шины это ничего, а для сходимости -- полноценное «разослали»:
   * иначе отпечаток источника не обновится, и правка, которую компилятор не
   * печатает, останется помеченной навсегда. Ровно после такой правки оператор
   * и жмёт кнопку.
   */
  markPublished(channel: ChannelId): Promise<void>;
  close(): void;
}

/**
 * JetStream KV `WAF_DESIRED`. Своё соединение: fleet-bus читает core NATS,
 * сюда — поколение. Нет URL — методы бросают `kv_unavailable`.
 */
export async function startDesiredStore(
  url: string,
  dispatch: AppDispatch,
): Promise<DesiredStore> {
  if (url === "") {
    return unavailableStore();
  }

  let nc: NatsConnection | null = null;
  let stopped = false;

  /**
   * Издано. `published` -- это положил сюда сам контроллер, значит хеш идёт в
   * журнал: по нему потом отличают дренаж прежнего поколения от чужого
   * конфига на узле.
   */
  const announce = async (
    channel: ChannelId,
    fact: DesiredFact,
    published: boolean,
  ): Promise<void> => {
    dispatch(
      convergenceDesiredSeen({
        channel,
        hash: fact.hash,
        rev: fact.rev,
        profiles: fact.profiles,
        published,
      }),
    );

    if (published) {
      await store.onPublished?.(channel);
    }
  };

  const open = async (): Promise<NatsConnection> => {
    if (nc !== null && !nc.isClosed()) {
      return nc;
    }

    nc = await connect({
      servers: url,
      name: "waf-controller-desired",
      maxReconnectAttempts: -1,
      reconnectTimeWait: 500,
    });
    log("info", "desired kv connected", { url, bucket: DESIRED_BUCKET });
    return nc;
  };

  const kvOf = async () => {
    const conn = await open();
    return conn.jetstream().views.kv(DESIRED_BUCKET, { history: 5 });
  };

  const store: DesiredStore = {
    async markPublished(channel) {
      await store.onPublished?.(channel);
    },
    async getModsec() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(MODSEC_KEY);

        if (entry === null) {
          return null;
        }

        const text = new TextDecoder().decode(entry.value);
        return parseManifest(JSON.parse(text) as unknown);
      } catch (err) {
        log("warn", "desired kv get failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putModsec(manifest) {
      try {
        const kv = await kvOf();
        await kv.put(MODSEC_KEY, JSON.stringify(manifest));
      } catch (err) {
        log("warn", "desired kv put failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getAuth() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(AUTH_KEY);

        if (entry === null) {
          return null;
        }

        const text = new TextDecoder().decode(entry.value);
        return parseAuthManifest(JSON.parse(text) as unknown);
      } catch (err) {
        log("warn", "desired kv get auth failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putAuth(manifest) {
      try {
        const kv = await kvOf();
        await kv.put(AUTH_KEY, JSON.stringify(manifest));
        await announce("auth", FACT_OF.auth(manifest)!, true);
      } catch (err) {
        log("warn", "desired kv put auth failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getCaptcha() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(CAPTCHA_KEY);

        if (entry === null) {
          return null;
        }

        const text = new TextDecoder().decode(entry.value);
        return parseCaptchaManifest(JSON.parse(text) as unknown);
      } catch (err) {
        log("warn", "desired kv get captcha failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putCaptcha(manifest) {
      try {
        const kv = await kvOf();
        await kv.put(CAPTCHA_KEY, JSON.stringify(manifest));
        await announce("captcha", FACT_OF.captcha(manifest)!, true);
      } catch (err) {
        log("warn", "desired kv put captcha failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getJson() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(JSON_KEY);

        if (entry === null) {
          return null;
        }

        const text = new TextDecoder().decode(entry.value);
        return parseJsonManifest(JSON.parse(text) as unknown);
      } catch (err) {
        log("warn", "desired kv get json failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putJson(manifest) {
      try {
        const kv = await kvOf();
        await kv.put(JSON_KEY, JSON.stringify(manifest));
        await announce("json", FACT_OF.json(manifest)!, true);
      } catch (err) {
        log("warn", "desired kv put json failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getAction() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(ACTION_KEY);

        if (entry === null) {
          return null;
        }

        const text = new TextDecoder().decode(entry.value);
        return parseActionManifest(JSON.parse(text) as unknown);
      } catch (err) {
        log("warn", "desired kv get action failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putAction(manifest) {
      try {
        const kv = await kvOf();
        await kv.put(ACTION_KEY, JSON.stringify(manifest));
        await announce("action", FACT_OF.action(manifest)!, true);
      } catch (err) {
        log("warn", "desired kv put action failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getCookie() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(COOKIE_KEY);

        if (entry === null) {
          return null;
        }

        const text = new TextDecoder().decode(entry.value);
        return parseCookieManifest(JSON.parse(text) as unknown);
      } catch (err) {
        log("warn", "desired kv get cookie failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putCookie(manifest) {
      try {
        const kv = await kvOf();
        await kv.put(COOKIE_KEY, JSON.stringify(manifest));
        await announce("cookie", FACT_OF.cookie(manifest)!, true);
      } catch (err) {
        log("warn", "desired kv put cookie failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getCounter() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(COUNTER_KEY);

        if (entry === null) {
          return null;
        }

        const text = new TextDecoder().decode(entry.value);
        return parseCounterManifest(JSON.parse(text) as unknown);
      } catch (err) {
        log("warn", "desired kv get counter failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putCounter(manifest) {
      try {
        const kv = await kvOf();
        await kv.put(COUNTER_KEY, JSON.stringify(manifest));
        await announce("counter", FACT_OF.counter(manifest)!, true);
      } catch (err) {
        log("warn", "desired kv put counter failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getVlai() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(VLAI_KEY);

        if (entry === null) {
          return null;
        }

        const text = new TextDecoder().decode(entry.value);
        return parseVlaiManifest(JSON.parse(text) as unknown);
      } catch (err) {
        log("warn", "desired kv get vlai failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putVlai(manifest) {
      try {
        const kv = await kvOf();
        await kv.put(VLAI_KEY, JSON.stringify(manifest));
        await announce("vlai", FACT_OF.vlai(manifest)!, true);
      } catch (err) {
        log("warn", "desired kv put vlai failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getRewrite() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(REWRITE_KEY);

        if (entry === null) {
          return null;
        }

        const text = new TextDecoder().decode(entry.value);
        return parseRewriteManifest(JSON.parse(text) as unknown);
      } catch (err) {
        log("warn", "desired kv get rewrite failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putRewrite(manifest) {
      try {
        const kv = await kvOf();
        await kv.put(REWRITE_KEY, JSON.stringify(manifest));
        await announce("rewrite", FACT_OF.rewrite(manifest)!, true);
      } catch (err) {
        log("warn", "desired kv put rewrite failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getRulesPack() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(RULES_PACK_KEY);

        if (entry === null) {
          return null;
        }

        return parsePointer(JSON.parse(new TextDecoder().decode(entry.value)));
      } catch (err) {
        log("warn", "desired kv get pack failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putRulesPack(pointer) {
      try {
        const kv = await kvOf();
        const body = JSON.stringify(pointer);
        await kv.put(RULES_PACK_KEY, body);
        const conn = await open();
        conn.publish(RULES_PACK_SUBJECT, body);
        await announce("rules", FACT_OF.rules(pointer)!, true);
      } catch (err) {
        log("warn", "desired kv put pack failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getIpPack() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(IP_PACK_KEY);

        if (entry === null) {
          return null;
        }

        return parseIpPointer(JSON.parse(new TextDecoder().decode(entry.value)));
      } catch (err) {
        log("warn", "desired kv get ip pack failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putIpPack(pointer) {
      try {
        const kv = await kvOf();
        const body = JSON.stringify(pointer);
        await kv.put(IP_PACK_KEY, body);
        const conn = await open();
        conn.publish(IP_PACK_SUBJECT, body);
        await announce("ip", FACT_OF.ip(pointer)!, true);
      } catch (err) {
        log("warn", "desired kv put ip pack failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getNginxPack() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(NGINX_PACK_KEY);

        if (entry === null) {
          return null;
        }

        return parseNginxPointer(JSON.parse(new TextDecoder().decode(entry.value)));
      } catch (err) {
        log("warn", "desired kv get nginx pack failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putNginxPack(pointer) {
      try {
        const kv = await kvOf();
        const body = JSON.stringify(pointer);
        await kv.put(NGINX_PACK_KEY, body);
        const conn = await open();
        conn.publish(NGINX_PACK_SUBJECT, body);
        await announce("nginx", FACT_OF.nginx(pointer)!, true);
      } catch (err) {
        log("warn", "desired kv put nginx pack failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getAgentConf() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(AGENT_CONF_KEY);

        if (entry === null) {
          return null;
        }

        return parseAgentConfPointer(
          JSON.parse(new TextDecoder().decode(entry.value)),
        );
      } catch (err) {
        log("warn", "desired kv get agent conf failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putAgentConf(pointer) {
      try {
        const kv = await kvOf();
        const body = JSON.stringify(pointer);
        await kv.put(AGENT_CONF_KEY, body);
        const conn = await open();
        conn.publish(AGENT_CONF_SUBJECT, body);
        await announce("agent", FACT_OF.agent(pointer)!, true);
      } catch (err) {
        log("warn", "desired kv put agent conf failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getHaproxyConf() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(HAPROXY_CONF_KEY);

        if (entry === null) {
          return null;
        }

        return parseHaproxyConfPointer(
          JSON.parse(new TextDecoder().decode(entry.value)),
        );
      } catch (err) {
        log("warn", "desired kv get haproxy conf failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putHaproxyConf(pointer) {
      try {
        const kv = await kvOf();
        const body = JSON.stringify(pointer);
        await kv.put(HAPROXY_CONF_KEY, body);
        const conn = await open();
        conn.publish(HAPROXY_CONF_SUBJECT, body);
        await announce("haproxy", FACT_OF.haproxy(pointer)!, true);
      } catch (err) {
        log("warn", "desired kv put haproxy conf failed", { error: String(err) });
        throw unavailable();
      }
    },
    async getLogLevels() {
      try {
        const kv = await kvOf();
        const entry = await kv.get(LOG_LEVELS_KEY);

        if (entry === null || entry.operation !== "PUT") {
          return null;
        }

        return parseLogLevelsDoc(JSON.parse(new TextDecoder().decode(entry.value)));
      } catch (err) {
        log("warn", "desired kv get log levels failed", { error: String(err) });
        throw unavailable();
      }
    },
    async putLogLevels(doc) {
      try {
        const kv = await kvOf();
        await kv.put(LOG_LEVELS_KEY, JSON.stringify(doc));
      } catch (err) {
        log("warn", "desired kv put log levels failed", { error: String(err) });
        throw unavailable();
      }
    },
    async watchLogLevels(onChange) {
      const kv = await kvOf();
      const iter = await kv.watch({ key: LOG_LEVELS_KEY });

      void (async () => {
        for await (const entry of iter) {
          if (entry.operation !== "PUT") {
            onChange(null);
            continue;
          }

          let doc: LogLevelsDoc | null;
          try {
            doc = parseLogLevelsDoc(JSON.parse(new TextDecoder().decode(entry.value)));
          } catch {
            // Мусор в ключе -- порог остаётся прежним, как у Go-сервисов.
            continue;
          }

          if (doc !== null) {
            onChange(doc);
          }
        }
      })();

      return () => iter.stop();
    },
    close() {
      stopped = true;
      void nc?.drain();
    },
  };

  /**
   * Стартовая сверка: что уже лежит в бакете и что лежало до нас.
   *
   * История нужна не ради показа, а ради одного различия -- прежнее поколение
   * контроллера (идёт дренаж, ждать) против конфига, которого он не издавал
   * (идти смотреть на узел). Глубина -- `history` бакета; поколения старше
   * этого окна на живом узле означают, что дренаж давно не дренаж, и звать их
   * своими уже неправильно.
   */
  const hydrate = async (): Promise<void> => {
    const kv = await kvOf();

    for (const spec of Object.values(CHANNELS)) {
      const factOf = FACT_OF[spec.id];
      const seen: string[] = [];

      try {
        for await (const entry of await kv.history({ key: spec.key })) {
          if (entry.operation !== "PUT") {
            continue;
          }
          try {
            const fact = factOf(
              JSON.parse(new TextDecoder().decode(entry.value)) as unknown,
            );
            if (fact !== null) {
              seen.push(fact.hash);
            }
          } catch {
            // Мусор в истории -- не повод не подняться.
          }
        }
      } catch {
        // Ключа нет вовсе: канал ни разу не рассылали.
        continue;
      }

      if (seen.length === 0) {
        continue;
      }

      dispatch(convergenceLedgerSeen({ channel: spec.id, hashes: seen }));

      try {
        const entry = await kv.get(spec.key);
        const fact =
          entry === null
            ? null
            : factOf(JSON.parse(new TextDecoder().decode(entry.value)) as unknown);
        if (fact !== null) {
          void announce(spec.id, fact, false);
        }
      } catch {
        // Текущее значение не прочиталось -- останется журнал.
      }
    }
  };

  void hydrate().catch(() => {
    if (!stopped) {
      log("warn", "desired kv hydrate skipped");
    }
  });

  return store;
}

function unavailable(): { status: number; error: string } {
  return { status: 503, error: "kv_unavailable" };
}

function unavailableStore(): DesiredStore {
  return {
    async markPublished() {},
    async getModsec() {
      throw unavailable();
    },
    async putModsec() {
      throw unavailable();
    },
    async getAuth() {
      throw unavailable();
    },
    async putAuth() {
      throw unavailable();
    },
    async getCaptcha() {
      throw unavailable();
    },
    async putCaptcha() {
      throw unavailable();
    },
    async getJson() {
      throw unavailable();
    },
    async putJson() {
      throw unavailable();
    },
    async getAction() {
      throw unavailable();
    },
    async putAction() {
      throw unavailable();
    },
    async getCookie() {
      throw unavailable();
    },
    async putCookie() {
      throw unavailable();
    },
    async getCounter() {
      throw unavailable();
    },
    async putCounter() {
      throw unavailable();
    },
    async getVlai() {
      throw unavailable();
    },
    async putVlai() {
      throw unavailable();
    },
    async getRewrite() {
      throw unavailable();
    },
    async putRewrite() {
      throw unavailable();
    },
    async getRulesPack() {
      throw unavailable();
    },
    async putRulesPack() {
      throw unavailable();
    },
    async getIpPack() {
      throw unavailable();
    },
    async putIpPack() {
      throw unavailable();
    },
    async getNginxPack() {
      throw unavailable();
    },
    async putNginxPack() {
      throw unavailable();
    },
    async getAgentConf() {
      throw unavailable();
    },
    async putAgentConf() {
      throw unavailable();
    },
    async getHaproxyConf() {
      throw unavailable();
    },
    async putHaproxyConf() {
      throw unavailable();
    },
    async getLogLevels() {
      throw unavailable();
    },
    async putLogLevels() {
      throw unavailable();
    },
    async watchLogLevels() {
      throw unavailable();
    },
    close() {},
  };
}
