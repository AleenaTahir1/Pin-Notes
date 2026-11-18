import { motion } from 'framer-motion';
import { useI18n } from '../store/i18n';
import type { ExportFormat } from '../editor/exportNote';

interface MoreMenuProps {
  fontSize: number;
  onSave: (format: ExportFormat) => void;
  onSmaller: () => void;
  onLarger: () => void;
}

const FORMATS: { format: ExportFormat; ext: string; labelKey: 'more.md' | 'more.txt' | 'more.html'; hintKey: 'more.mdHint' | 'more.txtHint' | 'more.htmlHint' }[] = [
  { format: 'html', ext: '.html', labelKey: 'more.html', hintKey: 'more.htmlHint' },
  { format: 'md', ext: '.md', labelKey: 'more.md', hintKey: 'more.mdHint' },
  { format: 'txt', ext: '.txt', labelKey: 'more.txt', hintKey: 'more.txtHint' },
];

/** The ⋯ menu: Save as (web page, Markdown, plain text) and text size. */
export function MoreMenu({ fontSize, onSave, onSmaller, onLarger }: MoreMenuProps) {
  const { t } = useI18n();
  const mod = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';
  return (
    <motion.div
      className="more-menu"
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.12 }}
    >
      <div className="more-menu-label">{t('more.saveAs')}</div>
      {FORMATS.map(({ format, ext, labelKey, hintKey }) => (
        <button key={format} type="button" role="menuitem" className="more-menu-item" onClick={() => onSave(format)}>
          <span className="more-menu-ext">{ext}</span>
          <span className="more-menu-text">
            <span className="more-menu-title">{t(labelKey)}</span>
            <span className="more-menu-hint">{t(hintKey)}</span>
          </span>
        </button>
      ))}
      <div className="more-menu-divider" />
      <div className="more-menu-row">
        <span className="more-menu-row-label">{t('more.textSize')}</span>
        <button type="button" className="more-menu-size" onClick={onSmaller} title={`${t('note.smallerText')} (${mod}−)`}>
          <span className="font-size-label small">A</span>
        </button>
        <span className="more-menu-size-value">{fontSize}</span>
        <button type="button" className="more-menu-size" onClick={onLarger} title={`${t('note.largerText')} (${mod}+)`}>
          <span className="font-size-label large">A</span>
        </button>
      </div>
    </motion.div>
  );
}
