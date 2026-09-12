/**
 * Скелет файла: всё, что стоит до `http {}`. Агент пишет текст компилятора
 * целиком в nginx.conf, поэтому без `events {}` мастер не стартует.
 */

import { AGENT_LOG_SOCK, agentSyslog, parseErrorLogTail } from "../model/log.ts";
import type { NginxMainSettings } from "../model/settings.ts";
import { alignColumns } from "./nginx-align.ts";
import type { NginxCompileResult } from "./nginx-emit.ts";

export function compileMain(main: NginxMainSettings | undefined = {}): NginxCompileResult {
  const m = main ?? {};
  const lines: string[] = [];

  for (const mod of m.loadModules ?? []) {
    lines.push(`load_module ${mod};`);
  }
  if ((m.loadModules ?? []).length > 0) {
    lines.push("");
  }

  if (m.user) lines.push(`user ${m.user};`);
  if (m.workerProcesses !== undefined) {
    lines.push(`worker_processes ${m.workerProcesses};`);
  }
  if (typeof m.workerRlimitNofile === "number") {
    lines.push(`worker_rlimit_nofile ${m.workerRlimitNofile};`);
  }
  if (m.pid) lines.push(`pid ${m.pid};`);
  if (m.errorLog) lines.push(`error_log ${m.errorLog};`);
  const ship = mainLogShip(m);
  if (ship !== null) lines.push(ship);
  for (const inc of m.includes ?? []) {
    lines.push(`include ${inc};`);
  }

  lines.push("");
  lines.push("events {");
  const ev = m.events ?? {};
  if (typeof ev.workerConnections === "number") {
    lines.push(`    worker_connections ${ev.workerConnections};`);
  }
  if (ev.use) lines.push(`    use ${ev.use};`);
  if (ev.multiAccept !== undefined) {
    lines.push(`    multi_accept ${ev.multiAccept ? "on" : "off"};`);
  }
  lines.push("}");
  lines.push("");

  return { text: alignColumns(lines).join("\n") + "\n", storeRefs: [] };
}

/*
 * Копия главного error_log в сокет агента. Главный журнал -- это всё, что
 * модуль пишет вне запроса (подключение к шине, подписки наборов, состояние
 * предохранителя), и то, что пишет сам мастер (reload, упавший воркер): без
 * копии оно оставалось только в docker, и в разделе «Журналы» его не было.
 *
 * Копия, а не перенос: строка файла остаётся как есть, nginx держит оба
 * приёмника. Поэтому копия появляется только рядом с заданным файлом -- без
 * error_log в главном контексте nginx пишет в свой встроенный файл, и
 * единственная строка про сокет его бы отменила.
 *
 * Уровень -- тот же, что у файла: порог главного журнала оператор ставит
 * один. Файл уже сам сокет агента -- копия не нужна.
 */
function mainLogShip(m: NginxMainSettings): string | null {
  if (m.errorLogShip === false || !m.errorLog) {
    return null;
  }

  const file = parseErrorLogTail(m.errorLog);
  if (file === undefined || file.path.startsWith(`syslog:server=unix:${AGENT_LOG_SOCK}`)) {
    return null;
  }

  return `error_log ${agentSyslog()} ${file.level ?? "error"};`;
}
