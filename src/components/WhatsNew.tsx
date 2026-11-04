import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import type { Note } from '../types';
import { useI18n, type MessageKey } from '../store/i18n';
import { compareVersions } from './UpdateChecker';

// The last version whose "What's new" the user has seen.
const SEEN_KEY = 'pinnotes-seen-version';
// Bullets for this release (store/i18n.ts). Update them with each release.
const ITEMS: MessageKey[] = ['whatsNew.1', 'whatsNew.2', 'whatsNew.3', 'whatsNew.4', 'whatsNew.5', 'whatsNew.6'];

function markSeen(version: string) {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    /* ignore */
  }
}

/**
 * Shown once after Pin Notes updates itself, so people see what changed. Brand-new
 * users don't get it (nothing is "new" to them): with no record of a previous version,
 * only someone who already has notes older than a few minutes counts as updating.
 */
export function WhatsNew() {
  const { t } = useI18n();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const current = await getVersion();
        let seen: string | null = null;
        try {
          seen = localStorage.getItem(SEEN_KEY);
        } catch {
          /* storage unavailable: treat as unseen */
        }
        if (seen && compareVersions(current, seen) <= 0) return;
        let show = !!seen;
        if (!seen) {
          const notes = await invoke<Note[]>('get_all_notes');
          // A fresh install's first note is only seconds old; an updated app has older ones.
          const tenMinutesAgo = Date.now() / 1000 - 10 * 60;
          show = notes.some((n) => n.created_at < tenMinutesAgo);
        }
        // Shown: remembered when closed (so it comes back if the app quits first).
        // Not shown (brand-new user): remember now.
        if (show) setVersion(current);
        else markSeen(current);
      } catch (err) {
        console.warn("[Pin Notes] What's new check failed:", err);
      }
    })();
  }, []);

  const close = () => {
    if (version) markSeen(version);
    setVersion(null);
  };

  return (
    <AnimatePresence>
      {version && (
        <motion.div
          className="pn-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={close}
        >
          <motion.div
            className="pn-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pn-whatsnew-title"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pn-sheet-hero">
              <img src="/logo.png" alt="" className="pn-logo" />
              <span className="pn-badge">{t('whatsNew.badge')}</span>
            </div>
            <h3 id="pn-whatsnew-title" className="pn-sheet-title">{t('whatsNew.title', { version })}</h3>
            <div className="pn-notes">
              <ul>
                {ITEMS.map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </div>
            <button className="pn-btn primary" onClick={close} autoFocus>
              {t('whatsNew.ok')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
