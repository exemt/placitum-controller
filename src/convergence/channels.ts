/**
 * Реестр каналов раскатки.
 *
 * Канал -- единица сходимости: источник в Postgres, компилятор, ключ KV,
 * потребитель на той стороне и отпечаток, который тот докладывает в пульсе.
 * Каналы независимы по ревизии и откату намеренно: правка списка адресов не
 * должна вести к `reload` nginx, а рассылка правил -- к перечитыванию
 * настроек архива.
 *
 * Спека -- docs/config-convergence.md.
 */

import { AGENT_CONF_KEY } from "../compile/agent-conf.ts";
import { HAPROXY_CONF_KEY } from "../compile/haproxy.ts";
import { ACTION_KEY, ACTION_PROCESS } from "../action-manifest.ts";
import { COOKIE_KEY, COOKIE_PROCESS } from "../cookie-manifest.ts";
import { AUTH_KEY, AUTH_PROCESS } from "../auth-manifest.ts";
import { CAPTCHA_KEY, CAPTCHA_PROCESS } from "../captcha-manifest.ts";
import { COUNTER_KEY, COUNTER_PROCESS } from "../counter-manifest.ts";
import { IP_PACK_KEY, IP_PROCESS } from "../compile/ip-pack.ts";
import { JSON_KEY, JSON_PROCESS } from "../json-manifest.ts";
import { NGINX_PACK_KEY } from "../compile/nginx-pack.ts";
import { RULES_PACK_KEY } from "../compile/pointer.ts";
import { MODSEC_PROCESS } from "../rules-manifest.ts";
import { VLAI_KEY, VLAI_PROCESS } from "../vlai-manifest.ts";
import { REWRITE_KEY, REWRITE_PROCESS } from "../rewrite-manifest.ts";

export const CHANNEL_IDS = [
  "nginx",
  "agent",
  "haproxy",
  "rules",
  "ip",
  "auth",
  "captcha",
  "json",
  "action",
  "cookie",
  "counter",
  "vlai",
  "rewrite",
] as const;

export type ChannelId = (typeof CHANNEL_IDS)[number];

/**
 * Кого канал обязан догнать. Агент читает два ключа, но по-разному: поколение
 * nginx применяет только нода с `manage=on`, а настройку агента -- все, включая
 * сайдкары без бинаря nginx. Инспектор читает свой ключ и один.
 */
export type ConsumerSelector =
  | { kind: "agent"; nginx: boolean }
  /**
   * Инспектор по имени процесса -- тому же слову, что стоит в каталоге
   * инспекторов: по нему сборщик поколения берёт настройки процесса
   * (уровень журнала), и по нему же пульс сходится с каналом.
   */
  | { kind: "inspector"; name: string }
  /**
   * Сервис контура по имени пульса (`kind=service`). Так канал haproxy
   * находит свой агент: тот не нода nginx и не инспектор, а служба рядом с
   * балансировщиком.
   */
  | { kind: "service"; name: string };

export interface ChannelSpec {
  id: ChannelId;
  /** Ключ в бакете `WAF_DESIRED`. */
  key: string;
  consumer: ConsumerSelector;
  /**
   * Есть ли на той стороне читатель этого ключа. Ложь -- канал издаёт
   * манифест, которого никто не забирает: это не расхождение, и показывать
   * его как расхождение значит предлагать лечить кнопкой то, что кнопкой не
   * лечится.
   */
  delivered: boolean;
  /**
   * Имя инспектора, чей тег `profile=` в шаблоне nginx называет профили этого
   * канала. Нужно межканальной проверке: шаблон, сославшийся на неизданный
   * профиль, кладёт маршрут в `deny` при двух зелёных каналах по отдельности.
   */
  inspector?: string;
  /** Путь `send` относительно `/api/<scope>`. */
  send: string;
  /** Страница панели, на которую ведёт предупреждение. */
  page: string;
}

export const CHANNELS: Record<ChannelId, ChannelSpec> = {
  nginx: {
    id: "nginx",
    key: NGINX_PACK_KEY,
    consumer: { kind: "agent", nginx: true },
    delivered: true,
    send: "config/send",
    page: "/config",
  },
  agent: {
    id: "agent",
    key: AGENT_CONF_KEY,
    consumer: { kind: "agent", nginx: false },
    delivered: true,
    send: "agent/send",
    page: "/config/agent",
  },
  /*
   * Балансировщик перед краями. Файл собирает контроллер и кладёт в значение
   * ключа целиком; применяет агент haproxy -- `haproxy -c` и SIGUSR2 мастеру.
   * До первой рассылки нода живёт на bootstrap-конфиге образа, и канал честно
   * показывает расхождение.
   */
  haproxy: {
    id: "haproxy",
    key: HAPROXY_CONF_KEY,
    consumer: { kind: "service", name: "haproxy" },
    delivered: true,
    send: "haproxy/send",
    page: "/config/haproxy",
  },
  rules: {
    id: "rules",
    key: RULES_PACK_KEY,
    consumer: { kind: "inspector", name: MODSEC_PROCESS },
    delivered: true,
    inspector: MODSEC_PROCESS,
    send: "rules/send",
    page: "/rules/profiles",
  },
  /*
   * Инспектор адреса читает поколение из KV и подменяет дерево политики
   * атомарно; в пульсе едет хеш поколения поверх локального отпечатка. До
   * первой рассылки процесс работает на дереве из образа -- тогда в кадре
   * остаётся отпечаток, и канал честно показывает расхождение.
   */
  ip: {
    id: "ip",
    key: IP_PACK_KEY,
    consumer: { kind: "inspector", name: IP_PROCESS },
    delivered: true,
    inspector: IP_PROCESS,
    send: "ip-profiles/send",
    page: "/ip/profiles",
  },
  auth: {
    id: "auth",
    key: AUTH_KEY,
    consumer: { kind: "inspector", name: AUTH_PROCESS },
    delivered: true,
    inspector: AUTH_PROCESS,
    send: "auth/send",
    page: "/auth",
  },
  captcha: {
    id: "captcha",
    key: CAPTCHA_KEY,
    consumer: { kind: "inspector", name: CAPTCHA_PROCESS },
    delivered: true,
    inspector: CAPTCHA_PROCESS,
    send: "captcha/send",
    page: "/captcha",
  },
  json: {
    id: "json",
    key: JSON_KEY,
    consumer: { kind: "inspector", name: JSON_PROCESS },
    delivered: true,
    inspector: JSON_PROCESS,
    send: "json/send",
    page: "/json",
  },
  action: {
    id: "action",
    key: ACTION_KEY,
    consumer: { kind: "inspector", name: ACTION_PROCESS },
    delivered: true,
    inspector: ACTION_PROCESS,
    send: "action/send",
    page: "/actions",
  },
  /*
   * Кука: инспектор выдаёт и снимает Set-Cookie и пишет её значение в живые
   * наборы. Профиль едет ему целиком -- объявления кук вместе с правилами; в
   * конфигурации nginx от канала не остаётся ничего, кроме самой декларации.
   */
  cookie: {
    id: "cookie",
    key: COOKIE_KEY,
    consumer: { kind: "inspector", name: COOKIE_PROCESS },
    delivered: true,
    inspector: COOKIE_PROCESS,
    send: "cookie/send",
    page: "/cookie",
  },
  counter: {
    id: "counter",
    key: COUNTER_KEY,
    consumer: { kind: "inspector", name: COUNTER_PROCESS },
    delivered: true,
    inspector: COUNTER_PROCESS,
    send: "counter/send",
    page: "/counter",
  },
  /*
   * Поколение vlai живёт только в памяти процесса: до первой рассылки
   * инспектор работает на встроенном умолчании (enforce, правила приёма из
   * окружения), и канал честно показывает расхождение.
   */
  vlai: {
    id: "vlai",
    key: VLAI_KEY,
    consumer: { kind: "inspector", name: VLAI_PROCESS },
    delivered: true,
    inspector: VLAI_PROCESS,
    send: "vlai/send",
    page: "/vlai",
  },
  /*
   * Модификатор ответов. Профиль едет инспектору целиком, с выражениями:
   * исполняет их Go-процесс, до nginx они не доезжают вовсе -- в конфигурации
   * от этого канала не остаётся ничего, кроме самой декларации.
   */
  rewrite: {
    id: "rewrite",
    key: REWRITE_KEY,
    consumer: { kind: "inspector", name: REWRITE_PROCESS },
    delivered: true,
    inspector: REWRITE_PROCESS,
    send: "rewrite/send",
    page: "/rewrite",
  },
};

export const CHANNEL_LIST: readonly ChannelSpec[] = CHANNEL_IDS.map(
  (id) => CHANNELS[id],
);

/**
 * Канал, который обязан применить инспектор с этим именем. `challenge`
 * конфигурацию с шины не возит вовсе -- у него нет канала, и это его
 * нормальное состояние, а не расхождение.
 */
export function channelOfInspector(name: string): ChannelId | null {
  for (const spec of CHANNEL_LIST) {
    if (spec.consumer.kind === "inspector" && spec.consumer.name === name) {
      return spec.id;
    }
  }
  return null;
}

/** Канал по имени инспектора, чей `profile=` стоит в шаблоне nginx. */
export function channelOfProfileTag(inspector: string): ChannelId | null {
  for (const spec of CHANNEL_LIST) {
    if (spec.inspector === inspector) {
      return spec.id;
    }
  }
  return null;
}

export function isChannelId(value: string): value is ChannelId {
  return (CHANNEL_IDS as readonly string[]).includes(value);
}
