-- Фаза вызова адресата у управляющих глаголов в строках IP фильтра.
--
-- Адресат глагола active / passive / vote / off -- вызов инспектора на
-- маршруте, а не процесс: имя, стоящее на запросе и на ответе, звано дважды.
-- Поле phase на проводе выбирает один из вызовов; без него режим получают
-- оба. Инициаторы держат ключ в том же jsonb (outcomes), правилам нужна
-- колонка -- как ask_group у mutate (093).
alter table ip_profile_rules
    add column if not exists ask_phase text not null default '';

comment on column ip_profile_rules.ask_phase is
    'Фаза вызова адресата у active / passive / vote / off: request, response, frame. Пусто -- всем вызовам имени и у прочих глаголов.';
