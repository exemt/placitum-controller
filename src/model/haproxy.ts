export const HAPROXY_BALANCE = ["roundrobin", "leastconn", "source"] as const;

export type HaproxyBalance = (typeof HAPROXY_BALANCE)[number];

export interface HaproxyServer {
  name: string;
  host: string;
  port?: number;
}

export interface HaproxySettings {
  process?: {
    maxconn?: number;
    bufsize?: number;
  };
  timeouts?: {
    connectMs?: number;
    clientMs?: number;
    serverMs?: number;
    keepaliveMs?: number;
    tunnelMs?: number;
  };
  frontend?: {
    port?: number;
  };
  backend?: {
    balance?: HaproxyBalance;
    check?: {
      path?: string;
      status?: number;
      interMs?: number;
    };
    servers?: HaproxyServer[];
  };
  stats?: {
    enabled?: boolean;
    port?: number;
  };
  dockerDns?: boolean;
}
