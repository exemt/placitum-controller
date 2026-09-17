export const HAPROXY_BALANCE = ["roundrobin", "leastconn", "source"] as const;

export type HaproxyBalance = (typeof HAPROXY_BALANCE)[number];

export const HAPROXY_MODES = ["http", "tcp"] as const;

export type HaproxyMode = (typeof HAPROXY_MODES)[number];

// One entry port with its own backend over the shared servers. With sendProxy a tcp frontend
// passes connections on with PROXY protocol v2, and the nodes see the real client address.
export interface HaproxyFrontend {
  name: string;
  port: number;
  mode: HaproxyMode;
  serverPort?: number;
  sendProxy?: boolean;
}

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
  frontends?: HaproxyFrontend[];
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
