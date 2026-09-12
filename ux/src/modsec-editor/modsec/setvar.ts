/**
 * Присваивание `setvar:` — разобранное на поля и собранное обратно.
 *
 * В модели правила `setvar` остаётся строкой ({@link VisualActions.setvar}), и
 * это не недоделка: `tx.anomaly_score=+%{tx.critical_anomaly_score}` уходит в
 * файл ровно тем, чем его написал автор набора, пока это присваивание не
 * правят. Форма поэтому — не второе хранилище, а взгляд на одну строку: разбор
 * читает её на четыре вопроса, сборка отвечает ими же обратно.
 *
 * Вопросов ровно четыре, потому что различий у записи ровно четыре: куда
 * писать (коллекция), что писать (имя), как писать (задать, прибавить,
 * вычесть, удалить) и что именно (значение). Знак операции при этом стоит не
 * там, где его ждут: `+` и `-` пишутся в начале значения, а удаление — `!`
 * перед именем, то есть в другом конце записи. Разница между `tx.score=1` и
 * `tx.score=+1` — один символ и целый смысл: первое затирает накопленный счёт,
 * второе к нему прибавляет. Набранные вместо друг друга, они не выдают себя
 * ничем, поэтому операцию не набирают, а выбирают.
 *
 * Разбор строгий: имя с макросом (`tx.%{rule.id}_flag`), коллекция, в которую
 * писать нельзя (`geo`), запись без `=` вовсе — всё это возвращает `null`, и
 * формы у такой строки нет. Причина та же, по которой её нет у директивы с
 * макросом в значении: форма, показывающая меньше, чем есть в строке,
 * сохранила бы ровно то, что показала.
 */

/**
 * Что запись делает с переменной.
 *
 * `set` — положить значение, `add` и `sub` — изменить накопленное на столько
 * же, `delete` — убрать переменную из коллекции. Последнее не то же самое, что
 * `set` с нулём: у долгоживущей коллекции удалённая переменная перестаёт
 * занимать место в хранилище, а обнулённая остаётся в нём с нулём.
 */
export type SetvarOp = 'set' | 'add' | 'sub' | 'delete';

/**
 * Коллекции, в которые `setvar` умеет писать.
 *
 * Остальные заполняет движок: `geo` — `@geoLookup`, `rule` — сам разбор
 * правила, `matched_var` — совпадение. Присваивание в них ModSecurity
 * молча не сделает ничего, и формы для такой записи здесь нет: выбрать
 * коллекцию, в которую нельзя писать, из списка невозможно, а прочитанная
 * из файла строка остаётся текстовым полем со своим замечанием.
 */
export const SETVAR_COLLECTIONS = [
  'tx',
  'ip',
  'session',
  'user',
  'global',
  'resource',
  'env',
] as const;

/** Разобранное присваивание: то, чем `setvar` отличается от соседнего `setvar`. */
export interface SetvarAssignment {
  /** Коллекция в нижнем регистре — одна из {@link SETVAR_COLLECTIONS}. */
  collection: string;
  /** Имя переменной внутри коллекции, как оно написано в файле. */
  name: string;
  op: SetvarOp;
  /** Значение справа от знака; у удаления пусто. */
  value: string;
  /**
   * Разделитель коллекции и имени, как он написан: `.` или `:`.
   *
   * Пишут через точку, но ModSecurity понимает и двоеточие, и разница здесь
   * ровно в том, что читателю файла привычно. Правка соседнего поля не должна
   * менять написание того, которого не касались, поэтому разделитель
   * возвращается в строку тем же, каким пришёл.
   */
  separator: '.' | ':';
}

/**
 * Имя переменной, из которого форма соберёт запись обратно без потерь.
 *
 * Цифра в начале не подходит по той же причине, по которой не подходит
 * макрос: `tx.1` — это захваченная группа, и выставляет её `capture`.
 */
const PLAIN_NAME = /^[A-Za-z_][\w.-]*$/;

/** Коллекция и имя: `tx.score`, `ip:dos_counter`. */
const TARGET = /^([A-Za-z_][\w]*)([.:])(.+)$/;

function writable(collection: string): boolean {
  return (SETVAR_COLLECTIONS as readonly string[]).includes(collection);
}

/**
 * Читает присваивание по полям; `null` — формы для этой записи нет.
 *
 * `null` возвращается не на ошибку, а на всё, что форма показала бы неполно:
 * макрос в имени, чужая коллекция, отсутствие `=` там, где значение
 * обязательно. Правится такая строка текстом — как и раньше, целиком.
 */
export function readSetvar(raw: string): SetvarAssignment | null {
  const text = raw.trim();
  if (text === '') return null;

  const removal = text.startsWith('!');
  const body = removal ? text.slice(1).trim() : text;

  const eq = body.indexOf('=');
  // Удаление значения не принимает вовсе: `!tx.score=0` — это не «удалить и
  // положить нуль», а запись, о смысле которой по ней самой не сказать.
  if (removal && eq !== -1) return null;

  const target = TARGET.exec(removal || eq === -1 ? body : body.slice(0, eq));
  if (target === null) return null;

  const collection = target[1].toLowerCase();
  const name = target[3].trim();
  if (!writable(collection) || !PLAIN_NAME.test(name)) return null;

  const separator = target[2] as '.' | ':';
  if (removal) return { collection, name, op: 'delete', value: '', separator };

  // Присваивание без `=` ModSecurity читает как установку пустого значения, но
  // написано это неотличимо от опечатки, и форма с пустым полем сказала бы,
  // что значение здесь есть.
  if (eq === -1) return null;

  const right = body.slice(eq + 1);
  if (right.startsWith('+')) {
    return { collection, name, op: 'add', value: right.slice(1), separator };
  }
  if (right.startsWith('-')) {
    return { collection, name, op: 'sub', value: right.slice(1), separator };
  }
  return { collection, name, op: 'set', value: right, separator };
}

/** Собирает присваивание обратно в строку действия `setvar:`. */
export function writeSetvar(assignment: SetvarAssignment): string {
  const { collection, name, op, value, separator } = assignment;
  const target = `${collection}${separator}${name}`;

  switch (op) {
    case 'delete':
      return `!${target}`;
    case 'add':
      return `${target}=+${value}`;
    case 'sub':
      return `${target}=-${value}`;
    default:
      return `${target}=${value}`;
  }
}

/**
 * Коллекция и имя из записи, разбор которой не сошёлся.
 *
 * Форме этого мало — по имени с макросом поля не собрать, — а индексу
 * переменных хватает: `setvar:tx.%{rule.id}_flag=1` пишет в `tx`, и сказать
 * об этом честнее, чем промолчать. Поэтому здесь требований к имени нет
 * никаких, кроме того, что оно есть.
 */
export function readSetvarTarget(raw: string): { collection: string; name: string } | null {
  const text = raw.trim();
  const body = text.startsWith('!') ? text.slice(1).trim() : text;
  const eq = body.indexOf('=');
  const target = TARGET.exec(eq === -1 ? body : body.slice(0, eq));
  if (target === null) return null;

  return { collection: target[1].toLowerCase(), name: target[3].trim() };
}

/** Основа имени новой переменной: осмысленное знает автор набора, а не редактор. */
const NEW_VAR_NAME = 'var';

/**
 * Незанятое имя для новой переменной — как незанятое имя для новой метки.
 *
 * Незанятое, а не просто придуманное: второе присваивание тому же имени не
 * заводит вторую переменную, а переписывает первую, и добавленная строка
 * молча меняла бы смысл уже написанной. Занятыми считаются имена всего
 * набора, а не одного правила: коллекция транзакции общая на файлы, и
 * `tx.var`, выставленный в надстройке, — то же самое `tx.var`.
 */
export function freeVarName(taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const name of taken) used.add(name.toLowerCase());

  if (!used.has(NEW_VAR_NAME)) return NEW_VAR_NAME;
  let n = 2;
  while (used.has(`${NEW_VAR_NAME}_${n}`)) n += 1;
  return `${NEW_VAR_NAME}_${n}`;
}

/**
 * Заготовка нового присваивания.
 *
 * Единица, а не пустое значение: `setvar:tx.var=` ModSecurity примет, но
 * заготовка обязана быть тем, что уже работает, — а не тем, что придётся
 * дособирать, чтобы файл перестал быть сломанным. Флаг со единицей — самая
 * частая запись в наборах, и правится она одним полем.
 */
export function makeSetvar(name: string): string {
  return writeSetvar({ collection: 'tx', name, op: 'set', value: '1', separator: '.' });
}
