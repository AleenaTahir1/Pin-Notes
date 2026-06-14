import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

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
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check for updates 3 seconds after mount
    const timer = setTimeout(async () => {
      try {
        const [update, current] = await Promise.all([check(), getVersion()]);

        // Only surface the banner when the endpoint advertises a version that is
        // STRICTLY newer than the version actually running. This prevents the
        // "update available" message from showing after the update is already
        // installed (e.g. when the endpoint still serves the same version, or the
        // updater reports an equal/older build).
        if (update && compareVersions(update.version, current) > 0) {
          setVersion(update.version);
          setStatus('available');
        } else {
          setStatus('idle');
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
        // Nothing newer to install after all — drop the banner.
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

  if (dismissed || status === 'idle') return null;

  return (
    <div className="update-banner">
      {status === 'available' && (
        <>
          <span className="update-text">v{version} available</span>
          <button className="update-btn" onClick={handleUpdate}>Update</button>
          <button className="update-dismiss" onClick={() => setDismissed(true)}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </>
      )}
      {status === 'downloading' && (
        <>
          <span className="update-text">Updating... {progress}%</span>
          <div className="update-progress-bar">
            <div className="update-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </>
      )}
      {status === 'done' && (
        <span className="update-text">Restarting...</span>
      )}
    </div>
  );
}
