import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export function UpdateChecker() {
  const [status, setStatus] = useState<'idle' | 'available' | 'downloading' | 'done'>('idle');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check for updates 3 seconds after mount
    const timer = setTimeout(async () => {
      try {
        const update = await check();
        if (update) {
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
      const update = await check();
      if (!update) return;

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

      // Relaunch the app after install
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
