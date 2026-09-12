import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import type { ChipProps } from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { RuleMatchesDialog } from '../RuleMatchesDialog';
import { RulePreview } from '../RulePreview';
import { tokenize } from '../syntax/modsecHighlight';
import { useBuilderView } from '../../context/builderViewContext';
import { useEditorView } from '../../context/editorViewContext';
import { useWorkspace } from '../../context/workspaceContext';
import { useI18n } from '../../i18n/useI18n';
import { lookupTag } from '../../modsec/tags';
import type { TagExclusionSite, TagRuleSite } from '../../modsec/tags';
import '../RuleEditor.css';
import './MarkTip.css';

/**
 * Что отметка дописывает чипу, который ей дали обернуть.
 *
 * У `ReactElement` из React 19 свойства неизвестны (`unknown`), и читать
 * `children.props.color` без уточнения нельзя. Уточняется только то, что
 * отметка трогает: цвет и два обработчика.
 */
interface TagChipProps {
  color?: ChipProps['color'];
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onMouseDown?: (event: MouseEvent<HTMLDivElement>) => void;
  'aria-label'?: string;
}

/**
 * Сколько мест названо карточками, прежде чем остаток — числом.
 *
 * `OWASP_CRS` носят сотни правил CRS: три отвечают на вопрос «кто вообще»,
 * а «+N» и подвал ведут в полное окно исходников.
 */
const SHOWN_SITES = 3;

/**
 * Кто открывает окно правил по тегу.
 *
 * Окно нельзя держать внутри пункта меню подстановки: клик по чипу или
 * по подсказке закрывает список Autocomplete, пункт размонтируется — и
 * диалог исчезает вместе с ним. Хост живёт снаружи меню.
 */
const TagBrowseContext = createContext<((tag: string) => void) | null>(null);

interface TagBrowseHostProps {
  children: ReactNode;
}

/** Держит одно окно правил для всех отметок тегов внутри. */
export function TagBrowseHost({ children }: TagBrowseHostProps) {
  const { tags } = useWorkspace();
  const [tag, setTag] = useState<string | null>(null);

  const open = useCallback((next: string) => setTag(next), []);

  const entry = tag === null ? null : lookupTag(tags, tag);
  const ruleIds = uniqueRuleIds(entry?.rules ?? []);

  return (
    <TagBrowseContext.Provider value={open}>
      {children}
      <RuleMatchesDialog
        open={tag !== null && ruleIds.length > 0}
        onClose={() => setTag(null)}
        ids={ruleIds}
        heading={tag ?? ''}
      />
    </TagBrowseContext.Provider>
  );
}

interface TagMarkProps {
  tag: string;
  /**
   * Чип значения в поле — подсказка висит на нём.
   *
   * В меню выбора вместо чипа значения рисуется отметка «N | i» по
   * {@link count}; тогда `children` не нужен.
   */
  children?: ReactElement;
  /** Число правил с этим тегом — чип «N | i» в меню выбора. */
  count?: number;
}

/**
 * Что набор знает о теге: у кого он стоит и кто снимает правила по нему.
 *
 * Тег — вторая запись правила, чей смысл лежит не в нём самом.
 * `tag:'attack-sqli'` не говорит ни того, сколько правил носят тот же
 * ярлык, ни того, снимает ли их `SecRuleRemoveByTag`. Оба ответа — в других
 * строках, часто в файле-надстройке, — поэтому они собраны здесь, на самом
 * чипе или в меню выбора, а не в отдельной сводке.
 *
 * Цветом отметка говорит одно: тег стоит только здесь и никто по нему не
 * выбирает правила. Это не ошибка конфигурации — правило загрузится, —
 * просто ярлык ни с кем не связан.
 *
 * Окно исходников открывает {@link TagBrowseHost}: отметка в меню
 * подстановки не должна быть его владельцем.
 */
export function TagMark({ tag, children, count }: TagMarkProps) {
  const { t } = useI18n();
  const { revealRule } = useBuilderView();
  const { revealLine } = useEditorView();
  const { tags, nameOf } = useWorkspace();
  const browse = useContext(TagBrowseContext);

  const entry = lookupTag(tags, tag);
  const rules = entry?.rules ?? [];
  const exclusions = entry?.exclusions ?? [];
  const unnamed = tag === '';
  const lonely = !unnamed && rules.length <= 1 && exclusions.length === 0;
  const ruleIds = uniqueRuleIds(rules);
  const truncatedRules = rules.length > SHOWN_SITES;
  const truncatedExclusions = exclusions.length > SHOWN_SITES;

  const openList = () => {
    if (ruleIds.length === 0) return;
    if (browse !== null) browse(tag);
  };

  const ruleCard = (item: TagRuleSite, index: number) => {
    const fileName = nameOf(item.file);
    const lineLabel = String(item.line);
    const tokens = tokenize(item.text);

    return (
      <div key={`${item.file}-${item.key}-${index}`} className="mark-tip__site">
        <div className="mark-tip__where">
          <div className="mark-tip__addr">
            <button
              type="button"
              className="mark-tip__file mark-tip__link"
              aria-label={t('builder.rulePreviewOpenFile', { file: fileName })}
              title={fileName}
              onClick={() => revealLine(1, item.file)}
            >
              {fileName}
            </button>
            <button
              type="button"
              className="mark-tip__line mark-tip__link"
              aria-label={t('builder.rulePreviewOpenLines', { line: lineLabel })}
              onClick={() => revealLine(item.line, item.file)}
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

  const exclusionCard = (item: TagExclusionSite, index: number) => {
    const fileName = nameOf(item.file);
    const lineLabel = String(item.line);
    const tokens = tokenize(item.text);

    return (
      <div key={`${item.file}-${item.key}-${item.text}-${index}`} className="mark-tip__site">
        <div className="mark-tip__where">
          <div className="mark-tip__addr">
            <button
              type="button"
              className="mark-tip__file mark-tip__link"
              aria-label={t('builder.rulePreviewOpenFile', { file: fileName })}
              title={fileName}
              onClick={() => revealLine(1, item.file)}
            >
              {fileName}
            </button>
            <button
              type="button"
              className="mark-tip__line mark-tip__link"
              aria-label={t('builder.rulePreviewOpenLines', { line: lineLabel })}
              onClick={() => revealLine(item.line, item.file)}
            >
              {lineLabel}
            </button>
          </div>
          {item.id !== '' ? (
            <RulePreview
              id={item.id}
              file={item.file}
              ruleKey={item.key}
              preText={t('builder.rule')}
              preview={false}
            />
          ) : (
            <Chip
              size="small"
              component="button"
              label={item.name}
              onClick={() => {
                if (item.key !== '') revealRule(item.key, item.file);
                else revealLine(item.line, item.file);
              }}
            />
          )}
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

  const holdFocus = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const tip = (
    <div className="mark-tip" onMouseDown={holdFocus} onClick={(event) => event.stopPropagation()}>
      <div className="mark-tip__name">{unnamed ? t('builder.unset') : tag}</div>
      <div className="mark-tip__note">{t('builder.tagNote')}</div>

      {!unnamed && (
        <>
          <section className="mark-tip__section">
            <div className="mark-tip__head">
              <h4 className="mark-tip__title">{t('builder.tagUsedBy')}</h4>
              {rules.length > 0 && <span className="mark-tip__count">{rules.length}</span>}
            </div>
            {rules.length === 0 ? (
              <div className="mark-tip__empty">{t('builder.tagNeverUsed')}</div>
            ) : (
              <>
                <div className="mark-tip__sites">{rules.slice(0, SHOWN_SITES).map(ruleCard)}</div>
                {truncatedRules && (
                  <button type="button" className="mark-tip__more" onClick={openList}>
                    <span className="mark-tip__more-count">
                      {t('builder.variableMore', { count: String(rules.length - SHOWN_SITES) })}
                    </span>
                    <span className="mark-tip__more-hint">{t('builder.variableBrowseHint')}</span>
                  </button>
                )}
              </>
            )}
          </section>

          <section className="mark-tip__section">
            <div className="mark-tip__head">
              <h4 className="mark-tip__title">{t('builder.tagExcludedBy')}</h4>
              {exclusions.length > 0 && (
                <span className="mark-tip__count">{exclusions.length}</span>
              )}
            </div>
            {exclusions.length === 0 ? (
              <div className="mark-tip__empty">{t('builder.tagNeverExcluded')}</div>
            ) : (
              <>
                <div className="mark-tip__sites">
                  {exclusions.slice(0, SHOWN_SITES).map(exclusionCard)}
                </div>
                {truncatedExclusions && (
                  <div className="mark-tip__more-hint" style={{ marginTop: 4 }}>
                    {t('builder.variableMore', {
                      count: String(exclusions.length - SHOWN_SITES),
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}

      {!unnamed && ruleIds.length > 0 && (
        <div className="mark-tip__footer">
          {(truncatedRules || ruleIds.length > SHOWN_SITES) && (
            <Chip
              size="small"
              component="button"
              label={t('builder.rulePreviewViewAll', { count: String(ruleIds.length) })}
              onClick={openList}
            />
          )}
          <div className="mark-tip__footer-hint">{t('builder.tagIconHint')}</div>
        </div>
      )}
    </div>
  );

  const stopField = {
    onMouseDown: holdFocus,
    onClick: (event: MouseEvent) => {
      event.stopPropagation();
      openList();
    },
  };

  const trigger =
    count !== undefined && count > 0 ? (
      <Chip
        size="small"
        component="button"
        variant="outlined"
        color={lonely ? 'warning' : 'default'}
        aria-label={t('builder.tagInfo')}
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
            <Box
              component="span"
              aria-hidden
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                pl: 0.5,
                pr: '3px',
                borderLeft: '1px solid currentColor',
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
    ) : children !== undefined ? (
      cloneElement(children as ReactElement<TagChipProps>, {
        color: lonely ? 'warning' : (children.props as TagChipProps).color,
        onClick: (event: MouseEvent<HTMLDivElement>) => {
          (children.props as TagChipProps).onClick?.(event);
          openList();
        },
        onMouseDown: (event: MouseEvent<HTMLDivElement>) => {
          (children.props as TagChipProps).onMouseDown?.(event);
          holdFocus(event);
        },
        'aria-label': t('builder.tagInfo'),
      })
    ) : (
      // Известный тег, которого в наборе ещё нет: числа нет, остаётся i.
      <IconButton
        size="small"
        aria-label={t('builder.tagInfo')}
        color={lonely ? 'warning' : 'default'}
        {...stopField}
      >
        <InfoOutlinedIcon fontSize="small" />
      </IconButton>
    );

  return (
    <Tooltip
      title={tip}
      placement="right"
      disableInteractive={false}
      slotProps={{
        popper: {
          onMouseDown: holdFocus,
        },
        tooltip: {
          sx: { bgcolor: 'transparent', p: 0, maxWidth: 'none' },
        },
      }}
    >
      {trigger}
    </Tooltip>
  );
}

function uniqueRuleIds(sites: TagRuleSite[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const site of sites) {
    if (site.id === '' || seen.has(site.id)) continue;
    seen.add(site.id);
    ids.push(site.id);
  }
  return ids;
}
