/**
 * Настройки балансировщика контура.
 *
 * Это не документ nginx и не настройка агента-архиватора: контроллер собирает
 * из этого документа целый haproxy.cfg, а агент haproxy проверяет его
 * `haproxy -c` и перечитывает мастером. Здесь только то, что печатается в
 * конфиг; бутстрап агента (шина, пути, pidfile) остаётся окружением ноды.
 *
 * Пустой документ -- не «ничего не делать», а поставочное поведение стенда:
 * каждый ключ имеет умолчание, и компилятор печатает полный конфиг всегда.
 */

/** Алгоритмы балансировки, которые печатает компилятор. */
export const HAPROXY_BALANCE = ["roundrobin", "leastconn", "source"] as const;

export type HaproxyBalance = (typeof HAPROXY_BALANCE)[number];

/** Строка `server` backend'а: имя, адрес и порт. */
export interface HaproxyServer {
  name: string;
  host: string;
  port?: number;
}

export interface HaproxySettings {
  process?: {
    maxconn?: number;
    /** tune.bufsize: стенд гоняет query до 256k, умолчание 16k режет их 400. */
    bufsize?: number;
  };
  timeouts?: {
    connectMs?: number;
    clientMs?: number;
    serverMs?: number;
    keepaliveMs?: number;
    /** Срок туннеля после апгрейда: websocket живёт дольше timeout server. */
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
  /**
   * Резолвер Docker DNS: после recreate ноды старый IP иначе остаётся DOWN
   * навсегда. Вне compose выключается -- libc остаётся через init-addr.
   */
  dockerDns?: boolean;
}
