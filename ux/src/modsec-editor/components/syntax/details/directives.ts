import { l, type DetailsMap } from './types';

export const DIRECTIVE_DETAILS: DetailsMap = {
  Include: {
    summary: l(
      'Reads another configuration file at this exact spot, as if its text were typed here. Everything that depends on reading order — the engine mode, the default actions, exclusions of foreign rules — is counted over the expanded text, so the line where the Include stands is the line that decides.',
      'Читает другой файл конфигурации ровно на этом месте, как если бы его текст был набран здесь. Всё, что зависит от порядка чтения, — режим движка, действия по умолчанию, снятие чужих правил — считается по развёрнутому тексту, поэтому решает та строка, где стоит Include.',
    ),
    syntax: 'Include @owasp_crs/REQUEST-*.conf  |  Include ../default/00-engine.conf',
    tech: {
      argument: l(
        'One path. A path starting with "@" names a file of the set built into the image (@coraza.conf-recommended, @crs-setup.conf.example, @owasp_crs/...); any other path is read next to the including file. A "*" includes every matching file in name order.',
        'Один путь. Путь с «@» называет файл набора, встроенного в образ (@coraza.conf-recommended, @crs-setup.conf.example, @owasp_crs/…); любой другой путь читается рядом с включающим файлом. «*» включает все подходящие файлы в порядке имён.',
      ),
      scope: l(
        'Expanded while the configuration is loaded, not while a request is processed: a mistake in the path is a startup failure, not a slow rule.',
        'Раскрывается при загрузке конфигурации, а не при обработке запроса: ошибка в пути — отказ запуска, а не медленное правило.',
      ),
    },
    gotchas: [
      l(
        'The editor does not read the included file: notes of the kind "nothing in the loaded files sets this" speak only about the files open here.',
        'Редактор включённый файл не читает: замечания вида «в наборе никто этого не выставляет» говорят только про открытые здесь файлы.',
      ),
      l(
        'Settings of a rule set (crs-setup) are read before the set itself, and exclusions of its rules after it: an exclusion above the Include has nothing to remove yet.',
        'Настройка набора (crs-setup) читается до самого набора, а снятие его правил — после: исключению выше Include снимать ещё нечего.',
      ),
    ],
    example: {
      code: 'Include @coraza.conf-recommended\nInclude @crs-setup.conf.example\nInclude @owasp_crs/REQUEST-*.conf',
      caption: l(
        'The usual order: engine defaults, rule set settings, the rule set itself.',
        'Обычный порядок: умолчания движка, настройка набора, сам набор.',
      ),
    },
    seeAlso: ['SecRuleEngine', 'SecDefaultAction', 'SecRuleRemoveById'],
  },

  SecRule: {
    summary: l(
      'The core directive: take these variables, run this operator over them, and if it matches, perform these actions. Everything else in the configuration exists to make SecRule work.',
      'Основная директива: взять эти переменные, применить к ним этот оператор и, если совпало, выполнить эти действия. Всё остальное в конфигурации существует, чтобы SecRule работала.',
    ),
    syntax: 'SecRule VARIABLES "OPERATOR argument" "ACTIONS"',
    tech: {
      argument: l(
        'Targets are joined with |, the operator may be omitted (then it is @rx), the action list is one quoted string with comma-separated items.',
        'Цели перечисляются через |, оператор можно опустить (тогда это @rx), список действий — одна строка в кавычках с элементами через запятую.',
      ),
      scope: l(
        'The rule runs in the phase given by the phase action or inherited from SecDefaultAction; the operator is applied to every target value separately.',
        'Правило выполняется в фазе из действия phase или унаследованной от SecDefaultAction; оператор применяется к каждому значению цели по отдельности.',
      ),
    },
    gotchas: [
      l(
        'A rule without id fails to load in modern versions; a rule without phase silently lands in whatever phase the defaults say.',
        'Правило без id в современных версиях не загрузится; правило без phase молча попадёт в ту фазу, которую назначил SecDefaultAction.',
      ),
      l(
        'A line continued with \\ must have no trailing space after the backslash, otherwise the rule breaks apart.',
        'В строке, продолженной через \\, после обратного слэша не должно быть пробела, иначе правило распадётся.',
      ),
    ],
    example: {
      code: 'SecRule REQUEST_HEADERS:User-Agent "@pm sqlmap nikto" \\\n    "id:1401,phase:1,t:none,t:lowercase,deny,status:403,\\\n    msg:\'Scanner detected\',tag:\'attack-reputation\',severity:CRITICAL"',
    },
    seeAlso: ['SecAction', 'SecDefaultAction', 'chain', 'id', 'phase'],
  },

  SecAction: {
    summary: l(
      'Performs actions unconditionally — a rule with no condition at all. Used for setup work: initialising collections, setting defaults, marking a stage of processing.',
      'Безусловно выполняет действия — правило вовсе без условия. Применяется для подготовительной работы: инициализации коллекций, установки значений по умолчанию, отметки этапа обработки.',
    ),
    syntax: 'SecAction "id:1402,phase:1,pass,nolog,setvar:tx.paranoia_level=1"',
    tech: {
      argument: l(
        'Only an action list; id and phase are as mandatory as in SecRule.',
        'Только список действий; id и phase так же обязательны, как в SecRule.',
      ),
    },
    gotchas: [
      l(
        'Without nolog it writes a log line on every single request.',
        'Без nolog она пишет строку в лог на каждый запрос.',
      ),
      l(
        'It always executes, so a disruptive action here blocks everything — never put deny in a SecAction by accident.',
        'Она выполняется всегда, поэтому разрушающее действие здесь блокирует всё — не ставьте deny в SecAction случайно.',
      ),
    ],
    seeAlso: ['SecRule', 'setvar', 'initcol', 'unconditionalMatch'],
  },

  SecMarker: {
    summary: l(
      'A named point in the rule file that does nothing on its own — it exists to be the destination of skipAfter. Turns rule blocks into something you can jump over by name instead of by count.',
      'Именованная точка в файле правил, которая сама по себе ничего не делает — она существует как цель для skipAfter. Превращает блоки правил в нечто, что можно перепрыгнуть по имени, а не по счёту.',
    ),
    syntax: 'SecMarker END_ADMIN_CHECKS',
    tech: {
      scope: l(
        'Belongs to a phase implicitly, through the rules around it; a jump only works within the same phase and context.',
        'Принадлежит фазе неявно, через окружающие правила; прыжок работает только в пределах той же фазы и того же контекста.',
      ),
    },
    seeAlso: ['skipAfter', 'skip', 'SecRule'],
  },

  SecDefaultAction: {
    summary: l(
      'Sets the actions every following rule inherits when it does not state its own. This is the single switch that turns a rule set from detection-only into blocking, and back.',
      'Задаёт действия, которые наследует каждое следующее правило, если не указало свои. Это единственный переключатель, превращающий набор правил из наблюдающего в блокирующий и обратно.',
    ),
    syntax: 'SecDefaultAction "phase:2,log,auditlog,pass"',
    tech: {
      argument: l(
        'Must contain a phase and exactly one disruptive action; it applies to the rules that come after it in the same context.',
        'Должна содержать фазу и ровно одно разрушающее действие; действует на правила, идущие после неё в том же контексте.',
      ),
      scope: l(
        'One default per phase — a rule inherits the defaults declared for its own phase.',
        'По одному умолчанию на фазу — правило наследует то, что объявлено для его фазы.',
      ),
    },
    gotchas: [
      l(
        'Rules written before the directive keep the previous defaults; order in the file is what decides, not proximity.',
        'Правила, написанные до директивы, сохраняют прежние умолчания: решает порядок в файле, а не соседство.',
      ),
      l(
        'With pass as the default, every rule that relies on block stops blocking — and the log looks exactly the same.',
        'Если умолчание — pass, все правила, полагающиеся на block, перестают блокировать, а лог при этом выглядит точно так же.',
      ),
    ],
    seeAlso: ['block', 'phase', 'SecRuleEngine', 'SecRule'],
  },

  SecRuleEngine: {
    summary: l(
      'Turns rule processing on, off, or into DetectionOnly, where rules run and log but never block. DetectionOnly is how a new rule set is introduced without breaking the application.',
      'Включает обработку правил, выключает её или переводит в DetectionOnly, где правила выполняются и логируют, но не блокируют. Через DetectionOnly новый набор правил вводят, не ломая приложение.',
    ),
    syntax: 'SecRuleEngine On  |  Off  |  DetectionOnly',
    tech: {
      scope: l(
        'Can be overridden per transaction with ctl:ruleEngine, and per location or virtual host in the server configuration.',
        'Переопределяется для транзакции через ctl:ruleEngine, а для локации или виртуального хоста — в конфигурации сервера.',
      ),
    },
    gotchas: [
      l(
        'With Off the request body is not even parsed, so rules are not merely passive — they see nothing at all.',
        'При Off тело запроса даже не разбирается, поэтому правила не просто пассивны — они вообще ничего не видят.',
      ),
    ],
    seeAlso: ['SecDefaultAction', 'ctl', 'SecRequestBodyAccess'],
  },

  SecRuleRemoveById: {
    summary: l(
      'Removes rules by id at configuration time — the blunt instrument for a false positive. Accepts single ids and ranges.',
      'Удаляет правила по id на этапе загрузки конфигурации — грубый инструмент против ложного срабатывания. Принимает отдельные id и диапазоны.',
    ),
    syntax: 'SecRuleRemoveById 942100 942190-942200',
    tech: {
      scope: l(
        'Must come after the rule has been defined — usually in a file included later than the rule set.',
        'Должна идти после определения правила — обычно в файле, подключаемом позже набора правил.',
      ),
    },
    gotchas: [
      l(
        'Removing a rule disables it for the whole site. A targeted exclusion via SecRuleUpdateTargetById or ctl keeps the protection everywhere else.',
        'Удаление отключает правило на всём сайте. Точечное исключение через SecRuleUpdateTargetById или ctl сохраняет защиту в остальных местах.',
      ),
    ],
    seeAlso: ['SecRuleRemoveByTag', 'SecRuleUpdateTargetById', 'ctl', 'id'],
  },

  SecRuleRemoveByMsg: {
    summary: l(
      'Removes rules whose msg matches a regular expression. Convenient in a pinch and fragile in the long run: the message text is not a stable interface.',
      'Удаляет правила, у которых msg совпадает с регулярным выражением. Удобно на скорую руку и ненадёжно вдолгую: текст сообщения — не стабильный интерфейс.',
    ),
    syntax: 'SecRuleRemoveByMsg "SQL Injection"',
    seeAlso: ['SecRuleRemoveById', 'SecRuleRemoveByTag', 'msg'],
  },

  SecRuleRemoveByTag: {
    summary: l(
      'Removes every rule carrying a tag that matches the expression. The right granularity for switching off a whole attack category you do not need.',
      'Удаляет все правила с тегом, совпадающим с выражением. Верная гранулярность, чтобы выключить целую категорию атак, которая вам не нужна.',
    ),
    syntax: 'SecRuleRemoveByTag "attack-dos"',
    seeAlso: ['tag', 'SecRuleRemoveById', 'SecRuleUpdateTargetByTag'],
  },

  SecRuleUpdateTargetById: {
    summary: l(
      'Changes the target list of an existing rule — most often to exclude one argument or header from it. The precise way to fix a false positive without losing the rule.',
      'Меняет список целей существующего правила — чаще всего чтобы исключить из него один аргумент или заголовок. Точный способ починить ложное срабатывание, не теряя правило.',
    ),
    syntax: 'SecRuleUpdateTargetById 942100 "!ARGS:comment"',
    tech: {
      scope: l(
        'Applies at load time and to every request; for a per-URL exclusion use ctl:ruleRemoveTargetById instead.',
        'Действует при загрузке и на все запросы; для исключения по конкретному URL нужен ctl:ruleRemoveTargetById.',
      ),
    },
    seeAlso: ['SecRuleUpdateActionById', 'SecRuleRemoveById', 'ctl'],
  },

  SecRuleUpdateTargetByMsg: {
    summary: l(
      'The same target update, selecting rules by their message instead of their id.',
      'То же обновление целей, но правила выбираются по сообщению, а не по id.',
    ),
    syntax: 'SecRuleUpdateTargetByMsg "XSS Attack" "!ARGS:bio"',
    seeAlso: ['SecRuleUpdateTargetById', 'SecRuleRemoveByMsg'],
  },

  SecRuleUpdateTargetByTag: {
    summary: l(
      'Updates the targets of every rule with a matching tag — for example, excluding a rich-text field from all XSS rules at once.',
      'Обновляет цели всех правил с подходящим тегом — например, разом исключает поле с форматированным текстом из всех XSS-правил.',
    ),
    syntax: 'SecRuleUpdateTargetByTag "attack-xss" "!ARGS:article_body"',
    seeAlso: ['SecRuleUpdateTargetById', 'tag'],
  },

  SecRuleUpdateActionById: {
    summary: l(
      'Merges new actions into an existing rule: change its severity, make it pass instead of deny, add a tag. The rule itself stays where the vendor put it.',
      'Добавляет новые действия к существующему правилу: сменить серьёзность, заставить пропускать вместо блокировки, добавить тег. Само правило остаётся там, где его оставил поставщик.',
    ),
    syntax: 'SecRuleUpdateActionById 942100 "pass,status:200"',
    gotchas: [
      l(
        'Metadata like id and phase cannot be changed this way, and a disruptive action replaces the previous one rather than adding to it.',
        'Метаданные вроде id и phase так не меняются, а разрушающее действие заменяет предыдущее, а не добавляется к нему.',
      ),
    ],
    seeAlso: ['SecRuleUpdateTargetById', 'SecRuleRemoveById', 'id'],
  },

  SecRuleScript: {
    summary: l(
      'Defines a rule whose logic lives in an external Lua script. The escape hatch for checks that the operator set cannot express.',
      'Определяет правило, логика которого живёт во внешнем Lua-скрипте. Запасной выход для проверок, которые не выразить набором операторов.',
    ),
    syntax: 'SecRuleScript "/etc/modsecurity/check.lua" "id:1403,phase:2,deny"',
    tech: {
      cost: l(
        'The script runs for every request that reaches the rule; a slow script becomes the latency of the whole site.',
        'Скрипт выполняется на каждом запросе, дошедшем до правила; медленный скрипт становится задержкой всего сайта.',
      ),
    },
    seeAlso: ['exec', 'SecRule', 'inspectFile'],
  },

  SecRuleInheritance: {
    summary: l(
      'Controls whether a child context — a virtual host, a directory, a location — inherits the rules of its parent. Turning it off gives an isolated context its own rule set from scratch.',
      'Определяет, наследует ли дочерний контекст — виртуальный хост, каталог, локация — правила родителя. Выключение даёт изолированному контексту собственный набор правил с нуля.',
    ),
    syntax: 'SecRuleInheritance Off',
    gotchas: [
      l(
        'Off is easy to forget: a new virtual host silently ends up with no protection at all.',
        'Про Off легко забыть: новый виртуальный хост молча остаётся вовсе без защиты.',
      ),
    ],
    seeAlso: ['SecRuleEngine', 'SecDefaultAction'],
  },

  SecRequestBodyAccess: {
    summary: l(
      'Enables buffering and inspection of the request body. Without it ARGS_POST, REQUEST_BODY and FILES are empty and every phase-2 body rule quietly does nothing.',
      'Включает буферизацию и проверку тела запроса. Без неё ARGS_POST, REQUEST_BODY и FILES пусты, а любое правило фазы 2 по телу тихо ничего не делает.',
    ),
    syntax: 'SecRequestBodyAccess On',
    tech: {
      cost: l(
        'The body is held in memory up to SecRequestBodyInMemoryLimit and spooled to SecTmpDir beyond it.',
        'Тело держится в памяти до SecRequestBodyInMemoryLimit, а сверх того сбрасывается в SecTmpDir.',
      ),
    },
    seeAlso: ['SecRequestBodyLimit', 'SecRequestBodyLimitAction', 'ARGS_POST', 'REQUEST_BODY'],
  },

  SecRequestBodyLimit: {
    summary: l(
      'The largest request body ModSecurity will accept, in bytes. What happens at the limit is decided by SecRequestBodyLimitAction.',
      'Наибольшее тело запроса, которое примет ModSecurity, в байтах. Что произойдёт на границе, решает SecRequestBodyLimitAction.',
    ),
    syntax: 'SecRequestBodyLimit 13107200',
    gotchas: [
      l(
        'Set it too high and a handful of large uploads exhaust memory; too low and legitimate uploads start failing.',
        'Задать слишком много — и несколько крупных загрузок съедят память; слишком мало — и легитимные загрузки начнут падать.',
      ),
    ],
    seeAlso: ['SecRequestBodyNoFilesLimit', 'SecRequestBodyLimitAction', 'REQUEST_BODY_LENGTH'],
  },

  SecRequestBodyNoFilesLimit: {
    summary: l(
      'The body limit that applies when there are no file uploads. Kept much lower than the general limit, because a form without files has no reason to be megabytes long.',
      'Лимит тела для запросов без загрузки файлов. Держится намного ниже общего: форме без файлов незачем весить мегабайты.',
    ),
    syntax: 'SecRequestBodyNoFilesLimit 131072',
    seeAlso: ['SecRequestBodyLimit', 'SecUploadFileLimit'],
  },

  SecRequestBodyInMemoryLimit: {
    summary: l(
      'How much of the body stays in memory before the rest is written to a temporary file. A trade between memory pressure and disk I/O.',
      'Сколько тела остаётся в памяти, прежде чем остаток уйдёт во временный файл. Компромисс между расходом памяти и обращениями к диску.',
    ),
    syntax: 'SecRequestBodyInMemoryLimit 131072',
    seeAlso: ['SecRequestBodyLimit', 'SecTmpDir'],
  },

  SecRequestBodyLimitAction: {
    summary: l(
      'What to do when the body limit is reached: Reject the request, or ProcessPartial and inspect only what fits.',
      'Что делать при достижении лимита тела: Reject — отклонить запрос, ProcessPartial — обработать и проверить только то, что поместилось.',
    ),
    syntax: 'SecRequestBodyLimitAction Reject  |  ProcessPartial',
    gotchas: [
      l(
        'ProcessPartial means anything after the limit is never inspected — an attacker who pads the body walks straight through.',
        'ProcessPartial означает, что всё после лимита не проверяется вовсе: атакующий, набивший тело, проходит насквозь.',
      ),
    ],
    seeAlso: ['SecRequestBodyLimit', 'REQBODY_ERROR'],
  },

  SecResponseBodyAccess: {
    summary: l(
      'Enables buffering of response bodies so that phase-4 rules can look at them. Required for any data-leak detection, and it is the most expensive switch in the configuration.',
      'Включает буферизацию тел ответа, чтобы правила фазы 4 могли на них посмотреть. Необходима для любого поиска утечек данных и является самым дорогим переключателем в конфигурации.',
    ),
    syntax: 'SecResponseBodyAccess On',
    tech: {
      scope: l(
        'Only content types listed in SecResponseBodyMimeType are buffered.',
        'Буферизуются только типы содержимого, перечисленные в SecResponseBodyMimeType.',
      ),
      cost: l(
        'The response cannot be streamed while it is buffered, so time-to-first-byte grows for every user.',
        'Пока ответ буферизуется, его нельзя стримить, поэтому время до первого байта растёт для всех пользователей.',
      ),
    },
    seeAlso: ['SecResponseBodyLimit', 'SecResponseBodyMimeType', 'RESPONSE_BODY'],
  },

  SecResponseBodyLimit: {
    summary: l(
      'How many bytes of a response are buffered for inspection. Anything beyond the limit is handled according to SecResponseBodyLimitAction.',
      'Сколько байтов ответа буферизуется для проверки. С тем, что за лимитом, поступают согласно SecResponseBodyLimitAction.',
    ),
    syntax: 'SecResponseBodyLimit 524288',
    seeAlso: ['SecResponseBodyLimitAction', 'SecResponseBodyAccess'],
  },

  SecResponseBodyLimitAction: {
    summary: l(
      'What to do when a response exceeds the buffering limit: Reject it or ProcessPartial. On responses ProcessPartial is the common choice, since rejecting a page the application already produced is harsh.',
      'Что делать, когда ответ превысил лимит буферизации: Reject или ProcessPartial. Для ответов обычно выбирают ProcessPartial: отвергать страницу, которую приложение уже сформировало, слишком жёстко.',
    ),
    syntax: 'SecResponseBodyLimitAction ProcessPartial',
    seeAlso: ['SecResponseBodyLimit', 'RESPONSE_BODY'],
  },

  SecResponseBodyMimeType: {
    summary: l(
      'The content types whose bodies are worth buffering — text and markup, normally. Adding binary types wastes memory without adding detection.',
      'Типы содержимого, тела которых стоит буферизовать, — обычно текст и разметка. Добавление бинарных типов тратит память, ничего не давая обнаружению.',
    ),
    syntax: 'SecResponseBodyMimeType text/plain text/html application/json',
    seeAlso: ['SecResponseBodyMimeTypesClear', 'RESPONSE_CONTENT_TYPE'],
  },

  SecResponseBodyMimeTypesClear: {
    summary: l(
      'Empties the MIME type list so it can be rebuilt from scratch. Used when the inherited defaults are not what this context needs.',
      'Опустошает список MIME-типов, чтобы собрать его заново. Применяется, когда унаследованные умолчания не подходят этому контексту.',
    ),
    syntax: 'SecResponseBodyMimeTypesClear',
    seeAlso: ['SecResponseBodyMimeType'],
  },

  SecAuditEngine: {
    summary: l(
      'Controls the audit log: On records everything, RelevantOnly records what matched or what the status filter selects, Off records nothing. RelevantOnly is the sane default.',
      'Управляет журналом аудита: On пишет всё, RelevantOnly — то, что сработало или отобрано фильтром статусов, Off — ничего. Разумное умолчание — RelevantOnly.',
    ),
    syntax: 'SecAuditEngine RelevantOnly',
    gotchas: [
      l(
        'On on a busy site fills the disk within hours and stores every request body, passwords included.',
        'On на нагруженном сайте забивает диск за часы и сохраняет тела всех запросов вместе с паролями.',
      ),
    ],
    seeAlso: ['SecAuditLogRelevantStatus', 'SecAuditLogParts', 'auditlog', 'SecAuditLog'],
  },

  SecAuditLog: {
    summary: l(
      'The path of the main audit log. In Serial mode every entry is appended here; in Concurrent mode this file becomes an index into the storage directory.',
      'Путь основного журнала аудита. В режиме Serial сюда дописывается каждая запись; в режиме Concurrent этот файл становится индексом каталога хранения.',
    ),
    syntax: 'SecAuditLog /var/log/modsec_audit.log',
    seeAlso: ['SecAuditLogType', 'SecAuditLogStorageDir', 'SecAuditLog2'],
  },

  SecAuditLog2: {
    summary: l(
      'A secondary copy of the audit index, used with concurrent logging — typically to ship entries somewhere else without touching the primary file.',
      'Вторая копия индекса аудита при параллельном логировании — обычно чтобы отправлять записи в другое место, не трогая основной файл.',
    ),
    syntax: 'SecAuditLog2 /var/log/modsec_audit2.log',
    seeAlso: ['SecAuditLog', 'SecAuditLogType'],
  },

  SecAuditLogParts: {
    summary: l(
      'Chooses which sections of a transaction are stored: A is the header and Z the terminator (both required), B request headers, C the request body, E the response body, H the audit trailer, I a compact body form.',
      'Выбирает, какие части транзакции сохраняются: A — заголовок и Z — завершитель (обязательны), B — заголовки запроса, C — тело запроса, E — тело ответа, H — служебный хвост, I — компактная форма тела.',
    ),
    syntax: 'SecAuditLogParts ABIJDEFHZ',
    gotchas: [
      l(
        'Part C stores the request body verbatim: without sanitise actions the log becomes a collection of credentials.',
        'Часть C сохраняет тело запроса дословно: без sanitise-действий лог превращается в собрание учётных данных.',
      ),
      l(
        'Part E multiplies the log size by the size of your pages.',
        'Часть E умножает размер лога на размер ваших страниц.',
      ),
    ],
    seeAlso: ['SecAuditEngine', 'sanitiseArg', 'SecAuditLogFormat'],
  },

  SecAuditLogType: {
    summary: l(
      'Serial writes all entries into one file under a lock; Concurrent writes each transaction as its own file. Serial is simpler, Concurrent scales better and is what remote collectors expect.',
      'Serial пишет все записи в один файл под блокировкой; Concurrent сохраняет каждую транзакцию отдельным файлом. Serial проще, Concurrent лучше масштабируется и его ждут удалённые сборщики.',
    ),
    syntax: 'SecAuditLogType Serial  |  Concurrent',
    gotchas: [
      l(
        'Serial serialises worker processes on one lock — under load the audit log becomes the bottleneck.',
        'Serial выстраивает рабочие процессы в очередь на одну блокировку — под нагрузкой журнал аудита становится узким местом.',
      ),
    ],
    seeAlso: ['SecAuditLogStorageDir', 'SecAuditLog'],
  },

  SecAuditLogStorageDir: {
    summary: l(
      'The directory tree for concurrent audit entries, one file per transaction. It grows without bound on its own — rotation is your responsibility.',
      'Дерево каталогов для записей аудита в режиме Concurrent, по файлу на транзакцию. Само по себе оно растёт неограниченно — ротация на вашей совести.',
    ),
    syntax: 'SecAuditLogStorageDir /var/log/modsec_audit/',
    seeAlso: ['SecAuditLogType', 'SecAuditLog'],
  },

  SecAuditLogFormat: {
    summary: l(
      'Native is the classic multipart text format; JSON is what log collectors actually want to parse. Switching is the cheapest improvement you can make to log processing.',
      'Native — классический многочастный текстовый формат; JSON — то, что действительно хотят разбирать сборщики логов. Переключение — самое дешёвое улучшение обработки логов.',
    ),
    syntax: 'SecAuditLogFormat JSON',
    seeAlso: ['SecAuditLogParts', 'SecAuditLog'],
  },

  SecAuditLogRelevantStatus: {
    summary: l(
      'A regular expression over the response status that decides what RelevantOnly considers worth logging. The usual pattern keeps errors and drops the noise of 404s.',
      'Регулярное выражение по статусу ответа, определяющее, что RelevantOnly считает достойным записи. Обычный шаблон оставляет ошибки и отбрасывает шум из 404.',
    ),
    syntax: 'SecAuditLogRelevantStatus "^(?:5|4(?!04))"',
    seeAlso: ['SecAuditEngine', 'RESPONSE_STATUS'],
  },

  SecDebugLog: {
    summary: l(
      'The path of the debug log — the only place that shows what the engine did with a request step by step. Indispensable while writing rules, dangerous to leave on.',
      'Путь отладочного журнала — единственного места, где видно, что движок пошагово сделал с запросом. Незаменим при написании правил и опасен, если оставить включённым.',
    ),
    syntax: 'SecDebugLog /var/log/modsec_debug.log',
    seeAlso: ['SecDebugLogLevel', 'SecAuditLog'],
  },

  SecDebugLogLevel: {
    summary: l(
      'The verbosity of the debug log, 0 to 9. Levels up to 3 are production-safe; 9 records every transformation of every value and costs more than the rules themselves.',
      'Детальность отладочного журнала, от 0 до 9. Уровни до 3 безопасны для прода; 9 записывает каждую трансформацию каждого значения и стоит дороже самих правил.',
    ),
    syntax: 'SecDebugLogLevel 3',
    tech: {
      scope: l(
        'Can be raised for a single transaction with ctl:debugLogLevel — the sane way to debug in production.',
        'Поднимается для одной транзакции через ctl:debugLogLevel — разумный способ отлаживать в проде.',
      ),
    },
    seeAlso: ['SecDebugLog', 'ctl'],
  },

  SecComponentSignature: {
    summary: l(
      'Registers a component version string, such as the rule set version, so it appears in the ModSecurity signature and in audit records.',
      'Регистрирует строку версии компонента, например версию набора правил, чтобы она попала в сигнатуру ModSecurity и в записи аудита.',
    ),
    syntax: 'SecComponentSignature "OWASP_CRS/4.0.0"',
    seeAlso: ['ver', 'SecServerSignature'],
  },

  SecContentInjection: {
    summary: l(
      'Allows rules to modify the response body through append and prepend. Off by default, because injecting content can break an application in ways rules cannot predict.',
      'Разрешает правилам менять тело ответа через append и prepend. По умолчанию выключено, потому что внедрение контента ломает приложение способами, которые правила не предвидят.',
    ),
    syntax: 'SecContentInjection On',
    seeAlso: ['append', 'prepend', 'rsub'],
  },

  SecServerSignature: {
    summary: l(
      'Replaces the Server header the web server sends. Cosmetic security: it slows down automated fingerprinting and stops nothing else.',
      'Подменяет заголовок Server, который отдаёт веб-сервер. Косметическая безопасность: замедляет автоматическое снятие отпечатков и больше ничего не останавливает.',
    ),
    syntax: 'SecServerSignature "Apache"',
    tech: {
      scope: l(
        'In Apache it only works when ServerTokens is set to Full.',
        'В Apache работает, только когда ServerTokens выставлен в Full.',
      ),
    },
    seeAlso: ['RESPONSE_HEADERS', 'SecComponentSignature'],
  },

  SecTmpDir: {
    summary: l(
      'Where request bodies are spooled once they no longer fit in memory. Must be writable by the worker processes and fast — it is in the path of every large request.',
      'Куда сбрасываются тела запросов, когда перестают помещаться в памяти. Должен быть доступен рабочим процессам на запись и быть быстрым: он на пути каждого крупного запроса.',
    ),
    syntax: 'SecTmpDir /var/cache/modsecurity',
    seeAlso: ['SecRequestBodyInMemoryLimit', 'SecDataDir', 'SecUploadDir'],
  },

  SecDataDir: {
    summary: l(
      'Where persistent collections are stored. Everything stateful — IP counters, sessions, bans — lives here, and without this directive initcol silently fails.',
      'Где хранятся постоянные коллекции. Всё, что имеет состояние — счётчики по IP, сессии, блокировки, — живёт здесь, и без этой директивы initcol молча не работает.',
    ),
    syntax: 'SecDataDir /var/cache/modsecurity/data',
    gotchas: [
      l(
        'It must not be shared over NFS or between servers: the collection files are not designed for that kind of concurrent access.',
        'Его нельзя размещать на NFS или делить между серверами: файлы коллекций не рассчитаны на такой параллельный доступ.',
      ),
    ],
    seeAlso: ['initcol', 'IP', 'SESSION', 'SecCollectionTimeout'],
  },

  SecUploadDir: {
    summary: l(
      'Where intercepted uploaded files are kept. Should be on the same filesystem as SecTmpDir so that storing a file is a rename rather than a copy.',
      'Где сохраняются перехваченные загруженные файлы. Лучше держать на той же файловой системе, что и SecTmpDir, чтобы сохранение было переименованием, а не копированием.',
    ),
    syntax: 'SecUploadDir /var/cache/modsecurity/upload',
    seeAlso: ['SecUploadKeepFiles', 'SecUploadFileMode', 'FILES'],
  },

  SecUploadKeepFiles: {
    summary: l(
      'Whether uploaded files are kept after the request: On keeps everything, RelevantOnly keeps the ones tied to a match, Off keeps nothing.',
      'Сохранять ли загруженные файлы после запроса: On — все, RelevantOnly — только связанные со срабатыванием, Off — никакие.',
    ),
    syntax: 'SecUploadKeepFiles RelevantOnly',
    gotchas: [
      l(
        'On means you are now storing user files, including malware, with all the legal and disk-space consequences.',
        'On означает, что вы теперь храните пользовательские файлы, включая вредоносные, со всеми юридическими и дисковыми последствиями.',
      ),
    ],
    seeAlso: ['SecUploadDir', 'SecUploadFileMode', 'inspectFile'],
  },

  SecUploadFileMode: {
    summary: l(
      'The permission bits given to stored uploads. Keep them unreadable to everyone but the owner — a saved malicious file should never be executable or web-reachable.',
      'Права, назначаемые сохранённым загрузкам. Держите их нечитаемыми ни для кого, кроме владельца: сохранённый вредоносный файл не должен быть ни исполняемым, ни доступным из веба.',
    ),
    syntax: 'SecUploadFileMode 0600',
    seeAlso: ['SecUploadDir', 'SecUploadKeepFiles'],
  },

  SecUploadFileLimit: {
    summary: l(
      'The maximum number of files processed in one request. A cap against a multipart body made of thousands of tiny parts.',
      'Максимальное число файлов, обрабатываемых в одном запросе. Ограничение против multipart-тела из тысяч крошечных частей.',
    ),
    syntax: 'SecUploadFileLimit 32',
    gotchas: [
      l(
        'Exceeding the limit stops the parsing, so the files beyond it are not inspected at all.',
        'Превышение лимита останавливает разбор, поэтому файлы сверх него не проверяются вовсе.',
      ),
    ],
    seeAlso: ['FILES', 'SecRequestBodyLimit', 'MULTIPART_STRICT_ERROR'],
  },

  SecPcreMatchLimit: {
    summary: l(
      'The ceiling on PCRE work for a single match — the guard against catastrophic backtracking turning one request into a CPU outage.',
      'Потолок работы PCRE на одно сопоставление — защита от катастрофического бэктрекинга, превращающего один запрос в отказ по процессору.',
    ),
    syntax: 'SecPcreMatchLimit 1000',
    gotchas: [
      l(
        'When the limit is hit the rule does not match — it errors out and sets MSC_PCRE_LIMITS_EXCEEDED. Too low a value silently disables your heaviest rules.',
        'При упоре в лимит правило не срабатывает, а завершается с ошибкой и выставляет MSC_PCRE_LIMITS_EXCEEDED. Слишком низкое значение молча отключает самые тяжёлые правила.',
      ),
    ],
    seeAlso: ['SecPcreMatchLimitRecursion', 'rx'],
  },

  SecPcreMatchLimitRecursion: {
    summary: l(
      'The recursion depth limit for PCRE. Guards the stack the way SecPcreMatchLimit guards the CPU; the two are normally set to the same value.',
      'Лимит глубины рекурсии PCRE. Бережёт стек так же, как SecPcreMatchLimit бережёт процессор; обычно им задают одинаковые значения.',
    ),
    syntax: 'SecPcreMatchLimitRecursion 1000',
    seeAlso: ['SecPcreMatchLimit', 'rx'],
  },

  SecStatusEngine: {
    summary: l(
      'Whether ModSecurity reports anonymous version and usage information to the project on start-up. Off if outbound calls from the server are not acceptable.',
      'Отправлять ли ModSecurity анонимные сведения о версии и использовании проекту при старте. Off, если исходящие обращения с сервера недопустимы.',
    ),
    syntax: 'SecStatusEngine Off',
    seeAlso: ['SecComponentSignature'],
  },

  SecArgumentSeparator: {
    summary: l(
      'The character that separates urlencoded arguments. It is & everywhere, until an application decides to accept ; as well — and then the parser and the application disagree about what the arguments are.',
      'Символ-разделитель urlencoded-аргументов. Везде это &, пока приложение не решит принимать ещё и ; — и тогда парсер и приложение расходятся в том, что считать аргументами.',
    ),
    syntax: 'SecArgumentSeparator &',
    gotchas: [
      l(
        'A mismatch here is a real evasion: the WAF sees one argument where the application sees two.',
        'Расхождение здесь — настоящий обход: WAF видит один аргумент там, где приложение видит два.',
      ),
    ],
    seeAlso: ['ARGS', 'QUERY_STRING'],
  },

  SecCookieFormat: {
    summary: l(
      'The cookie parsing dialect: 0 for the Netscape format used by everything in practice, 1 for RFC 2965. Changing it without a reason breaks REQUEST_COOKIES.',
      'Диалект разбора cookie: 0 — формат Netscape, который на практике используют все, 1 — RFC 2965. Смена без причины ломает REQUEST_COOKIES.',
    ),
    syntax: 'SecCookieFormat 0',
    seeAlso: ['REQUEST_COOKIES'],
  },

  SecCollectionTimeout: {
    summary: l(
      'How long a record in a persistent collection survives without being touched. It is the backstop that keeps the data directory from growing forever.',
      'Сколько живёт запись постоянной коллекции, к которой не обращались. Это страховка, не дающая каталогу данных расти бесконечно.',
    ),
    syntax: 'SecCollectionTimeout 3600',
    seeAlso: ['SecDataDir', 'initcol', 'expirevar'],
  },

  SecUnicodeMapFile: {
    summary: l(
      'The mapping file and code page used to fold %uXXXX sequences during urlDecodeUni. Without it the transformation cannot resolve the Unicode forms it exists for.',
      'Файл отображения и кодовая страница для свёртки последовательностей %uXXXX в urlDecodeUni. Без него трансформация не может разрешить те юникодные формы, ради которых существует.',
    ),
    syntax: 'SecUnicodeMapFile unicode.mapping 20127',
    seeAlso: ['urlDecodeUni', 'utf8toUnicode'],
  },

  SecStreamInBodyInspection: {
    summary: l(
      'Exposes the raw inbound body as STREAM_INPUT_BODY, which is the only target @rsub can rewrite. Costs an extra full copy of every request body.',
      'Открывает сырое входящее тело как STREAM_INPUT_BODY — единственную цель, которую может переписать @rsub. Стоит дополнительной полной копии каждого тела запроса.',
    ),
    syntax: 'SecStreamInBodyInspection On',
    tech: {
      availability: l(
        'ModSecurity v2 only.',
        'Только ModSecurity v2.',
      ),
    },
    seeAlso: ['rsub', 'SecStreamOutBodyInspection', 'REQUEST_BODY'],
  },

  SecStreamOutBodyInspection: {
    summary: l(
      'Exposes the raw outbound body as STREAM_OUTPUT_BODY so it can be rewritten with @rsub. The mechanism behind response patching and content injection.',
      'Открывает сырое исходящее тело как STREAM_OUTPUT_BODY, чтобы его можно было переписать через @rsub. Механизм, на котором держатся правка ответа и внедрение контента.',
    ),
    syntax: 'SecStreamOutBodyInspection On',
    tech: {
      availability: l(
        'ModSecurity v2 only.',
        'Только ModSecurity v2.',
      ),
    },
    seeAlso: ['rsub', 'SecContentInjection', 'RESPONSE_BODY'],
  },

  SecInterceptOnError: {
    summary: l(
      'Decides whether an internal processing error aborts the transaction. It is the fail-open versus fail-closed switch, and the answer depends on what the site is for.',
      'Определяет, прерывает ли внутренняя ошибка обработки транзакцию. Это переключатель между «падать открыто» и «падать закрыто», и ответ зависит от того, для чего этот сайт.',
    ),
    syntax: 'SecInterceptOnError On',
    seeAlso: ['SecRuleEngine', 'REQBODY_ERROR'],
  },
};
