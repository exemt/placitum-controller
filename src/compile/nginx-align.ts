/**
 * Колонки в печати: соседние строки одной директивы встают в столбик.
 *
 * Реестр инспекторов -- полтора десятка строк подряд, у которых различаются
 * только имя и `profile=`. В один пробел они читаются как сплошной текст:
 * чтобы найти, у кого профиль, глаз идёт по каждой строке до конца. С общими
 * колонками имена читаются столбцом, а `profile=` виден сразу.
 *
 * Правило одно: подряд идущие строки с одинаковым отступом и одинаковым первым
 * словом -- это столбик, и каждая колонка в нём шириной с самое длинное слово.
 * Разные директивы в столбик не сводятся: `worker_processes` и `error_log`
 * рядом -- не таблица, а две разные настройки.
 *
 * Чего пасс не трогает:
 *  - элементы с переводом строки -- это готовый блок (вложенный `server {}`)
 *    или raw оператора: его текст едет как написан, до буквы;
 *  - строки с кавычками -- внутри строки бывает пробел, и разбор по пробелам
 *    вставил бы отступ в само значение (`log_format`, тела отказов);
 *  - строки без `;` на конце -- скобки, комментарии, пустые.
 *
 * Пасс идемпотентен: разбор идёт по любому числу пробелов, поэтому второй
 * проход по уже выровненному тексту даёт тот же текст. Это важно потому, что
 * блок сервера выравнивают дважды -- сам по себе (превью одного блока) и в
 * составе файла.
 */

/** Колонка шире этого -- не колонка, а дыра: столбик такого не стоит. */
const MAX_COLUMN = 40;

interface Row {
  line: string;
  indent: string;
  tokens: string[];
}

function rowOf(line: string): Row | null {
  if (line.includes("\n")) {
    return null;
  }
  const body = line.trimStart();
  if (body === "" || body.startsWith("#") || !body.endsWith(";")) {
    return null;
  }
  if (body.includes('"') || body.includes("'")) {
    return null;
  }
  const tokens = body.split(/\s+/);
  if (tokens.length < 2) {
    return null;
  }
  return { line, indent: line.slice(0, line.length - body.length), tokens };
}

/**
 * Ширины колонок столбика. Последнее слово строки в ширину не идёт: за ним
 * ничего не стоит, и точка с запятой не должна раздвигать соседей.
 */
function widthsOf(rows: Row[]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.tokens.length - 1; i += 1) {
      widths[i] = Math.max(widths[i] ?? 0, row.tokens[i].length);
    }
  }
  return widths;
}

function alignRun(rows: Row[]): string[] {
  if (rows.length < 2) {
    return rows.map((row) => row.line);
  }
  const widths = widthsOf(rows);
  if (widths.some((width) => width > MAX_COLUMN)) {
    return rows.map((row) => row.line);
  }
  return rows.map(
    (row) =>
      row.indent +
      row.tokens
        .map((token, i) =>
          i === row.tokens.length - 1 ? token : token.padEnd(widths[i]),
        )
        .join(" "),
  );
}

/**
 * Обратное `alignColumns`: столбик схлопывается обратно в один пробел.
 *
 * Этим читают готовый текст проверки компиляторов: они смотрят, какая
 * директива напечатана, а не какой ширины вышла колонка. Без этого каждая из
 * них зависела бы от длины соседнего имени в том же блоке -- новый инспектор
 * в наборе ронял бы проверки, которые про него ничего не знают.
 */
export function flattenColumns(text: string): string {
  return text.replace(/(\S) {2,}/g, "$1 ");
}

/** Выровнять столбики в собранных строках блока. */
export function alignColumns(lines: string[]): string[] {
  const out: string[] = [];
  let run: Row[] = [];

  const flush = () => {
    if (run.length > 0) {
      out.push(...alignRun(run));
      run = [];
    }
  };

  for (const line of lines) {
    const row = rowOf(line);
    if (
      row === null ||
      (run.length > 0 &&
        (run[0].indent !== row.indent || run[0].tokens[0] !== row.tokens[0]))
    ) {
      flush();
    }
    if (row === null) {
      out.push(line);
      continue;
    }
    run.push(row);
  }
  flush();

  return out;
}
