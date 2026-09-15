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

const SHOWN_SITES = 3;

const PERSISTENT = new Set(['ip', 'session', 'user', 'global', 'resource']);

interface BrowseTarget {
  collection: string;
  name: string;
}

const VariableBrowseContext = createContext<((target: BrowseTarget) => void) | null>(null);

interface VariableBrowseHostProps {
  children: ReactNode;
}

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
  count?: number;
}

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
      disableInteractive={false}
      slotProps={{
        popper: {
          onMouseDown: holdFocus,
        },
        tooltip: {
          sx: {
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
