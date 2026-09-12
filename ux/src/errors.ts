/**
 * Ошибка запроса, разобранная до кода и текста.
 *
 * Thunk'и панели бросают строкой, в которой перед кодом стоит адрес:
 * `PUT /api/<scope>/datasets/<uuid> → name_taken`. Оператору адрес не нужен --
 * ему нужна фраза, а фраза лежит в каталоге `api.*` под кодом. Поэтому код
 * отделяется здесь, один раз: до этого разбор был скопирован в двух формах
 * (наборы и привязка порта), и вторая копия не знала про разделитель ` - `.
 *
 * Непереведённый код показывается как есть. `name_taken` в полосе хуже фразы,
 * но лучше пустого места: по нему видно, что ответил контроллер.
 */

export function errorText(err: unknown): string {
  if (err === null || err === undefined) {
    return "";
  }
  if (typeof err === "string") {
    return err;
  }
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(err);
}

/** Хвост после адреса: то, чем контроллер назвал отказ. */
export function errorCode(err: unknown): string {
  const text = errorText(err);
  const arrow = text.lastIndexOf("→");
  if (arrow >= 0) {
    return text.slice(arrow + 1).trim();
  }
  const dash = text.lastIndexOf(" - ");
  if (dash >= 0) {
    return text.slice(dash + 3).trim();
  }
  return text.replace(/^Error:\s*/i, "").trim();
}

/**
 * Фраза для оператора: перевод кода, если он заведён, иначе сам код.
 *
 * `t` передаётся снаружи -- модуль не должен зависеть от стора локали, иначе
 * его не позвать из слайса.
 */
export function errorMessage(
  t: (path: string) => string,
  err: unknown,
): string {
  const code = errorCode(err);
  if (code === "") {
    return errorText(err);
  }
  const key = `api.${code}`;
  const phrase = t(key);
  if (phrase !== key) {
    return phrase;
  }
  /*
   * Часть кодов приходит с уточнением: `invalid_address: zzz`. Переводится
   * голова, хвост остаётся как есть -- в нём то самое значение, из-за которого
   * запись не прошла, и без него фраза не говорит, какую строку править.
   */
  const colon = code.indexOf(": ");
  if (colon > 0) {
    const head = code.slice(0, colon);
    const headPhrase = t(`api.${head}`);
    if (headPhrase !== `api.${head}`) {
      return `${headPhrase} ${code.slice(colon + 2)}`;
    }
  }
  return code;
}

/**
 * Отказ thunk'а -- строкой, удача -- `null`.
 *
 * Ровно то, чего ждут окна строки списка ([useRowOps]): текст показать в
 * своей полосе, `null` -- закрыться. Разбор `rejected.match` был скопирован
 * по формам, и каждая копия по-своему добиралась до `payload`.
 */
export function thunkError(result: {
  meta: { requestStatus: "pending" | "fulfilled" | "rejected" };
  payload?: unknown;
  error?: unknown;
}): string | null {
  if (result.meta.requestStatus !== "rejected") {
    return null;
  }
  if (typeof result.payload === "string" && result.payload !== "") {
    return result.payload;
  }
  return errorText(result.error);
}
