import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

// Remembers a version the user chose to skip, so we don't nag them about it again.
const SKIP_KEY = 'pinnotes-skipped-update';

// Compare two semver strings. Returns >0 if a is newer than b, <0 if older, 0 if equal.
// Pre-release / build metadata is ignored — only the numeric core (x.y.z) is compared,
// which matches how the Tauri updater decides whether an update applies.
function compareVersions(a: string, b: string): number {
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

export function UpdateChecker() {
  const [status, setStatus] = useState<'idle' | 'available' | 'downloading' | 'done'>('idle');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Check for updates 3 seconds after mount
    const timer = setTimeout(async () => {
      try {
        const [update, current] = await Promise.all([check(), getVersion()]);

        // Only surface the popup when the endpoint advertises a version STRICTLY newer
        // than the running one (prevents "update available" after it's already installed).
        if (update && compareVersions(update.version, current) > 0) {
          // Don't nag about a version the user explicitly skipped.
          if (localStorage.getItem(SKIP_KEY) === update.version) return;
          setVersion(update.version);
          setStatus('available');
        }
      } catch (err) {
        console.warn('[Pin Notes] Update check failed:', err);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleUpdate = async () => {
    try {
      setStatus('downloading');
      const [update, current] = await Promise.all([check(), getVersion()]);
      if (!update || compareVersions(update.version, current) <= 0) {
        // Nothing newer to install after all — close the popup.
        setStatus('idle');
        return;
      }

      let totalBytes = 0;
      let downloadedBytes = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        } else if (event.event === 'Finished') {
          setStatus('done');
        }
      });

      // The NSIS installer has now replaced the old version in place.
      // Relaunch into the freshly installed build.
      await relaunch();
    } catch (err) {
      console.error('[Pin Notes] Update failed:', err);
      setStatus('idle');
    }
  };

  // Skip this version: remember it so it won't pop up again, and close the popup.
  const handleSkip = () => {
    if (version) localStorage.setItem(SKIP_KEY, version);
    setStatus('idle');
  };

  const isOpen = status !== 'idle';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="update-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          // Clicking the backdrop skips (only while the choice is still the user's).
          onClick={status === 'available' ? handleSkip : undefined}
        >
          <motion.div
            className="update-modal"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="update-modal-icon">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#4a7c59" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3.5-7.1" />
                <polyline points="21 3 21 8 16 8" />
              </svg>
            </div>

            {status === 'available' && (
              <>
                <h3 className="update-modal-title">Update available</h3>
                <p className="update-modal-message">
                  Version {version.replace(/^v/, '')} is ready — with the latest features and fixes.
                </p>
                <div className="update-modal-buttons">
                  <button className="update-modal-btn skip" onClick={handleSkip}>
                    Skip
                  </button>
                  <button className="update-modal-btn confirm" onClick={handleUpdate}>
                    Update now
                  </button>
                </div>
              </>
            )}

            {status === 'downloading' && (
              <>
                <h3 className="update-modal-title">Updating…</h3>
                <div className="update-progress-bar">
                  <div className="update-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <p className="update-modal-message">{progress}% — please keep the app open</p>
              </>
            )}

            {status === 'done' && (
              <>
                <h3 className="update-modal-title">Restarting…</h3>
                <p className="update-modal-message">Pin Notes is reopening on the new version.</p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
