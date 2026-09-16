import { DIRECTIVE_FORM_NAMES, directiveMeta } from './directives';
import { CTL_EXCLUSION_OPTIONS } from './exclusions';
import { SETVAR_COLLECTIONS } from './setvar';
import {
  DISRUPTIVE_ACTIONS,
  OPERATOR_NAMES,
  PHASE_NAMES,
  SETVAR_OPS,
  SEVERITY_NAMES,
  TRANSFORM_NAMES,
  ctlExclusionMeta,
  disruptiveMeta,
  logFlagMeta,
  operatorMeta,
  phaseMeta,
  setvarCollectionMeta,
  setvarOpMeta,
  severityMeta,
  transformMeta,
} from './semantics';
import type { ActionMeta, Label, ValueKind } from './semantics';

export interface Choice {
  value: string;
  label: Label;
  note: Label;
  group: Label;
  common: boolean;
  recommended: boolean;
  unfit: Label | null;
}

const RECOMMENDED_GROUP: Label = {
  en: 'Fits this check',
  ru: 'Подходит этой проверке',
};

const UNFIT_GROUP: Label = {
  en: 'Does not fit the value',
  ru: 'Не подходит к значению',
};

const UNKNOWN_GROUP: Label = {
  en: 'Not from the list',
  ru: 'Не из списка',
};

const UNFIT_REASON: Record<ValueKind, Label> = {
  string: {
    en: 'Does not apply to a text value',
    ru: 'К текстовому значению не применяется',
  },
  number: {
    en: 'The value here is already a number',
    ru: 'Здесь в руках уже число, а не текст',
  },
  binary: {
    en: 'The value here is raw bytes',
    ru: 'Здесь в руках сырые байты, а не текст',
  },
};

const UNKNOWN_NOTE: Label = {
  en: 'Not in the built-in list — check the spelling',
  ru: 'Во встроенном списке такого нет — проверьте написание',
};

function unknownChoice(value: string): Choice {
  return {
    value,
    label: { en: value, ru: value },
    note: UNKNOWN_NOTE,
    group: UNKNOWN_GROUP,
    common: true,
    recommended: false,
    unfit: null,
  };
}

function shelve(choices: Choice[]): Choice[] {
  return [
    ...choices
      .filter((choice) => choice.unfit === null && choice.recommended)
      .map((choice) => ({ ...choice, group: RECOMMENDED_GROUP })),
    ...choices.filter((choice) => choice.unfit === null && !choice.recommended),
    ...choices
      .filter((choice) => choice.unfit !== null)
      .map((choice) => ({ ...choice, group: UNFIT_GROUP })),
  ];
}

export function transformChoices(
  kind: ValueKind,
  recommended: string[],
  current: string,
): Choice[] {
  const fit = new Set(recommended);

  const known = TRANSFORM_NAMES.map((value) => {
    const meta = transformMeta(value);
    if (meta === null) return unknownChoice(value);
    const applies = meta.accepts.includes(kind);
    return {
      value,
      label: meta.label,
      note: meta.note,
      group: meta.group,
      common: meta.common,
      recommended: applies && fit.has(value),
      unfit: applies ? null : UNFIT_REASON[kind],
    };
  });

  return withCurrent(shelve(known), current, transformMeta(current) !== null);
}

export function operatorChoices(
  kind: ValueKind,
  recommended: string[],
  current: string,
): Choice[] {
  const fit = new Set(recommended);

  const known = OPERATOR_NAMES.map((value) => {
    const meta = operatorMeta(value);
    if (meta === null) return unknownChoice(value);
    const applies = meta.inputs.includes(kind);
    return {
      value,
      label: meta.label,
      note: meta.note,
      group: meta.group,
      common: meta.common,
      recommended: applies && fit.has(value),
      unfit: applies ? null : UNFIT_REASON[kind],
    };
  });

  return withCurrent(shelve(known), current, operatorMeta(current) !== null);
}

function actionChoices(
  names: readonly string[],
  meta: (name: string) => ActionMeta | null,
  current: string,
): Choice[] {
  const known: Choice[] = names.map((value) => {
    const info = meta(value);
    if (info === null) return unknownChoice(value);
    return {
      value,
      label: info.label,
      note: info.note,
      group: info.group,
      common: true,
      recommended: false,
      unfit: null,
    };
  });

  return withCurrent(known, current, meta(current) !== null);
}

export function disruptiveChoices(current: string): Choice[] {
  return actionChoices(DISRUPTIVE_ACTIONS, disruptiveMeta, current);
}

export function phaseChoices(current: string): Choice[] {
  return actionChoices(PHASE_NAMES, phaseMeta, current);
}

export function ctlExclusionChoices(current: string): Choice[] {
  return actionChoices(CTL_EXCLUSION_OPTIONS, ctlExclusionMeta, current);
}

export function severityChoices(current: string): Choice[] {
  return actionChoices(SEVERITY_NAMES, severityMeta, current);
}

export function setvarCollectionChoices(current: string): Choice[] {
  return actionChoices(SETVAR_COLLECTIONS, setvarCollectionMeta, current);
}

export function setvarOpChoices(current: string): Choice[] {
  return actionChoices(SETVAR_OPS, setvarOpMeta, current);
}

export function directiveChoices(current: string): Choice[] {
  const known: Choice[] = DIRECTIVE_FORM_NAMES.map((value) => {
    const meta = directiveMeta(value);
    if (meta === null) return unknownChoice(value);
    return {
      value,
      label: meta.label,
      note: meta.note,
      group: meta.group,
      common: meta.common,
      recommended: false,
      unfit: null,
    };
  });

  return withCurrent(known, current, directiveMeta(current) !== null);
}

export function directiveValueChoices(name: string, current: string): Choice[] {
  const meta = directiveMeta(name);
  const values = meta?.values;
  if (meta === null || values === undefined) {
    return current === '' ? [] : [unknownChoice(current)];
  }

  const known: Choice[] = Object.entries(values).map(([value, info]) => ({
    value,
    label: info.label,
    note: info.note,
    group: meta.label,
    common: true,
    recommended: false,
    unfit: null,
  }));

  return withCurrent(known, current, values[current] !== undefined);
}

export function logFlagChoices(flags: readonly string[], current: string): Choice[] {
  return actionChoices(flags, logFlagMeta, current);
}

function withCurrent(choices: Choice[], current: string, known: boolean): Choice[] {
  if (current === '' || known) return choices;
  return [...choices, unknownChoice(current)];
}
