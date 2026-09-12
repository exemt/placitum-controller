-- Снятие грантов «кто кому что разрешает».
--
-- Их было два, оба -- в конфигурации маршрута, и оба про одно: от кого
-- принимать просьбу, которую исполняет сам модуль.
--
--     waf_inspect … control=<a,b>   -- кто вправе менять режим этого вызова
--     waf_audit_control <a,b>|none  -- кто вправе переопределить журнал и архив
--
-- С 092 разрешения нет ни у того, ни у другого: управляющие глаголы и глаголы
-- записи маршрут принимает от любого инспектора, спрошенного на нём. Проверка
-- осталась одна и она не про право, а про доставку -- адресат управляющего
-- глагола обязан стоять на маршруте хоть в одной фазе, иначе режим ставили бы
-- строке, которой здесь нет.
--
-- Следствие для `mode=off`: строка больше не обязана называть, кто её поднимет.
-- Раньше `mode=off` без `control=` не принимали ни контроллер, ни `nginx -t` --
-- теперь это просто спящая строка, и поднять её может любой сосед.
--
-- Ключи документа не переезжают, а выбрасываются: модуль обеих грамматик уже не
-- знает, и оставленные уронили бы `nginx -t` на первой же раскатке.

do $$
declare
    tbl text;
    key text;
begin
    foreach tbl in array array['http_spaces', 'servers', 'locations'] loop
        -- Грант записи -- ключ самого документа.
        execute format(
            'update %1$I set waf = waf - ''auditControl'' where waf ? ''auditControl''',
            tbl);

        -- Грант управления -- ключ каждой строки вызова, во всех трёх фазах.
        foreach key in array array['requestInspectors', 'responseInspectors',
                                   'frameInspectors']
        loop
            execute format($fmt$
                with cleaned as (
                    select t.id,
                           coalesce(jsonb_agg(e.elem - 'control' order by e.ord),
                                    '[]'::jsonb) as refs
                      from %1$I t
                           cross join lateral
                               jsonb_array_elements(
                                   case when jsonb_typeof(t.waf -> %2$L) = 'array'
                                        then t.waf -> %2$L
                                        else '[]'::jsonb
                                   end)
                                   with ordinality as e(elem, ord)
                     group by t.id
                )
                update %1$I t
                   set waf = jsonb_set(t.waf, array[%2$L], c.refs)
                  from cleaned c
                 where c.id = t.id
                   and t.waf -> %2$L is distinct from c.refs
            $fmt$, tbl, key);
        end loop;
    end loop;
end
$$;
