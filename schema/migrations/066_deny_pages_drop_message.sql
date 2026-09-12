-- Ветка `$waf_deny_message` снята со встроенных страниц отказа.
--
-- Заполнить её теперь нечем: у `type=http` панель поля не показывает и в
-- конфиг не печатает (065), а ветка, которую никто не включает, стоит первой
-- в цепочке и обещает клиенту фразу, которой не будет. У `type=grpc` и
-- `websocket` `message=` живёт по-прежнему -- там страниц нет вовсе.
--
-- Правка текстовая, а не пересев тел. Страницы сеются в каждое пространство
-- (062), их у оператора бывает и десяток, а снимается везде один и тот же
-- блок: перечислять тела заново значило бы завести второе место, где они
-- лежат, и разойтись с `nginx/pages/*.html` при первой же правке.
--
-- Отбор идёт по байтам (`position` над bytea) и типу содержимого: в этой же
-- таблице лежат картинки, и `convert_from` на них упал бы.
with html as materialized (
    select c.dataset_id
      from dataset_contents c
      join datasets d on d.id = c.dataset_id
      join content_types t on t.id = d.content_type_id
     where d.kind = 'content'
       and t.name = 'html'
       and position(convert_to('waf_deny_message', 'UTF8') in c.body) > 0
)
update dataset_contents c
   set body = convert_to(
                replace(
                    convert_from(c.body, 'UTF8'),
                    '<!--# if expr="$waf_deny_message" -->' || chr(10)
                    || '  <p><!--# echo var="waf_deny_message" default="" --></p>' || chr(10)
                    || '<!--# elif ',
                    '<!--# if '
                ),
                'UTF8'
              ),
       updated_at = now()
  from html
 where html.dataset_id = c.dataset_id;
