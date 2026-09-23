export const HAPROXY_BALANCE = ["roundrobin", "leastconn", "source"] as const;

export type HaproxyBalance = (typeof HAPROXY_BALANCE)[number];

export const HAPROXY_MODES = ["http", "tcp"] as const;

export type HaproxyMode = (typeof HAPROXY_MODES)[number];

export interface HaproxyServer {
  name: string;
  host: string;
}

// Where the balancer listens. The entry points themselves come from the ports of the space: every
// port the nodes serve to the network gets one. addresses: the addresses of the machine haproxy
// binds on; none means every address. ports: the entry port in front of a node port when the two
// differ, such as 80 in front of 8080 for haproxy on the machine; a node port not listed keeps its
// number.
export interface HaproxyEntry {
  addresses?: string[];
  ports?: Record<string, number>;
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
  entry?: HaproxyEntry;
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
