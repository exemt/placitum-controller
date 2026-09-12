-- Стандартная форма входа становится видимым объектом.
--
-- До этой миграции она жила файлом внутри образа сервиса формы: оператор её не
-- видел, не мог посмотреть и не мог взять за основу свою. Теперь стандартная
-- вёрстка лежит там же, где всё остальное статическое -- в разделе «Страницы»
-- пространства, объектом `login_form`.
--
-- Файл в образе остаётся, но меняет роль: это аварийный запас на случай, когда
-- профиль страницу не называет (контур без контроллера, bootstrap-профили). То,
-- что оператор правит, лежит в базе; то, что зашито в образ, никто не ищет.
--
-- Профилям калитки, у которых страница не выбрана, объект проставляется: то,
-- что видно в разделе, обязано быть тем, что показывается клиенту.

do $$
declare
    space   record;
    html    uuid;
    fresh   text;
    created uuid;
    body    text := $page$<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{{.Title}}</title>
<!--
  Страница входа контура. Правила те же, что у страниц отказа
  (docs/deny-pages.md): чистый HTML5, стиль внутри, ни одной внешней
  зависимости и ни одной строки JS.

  Без JS не из аскетизма: страница стоит перед приложением и перед входом,
  то есть в единственном месте контура, где скрипт видел бы пароль.
-->
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: #f4f5f7;
  color: #1c1e21;
}
main {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border: 1px solid #e2e4e8;
  border-radius: 10px;
  padding: 28px;
}
h1 { margin: 0 0 6px; font-size: 19px; font-weight: 600; }
p.note { margin: 0 0 20px; color: #61656c; font-size: 13px; }
label { display: block; margin: 14px 0 5px; font-size: 13px; color: #3a3d42; }
input {
  width: 100%;
  padding: 9px 11px;
  font: inherit;
  color: inherit;
  background: #fff;
  border: 1px solid #ccd0d6;
  border-radius: 6px;
}
input:focus { outline: 2px solid #3b6fd4; outline-offset: -1px; border-color: #3b6fd4; }
button {
  width: 100%;
  margin-top: 20px;
  padding: 10px;
  font: inherit;
  font-weight: 600;
  color: #fff;
  background: #2f6bd8;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
button:hover { background: #2559b8; }
.error {
  margin: 0 0 4px;
  padding: 9px 11px;
  font-size: 13px;
  color: #8a1f1f;
  background: #fdeaea;
  border: 1px solid #f3c9c9;
  border-radius: 6px;
}
.done { margin: 0; color: #3a3d42; }
a { color: #2f6bd8; }
@media (prefers-color-scheme: dark) {
  body { background: #16181c; color: #e6e8eb; }
  main { background: #1e2126; border-color: #2c3037; }
  p.note { color: #9aa0a8; }
  label { color: #c3c8cf; }
  input { background: #16181c; border-color: #3a3f47; }
  .error { color: #ffb4b4; background: #3a1f1f; border-color: #5a2b2b; }
  .done { color: #c3c8cf; }
}
</style>
</head>
<body>
<main>
  <h1>{{.Title}}</h1>

  {{if .Done}}
    <p class="done">{{.DoneText}}</p>
    <p><a href="{{.LoginURI}}">Войти снова</a></p>
  {{else}}
    {{if .Note}}<p class="note">{{.Note}}</p>{{end}}
    {{if .Error}}<p class="error">{{.Error}}</p>{{end}}

    <form method="post" action="{{.Action}}" autocomplete="on">
      <input type="hidden" name="csrf" value="{{.Nonce}}">

      {{if .AskLogin}}
      <label for="login">Логин</label>
      <input id="login" name="login" type="text" autocomplete="username"
             autocapitalize="none" spellcheck="false" autofocus required>
      {{end}}

      {{if .AskPassword}}
      <label for="password">Пароль</label>
      <input id="password" name="password" type="password"
             autocomplete="current-password" required>
      {{end}}

      {{if .AskCode}}
      <label for="code">Код</label>
      <input id="code" name="code" type="text" inputmode="numeric"
             autocomplete="one-time-code" spellcheck="false" required>
      {{end}}

      <button type="submit">Войти</button>
    </form>
  {{end}}
</main>
</body>
</html>
$page$;
begin
    select id into html from content_types where name = 'html';

    for space in select id from http_spaces loop
        fresh := 'login_form';

        if exists (select 1 from datasets d
                    where d.http_space_id = space.id and d.name = fresh) then
            continue;
        end if;

        insert into datasets (http_space_id, name, description, subject, kind, type,
                              content_type_id, max_entries)
        values (space.id, fresh, 'Стандартная форма входа калитки',
                'waf.data.' || fresh, 'content', 'string', html, 1000000)
        returning id into created;

        insert into dataset_contents (dataset_id, name, body)
        values (created, fresh || '.html', convert_to(body, 'UTF8'));

        update auth_profiles
           set doc = jsonb_set(doc, '{login,page}', to_jsonb(created::text))
         where http_space_id = space.id
           and coalesce(doc -> 'login' ->> 'page', '') = '';
    end loop;
end $$;
