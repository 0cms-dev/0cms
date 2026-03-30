import { WebContainerGitService } from './WebContainerGitService.js';
import cms from './cms.js'; // The visual editor bridge

const ui = {
    dashboard: document.getElementById('cmsDashboard'),
    landingProject: document.getElementById('cmsLandingProject'),
    landingRepoName: document.getElementById('landingRepoName'),
    btnToggle: document.getElementById('toggleCmsBtn'),
    btnPublish: document.getElementById('publishSync'),
    btnClose: document.getElementById('btnCloseCms'),
    statusText: document.querySelector('.admin-bar span strong'),
    counter: document.getElementById('cmsCounter'),
    preview: document.getElementById('cmsPreviewFrame'),
    statusLabel: document.getElementById('cmsStatusLabel'),
    statusDot: document.getElementById('cmsStatusDot'),
    repoDisplay: document.getElementById('cmsActiveRepo'),
    stepLogin: document.getElementById('cmsStepLogin'),
    stepPicker: document.getElementById('cmsStepPicker'),
    repoList: document.getElementById('cmsRepoList'),
    repoLoader: document.getElementById('cmsRepoLoader'),
    loginBtn: document.getElementById('cmsLoginBtn'),
    saveBtn: document.getElementById('cmsSaveBtn'),
    backToLoginBtn: document.getElementById('cmsBackToLogin'),
    navHistory: document.getElementById('navHistory'),
    navNewPage: document.getElementById('navNewPage'),
    navSEO: document.getElementById('navSEO'),
    historyDrawer: document.getElementById('cmsHistoryDrawer'),
    pageSettingsPanel: document.getElementById('cmsPageSettingsPanel'),
    seoTitle: document.getElementById('seoTitle'),
    seoDesc: document.getElementById('seoDesc'),
    seoImage: document.getElementById('seoImage'),
    seoSaveBtn: document.getElementById('seoSaveBtn'),

    createPanel: document.getElementById('cmsCreatePanel'),
    createLoader: document.getElementById('cmsCreateLoader'),
    createList: document.getElementById('cmsCreateList'),

    previewLoader: document.getElementById('previewLoader'),
    navBack: document.getElementById('navBack'),
    navForward: document.getElementById('navForward'),
    landingAuthAction: document.getElementById('heroAuthAction'),
    landingLoginBtn: document.getElementById('landingLoginBtn'),
    landingRepoSection: document.getElementById('landingRepoSection'),
    landingRepoList: document.getElementById('landingRepoList'),
    btnToggleLanding: document.getElementById('toggleCmsBtnLanding'),
    historyList: document.getElementById('cmsHistoryList'),
    historyCount: document.getElementById('cmsHistoryCount'),
    loaderStatus: document.getElementById('cmsLoaderStatus'),
    viewDesktop: document.getElementById('viewDesktop'),
    viewTablet: document.getElementById('viewTablet'),
    viewMobile: document.getElementById('viewMobile'),
};

let settings = JSON.parse(localStorage.getItem('zcms-settings') || '{}');

// --- AUTHENTICATION FLOW ---
// Extract token from URL if returning from GitHub OAuth
const urlParams = new URLSearchParams(window.location.search);
const tokenFromUrl = urlParams.get('token');
const installIdFromUrl = urlParams.get('installation_id');

if (tokenFromUrl) {
    settings.token = tokenFromUrl;
    if (installIdFromUrl) settings.installation_id = installIdFromUrl;
    localStorage.setItem('zcms-settings', JSON.stringify(settings));
    // Clean up the URL for a premium zero-config look
    window.history.replaceState({}, document.title, window.location.pathname);
    // fetchRepos() will be called by refreshLandingUI() below
}

let cmsActive = false;
let cmsService = null;
let preWarmPromise = null;
let changes = {};
let entries = [];

// 0. UI REFRESH: Project Awareness
function refreshLandingUI() {
    if (settings.token) {
        // User is connected! UI should reflect this "forever"
        ui.landingLoginBtn.classList.add('hidden');
        ui.landingRepoSection.classList.remove('hidden');
        
        if (settings.repo) {
            ui.landingProject.classList.remove('hidden');
            ui.landingRepoName.textContent = settings.repo;
            // Pre-fetch all repos to populate the list too
            fetchRepos();
        } else {
            ui.landingProject.classList.add('hidden');
            fetchRepos(); // Just show global list
        }
    } else {
        // Fresh start - show connect action
        ui.landingLoginBtn.classList.remove('hidden');
        ui.landingProject.classList.add('hidden');
        ui.landingRepoSection.classList.add('hidden');
    }
}

// Unconditionally refresh UI state on load to ensure persistence
refreshLandingUI();

// Auto-reopen dashboard if it was open before.
// We reuse the pre-warming service to avoid a double boot.
if (localStorage.getItem('zcms-dashboard-open') === 'true' && settings.repo && settings.token) {
    // Wait a tick so the pre-warm has registered, then click
    setTimeout(() => ui.btnToggle.click(), 100);
}

// 1. QUANTUM PRE-WARM: Start engine immediately if we have a repo
const preWarmingService = new WebContainerGitService();
if (settings.repo && settings.token) {
    preWarmingService.repoUrl = `https://github.com/${settings.repo}`;
    preWarmingService.token = settings.token;
    preWarmPromise = preWarmingService.initWebContainer()
        .then(() => preWarmingService.boot(localStorage.getItem('zcms-manual-command')))
        .catch(e => console.error('Pre-warm failed:', e));
} else {
    preWarmPromise = preWarmingService.initWebContainer();
}

// 2. DASHBOARD UI CONTROLS
ui.btnToggle.onclick = () => {
    ui.dashboard.style.display = 'flex';
    localStorage.setItem('zcms-dashboard-open', 'true');
    if (settings.repo && settings.token) {
        ui.stepLogin.classList.add('hidden');
        ui.stepPicker.classList.add('hidden');
        startCmsEngine(settings.repo, settings.token);
    } else if (settings.token) {
        ui.stepLogin.classList.add('hidden');
        ui.stepPicker.classList.remove('hidden');
        fetchRepos();
    }
};

ui.btnToggleLanding.onclick = () => ui.btnToggle.click();

ui.btnClose.onclick = () => {
    const hasChanges = Object.keys(changes).length > 0;
    if (hasChanges && !confirm('You have unsaved changes. Are you sure you want to exit and discard them?')) {
        return;
    }

    ui.dashboard.classList.add('closing');
    localStorage.removeItem('zcms-dashboard-open');
    setTimeout(() => {
        ui.dashboard.style.display = 'none';
        ui.dashboard.classList.remove('closing');
    }, 400);
};

ui.loginBtn.onclick = () => window.location.href = '/github/login';
ui.landingLoginBtn.onclick = () => window.location.href = '/github/login';

ui.backToLoginBtn.onclick = () => {
    ui.stepPicker.classList.add('hidden');
    ui.stepLogin.classList.remove('hidden');
};

ui.navNewPage.onclick = async () => {
    const isVisible = ui.createPanel.style.display === 'flex';
    if (isVisible) {
        ui.createPanel.style.display = 'none';
        ui.navNewPage.classList.remove('active');
        return;
    }
    ui.pageSettingsPanel.style.display = 'none';
    ui.navSEO.classList.remove('active');
    
    ui.createPanel.style.display = 'flex';
    ui.navNewPage.classList.add('active');
    ui.createLoader.style.display = 'block';
    ui.createList.innerHTML = '';
    
    if (cmsService) {
        const collections = await cmsService.scanCollections();
        ui.createLoader.style.display = 'none';
        
        if (collections.length === 0) {
            ui.createList.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">No templates found.</div>';
            return;
        }
        
        collections.forEach(col => {
            const btn = document.createElement('button');
            btn.className = 'btn-cms';
            btn.style.width = '100%';
            btn.style.justifyContent = 'flex-start';
            btn.style.padding = '8px 12px';
            // capitalize name
            const name = col.name.charAt(0).toUpperCase() + col.name.slice(1);
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><path d="M12 5v14m-7-7h14"/></svg> New ${name}`;
            btn.onclick = async () => {
                const title = prompt(`Enter title for new ${name}:`);
                if (!title) return;
                ui.createPanel.style.display = 'none';
                showToast(`Creating ${title}...`, 'info');
                try {
                    const newPath = await cmsService.createNewItem(col.path, title, col.templateFile);
                    showToast(`Created successfully!`, 'success');
                    setTimeout(() => {
                        let urlPath = newPath.replace('/src/pages', '').replace('/src/content', '').replace('/content', '').replace('/source', '').replace('.md', '').replace('.mdx', '').replace('.html', '').replace('.njk', '').replace('/index', '');
                        if (urlPath === '' || urlPath.startsWith('//')) urlPath = '/';
                        ui.preview.src = cmsService.serverUrl + urlPath;
                    }, 1800);
                } catch (err) {
                    showToast('Error creating item', 'error');
                }
            };
            ui.createList.appendChild(btn);
        });
    }
};

ui.pageSettingsPanel = document.getElementById('cmsPageSettingsPanel');

ui.navSEO.onclick = () => {
    const isVisible = ui.pageSettingsPanel.style.display === 'flex';
    if (isVisible) {
        ui.pageSettingsPanel.style.display = 'none';
        ui.navSEO.classList.remove('active');
    } else {
        ui.pageSettingsPanel.style.display = 'flex';
        ui.navSEO.classList.add('active');
        ui.createPanel.style.display = 'none';
        ui.navNewPage.classList.remove('active');
        ui.preview.contentWindow.postMessage({ type: 'CMS_GET_SEO' }, '*');
    }
};

const syncSEO = () => {
     ui.preview.contentWindow.postMessage({
        type: 'CMS_SET_SEO',
        title: ui.seoTitle.value,
        description: ui.seoDesc.value,
        image: ui.seoImage.value
    }, '*');
};

ui.seoTitle.oninput = syncSEO;
ui.seoDesc.oninput = syncSEO;
ui.seoImage.oninput = syncSEO;

// Window Event Listener for generic postMessages from iframe
window.addEventListener('message', (e) => {
    if (e.data.type === 'CMS_SEO_DATA') {
        ui.seoTitle.value = e.data.title || '';
        ui.seoDesc.value = e.data.description || '';
        ui.seoImage.value = e.data.image || '';
    }
    // Existing ones are handled in cms.js globally, but we intercept SEO here
    if (e.data.type === 'CMS_READY') {
        showToast('Visual Editor Ready', 'success');
        ui.previewLoader.classList.add('hidden');
        ui.statusDot.className = 'status-dot';
    }
});


// Responsive Preview Viewport Controls
const updateViewport = (view) => {
    ui.viewDesktop.classList.remove('active');
    ui.viewTablet.classList.remove('active');
    ui.viewMobile.classList.remove('active');
    
    ui.preview.className = '';
    
    if (view === 'desktop') {
        ui.viewDesktop.classList.add('active');
    } else if (view === 'tablet') {
        ui.viewTablet.classList.add('active');
        ui.preview.classList.add('view-tablet');
    } else if (view === 'mobile') {
        ui.viewMobile.classList.add('active');
        ui.preview.classList.add('view-mobile');
    }
};

ui.viewDesktop.onclick = () => updateViewport('desktop');
ui.viewTablet.onclick = () => updateViewport('tablet');
ui.viewMobile.onclick = () => updateViewport('mobile');

// CMS Initialization Logic
async function startCmsEngine(repo, token) {
    ui.repoDisplay.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:relative;top:2px;margin-right:4px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${repo}`;
    cmsService = preWarmingService;
    
    cmsService.onLog = (msg) => {
        console.log(`%c[WebContainer] %c${msg}`, 'color:#a78bfa; font-weight:bold;', 'color:inherit;');
        if (msg.toLowerCase().includes('error')) console.error(`[WebContainer Error] ${msg}`);
    };

    cmsService.onStatusChange = (msg) => {
        if (ui.loaderStatus) ui.loaderStatus.textContent = msg;
        showToast(msg, 'info');
        console.log(`%c[Status] %c${msg}`, 'color:#34d399; font-weight:bold;', 'color:inherit;');
    };

    cmsService.onServerReady = (url) => {
        ui.preview.src = url;
        ui.statusLabel.textContent = 'Website Ready';
        ui.statusDot.className = 'status-dot';
        showToast('Editor ready!', 'success');
        
        // Auto-enable Zen Editor on load
        ui.preview.onload = () => {
            ui.preview.contentWindow.postMessage({ 
                type: 'CMS_CONFIG', 
                proxyUrl: `${window.location.origin}/proxy?url=`
            }, '*');
            ui.preview.contentWindow.postMessage({ type: 'CMS_TOGGLE', enabled: true }, '*');
        };

        // Check for collections and show + New button if found
        cmsService.scanCollections().then(cols => {
            if (cols.length > 0) ui.navNewPage.style.display = 'flex';
        });
    };

    // If already pre-warmed, ensure UI shows the URL immediately
    if (cmsService.serverUrl) {
        ui.preview.src = cmsService.serverUrl;
        ui.statusLabel.textContent = cmsService.serverUrl;
        ui.statusDot.className = 'status-dot';
        
        cmsService.scanCollections().then(cols => {
            if (cols.length > 0) ui.navNewPage.style.display = 'flex';
        });
        return;
    }

    // Await background pre-warm if active
    if (preWarmPromise) {
        showToast('Synchronizing engine...', 'info');
        await preWarmPromise;
    }
    
    // If the pre-warm didn't have a repo yet, we need to boot now
    if (!cmsService.serverUrl && !cmsService.isBooting) {
        cmsService.repoUrl = `https://github.com/${repo}`;
        cmsService.token = token;
        
        // Start a watchdog timer to help users if it hangs
        const bootWatchdog = setTimeout(() => {
            if (!cmsService.serverUrl) {
                ui.loaderStatus.textContent = "Booting is taking longer than expected... Try refreshing if it hangs.";
                showToast("Initialization slow. Please wait or reload.", "info");
            }
        }, 25000);

        try {
            await cmsService.boot(cmsService.repoUrl, localStorage.getItem('zcms-manual-command'));
        } finally {
            clearTimeout(bootWatchdog);
        }
    } else if (cmsService.serverUrl) {
        ui.preview.src = cmsService.serverUrl;
        ui.siteUrl.textContent = 'Live Preview Active';
    }
}

async function fetchRepos() {
    ui.repoLoader.classList.remove('hidden');
    ui.repoList.innerHTML = '';
    ui.landingRepoList.innerHTML = '';
    try {
        let apiUrl = '/github/api/user/repos?sort=updated&per_page=100&visibility=all';
        if (settings.installation_id) {
            apiUrl = `/github/api/user/installations/${settings.installation_id}/repositories`;
        }

        const res = await fetch(apiUrl, {
            headers: { 
                Authorization: `token ${settings.token}`,
                Accept: 'application/vnd.github.v3+json'
            }
        });
        let data = await res.json();
        let repos = Array.isArray(data) ? data : (data.repositories || []);
        
        if (!Array.isArray(repos)) {
            const errorMsg = data.message || 'Failed to fetch repositories. Please check your GitHub connection.';
            showToast(errorMsg, 'error');
            if (res.status === 401) {
                setTimeout(() => {
                   settings.token = null;
                   localStorage.setItem('zcms-settings', JSON.stringify(settings));
                   ui.stepPicker.classList.add('hidden');
                   ui.stepLogin.classList.remove('hidden');
                }, 2000);
            }
            return;
        }

        if (repos.length === 0) {
            ui.repoList.innerHTML = `
                <div style="padding:20px; text-align:center; color:var(--text-muted)">
                    No repositories found.<br>
                    <a href="https://github.com/apps/0cms-dev/installations/new" style="color:var(--primary); text-decoration:none; margin-top:10px; display:inline-block;">Link repositories →</a>
                </div>`;
            return;
        }

        // If we have repositories, make sure the landing section is visible
        ui.landingRepoSection.classList.remove('hidden');

        // Auto-select if only one repo and we just came from an install
        if (repos.length === 1 && settings.installation_id) {
            // Just save the repo, don't open the dashboard
            settings.repo = repos[0].full_name;
            settings.installation_id = null;
            localStorage.setItem('zcms-settings', JSON.stringify(settings));
            ui.stepPicker.classList.add('hidden');
            ui.landingProject.classList.remove('hidden');
            ui.landingRepoName.textContent = settings.repo;
            // Don't return - still populate the repo list below
        }

        // If no active repo is set, auto-select the most recently updated one
        if (!settings.repo && repos.length > 0) {
            settings.repo = repos[0].full_name;
            localStorage.setItem('zcms-settings', JSON.stringify(settings));
            ui.stepPicker.classList.add('hidden');
            ui.landingProject.classList.remove('hidden');
            ui.landingRepoName.textContent = settings.repo;
            // Don't start the engine automatically - wait for user to click "Open Dashboard"
        }

        repos.forEach(repo => {
            // Update Dashboard list...
            const item = document.createElement('div');
            item.className = 'repo-item';
            item.onclick = () => selectRepo(repo.full_name);
            item.innerHTML = `<div><div style="font-weight:600">${repo.full_name}</div></div><div>→</div>`;
            ui.repoList.appendChild(item);

            // Skip the active repo in the "all projects" list to avoid duplication
            if (repo.full_name === settings.repo) return;

            // Update Landing list...
            const card = document.createElement('div');
            card.className = 'project-card';
            card.onclick = () => selectRepo(repo.full_name);
            card.innerHTML = `
                <div class="project-icon" style="width:32px; height:32px; background:var(--bg-tertiary); color:var(--primary); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:0.9rem;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9h18M9 21V9"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                </div>
                <div style="flex:1">
                    <div class="project-name">${repo.name}</div>
                    <div class="project-meta">Updated ${new Date(repo.updated_at).toLocaleDateString()}</div>
                </div>
            `;
            ui.landingRepoList.appendChild(card);
        });
    } catch (e) { 
        showToast(e.message, 'error'); 
    } finally { 
        ui.repoLoader.classList.add('hidden'); 
    }
}

function selectRepo(name) {
    const hasChanges = Object.keys(changes).length > 0;
    if (hasChanges && !confirm('You have unsaved changes in your current project. Switching repositories will discard them. Proceed?')) {
        return;
    }

    settings.repo = name;
    localStorage.setItem('zcms-settings', JSON.stringify(settings));
    ui.stepPicker.classList.add('hidden');
    refreshLandingUI();
    // Start the engine
    startCmsEngine(name, settings.token);
    // Explicitly open the dashboard UI
    if (ui.dashboard.style.display !== 'flex') {
        ui.btnToggle.click();
    }
}

function showToast(msg, type) {
    if (!ui.toast) return;
    ui.toast.textContent = msg;
    ui.toast.className = `toast ${type} show`;
    setTimeout(() => ui.toast.classList.remove('show'), 3000);
}

// Visual Editor Sync
// Zen Editor: Automatically active

window.onmessage = (e) => {
    if (e.data.type === 'CMS_READY') {
        if (ui.previewLoader) {
            ui.previewLoader.style.opacity = '0';
            setTimeout(() => ui.previewLoader.style.display = 'none', 500);
        }
        ui.statusDot.className = 'status-dot on';
        ui.statusLabel.textContent = '0 Unsaved Changes';
        ui.statusLabel.style.color = 'var(--text-muted)';
    }

    if (e.data.type === 'CMS_CHANGED') {
        changes = e.data.changes;
        let entries = e.data.entries || [];  // local scoped
        const count = Object.keys(changes).length;
        ui.saveBtn.style.display = count > 0 ? 'inline-flex' : 'none';
        
        // Update dynamic status
        ui.statusLabel.textContent = `${count} ${count === 1 ? 'Change' : 'Changes'} Unsaved`;
        ui.statusLabel.style.color = count > 0 ? 'var(--primary)' : 'var(--text-muted)';

        ui.counter.textContent = `${count} ${count === 1 ? 'Change' : 'Changes'} saved`;
        ui.counter.style.display = 'inline';

        // REAL-TIME SYNC: Apply the last change to the WebContainer FS
        if (entries.length > 0 && cmsService) {
            const lastEntry = entries[entries.length - 1];
            if (lastEntry.original && lastEntry.updated && lastEntry.original !== lastEntry.updated) {
                 // Non-blocking sync to avoid freezing the UI
                 cmsService.applySmartMatchChange(
                    lastEntry.original, 
                    lastEntry.updated, 
                    lastEntry.sourceFile || null
                 ).then(ok => {
                     if (ok) console.log(`[CMS] Autosynced: ${lastEntry.selector}`);
                 }).catch(err => {
                     console.error('[CMS] Autosync failed:', err);
                 });
            }
        }
        
        // Toggle Undo/Redo button states
        if (e.data.canUndo) ui.navBack.classList.remove('disabled');
        else ui.navBack.classList.add('disabled');
        
        if (e.data.canRedo) ui.navForward.classList.remove('disabled');
        else ui.navForward.classList.add('disabled');
        
        if (ui.historyCount) ui.historyCount.textContent = count;
        
        // Update history list
        if (ui.historyList) {
            if (count === 0) {
                ui.historyList.innerHTML = '<div style="text-align:center; padding-top:40px; color:var(--text-muted); font-size:0.8rem;">No changes yet.</div>';
            } else {
                ui.historyList.innerHTML = entries.map(entry => {
                    const oldVal = (entry.original || '').trim();
                    const newVal = (entry.updated || '').trim();
                    const displayOld = oldVal.length > 50 ? oldVal.substring(0, 50) + '...' : oldVal;
                    const displayNew = newVal.length > 50 ? newVal.substring(0, 50) + '...' : newVal;

                    return `
                    <div class="history-item" onclick="highlightElement('${entry.selector}')">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <span class="history-item-label" style="font-size:0.75rem; opacity:0.6; display:flex; align-items:center; gap:4px;">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                ${entry.time}
                            </span>
                            <button class="btn-undo" onclick="event.stopPropagation(); undoChange('${entry.selector}')">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 10h10a8 8 0 018 8v2M3 10l6-6M3 10l6 6"/></svg>
                                Revert
                            </button>
                        </div>
                        <div class="history-item-diff">
                            <div class="diff-old">${displayOld || 'None'}</div>
                            <div style="font-size:0.6rem; opacity:0.5; margin: -2px 0;">CHANGES TO ➜</div>
                            <div class="diff-new">${displayNew || 'Empty'}</div>
                        </div>
                    </div>
                `}).join('');
            }
        }
    }

};

window.undoChange = (selector) => {
    ui.preview.contentWindow.postMessage({ type: 'CMS_REVERT', selector }, '*');
};

window.highlightElement = (selector) => {
    ui.preview.contentWindow.postMessage({ type: 'CMS_HIGHLIGHT', selector }, '*');
};

window.toggleHistory = (force) => {
    const isOpen = typeof force === 'boolean' ? force : !ui.historyDrawer.classList.contains('open');
    const main = document.querySelector('.dashboard-main');
    
    if (isOpen) {
        ui.historyDrawer.classList.add('open');
        main.classList.add('drawer-left-open');
        ui.pageSettingsPanel.style.display = 'none';
    } else {
        ui.historyDrawer.classList.remove('open');
        main.classList.remove('drawer-left-open');
    }
};

// Clicking the status chip in the Pill opens the Unsaved Changes Drawer
const urlChip = document.querySelector('.url-chip');
if (urlChip) {
    urlChip.style.cursor = 'pointer';
    urlChip.title = 'View Unsaved Changes';
    urlChip.onclick = () => window.toggleHistory();
}

ui.navBack.onclick = () => {
    ui.preview.contentWindow.postMessage({ type: 'CMS_UNDO' }, '*');
};
ui.navForward.onclick = () => {
    ui.preview.contentWindow.postMessage({ type: 'CMS_REDO' }, '*');
};

// Initial state
ui.navBack.classList.add('disabled');
ui.navForward.classList.add('disabled');


ui.saveBtn.onclick = async () => {
     if (!cmsService) return;
     ui.saveBtn.disabled = true;
     const oldHTML = ui.saveBtn.innerHTML;
     ui.saveBtn.innerHTML = 'Publishing...';
     try {
        // STEP 1: Sync & Commit & Push (Source is updated in real-time now)
        showToast('Syncing to GitHub...', 'info');
        const result = await cmsService.publishChanges(`Visual update: ${new Date().toLocaleString()}`);

        if (result && result.message === 'No changes') {
            showToast('No changes detected since last publish.', 'info');
        } else {
            // STEP 2: Clear local draft in the editor
            ui.preview.contentWindow.postMessage({ type: 'CMS_PURGE' }, '*');
            
            // Reset parents own variables for instant UI update
            changes = {};
            // entries = []; // handled by CMS_PURGE if needed
            ui.saveBtn.style.display = 'none';
            ui.statusLabel.textContent = '0 Unsaved Changes';
            ui.statusLabel.style.color = 'var(--text-muted)';
            ui.counter.textContent = 'Changes published';
            
            showToast('Changes published successfully!', 'success');
        }
     } catch (e) { 
         console.error('[CMS] Publish failed:', e);
         alert(`Publish failed: ${e.message}`); // Use alert for prominence on error
         showToast(`Publish failed: ${e.message}`, 'error'); 
     } finally {
         ui.saveBtn.disabled = false;
         ui.saveBtn.innerHTML = oldHTML;
     }
};

window.addEventListener('beforeunload', (e) => {
    if (Object.keys(changes).length > 0) {
        e.preventDefault();
        e.returnValue = '';
    }
});
