/*
 * Сид наборов правил из controller/data/crs-src: файлы CRS телами в базу.
 *
 * Пишет в архивную миграцию 012 -- ту, с которой поставка 1.0 была срезана.
 * На пустой том она больше не катится: CRS приезжает готовым в 02-shipped.sql.
 * Поэтому обновление CRS -- это не перегенерация файла, а одно из двух:
 * новая миграция поверх поставки (`schema/migrations/1NN_...`) либо пересборка
 * поставки целиком (`schema/build/baseline.mjs`), если режется новая версия.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RULE_SET_SEED as SETS } from "./rule-set-seed.ts";

const here = dirname(fileURLToPath(import.meta.url));
const crsDir = join(here, "../../data/crs-src");
const outPath = join(here, "../../schema/migrations/012_rule_profiles.sql");

const CRS: { id: string; name: string; description: string; file: string }[] = [
  {
    id: "a0000000-0000-4000-8000-000000000010",
    name: "crs-934",
    description: "CRS generic + SSRF",
    file: "01-REQUEST-934-APPLICATION-ATTACK-GENERIC-2.conf",
  },
  {
    id: "a0000000-0000-4000-8000-000000000011",
    name: "crs-941",
    description: "CRS XSS",
    file: "02-REQUEST-941-APPLICATION-ATTACK-XSS-2.conf",
  },
  {
    id: "a0000000-0000-4000-8000-000000000012",
    name: "crs-942",
    description: "CRS SQLi",
    file: "03-REQUEST-942-APPLICATION-ATTACK-SQLI.conf",
  },
  {
    id: "a0000000-0000-4000-8000-000000000013",
    name: "crs-943",
    description: "CRS session",
    file: "04-REQUEST-943-APPLICATION-ATTACK-SESSION-FIXATION.conf",
  },
  {
    id: "a0000000-0000-4000-8000-000000000014",
    name: "crs-944",
    description: "CRS Java",
    file: "05-REQUEST-944-APPLICATION-ATTACK-JAVA.conf",
  },
  {
    id: "a0000000-0000-4000-8000-000000000015",
    name: "crs-949",
    description: "CRS blocking",
    file: "06-REQUEST-949-BLOCKING-EVALUATION.conf",
  },
];

const DATA: { id: string; name: string; description: string }[] = [
  {
    id: "a0000000-0000-4000-8000-000000000016",
    name: "ssrf.data",
    description: "Словарь SSRF для @pmFromFile",
  },
  {
    id: "a0000000-0000-4000-8000-000000000017",
    name: "ssrf-no-scheme.data",
    description: "SSRF без схемы",
  },
  {
    id: "a0000000-0000-4000-8000-000000000018",
    name: "java-classes.data",
    description: "Классы Java RCE",
  },
];

const LOCAL: { id: string; name: string; description: string; text: string }[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    name: "engine",
    description: "Движок",
    text: `Include @coraza.conf-recommended
SecRuleEngine DetectionOnly
SecAuditEngine Off
SecAuditLog /dev/null
SecDebugLogLevel 0
SecResponseBodyAccess Off
`,
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    name: "engine-allow",
    description: "Движок выключен",
    text: `SecRuleEngine Off
`,
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    name: "engine-deny",
    description: "Движок блокирует сам",
    text: `SecRuleEngine On
SecAuditEngine Off
SecAuditLog /dev/null
SecDebugLogLevel 0
SecResponseBodyAccess Off
`,
  },
  {
    id: "a0000000-0000-4000-8000-000000000004",
    name: "setup-pl1",
    description: "CRS setup, паранойя 1",
    text: `Include @crs-setup.conf.example
SecAction "id:900000,phase:1,nolog,pass,t:none,setvar:tx.blocking_paranoia_level=1"
SecAction "id:900110,phase:1,nolog,pass,t:none,setvar:tx.inbound_anomaly_score_threshold=5"
`,
  },
  {
    id: "a0000000-0000-4000-8000-000000000005",
    name: "setup-pl2",
    description: "CRS setup, паранойя 2",
    text: `Include @crs-setup.conf.example
SecAction "id:900000,phase:1,nolog,pass,t:none,setvar:tx.blocking_paranoia_level=2"
SecAction "id:900110,phase:1,nolog,pass,t:none,setvar:tx.inbound_anomaly_score_threshold=5"
`,
  },
  {
    id: "a0000000-0000-4000-8000-000000000006",
    name: "crs-init",
    description: "CRS 901 + сканеры + LFI",
    text: `Include @owasp_crs/REQUEST-901-INITIALIZATION.conf
Include @owasp_crs/REQUEST-913-SCANNER-DETECTION.conf
Include @owasp_crs/REQUEST-930-APPLICATION-ATTACK-LFI.conf
`,
  },
  {
    id: "a0000000-0000-4000-8000-000000000007",
    name: "crs-init-api",
    description: "CRS 901 для API",
    text: `Include @owasp_crs/REQUEST-901-INITIALIZATION.conf
`,
  },
  {
    id: "a0000000-0000-4000-8000-000000000008",
    name: "extra-default",
    description: "Политика default",
    text: `SecRuleRemoveByTag "attack-dos"
SecAction "id:1000000,phase:1,nolog,pass,t:none,setvar:tx.modsec_profile=default"
SecRule REQUEST_URI "@beginsWith /healthz" "id:1000001,phase:1,allow,nolog"
`,
  },
  {
    id: "a0000000-0000-4000-8000-000000000009",
    name: "extra-strict",
    description: "Политика strict поверх CRS",
    text: `SecRuleRemoveByTag "attack-dos"
SecAction "id:1000000,phase:1,nolog,pass,t:none,setvar:tx.modsec_profile=strict"
SecRule REQUEST_HEADERS:User-Agent "@rx (?i)nikto|sqlmap|nessus|w3af" \\
  "id:1001001,phase:1,deny,status:403,msg:'scanner'"
SecRule ARGS "@rx \\.\\./" "id:1001002,phase:2,deny,status:403,msg:'lfi'"
SecRule ARGS "@rx (?:;|\\|\\||&&)\\s*(?:wget|curl|bash|nc)\\b" \\
  "id:1001003,phase:2,deny,status:403,msg:'rce'"
`,
  },
  {
    id: "a0000000-0000-4000-8000-00000000000a",
    name: "extra-api",
    description: "Политика api поверх CRS",
    text: `SecRuleRemoveByTag "attack-dos"
SecAction "id:1000000,phase:1,nolog,pass,t:none,setvar:tx.modsec_profile=api"
SecRule ARGS "@rx (?i)union\\s+select" "id:1002001,phase:2,deny,status:403,msg:'sqli'"
SecRule ARGS "@rx (?i)<script" "id:1002002,phase:2,deny,status:403,msg:'xss'"
SecRule REQUEST_HEADERS:Content-Type "@rx (?i)text/xml|application/xml" \\
  "id:1002003,phase:1,pass,nolog,setvar:tx.modsec_api=xml"
`,
  },
  {
    id: "a0000000-0000-4000-8000-00000000000b",
    name: "extra-deny",
    description: "Безусловный отказ",
    text: `SecAction "id:1000000,phase:1,nolog,pass,t:none,setvar:tx.modsec_profile=deny"
SecAction "id:1000900,phase:1,log,t:none,deny,status:403,msg:'modsec fixture: unconditional deny'"
`,
  },
];


function quote(text: string): string {
  if (text.includes("$wafcrs$")) {
    throw new Error("CRS text contains dollar-quote tag");
  }

  return `$wafcrs$${text}$wafcrs$`;
}

async function main(): Promise<void> {
  const crsFiles = [];

  for (const file of CRS) {
    crsFiles.push({
      id: file.id,
      name: file.name,
      description: file.description,
      text: await readFile(join(crsDir, file.file), "utf8"),
    });
  }

  for (const file of DATA) {
    crsFiles.push({
      id: file.id,
      name: file.name,
      description: file.description,
      text: await readFile(join(crsDir, file.name), "utf8"),
    });
  }

  const files = [...LOCAL, ...crsFiles];
  const values = files
    .map(
      (file) =>
        `    ('${file.id}', '${file.name}', '${file.description}', ${quote(file.text)})`,
    )
    .join(",\n");

  const setValues = SETS.map(
    (set) => `    ('${set.id}', '${set.name}', '${set.description}')`,
  ).join(",\n");

  const members = SETS.flatMap((set) =>
    set.files.map((file, ord) => `    ('${set.name}', '${file}', ${ord})`),
  ).join(",\n");

  const sql = `-- Пять профилей: default / strict / api + фикстуры allow / deny.
-- Тела CRS и *.data — из data/crs-src. Пересобрать:
--   node --experimental-strip-types src/compile/gen-profile-seed.ts

delete from rule_set_files;
delete from rule_sets;
delete from rule_files;

insert into rule_files (id, http_space_id, name, description, text_raw)
select x.id::uuid, s.id, x.name, x.description, x.text_raw
  from http_spaces s
  cross join (values
${values}
  ) as x(id, name, description, text_raw)
 where s.name = 'default';

insert into rule_sets (id, http_space_id, name, description)
select x.id::uuid, s.id, x.name, x.description
  from http_spaces s
  cross join (values
${setValues}
  ) as x(id, name, description)
 where s.name = 'default';

insert into rule_set_files (rule_set_id, rule_file_id, position)
select p.id, f.id, x.ord
  from http_spaces s
  join rule_sets p on p.http_space_id = s.id
  join (values
${members}
  ) as x(profile, file, ord)
    on x.profile = p.name
  join rule_files f on f.http_space_id = s.id and f.name = x.file
 where s.name = 'default';
`;

  await writeFile(outPath, sql);
  process.stdout.write(`${outPath}\nfiles ${files.length} profiles ${SETS.length}\n`);
}

await main();
