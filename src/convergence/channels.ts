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

export type ConsumerSelector =
  | { kind: "agent"; nginx: boolean }
  | { kind: "inspector"; name: string }
  | { kind: "service"; name: string };

export interface ChannelSpec {
  id: ChannelId;
  key: string;
  consumer: ConsumerSelector;
  delivered: boolean;
  inspector?: string;
  send: string;
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
  vlai: {
    id: "vlai",
    key: VLAI_KEY,
    consumer: { kind: "inspector", name: VLAI_PROCESS },
    delivered: true,
    inspector: VLAI_PROCESS,
    send: "vlai/send",
    page: "/vlai",
  },
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

export function channelOfInspector(name: string): ChannelId | null {
  for (const spec of CHANNEL_LIST) {
    if (spec.consumer.kind === "inspector" && spec.consumer.name === name) {
      return spec.id;
    }
  }
  return null;
}

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
