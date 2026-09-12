/*
 * Поводы контура: что вообще объявлено в профилях отправителей.
 *
 * Повод -- произвольная строка пары отправитель-получатель, словаря у него нет
 * и быть не может (docs/inspector-actions.md, «Повод»). Зато у контроллера
 * лежат профили восьми отправителей канала, и всё, что они кому-либо шлют, он
 * может назвать до выкатки. Это и есть подсказка поля поводов: не словарь, а
 * список уже объявленного, с именем объявителя рядом.
 *
 * Список один на пространство и не фильтруется по получателю. Правило приёма
 * пишут раньше, чем отправитель начнёт слать повод именно этому инспектору, и
 * подсказка, знающая только про адресованные ему, молчала бы ровно тогда,
 * когда нужна. Кто объявил -- видно в самой подсказке, и решает оператор.
 *
 * Таблица профилей выбирается по имени процесса -- то же соглашение, что в
 * `action-targets.ts`: `counter` хранит профили в `counter_profiles`, `modsec`
 * -- в `rule_sets`, `ip` -- правилами отдельной таблицы, `captcha` и `auth` --
 * правилами по событиям в документе профиля. Единственный процесс без
 * исходящих действий -- `rewrite`: он только слушает.
 */

import type { Pool } from "./db.ts";

/** Кто объявил повод: процесс-отправитель и его профиль. */
export interface SenderCodeUse {
  inspector: string;
  profile: string;
}

/** Повод и все места, где он объявлен. */
export interface SenderCode {
  code: string;
  by: SenderCodeUse[];
}

export interface SenderCodeRow {
  inspector: string;
  profile: string;
  code: string;
}

/*
 * Массив документа как источник строк. Форму дока держат загрузчики, но
 * подсказка не имеет права падать на записи, которая их не проходила:
 * `jsonb_array_elements` на объекте -- ошибка запроса, а не пустой список.
 */
function arrayOf(expr: string): string {
  return `case when jsonb_typeof(${expr}) = 'array' then ${expr} else '[]'::jsonb end`;
}

/** Разделы, где инспектор объявляет исходящие действия. */
function outcomesOf(column: string, sections: readonly string[][]): string {
  return sections
    .map((path) => arrayOf(`${column}#>'{${path.join(",")}}'`))
    .join(" || ");
}

const SQL = `
with declared as (
    select 'ip'::text as inspector, p.name as profile, r.code as code
      from ip_profile_rules r
      join ip_profiles p on p.id = r.ip_profile_id
     where p.http_space_id = $1
       and r.action = 'request'
    union all
    select 'action', p.name, ask.value->>'code'
      from action_profiles p,
           jsonb_array_elements(${arrayOf("p.doc->'rules'")}) as item,
           jsonb_array_elements(${arrayOf("item.value->'actions'")}) as ask
     where p.http_space_id = $1
    union all
    select 'cookie', p.name, ask.value->>'code'
      from cookie_profiles p,
           jsonb_array_elements(${arrayOf("p.doc->'rules'")}) as item,
           jsonb_array_elements(${arrayOf("item.value->'actions'")}) as ask
     where p.http_space_id = $1
    union all
    select 'counter', p.name, o.value->>'code'
      from counter_profiles p,
           jsonb_array_elements(
               ${outcomesOf("p.doc", [
                 ["request", "outcomes"],
                 ["frame", "outcomes"],
               ])}
           ) as o
     where p.http_space_id = $1
    union all
    select 'json', p.name, o.value->>'code'
      from json_profiles p,
           jsonb_array_elements(
               ${outcomesOf("p.doc", [
                 ["request", "outcomes"],
                 ["response", "outcomes"],
                 ["frame", "outcomes"],
               ])}
           ) as o
     where p.http_space_id = $1
    union all
    select 'vlai', p.name, o.value->>'code'
      from vlai_profiles p,
           jsonb_array_elements(${arrayOf("p.doc->'outcomes'")}) as o
     where p.http_space_id = $1
    union all
    select 'modsec', s.name, o.value->>'code'
      from rule_sets s,
           jsonb_array_elements(${arrayOf("s.policy->'outcomes'")}) as o
     where s.http_space_id = $1
    union all
    select 'captcha', p.name, r.value->>'code'
      from captcha_profiles p,
           jsonb_array_elements(${arrayOf("p.doc->'rules'")}) as r
     where p.http_space_id = $1
       and coalesce(r.value->>'do', '') <> ''
    union all
    select 'auth', p.name, r.value->>'code'
      from auth_profiles p,
           jsonb_array_elements(${arrayOf("p.doc->'rules'")}) as r
     where p.http_space_id = $1
       and coalesce(r.value->>'do', '') <> ''
)
select distinct inspector, profile, code
  from declared
 where code is not null
   and code <> ''
 order by code, inspector, profile
`;

/**
 * Сложить строки в список поводов: один повод -- одна запись, объявители
 * перечислены рядом. Порядок задан запросом, здесь только группировка.
 */
export function groupSenderCodes(rows: readonly SenderCodeRow[]): SenderCode[] {
  const out: SenderCode[] = [];
  const index = new Map<string, SenderCode>();

  for (const row of rows) {
    const found = index.get(row.code);
    const use = { inspector: row.inspector, profile: row.profile };

    if (found === undefined) {
      const item = { code: row.code, by: [use] };

      index.set(row.code, item);
      out.push(item);
      continue;
    }

    if (!found.by.some((by) => by.inspector === use.inspector && by.profile === use.profile)) {
      found.by.push(use);
    }
  }

  return out;
}

/** Все поводы, объявленные профилями отправителей пространства. */
export async function loadSenderCodes(pool: Pool, httpSpaceId: string): Promise<SenderCode[]> {
  const { rows } = await pool.query<SenderCodeRow>(SQL, [httpSpaceId]);

  return groupSenderCodes(rows);
}
