-- Профили капчи (inspectors/captcha).
--
-- Тот же приём, что у калитки (037): профиль -- документ jsonb, форма его
-- описана в Go (inspectors/captcha/internal/config) и в контроллере
-- (captcha-profile-doc.ts), колонки на поле разъехались бы с ними на первом
-- новом ключе. server_id -- сервер, из локейшенов которого выбран адрес
-- страницы; в манифест не едет, нужен форме и проверке.

create table if not exists captcha_profiles (
    id              uuid primary key default gen_random_uuid(),
    http_space_id   uuid not null references http_spaces(id) on delete cascade,
    server_id       uuid references servers(id) on delete set null,
    name            text not null,
    description     text not null default '',
    -- Документ профиля: mode, path, trigger, pages, gate, providers, clearance,
    -- loop, limits, list, upstream, roster. Схема -- docs/inspectors/captcha.
    doc             jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (http_space_id, name)
);

create index if not exists captcha_profiles_space on captcha_profiles (http_space_id);

comment on column captcha_profiles.doc is
    'Документ профиля капчи. Валидация -- в контроллере и в инспекторе, не в типах.';

-- Каталог инспекторов: капча объявляется процессом, как auth, иначе её нельзя
-- выбрать на маршруте из UX.
insert into inspectors (http_space_id, name, subject, conf)
select s.id, 'captcha', 'waf.req.captcha', $conf$# inspector.conf — локальная очередь процесса
queue_max     32;
queue_full    drop;
queue_expand  off;
$conf$
  from http_spaces s
 where not exists (
           select 1 from inspectors i
            where i.http_space_id = s.id and i.name = 'captcha'
       );

-- Отказ «нужна капча»: 403 с машиночитаемым телом, по которому фронтенд
-- показывает виджет сам. Не 401: это не вопрос личности.
insert into deny_responses (http_space_id, name, type, spec, position)
select s.id, 'captcha_required', 'http', '{"status": 403}'::jsonb, 50
  from http_spaces s
 where not exists (
           select 1 from deny_responses d
            where d.http_space_id = s.id and d.name = 'captcha_required'
       );

-- Стандартная страница капчи -- объект раздела «Страницы», как login_form:
-- то, что видно в разделе, обязано быть тем, что показывается клиенту.
-- Файл web/captcha.html в образе -- аварийный запас без контроллера.
do $$
declare
    space   record;
    html    uuid;
    created uuid;
    body    text := $page$<!doctype html>
<html lang="{{.Lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{.Title}}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; display: grid; min-height: 100vh;
         place-items: center; background: Canvas; color: CanvasText; }
  main { max-width: 26rem; padding: 2rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { margin: .5rem 0; }
  .note { opacity: .7; }
  .error { color: #b42318; }
  .widget { margin: 1.25rem 0; }
  .widget[hidden] { display: none; }
  .bar { height: 4px; background: color-mix(in srgb, CanvasText 12%, transparent); border-radius: 2px; overflow: hidden; }
  .bar > i { display: block; height: 100%; width: 0; background: #2e7d32; transition: width .2s; }
  input[type=text] { font: inherit; padding: .5rem; width: 100%; box-sizing: border-box; }
  button { font: inherit; padding: .5rem 1rem; margin-top: .75rem; }
  .alt { font-size: .875rem; opacity: .7; }
  a { color: inherit; }
</style>
</head>
<body>
<main>
  <h1>{{.Title}}</h1>
  {{if .Note}}<p class="note">{{.Note}}</p>{{end}}
  {{if .Error}}<p class="error" role="alert">{{.Error}}</p>{{end}}

  {{if .NoTicket}}
    <p><a href="{{.ReturnTo}}">Вернуться на сайт</a></p>
  {{else if .Widgets}}
  <form method="post" action="{{.Action}}" id="captcha" data-collect="{{if .Collect}}1{{end}}" data-canvas="{{if .Canvas}}1{{end}}">
    <input type="hidden" name="csrf" value="{{.Nonce}}">
    <input type="hidden" name="provider" id="provider" value="">
    <input type="hidden" name="answer" id="answer" value="">
    <input type="hidden" name="fp" id="fp" value="">

    {{range .Widgets}}
    <div class="widget" data-kind="{{.Kind}}" data-primary="{{if .Primary}}1{{end}}" {{if not .Primary}}hidden{{end}}>
      <script type="application/json" class="challenge">{{.Data}}</script>
      {{if eq .Kind "pow"}}
        <p id="pow-text">Проверяем браузер, это займёт несколько секунд…</p>
        <div class="bar" aria-hidden="true"><i id="pow-bar"></i></div>
        <noscript><p class="error">Для этой проверки нужен JavaScript.</p></noscript>
      {{else}}
        <p>Введите ответ:</p>
        <input type="text" name="answer_{{.Kind}}" autocomplete="off" autocapitalize="characters">
        <button type="submit">Продолжить</button>
      {{end}}
    </div>
    {{end}}

    <p class="alt"><a href="{{.ReturnTo}}">Вернуться на сайт</a>{{if gt .Attempt 1}} · попытка {{.Attempt}}{{end}}</p>
  </form>
  <script src="{{.ScriptURL}}" defer></script>
  {{else}}
    <p><a href="{{.ReturnTo}}">Вернуться на сайт</a></p>
  {{end}}
</main>
</body>
</html>
$page$;
begin
    select id into html from content_types where name = 'html';

    for space in select id from http_spaces loop
        if not exists (select 1 from datasets d
                        where d.http_space_id = space.id and d.name = 'captcha_page') then
            insert into datasets (http_space_id, name, description, subject, kind, type,
                                  content_type_id, max_entries)
            values (space.id, 'captcha_page', 'Стандартная страница капчи',
                    'waf.data.captcha_page', 'content', 'string', html, 1000000)
            returning id into created;

            insert into dataset_contents (dataset_id, name, body)
            values (created, 'captcha_page.html', convert_to(body, 'UTF8'));
        else
            select d.id into created from datasets d
             where d.http_space_id = space.id and d.name = 'captcha_page';
        end if;

        -- Профиль default обязан быть: без него поколение не соберётся, а
        -- маршрут, не назвавший профиль, остался бы без капчи.
        if not exists (select 1 from captcha_profiles p
                        where p.http_space_id = space.id and p.name = 'default') then
            insert into captcha_profiles (http_space_id, name, description, doc)
            values (space.id, 'default', 'Виджет по счёту и по просьбе соседей',
                    jsonb_build_object(
                        'mode', 'enforce',
                        'path', '/waf/captcha',
                        'page', created::text,
                        'trigger', jsonb_build_object('when', 'score', 'scoreAt', 60,
                            'reverifyAt', 90, 'reverifyAfterS', 600,
                            'prior', jsonb_build_array(jsonb_build_object(
                                'inspector', '*', 'reasons', jsonb_build_array('WANT_CAPTCHA'),
                                'scoreAt', 0)))));
        end if;
    end loop;
end $$;
