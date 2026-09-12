/**
 * Хеш источника: отпечаток того, что лежит в базе, а не того, что напечатал
 * компилятор.
 *
 * Зачем второй хеш рядом с `config_hash`. Тот считается по тексту, который
 * уезжает на флот, и потому слеп к целому классу правок: поле сохранено, но
 * компилятор его не читает (ветки нет, поле переименовали с одной стороны,
 * директива ещё не поддержана -- nginx/docs/module/unsupported.md). Оператор
 * что-то поменял, `config_hash` не двинулся, панель честно говорит «сошлось»,
 * и правка тихо не работает. Хеш источника двигается на любую правку, а
 * расхождение двух хешей и есть тот самый сигнал «сохранено, но в конфигурацию
 * не попадает».
 *
 * `JSON.stringify` для этого не годится: порядок ключей зависит от порядка
 * вставки (то есть от истории правок строки), `undefined` из объектов
 * пропадает, а `Date` и `Buffer` печатаются по-разному в зависимости от того,
 * как строка доехала из Postgres. Здесь -- собственный обход с сортировкой
 * ключей и метками типов.
 */

import { createHash, type Hash } from "node:crypto";

/**
 * Ключи, которые в отпечаток не входят.
 *
 * Времена правит сама база на каждом `update`, и без этого исключения любое
 * сохранение «того же самого» выглядело бы изменением. `description` --
 * заметка оператора: она никуда не едет и предлагать из-за неё рассылку
 * значит приучить закрывать предупреждение не глядя.
 *
 * Список намеренно короткий. Всё остальное считается значимым, пока не
 * доказано обратное: пропущенное поле здесь -- это молчаливо потерянная
 * правка, то есть ровно то, от чего этот хеш и заведён.
 */
export const SOURCE_SKIP_KEYS: ReadonlySet<string> = new Set([
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "description",
]);

/**
 * Метки типов. Без них `1` и `"1"`, `null` и `"null"`, пустой массив и пустой
 * объект сливаются в один отпечаток, и правка типа поля проходит незамеченной.
 */
const TAG = {
  null: "0",
  bool: "b",
  number: "n",
  string: "s",
  bytes: "x",
  date: "d",
  array: "a",
  object: "o",
} as const;

function feed(digest: Hash, value: unknown, skip: ReadonlySet<string>): void {
  if (value === null || value === undefined) {
    digest.update(TAG.null);
    digest.update("\0");
    return;
  }

  if (typeof value === "boolean") {
    digest.update(TAG.bool);
    digest.update(value ? "1" : "0");
    digest.update("\0");
    return;
  }

  if (typeof value === "number") {
    // `-0` и `0` -- одно значение конфигурации; `Object.is` их различает,
    // а операторская правка -- нет.
    digest.update(TAG.number);
    digest.update(Number.isFinite(value) ? String(value === 0 ? 0 : value) : "nan");
    digest.update("\0");
    return;
  }

  if (typeof value === "string") {
    digest.update(TAG.string);
    digest.update(value);
    digest.update("\0");
    return;
  }

  if (value instanceof Date) {
    digest.update(TAG.date);
    digest.update(String(value.getTime()));
    digest.update("\0");
    return;
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    // Тело объекта содержимого бывает мегабайтным: в отпечаток идёт его
    // собственный sha256, а не байты.
    digest.update(TAG.bytes);
    digest.update(createHash("sha256").update(value).digest("hex"));
    digest.update("\0");
    return;
  }

  if (Array.isArray(value)) {
    // Длина в отпечатке: иначе [[a],[b]] и [[a,b]] дают одно и то же.
    digest.update(TAG.array);
    digest.update(String(value.length));
    digest.update("\0");
    for (const item of value) {
      feed(digest, item, skip);
    }
    return;
  }

  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const keys = Object.keys(row)
      .filter((key) => !skip.has(key) && row[key] !== undefined)
      .sort();

    digest.update(TAG.object);
    digest.update(String(keys.length));
    digest.update("\0");

    for (const key of keys) {
      digest.update(key);
      digest.update("\0");
      feed(digest, row[key], skip);
    }
    return;
  }

  // Функции и символы в дереве конфигурации не встречаются; если встретятся --
  // пусть это будет видно как постоянный отпечаток, а не как молчаливый ноль.
  digest.update(TAG.string);
  digest.update(String(value));
  digest.update("\0");
}

export function sourceHash(
  value: unknown,
  skip: ReadonlySet<string> = SOURCE_SKIP_KEYS,
): string {
  const digest = createHash("sha256");
  feed(digest, value, skip);
  return `sha256:${digest.digest("hex")}`;
}
