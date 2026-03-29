import React, { useState, useEffect, useRef } from 'https://esm.sh/react';
import { WebContainerGitService } from './WebContainerGitService.js';

/**
 * CMSAdminDashboard
 * An immersive "Ultimate Layout" UI component that consumes the WebContainerGitService.
 */
export default function CMSAdminDashboard() {
  const [status, setStatus] = useState('Idle');
  const [serverUrl, setServerUrl] = useState('');
  const [isBooting, setIsBooting] = useState(false);
  const [repoUrl, setRepoUrl] = useState('https://github.com/0cms-dev/nextjs-example');
  const [token, setToken] = useState('');
  
  const cmsRef = useRef(null);

  const handleBoot = async () => {
    if (!repoUrl || !token) {
      alert('Please provide Repo URL and GitHub Token.');
      return;
    }

    setIsBooting(true);
    setStatus('Initializing OS...');
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
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsBooting(false);
    }
  };

  const handlePublish = async () => {
    if (!cmsRef.current) return;
    const msg = prompt('Commit Message:', 'Update content via Zero-Config CMS');
    if (msg) {
      setStatus('Publishing...');
      try {
        await cmsRef.current.publishChanges(msg);
        setStatus('Published');
        setTimeout(() => setStatus('Idle'), 3000);
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      }
    }
  };

  // Keyboard shortcut for Command Palette placeholder
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        alert('Command Palette (Cmd+K) Placeholder:\nFuture context-aware search, component library, and settings drop-in here.');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        
        * {
          box-sizing: border-box;
        }
        
        body {
          margin: 0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background-color: #0b0f19; /* Deep premium dark */
          color: #f1f5f9;
          overflow: hidden; /* Prevent body scroll, let iframe scroll */
        }

        /* Setup Flow */
        .setup-container {
          height: 100vh;
          width: 100vw;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 50% 0%, #1a2333 0%, #0b0f19 70%);
        }
        
        .setup-card {
          width: 100%;
          max-width: 440px;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
          transform: translateY(0);
          animation: fadeSlideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .setup-card h2 {
          margin-top: 0;
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.02em;
          margin-bottom: 32px;
          color: #fff;
        }

        .input-group {
          margin-bottom: 24px;
        }

        .input-group label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #94a3b8;
          margin-bottom: 8px;
        }

        .input-group input {
          width: 100%;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 14px 16px;
          color: #fff;
          font-size: 15px;
          font-family: inherit;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-group input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        .input-group small {
          display: block;
          margin-top: 8px;
          font-size: 12px;
          color: #64748b;
        }

        .primary-button {
          width: 100%;
          background: #3b82f6;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 14px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .primary-button:hover:not(:disabled) {
          background: #2563eb;
        }

        .primary-button:active:not(:disabled) {
          transform: scale(0.98);
        }

        .primary-button:disabled {
          background: #1e293b;
          color: #64748b;
          cursor: not-allowed;
        }

        /* Editor Layout */
        .editor-container {
          height: 100vh;
          width: 100vw;
          position: relative;
          background: #fff; /* White bg behind iframe */
        }
        
        .preview-iframe {
          width: 100%;
          height: 100%;
          border: none;
          display: block;
        }

        /* Floating Dock */
        .floating-dock {
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 8px;
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 100px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0,0,0,0.5);
          z-index: 1000;
          animation: dockSlideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
          transform: translate(-50%, 40px);
        }

        .dock-item {
          display: flex;
          align-items: center;
          padding: 8px 16px;
          border-radius: 100px;
          background: transparent;
          color: #e2e8f0;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
          text-decoration: none;
        }

        .dock-item:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .dock-divider {
          width: 1px;
          height: 20px;
          background: rgba(255, 255, 255, 0.15);
          margin: 0 4px;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px 8px 16px;
          border-radius: 100px;
          font-size: 13px;
          font-weight: 500;
          color: #94a3b8;
          user-select: none;
          position: relative;
        }
        
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #10b981; /* Green for idle/ready */
          position: relative;
        }
        
        .status-dot.busy {
          background-color: #f59e0b; /* Yellow for busy */
        }
        
        .status-dot.busy::after {
          content: '';
          position: absolute;
          top: -4px;
          left: -4px;
          right: -4px;
          bottom: -4px;
          border-radius: 50%;
          border: 2px solid #f59e0b;
          animation: pulseRing 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }

        .publish-btn {
          background: #f8fafc;
          color: #0f172a;
          box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
          margin-left: 4px;
        }

        .publish-btn:hover {
          background: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(255, 255, 255, 0.2);
          color: #0f172a;
        }

        /* Animations */
        @keyframes fadeSlideIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes dockSlideUp {
          0% { opacity: 0; transform: translate(-50%, 40px); }
          100% { opacity: 1; transform: translate(-50%, 0); }
        }

        @keyframes pulseRing {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.4); opacity: 0; }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.2);
          border-radius: 50%;
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
        }
      `}</style>

      {!serverUrl ? (
        <div className="setup-container">
          <div className="setup-card">
            <h2>0CMS Environment</h2>
            
            <div className="input-group">
              <label>GitHub Repository URL</label>
              <input 
                type="text" 
                value={repoUrl} 
                onChange={(e) => setRepoUrl(e.target.value)} 
                placeholder="https://github.com/user/repo"
                spellCheck="false"
              />
            </div>
            
            <div className="input-group">
              <label>Personal Access Token</label>
              <input 
                type="password" 
                value={token} 
                onChange={(e) => setToken(e.target.value)} 
                placeholder="ghp_..."
              />
              <small>Never stored. Used securely in your browser to sync changes.</small>
            </div>
            
            <button 
              className="primary-button" 
              onClick={handleBoot} 
              disabled={isBooting || !repoUrl || !token}
            >
              {isBooting ? (
                <><div className="spinner"></div> {status}</>
              ) : (
                'Start Zero-Config Environment'
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="editor-container">
          <iframe 
            src={serverUrl} 
            className="preview-iframe" 
            title="CMS Preview"
          />
          
          <div className="floating-dock">
            <div className="status-indicator">
              <div className={`status-dot ${status !== 'Idle' ? 'busy' : ''}`}></div>
              <span style={{maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                {status}
              </span>
            </div>
            
            <div className="dock-divider"></div>
            
            <button 
              className="dock-item"
              onClick={() => window.open(serverUrl, '_blank')}
              title="Open preview in new tab"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              Preview
            </button>
            
            <button className="dock-item" title="Toggle Device View (Mockup)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}>
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="18" x2="12.01" y2="18"></line>
              </svg>
              Mobile
            </button>
            
            <button className="dock-item publish-btn" onClick={handlePublish}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Publish
            </button>
          </div>
        </div>
      )}
    </>
  );
}
