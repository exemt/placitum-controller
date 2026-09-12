import { Fragment } from 'react';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type {
  KeywordDoc,
  KeywordTech,
  LocalizedText,
} from './syntax/modsecKeywords';
import { useI18n } from '../i18n/useI18n';
import { categoryKey, type TranslationKey } from '../i18n/translations';
import './KeywordTooltip.css';

/**
 * Подсказка по ключевому слову: одна строка описания по наведению и полная
 * справка, пока зажат Alt.
 *
 * Свёрнутая и развёрнутая версии — один и тот же попап, а не два разных:
 * заголовок остаётся на месте, чтобы при нажатии Alt подсказка не «прыгала»
 * из-под курсора.
 */

/** Порядок строк в блоке технических подробностей — от «что принимает» к «где работает». */
const TECH_ROWS: ReadonlyArray<[keyof KeywordTech, TranslationKey]> = [
  ['argument', 'tooltip.tech.argument'],
  ['fallback', 'tooltip.tech.fallback'],
  ['scope', 'tooltip.tech.scope'],
  ['cost', 'tooltip.tech.cost'],
  ['availability', 'tooltip.tech.availability'],
];

interface KeywordTooltipProps {
  doc: KeywordDoc;
  /** Alt зажат и у слова есть расширенная версия. */
  expanded: boolean;
}

function KeywordTooltip({ doc, expanded }: KeywordTooltipProps) {
  const { t, locale } = useI18n();
  const text = (value: LocalizedText) => value[locale] ?? value.en;

  const { details } = doc;
  const tech = details?.tech;
  const techRows = tech
    ? TECH_ROWS.filter(([field]) => tech[field] !== undefined)
    : [];

  return (
    <Paper
      elevation={6}
      className={`kw-tooltip${expanded ? ' kw-tooltip--expanded' : ''}`}
    >
      <div className="kw-tooltip__head">
        <code className="kw-tooltip__name">{doc.keyword}</code>
        <Chip
          size="small"
          label={t(categoryKey(doc.category))}
          className="kw-tooltip__chip"
        />
      </div>

      <Typography variant="body2" className="kw-tooltip__desc">
        {expanded && details ? text(details.summary) : text(doc.desc)}
      </Typography>

      {expanded && details && (
        <div className="kw-tooltip__details">
          {details.syntax && (
            <section className="kw-tooltip__section">
              <h4 className="kw-tooltip__title">{t('tooltip.syntax')}</h4>
              <pre className="kw-tooltip__code">{details.syntax}</pre>
            </section>
          )}

          {tech && techRows.length > 0 && (
            <section className="kw-tooltip__section">
              <h4 className="kw-tooltip__title">{t('tooltip.tech')}</h4>
              <dl className="kw-tooltip__tech">
                {techRows.map(([field, labelKey]) => (
                  <Fragment key={field}>
                    <dt>{t(labelKey)}</dt>
                    <dd>{text(tech[field] as LocalizedText)}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          )}

          {details.gotchas && details.gotchas.length > 0 && (
            <section className="kw-tooltip__section kw-tooltip__section--warn">
              <h4 className="kw-tooltip__title">{t('tooltip.gotchas')}</h4>
              <ul className="kw-tooltip__list">
                {details.gotchas.map((item) => (
                  <li key={item.en}>{text(item)}</li>
                ))}
              </ul>
            </section>
          )}

          {details.example && (
            <section className="kw-tooltip__section">
              <h4 className="kw-tooltip__title">{t('tooltip.example')}</h4>
              <pre className="kw-tooltip__code">{details.example.code}</pre>
              {details.example.caption && (
                <p className="kw-tooltip__caption">{text(details.example.caption)}</p>
              )}
            </section>
          )}

          {details.seeAlso && details.seeAlso.length > 0 && (
            <section className="kw-tooltip__section">
              <h4 className="kw-tooltip__title">{t('tooltip.seeAlso')}</h4>
              <p className="kw-tooltip__links">
                {details.seeAlso.map((name) => (
                  <code key={name} className="kw-tooltip__link">
                    {name}
                  </code>
                ))}
              </p>
            </section>
          )}
        </div>
      )}

      {details && (
        <div className="kw-tooltip__footer">
          {t(expanded ? 'tooltip.collapseHint' : 'tooltip.expandHint')}
        </div>
      )}
    </Paper>
  );
}

export default KeywordTooltip;
