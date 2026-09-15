/**
 * «Сигналы ранних волн» — правила приёма чужих просьб: единственное место,
 * где действие соседа что-то значит. Без правила просьба видна только в
 * аудите.
 *
 * Один блок на всех получателей канала — капчу, контракт API и правила.
 * Сигналы и «Правила» ходят парой: сначала что принимаем, потом что говорим
 * сами. У чистых отправителей (ip) сигналов нет вовсе — им никто ничего не
 * шлёт, и это нормальное состояние, а не пропуск.
 *
 * Строка таблицы — готовая запись словами, как у пары «Правила»: заводит и
 * правит её окно (`SignalDialog`), «+» в шапке открывает его пустым. В
 * ячейках правило не собиралось: у семи колонок счётчика поле поводов
 * схлопывалось в ноль, а отправителя набирали текстом — с опечаткой в имени
 * правило молчало навсегда, и узнавалось это по замечанию «нет в реестре»
 * уже после сохранения. В окне отправитель выбирается из реестра.
 *
 * Разница между получателями — пропсами: список глаголов (у капчи есть пункт
 * «все действия»), оси (их держат калитка и счётчик: там важно, о ком
 * просьба — о запросе, адресе или сессии), корзина-адресат note (только у
 * счётчика), подсказки поводов из реестра отправителей. Чисел в правиле нет:
 * оно решает «от кого, что и по какому поводу», а величину просьбы держит
 * загрузчик отправителя.
 */

import { useState } from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

import { serviceOfSubject, type InspectorMeta, type SenderCode } from "../api.ts";
import { TableNotice, TableNoticeRow, type FilterOption } from "./data-table/index.ts";
import { DialogMulti, DialogPick, type DialogOption } from "./dialog-kit.tsx";
import { Modal } from "./Modal.tsx";
import { CODE_W, HeadCell, TableBlock, flushTableSx } from "./table-block.tsx";
import { AddCell, RowActions, TextCell } from "./rules-table.tsx";
import { ACTION_CODE_RE, ActionCodesField, axisLabel, verbLabel } from "./action-select.tsx";
import { useT, type Translate } from "../i18n/index.ts";

/** Строка приёма. Форма общая для всех получателей канала. */
export interface SignalRule {
  from: string;
  accept: string[];
  codes: string[];
  /** Оси, о которых слушаем просьбу; пусто — любая. Есть не у всех. */
  apply?: string[];
  /**
   * Корзина-адресат принятых note. Есть только у счётчика: имя корзины по
   * проводу не ездит, его называет правило приёма.
   */
  counter?: string;
}

/** Отправитель «любой»: на проводе `from: "*"`. */
export const ANY_SENDER = "*";

/** Пункт «все действия» в списке глаголов капчи. */
const ALL_VERBS = "*";

/*
 * Ширины колонок -- одна константа на колонку: шапка и строка берут её же.
 *
 * У повода ширина своя, [CODE_W], и одна на все семь карточек: ящики у них
 * разные (680 у капчи и калитки, 720 у правки ответов, 908 у счётчика), и
 * пока остаток таблицы забирал повод, одна и та же колонка стояла то в 82px
 * у калитки, то в 300 у счётчика.
 *
 * Остаток забирает соседняя колонка -- «Параметры» там, где она есть, иначе
 * «Что принимать»: в них самый длинный текст строки («О ком: адрес · Корзина:
 * stand_abuse», «Переключить модификаторы»), и лишняя полоса им в пользу.
 * Колонка без ширины в таблице по-прежнему ровно одна: когда ширина задана у
 * всех, остаток раздаётся им пропорционально и «+» уезжает от правого края.
 */
const FROM_W = 130;
const ACCEPT_W = 170;

/** Широковещательное правило: имени отправителя нет. */
function broadcast(from: string): boolean {
  const name = from.trim();

  return name === "" || name === ANY_SENDER;
}

export function SignalsBlock({
  hint,
  rules,
  verbs,
  weakening = [],
  codes = [],
  unknown = [],
  senders = [],
  axes,
  targets,
  defaultRule,
  embedded = false,
  onChange,
}: {
  /** Серая строка под заголовком: чем приём этого инспектора особенный. */
  hint: string;
  rules: SignalRule[];
  /** Глаголы, которые инспектор умеет применять; пункт «все» — дело вызывающего. */
  verbs: readonly FilterOption<string>[];
  /**
   * Глаголы, которые ослабляют защиту. Широковещательному правилу (`from` пуст
   * или `*`) они недоступны: загрузчик такое правило не примет, а собрать
   * мышью то, что не сохранится, оператор не должен. Пункт «все действия»
   * (значение `*`) отсюда же выпадает — он включает и послабления.
   */
  weakening?: readonly string[];
  /** Подсказки поводов — что объявили отправители контура и кто именно. */
  codes?: readonly SenderCode[];
  /** Отправители, которых нет в реестре: замечание, а не отказ. */
  unknown?: readonly string[];
  /**
   * Реестр контура: из него выбирается отправитель. Имя на проводе -- имя
   * объявления (ip-ext, modsec-strict), а не сервис, и набирать его текстом
   * значит сверять с реестром по памяти.
   */
  senders?: readonly InspectorMeta[];
  /**
   * Оси. Зависят от выбранных глаголов, поэтому список считает вызывающий:
   * реестр знает, о чём умеет говорить каждое действие.
   */
  axes?: (accept: string[]) => readonly FilterOption<string>[];
  /**
   * Корзина для принятых note — селектор из деклараций fill: note. Есть только
   * у счётчика; строка без note держит её пустой.
   */
  targets?: readonly FilterOption<string>[];
  /** С чего начинается новая строка: у каждого получателя свой разумный старт. */
  defaultRule: () => SignalRule;
  /**
   * Без своей шапки: таблица встаёт в карточку, у которой заголовок уже есть
   * (json держит сигналы отдельной секцией). Второй заголовок под первым
   * читался бы повтором.
   */
  embedded?: boolean;
  onChange: (rules: SignalRule[]) => void;
}) {
  const t = useT();
  /** Индекс строки в окне; null -- новая, undefined -- окно закрыто. */
  const [editing, setEditing] = useState<number | null | undefined>(undefined);

  /*
   * Что предлагать этой строке. У широковещательной — только ужесточающие:
   * послабление от кого угодно это способ для одного скомпрометированного
   * инспектора отменить находки всех остальных.
   *
   * Глагол, который в строке уже записан, но словарём этому инспектору больше
   * не предлагается (так ушёл skip у всех, кроме счётчика), остаётся в её
   * списке: загрузчик его по-прежнему принимает, и прятать сохранённое
   * правило нельзя — его видно и можно снять, а добавить заново негде.
   */
  const verbsOf = (rule: SignalRule): readonly FilterOption<string>[] => {
    const offered = broadcast(rule.from)
      ? verbs.filter((v) => v.value !== ALL_VERBS && !weakening.includes(v.value))
      : verbs;
    const kept = rule.accept
      .filter((v) => v !== ALL_VERBS && !offered.some((o) => o.value === v))
      .map((v) => ({ value: v, label: verbLabel(t, v) }));

    return kept.length === 0 ? offered : [...offered, ...kept];
  };

  const weakBroadcast = rules.some(
    (r) => broadcast(r.from) && r.accept.some((v) => v === ALL_VERBS || weakening.includes(v)),
  );

  const notices = [
    /*
     * Правило, которое загрузчик отвергнет: послабление без имени
     * отправителя. Сказать это надо в блоке, а не сырой ошибкой после
     * «Сохранить».
     */
    weakBroadcast ? (
      <TableNotice
        key="weak"
        kind="info"
        severity="warning"
        message={t("prior.broadcastWeakens")}
      />
    ) : null,
    unknown.length > 0 ? (
      <TableNotice
        key="unknown"
        kind="info"
        message={`${t("channel.unknownSenders")}: ${unknown.join(", ")}`}
      />
    ) : null,
  ].filter(Boolean);

  const notice = notices.length > 0 ? <>{notices}</> : undefined;

  /* Колонка «Параметры» есть у того, у кого есть что в ней сказать. */
  const params = axes !== undefined || targets !== undefined;

  const acceptLabel = (verb: string): string =>
    verbs.find((v) => v.value === verb)?.label ?? verbLabel(t, verb);

  const table = (
    <Table size="small" sx={flushTableSx}>
      <TableHead>
        <TableRow>
          <HeadCell label={t("prior.from")} width={FROM_W} />
          <HeadCell label={t("prior.accept")} width={params ? ACCEPT_W : undefined} />
          <HeadCell label={t("prior.codes")} width={CODE_W} />
          {params && <HeadCell label={t("outcomes.outcomeParams")} />}
          <AddCell label={t("common.add")} onAdd={() => setEditing(null)} />
        </TableRow>
      </TableHead>
      <TableBody>
        {/* Пустая таблица — обычное состояние: никого не слушает. */}
        {rules.length === 0 && (
          <TableNoticeRow colSpan={params ? 5 : 4} kind="empty" message={t("prior.empty")} />
        )}
        {rules.map((rule, i) => (
          <TableRow key={i} hover>
            <TextCell
              text={broadcast(rule.from) ? t("prior.fromAny") : rule.from}
              muted={broadcast(rule.from)}
            />
            <TextCell text={rule.accept.map(acceptLabel).join(", ")} />
            <TextCell
              text={rule.codes.length === 0 ? t("prior.codesAny") : rule.codes.join(", ")}
              muted={rule.codes.length === 0}
            />
            {params && (
              <TextCell text={summaryOf(t, rule, { axes, targets })} muted />
            )}
            <RowActions
              onEdit={() => setEditing(i)}
              onRemove={() => onChange(rules.filter((_r, j) => j !== i))}
            />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const dialog = editing !== undefined && (
    <SignalDialog
      rule={editing === null ? defaultRule() : (rules[editing] ?? defaultRule())}
      isNew={editing === null}
      verbsOf={verbsOf}
      senders={senders}
      codes={codes}
      axes={axes}
      targets={targets}
      onSave={(next) => {
        onChange(
          editing === null ? [...rules, next] : rules.map((r, i) => (i === editing ? next : r)),
        );
        setEditing(undefined);
      }}
      onClose={() => setEditing(undefined)}
    />
  );

  if (embedded === true) {
    return (
      <>
        {notice}
        {table}
        {dialog}
      </>
    );
  }

  return (
    <>
      <TableBlock
        title={t("channel.signals")}
        label={hint}
        /*
         * Просьба без адресата: правило есть, отправителя в реестре нет.
         * Не ошибка сохранения — реестр правят отдельно, и профиль, написанный
         * вперёд него, нормальный порядок работы. Поэтому замечание, а не отказ.
         */
        notice={notice}
      >
        {table}
      </TableBlock>
      {dialog}
    </>
  );
}

/** Колонка «Параметры»: то из строки, что не вошло в первые три. */
function summaryOf(
  t: Translate,
  rule: SignalRule,
  cols: {
    axes?: (accept: string[]) => readonly FilterOption<string>[];
    targets?: readonly FilterOption<string>[];
  },
): string {
  const parts: string[] = [];

  if (cols.axes !== undefined && (rule.apply ?? []).length > 0) {
    const options = cols.axes(rule.accept);
    const names = (rule.apply ?? []).map(
      (axis) => options.find((o) => o.value === axis)?.label ?? axisLabel(t, axis),
    );

    parts.push(`${t("prior.apply")}: ${names.join(", ")}`);
  }

  if (cols.targets !== undefined && (rule.counter ?? "") !== "") {
    parts.push(`${t("prior.counter")}: ${rule.counter}`);
  }

  return parts.length === 0 ? "—" : parts.join(" · ");
}

/**
 * Окно одной строки приёма: от кого → что → о ком → куда → поводы.
 * Порядок полей повторяет порядок ключей правила в YAML.
 *
 * Поля живут в локальном черновике и уходят родителю одним `onSave`: строка
 * в таблице -- уже готовая запись, полуготовой там не бывает.
 */
function SignalDialog({
  rule,
  isNew,
  verbsOf,
  senders,
  codes,
  axes,
  targets,
  onSave,
  onClose,
}: {
  rule: SignalRule;
  isNew: boolean;
  verbsOf: (rule: SignalRule) => readonly FilterOption<string>[];
  senders: readonly InspectorMeta[];
  codes: readonly SenderCode[];
  axes?: (accept: string[]) => readonly FilterOption<string>[];
  targets?: readonly FilterOption<string>[];
  onSave: (rule: SignalRule) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<SignalRule>(() => ({
    ...rule,
    /* Пустое имя и `*` -- одно и то же правило; в селекторе у него один пункт. */
    from: broadcast(rule.from) ? ANY_SENDER : rule.from,
    accept: [...rule.accept],
    codes: [...rule.codes],
    apply: rule.apply === undefined ? undefined : [...rule.apply],
  }));

  const set = (part: Partial<SignalRule>) => setDraft((prev) => ({ ...prev, ...part }));

  /*
   * Отправитель -- из реестра. Имя, которого в реестре нет, из списка не
   * выбрасывается: оно показывается помеченным, иначе поле показывало бы
   * пустоту там, где в профиле лежит правило.
   */
  const senderOptions: DialogOption<string>[] = [
    { value: ANY_SENDER, label: t("prior.fromAnyLong"), tag: ANY_SENDER },
    ...senders.map((row) => ({
      value: row.name,
      label: row.name,
      tag: serviceOfSubject(row.subject),
    })),
  ];

  if (!broadcast(draft.from) && !senders.some((row) => row.name === draft.from)) {
    senderOptions.push({ value: draft.from, label: draft.from, tag: "?", missing: true });
  }

  const wantsNote = draft.accept.includes("note");
  const axisOptions = axes?.(draft.accept) ?? [];

  const setFrom = (from: string) => {
    const next = { ...draft, from };

    /* Стал широковещательным -- послабления из строки уходят: их не предложат. */
    if (broadcast(from)) {
      const offered = verbsOf(next);

      next.accept = next.accept.filter((v) => offered.some((o) => o.value === v));
    }

    setDraft(next);
  };

  const setAccept = (picked: string[]) => {
    let accept = picked;
    const hadAll = draft.accept.includes(ALL_VERBS);
    const hasAll = accept.includes(ALL_VERBS);

    /* «Все действия» -- один пункт вместо списка, а не пункт в списке. */
    if (hasAll && !hadAll) {
      accept = [ALL_VERBS];
    } else if (hasAll && accept.length > 1) {
      accept = accept.filter((v) => v !== ALL_VERBS);
    }

    const next = { ...draft, accept };

    /* Ось, которой при новых глаголах нет, молчала бы навсегда. */
    if (axes !== undefined) {
      const allowed = axes(accept).map((o) => o.value);

      next.apply = (next.apply ?? []).filter((axis) => allowed.includes(axis));
    }

    if (targets !== undefined && !accept.includes("note")) {
      next.counter = "";
    }

    setDraft(next);
  };

  const badCodes = draft.codes.some((code) => !ACTION_CODE_RE.test(code));

  /*
   * Что загрузчик не примет, то и кнопка не отдаст: корзина при note
   * обязательна, глаголов без правила не бывает.
   */
  const ready =
    draft.accept.length > 0 &&
    !badCodes &&
    (targets === undefined || !wantsNote || (draft.counter ?? "") !== "");

  return (
    <Modal
      onClose={onClose}
      size="xs"
      title={isNew ? t("prior.addSignal") : t("prior.editSignal")}
      hint={t("prior.dialogHint")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={() => onSave(draft)}>
            {isNew ? t("common.add") : t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <DialogPick
        label={t("prior.from")}
        hint={t("prior.fromHint")}
        value={draft.from}
        options={senderOptions}
        mono
        onChange={setFrom}
      />
      <DialogMulti
        label={t("prior.accept")}
        hint={t("prior.acceptHint")}
        value={draft.accept}
        options={verbsOf(draft)}
        emptyLabel={t("prior.counterPick")}
        onChange={setAccept}
      />
      {axes !== undefined && (
        <DialogMulti
          label={t("prior.apply")}
          hint={t("prior.applyHint")}
          value={draft.apply ?? []}
          options={axisOptions}
          emptyLabel={t("prior.applyAny")}
          disabled={axisOptions.length === 0}
          onChange={(apply) => set({ apply })}
        />
      )}
      {targets !== undefined && (
        <DialogPick
          label={t("prior.counter")}
          hint={t("prior.counterHint")}
          value={draft.counter ?? ""}
          options={[
            { value: "", label: wantsNote ? t("prior.counterPick") : "—" },
            ...targets.map((row) => ({ value: row.value, label: row.label })),
          ]}
          disabled={!wantsNote}
          mono
          onChange={(counter) => set({ counter })}
        />
      )}
      <ActionCodesField
        label={t("prior.codes")}
        hint={t("prior.codesHint")}
        anyLabel={t("prior.codesAny")}
        value={draft.codes}
        options={codes}
        onChange={(next) => set({ codes: next })}
      />
    </Modal>
  );
}
