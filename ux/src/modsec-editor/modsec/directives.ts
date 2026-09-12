/**
 * Что принимает каждая директива конфигурации.
 *
 * `semantics.ts` описывает внутренность правила — переменные, операторы,
 * трансформации. Здесь описано то, что стоит вокруг правил: пять десятков
 * директив, которые собирают набор из файлов, включают движок, ограничивают
 * тело запроса, настраивают журналы и снимают чужие правила.
 *
 * Директив полсотни, но форм не полсотни. Аргумент бывает дюжины видов, и
 * они закрывают весь список: переключатель `On | Off | DetectionOnly` — это
 * одиннадцать директив, число — восемь, путь — восемь. Поэтому таблица
 * отвечает не «как выглядит форма SecRequestBodyLimit», а «какого вида у неё
 * аргумент»; форму по виду собирает конструктор.
 *
 * Отсюда же граница честности. Строка, которая под свой вид не подходит —
 * лишний аргумент, макрос в значении, незнакомое имя, — формы не получает
 * вовсе: {@link readDirective} возвращает `null`, и конструктор оставляет её
 * текстовым полем. Показать форму, в которую влезло не всё, значило бы
 * потерять остаток при первой же правке.
 *
 * Обратная сборка ({@link emitDirective}) знает про кавычки, и это то самое,
 * чего не мог сделать разбор в одиночку: снятые кавычки не восстановишь из
 * аргументов, но их можно расставить заново по виду аргумента. Число и
 * переключатель пишутся голыми, список действий и регулярное выражение —
 * всегда в кавычках, путь — по необходимости.
 */

import { exclusionDirectiveKind } from './exclusions';
import { parseActions } from './parser';
import { dquote, dquoteArgument, serializeActions } from './serialize';
import { isDisruptive } from './semantics';
import type { Label } from './semantics';
import type { DirectiveStatement, RuleAction } from './types';

/** Пара «английский, русский». */
function lab(en: string, ru: string): Label {
  return { en, ru };
}

/* ------------------------------------------------------------------ */
/* Виды аргумента                                                      */
/* ------------------------------------------------------------------ */

/**
 * Вид аргумента директивы — он же вид формы, которой она правится.
 *
 * Делятся виды не по теме, а по тому, влезает ли форма в строку списка.
 * Строка обязана быть ровно одной: на этом держится виртуализация, которая
 * считает высоту свёрнутого блока, а не измеряет её.
 */
export type DirectiveArg =
  | 'toggle'
  | 'enum'
  | 'number'
  | 'mode'
  | 'path'
  | 'text'
  | 'regex'
  | 'flags'
  | 'list'
  | 'none'
  | 'actions'
  | 'exclusion';

/** Виды, которые правятся одним полем и помещаются в строку списка. */
const SINGLE_ARGS: DirectiveArg[] = [
  'toggle',
  'enum',
  'number',
  'mode',
  'path',
  'text',
  'regex',
];

/** Аргумент укладывается в одно поле — значит, и в одну строку списка. */
export function isSingleArg(arg: DirectiveArg): boolean {
  return SINGLE_ARGS.includes(arg);
}

/**
 * Директива раскрывается в панель: одной строки её форме мало.
 *
 * Мерка тут не «сложно ли устроена директива», а «ручается ли форма за свою
 * высоту». Девять частей журнала аудита — девять чипов, и на узком окне они
 * переносятся на второй ряд; у `SecRuleUpdateTargetByTag` полей три, и в
 * строку с именем они встают только на широком. Виртуализация списка высоту
 * свёрнутого блока не измеряет, а знает наперёд, поэтому «обычно влезает» ей
 * не годится: разъехавшись однажды, отступы копятся до конца файла.
 */
export function isPanelArg(arg: DirectiveArg): boolean {
  return arg === 'actions' || arg === 'exclusion' || arg === 'flags' || arg === 'list';
}

/** Одно допустимое значение перечисления. */
export interface DirectiveValue {
  label: Label;
  /** Что именно это значение делает — иначе `On` и `Off` неразличимы. */
  note: Label;
}

/** Готовое значение, которое стоит предложить в свободном поле. */
export interface DirectiveHint {
  value: string;
  hint: Label;
}

export interface DirectiveMeta {
  arg: DirectiveArg;
  /** Допустимые значения `toggle` и `enum`, каждое со своим пояснением. */
  values?: Record<string, DirectiveValue>;
  /** Что обычно пишут: подсказки свободного поля. */
  hints?: DirectiveHint[];
  /**
   * Аргумент принято писать в кавычках, даже когда пробелов в нём нет.
   *
   * Кавычки тут не требование движка, а то, как эти директивы пишут в
   * наборах правил; строка, отличающаяся от соседних одними кавычками,
   * заставляет сверять её с файлом дважды.
   */
  quoted?: boolean;
  /** Единица числа: без неё `13107200` не прочитать. */
  unit?: Label;
  group: Label;
  label: Label;
  note: Label;
  /** Встречается постоянно — остаётся в кратком виде списка. */
  common: boolean;
}

/* ------------------------------------------------------------------ */
/* Разобранная директива                                               */
/* ------------------------------------------------------------------ */

interface FormBase {
  /** Имя директивы в каноничном написании. */
  name: string;
}

/** Директива с одним значением: переключатель, число, путь, текст. */
export interface DirectiveValueForm extends FormBase {
  arg: 'toggle' | 'enum' | 'number' | 'mode' | 'path' | 'text' | 'regex';
  value: string;
}

/** `SecAuditLogParts ABIJDEFHZ` — набор букв, каждая со своим смыслом. */
export interface DirectiveFlagsForm extends FormBase {
  arg: 'flags';
  parts: string[];
}

/** `SecResponseBodyMimeType text/plain text/html` — несколько аргументов. */
export interface DirectiveListForm extends FormBase {
  arg: 'list';
  items: string[];
}

/** `SecResponseBodyMimeTypesClear` — директива без аргументов. */
export interface DirectiveNoneForm extends FormBase {
  arg: 'none';
}

/** `SecDefaultAction "phase:2,log,auditlog,pass"`. */
export interface DirectiveActionsForm extends FormBase {
  arg: 'actions';
  actions: RuleAction[];
}

/**
 * Одна из семи директив-исключений.
 *
 * Что она делает и как выбирает правила, задаёт само имя — эта решётка уже
 * описана в `exclusions.ts`, и дублировать её в форме значило бы завести
 * второй источник правды. Здесь только то, что человек вписывает руками.
 */
export interface DirectiveExclusionForm extends FormBase {
  arg: 'exclusion';
  /** Выборка: номера и диапазоны через пробел, шаблон сообщения или метка. */
  pick: string;
  /** Приписываемое: цели у `updateTarget`, действия у `updateAction`. */
  payload: string;
  /** Третий аргумент `SecRuleUpdateTarget*`: какую цель заменяет новая. */
  replaced: string;
}

export type DirectiveForm =
  | DirectiveValueForm
  | DirectiveFlagsForm
  | DirectiveListForm
  | DirectiveNoneForm
  | DirectiveActionsForm
  | DirectiveExclusionForm;

/* ------------------------------------------------------------------ */
/* Разделы списка                                                      */
/* ------------------------------------------------------------------ */

const FILES = lab('Included files', 'Включаемые файлы');
const ENGINE = lab('Rule engine', 'Движок правил');
const EXCLUSIONS = lab('Exclusions', 'Исключения');
const REQUEST_BODY = lab('Request body', 'Тело запроса');
const RESPONSE_BODY = lab('Response body', 'Тело ответа');
const AUDIT = lab('Audit log', 'Журнал аудита');
const DEBUG = lab('Debug log', 'Отладочный журнал');
const UPLOADS = lab('File uploads', 'Загрузка файлов');
const STORAGE = lab('Directories', 'Каталоги');
const LIMITS = lab('Parsing and limits', 'Разбор и пределы');
const SIGNATURES = lab('Signatures', 'Подписи');

/* ------------------------------------------------------------------ */
/* Наборы значений                                                     */
/* ------------------------------------------------------------------ */

/**
 * Пара «включено / выключено» с пояснением, что даёт каждая сторона.
 *
 * Пояснение пишется под директиву, а не берётся общим: «Off» у
 * `SecRequestBodyAccess` означает, что тела запроса не увидит ни одно
 * правило, а у `SecContentInjection` — что не сработает `append`. Общая
 * подпись «выключено» не сказала бы ни того, ни другого.
 */
function onOff(
  onEn: string,
  onRu: string,
  offEn: string,
  offRu: string,
): Record<string, DirectiveValue> {
  return {
    On: { label: lab('On', 'Включено'), note: lab(onEn, onRu) },
    Off: { label: lab('Off', 'Выключено'), note: lab(offEn, offRu) },
  };
}

const RULE_ENGINE_VALUES: Record<string, DirectiveValue> = {
  On: {
    label: lab('On', 'Включено'),
    note: lab(
      'Rules run and block: this is the only value at which a disruptive action actually stops the request',
      'Правила работают и блокируют: только при этом значении разрушающее действие действительно останавливает запрос',
    ),
  },
  Off: {
    label: lab('Off', 'Выключено'),
    note: lab(
      'Rules do not run at all, and the request body is not even parsed — they see nothing, not merely stay passive',
      'Правила не работают вовсе, и тело запроса даже не разбирается — они не просто пассивны, они ничего не видят',
    ),
  },
  DetectionOnly: {
    label: lab('Detection only', 'Только обнаружение'),
    note: lab(
      'Rules run and log but never block — how a new rule set is introduced without breaking the application',
      'Правила работают и пишут в журнал, но не блокируют — так новый набор вводят, не ломая приложение',
    ),
  },
};

const AUDIT_ENGINE_VALUES: Record<string, DirectiveValue> = {
  On: {
    label: lab('On', 'Все запросы'),
    note: lab(
      'Logs every transaction — exhaustive and expensive; the log grows with traffic, not with attacks',
      'Пишет каждую транзакцию — исчерпывающе и дорого: журнал растёт вместе с трафиком, а не с атаками',
    ),
  },
  Off: {
    label: lab('Off', 'Ничего'),
    note: lab(
      'Writes nothing at all — a rule that fired leaves no trace beyond the error log',
      'Не пишет ничего: от сработавшего правила не остаётся следа, кроме журнала ошибок',
    ),
  },
  RelevantOnly: {
    label: lab('Relevant only', 'Только значимые'),
    note: lab(
      'Logs only what a rule marked relevant or what matched SecAuditLogRelevantStatus — the usual choice',
      'Пишет только отмеченное правилом или подошедшее под SecAuditLogRelevantStatus — обычный выбор',
    ),
  },
};

const KEEP_FILES_VALUES: Record<string, DirectiveValue> = {
  On: {
    label: lab('On', 'Все'),
    note: lab(
      'Keeps every uploaded file on disk — fills the directory quickly and holds user data',
      'Сохраняет на диск каждый загруженный файл — каталог заполняется быстро, и в нём лежат чужие данные',
    ),
  },
  Off: {
    label: lab('Off', 'Никакие'),
    note: lab('Deletes uploads once the transaction ends', 'Удаляет загруженное по окончании транзакции'),
  },
  RelevantOnly: {
    label: lab('Relevant only', 'Только значимые'),
    note: lab(
      'Keeps only the files from transactions a rule marked relevant',
      'Сохраняет файлы только из транзакций, отмеченных правилом как значимые',
    ),
  },
};

const LIMIT_ACTION_VALUES: Record<string, DirectiveValue> = {
  Reject: {
    label: lab('Reject', 'Отклонить'),
    note: lab(
      'Refuses the request that crossed the limit — nothing unchecked gets through, and large legitimate uploads break',
      'Отклоняет перешедший границу запрос: непроверенное не пройдёт, но крупные легитимные загрузки перестанут работать',
    ),
  },
  ProcessPartial: {
    label: lab('Process partial', 'Проверить начало'),
    note: lab(
      'Inspects the part that fits and lets the rest through unchecked — an attack past the limit goes unseen',
      'Проверяет уместившуюся часть и пропускает остальное непроверенным — атака за границей останется незамеченной',
    ),
  },
};

const AUDIT_TYPE_VALUES: Record<string, DirectiveValue> = {
  Serial: {
    label: lab('Serial', 'Один файл'),
    note: lab(
      'All entries go into a single file — simple to read, but writes are serialised and slow under load',
      'Все записи идут в один файл: читать просто, но записи выстраиваются в очередь и тормозят под нагрузкой',
    ),
  },
  Concurrent: {
    label: lab('Concurrent', 'Файл на транзакцию'),
    note: lab(
      'One file per transaction under SecAuditLogStorageDir — the only type that scales, and the only one mlogc accepts',
      'По файлу на транзакцию в SecAuditLogStorageDir — единственный тип, который держит нагрузку и который принимает mlogc',
    ),
  },
};

const AUDIT_FORMAT_VALUES: Record<string, DirectiveValue> = {
  Native: {
    label: lab('Native', 'Родной'),
    note: lab(
      'The classic multi-part text format — readable by eye, awkward for machines',
      'Классический текстовый формат из частей — читается глазами, разбирается машиной с трудом',
    ),
  },
  JSON: {
    label: lab('JSON', 'JSON'),
    note: lab(
      'One JSON object per entry — what log collectors expect',
      'По одному объекту JSON на запись — то, чего ждут сборщики журналов',
    ),
  },
};

const COOKIE_FORMAT_VALUES: Record<string, DirectiveValue> = {
  0: {
    label: lab('0 — Netscape', '0 — Netscape'),
    note: lab('The original cookie format; this is what browsers send', 'Исходный формат печенья — именно так их шлют браузеры'),
  },
  1: {
    label: lab('1 — RFC 2965', '1 — RFC 2965'),
    note: lab(
      'Version 1 cookies with attributes — rare in the wild, and parsing ordinary cookies this way loses values',
      'Печенье версии 1 с атрибутами — в жизни встречается редко, а обычное печенье при таком разборе теряется',
    ),
  },
};

/** Уровни отладочного журнала: чем выше, тем дороже и подробнее. */
const DEBUG_LEVEL_VALUES: Record<string, DirectiveValue> = {
  0: { label: lab('0 — Nothing', '0 — Ничего'), note: lab('No debug output at all', 'Отладочный вывод выключен') },
  1: { label: lab('1 — Errors', '1 — Ошибки'), note: lab('Intercepted transactions only', 'Только прерванные транзакции') },
  2: { label: lab('2 — Warnings', '2 — Предупреждения'), note: lab('Errors and warnings', 'Ошибки и предупреждения') },
  3: { label: lab('3 — Notices', '3 — Замечания'), note: lab('Adds notices about what the engine decided', 'Добавляет замечания о решениях движка') },
  4: {
    label: lab('4 — Rule details', '4 — Ход правил'),
    note: lab(
      'Shows how each transaction was handled — the level at which a silent rule is debugged',
      'Показывает, как обработана каждая транзакция, — уровень, на котором разбирают молчащее правило',
    ),
  },
  5: { label: lab('5 — With I/O', '5 — С вводом-выводом'), note: lab('As above plus payload reads and writes', 'То же плюс чтение и запись данных') },
  6: { label: lab('6 — Verbose', '6 — Подробно'), note: lab('Between rule tracing and full dump', 'Между ходом правил и полным дампом') },
  7: { label: lab('7 — Verbose', '7 — Подробно'), note: lab('Between rule tracing and full dump', 'Между ходом правил и полным дампом') },
  8: { label: lab('8 — Verbose', '8 — Подробно'), note: lab('Between rule tracing and full dump', 'Между ходом правил и полным дампом') },
  9: {
    label: lab('9 — Everything', '9 — Всё'),
    note: lab(
      'Logs everything, including the engine internals — unusable in production, the log outgrows the traffic',
      'Пишет всё, вплоть до внутренностей движка, — в бою неприменимо: журнал обгоняет трафик',
    ),
  },
};

/* ------------------------------------------------------------------ */
/* Части журнала аудита                                                */
/* ------------------------------------------------------------------ */

/**
 * Буквы `SecAuditLogParts` с расшифровкой.
 *
 * В файле это слипшаяся строка вроде `ABIJDEFHZ`, и прочитать её можно
 * только по памяти. Здесь у каждой буквы есть название — то, чем чип в
 * поле отличается от одинокого символа.
 */
export const AUDIT_LOG_PARTS: Record<string, DirectiveValue> = {
  A: {
    label: lab('A — Header', 'A — Заголовок записи'),
    note: lab('Mandatory: timestamp, unique id, addresses', 'Обязательная: время, уникальный номер, адреса'),
  },
  B: { label: lab('B — Request headers', 'B — Заголовки запроса'), note: lab('Request line and headers', 'Строка запроса и его заголовки') },
  C: { label: lab('C — Request body', 'C — Тело запроса'), note: lab('Body as it arrived, files included', 'Тело как пришло, вместе с файлами') },
  D: { label: lab('D — Reserved', 'D — Зарезервирована'), note: lab('Set aside for intermediate response headers; not implemented', 'Отведена под промежуточные заголовки ответа; не реализована') },
  E: { label: lab('E — Response body', 'E — Тело ответа'), note: lab('Needs SecResponseBodyAccess On', 'Требует SecResponseBodyAccess On') },
  F: { label: lab('F — Response headers', 'F — Заголовки ответа'), note: lab('Status line and response headers', 'Строка состояния и заголовки ответа') },
  G: { label: lab('G — Reserved', 'G — Зарезервирована'), note: lab('Set aside for the response body; not implemented', 'Отведена под тело ответа; не реализована') },
  H: { label: lab('H — Trailer', 'H — Итог записи'), note: lab('Which rules fired and what the engine did about it', 'Какие правила сработали и что движок с этим сделал') },
  I: {
    label: lab('I — Body without files', 'I — Тело без файлов'),
    note: lab(
      'Replaces C: multipart body with the file contents cut out — the usual way to keep uploads out of the log',
      'Заменяет C: многочастное тело без содержимого файлов — обычный способ не тащить загрузки в журнал',
    ),
  },
  J: { label: lab('J — Uploaded files', 'J — Сведения о файлах'), note: lab('Names and sizes of uploaded files', 'Имена и размеры загруженных файлов') },
  K: {
    label: lab('K — All matched rules', 'K — Все совпавшие правила'),
    note: lab('Every rule that matched, in order — bulky, and the log grows fast', 'Все сработавшие правила по порядку — объёмно, журнал растёт быстро'),
  },
  Z: {
    label: lab('Z — Final boundary', 'Z — Конец записи'),
    note: lab('Mandatory and always last: without it the entry is unterminated', 'Обязательная и всегда последняя: без неё запись не закрыта'),
  },
};

/* ------------------------------------------------------------------ */
/* Таблица директив                                                    */
/* ------------------------------------------------------------------ */

/** Строка таблицы до того, как раздел проставит общее поле. */
type DirectiveEntry = Omit<DirectiveMeta, 'group' | 'common'> & { common?: boolean };

/** Раздел таблицы: название группы задаётся один раз на всех. */
function directiveGroup(
  group: Label,
  items: Record<string, DirectiveEntry>,
): Record<string, DirectiveMeta> {
  return Object.fromEntries(
    Object.entries(items).map(([name, entry]) => [
      name,
      { ...entry, group, common: entry.common ?? false },
    ]),
  );
}

const BYTES = lab('bytes', 'байт');
const SECONDS = lab('seconds', 'секунд');

export const DIRECTIVE_META: Record<string, DirectiveMeta> = {
  // Единственная директива не из семейства `Sec*`, и стоит она первой не по
  // алфавиту: с неё начинается почти каждый профиль, и порядок её строк
  // решает, что чем перекрыто.
  ...directiveGroup(FILES, {
    Include: {
      arg: 'path',
      common: true,
      hints: [
        {
          value: '@coraza.conf-recommended',
          hint: lab('Engine defaults from the image', 'Умолчания движка из образа'),
        },
        {
          value: '@crs-setup.conf.example',
          hint: lab('CRS settings before the set itself', 'Настройка CRS до самого набора'),
        },
        {
          value: '@owasp_crs/REQUEST-*.conf',
          hint: lab('CRS rules of the request side', 'Правила CRS на стороне запроса'),
        },
        {
          value: '@owasp_crs/RESPONSE-*.conf',
          hint: lab('CRS rules of the response side', 'Правила CRS на стороне ответа'),
        },
      ],
      label: lab('Include file', 'Включить файл'),
      note: lab(
        'Reads another file right here: "@" names a set built into the image, any other path is read next to this file',
        'Читает на этом месте другой файл: «@» называет набор из образа, любой другой путь читается рядом с этим файлом',
      ),
    },
  }),
  ...directiveGroup(ENGINE, {
    SecRuleEngine: {
      arg: 'toggle',
      values: RULE_ENGINE_VALUES,
      common: true,
      label: lab('Rule engine', 'Движок правил'),
      note: lab(
        'The single switch between watching and blocking — everything else in the file depends on it',
        'Единственный переключатель между наблюдением и блокировкой: от него зависит всё остальное в файле',
      ),
    },
    SecDefaultAction: {
      arg: 'actions',
      quoted: true,
      common: true,
      label: lab('Default actions', 'Действия по умолчанию'),
      note: lab(
        'What every rule below inherits when it states nothing of its own; one default per phase',
        'Что наследует каждое правило ниже, если не указало своего; по одному умолчанию на фазу',
      ),
    },
    SecRuleInheritance: {
      arg: 'toggle',
      values: onOff(
        'A nested context keeps the rules of the parent one',
        'Вложенный контекст получает правила родительского',
        'A nested context starts with no rules at all — they have to be declared again',
        'Вложенный контекст начинается без правил вовсе: их придётся объявить заново',
      ),
      label: lab('Rule inheritance', 'Наследование правил'),
      note: lab(
        'Whether a location or virtual host inherits the rules declared above it',
        'Достаются ли локации или виртуальному хосту правила, объявленные выше',
      ),
    },
    SecInterceptOnError: {
      arg: 'toggle',
      values: onOff(
        'An operator that failed to run interrupts the transaction',
        'Не сумевший отработать оператор прерывает транзакцию',
        'A failed operator is treated as no match and the request goes on',
        'Не сумевший отработать оператор считается несовпавшим, и запрос идёт дальше',
      ),
      label: lab('Intercept on error', 'Прерывать при сбое'),
      note: lab(
        'What to do when an operator itself fails — for example when a regex hits the PCRE limit',
        'Что делать, когда сбоит сам оператор, — например, когда регулярное выражение упёрлось в предел PCRE',
      ),
    },
    SecStatusEngine: {
      arg: 'toggle',
      values: onOff(
        'Sends version and platform data to the ModSecurity project once at startup',
        'Один раз при запуске отправляет проекту ModSecurity сведения о версии и платформе',
        'Sends nothing anywhere',
        'Ничего никуда не отправляет',
      ),
      label: lab('Status reporting', 'Отчёт о версии'),
      note: lab(
        'Reporting the build back to the project — an outbound request from the server',
        'Сообщение о сборке разработчикам — исходящий запрос с сервера',
      ),
    },
  }),

  ...directiveGroup(EXCLUSIONS, {
    SecRuleRemoveById: {
      arg: 'exclusion',
      common: true,
      label: lab('Remove rule by id', 'Снять правило по номеру'),
      note: lab(
        'Removes the rules with these numbers or ranges; must stand below its target',
        'Снимает правила с этими номерами или диапазонами; обязана стоять ниже своей цели',
      ),
    },
    SecRuleRemoveByMsg: {
      arg: 'exclusion',
      label: lab('Remove rule by message', 'Снять правило по сообщению'),
      note: lab(
        'Selects by a regex over msg — fragile, since the text changes between rule set versions',
        'Выбирает по регулярному выражению над msg — ненадёжно: текст меняется от версии набора к версии',
      ),
    },
    SecRuleRemoveByTag: {
      arg: 'exclusion',
      label: lab('Remove rule by tag', 'Снять правило по метке'),
      note: lab(
        'Selects by a regex over tags — one line can take out half a rule set',
        'Выбирает по регулярному выражению над метками — одной строкой можно снять полнабора',
      ),
    },
    SecRuleUpdateTargetById: {
      arg: 'exclusion',
      common: true,
      label: lab('Update rule targets by id', 'Изменить цели по номеру'),
      note: lab(
        'Keeps the rule working and stops it looking at one place — the usual false positive fix',
        'Оставляет правило в работе и отучает его смотреть в одно место — обычное лечение ложного срабатывания',
      ),
    },
    SecRuleUpdateTargetByMsg: {
      arg: 'exclusion',
      label: lab('Update rule targets by message', 'Изменить цели по сообщению'),
      note: lab('Same, selecting rules by a regex over msg', 'То же, но правила выбираются регулярным выражением над msg'),
    },
    SecRuleUpdateTargetByTag: {
      arg: 'exclusion',
      label: lab('Update rule targets by tag', 'Изменить цели по метке'),
      note: lab('Same, selecting rules by a regex over tags', 'То же, но правила выбираются регулярным выражением над метками'),
    },
    SecRuleUpdateActionById: {
      arg: 'exclusion',
      label: lab('Update rule actions by id', 'Изменить действия по номеру'),
      note: lab(
        'Appends actions to an existing rule; id and phase cannot be changed this way',
        'Дописывает действия существующему правилу; номер и фазу так не поменять',
      ),
    },
  }),

  ...directiveGroup(REQUEST_BODY, {
    SecRequestBodyAccess: {
      arg: 'toggle',
      values: onOff(
        'The body is buffered and parsed, and phase 2 rules can see it',
        'Тело буферизуется и разбирается, и правила второй фазы его видят',
        'No rule sees the request body at all — checks over ARGS_POST and REQUEST_BODY never fire',
        'Тела запроса не видит ни одно правило: проверки над ARGS_POST и REQUEST_BODY не сработают никогда',
      ),
      common: true,
      label: lab('Request body access', 'Доступ к телу запроса'),
      note: lab(
        'Without it every phase 2 check over the body is dead weight',
        'Без него любая проверка тела во второй фазе — мёртвый груз',
      ),
    },
    SecRequestBodyLimit: {
      arg: 'number',
      unit: BYTES,
      hints: [
        { value: '13107200', hint: lab('12.5 MB — the CRS default', '12,5 МБ — умолчание CRS') },
        { value: '134217728', hint: lab('128 MB — for services that accept large uploads', '128 МБ — для сервисов с крупными загрузками') },
      ],
      common: true,
      label: lab('Request body limit', 'Предел тела запроса'),
      note: lab(
        'The largest body accepted; what happens at the edge is decided by SecRequestBodyLimitAction',
        'Наибольшее принимаемое тело; что происходит на границе, решает SecRequestBodyLimitAction',
      ),
    },
    SecRequestBodyNoFilesLimit: {
      arg: 'number',
      unit: BYTES,
      hints: [{ value: '131072', hint: lab('128 KB — the CRS default', '128 КБ — умолчание CRS') }],
      label: lab('Body limit without files', 'Предел тела без файлов'),
      note: lab(
        'The same limit counted without uploaded files — keep it small, this is the part rules actually read',
        'Тот же предел без учёта загружаемых файлов — держат небольшим: именно эту часть и читают правила',
      ),
    },
    SecRequestBodyInMemoryLimit: {
      arg: 'number',
      unit: BYTES,
      hints: [{ value: '131072', hint: lab('128 KB — the usual value', '128 КБ — обычное значение') }],
      label: lab('In-memory body limit', 'Предел тела в памяти'),
      note: lab(
        'How much of the body is kept in RAM before the rest goes to a temporary file',
        'Сколько тела держится в памяти, прежде чем остаток уйдёт во временный файл',
      ),
    },
    SecRequestBodyLimitAction: {
      arg: 'enum',
      values: LIMIT_ACTION_VALUES,
      label: lab('At the request body limit', 'На границе тела запроса'),
      note: lab(
        'Reject the oversized request or inspect only the part that fits',
        'Отклонить перешедший границу запрос или проверить только уместившуюся часть',
      ),
    },
    SecStreamInBodyInspection: {
      arg: 'toggle',
      values: onOff(
        'Fills STREAM_INPUT_BODY, which can be modified in place',
        'Заполняет STREAM_INPUT_BODY, который можно править на месте',
        'STREAM_INPUT_BODY stays empty',
        'STREAM_INPUT_BODY остаётся пустым',
      ),
      label: lab('Stream input inspection', 'Потоковый разбор запроса'),
      note: lab(
        'Gives rules the raw request body as a stream, on top of the parsed one',
        'Даёт правилам сырое тело запроса потоком, вдобавок к разобранному',
      ),
    },
  }),

  ...directiveGroup(RESPONSE_BODY, {
    SecResponseBodyAccess: {
      arg: 'toggle',
      values: onOff(
        'The response body is buffered, and phase 4 rules can see it',
        'Тело ответа буферизуется, и правила четвёртой фазы его видят',
        'RESPONSE_BODY is empty and every check over it never fires',
        'RESPONSE_BODY пуст, и любая проверка над ним не срабатывает никогда',
      ),
      common: true,
      label: lab('Response body access', 'Доступ к телу ответа'),
      note: lab(
        'Costly: the answer is held whole in memory before it reaches the client',
        'Дорого: ответ целиком удерживается в памяти, прежде чем уйти клиенту',
      ),
    },
    SecResponseBodyLimit: {
      arg: 'number',
      unit: BYTES,
      hints: [{ value: '524288', hint: lab('512 KB — the usual value', '512 КБ — обычное значение') }],
      label: lab('Response body limit', 'Предел тела ответа'),
      note: lab('The largest response body buffered for inspection', 'Наибольшее тело ответа, удерживаемое для проверки'),
    },
    SecResponseBodyLimitAction: {
      arg: 'enum',
      values: LIMIT_ACTION_VALUES,
      label: lab('At the response body limit', 'На границе тела ответа'),
      note: lab(
        'Reject the oversized response or inspect only the part that fits',
        'Отклонить перешедший границу ответ или проверить только уместившуюся часть',
      ),
    },
    SecResponseBodyMimeType: {
      arg: 'list',
      hints: [
        { value: 'text/plain', hint: lab('Plain text', 'Обычный текст') },
        { value: 'text/html', hint: lab('HTML pages', 'Страницы HTML') },
        { value: 'text/xml', hint: lab('XML documents', 'Документы XML') },
        { value: 'application/json', hint: lab('JSON answers from an API', 'Ответы API в JSON') },
      ],
      label: lab('Inspected response types', 'Проверяемые типы ответа'),
      note: lab(
        'Which content types are buffered — everything outside the list goes to the client unread',
        'Какие типы содержимого буферизуются: всё, чего нет в списке, уходит клиенту непрочитанным',
      ),
    },
    SecResponseBodyMimeTypesClear: {
      arg: 'none',
      label: lab('Clear response types', 'Очистить типы ответа'),
      note: lab(
        'Empties the list before filling it anew — otherwise the inherited types stay',
        'Опустошает список перед тем, как набрать его заново, — иначе унаследованные типы останутся',
      ),
    },
    SecStreamOutBodyInspection: {
      arg: 'toggle',
      values: onOff(
        'Fills STREAM_OUTPUT_BODY, which can be modified in place',
        'Заполняет STREAM_OUTPUT_BODY, который можно править на месте',
        'STREAM_OUTPUT_BODY stays empty',
        'STREAM_OUTPUT_BODY остаётся пустым',
      ),
      label: lab('Stream output inspection', 'Потоковый разбор ответа'),
      note: lab('Gives rules the raw response body as a stream', 'Даёт правилам сырое тело ответа потоком'),
    },
    SecContentInjection: {
      arg: 'toggle',
      values: onOff(
        'Allows append and prepend to add content to the answer',
        'Разрешает действиям append и prepend дописывать содержимое к ответу',
        'append and prepend do nothing at all',
        'Действия append и prepend не делают ничего',
      ),
      label: lab('Content injection', 'Вставка содержимого'),
      note: lab(
        'Whether rules are allowed to change the answer, not just judge it',
        'Позволено ли правилам менять ответ, а не только судить о нём',
      ),
    },
  }),

  ...directiveGroup(AUDIT, {
    SecAuditEngine: {
      arg: 'toggle',
      values: AUDIT_ENGINE_VALUES,
      common: true,
      label: lab('Audit engine', 'Журнал аудита'),
      note: lab(
        'Whether transactions are written to the audit log and which of them',
        'Пишутся ли транзакции в журнал аудита и какие именно',
      ),
    },
    SecAuditLog: {
      arg: 'path',
      hints: [{ value: '/var/log/modsec_audit.log', hint: lab('The usual place', 'Обычное место') }],
      common: true,
      label: lab('Audit log file', 'Файл журнала аудита'),
      note: lab(
        'The main log file; with a concurrent log this holds the index only',
        'Основной файл журнала; при пофайловом типе в нём остаётся только указатель',
      ),
    },
    SecAuditLog2: {
      arg: 'path',
      label: lab('Second audit log', 'Второй журнал аудита'),
      note: lab(
        'A duplicate index file — only makes sense with a concurrent log',
        'Дублирующий файл указателя — осмыслен только при пофайловом журнале',
      ),
    },
    SecAuditLogParts: {
      arg: 'flags',
      common: true,
      label: lab('Audit log parts', 'Части записи журнала'),
      note: lab(
        'Which sections make up an entry; A and Z are mandatory and Z is always last',
        'Из каких разделов состоит запись; A и Z обязательны, Z всегда последняя',
      ),
    },
    SecAuditLogType: {
      arg: 'enum',
      values: AUDIT_TYPE_VALUES,
      label: lab('Audit log type', 'Тип журнала аудита'),
      note: lab('One shared file or a file per transaction', 'Один общий файл или файл на транзакцию'),
    },
    SecAuditLogStorageDir: {
      arg: 'path',
      hints: [{ value: '/var/log/modsec_audit', hint: lab('The usual place', 'Обычное место') }],
      label: lab('Audit log directory', 'Каталог журнала аудита'),
      note: lab(
        'Where per-transaction files go — required by the concurrent type',
        'Куда складываются файлы транзакций — нужен при пофайловом типе',
      ),
    },
    SecAuditLogFormat: {
      arg: 'enum',
      values: AUDIT_FORMAT_VALUES,
      label: lab('Audit log format', 'Формат журнала аудита'),
      note: lab('How an entry is written: native text or JSON', 'Как записывается запись: родным текстом или в JSON'),
    },
    SecAuditLogRelevantStatus: {
      arg: 'regex',
      quoted: true,
      hints: [
        {
          value: '^(?:5|4(?!04))',
          hint: lab('Server errors and client errors except 404', 'Ошибки сервера и клиента, кроме 404'),
        },
      ],
      label: lab('Relevant response status', 'Значимые коды ответа'),
      note: lab(
        'A regex over the response code: what counts as relevant on top of what rules marked',
        'Регулярное выражение над кодом ответа: что считать значимым сверх отмеченного правилами',
      ),
    },
  }),

  ...directiveGroup(DEBUG, {
    SecDebugLog: {
      arg: 'path',
      hints: [{ value: '/var/log/modsec_debug.log', hint: lab('The usual place', 'Обычное место') }],
      label: lab('Debug log file', 'Файл отладочного журнала'),
      note: lab('Where the engine writes what it is doing', 'Куда движок пишет, что он делает'),
    },
    SecDebugLogLevel: {
      arg: 'enum',
      values: DEBUG_LEVEL_VALUES,
      common: true,
      label: lab('Debug log level', 'Уровень отладки'),
      note: lab(
        'How much detail: above 4 the log grows faster than the traffic',
        'Насколько подробно: выше 4 журнал растёт быстрее самого трафика',
      ),
    },
  }),

  ...directiveGroup(UPLOADS, {
    SecUploadDir: {
      arg: 'path',
      hints: [{ value: '/var/cache/modsecurity/upload', hint: lab('The usual place', 'Обычное место') }],
      label: lab('Upload directory', 'Каталог загрузок'),
      note: lab(
        'Where intercepted uploads are stored; must not be readable by the web server',
        'Куда складываются перехваченные загрузки; веб-сервер не должен иметь к нему доступа на чтение',
      ),
    },
    SecUploadKeepFiles: {
      arg: 'toggle',
      values: KEEP_FILES_VALUES,
      label: lab('Keep uploaded files', 'Сохранять загрузки'),
      note: lab(
        'Which uploaded files survive the transaction — someone else data on your disk',
        'Какие загруженные файлы переживают транзакцию — чужие данные на вашем диске',
      ),
    },
    SecUploadFileMode: {
      arg: 'mode',
      hints: [
        { value: '0600', hint: lab('Owner only — the safe default', 'Только владельцу — безопасное умолчание') },
        { value: '0640', hint: lab('Owner writes, group reads — for an external scanner', 'Владельцу запись, группе чтение — для внешнего сканера') },
      ],
      label: lab('Upload file mode', 'Права на файлы загрузок'),
      note: lab(
        'Octal permissions for stored uploads — anything wider hands the data to whoever asks',
        'Восьмеричные права на сохранённые загрузки: шире — значит отдать данные любому желающему',
      ),
    },
    SecUploadFileLimit: {
      arg: 'number',
      hints: [{ value: '100', hint: lab('The usual value', 'Обычное значение') }],
      label: lab('Upload count limit', 'Предел числа файлов'),
      note: lab(
        'How many files one request may carry — beyond it the parse stops',
        'Сколько файлов может нести один запрос — за пределом разбор прекращается',
      ),
    },
  }),

  ...directiveGroup(STORAGE, {
    SecTmpDir: {
      arg: 'path',
      hints: [{ value: '/tmp/modsecurity/tmp', hint: lab('The usual place', 'Обычное место') }],
      label: lab('Temporary directory', 'Временный каталог'),
      note: lab('Where request bodies too big for memory are spilled', 'Куда сбрасываются тела запросов, не поместившиеся в память'),
    },
    SecDataDir: {
      arg: 'path',
      hints: [{ value: '/var/cache/modsecurity/data', hint: lab('The usual place', 'Обычное место') }],
      label: lab('Data directory', 'Каталог данных'),
      note: lab(
        'Where persistent collections live — without it setvar over IP or SESSION forgets everything between requests',
        'Где живут долгоживущие коллекции — без него setvar над IP или SESSION забывает всё между запросами',
      ),
    },
    SecUnicodeMapFile: {
      arg: 'path',
      hints: [{ value: '/usr/share/modsecurity/unicode.mapping', hint: lab('The file shipped with the engine', 'Файл, идущий с движком') }],
      label: lab('Unicode mapping file', 'Файл соответствий Unicode'),
      note: lab('The table t:urlDecodeUni relies on', 'Таблица, на которую опирается t:urlDecodeUni'),
    },
  }),

  ...directiveGroup(LIMITS, {
    SecArgumentSeparator: {
      arg: 'text',
      hints: [
        { value: '&', hint: lab('The standard separator', 'Стандартный разделитель') },
        { value: ';', hint: lab('For applications that split parameters by a semicolon', 'Для приложений, разделяющих параметры точкой с запятой') },
      ],
      label: lab('Argument separator', 'Разделитель параметров'),
      note: lab(
        'The character splitting the query string — set it wrong and ARGS is parsed into the wrong pieces',
        'Символ, по которому режется строка запроса: ошибка здесь — и ARGS разбирается не на те части',
      ),
    },
    SecCookieFormat: {
      arg: 'enum',
      values: COOKIE_FORMAT_VALUES,
      label: lab('Cookie format', 'Формат печенья'),
      note: lab('How the Cookie header is parsed', 'Как разбирается заголовок Cookie'),
    },
    SecPcreMatchLimit: {
      arg: 'number',
      hints: [{ value: '1000', hint: lab('The usual value', 'Обычное значение') }],
      label: lab('PCRE match limit', 'Предел работы PCRE'),
      note: lab(
        'How much work one regex may do — the guard against a pattern that hangs on a crafted input',
        'Сколько работы отпущено одному регулярному выражению — защита от шаблона, зависающего на подобранном входе',
      ),
    },
    SecPcreMatchLimitRecursion: {
      arg: 'number',
      hints: [{ value: '1000', hint: lab('The usual value', 'Обычное значение') }],
      label: lab('PCRE recursion limit', 'Предел рекурсии PCRE'),
      note: lab('The same guard for the depth of nested matching', 'Та же защита, но для глубины вложенного сопоставления'),
    },
    SecCollectionTimeout: {
      arg: 'number',
      unit: SECONDS,
      hints: [{ value: '3600', hint: lab('An hour — the default', 'Час — значение по умолчанию') }],
      label: lab('Collection timeout', 'Время жизни коллекции'),
      note: lab(
        'How long a persistent collection lives without being touched — the lifetime of a counter between requests',
        'Сколько живёт нетронутая долгоживущая коллекция — срок жизни счётчика между запросами',
      ),
    },
  }),

  ...directiveGroup(SIGNATURES, {
    SecComponentSignature: {
      arg: 'text',
      quoted: true,
      hints: [{ value: 'OWASP_CRS/3.3.4', hint: lab('How CRS names itself', 'Как называет себя CRS') }],
      label: lab('Component signature', 'Подпись набора'),
      note: lab(
        'How a rule set names itself in the audit log — how you tell which version fired',
        'Как набор правил называет себя в журнале аудита — по этому и узнают, какая версия сработала',
      ),
    },
    SecServerSignature: {
      arg: 'text',
      quoted: true,
      hints: [{ value: 'Apache/2.2.15 (Unix)', hint: lab('Pretending to be another build', 'Выдать себя за другую сборку') }],
      label: lab('Server signature', 'Подпись сервера'),
      note: lab(
        'Replaces the Server header; needs ServerTokens Full to have room to write into',
        'Заменяет заголовок Server; требует ServerTokens Full, иначе писать некуда',
      ),
    },
  }),
};

/** Имена директив, у которых есть форма, в порядке таблицы. */
export const DIRECTIVE_FORM_NAMES = Object.keys(DIRECTIVE_META);

export function directiveMeta(name: string): DirectiveMeta | null {
  return DIRECTIVE_META[name] ?? null;
}

/**
 * Каноничное написание имени директивы.
 *
 * ModSecurity читает имена без учёта регистра, и в файлах встречается
 * `secruleengine`. Форма же ищет себя в таблице по имени, и без приведения
 * та же самая директива осталась бы строкой.
 */
const CANONICAL = new Map(DIRECTIVE_FORM_NAMES.map((name) => [name.toLowerCase(), name]));

export function canonicalDirectiveName(name: string): string | null {
  return CANONICAL.get(name.toLowerCase()) ?? null;
}

/* ------------------------------------------------------------------ */
/* Разбор                                                              */
/* ------------------------------------------------------------------ */

/**
 * Значение, в котором стоит макрос, формой не правится.
 *
 * `%{tx.limit}` раскрывается движком в момент работы, а поле показало бы
 * его как обычный текст — и список выбора объявил бы его негодным. Такая
 * строка честнее выглядит строкой.
 */
function hasMacro(value: string): boolean {
  return value.includes('%{');
}

/**
 * Почему у строки не вышло формы.
 *
 * Не всякий отказ — беда: `SecRuleScript` формы просто не заведено, а
 * лишний аргумент у `SecRuleEngine` ModSecurity не примет. Разбор эту
 * разницу знает, и рассказать о ней должен он, а не тот, кто увидел `null`
 * и догадывается.
 */
export type DirectiveRefusal =
  /** Имени нет в таблице: чужая директива или та, что осталась строкой. */
  | 'unknown'
  /** Аргументов больше, чем вид вмещает. */
  | 'args'
  /** В значении макрос `%{...}`: поле показало бы его текстом. */
  | 'macro'
  /** Запись не того вида: `+E` в частях журнала — синтаксис `ctl`. */
  | 'syntax';

/** Разбор целиком: либо форма, либо причина, по которой её нет. */
export type DirectiveRead =
  | { form: DirectiveForm; refusal: null }
  | { form: null; refusal: DirectiveRefusal };

function ok(form: DirectiveForm): DirectiveRead {
  return { form, refusal: null };
}

function no(refusal: DirectiveRefusal): DirectiveRead {
  return { form: null, refusal };
}

/**
 * Разбирает директиву в форму или объясняет, почему формы нет.
 *
 * Отказ здесь не редкость и не сбой: незнакомое имя, лишний аргумент,
 * макрос в значении. Во всех трёх случаях форма показала бы меньше, чем
 * есть в строке, а сохранила бы ровно то, что показала.
 */
export function parseDirective(statement: DirectiveStatement): DirectiveRead {
  const name = canonicalDirectiveName(statement.name);
  if (name === null) return no('unknown');

  const meta = DIRECTIVE_META[name];
  const args = statement.args;

  if (meta.arg === 'exclusion') return readExclusionForm(name, args);

  if (meta.arg === 'list') {
    if (args.some(hasMacro)) return no('macro');
    return ok({ arg: 'list', name, items: [...args] });
  }

  if (meta.arg === 'none') {
    return args.length === 0 ? ok({ arg: 'none', name }) : no('args');
  }

  // Дальше у всех видов аргумент ровно один. Пустой — это незаполненная
  // директива: форма её показывает и подсвечивает, потому что дописать
  // недостающее в поле проще, чем в строке.
  if (args.length > 1) return no('args');
  const value = args[0] ?? '';
  if (hasMacro(value)) return no('macro');

  if (meta.arg === 'actions') {
    return ok({ arg: 'actions', name, actions: parseActions(value) });
  }

  if (meta.arg === 'flags') {
    // Плюс и минус перед буквой понимает `ctl:auditLogParts`, а не сама
    // директива: здесь такая запись — не набор частей, а чужой синтаксис.
    if (value !== '' && !/^[A-Za-z]+$/.test(value)) return no('syntax');
    return ok({ arg: 'flags', name, parts: value.toUpperCase().split('') });
  }

  return ok({ arg: meta.arg, name, value });
}

/** Форма директивы; `null` — остаётся текстовое поле. */
export function readDirective(statement: DirectiveStatement): DirectiveForm | null {
  return parseDirective(statement).form;
}

/**
 * Разбирает директиву-исключение.
 *
 * Аргументов у неё до трёх, и что стоит на каждом месте, задаёт имя:
 * `SecRuleRemoveById` забирает под выборку все аргументы, `SecRuleUpdate*` —
 * только первый, а за ним идёт то, что правилу приписывают.
 */
function readExclusionForm(name: string, args: string[]): DirectiveRead {
  const kind = exclusionDirectiveKind(name);
  if (kind === null) return no('unknown');

  if (kind.op === 'remove') {
    // Номеров бывает сколько угодно: `SecRuleRemoveById 1 2 942100-942200`.
    if (kind.selector !== 'id' && args.length > 1) return no('args');
    const pick = kind.selector === 'id' ? args.join(' ') : (args[0] ?? '');
    return ok({ arg: 'exclusion', name, pick, payload: '', replaced: '' });
  }

  const limit = kind.op === 'updateTarget' ? 3 : 2;
  if (args.length > limit) return no('args');

  return ok({
    arg: 'exclusion',
    name,
    pick: args[0] ?? '',
    payload: args[1] ?? '',
    replaced: args[2] ?? '',
  });
}

/* ------------------------------------------------------------------ */
/* Сборка                                                              */
/* ------------------------------------------------------------------ */

/**
 * Собирает директиву обратно в строку файла.
 *
 * Кавычки расставляются по виду аргумента, а не по тому, как было
 * написано: снятые разбором, они не хранятся нигде, зато вид аргумента
 * знает, нужны ли они. Строка, записанная канонически, проходит обход
 * побайтово — это и держит тест.
 */
export function emitDirective(form: DirectiveForm): string {
  const meta = DIRECTIVE_META[form.name];

  switch (form.arg) {
    case 'none':
      return form.name;

    case 'flags':
      return join(form.name, form.parts.join(''));

    case 'list':
      return [form.name, ...form.items.map(dquoteArgument)].join(' ');

    case 'actions':
      return join(form.name, serializeActions(form.actions), true);

    case 'exclusion':
      return emitExclusionForm(form);

    default:
      return join(form.name, form.value, meta?.quoted ?? false);
  }
}

/**
 * Имя и единственный аргумент.
 *
 * Пустой аргумент не пишется вовсе: `SecRuleEngine ""` ModSecurity прочитал
 * бы как заданное пустое значение, а незаполненное поле значит, что значения
 * ещё нет. Директива без аргумента — то же самое незаполненное, и о ней
 * диагностика говорит отдельно.
 */
function join(name: string, value: string, quoted = false): string {
  if (value === '') return name;
  return `${name} ${quoted ? dquote(value) : dquoteArgument(value)}`;
}

function emitExclusionForm(form: DirectiveExclusionForm): string {
  const kind = exclusionDirectiveKind(form.name);
  const parts = [form.name];

  // Номера кавычек не берут: `SecRuleRemoveById 1 2 3` — это три аргумента,
  // и в кавычках они слиплись бы в одно нечитаемое имя. Шаблон и метка,
  // наоборот, в кавычках всегда: так эти директивы и пишут.
  if (form.pick !== '') {
    parts.push(kind?.selector === 'id' ? form.pick : dquote(form.pick));
  }

  if (kind !== null && kind.op !== 'remove' && form.payload !== '') {
    parts.push(dquote(form.payload));
  }
  if (kind?.op === 'updateTarget' && form.replaced !== '') {
    parts.push(dquote(form.replaced));
  }

  return parts.join(' ');
}

/* ------------------------------------------------------------------ */
/* SecDefaultAction в терминах формы                                   */
/* ------------------------------------------------------------------ */

/**
 * Умолчания фазы, разложенные по полям.
 *
 * Своя раскладка, а не та, что у правила: половина полей правила здесь
 * запрещена или бессмысленна — `id` у умолчаний не бывает, `msg` некуда
 * приписать. И наоборот, конвейер `t:` тут остаться обязан: раскладка
 * правила уносит его в условие, а у умолчаний условия нет, и потерялся бы
 * он молча.
 */
export interface DefaultActionForm {
  phase: string;
  disruptive: string;
  /** Адрес для `redirect` и `proxy`; у остальных реакций пусто. */
  disruptiveValue: string;
  status: string;
  /** `log` / `nolog`; `null` — не задано. */
  log: boolean | null;
  /** `auditlog` / `noauditlog`; `null` — не задано. */
  auditlog: boolean | null;
  /** Всё остальное дословно, включая конвейер `t:` и второй `deny`. */
  extra: RuleAction[];
}

export function readDefaultAction(actions: RuleAction[]): DefaultActionForm {
  const form: DefaultActionForm = {
    phase: '',
    disruptive: '',
    disruptiveValue: '',
    status: '',
    log: null,
    auditlog: null,
    extra: [],
  };

  for (const action of actions) {
    switch (action.name) {
      case 'phase':
        form.phase = action.value ?? '';
        continue;
      case 'status':
        form.status = action.value ?? '';
        continue;
      case 'log':
        form.log = true;
        continue;
      case 'nolog':
        form.log = false;
        continue;
      case 'auditlog':
        form.auditlog = true;
        continue;
      case 'noauditlog':
        form.auditlog = false;
        continue;
      default:
        break;
    }

    // Реакция берётся первая: вторую ModSecurity считает ошибкой
    // конфигурации, и спрятать её в поле значило бы скрыть эту ошибку.
    if (isDisruptive(action.name) && form.disruptive === '') {
      form.disruptive = action.name;
      form.disruptiveValue = action.value ?? '';
      continue;
    }

    form.extra.push(action);
  }

  return form;
}

/** Собирает умолчания обратно в список действий канонического порядка. */
export function writeDefaultAction(form: DefaultActionForm): RuleAction[] {
  const list: RuleAction[] = [];
  const add = (name: string, value?: string) => list.push({ raw: '', name, value, quoted: false });

  if (form.phase !== '') add('phase', form.phase);
  if (form.disruptive !== '') {
    add(form.disruptive, form.disruptiveValue === '' ? undefined : form.disruptiveValue);
  }
  if (form.status !== '') add('status', form.status);
  if (form.log === true) add('log');
  if (form.log === false) add('nolog');
  if (form.auditlog === true) add('auditlog');
  if (form.auditlog === false) add('noauditlog');
  list.push(...form.extra);

  return list;
}

/* ------------------------------------------------------------------ */
/* Проверка набранного                                                 */
/* ------------------------------------------------------------------ */

/**
 * Что с директивой не так.
 *
 * Одна и та же запись служит и полю, и панели диагностик: поле краснеет,
 * панель объясняет. Считать это дважды нельзя — разойдись они, поле
 * молчало бы там, где панель ругается, и наоборот.
 */
export interface DirectiveIssue {
  code:
    | 'directiveValueMissing'
    | 'directiveBadValue'
    | 'directiveNotNumber'
    | 'directiveUnknownFlag';
  /** Значение, о котором речь: негодное число, буква не из набора. */
  value: string;
}

function issue(code: DirectiveIssue['code'], value = ''): DirectiveIssue {
  return { code, value };
}

/** Восьмеричные права: `600` и `0600` — одно и то же, `0888` — не права. */
const OCTAL_MODE = /^0?[0-7]{3,4}$/;

/**
 * Замечания к набранному в форме.
 *
 * Не трогает того, о чём уже сказано в другом месте: у исключений
 * недостающую выборку разбирает `exclusions.ts`, и вторая запись о том же
 * читалась бы как две разные беды.
 */
export function directiveIssues(form: DirectiveForm): DirectiveIssue[] {
  switch (form.arg) {
    case 'none':
      return [];

    case 'flags':
      if (form.parts.length === 0) return [issue('directiveValueMissing')];
      return form.parts
        .filter((part) => AUDIT_LOG_PARTS[part] === undefined)
        .map((part) => issue('directiveUnknownFlag', part));

    case 'list':
      return form.items.length === 0 ? [issue('directiveValueMissing')] : [];

    case 'actions':
      return form.actions.length === 0 ? [issue('directiveValueMissing')] : [];

    case 'exclusion':
      return form.pick === '' ? [issue('directiveValueMissing')] : [];

    default:
      break;
  }

  if (form.value === '') return [issue('directiveValueMissing')];

  const meta = DIRECTIVE_META[form.name];
  if (form.arg === 'toggle' || form.arg === 'enum') {
    const known = meta?.values?.[form.value] !== undefined;
    return known ? [] : [issue('directiveBadValue', form.value)];
  }
  if (form.arg === 'number') {
    return /^\d+$/.test(form.value) ? [] : [issue('directiveNotNumber', form.value)];
  }
  if (form.arg === 'mode') {
    return OCTAL_MODE.test(form.value) ? [] : [issue('directiveBadValue', form.value)];
  }

  return [];
}

/* ------------------------------------------------------------------ */
/* Заготовки                                                           */
/* ------------------------------------------------------------------ */

/**
 * Пустая форма для директивы с этим именем.
 *
 * По ней заводят новую строку: имя выбрано, аргумент ещё нет — и подставить
 * его нечем, потому что `On` годится переключателю, а набору частей журнала
 * или пути не годится вовсе. Пустое поле формы говорит об этом прямо, а
 * `null` означает, что формы у имени нет и заводить нечего.
 */
export function makeDirectiveForm(name: string): DirectiveForm | null {
  const meta = directiveMeta(name);
  if (meta === null) return null;

  switch (meta.arg) {
    case 'none':
      return { arg: 'none', name };
    case 'flags':
      return { arg: 'flags', name, parts: [] };
    case 'list':
      return { arg: 'list', name, items: [] };
    case 'actions':
      return { arg: 'actions', name, actions: [] };
    case 'exclusion':
      return { arg: 'exclusion', name, pick: '', payload: '', replaced: '' };
    default:
      return { arg: meta.arg, name, value: '' };
  }
}