-- Файлы данных modsec-профиля.
--
-- SecLang умеет операторы «из файла»: @pmFromFile, @ipMatchFromFile и их
-- сокращения читают список фраз или адресов из соседнего файла. Транспорт под
-- это существует давно -- секция data в rules-pack, которую инспектор
-- раскладывает в каталог каждого профиля, -- но наполнялась она только
-- сканом каталога файлов правил: правило могло сослаться лишь на файл,
-- который кто-то завёл КАК ФАЙЛ ПРАВИЛ, хотя список фраз правилом не
-- является и в профиль его включать нельзя.
--
-- Теперь список фраз живёт там же, где остальная статика, -- набором вида
-- content в разделе «Данные -> Файлы», -- а профиль правил объявляет, какие
-- из этих наборов ему нужны. Имя файла на стороне инспектора считается как
-- имя набора плюс расширение по типу содержимого (как у страниц отказа):
-- набор sqli_keywords типа text виден правилу как sqli_keywords.txt.
--
-- restrict, а не cascade: набор, на который ссылается профиль, нельзя
-- удалить молча -- ручка отвечает 409 in_use списком мест, а FK остаётся
-- страховкой от гонки.

create table if not exists rule_set_data (
    rule_set_id  uuid not null references rule_sets(id) on delete cascade,
    dataset_id   uuid not null references datasets(id) on delete restrict,
    position     integer not null default 0,
    primary key (rule_set_id, dataset_id)
);

create index if not exists rule_set_data_dataset on rule_set_data (dataset_id);
