-- Уровень журнала процесса -- свойство записи каталога инспекторов.
--
-- Строка info на каждое сообщение шины под нагрузкой стоит инспектору
-- половины пропускной способности, а переменная окружения WAF_<ИМЯ>_LOG
-- меняется только рестартом контейнера, который под прогоном обнуляет прогон.
-- Поэтому уровень едет в поколение процесса (блок settings манифеста, входит
-- в config_hash) и применяется на ходу; переменная остаётся стартовым
-- значением до первого поколения из KV.
--
-- Словарь -- error_log nginx без emerg: те же слова на краю и в инспекторе.
-- Инспектор сам пишет только debug/info/warn/error: notice режет то же, что
-- warn, а crit и alert глушат его журнал целиком.

alter table inspectors
    add column if not exists log_level text not null default 'info';

alter table inspectors
    drop constraint if exists inspectors_log_level_check;

alter table inspectors
    add constraint inspectors_log_level_check
        check (log_level in ('debug', 'info', 'notice', 'warn', 'error', 'crit', 'alert'));

comment on column inspectors.log_level is
    'Уровень журнала процесса: словарь error_log nginx без emerg. Едет в поколение (settings.log_level), применяется без рестарта.';
