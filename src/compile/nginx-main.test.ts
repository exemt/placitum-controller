/**
 * Скелет файла: параметры как в `http_spaces.nginx_main`.
 * `events {}` печатается всегда -- nginx без него не стартует.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { compileMain } from "./nginx-main.ts";

test("пустой main -- только events {}", () => {
  assert.equal(
    compileMain({}).text,
    `
events {
}

`,
  );
});

test("стендовый скелет: load_module, воркеры, error_log, events", () => {
  const expected = `load_module modules/ngx_http_waf_module.so;

worker_processes 2;
error_log /var/log/nginx/error.log info;
error_log syslog:server=unix:/var/run/waf/log.sock,tag=nginx,nohostname info;

events {
    worker_connections 1024;
}

`;
  assert.equal(
    compileMain({
      loadModules: ["modules/ngx_http_waf_module.so"],
      workerProcesses: 2,
      errorLog: "/var/log/nginx/error.log info",
      events: { workerConnections: 1024 },
    }).text,
    expected,
  );
});

test("worker_processes auto и events use / multi_accept", () => {
  const expected = `worker_processes auto;

events {
    worker_connections 512;
    use epoll;
    multi_accept on;
}

`;
  assert.equal(
    compileMain({
      workerProcesses: "auto",
      events: { workerConnections: 512, use: "epoll", multiAccept: true },
    }).text,
    expected,
  );
});

test("user, pid, rlimit, include до events", () => {
  const expected = `user nginx;
worker_rlimit_nofile 65535;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
}

`;
  assert.equal(
    compileMain({
      user: "nginx",
      workerRlimitNofile: 65535,
      pid: "/run/nginx.pid",
      includes: ["/etc/nginx/modules-enabled/*.conf"],
    }).text,
    expected,
  );
});

test("error_log: копия в сокет агента; без уровня у файла -- error, как у nginx", () => {
  assert.match(
    compileMain({ errorLog: "/var/log/nginx/error.log" }).text,
    /^error_log \/var\/log\/nginx\/error\.log;\nerror_log syslog:server=unix:\/var\/run\/waf\/log\.sock,tag=nginx,nohostname error;$/m,
  );
});

test("error_log: errorLogShip=false -- только файл", () => {
  const text = compileMain({
    errorLog: "/var/log/nginx/error.log info",
    errorLogShip: false,
  }).text;
  assert.doesNotMatch(text, /syslog:/);
});

test("error_log: файл уже сокет агента -- второй копии нет", () => {
  const text = compileMain({
    errorLog: "syslog:server=unix:/var/run/waf/log.sock,tag=nginx,nohostname warn",
  }).text;
  assert.equal(text.match(/error_log/g)?.length, 1);
});

test("error_log не задан -- копии нет: одна строка про сокет отменила бы встроенный файл", () => {
  assert.doesNotMatch(compileMain({ errorLogShip: true }).text, /error_log/);
});
