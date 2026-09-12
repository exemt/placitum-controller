-- Каталог инспекторов: снять колонки, которые переехали в граф.
--
-- 029 перенесла параметры `waf_inspector` и опции вызова в
-- `http_spaces.waf.inspectors` -- туда, где у одного имени они разные на
-- разных уровнях (пространство, сервер, путь). Колонки в таблице при этом
-- никто не снял, и с тех пор они лежали мёртвым грузом: репозиторий их читал,
-- `nginx-export` перекладывал в объект для компилятора, а компилятор брал из
-- графа и в эти поля не заглядывал ни разу.
--
-- Вред от такой копии не теоретический: она выглядит как настройка. Строка
-- каталога показывала `timeout_ms = 500` и `after = {ip}` в то время, как
-- контур считал по графу совсем другие числа, и разойтись эти две картины
-- могли молча.
--
-- В каталоге остаётся то, что и правда свойство процесса: имя, тема шины,
-- фазы, текст inspector.conf и место в списке.

alter table inspectors
    drop column if exists role,
    drop column if exists placement,
    drop column if exists timeout_ms,
    drop column if exists body,
    drop column if exists weight_milli,
    drop column if exists sample_milli,
    drop column if exists after,
    drop column if exists headers,
    drop column if exists allow_headers,
    drop column if exists allow_cookies,
    drop column if exists needs,
    drop column if exists audit,
    drop column if exists breaker;

comment on table inspectors is
    'Каталог процессов: имя, тема шины, фазы, inspector.conf. Опции директив -- в http_spaces.waf.inspectors.';
