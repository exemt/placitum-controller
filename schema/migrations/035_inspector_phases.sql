-- Фазы инспектора: множество, а не одна.
--
-- Одна фаза на запись означала, что процесс умеет ровно одну сторону. Это
-- неверно и было неверно всегда: modsec ведёт и запрос, и ответ -- один
-- профиль правил, одна транзакция, фазы 1-2 и 3-4 в ней подряд. С одной
-- колонкой такой процесс приходилось объявлять дважды, двумя именами на одну
-- тему, и связь между этими именами существовала только в голове оператора.
--
-- Фаза при этом не перестаёт быть свойством вызова: когда инспектора зовут,
-- решает waf_inspect на маршруте. Здесь -- что он умеет, там -- когда его
-- спрашивают. Пустой набор запрещён: процесс, не умеющий ни одной фазы, не
-- инспектор.

alter table inspectors
    add column phases text[] not null default array['request']::text[];

update inspectors set phases = array[phase];

alter table inspectors
    add constraint inspectors_phases_known
        check (phases <@ array['request', 'response', 'frame']::text[]),
    add constraint inspectors_phases_filled
        check (coalesce(array_length(phases, 1), 0) > 0),
    drop column phase;

comment on column inspectors.phases is
    'Фазы, которые процесс умеет вести. Когда его зовут -- решает waf_inspect на маршруте.';
