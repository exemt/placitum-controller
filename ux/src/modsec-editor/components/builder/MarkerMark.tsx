import { useState } from 'react';
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
import { lookupMarkerRefs } from '../../modsec/markers';
import type { MarkerRefSite } from '../../modsec/markers';
import { CHIP_HEIGHT } from '../../theme';
import '../RuleEditor.css';
import './MarkTip.css';

const SHOWN_SITES = 3;

interface MarkerMarkProps {
  label: string;
}

export function MarkerMark({ label }: MarkerMarkProps) {
  const { t } = useI18n();
  const { revealLine } = useEditorView();
  const { markerRefs, nameOf } = useWorkspace();
  const [listOpen, setListOpen] = useState(false);

  const refs = lookupMarkerRefs(markerRefs, label);
  const unnamed = label === '';
  const orphan = !unnamed && refs.length === 0;
  const ruleIds = uniqueRuleIds(refs);
  const truncated = refs.length > SHOWN_SITES;

  const openList = () => {
    if (ruleIds.length > 0) setListOpen(true);
  };

  const siteCard = (item: MarkerRefSite, index: number) => {
    const fileName = nameOf(item.file);
    const lineLabel = String(item.line);
    const tokens = tokenize(item.text);

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

  const tip = (
    <div className="mark-tip">
      <div className="mark-tip__name">{unnamed ? t('builder.unset') : label}</div>
      <div className="mark-tip__note">{t('builder.markerNote')}</div>

      {!unnamed && (
        <section className="mark-tip__section">
          <div className="mark-tip__head">
            <h4 className="mark-tip__title">{t('builder.markerReferencedBy')}</h4>
            {refs.length > 0 && (
              <span className="mark-tip__count">{refs.length}</span>
            )}
          </div>
          {refs.length === 0 ? (
            <div className="mark-tip__empty">{t('builder.markerNeverReferenced')}</div>
          ) : (
            <>
              <div className="mark-tip__sites">{refs.slice(0, SHOWN_SITES).map(siteCard)}</div>
              {truncated && (
                <button type="button" className="mark-tip__more" onClick={openList}>
                  <span className="mark-tip__more-count">
                    {t('builder.variableMore', { count: String(refs.length - SHOWN_SITES) })}
                  </span>
                  <span className="mark-tip__more-hint">{t('builder.variableBrowseHint')}</span>
                </button>
              )}
            </>
          )}
        </section>
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
          <div className="mark-tip__footer-hint">{t('builder.markerIconHint')}</div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Tooltip
        title={tip}
        placement="top-end"
        disableInteractive={false}
        slotProps={{
          tooltip: {
            sx: {
              bgcolor: 'transparent',
              p: 0,
              maxWidth: 'none',
            },
          },
        }}
      >
        <IconButton
          size="small"
          aria-label={t('builder.markerInfo')}
          color={orphan ? 'warning' : 'default'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openList}
          sx={{
            width: CHIP_HEIGHT,
            height: CHIP_HEIGHT,
            p: 0,
            borderRadius: 1,
            '& .MuiSvgIcon-root': { fontSize: 14 },
          }}
        >
          <InfoOutlinedIcon />
        </IconButton>
      </Tooltip>

      <RuleMatchesDialog
        open={listOpen}
        onClose={() => setListOpen(false)}
        ids={ruleIds}
        heading={label}
      />
    </>
  );
}

function uniqueRuleIds(sites: MarkerRefSite[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const site of sites) {
    if (site.id === '' || seen.has(site.id)) continue;
    seen.add(site.id);
    ids.push(site.id);
  }
  return ids;
}
