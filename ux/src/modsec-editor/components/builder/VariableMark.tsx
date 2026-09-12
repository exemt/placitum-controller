import {
  createContext,
  useCallback,
  useContext,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { RuleMatchesDialog } from '../RuleMatchesDialog';
import { RulePreview } from '../RulePreview';
import { tokenize } from '../syntax/modsecHighlight';
import { useEditorView } from '../../context/editorViewContext';
import { useWorkspace } from '../../context/workspaceContext';
import { useI18n } from '../../i18n/useI18n';
import { useLabel } from './useLabel';
import { usesByRuleId } from './VariableUseMarks';
import { lookupVariable, readBeforeSet } from '../../modsec/variables';
import { setvarCollectionMeta } from '../../modsec/semantics';
import type { VariableSite } from '../../modsec/variables';
import '../RuleEditor.css';
import './MarkTip.css';

/**
 * Сколько мест названо карточками, прежде чем остаток — числом.
 *
 * Карточка выше строки текста: шесть штук в каждой секции уже не читаются
 * без прокрутки. Три отвечают на вопрос «кто вообще», а «+N» и подвал
 * ведут в полное окно исходников — то же, что у исключений.
 */
const SHOWN_SITES = 3;

/** Коллекции, которым нужно хранилище: без него запись не переживёт запрос. */
const PERSISTENT = new Set(['ip', 'session', 'user', 'global', 'resource']);

interface BrowseTarget {
  collection: string;
  name: string;
}

/**
 * Кто открывает окно правил по переменной.
 *
 * Окно нельзя держать внутри пункта меню подстановки: клик по чипу или
 * по подсказке закрывает список Autocomplete, пункт размонтируется — и
 * диалог исчезает вместе с ним, так и не открывшись. Хост живёт снаружи
 * меню и переживает закрытие списка.
 */
const VariableBrowseContext = createContext<((target: BrowseTarget) => void) | null>(null);

interface VariableBrowseHostProps {
  children: ReactNode;
}

/** Держит одно окно правил для всех отметок переменных внутри. */
export function VariableBrowseHost({ children }: VariableBrowseHostProps) {
  const { variables } = useWorkspace();
  const [target, setTarget] = useState<BrowseTarget | null>(null);

  const open = useCallback((next: BrowseTarget) => setTarget(next), []);

  const entry =
    target === null ? null : lookupVariable(variables, target.collection, target.name);
  const sites = entry === null ? [] : [...entry.writes, ...entry.reads];
  const ruleIds = uniqueRuleIds(sites);
  const usesById = usesByRuleId(sites);
  const heading =
    target === null
      ? ''
      : target.name === ''
        ? target.collection
        : `${target.collection}.${target.name}`;

  return (
    <VariableBrowseContext.Provider value={open}>
      {children}
      <RuleMatchesDialog
        open={target !== null && ruleIds.length > 0}
        onClose={() => setTarget(null)}
        ids={ruleIds}
        heading={heading}
        usesById={usesById}
      />
    </VariableBrowseContext.Provider>
  );
}

interface VariableMarkProps {
  collection: string;
  name: string;
  /**
   * Число мест в наборе — тогда отметка это чип «N | i», как номер правила
   * с иконкой текста. Без числа — один значок `i` в обойме поля.
   */
  count?: number;
}

/**
 * Что набор знает о переменной: где её выставляют и где читают.
 *
 * Присваивание — вторая запись файла, чей смысл лежит не в ней самой.
 * `setvar:tx.block_flag=1` не говорит ни того, читает ли этот флаг кто-нибудь,
 * ни того, дойдёт ли дело до чтения: читающее правило может стоять в первой
 * фазе, а выставляющее — во второй, и тогда флаг не сработает ни разу. Оба
 * ответа лежат в других строках, а часто и в других файлах, — поэтому они
 * собраны здесь, у самого поля имени, а не в отдельной сводке.
 *
 * Отметка — значок в обойме поля или чип с числом в меню выбора. Наведение
 * даёт краткий список карточками; нажатие и «посмотреть все» открывают то
 * же окно исходников, что у исключений. Адрес в карточке — как шапка
 * мини-редактора: номер ведёт в конструктор, имя файла и строка — в
 * текстовую вкладку. Цветом же отметка отвечает на единственный вопрос,
 * ответ на который виден сразу и без раскрытия: читает ли эту переменную
 * хоть кто-нибудь.
 *
 * Окно исходников открывает {@link VariableBrowseHost}: отметка в меню
 * подстановки не должна быть его владельцем — список закрывается раньше,
 * чем диалог успевает показаться.
 */
export function VariableMark({ collection, name, count }: VariableMarkProps) {
  const { t } = useI18n();
  const label = useLabel();
  const { revealLine } = useEditorView();
  const { variables, nameOf } = useWorkspace();
  const browse = useContext(VariableBrowseContext);

  const entry = lookupVariable(variables, collection, name);
  const reads = entry?.reads ?? [];
  const writes = entry?.writes ?? [];
  const inits = variables.inits.get(collection.toLowerCase()) ?? [];

  // Пустое имя — это ещё не переменная, а незаполненное поле: у него нет ни
  // мест, ни коллекции, о которой стоило бы говорить.
  const unnamed = name === '';
  const unread = !unnamed && writes.length > 0 && reads.length === 0;
  const early = entry !== null && readBeforeSet(entry);
  const homeless = !unnamed && PERSISTENT.has(collection.toLowerCase()) && inits.length === 0;

  const sites = [...writes, ...reads];
  const ruleIds = uniqueRuleIds(sites);
  const variableName = unnamed ? collection : `${collection}.${name}`;
  const truncated = writes.length > SHOWN_SITES || reads.length > SHOWN_SITES;

  const openList = () => {
    if (ruleIds.length === 0 || browse === null) return;
    browse({ collection, name });
  };

  const siteCard = (item: VariableSite, index: number) => {
    const fileName = nameOf(item.file);
    const lineLabel = String(item.line);
    const tokens = tokenize(item.text);

    const openFile = () => revealLine(1, item.file);
    const openLine = () => revealLine(item.line, item.file);

    return (
      <div
        key={`${item.file}-${item.key}-${item.text}-${index}`}
        className="mark-tip__site"
      >
        {/* Слева адрес, справа номер: файл и строка — те же переходы, что у
            шапки мини-редактора; чип «Правило : id» ведёт в конструктор.
            Без вложенной подсказки: здесь исходник уже виден строкой ниже. */}
        <div className="mark-tip__where">
          <div className="mark-tip__addr">
            <button
              type="button"
              className="mark-tip__file mark-tip__link"
              aria-label={t('builder.rulePreviewOpenFile', { file: fileName })}
              title={fileName}
              onClick={openFile}
            >
              {fileName}
            </button>
            <button
              type="button"
              className="mark-tip__line mark-tip__link"
              aria-label={t('builder.rulePreviewOpenLines', { line: lineLabel })}
              onClick={openLine}
            >
              {lineLabel}
            </button>
          </div>
          <RulePreview
            id={item.id}
            file={item.file}
            ruleKey={item.key}
            preText={t('builder.rule')}
            preview={false}
          />
        </div>
        <code className="mark-tip__code" title={item.text}>
          {tokens.map((token, i) => (
            <span key={i} className={`tok-${token.type}`}>
              {token.value}
            </span>
          ))}
        </code>
      </div>
    );
  };

  const section = (heading: string, sites: VariableSite[], empty: string) => {
    const hidden = Math.max(0, sites.length - SHOWN_SITES);
    return (
      <section className="mark-tip__section">
        <div className="mark-tip__head">
          <h4 className="mark-tip__title">{heading}</h4>
          {sites.length > 0 && (
            <span className="mark-tip__count">{sites.length}</span>
          )}
        </div>
        {sites.length === 0 ? (
          <div className="mark-tip__empty">{empty}</div>
        ) : (
          <>
            <div className="mark-tip__sites">
              {sites.slice(0, SHOWN_SITES).map(siteCard)}
            </div>
            {/* Число — размер хвоста секции, не всей выборки: «+3» рядом с
                «выставляется» обещает три места, а не три правила в окне.
                Открывает то же окно, что значок и подвал. */}
            {hidden > 0 && (
              <button
                type="button"
                className="mark-tip__more"
                onClick={openList}
              >
                <span className="mark-tip__more-count">
                  {t('builder.variableMore', { count: String(hidden) })}
                </span>
                <span className="mark-tip__more-hint">
                  {t('builder.variableBrowseHint')}
                </span>
              </button>
            )}
          </>
        )}
      </section>
    );
  };

  // Не давать списку Autocomplete принять жест за выбор варианта: подсказка
  // порталится наружу списка, и без preventDefault поле теряет фокус, список
  // закрывается и — если отметка была в пункте — размонтируется.
  const holdFocus = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const tip = (
    <div className="mark-tip" onMouseDown={holdFocus} onClick={(event) => event.stopPropagation()}>
      <div className="mark-tip__name">{variableName}</div>
      <div className="mark-tip__note">
        {label(setvarCollectionMeta(collection.toLowerCase())?.note, '')}
      </div>

      {!unnamed && (
        <>
          {section(t('builder.variableSetIn'), writes, t('builder.variableNeverSet'))}
          {section(t('builder.variableReadIn'), reads, t('builder.variableNeverRead'))}
          {/* Порядок исполнения — не порядок файла: фаза идёт первой, и
              прочитанное до первой записи всегда пусто. */}
          {early && (
            <div className="mark-tip__warn">{t('builder.variableEarlyRead')}</div>
          )}
          {homeless && (
            <div className="mark-tip__warn">{t('builder.variableNoStorage')}</div>
          )}
        </>
      )}

      {!unnamed && ruleIds.length > 0 && (
        <div className="mark-tip__footer">
          {/* Число — размер всей выборки: иначе «+40» у секции обещало бы
              сорок правил в окне, а в окне лежали бы все. */}
          {(truncated || ruleIds.length > SHOWN_SITES) && (
            <Chip
              size="small"
              component="button"
              label={t('builder.rulePreviewViewAll', { count: String(ruleIds.length) })}
              onClick={openList}
            />
          )}
          <div className="mark-tip__footer-hint">{t('builder.variableIconHint')}</div>
        </div>
      )}
    </div>
  );

  // Не забирать фокус у поля и не выбирать пункт списка: иначе клик по
  // отметке в меню подстановки подставил бы это имя в поле, а значение
  // ещё и ушло бы наружу по blur.
  const stopField = {
    onMouseDown: holdFocus,
    onClick: (event: MouseEvent) => {
      event.stopPropagation();
      openList();
    },
  };

  const warn = unread || homeless;

  const trigger =
    count !== undefined && count > 0 ? (
      <Chip
        size="small"
        component="button"
        variant="outlined"
        color={warn ? 'warning' : 'default'}
        aria-label={t('builder.variableInfo')}
        {...stopField}
        label={
          <Box
            component="span"
            sx={{ display: 'inline-flex', alignItems: 'stretch', height: '100%' }}
          >
            <Box
              component="span"
              sx={{ display: 'inline-flex', alignItems: 'center', pr: 0.5 }}
            >
              {count}
            </Box>
            {/* Черта отделяет число от i; правый отступ чипа снят, чтобы
                значок стоял у края, как RawOn у номера правила. */}
            <Box
              component="span"
              aria-hidden
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                pl: 0.5,
                pr: '3px',
                // Тот же цвет, что обводка и цифра чипа — не нейтральный
                // divider: у warning-чипа черта иначе оставалась бы серой.
                borderLeft: '1px solid currentColor',
                // Круг InfoOutlined при `small` (20px) почти равен высоте
                // чипа — рядом с цифрой выглядит больше неё.
                '& .MuiSvgIcon-root': { fontSize: 14 },
              }}
            >
              <InfoOutlinedIcon />
            </Box>
          </Box>
        }
        sx={{
          flexShrink: 0,
          '& .MuiChip-label': { pr: 0 },
        }}
      />
    ) : (
      <IconButton
        size="small"
        aria-label={t('builder.variableInfo')}
        color={warn ? 'warning' : 'default'}
        {...stopField}
      >
        <InfoOutlinedIcon fontSize="small" />
      </IconButton>
    );

  return (
    <Tooltip
      title={tip}
      placement="right"
      // Подсказка интерактивная: в ней ссылки, прокрутка и кнопки.
      disableInteractive={false}
      slotProps={{
        popper: {
          // Иначе mousedown по порталу забирает фокус у поля — список
          // закрывается ещё до click по кнопке в подсказке.
          onMouseDown: holdFocus,
        },
        tooltip: {
          sx: {
            // Свой фон и поля у содержимого: умолчания MUI режут ширину
            // на 300px и красят попап в серый поверх нашей панели.
            bgcolor: 'transparent',
            p: 0,
            maxWidth: 'none',
          },
        },
      }}
    >
      {trigger}
    </Tooltip>
  );
}

/** Номера правил без пустых и без повторов, в порядке первого появления. */
function uniqueRuleIds(sites: VariableSite[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const site of sites) {
    if (site.id === '' || seen.has(site.id)) continue;
    seen.add(site.id);
    ids.push(site.id);
  }
  return ids;
}
