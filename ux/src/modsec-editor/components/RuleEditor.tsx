import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Popper from '@mui/material/Popper';
import { useTheme } from '@mui/material/styles';
import { tokenize } from './syntax/modsecHighlight';
import { lookupKeyword, type KeywordDoc } from './syntax/modsecKeywords';
import KeywordTooltip from './KeywordTooltip';
import { useI18n } from '../i18n/useI18n';
import { useRule } from '../context/ruleContext';
import { useEditorView } from '../context/editorViewContext';
import type { DiagnosticSeverity } from '../modsec/diagnostics';
import './RuleEditor.css';

interface HoverState {
  anchor: HTMLElement;
  doc: KeywordDoc;
}

function useAltHeld(swallow: boolean): [boolean, (next: boolean) => void] {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const sync = (e: KeyboardEvent) => {
      if (swallow && e.key === 'Alt') e.preventDefault();
      setHeld(e.altKey);
    };
    const reset = () => setHeld(false);

    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('blur', reset);
    };
  }, [swallow]);

  const sync = useCallback(
    (next: boolean) => setHeld((prev) => (prev === next ? prev : next)),
    [],
  );

  return [held, sync];
}

function RuleEditor() {
  const { t } = useI18n();
  const theme = useTheme();
  const {
    source,
    setSource,
    formatSource,
    analysis,
    undo: undoEdit,
    redo: redoEdit,
  } = useRule();
  const { reveal } = useEditorView();
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rafRef = useRef<number | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const hasDetails = hover?.doc.details !== undefined;
  const [altHeld, syncAlt] = useAltHeld(hasDetails);
  const expanded = altHeld && hasDetails;

  const tokens = useMemo(() => tokenize(source), [source]);

  const lines = useMemo(() => source.split('\n'), [source]);

  const marks = useMemo(() => {
    const rank: Record<DiagnosticSeverity, number> = { advice: 0, warning: 1, error: 2 };
    const worst = new Map<number, DiagnosticSeverity>();
    for (const d of analysis.diagnostics) {
      if (d.line === undefined) continue;
      const seen = worst.get(d.line);
      if (seen === undefined || rank[d.severity] > rank[seen]) worst.set(d.line, d.severity);
    }
    return worst;
  }, [analysis.diagnostics]);

  useEffect(() => {
    if (reveal === null) return;
    const textarea = textareaRef.current;
    const row = gutterRef.current?.querySelector(`[data-line="${reveal.line}"]`);
    if (!textarea || !row) return;

    row.scrollIntoView({ block: 'center' });

    const start = lines
      .slice(0, reveal.line - 1)
      .reduce((sum, line) => sum + line.length + 1, 0);
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(start, start + (lines[reveal.line - 1]?.length ?? 0));
  }, [reveal, lines]);

  const hitTest = useCallback(
    (clientX: number, clientY: number) => {
      const layer = highlightRef.current;
      if (!layer) return;

      const spans = layer.querySelectorAll<HTMLSpanElement>('span[data-kw]');
      for (const span of Array.from(spans)) {
        const r = span.getBoundingClientRect();
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          const doc = lookupKeyword(span.textContent ?? '');
          if (doc) {
            setHover((prev) => (prev?.anchor === span ? prev : { anchor: span, doc }));
            return;
          }
        }
      }
      setHover((prev) => (prev ? null : prev));
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { clientX, clientY, altKey } = e;
      syncAlt(altKey);
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        hitTest(clientX, clientY);
      });
    },
    [hitTest, syncAlt],
  );

  const clearHover = useCallback(() => setHover(null), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyF') {
        e.preventDefault();
        formatSource();
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;

      const redo = e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey);
      if (redo) {
        e.preventDefault();
        redoEdit();
      } else if (e.code === 'KeyZ') {
        e.preventDefault();
        undoEdit();
      }
    },
    [formatSource, redoEdit, undoEdit],
  );

  return (
    <div className="rule-editor-shell">
      <div className="rule-editor">
        <div className="rule-editor__inner">
          <div className="rule-editor__gutter" ref={gutterRef} aria-hidden="true">
            {lines.map((_, index) => {
              const severity = marks.get(index + 1);
              return (
                <div
                  key={index}
                  data-line={index + 1}
                  className={
                    severity === undefined
                      ? 'rule-editor__lineno'
                      : `rule-editor__lineno rule-editor__lineno--${severity}`
                  }
                >
                  {index + 1}
                </div>
              );
            })}
          </div>
          <div
            className="rule-editor__code"
            onMouseMove={handleMouseMove}
            onMouseLeave={clearHover}
          >
            <pre className="rule-editor__highlight" ref={highlightRef} aria-hidden="true">
              <code>
                {tokens.map((token, i) => {
                  const hasDoc = lookupKeyword(token.value) !== null;
                  return (
                    <span
                      key={i}
                      className={`tok-${token.type}${hasDoc ? ' tok--doc' : ''}`}
                      data-kw={hasDoc ? '' : undefined}
                    >
                      {token.value}
                    </span>
                  );
                })}
              </code>
            </pre>
            <textarea
              ref={textareaRef}
              className="rule-editor__textarea"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onKeyDown={handleKeyDown}
              onScroll={(e) => {
                const { scrollTop, scrollLeft } = e.currentTarget;
                if (highlightRef.current) {
                  highlightRef.current.scrollTop = scrollTop;
                  highlightRef.current.scrollLeft = scrollLeft;
                }
                if (gutterRef.current) {
                  gutterRef.current.scrollTop = scrollTop;
                }
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              aria-label={t('editor.ariaLabel')}
            />
          </div>
        </div>
      </div>

      <Popper
        open={hover !== null}
        anchorEl={hover?.anchor ?? null}
        placement="top-start"
        modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
        style={{ pointerEvents: 'none', zIndex: theme.zIndex.tooltip }}
      >
        {hover && <KeywordTooltip doc={hover.doc} expanded={expanded} />}
      </Popper>
    </div>
  );
}

export default RuleEditor;
