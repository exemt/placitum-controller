-- Отказ «вошли, но не сюда»: допуск по группам на профиле калитки.
--
-- Профиль с gate.groups отвечает на сессию без нужной группы отдельным
-- вердиктом (AUTH_FORBIDDEN), и запись каталога ему нужна своя. auth_required
-- на это не годится: он говорит «войдите» и отвечает 401, а человек уже
-- вошёл -- ему нужен 403 и другой текст. Одна запись на оба случая врала бы
-- вошедшему и уводила бы его на форму, где ничего не меняется.
--
-- Страница собрана из auth_required: разметка, стиль и схема потока у
-- страниц отказа общие (docs/deny-pages.md), разными их делают только текст
-- и код ответа.

insert into deny_responses (http_space_id, name, type, spec, position)
select s.id, 'auth_forbidden', 'http', '{"status": 403}'::jsonb, 55
  from http_spaces s
 where not exists (
           select 1 from deny_responses d
            where d.http_space_id = s.id and d.name = 'auth_forbidden'
       );

do $$
declare
    space   record;
    html    uuid;
    created uuid;
    body    text := $page$<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Недостаточно прав</title>
<!--
  Стандартная страница отказа контура (docs/deny-pages.md): чистый HTML5,
  стиль внутри, ни одной внешней зависимости и ни одной строки JS. Страница
  стоит перед приложением, и загружать с неё что-либо означало бы вести
  заблокированного клиента ещё куда-то.

  Значения подставляет SSI из переменных модуля. Без ssi on файл остаётся
  валидным HTML: директивы -- обычные комментарии.
-->
<style>
:root {
  color-scheme: light dark;
  --bg: #f4f5f7;
  --card: #fff;
  --line: #e2e4e8;
  --soft: #f7f8fa;
  --text: #1c1e21;
  --muted: #61656c;
  --tone: #2f6bd8;
  --tone-bg: #eaf0fd;
  --tone-line: #c9d8f5;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181c;
    --card: #1e2126;
    --line: #2c3037;
    --soft: #22262c;
    --text: #e6e8eb;
    --muted: #9aa0a8;
    --tone: #8fb4f5;
    --tone-bg: #1d2738;
    --tone-line: #2f4468;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
}
main {
  width: 100%;
  max-width: 560px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 30px 28px 24px;
}
.flow { display: block; width: 100%; max-width: 340px; margin: 0 auto 20px; }
.flow .box { fill: var(--soft); stroke: var(--line); stroke-width: 1.5; }
.flow .box.hot { fill: var(--tone-bg); stroke: var(--tone-line); }
.flow .box.off { fill: none; stroke-dasharray: 4 4; }
.flow .ico { fill: none; stroke: var(--muted); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.flow .ico.hot { stroke: var(--tone); }
.flow .ico.off { stroke: var(--line); }
.flow .wire { fill: none; stroke: var(--line); stroke-width: 2; }
.flow .wire.dash { stroke-dasharray: 5 4; }
.flow .head { fill: var(--line); stroke: none; }
.flow .badge { fill: var(--card); stroke: var(--tone); stroke-width: 2; }
.flow .mark { fill: none; stroke: var(--tone); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.flow .cap { fill: var(--muted); font-size: 11px; font-weight: 500; text-anchor: middle; }
.status {
  display: inline-block;
  margin: 0 0 10px;
  padding: 2px 9px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .04em;
  color: var(--tone);
  background: var(--tone-bg);
  border: 1px solid var(--tone-line);
  border-radius: 20px;
}
h1 { margin: 0 0 8px; font-size: 20px; font-weight: 600; letter-spacing: -.01em; }
.lead { margin: 0; color: var(--muted); font-size: 14px; }
.why {
  margin: 18px 0 0;
  padding: 12px 14px;
  background: var(--tone-bg);
  border: 1px solid var(--tone-line);
  border-radius: 8px;
  font-size: 14px;
}
.why p { margin: 0; }
.why p + p { margin-top: 6px; }
.why .mono { color: var(--tone); }
.meta { margin: 18px 0 0; padding: 0; border-top: 1px solid var(--line); }
.meta div {
  display: flex;
  gap: 12px;
  align-items: baseline;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.meta dt { flex: none; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
.meta dd { margin: 0; text-align: right; font-size: 13px; overflow-wrap: anywhere; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.foot { margin: 16px 0 0; color: var(--muted); font-size: 13px; }
a { color: var(--tone); }
@media (max-width: 420px) {
  main { padding: 22px 18px 18px; }
  .meta div { flex-direction: column; gap: 2px; }
  .meta dd { text-align: left; }
}
</style>
</head>
<body>
<main>
  <svg class="flow" viewBox="0 0 340 100" role="img" aria-label="Клиент, WAF, приложение: WAF держит запрос без допуска"><path class="wire" d="M74 42H131"/><path class="head" d="M138 42l-8-4.5v9z"/><path class="wire dim" d="M202 42H220"/><path class="wire dim dash" d="M248 42H266"/><circle class="badge" cx="234" cy="42" r="11"/><path class="mark" d="M230.4 41.4h7.2v5.2h-7.2z"/><path class="mark" d="M232 41.4v-2.2a2 2 0 0 1 4 0v2.2"/><rect class="box" x="14" y="14" width="56" height="56" rx="15"/><g class="ico" transform="translate(42 42)"><rect x="-11" y="-10" width="22" height="15" rx="2.5"/><path d="M-6 9h12M0 5v4"/></g><text class="cap" x="42" y="88">Клиент</text><rect class="box hot" x="142" y="14" width="56" height="56" rx="15"/><g class="ico hot" transform="translate(170 42)"><path d="M0-12 10.5-7.6V-1c0 5.4-4.4 9.3-10.5 11.5C-6.1 8.3-10.5 4.4-10.5-1v-6.6z"/></g><text class="cap" x="170" y="88">WAF</text><rect class="box off" x="270" y="14" width="56" height="56" rx="15"/><g class="ico off" transform="translate(298 42)"><rect x="-10.5" y="-10" width="21" height="8.6" rx="2"/><rect x="-10.5" y="1.4" width="21" height="8.6" rx="2"/><path d="M-6-5.7h.01M-6 5.7h.01"/></g><text class="cap" x="298" y="88">Приложение</text></svg>
  <p class="status">HTTP <!--# echo var="waf_deny_status" default="403" --></p>
  <h1>Недостаточно прав</h1>
  <p class="lead">Вход выполнен, но этот раздел открыт не всем: у вашей учётной записи нет нужной группы.</p>
  <div class="why">
  <p>Раздел открыт участникам отдельной группы. Ваша учётная запись в неё не входит.</p>
  <p>Повторный вход ничего не изменит: группы приезжают вместе с учётной записью. Допуск выдаёт тот, кто отвечает за ресурс.</p>
</div>
  <dl class="meta">
<!--# if expr="$waf_deny_ray" -->
  <div><dt>Event ID</dt><dd class="mono"><!--# echo var="waf_deny_ray" default="" --></dd></div>
<!--# endif -->
<!--# if expr="$waf_deny_addr" -->
  <div><dt>Ваш адрес</dt><dd class="mono"><!--# echo var="waf_deny_addr" default="" --></dd></div>
<!--# endif -->
</dl>
  <p class="foot">На форму входа калитка не уводит: вход уже выполнен, и второй заход выдал бы ту же сессию с теми же группами.</p>
</main>
</body>
</html>
$page$;
begin
    select id into html from content_types where name = 'html';

    if html is null then
        return;
    end if;

    for space in select id from http_spaces order by id
    loop
        /*
         * Имя набора уникально в пространстве. Страницу с таким именем мог
         * завести оператор -- чужую не трогаем и builtin ей не проставляем:
         * запрет на удаление тому, кто его не просил, -- ловушка, а не защита.
         */
        if exists (select 1 from datasets d
                    where d.http_space_id = space.id and d.name = 'auth_forbidden') then
            continue;
        end if;

        insert into datasets (http_space_id, name, description, subject, kind, type,
                              content_type_id, max_entries, builtin)
        values (space.id, 'auth_forbidden',
                'Вошли, но допуска нет: у сессии не та группа (403)',
                'waf.data.auth_forbidden', 'content', 'string', html, 1000000, true)
        returning id into created;

        insert into dataset_contents (dataset_id, name, body)
        values (created, 'auth_forbidden.html', convert_to(body, 'UTF8'));
    end loop;
end $$;
