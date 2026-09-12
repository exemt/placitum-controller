import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import { BRACKET_WIDTH } from './layout';
import { CONTROL_HEIGHT } from '../../theme';

interface BracketLineProps {
  /** То же имя, что у обнимающей скобки. */
  name: string;
  /** Смещение строки полей от верха элемента группы. */
  top?: number | string;
  /** Высота отмечаемой строки, если она ниже поля — например, у кнопки. */
  height?: number | string;
}

/**
 * Невидимая отметка строки полей для {@link Bracket}.
 *
 * Строка полей элемента группы не имеет собственного бокса — это несколько
 * ячеек сетки. Отметка даёт скобке то, что можно замерить, и ничего не
 * занимает в раскладке.
 */
export function BracketLine({ name, top = 0, height = CONTROL_HEIGHT }: BracketLineProps) {
  return (
    <Box
      aria-hidden
      data-bracket-line={name}
      sx={{
        position: 'absolute',
        left: 0,
        top,
        width: 0,
        height,
        pointerEvents: 'none',
      }}
    />
  );
}

interface BracketProps {
  /** Подпись связки: «И» или «ИЛИ». */
  label: string;
  /** Цвет скобки — красный для И, оранжевый для ИЛИ. */
  color: string;
  /**
   * Имя строк, которые скобка обнимает. Элементы группы помечают свою
   * строку полей атрибутом `data-bracket-line` с этим значением.
   */
  line: string;
  children: ReactNode;
}

/**
 * Логическая связка в виде скобки: подпись слева, вертикальная линия,
 * охватывающая все элементы группы, и короткий отвод к подписи.
 *
 * Скобка — единственный способ показать приоритет операций так, чтобы его
 * не приходилось читать: всё, что линия обнимает, объединено этой связкой.
 *
 * Линия идёт во всю высоту группы: она обнимает элементы целиком, до края
 * первого и последнего, а не их центры. Иначе у элемента с высокой шапкой
 * линия начиналась заметно ниже его верхнего края и охват выглядел
 * обрезанным сверху.
 *
 * А вот подпись ставится по строкам полей, а не по середине группы. Элемент
 * группы выше своей первой строки: под ним и пояснение к переменной, и
 * исключения, которые растут по мере добавления. Если считать по высоте,
 * подпись уезжает под эти служебные строки, причём на разное расстояние в
 * каждой группе — поэтому центры первой и последней строки замеряются по
 * факту.
 */
/** Отступ от линии до правого края колонки — как было при фиксированной ширине. */
const LINE_MARGIN = 10;

/** Длина усика, соединяющего линию с подписью. */
const TICK_LENGTH = 6;

/** Зазор между правым краем подписи и началом усика. */
const LABEL_GAP = 4;

export function Bracket({ label, color, line, children }: BracketProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState<{ top: number; bottom: number } | null>(null);
  const [labelWidth, setLabelWidth] = useState<number | null>(null);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (host === null) return;

    const lines = host.querySelectorAll<HTMLElement>(`[data-bracket-line="${line}"]`);
    if (lines.length === 0) {
      setSpan(null);
    } else {
      const origin = host.getBoundingClientRect().top;
      const first = lines[0].getBoundingClientRect();
      const last = lines[lines.length - 1].getBoundingClientRect();
      const next = {
        top: first.top - origin + first.height / 2,
        bottom: last.top - origin + last.height / 2,
      };
      setSpan((prev) =>
        prev !== null && prev.top === next.top && prev.bottom === next.bottom ? prev : next,
      );
    }

    // Подпись — это перевод, и её длина не фиксирована: «И» и «AND» занимают
    // разную ширину. Замеряем фактическую ширину, а не полагаемся на
    // BRACKET_WIDTH, иначе длинный перевод налезет на линию и на контент.
    const labelBox = labelRef.current;
    if (labelBox !== null) {
      const width = labelBox.getBoundingClientRect().width;
      setLabelWidth((prev) => (prev !== null && Math.abs(prev - width) < 0.5 ? prev : width));
    }
  }, [line]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(host);
    if (labelRef.current !== null) observer.observe(labelRef.current);
    host
      .querySelectorAll<HTMLElement>(`[data-bracket-line="${line}"]`)
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [children, line, measure]);

  // До первого замера подпись стоит по середине группы: так она не мигает
  // при первом кадре и остаётся осмысленной, если строк не нашлось.
  const center = span === null ? '50%' : `${(span.top + span.bottom) / 2}px`;

  // Колонка растягивается вслед за подписью: короткие «И»/«OR» укладываются
  // в прежнюю минимальную ширину без сдвига, а более длинный перевод
  // отодвигает линию и усик вправо вместо того, чтобы залезть под них.
  const columnWidth =
    labelWidth === null
      ? BRACKET_WIDTH
      : Math.max(BRACKET_WIDTH, Math.ceil(labelWidth) + LABEL_GAP + TICK_LENGTH + LINE_MARGIN);
  const lineLeft = columnWidth - LINE_MARGIN;
  const tickLeft = lineLeft - TICK_LENGTH;

  return (
    // Замеряем от внешней обёртки: отметки строк лежат в children, а не в
    // колонке скобки. Верх у обёртки и колонки общий (`stretch`), поэтому
    // смещения переносятся в колонку без пересчёта.
    <Box ref={hostRef} sx={{ display: 'flex', alignItems: 'stretch' }}>
      <Box sx={{ position: 'relative', width: columnWidth, flexShrink: 0 }}>
        <Box
          sx={{
            position: 'absolute',
            left: lineLeft,
            top: 0,
            bottom: 0,
            borderLeft: '1px solid',
            borderColor: color,
            opacity: 0.7,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: center,
            left: tickLeft,
            width: TICK_LENGTH,
            borderTop: '1px solid',
            borderColor: color,
            opacity: 0.7,
          }}
        />
        <Box
          ref={labelRef}
          sx={{
            position: 'absolute',
            top: center,
            left: 0,
            transform: 'translateY(-50%)',
            px: 0.75,
            py: 0.125,
            borderRadius: 1,
            bgcolor: color,
            color: 'common.black',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            lineHeight: '18px',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Box>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}
