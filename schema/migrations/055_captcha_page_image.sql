-- Стандартная страница капчи: PoW выпилен, картинка встала на его место.
--
-- Объект captcha_page создан миграцией 044 с разметкой под PoW: прогресс-бар,
-- «проверяем браузер», а на месте картинки -- голое поле ввода без самой
-- картинки. Провайдера pow больше нет (docs/inspectors/captcha/buckets.md),
-- значит ветка шаблона мертва, а единственный self-hosted виджет остался без
-- разметки: оператор, повесивший стандартную страницу, увидел бы поле, куда
-- нечего вводить.
--
-- Обновляется только нетронутая страница: признак -- мёртвый блок
-- {{if eq .Kind "pow"}}. Правку оператора не трогаем.

do $$
declare
    html text := $page$<!doctype html>
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
  input[type=text] { font: inherit; padding: .5rem; width: 100%; box-sizing: border-box; }
  button { font: inherit; padding: .5rem 1rem; margin-top: .75rem; }
  .alt { font-size: .875rem; opacity: .7; }
  .captcha-img { display: block; max-width: 100%; border-radius: 4px; margin: .5rem 0; }
  .ext { min-height: 66px; margin: .5rem 0; }
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
      {{if eq .Kind "image"}}
        <p>Введите символы с картинки:</p>
        <img class="captcha-img" alt="Символы для ввода" src="{{.Image}}">
        <p class="alt"><a href="">Другая картинка</a>{{if .Audio}} · <a href="{{$.Action}}/audio">Прослушать</a>{{end}}</p>
        {{if .Audio}}<audio controls preload="none" src="{{$.Action}}/audio"></audio>{{end}}
        <input type="text" name="answer_image" autocomplete="off" autocapitalize="characters" inputmode="latin" aria-label="Символы с картинки">
        <button type="submit">Продолжить</button>
      {{else}}
        <div class="ext" data-ext="{{.Kind}}"></div>
        <p class="alt ext-wait">Загружаем проверку…</p>
        <noscript><p class="error">Для этой проверки нужен JavaScript.</p></noscript>
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
    update dataset_contents c
       set body = convert_to(html, 'UTF8'), updated_at = now()
      from datasets d
     where d.id = c.dataset_id
       and d.name = 'captcha_page'
       and position('{{if eq .Kind "pow"}}' in convert_from(c.body, 'UTF8')) > 0;
end $$;
