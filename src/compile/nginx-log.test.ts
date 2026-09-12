/**
 * Логи блока: `access_log` и `error_log` на всех трёх уровнях.
 *
 * Схема теста та же, что у соседей: ожидаемый текст -> документ -> компилятор.
 * Проверяется и старая форма хранения (строка-хвост в jsonb): база при чтении
 * не валидируется, и конфиг, лежавший там до появления объекта, обязан
 * печататься так же, как печатался.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Location } from "../model/location.ts";
import type { Server } from "../model/server.ts";
import { accessLogTails, errorLogTail, parseAccessLogTail } from "../model/log.ts";
import { flattenColumns } from "./nginx-align.ts";
import { compileHttp as compileHttpColumns } from "./nginx-http.ts";
import { compileLocation as compileLocationColumns } from "./nginx-location.ts";
import { compileServer as compileServerColumns } from "./nginx-server.ts";

/*
  Колонки печати -- забота nginx-align.ts, и проверяет их nginx-align.test.ts.
  Здесь текст читают по директивам, поэтому столбик схлопывается обратно в один
  пробел: иначе каждая проверка зависела бы от длины соседнего имени в том же
  блоке -- новое имя в наборе роняло бы те, что про него ничего не знают.
*/
const compileHttp: typeof compileHttpColumns = (...args) => {
  const out = compileHttpColumns(...args);
  return { ...out, text: flattenColumns(out.text) };
};
const compileLocation: typeof compileLocationColumns = (...args) => {
  const out = compileLocationColumns(...args);
  return { ...out, text: flattenColumns(out.text) };
};
const compileServer: typeof compileServerColumns = (...args) => {
  const out = compileServerColumns(...args);
  return { ...out, text: flattenColumns(out.text) };
};


const SPACE = "00000000-0000-4000-8000-000000000001";
const SERVER_ID = "00000000-0000-4000-8000-000000000010";

function server(nginx: Server["nginx"]): Server {
  return {
    id: SERVER_ID,
    httpSpaceId: SPACE,
    name: "edge",
    serverNames: ["example.com"],
    enabled: true,
    nginx,
    waf: {},
    raw: false,
    rawNginx: "",
  };
}

function location(nginx: Location["nginx"]): Location {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    serverId: SERVER_ID,
    match: "exact",
    path: "/healthz",
    position: 0,
    enabled: true,
    handler: "static",
    protocol: "http",
    nginx,
    waf: {},
    raw: false,
    rawNginx: "",
    builtin: false,
  };
}

test("http: access_log и error_log объектами", () => {
  const text = compileHttp({
    nginx: {
      accessLog: [{ path: "/var/log/nginx/access.log", format: "main", buffer: "32k", flush: "5s" }],
      errorLog: { path: "/var/log/nginx/error.log", level: "info" },
    },
  }).text;

  assert.equal(
    text,
    `http {
    absolute_redirect off;
    access_log /var/log/nginx/access.log main buffer=32k flush=5s;
    error_log /var/log/nginx/error.log info;
}
`,
  );
});

test("http: две строки access_log -- два приёмника", () => {
  const text = compileHttp({
    nginx: {
      accessLog: [
        { path: "/var/log/nginx/access.log", format: "main" },
        { path: "/var/log/nginx/slow.log", format: "main", condition: "$slow" },
      ],
    },
  }).text;

  assert.match(text, /access_log \/var\/log\/nginx\/access\.log main;/);
  assert.match(text, /access_log \/var\/log\/nginx\/slow\.log main if=\$slow;/);
});

/*
 * Приёмник может быть не файлом: агент собирает логи ноды с unix-сокета, и
 * форма `syslog:server=unix:…` -- обычное значение той же директивы. Для
 * компилятора это один токен без пробелов, поэтому он обязан доехать до файла
 * целиком, вместе с тегом (он же колонка `service` в waf.log) и уровнем.
 */
test("http: приёмник -- сокет агента, а не файл", () => {
  const sock = "syslog:server=unix:/var/run/waf/log.sock,tag=nginx,nohostname";
  const text = compileHttp({
    nginx: {
      accessLog: [{ path: sock }],
      errorLog: { path: sock, level: "warn" },
    },
  }).text;

  assert.equal(
    text,
    `http {
    absolute_redirect off;
    access_log ${sock};
    error_log ${sock} warn;
}
`,
  );
});

// Та же строка, введённая одним хвостом: разбор не должен принять запятые за
// границу параметров -- у syslog они внутри одного токена.
test("хвост с syslog разбирается одним путём", () => {
  const parsed = parseAccessLogTail(
    "syslog:server=unix:/var/run/waf/log.sock,tag=nginx,nohostname main",
  );

  assert.deepEqual(parsed, {
    path: "syslog:server=unix:/var/run/waf/log.sock,tag=nginx,nohostname",
    format: "main",
  });
});

test("http: log_format печатается раньше access_log, который на него ссылается", () => {
  const text = compileHttp({
    nginx: { accessLog: [{ path: "/var/log/nginx/access.log", format: "main" }] },
    logFormats: [
      {
        id: "f1",
        httpSpaceId: SPACE,
        name: "main",
        kind: "nginx",
        fields: [],
        format: "$remote_addr $status rt=$request_time",
      },
    ],
  }).text;

  const formatAt = text.indexOf("log_format main");
  const accessAt = text.indexOf("access_log /var/log/nginx/access.log main;");
  assert.ok(formatAt >= 0 && accessAt >= 0);
  assert.ok(formatAt < accessAt, "log_format обязан стоять до access_log");
  assert.match(text, /log_format main '\$remote_addr \$status rt=\$request_time';/);
  // waf_log_format снят: модуль директиву не знает, печатать её -- ронять nginx -t.
  assert.doesNotMatch(text, /waf_log_format/);
});

test("http: одинарная кавычка в теле формата -- строка не печатается", () => {
  const text = compileHttp({
    logFormats: [
      {
        id: "f1",
        httpSpaceId: SPACE,
        name: "broken",
        kind: "nginx",
        fields: [],
        format: "it's broken",
      },
    ],
  }).text;

  assert.doesNotMatch(text, /log_format broken/);
});

test("server: свой лог хоста", () => {
  const text = compileServer({
    server: server({
      accessLog: [{ path: "/var/log/nginx/example.access.log", format: "main" }],
      errorLog: { path: "/var/log/nginx/example.error.log", level: "warn" },
    }),
  }).text;

  assert.equal(
    text,
    `server {
    server_name example.com;
    access_log /var/log/nginx/example.access.log main;
    error_log /var/log/nginx/example.error.log warn;
}
`,
  );
});

test("location: access_log off глушит унаследованный", () => {
  const text = compileLocation({ location: location({ accessLog: "off" }) }).text;

  assert.equal(
    text,
    `location = /healthz {
    waf_route_id 00000000-0000-4000-8000-000000000020;
    access_log off;
}
`,
  );
});

test("location: пустой массив -- это не off, директивы нет", () => {
  const text = compileLocation({ location: location({ accessLog: [] }) }).text;

  assert.equal(
    text,
    "location = /healthz {\n    waf_route_id 00000000-0000-4000-8000-000000000020;\n}\n",
  );
});

test("старая форма хранения: строка-хвост печатается как раньше", () => {
  const text = compileHttp({
    nginx: {
      // Так это лежит в jsonb со времён, когда поле было строкой.
      accessLog: "/var/log/nginx/access.log" as never,
      errorLog: "/var/log/nginx/error.log info" as never,
    },
  }).text;

  assert.equal(
    text,
    `http {
    absolute_redirect off;
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log info;
}
`,
  );
});

test("нормализаторы: хвост -> объект -> тот же хвост", () => {
  const tail = "/var/log/nginx/a.log main buffer=32k gzip=5 flush=5s if=$loggable";
  const parsed = parseAccessLogTail(tail);
  assert.notEqual(parsed, undefined);
  assert.notEqual(parsed, "off");
  assert.deepEqual(accessLogTails([parsed]), [tail]);
  assert.equal(errorLogTail({ path: "/e.log" }), "/e.log");
  assert.equal(errorLogTail({ path: "/e.log", level: "crit" }), "/e.log crit");
  assert.deepEqual(accessLogTails("off"), ["off"]);
  assert.deepEqual(accessLogTails(undefined), []);
});
