import React, { useState, useEffect, useRef } from 'https://esm.sh/react';
import { WebContainerGitService } from './WebContainerGitService.js';

/**
 * CMSAdminDashboard
 * An example UI component that consumes the WebContainerGitService.
 */
export default function CMSAdminDashboard() {
  const [status, setStatus] = useState('Idle');
  const [serverUrl, setServerUrl] = useState('');
  const [isBooting, setIsBooting] = useState(false);
  const [repoUrl, setRepoUrl] = useState('https://github.com/username/my-astro-site');
  const [token, setToken] = useState('');
  
  const cmsRef = useRef(null);

  const handleBoot = async () => {
    if (!repoUrl || !token) {
      alert('Please provide Repo URL and GitHub Token.');
      return;
    }

    setIsBooting(true);
    cmsRef.current = new WebContainerGitService({
      repoUrl,
      token,
      onStatusChange: (msg) => setStatus(msg),
      onServerReady: (url) => setServerUrl(url)
    });

    try {
      await cmsRef.current.boot();
    } catch (err) {
      console.error('Booting sequence failed', err);
      setStatus(`Failed: ${err.message}`);
    } finally {
      setIsBooting(false);
    }
  };

  const handlePublish = async () => {
    if (!cmsRef.current) return;
    const msg = prompt('Commit Message:', 'Update content via Zero-Config CMS');
    if (msg) {
      await cmsRef.current.publishChanges(msg);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.brand}>Zero-Config CMS</div>
        <div style={styles.status}>Status: <strong>{status}</strong></div>
      </header>

      <main style={styles.main}>
        {!serverUrl ? (
          <div style={styles.setup}>
            <h2>Connect your repository</h2>
            <div style={styles.field}>
              <label>GitHub Repo URL</label>
              <input 
                type="text" 
                value={repoUrl} 
                onChange={(e) => setRepoUrl(e.target.value)} 
                style={styles.input} 
              />
            </div>
            <div style={styles.field}>
              <label>GitHub Personal Access Token</label>
              <input 
                type="password" 
                value={token} 
                onChange={(e) => setToken(e.target.value)} 
                style={styles.input} 
              />
              <small>Required for pushing changes back.</small>
            </div>
            <button 
              onClick={handleBoot} 
              disabled={isBooting} 
              style={isBooting ? styles.btnDisabled : styles.btn}
            >
              {isBooting ? 'Booting WASM Environment...' : 'Start CMS Environment'}
            </button>
          </div>
        ) : (
          <div style={styles.editor}>
            <div style={styles.toolbar}>
              <div style={styles.previewUrl}>{serverUrl}</div>
              <button onClick={handlePublish} style={styles.btnPublish}>Publish Changes</button>
            </div>
            <div style={styles.iframeContainer}>
              <iframe 
                src={serverUrl} 
                style={styles.iframe} 
                title="CMS Preview"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f5f5f7',
    color: '#1d1d1f'
  },
  header: {
    padding: '12px 24px',
    backgroundColor: '#fff',
    borderBottom: '1px solid #d2d2d7',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  brand: { fontSize: '18px', fontWeight: '600' },
  status: { fontSize: '12px', color: '#86868b' },
  main: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' },
  setup: {
    backgroundColor: '#fff',
    padding: '40px',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: '450px'
  },
  field: { marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px' },
  input: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #d2d2d7',
    fontSize: '14px'
  },
  btn: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#0071e3',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '10px'
  },
  btnDisabled: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#d2d2d7',
    color: '#86868b',
    border: 'none',
    borderRadius: '8px',
    cursor: 'not-allowed',
    marginTop: '10px'
  },
  editor: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column' },
  toolbar: {
    padding: '8px 16px',
    backgroundColor: '#fff',
    borderBottom: '1px solid #d2d2d7',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  previewUrl: { fontSize: '12px', color: '#0071e3', fontFamily: 'monospace' },
  btnPublish: {
    padding: '6px 12px',
    backgroundColor: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer'
  },
  iframeContainer: { flex: 1, backgroundColor: '#fff' },
  iframe: { width: '100%', height: '100%', border: 'none' }
};
