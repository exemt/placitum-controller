-- Одна директива на все причины «вердикта нет».
--
-- Было четыре рычага: политика вторым словом `waf_deadline` и три `waf_on_*`.
-- Каждая новая причина тянула за собой пятую, а назвать страницу отказа не умел
-- ни один -- клиент получал голый 503. С 090 всё это одна строка:
--
--     waf_exception <фаза> [timeout|absent|bus|body] pass|deny [response=<имя>]
--
-- Класс необязателен: строка без него задаёт все четыре. Умолчания сохранены
-- ровно те, что были у снятых директив: timeout, absent и body -- deny,
-- bus -- pass; страница не названа -- 503, как раньше.
--
-- Ключи документа маршрута переезжают в массив `exception` (форма та же, что у
-- `send` и `archive` -- хвост директивы целиком):
--
--     deadlinePolicy          -> request timeout <политика>
--     responseDeadlinePolicy  -> response timeout <политика>
--     frameDeadlinePolicy     -> frame timeout <политика>
--     onAbsent                -> request absent <политика>
--     onBusError              -> request bus <политика>
--     onBodyUnavailable       -> request body <политика>
--
-- Слово политики переводится: block -> deny (pass остаётся pass). Строки
-- добавляются к уже существующему `exception`, если он есть.

do $$
declare
    tbl text;
begin
    foreach tbl in array array['http_spaces', 'servers', 'locations'] loop
        execute format($fmt$
            with moved as (
                select t.id,
                       coalesce(t.waf -> 'exception', '[]'::jsonb)
                           || coalesce(jsonb_agg(to_jsonb(x.line)
                                                 order by x.ord)
                                       filter (where x.line is not null),
                                       '[]'::jsonb) as lines
                  from %1$I t
                       cross join lateral (
                           values
                               (1, 'request',  'timeout',
                                t.waf ->> 'deadlinePolicy'),
                               (2, 'request',  'absent',
                                t.waf ->> 'onAbsent'),
                               (3, 'request',  'bus',
                                t.waf ->> 'onBusError'),
                               (4, 'request',  'body',
                                t.waf ->> 'onBodyUnavailable'),
                               (5, 'response', 'timeout',
                                t.waf ->> 'responseDeadlinePolicy'),
                               (6, 'frame',    'timeout',
                                t.waf ->> 'frameDeadlinePolicy')
                       ) as src(ord, phase, class, policy)
                       cross join lateral (
                           select src.ord,
                                  case
                                      when src.policy is null then null
                                      /*
                                       * Класс, уже названный строкой в
                                       * exception, не дублируем: две строки
                                       * одного класса на уровне отвергает
                                       * сборка.
                                       */
                                      when exists (
                                          select 1
                                            from jsonb_array_elements_text(
                                                     coalesce(t.waf -> 'exception',
                                                              '[]'::jsonb)) e
                                           where e like src.phase || ' '
                                                        || src.class || ' %%'
                                      ) then null
                                      else src.phase || ' ' || src.class || ' '
                                           || case src.policy
                                                  when 'block' then 'deny'
                                                  else src.policy
                                              end
                                  end as line
                       ) x
                 where t.waf ?| array['deadlinePolicy', 'onAbsent',
                                      'onBusError', 'onBodyUnavailable',
                                      'responseDeadlinePolicy',
                                      'frameDeadlinePolicy']
                 group by t.id, t.waf
            )
            update %1$I t
               set waf = (t.waf - 'deadlinePolicy' - 'onAbsent' - 'onBusError'
                                - 'onBodyUnavailable' - 'responseDeadlinePolicy'
                                - 'frameDeadlinePolicy')
                         || jsonb_build_object('exception', m.lines)
              from moved m
             where m.id = t.id
        $fmt$, tbl);
    end loop;
end
$$;
