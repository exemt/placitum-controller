import type { ReactNode } from 'react';
import { useMemo } from 'react';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import { tokenize, type Token } from './syntax/modsecHighlight';
import './RuleEditor.css';
import './MiniEditorPane.css';

export type MiniEditorVariant = 'compact' | 'expanded';

interface MiniEditorHeadProps {
  fileName: string;
  lineLabel: string;
  leading?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
  openFileLabel?: string;
  onOpenFile?: () => void;
  openLinesLabel?: string;
  onOpenLines?: () => void;
}

interface MiniEditorPaneProps {
  text: string;
  startLine: number;
  fileName: string;
  variant?: MiniEditorVariant;
  ruleAction?: ReactNode;
  openFileLabel?: string;
  onOpenFile?: () => void;
  openLinesLabel?: string;
  onOpenLines?: () => void;
  expandLabel?: string;
  onExpand?: () => void;
  closeLabel?: string;
  onClose?: () => void;
  collapseLabel?: string;
  onCollapse?: () => void;
}

export function tokensByLine(tokens: readonly Token[]): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokens) {
    const parts = token.value.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([]);
      if (parts[i] !== '') {
        lines[lines.length - 1].push({ type: token.type, value: parts[i] });
      }
    }
  }
  return lines;
}

export function lineRangeLabel(startLine: number, endLine: number): string {
  return startLine === endLine ? String(startLine) : `${startLine}–${endLine}`;
}

function TokenSpans({ tokens }: { tokens: readonly Token[] }) {
  if (tokens.length === 0) return <>{'\u00a0'}</>;
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={`tok-${token.type}`}>
          {token.value}
        </span>
      ))}
    </>
  );
}

export function MiniEditorHead({
  fileName,
  lineLabel,
  leading,
  actions,
  onClick,
  openFileLabel,
  onOpenFile,
  openLinesLabel,
  onOpenLines,
}: MiniEditorHeadProps) {
  return (
    <div
      className={`mini-editor__head${onClick !== undefined ? ' mini-editor__head--clickable' : ''}`}
      onClick={onClick}
      onKeyDown={
        onClick === undefined
          ? undefined
          : (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
      }
      role={onClick !== undefined ? 'button' : undefined}
      tabIndex={onClick !== undefined ? 0 : undefined}
    >
      {leading !== undefined && (
        <div
          className="mini-editor__leading"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {leading}
        </div>
      )}
      <div className="mini-editor__where">
        {fileName !== '' &&
          (onOpenFile !== undefined && openFileLabel !== undefined ? (
            <button
              type="button"
              className="mini-editor__file mini-editor__link"
              aria-label={openFileLabel}
              onClick={(event) => {
                event.stopPropagation();
                onOpenFile();
              }}
            >
              {fileName}
            </button>
          ) : (
            <span className="mini-editor__file">{fileName}</span>
          ))}
        {lineLabel !== '' &&
          (onOpenLines !== undefined && openLinesLabel !== undefined ? (
            <button
              type="button"
              className="mini-editor__line mini-editor__link"
              aria-label={openLinesLabel}
              onClick={(event) => {
                event.stopPropagation();
                onOpenLines();
              }}
            >
              {lineLabel}
            </button>
          ) : (
            <span className="mini-editor__line">{lineLabel}</span>
          ))}
      </div>
      {actions !== undefined && (
        <div
          className="mini-editor__actions"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

export function MiniEditorPane({
  text,
  startLine,
  fileName,
  variant = 'compact',
  ruleAction,
  openFileLabel,
  onOpenFile,
  openLinesLabel,
  onOpenLines,
  expandLabel,
  onExpand,
  closeLabel,
  onClose,
  collapseLabel,
  onCollapse,
}: MiniEditorPaneProps) {
  const tokens = useMemo(() => tokenize(text), [text]);
  const rows = useMemo(() => tokensByLine(tokens), [tokens]);
  const lineLabel = lineRangeLabel(startLine, startLine + rows.length - 1);

  const leading =
    onCollapse !== undefined && collapseLabel !== undefined ? (
      <IconButton
        size="small"
        aria-label={collapseLabel}
        onClick={onCollapse}
        className="mini-editor__action"
      >
        <ExpandLessIcon fontSize="inherit" />
      </IconButton>
    ) : undefined;

  const actions = (
    <>
      {ruleAction}
      {variant === 'compact' && onExpand !== undefined && expandLabel !== undefined && (
        <IconButton
          size="small"
          aria-label={expandLabel}
          onClick={onExpand}
          className="mini-editor__action"
        >
          <OpenInFullIcon fontSize="inherit" />
        </IconButton>
      )}
      {onClose !== undefined && closeLabel !== undefined && (
        <IconButton
          size="small"
          aria-label={closeLabel}
          onClick={onClose}
          className="mini-editor__action"
        >
          <CloseIcon fontSize="inherit" />
        </IconButton>
      )}
    </>
  );

  return (
    <div className={`mini-editor mini-editor--${variant}`}>
      <MiniEditorHead
        fileName={fileName}
        lineLabel={lineLabel}
        leading={leading}
        actions={actions}
        openFileLabel={openFileLabel}
        onOpenFile={onOpenFile}
        openLinesLabel={openLinesLabel}
        onOpenLines={onOpenLines}
      />
      <div className="mini-editor__body">
        {variant === 'compact' ? (
          <div className="mini-editor__rows">
            {rows.map((lineTokens, index) => (
              <div key={index} className="mini-editor__row">
                <div className="mini-editor__lineno" aria-hidden="true">
                  {startLine + index}
                </div>
                <div className="mini-editor__code-line">
                  <TokenSpans tokens={lineTokens} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rule-editor">
            <div className="rule-editor__inner">
              <div className="rule-editor__gutter" aria-hidden="true">
                {rows.map((_, index) => (
                  <div key={index} className="rule-editor__lineno">
                    {startLine + index}
                  </div>
                ))}
              </div>
              <div className="rule-editor__code">
                <pre className="rule-editor__highlight">
                  <code>
                    <TokenSpans tokens={tokens} />
                  </code>
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
