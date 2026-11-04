import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { useI18n } from '../store/i18n';

// Remembers a version the user chose to skip, so we don't nag them about it again.
const SKIP_KEY = 'pinnotes-skipped-update';

// Compare two semver strings. Returns >0 if a is newer than b, <0 if older, 0 if equal.
// Pre-release / build metadata is ignored — only the numeric core (x.y.z) is compared,
// which matches how the Tauri updater decides whether an update applies.
export function compareVersions(a: string, b: string): number {
  const norm = (v: string) =>
    v.replace(/^v/, '').split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The "What's new" bullets from the release notes (the section under a "What's new"
 * heading in RELEASE_NOTES.md, see the release workflow). Markdown is stripped; at most
 * five items so the popup stays short.
 */
export function parseWhatsNew(body?: string | null): string[] {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s*what'?s new/i.test(l.trim()));
  if (start < 0) return [];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const t = line.trim();
    if (/^#{1,6}\s/.test(t)) break;
    const m = /^[-*]\s+(.*)$/.exec(t);
    if (m) items.push(m[1].replace(/\*\*|__|`/g, '').trim());
  }
  return items.filter(Boolean).slice(0, 5);
}

const mb = (bytes: number) => (bytes / 1048576).toFixed(1);

type Status = 'idle' | 'available' | 'downloading' | 'done' | 'failed';

export function UpdateChecker() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>('idle');
  const [update, setUpdate] = useState<Update | null>(null);
  const [current, setCurrent] = useState('');
  const [bytes, setBytes] = useState({ done: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    // Check a few seconds after the list opens, and never on top of another popup
    // (e.g. the "What's new" card shown right after an update).
    const run = async () => {
      if (cancelled) return;
      if (document.querySelector('.pn-overlay')) {
        setTimeout(run, 10000);
        return;
      }
      try {
        const [found, cur] = await Promise.all([check(), getVersion()]);
        // Only surface the popup when the endpoint advertises a version STRICTLY newer
        // than the running one (prevents "update available" after it's already installed).
        if (cancelled || !found || compareVersions(found.version, cur) <= 0) return;
        // Don't nag about a version the user explicitly skipped.
        if (localStorage.getItem(SKIP_KEY) === found.version) return;
        setUpdate(found);
        setCurrent(cur);
        setStatus('available');
      } catch (err) {
        console.warn('[Pin Notes] Update check failed:', err);
      }
    };
    const timer = setTimeout(run, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!update) return;
    setBytes({ done: 0, total: 0 });
    setStatus('downloading');
    try {
      let total = 0;
      let done = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
          setBytes({ done: 0, total });
        } else if (event.event === 'Progress') {
          done += event.data.chunkLength;
          setBytes({ done, total });
        } else if (event.event === 'Finished') {
          setStatus('done');
        }
      });
      // The installer has replaced the old version in place; reopen into the new one.
      await relaunch();
    } catch (err) {
      console.error('[Pin Notes] Update failed:', err);
      setStatus('failed');
    }
  }, [update]);

  // Not now: close, and ask again next time the app starts.
  const handleLater = () => setStatus('idle');

  // Skip this version: remember it so it won't pop up again.
  const handleSkip = () => {
    if (update) localStorage.setItem(SKIP_KEY, update.version);
    setStatus('idle');
  };

  const version = update?.version.replace(/^v/, '') ?? '';
  const notes = parseWhatsNew(update?.body);
  const percent = bytes.total > 0 ? Math.min(100, Math.round((bytes.done / bytes.total) * 100)) : 0;

  return (
    <AnimatePresence>
      {status !== 'idle' && (
        <motion.div
          className="pn-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          // Clicking the backdrop means "later" (only while the choice is still the user's).
          onClick={status === 'available' || status === 'failed' ? handleLater : undefined}
        >
          <motion.div
            className="pn-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pn-update-title"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pn-sheet-hero">
              <img src="/logo.png" alt="" className={status === 'downloading' ? 'pn-logo bob' : 'pn-logo'} />
            </div>

            {status === 'available' && (
              <>
                <h3 id="pn-update-title" className="pn-sheet-title">{t('update.title')}</h3>
                <div className="pn-versions" aria-label={`${current} → ${version}`}>
                  <span className="pn-ver old">{current}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                  <span className="pn-ver new">{version}</span>
                </div>
                {notes.length > 0 ? (
                  <div className="pn-notes">
                    <div className="pn-notes-label">{t('update.whatsNew')}</div>
                    <ul>
                      {notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="pn-sheet-text">{t('update.ready', { version })}</p>
                )}
                <button className="pn-btn primary" onClick={handleUpdate} autoFocus>
                  {t('update.now')}
                </button>
                <div className="pn-sheet-links">
                  <button className="pn-link" onClick={handleLater}>{t('update.later')}</button>
                  <span aria-hidden="true">·</span>
                  <button className="pn-link" onClick={handleSkip}>{t('update.skipVersion')}</button>
                </div>
              </>
            )}

            {status === 'downloading' && (
              <>
                <h3 id="pn-update-title" className="pn-sheet-title">{t('update.downloading')}</h3>
                <div className="pn-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`pn-progress-fill ${bytes.total ? '' : 'indeterminate'}`} style={bytes.total ? { width: `${percent}%` } : undefined} />
                </div>
                <div className="pn-progress-meta">
                  <span>{bytes.total ? `${percent}%` : ''}</span>
                  <span>{bytes.total ? t('update.downloadedOf', { done: mb(bytes.done), total: mb(bytes.total) }) : ''}</span>
                </div>
                <p className="pn-sheet-text small">{t('update.safe')}</p>
              </>
            )}

            {status === 'done' && (
              <>
                <h3 id="pn-update-title" className="pn-sheet-title">{t('update.restarting')}</h3>
                <p className="pn-sheet-text">{t('update.reopening')}</p>
              </>
            )}

            {status === 'failed' && (
              <>
                <h3 id="pn-update-title" className="pn-sheet-title">{t('update.failed')}</h3>
                <p className="pn-sheet-text">{t('update.failedHint')}</p>
                <button className="pn-btn primary" onClick={handleUpdate} autoFocus>
                  {t('update.retry')}
                </button>
                <div className="pn-sheet-links">
                  <button className="pn-link" onClick={handleLater}>{t('update.close')}</button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
