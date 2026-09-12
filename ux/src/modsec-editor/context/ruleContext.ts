import { createContext, useContext } from 'react';
import type { ParsedDocument } from '../modsec/types';
import type { CompileResult } from '../modsec/compile';
import type { Analysis } from './useInspection';
import type { VisualRule } from '../modsec/model';

/**
 * Значение контекста редактора правил — тонкий фасад над Redux.
 *
 * Текст правила остаётся источником правды: и текстовый редактор, и
 * визуальный конструктор в конечном счёте вызывают `setSource`. Разница лишь
 * в том, что конструктор сначала собирает новый текст из модели.
 */
export interface RuleContextValue {
  /** «Сырой» текст правила. */
  source: string;
  /** Объектная модель текста (null до первого разбора). */
  parsed: ParsedDocument | null;
  /** Ошибка разбора, если парсер неожиданно упал. */
  parseError: string | null;
  /**
   * Результат компиляции: модель конструктора и структурные замечания.
   * `compiled.ok === false` означает, что визуальная вкладка недоступна.
   */
  compiled: CompileResult;
  /**
   * Все замечания о документе — структурные и смысловые вместе.
   *
   * Отдельно от `compiled`, потому что появляются они в разное время:
   * структура готова к первому же кадру, смысл на большом файле догоняет
   * в паузах. Кто показывает список замечаний, берёт его отсюда.
   */
  analysis: Analysis;

  /** Обновить текст правила (запускает повторный разбор и компиляцию). */
  setSource: (source: string) => void;
  /**
   * Заменить текст целиком: файлом с диска, примером.
   *
   * Отдельно от `setSource`, потому что история у них разная: набор текста
   * склеивается в один шаг, а замена — всегда свой шаг, чтобы отмена вернула
   * ровно то, что было до неё.
   */
  replaceSource: (source: string) => void;
  /** Записать изменённое правило обратно в текст. */
  updateRule: (rule: VisualRule) => void;
  /** Заменить диапазон утверждений готовыми строками. */
  replaceLines: (from: number, to: number, lines: string[]) => void;
  /**
   * Вставить готовые строки сразу за утверждением.
   *
   * Отдельно от замены диапазона, потому что дописывают не в правило, а
   * рядом с ним: исключение — своя строка файла, и правило от неё не меняется.
   */
  insertLines: (after: number, lines: string[]) => void;
  /** Удалить блок документа по диапазону утверждений. */
  removeBlock: (from: number, to: number) => void;
  /** Добавить новое правило в конец документа. */
  addRule: () => void;
  /** Добавить безусловное действие `SecAction` в конец документа. */
  addAction: () => void;
  /**
   * Добавить метку `SecMarker` в конец документа.
   *
   * Имени она не спрашивает: незанятое подбирает редактор, а осмысленное
   * вписывают в самой строке — содержимого у метки ровно одно.
   */
  addMarker: () => void;
  /**
   * Добавить готовую строку директивы в конец документа.
   *
   * Строкой, а не именем: незаполненную директиву ModSecurity не загрузит, и
   * одна такая ошибка блокирует конструктор целиком — поэтому и имя, и
   * значение выбирают до того, как строка появилась в файле.
   */
  addDirective: (line: string) => void;
  /** Вставить копию правила сразу за ним, со свободным `id`. */
  duplicateRule: (rule: VisualRule) => void;
  /** Поменять местами два блока документа по их диапазонам утверждений. */
  swapBlocks: (first: [number, number], second: [number, number]) => void;
  /** Разложить текст по строкам: по одному действию в строке. */
  formatSource: () => void;
  /** false, когда форматировать нечего — текст уже в нужном виде. */
  canFormat: boolean;

  /* --- История --- */
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const RuleContext = createContext<RuleContextValue | null>(null);

/** Доступ к контексту правила. Бросает, если вызван вне `RuleProvider`. */
export function useRule(): RuleContextValue {
  const ctx = useContext(RuleContext);
  if (ctx === null) {
    throw new Error('useRule must be used within a <RuleProvider>');
  }
  return ctx;
}
