-- Стандартные страницы отказа становятся видимыми объектами пространства.
--
-- До этой миграции их было не видно: файлы лежали в образе ноды
-- (/usr/share/waf/pages), и оператор узнавал о них из документации, а не из
-- панели. Своя страница при этом заводилась с чистого листа: заготовки, от
-- которой можно оттолкнуться, в разделе не было ни одной.
--
-- Теперь они лежат там же, где всё остальное статическое -- наборами вида
-- content в разделе «Данные -> Файлы». Тот же путь уже прошла форма входа
-- (041_login_form_object.sql), и по тем же причинам.
--
-- Особенность против обычного набора одна.
--
-- builtin -- запись нельзя ни удалить, ни переименовать, ни править. Имя
-- страницы -- это имя записи каталога waf_deny_response, по которому её ищет
-- try_files /$waf_deny_name.html: переименованная перестала бы находиться, а
-- удалённая увела бы отказ в fallback образа. Тело заперто по той же мерке:
-- правленый образец перестаёт быть образцом, а свой вариант заводят копией
-- под своим именем.
--
-- Файлы в образе остаются и меняют роль на ту же, что у формы входа:
-- аварийный запас для контура без контроллера. То, что правит оператор, лежит
-- в базе; то, что зашито в образ, никто не ищет.
--
-- JSON-близнецов (blocked.json и прочих) здесь нет. Имя набора уникально в
-- пространстве, а имя файла на ноде считается как имя набора плюс расширение
-- по типу содержимого, -- то есть blocked.html и blocked.json одним
-- пространством не выражаются. Пока это так, машиночитаемые ответы остаются
-- файлами образа.

alter table datasets
    add column if not exists builtin boolean not null default false;

do $$
declare
    page    record;
    html    uuid;
    created uuid;
begin
    select id into html from content_types where name = 'html';

    if html is null then
        return;
    end if;

    for page in
        select s.id as space, p.name, p.note, p.body
          from http_spaces s
          cross join (values
            ('blocked', 'Отказ по политике: запрос остановлен контуром',
             $page$<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Доступ закрыт</title>
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
  --tone: #b3261e;
  --tone-bg: #fdeaea;
  --tone-line: #f0cccc;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181c;
    --card: #1e2126;
    --line: #2c3037;
    --soft: #22262c;
    --text: #e6e8eb;
    --muted: #9aa0a8;
    --tone: #ff9d95;
    --tone-bg: #3a1f1f;
    --tone-line: #5a2b2b;
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
  <svg class="flow" viewBox="0 0 340 100" role="img" aria-label="Клиент, WAF, приложение: WAF не пропустил запрос к приложению"><path class="wire" d="M74 42H131"/><path class="head" d="M138 42l-8-4.5v9z"/><path class="wire dim" d="M202 42H220"/><path class="wire dim dash" d="M248 42H266"/><circle class="badge" cx="234" cy="42" r="11"/><path class="mark" d="M230 38l8 8M238 38l-8 8"/><rect class="box" x="14" y="14" width="56" height="56" rx="15"/><g class="ico" transform="translate(42 42)"><rect x="-11" y="-10" width="22" height="15" rx="2.5"/><path d="M-6 9h12M0 5v4"/></g><text class="cap" x="42" y="88">Клиент</text><rect class="box hot" x="142" y="14" width="56" height="56" rx="15"/><g class="ico hot" transform="translate(170 42)"><path d="M0-12 10.5-7.6V-1c0 5.4-4.4 9.3-10.5 11.5C-6.1 8.3-10.5 4.4-10.5-1v-6.6z"/></g><text class="cap" x="170" y="88">WAF</text><rect class="box off" x="270" y="14" width="56" height="56" rx="15"/><g class="ico off" transform="translate(298 42)"><rect x="-10.5" y="-10" width="21" height="8.6" rx="2"/><rect x="-10.5" y="1.4" width="21" height="8.6" rx="2"/><path d="M-6-5.7h.01M-6 5.7h.01"/></g><text class="cap" x="298" y="88">Приложение</text></svg>
  <p class="status">HTTP <!--# echo var="waf_deny_status" default="403" --></p>
  <h1>Доступ закрыт</h1>
  <p class="lead">Запрос остановлен на защитном контуре и до приложения не дошёл.</p>
  <div class="why">
<!--# if expr="$waf_deny_message" -->
  <p><!--# echo var="waf_deny_message" default="" --></p>
<!--# elif expr="$waf_deny_scope = network" -->
  <p>Закрыта сеть <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> — в неё входит ваш адрес.</p>
<!--# elif expr="$waf_deny_scope = address" -->
  <p>Закрыт адрес <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b>.</p>
<!--# elif expr="$waf_deny_scope = country" -->
  <p>Запросы из вашего региона не принимаются.</p>
<!--# elif expr="$waf_deny_scope = asn" -->
  <p>Запросы из сети <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> не принимаются.</p>
<!--# elif expr="$waf_deny_scope = session" -->
  <p>Ограничение действует на вашу сессию, а не на адрес.</p>
<!--# else -->
  <p>Запрос отклонён политикой безопасности.</p>
<!--# endif -->
<!--# if expr="$waf_deny_retry" -->
  <p>Повторить запрос можно через <b><!--# echo var="waf_deny_retry" default="" --></b> с.</p>
<!--# endif -->
</div>
  <dl class="meta">
<!--# if expr="$waf_deny_ray" -->
  <div><dt>Event ID</dt><dd class="mono"><!--# echo var="waf_deny_ray" default="" --></dd></div>
<!--# endif -->
<!--# if expr="$waf_deny_addr" -->
  <div><dt>Ваш адрес</dt><dd class="mono"><!--# echo var="waf_deny_addr" default="" --></dd></div>
<!--# endif -->
</dl>
  <p class="foot">Если доступ нужен по работе, передайте в поддержку Event ID — по нему запрос находится в журнале.</p>
</main>
</body>
</html>
$page$),

            ('suspicious', 'Отказ по сумме признаков: сработал порог счёта',
             $page$<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Запрос отклонён</title>
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
  --tone: #8a5300;
  --tone-bg: #fdf3e2;
  --tone-line: #efdcb8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181c;
    --card: #1e2126;
    --line: #2c3037;
    --soft: #22262c;
    --text: #e6e8eb;
    --muted: #9aa0a8;
    --tone: #f0bd6a;
    --tone-bg: #3a2c17;
    --tone-line: #5a4526;
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
  <svg class="flow" viewBox="0 0 340 100" role="img" aria-label="Клиент, WAF, приложение: WAF не пропустил запрос к приложению"><path class="wire" d="M74 42H131"/><path class="head" d="M138 42l-8-4.5v9z"/><path class="wire dim" d="M202 42H220"/><path class="wire dim dash" d="M248 42H266"/><circle class="badge" cx="234" cy="42" r="11"/><path class="mark" d="M230 38l8 8M238 38l-8 8"/><rect class="box" x="14" y="14" width="56" height="56" rx="15"/><g class="ico" transform="translate(42 42)"><rect x="-11" y="-10" width="22" height="15" rx="2.5"/><path d="M-6 9h12M0 5v4"/></g><text class="cap" x="42" y="88">Клиент</text><rect class="box hot" x="142" y="14" width="56" height="56" rx="15"/><g class="ico hot" transform="translate(170 42)"><path d="M0-12 10.5-7.6V-1c0 5.4-4.4 9.3-10.5 11.5C-6.1 8.3-10.5 4.4-10.5-1v-6.6z"/></g><text class="cap" x="170" y="88">WAF</text><rect class="box off" x="270" y="14" width="56" height="56" rx="15"/><g class="ico off" transform="translate(298 42)"><rect x="-10.5" y="-10" width="21" height="8.6" rx="2"/><rect x="-10.5" y="1.4" width="21" height="8.6" rx="2"/><path d="M-6-5.7h.01M-6 5.7h.01"/></g><text class="cap" x="298" y="88">Приложение</text></svg>
  <p class="status">HTTP <!--# echo var="waf_deny_status" default="403" --></p>
  <h1>Запрос отклонён</h1>
  <p class="lead">Запрос набрал слишком много признаков атаки. По отдельности ни один из них не решает, но вместе они дали отказ.</p>
  <div class="why">
<!--# if expr="$waf_deny_message" -->
  <p><!--# echo var="waf_deny_message" default="" --></p>
<!--# elif expr="$waf_deny_scope = network" -->
  <p>Закрыта сеть <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> — в неё входит ваш адрес.</p>
<!--# elif expr="$waf_deny_scope = address" -->
  <p>Закрыт адрес <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b>.</p>
<!--# elif expr="$waf_deny_scope = country" -->
  <p>Запросы из вашего региона не принимаются.</p>
<!--# elif expr="$waf_deny_scope = asn" -->
  <p>Запросы из сети <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> не принимаются.</p>
<!--# elif expr="$waf_deny_scope = session" -->
  <p>Ограничение действует на вашу сессию, а не на адрес.</p>
<!--# else -->
  <p>Сочетание признаков в запросе превысило допустимый порог.</p>
<!--# endif -->
<!--# if expr="$waf_deny_retry" -->
  <p>Повторить запрос можно через <b><!--# echo var="waf_deny_retry" default="" --></b> с.</p>
<!--# endif -->
</div>
  <dl class="meta">
<!--# if expr="$waf_deny_ray" -->
  <div><dt>Event ID</dt><dd class="mono"><!--# echo var="waf_deny_ray" default="" --></dd></div>
<!--# endif -->
<!--# if expr="$waf_deny_addr" -->
  <div><dt>Ваш адрес</dt><dd class="mono"><!--# echo var="waf_deny_addr" default="" --></dd></div>
<!--# endif -->
</dl>
  <p class="foot">Похоже на ошибку? Передайте в поддержку Event ID — по нему видно, какие именно признаки сработали.</p>
</main>
</body>
</html>
$page$),

            ('too_many', 'Превышена частота запросов (429)',
             $page$<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Слишком много запросов</title>
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
  --tone: #8a5300;
  --tone-bg: #fdf3e2;
  --tone-line: #efdcb8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181c;
    --card: #1e2126;
    --line: #2c3037;
    --soft: #22262c;
    --text: #e6e8eb;
    --muted: #9aa0a8;
    --tone: #f0bd6a;
    --tone-bg: #3a2c17;
    --tone-line: #5a4526;
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
  <svg class="flow" viewBox="0 0 340 100" role="img" aria-label="Клиент, WAF, приложение: WAF придержал поток запросов"><path class="wire" d="M78 30H131"/><path class="head" d="M138 30l-8-4.5v9z"/><path class="wire" d="M74 42H131"/><path class="head" d="M138 42l-8-4.5v9z"/><path class="wire" d="M78 54H131"/><path class="head" d="M138 54l-8-4.5v9z"/><path class="wire dim" d="M202 42H220"/><path class="wire dim dash" d="M248 42H266"/><circle class="badge" cx="234" cy="42" r="11"/><path class="mark" d="M231.4 37.6v8.8M236.6 37.6v8.8"/><rect class="box" x="14" y="14" width="56" height="56" rx="15"/><g class="ico" transform="translate(42 42)"><rect x="-11" y="-10" width="22" height="15" rx="2.5"/><path d="M-6 9h12M0 5v4"/></g><text class="cap" x="42" y="88">Клиент</text><rect class="box hot" x="142" y="14" width="56" height="56" rx="15"/><g class="ico hot" transform="translate(170 42)"><path d="M0-12 10.5-7.6V-1c0 5.4-4.4 9.3-10.5 11.5C-6.1 8.3-10.5 4.4-10.5-1v-6.6z"/></g><text class="cap" x="170" y="88">WAF</text><rect class="box off" x="270" y="14" width="56" height="56" rx="15"/><g class="ico off" transform="translate(298 42)"><rect x="-10.5" y="-10" width="21" height="8.6" rx="2"/><rect x="-10.5" y="1.4" width="21" height="8.6" rx="2"/><path d="M-6-5.7h.01M-6 5.7h.01"/></g><text class="cap" x="298" y="88">Приложение</text></svg>
  <p class="status">HTTP <!--# echo var="waf_deny_status" default="429" --></p>
  <h1>Слишком много запросов</h1>
  <p class="lead">С вашего адреса приходит больше запросов, чем разрешено. Приложение здесь ни при чём: ограничение стоит на контуре.</p>
  <div class="why">
<!--# if expr="$waf_deny_message" -->
  <p><!--# echo var="waf_deny_message" default="" --></p>
<!--# elif expr="$waf_deny_scope = network" -->
  <p>Закрыта сеть <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> — в неё входит ваш адрес.</p>
<!--# elif expr="$waf_deny_scope = address" -->
  <p>Закрыт адрес <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b>.</p>
<!--# elif expr="$waf_deny_scope = country" -->
  <p>Запросы из вашего региона не принимаются.</p>
<!--# elif expr="$waf_deny_scope = asn" -->
  <p>Запросы из сети <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> не принимаются.</p>
<!--# elif expr="$waf_deny_scope = session" -->
  <p>Ограничение действует на вашу сессию, а не на адрес.</p>
<!--# else -->
  <p>Превышена допустимая частота запросов.</p>
<!--# endif -->
<!--# if expr="$waf_deny_retry" -->
  <p>Повторить запрос можно через <b><!--# echo var="waf_deny_retry" default="" --></b> с.</p>
<!--# endif -->
</div>
  <dl class="meta">
<!--# if expr="$waf_deny_ray" -->
  <div><dt>Event ID</dt><dd class="mono"><!--# echo var="waf_deny_ray" default="" --></dd></div>
<!--# endif -->
<!--# if expr="$waf_deny_addr" -->
  <div><dt>Ваш адрес</dt><dd class="mono"><!--# echo var="waf_deny_addr" default="" --></dd></div>
<!--# endif -->
</dl>
  <p class="foot">Снизьте частоту и повторите. Автоматическим клиентам стоит добавить паузу между запросами.</p>
</main>
</body>
</html>
$page$),

            ('malformed', 'Запрос не разобран: не тот формат (400)',
             $page$<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Запрос не разобран</title>
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
  --tone: #b3261e;
  --tone-bg: #fdeaea;
  --tone-line: #f0cccc;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181c;
    --card: #1e2126;
    --line: #2c3037;
    --soft: #22262c;
    --text: #e6e8eb;
    --muted: #9aa0a8;
    --tone: #ff9d95;
    --tone-bg: #3a1f1f;
    --tone-line: #5a2b2b;
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
  <svg class="flow" viewBox="0 0 340 100" role="img" aria-label="Клиент, WAF, приложение: WAF не смог разобрать запрос клиента"><path class="wire dim" d="M74 42H92"/><path class="wire dim dash" d="M120 42H138"/><circle class="badge" cx="106" cy="42" r="11"/><path class="mark" d="M102 38l8 8M110 38l-8 8"/><path class="wire dim dash" d="M202 42H266"/><rect class="box" x="14" y="14" width="56" height="56" rx="15"/><g class="ico" transform="translate(42 42)"><rect x="-11" y="-10" width="22" height="15" rx="2.5"/><path d="M-6 9h12M0 5v4"/></g><text class="cap" x="42" y="88">Клиент</text><rect class="box hot" x="142" y="14" width="56" height="56" rx="15"/><g class="ico hot" transform="translate(170 42)"><path d="M0-12 10.5-7.6V-1c0 5.4-4.4 9.3-10.5 11.5C-6.1 8.3-10.5 4.4-10.5-1v-6.6z"/></g><text class="cap" x="170" y="88">WAF</text><rect class="box off" x="270" y="14" width="56" height="56" rx="15"/><g class="ico off" transform="translate(298 42)"><rect x="-10.5" y="-10" width="21" height="8.6" rx="2"/><rect x="-10.5" y="1.4" width="21" height="8.6" rx="2"/><path d="M-6-5.7h.01M-6 5.7h.01"/></g><text class="cap" x="298" y="88">Приложение</text></svg>
  <p class="status">HTTP <!--# echo var="waf_deny_status" default="400" --></p>
  <h1>Запрос не разобран</h1>
  <p class="lead">Контур не смог разобрать запрос: он не соответствует формату HTTP или контракту сервиса.</p>
  <div class="why">
<!--# if expr="$waf_deny_message" -->
  <p><!--# echo var="waf_deny_message" default="" --></p>
<!--# elif expr="$waf_deny_scope = network" -->
  <p>Закрыта сеть <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> — в неё входит ваш адрес.</p>
<!--# elif expr="$waf_deny_scope = address" -->
  <p>Закрыт адрес <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b>.</p>
<!--# elif expr="$waf_deny_scope = country" -->
  <p>Запросы из вашего региона не принимаются.</p>
<!--# elif expr="$waf_deny_scope = asn" -->
  <p>Запросы из сети <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> не принимаются.</p>
<!--# elif expr="$waf_deny_scope = session" -->
  <p>Ограничение действует на вашу сессию, а не на адрес.</p>
<!--# else -->
  <p>Запрос составлен неверно и проверку не проходил.</p>
<!--# endif -->
<!--# if expr="$waf_deny_retry" -->
  <p>Повторить запрос можно через <b><!--# echo var="waf_deny_retry" default="" --></b> с.</p>
<!--# endif -->
</div>
  <dl class="meta">
<!--# if expr="$waf_deny_ray" -->
  <div><dt>Event ID</dt><dd class="mono"><!--# echo var="waf_deny_ray" default="" --></dd></div>
<!--# endif -->
<!--# if expr="$waf_deny_addr" -->
  <div><dt>Ваш адрес</dt><dd class="mono"><!--# echo var="waf_deny_addr" default="" --></dd></div>
<!--# endif -->
</dl>
  <p class="foot">Проверьте метод, заголовки и тело запроса. До приложения он не дошёл.</p>
</main>
</body>
</html>
$page$),

            ('error', 'Сбой самого контура защиты (502/503)',
             $page$<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Временно недоступно</title>
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
  --tone: #4b5058;
  --tone-bg: #f0f1f3;
  --tone-line: #dcdee2;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181c;
    --card: #1e2126;
    --line: #2c3037;
    --soft: #22262c;
    --text: #e6e8eb;
    --muted: #9aa0a8;
    --tone: #b6bcc4;
    --tone-bg: #272b31;
    --tone-line: #3a3f47;
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
  <svg class="flow" viewBox="0 0 340 100" role="img" aria-label="Клиент, WAF, приложение: сбой на самом WAF"><path class="wire" d="M74 42H131"/><path class="head" d="M138 42l-8-4.5v9z"/><path class="wire dim dash" d="M202 42H266"/><rect class="box" x="14" y="14" width="56" height="56" rx="15"/><g class="ico" transform="translate(42 42)"><rect x="-11" y="-10" width="22" height="15" rx="2.5"/><path d="M-6 9h12M0 5v4"/></g><text class="cap" x="42" y="88">Клиент</text><rect class="box hot" x="142" y="14" width="56" height="56" rx="15"/><g class="ico hot" transform="translate(170 42)"><path d="M0-12 10.5-7.6V-1c0 5.4-4.4 9.3-10.5 11.5C-6.1 8.3-10.5 4.4-10.5-1v-6.6z"/></g><circle class="badge" cx="192" cy="20" r="9.5"/><path class="mark" d="M192 15.5v5.4M192 24.4h.01"/><text class="cap" x="170" y="88">WAF</text><rect class="box off" x="270" y="14" width="56" height="56" rx="15"/><g class="ico off" transform="translate(298 42)"><rect x="-10.5" y="-10" width="21" height="8.6" rx="2"/><rect x="-10.5" y="1.4" width="21" height="8.6" rx="2"/><path d="M-6-5.7h.01M-6 5.7h.01"/></g><text class="cap" x="298" y="88">Приложение</text></svg>
  <p class="status">HTTP <!--# echo var="waf_deny_status" default="502" --></p>
  <h1>Временно недоступно</h1>
  <p class="lead">Защитный контур не смог обработать запрос. Это сбой на нашей стороне — с вашим запросом всё в порядке.</p>
  <div class="why">
<!--# if expr="$waf_deny_message" -->
  <p><!--# echo var="waf_deny_message" default="" --></p>
<!--# elif expr="$waf_deny_scope = network" -->
  <p>Закрыта сеть <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> — в неё входит ваш адрес.</p>
<!--# elif expr="$waf_deny_scope = address" -->
  <p>Закрыт адрес <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b>.</p>
<!--# elif expr="$waf_deny_scope = country" -->
  <p>Запросы из вашего региона не принимаются.</p>
<!--# elif expr="$waf_deny_scope = asn" -->
  <p>Запросы из сети <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> не принимаются.</p>
<!--# elif expr="$waf_deny_scope = session" -->
  <p>Ограничение действует на вашу сессию, а не на адрес.</p>
<!--# else -->
  <p>Внутренняя ошибка контура защиты.</p>
<!--# endif -->
<!--# if expr="$waf_deny_retry" -->
  <p>Повторить запрос можно через <b><!--# echo var="waf_deny_retry" default="" --></b> с.</p>
<!--# endif -->
</div>
  <dl class="meta">
<!--# if expr="$waf_deny_ray" -->
  <div><dt>Event ID</dt><dd class="mono"><!--# echo var="waf_deny_ray" default="" --></dd></div>
<!--# endif -->
<!--# if expr="$waf_deny_addr" -->
  <div><dt>Ваш адрес</dt><dd class="mono"><!--# echo var="waf_deny_addr" default="" --></dd></div>
<!--# endif -->
</dl>
  <p class="foot">Повторите попытку через минуту. Если не проходит и дальше, передайте в поддержку Event ID.</p>
</main>
</body>
</html>
$page$),

            ('auth_required', 'Нужен второй фактор: калитка не нашла сессии (401)',
             $page$<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Нужен вход</title>
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
  <svg class="flow" viewBox="0 0 340 100" role="img" aria-label="Клиент, WAF, приложение: WAF держит запрос до входа"><path class="wire" d="M74 42H131"/><path class="head" d="M138 42l-8-4.5v9z"/><path class="wire dim" d="M202 42H220"/><path class="wire dim dash" d="M248 42H266"/><circle class="badge" cx="234" cy="42" r="11"/><path class="mark" d="M230.4 41.4h7.2v5.2h-7.2z"/><path class="mark" d="M232 41.4v-2.2a2 2 0 0 1 4 0v2.2"/><rect class="box" x="14" y="14" width="56" height="56" rx="15"/><g class="ico" transform="translate(42 42)"><rect x="-11" y="-10" width="22" height="15" rx="2.5"/><path d="M-6 9h12M0 5v4"/></g><text class="cap" x="42" y="88">Клиент</text><rect class="box hot" x="142" y="14" width="56" height="56" rx="15"/><g class="ico hot" transform="translate(170 42)"><path d="M0-12 10.5-7.6V-1c0 5.4-4.4 9.3-10.5 11.5C-6.1 8.3-10.5 4.4-10.5-1v-6.6z"/></g><text class="cap" x="170" y="88">WAF</text><rect class="box off" x="270" y="14" width="56" height="56" rx="15"/><g class="ico off" transform="translate(298 42)"><rect x="-10.5" y="-10" width="21" height="8.6" rx="2"/><rect x="-10.5" y="1.4" width="21" height="8.6" rx="2"/><path d="M-6-5.7h.01M-6 5.7h.01"/></g><text class="cap" x="298" y="88">Приложение</text></svg>
  <p class="status">HTTP <!--# echo var="waf_deny_status" default="401" --></p>
  <h1>Нужен вход</h1>
  <p class="lead">Ресурс закрыт вторым фактором. Запрос дошёл до калитки, но она не нашла подтверждённой сессии.</p>
  <div class="why">
<!--# if expr="$waf_deny_message" -->
  <p><!--# echo var="waf_deny_message" default="" --></p>
<!--# elif expr="$waf_deny_scope = network" -->
  <p>Закрыта сеть <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> — в неё входит ваш адрес.</p>
<!--# elif expr="$waf_deny_scope = address" -->
  <p>Закрыт адрес <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b>.</p>
<!--# elif expr="$waf_deny_scope = country" -->
  <p>Запросы из вашего региона не принимаются.</p>
<!--# elif expr="$waf_deny_scope = asn" -->
  <p>Запросы из сети <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> не принимаются.</p>
<!--# elif expr="$waf_deny_scope = session" -->
  <p>Ограничение действует на вашу сессию, а не на адрес.</p>
<!--# else -->
  <p>Для этого ресурса нужен второй фактор.</p>
<!--# endif -->
  <p><a href="/waf/login">Войти</a> и повторить запрос.</p>
<!--# if expr="$waf_deny_retry" -->
  <p>Повторить запрос можно через <b><!--# echo var="waf_deny_retry" default="" --></b> с.</p>
<!--# endif -->
</div>
  <dl class="meta">
<!--# if expr="$waf_deny_ray" -->
  <div><dt>Event ID</dt><dd class="mono"><!--# echo var="waf_deny_ray" default="" --></dd></div>
<!--# endif -->
<!--# if expr="$waf_deny_addr" -->
  <div><dt>Ваш адрес</dt><dd class="mono"><!--# echo var="waf_deny_addr" default="" --></dd></div>
<!--# endif -->
</dl>
  <p class="foot">Запросу, который не является обычной навигацией, калитка отвечает 401, а не редиректом: редирект отобрал бы у POST тело, а у fetch — ответ.</p>
</main>
</body>
</html>
$page$),

            ('captcha_required', 'Нужна проверка на человека: нет клиренса (403)',
             $page$<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Подтвердите, что вы человек</title>
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
  <svg class="flow" viewBox="0 0 340 100" role="img" aria-label="Клиент, WAF, приложение: WAF держит запрос до проверки"><path class="wire" d="M74 42H131"/><path class="head" d="M138 42l-8-4.5v9z"/><path class="wire dim" d="M202 42H220"/><path class="wire dim dash" d="M248 42H266"/><circle class="badge" cx="234" cy="42" r="11"/><path class="mark" d="M230.4 41.4h7.2v5.2h-7.2z"/><path class="mark" d="M232 41.4v-2.2a2 2 0 0 1 4 0v2.2"/><rect class="box" x="14" y="14" width="56" height="56" rx="15"/><g class="ico" transform="translate(42 42)"><rect x="-11" y="-10" width="22" height="15" rx="2.5"/><path d="M-6 9h12M0 5v4"/></g><text class="cap" x="42" y="88">Клиент</text><rect class="box hot" x="142" y="14" width="56" height="56" rx="15"/><g class="ico hot" transform="translate(170 42)"><path d="M0-12 10.5-7.6V-1c0 5.4-4.4 9.3-10.5 11.5C-6.1 8.3-10.5 4.4-10.5-1v-6.6z"/></g><text class="cap" x="170" y="88">WAF</text><rect class="box off" x="270" y="14" width="56" height="56" rx="15"/><g class="ico off" transform="translate(298 42)"><rect x="-10.5" y="-10" width="21" height="8.6" rx="2"/><rect x="-10.5" y="1.4" width="21" height="8.6" rx="2"/><path d="M-6-5.7h.01M-6 5.7h.01"/></g><text class="cap" x="298" y="88">Приложение</text></svg>
  <p class="status">HTTP <!--# echo var="waf_deny_status" default="403" --></p>
  <h1>Подтвердите, что вы человек</h1>
  <p class="lead">Ресурс просит пройти проверку. Запрос дошёл до калитки, но клиренса у него нет.</p>
  <div class="why">
<!--# if expr="$waf_deny_message" -->
  <p><!--# echo var="waf_deny_message" default="" --></p>
<!--# elif expr="$waf_deny_scope = network" -->
  <p>Закрыта сеть <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> — в неё входит ваш адрес.</p>
<!--# elif expr="$waf_deny_scope = address" -->
  <p>Закрыт адрес <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b>.</p>
<!--# elif expr="$waf_deny_scope = country" -->
  <p>Запросы из вашего региона не принимаются.</p>
<!--# elif expr="$waf_deny_scope = asn" -->
  <p>Запросы из сети <b class="mono"><!--# echo var="waf_deny_subject" default="" --></b> не принимаются.</p>
<!--# elif expr="$waf_deny_scope = session" -->
  <p>Ограничение действует на вашу сессию, а не на адрес.</p>
<!--# else -->
  <p>Для этого ресурса нужна проверка на человека.</p>
<!--# endif -->
  <p>Откройте заново страницу, с которой вы сюда попали: проверке нужен свежий билет.</p>
<!--# if expr="$waf_deny_retry" -->
  <p>Повторить запрос можно через <b><!--# echo var="waf_deny_retry" default="" --></b> с.</p>
<!--# endif -->
</div>
  <dl class="meta">
<!--# if expr="$waf_deny_ray" -->
  <div><dt>Event ID</dt><dd class="mono"><!--# echo var="waf_deny_ray" default="" --></dd></div>
<!--# endif -->
<!--# if expr="$waf_deny_addr" -->
  <div><dt>Ваш адрес</dt><dd class="mono"><!--# echo var="waf_deny_addr" default="" --></dd></div>
<!--# endif -->
</dl>
  <p class="foot">Запросу, который не является обычной навигацией, калитка отвечает 403, а не редиректом: редирект отобрал бы у POST тело, а у fetch — ответ.</p>
</main>
</body>
</html>
$page$)
          ) as p(name, note, body)
         order by s.id, p.name
    loop
        /*
         * Имя набора уникально в пространстве, и страницу с таким именем мог
         * завести оператор -- или миграция 040, перенёсшая сюда старую
         * response_pages. Чужую не трогаем и builtin ей не проставляем:
         * запрет на удаление тому, кто его не просил, -- это ловушка, а не
         * защита.
         */
        if exists (select 1 from datasets d
                    where d.http_space_id = page.space and d.name = page.name) then
            continue;
        end if;

        insert into datasets (http_space_id, name, description, subject, kind, type,
                              content_type_id, max_entries, builtin)
        values (page.space, page.name, page.note, 'waf.data.' || page.name,
                'content', 'string', html, 1000000, true)
        returning id into created;

        insert into dataset_contents (dataset_id, name, body)
        values (created, page.name || '.html', convert_to(page.body, 'UTF8'));
    end loop;
end $$;
