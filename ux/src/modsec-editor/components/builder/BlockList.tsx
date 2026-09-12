import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import Box from '@mui/material/Box';
import { BLOCK_GAP, COLLAPSED_STEP, segmentsOf, visibleRange } from './blockRuns';

/**
 * Список блоков конструктора, который не платит за то, чего не видно.
 *
 * Схема держится на одном наблюдении: свёрнутые блоки все одной высоты, а
 * раскрытых на экране единицы. Поэтому раскрытые остаются в обычном потоке и
 * высоту их знать не нужно, а подряд идущие свёрнутые собираются в серию:
 * высота серии считается умножением, строки внутри неё ставятся по известному
 * смещению, и в DOM попадают только те, что рядом с окном.
 *
 * Отсюда же следует, что смещения не расходятся с действительностью:
 * положение серии берётся из настоящего DOM перед каждым пересчётом, а её
 * собственная высота от числа показанных строк не зависит.
 *
 * Цена схемы называется честно: то, что не смонтировано, не найдёт ни поиск
 * браузера, ни обход по Tab. На файле, где виртуализация вообще включается,
 * искать всё равно удобнее в текстовой вкладке.
 */

/** Сколько держится выделение блока, к которому подвели. */
const FLASH_MS = 1400;

/** Просвет над блоком, к которому подвели: у самого края он читается хуже. */
const REVEAL_MARGIN = 12;

/**
 * Выделение блока, к которому подвели.
 *
 * Прокрутка сама по себе ответом не выглядит: список из похожих строк после
 * перескока выглядит точно так же, как до него, и какая из строк та самая —
 * непонятно.
 */
function flashSx(on: boolean) {
  return {
    borderRadius: 1,
    outline: on ? '2px solid' : '2px solid transparent',
    outlineColor: on ? 'primary.main' : 'transparent',
    transition: 'outline-color 400ms',
  };
}

/**
 * Подписка на прокрутку и изменение размеров: колбэки зовутся раз в кадр.
 *
 * Возвращает ещё и способ позвать их немедленно — он нужен тому, кто двигает
 * прокрутку сам: событие о ней придёт лишь к следующему кадру, и до тех пор на
 * новом месте не было бы нарисовано ничего.
 */
function useViewportTicker(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
): [(listener: () => void) => () => void, () => void] {
  const listeners = useRef(new Set<() => void>());

  useEffect(() => {
    const view = scroller.current;
    if (view === null) return;

    let frame = 0;
    const tick = () => {
      frame = 0;
      for (const listener of listeners.current) listener();
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(tick);
    };

    view.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    // Раскрытая карточка меняет высоту не мгновенно, а на протяжении всего
    // перехода, и всё, что ниже неё, едет без единого рендера. Без наблюдения
    // за размером содержимого о переезде узнали бы только на следующей
    // прокрутке — то есть увидели бы пустоту.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (observer !== null && content.current !== null) observer.observe(content.current);

    return () => {
      view.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scroller, content]);

  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const refresh = useCallback(() => {
    for (const listener of listeners.current) listener();
  }, []);

  return [subscribe, refresh];
}

interface RunProps {
  from: number;
  to: number;
  scroller: RefObject<HTMLElement | null>;
  subscribe: (listener: () => void) => () => void;
  /** Строка, в которой стоит курсор: её нельзя размонтировать. */
  held: number | null;
  /** Строка, к которой только что подвели: её нужно выделить. */
  flash: number | null;
  render: (index: number) => ReactNode;
}

/**
 * Серия свёрнутых блоков, идущих подряд.
 *
 * Строки расставлены по смещению внутри серии, а не потоком: тогда любую из
 * них можно нарисовать отдельно от соседей — например ту, в которой оставили
 * курсор, — не подпирая её распорками с двух сторон.
 */
function CollapsedRun({ from, to, scroller, subscribe, held, flash, render }: RunProps) {
  const count = to - from;
  const box = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<[number, number]>([0, count]);

  // Серия могла укоротиться прямо перед этим рендером — например когда набор
  // заменили примером. Замер вернёт границы на место, но он в слое раскладки,
  // а строки рисуются раньше: непоправленные, они спросили бы у модели блок,
  // которого в ней уже нет.
  const first = Math.min(range[0], count);
  const last = Math.min(range[1], count);

  const measure = useCallback(() => {
    const el = box.current;
    const view = scroller.current;
    if (el === null || view === null) return;

    const height = view.clientHeight;
    // Окно без высоты — это среда без раскладки, например тесты. Считать
    // видимость не по чему, и честнее показать всё, чем не показать ничего.
    if (height === 0) {
      setRange((prev) => (prev[0] === 0 && prev[1] === count ? prev : [0, count]));
      return;
    }

    const top = el.getBoundingClientRect().top - view.getBoundingClientRect().top;
    const next = visibleRange(top, height, COLLAPSED_STEP, count);
    setRange((prev) => (prev[0] === next[0] && prev[1] === next[1] ? prev : next));
  }, [count, scroller]);

  // После каждого рендера: содержимое выше могло изменить высоту и подвинуть
  // серию, а собственный рендер о чужом переезде ничего не знает.
  useLayoutEffect(measure);
  useEffect(() => subscribe(measure), [subscribe, measure]);

  // Номера внутри серии, а не в файле: серия сама знает, с какого блока
  // началась, и наружу это знание не выпускает.
  const rows: ReactNode[] = [];
  for (let offset = first; offset < last; offset++) rows.push(row(offset));

  const heldOffset = held === null ? null : held - from;
  if (heldOffset !== null && (heldOffset < first || heldOffset >= last)) {
    rows.push(row(heldOffset));
  }

  return (
    <Box ref={box} sx={{ position: 'relative', height: count * COLLAPSED_STEP }}>
      {rows}
    </Box>
  );

  function row(offset: number): ReactNode {
    const index = from + offset;
    return (
      <Box
        key={index}
        data-block={index}
        sx={{
          position: 'absolute',
          top: offset * COLLAPSED_STEP,
          left: 0,
          right: 0,
          // Обёртка ровно по карточке, просвет — пустота под ней: тогда
          // выделение обнимает карточку, а не полосу вместе с зазором.
          height: COLLAPSED_STEP - BLOCK_GAP,
          ...flashSx(flash === index),
        }}
      >
        {render(index)}
      </Box>
    );
  }
}

interface BlockListProps {
  count: number;
  /** Раскрыт ли блок: раскрытые всегда в потоке и всегда смонтированы. */
  isOpen: (index: number) => boolean;
  render: (index: number) => ReactNode;
  /** Приглушить список: документ не компилируется, правки бессмысленны. */
  dimmed: boolean;
  /** К какому блоку подвести; `null` — такого блока в списке нет. */
  revealIndex?: number | null;
  /**
   * Номер просьбы подвести к блоку.
   *
   * Прокрутку двигает именно смена номера, а не номер блока: правки текста
   * пересобирают список постоянно, и опирайся мы на номер блока — список
   * подскакивал бы к нему после каждого нажатия клавиши. Ноль — не просили.
   */
  revealSeq?: number;
}

export function BlockList({
  count,
  isOpen,
  render,
  dimmed,
  revealIndex = null,
  revealSeq = 0,
}: BlockListProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [subscribe, refresh] = useViewportTicker(scroller, content);

  /**
   * Строка, в которой стоит курсор.
   *
   * Размонтировать её нельзя: поля конструктора отдают правку по потере
   * фокуса, и строка, исчезнувшая из-под курсора, унесла бы набранное с собой.
   */
  const [held, setHeld] = useState<number | null>(null);

  const [flash, setFlash] = useState<number | null>(null);
  const target = useRef(revealIndex);
  target.current = revealIndex;

  useEffect(() => {
    const index = target.current;
    const view = scroller.current;
    if (revealSeq === 0 || index === null || view === null) return;

    // Блок к этому моменту уже раскрыт — значит смонтирован и его настоящее
    // положение можно спросить у DOM, не считая его самому.
    const el = view.querySelector<HTMLElement>(`[data-block="${index}"]`);
    if (el !== null) {
      const top = el.getBoundingClientRect().top - view.getBoundingClientRect().top;
      view.scrollTop += top - REVEAL_MARGIN;
      refresh();
    }

    setFlash(index);
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [revealSeq, refresh]);

  const segments = segmentsOf(count, isOpen);

  return (
    <Box
      ref={scroller}
      onFocus={(event) => setHeld(blockIndexOf(event.target))}
      onBlur={() => setHeld(null)}
      sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.5 }}
    >
      <Box
        ref={content}
        sx={{
          opacity: dimmed ? 0.45 : 1,
          pointerEvents: dimmed ? 'none' : 'auto',
          // Привязка прокрутки к содержимому спорит с появлением строк внутри
          // серии: браузер видит, что узел, за который он держался, пропал, и
          // подкручивает список сам.
          overflowAnchor: 'none',
        }}
      >
        {segments.map((segment) =>
          segment.open ? (
            <Box
              key={`open-${segment.index}`}
              data-block={segment.index}
              // Просвет отступом, а не паддингом: выделение не должно
              // прихватывать зазор под карточкой.
              sx={{ mb: `${BLOCK_GAP}px`, ...flashSx(flash === segment.index) }}
            >
              {render(segment.index)}
            </Box>
          ) : (
            <CollapsedRun
              key={`run-${segment.from}`}
              from={segment.from}
              to={segment.to}
              scroller={scroller}
              subscribe={subscribe}
              held={inSegment(held, segment.from, segment.to)}
              flash={inSegment(flash, segment.from, segment.to)}
              render={render}
            />
          ),
        )}
      </Box>
    </Box>
  );
}

/** Номер блока, если он в этой серии; иначе `null` — серии он не касается. */
function inSegment(index: number | null, from: number, to: number): number | null {
  return index !== null && index >= from && index < to ? index : null;
}

/** Номер блока, которому принадлежит узел; `null` — узел не в блоке. */
function blockIndexOf(node: HTMLElement): number | null {
  const host = node.closest<HTMLElement>('[data-block]');
  if (host === null) return null;
  const index = Number(host.dataset.block);
  return Number.isNaN(index) ? null : index;
}
