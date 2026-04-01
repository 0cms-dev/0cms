import { WebContainerGitService } from './WebContainerGitService.js';
import { WasmBridge } from './lib/runtime/WasmBridge.js';
import { IframeSyncService } from './lib/services/IframeSyncService.js';
import cms from './cms.js'; // The visual editor bridge

// Robust detection to ensure we don't suppress the UI in LocalCorp/Proxy environments
const isHostApp = window.self === window.top || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// --- RUNTIME: Register Service Worker for WASM Previews ---
if ('serviceWorker' in navigator && isHostApp) {
    navigator.serviceWorker.register('/runtime-sw.js', { scope: '/' })
        .then(reg => console.log('[0CMS] Runtime Service Worker registered:', reg.scope))
        .catch(err => console.warn('[0CMS] Runtime SW registration failed:', err));
}

// --- IFRAME GUARD: Fix Flickering & Prevent Recursive Init ---
if (!isHostApp) {
    console.log('[0CMS] Running in preview mode (iframe). Dashboard UI suppressed.');
}

const ui = isHostApp ? {
    dashboard: document.getElementById('cmsDashboard'),
    landingProject: document.getElementById('cmsLandingProject'),
    landingRepoName: document.getElementById('landingRepoName'),
    landingAuthAction: document.getElementById('heroAuthAction'),
    landingLoginBtn: document.getElementById('landingLoginBtn'),
    btnClose: document.getElementById('btnCloseCms'),
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
    landingRepoSection: document.getElementById('landingRepoSection'),
    landingRepoList: document.getElementById('landingRepoList'),
    btnToggleLanding: document.getElementById('toggleCmsBtnLanding'),
    historyList: document.getElementById('cmsHistoryList'),
    historyCount: document.getElementById('cmsHistoryCount'),
    loaderStatus: document.getElementById('cmsLoaderStatus'),
    viewDesktop: document.getElementById('viewDesktop'),
    viewTablet: document.getElementById('viewTablet'),
    viewMobile: document.getElementById('viewMobile'),
    
    // NEW DOCK ELEMENTS
    modeToggle: document.getElementById('cmsModeToggle'),
    modeLabel: document.getElementById('cmsModeLabel'),
    modeIcon: document.getElementById('cmsModeIcon'),
    // removed historyBtnCount (redundant)
    
    // NEW REPO PICKER CONTROLS
    accountSwitcherBtn: document.getElementById('accountSwitcherBtn'),
    selectedAccountAvatar: document.getElementById('selectedAccountAvatar'),
    selectedAccountName: document.getElementById('selectedAccountName'),
    accountDropdown: document.getElementById('accountDropdown'),
    repoSearchInput: document.getElementById('repoSearchInput'),
    ghAppSettingsLink: document.getElementById('ghAppSettingsLink'),
    navDemoBtn: document.getElementById('landingDemoBtn'),
    prewarmLoader: document.getElementById('prewarmLoader'),
    toast: document.getElementById('cmsToast'),
    
    // EXTRACTION UI
    btnExtractMode: document.getElementById('btnExtractMode'),
    extractPanel: document.getElementById('cmsExtractPanel'),
    extractNameInput: document.getElementById('extractComponentName'),
    btnConfirmExtract: document.getElementById('btnConfirmExtract')
} : {};


if (isHostApp) {


// Helper to safely bind events without crashing if element is missing
const safeBind = (el, event, handler) => {
    if (el) el[event] = handler;
};

let settings = JSON.parse(localStorage.getItem('zcms-settings') || '{}');

// --- AUTHENTICATION FLOW ---
// Extraction from URL is handled in <head> for zero-flicker experience.
// We just need to ensure our local 'settings' object matches localStorage.


let cmsActive = false;
let cmsService = null;
let preWarmPromise = null;
let changes = {};
let entries = [];
let currentRepos = [];
let installations = [];
let selectedInstallationId = null;
let currentInstallationToken = null;
const urlParams = new URLSearchParams(window.location.search);
let isDemoMode = urlParams.get('demo') === 'true';

function getActiveToken() {
    if (currentInstallationToken) return currentInstallationToken;
    try {
        const d = JSON.parse(localStorage.getItem('zcms-inst'));
        if (d && d.token && d.expires > Date.now()) return d.token;
    } catch (e) {}
    return settings.token;
}

// --- EVENT LISTENERS (CRITICAL FIRST) ---
safeBind(ui.accountSwitcherBtn, 'onclick', (e) => {
    e.stopPropagation();
    if (!ui.accountDropdown) return;
    const isOpen = ui.accountDropdown.classList.contains('open');
    ui.accountDropdown.classList.toggle('open', !isOpen);
    ui.accountSwitcherBtn.classList.toggle('active', !isOpen);
});

safeBind(ui.repoSearchInput, 'oninput', (e) => renderRepos(e.target.value));

document.addEventListener('click', (e) => {
    if (ui.accountDropdown && ui.accountSwitcherBtn && !ui.accountSwitcherBtn.contains(e.target)) {
        ui.accountDropdown.classList.remove('open');
        ui.accountSwitcherBtn.classList.remove('active');
    }
});

// Unconditionally refresh UI state on load to ensure persistence
if (isHostApp) {
    refreshLandingUI();
}


// 1. QUANTUM PRE-WARM: Start engine immediately if we have a repo (UNLESS in Demo Mode)
// - [x] Implement `MarkerService.js` (Zero-Width Encoding/Decoding)
// - [x] Create `TaggerTrait.js` (WebContainer Instrumentation logic)
// - [x] Integrate `TaggerTrait` into `WebContainerGitService.js` (Pre-build hook)
// - [x] Update `cms.js` (Bridge detection and source mapping)
// - [x] Handle Source Mapping in `app.js`
// - [ ] Implement `cleanup` logic (Remove markers before save/publish)
// - [ ] Verification with Astro/Hexo sample
let preWarmingService = null;
if (settings.repo && settings.token && !isDemoMode) {
    preWarmingService = new WebContainerGitService();
    preWarmingService.repoUrl = `https://github.com/${settings.repo}`;
    preWarmingService.token = getActiveToken();
    preWarmPromise = preWarmingService.initWebContainer()
        .then(() => preWarmingService.boot(preWarmingService.repoUrl, localStorage.getItem('zcms-manual-command')))
        .catch(e => console.error('Pre-warm failed:', e));
}


// 2. DASHBOARD UI CONTROLS
// If we started via ?demo=true, boot the demo engine immediately once the UI is ready
if (isDemoMode && isHostApp) {
    document.addEventListener('DOMContentLoaded', () => {
         window.startDemoMode();
    });
}

// --- COMPONENT EXTRACTION LOGIC ---
let isExtractMode = false;

window.toggleExtractMode = (enabled) => {
    isExtractMode = enabled !== undefined ? enabled : !isExtractMode;
    ui.btnExtractMode?.classList.toggle('active', isExtractMode);
    ui.extractPanel.style.display = isExtractMode ? 'flex' : 'none';
    
    // Notify the bridge
    ui.preview?.contentWindow.postMessage({ 
        type: 'CMS_EXTRACT_MODE', 
        enabled: isExtractMode 
    }, '*');
    
    if (isExtractMode) showToast('Click any element to select for extraction', 'info');
};

safeBind(ui.btnExtractMode, 'onclick', () => window.toggleExtractMode());

safeBind(ui.btnConfirmExtract, 'onclick', () => {
    const name = ui.extractNameInput.value.trim();
    if (!name) return showToast('Please enter a component name', 'error');
    
    ui.preview?.contentWindow.postMessage({ 
        type: 'CMS_EXTRACT_TRIGGER', 
        name: name 
    }, '*');
});

// Listener for extracted data from bridge
window.addEventListener('message', async (e) => {
    if (e.data.type === 'CMS_COMPONENT_DATA') {
        const { name, html, css } = e.data;
        if (!cmsService || !cmsService.activeDriver) {
            return showToast('Engine not ready', 'error');
        }
        
        try {
            const files = cmsService.activeDriver.templating.prepareComponentFiles(name, html, css);
            for (const [path, content] of Object.entries(files)) {
                await cmsService.updateFile(path, content);
            }
            showToast(`Component "${name}" extracted successfully!`, 'success');
            window.toggleExtractMode(false);
            ui.extractNameInput.value = '';
        } catch (err) {
            console.error('[Extraction] Failed to write files:', err);
            showToast('Failed to save component', 'error');
        }
    }

    // DETERMINISTIC SOURCE MAPPING HANDLER
    if (e.data.type === 'CMS_SOURCE_LOCATED') {
        const { fileId, line, selector } = e.data;
        try {
            const mapRaw = await cmsService.webcontainerInstance.fs.readFile('/zcms-source-map.json', 'utf8');
            const sourceMap = JSON.parse(mapRaw);
            const path = sourceMap[fileId];
            
            if (path) {
                console.log(`[Source Trace] Map found: ${path} (Line ${line})`);
                // Update UI Indicator (Optional: Open file in some future editor view)
                if (window.ui.sourceIndicator) {
                    window.ui.sourceIndicator.innerHTML = `<span>Origin:</span> ${path.split('/').pop()} : ${line}`;
                    window.ui.sourceIndicator.title = path;
                    window.ui.sourceIndicator.classList.add('active');
                }
            }
        } catch (err) {
            console.warn('[Source Trace] Failed to resolve source:', err);
        }
    }
});

window.openDashboard = async () => {
    if (!ui.dashboard) return;
    
    // If engine is still pre-warming, show loader on the button
    if (preWarmPromise) {
        const btn = ui.btnToggleLanding;
        if (btn && ui.prewarmLoader) {
            ui.prewarmLoader.style.display = 'block';
            btn.classList.add('loading');
            try {
                await preWarmPromise;
            } finally {
                ui.prewarmLoader.style.display = 'none';
                btn.classList.remove('loading');
            }
        }
    }

    ui.dashboard.style.display = 'flex';

    // UI Refs for new elements
    if (ui.modeToggle) {
        ui.modeToggle.onclick = () => {
            const isText = ui.modeLabel.textContent.includes('Text');
            const newMode = isText ? 'layout' : 'text';
            
            ui.modeLabel.textContent = newMode === 'text' ? 'Text Mode' : 'Layout Mode';
            ui.modeToggle.classList.toggle('active', newMode === 'text');
            
            // Switch Icon
            ui.modeIcon.innerHTML = newMode === 'text' 
                ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'
                : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>';
            
            ui.preview.contentWindow.postMessage({ type: 'CMS_MODE', mode: newMode }, '*');
        };
    }

    // Check for demo mode and set layout
    if (isDemoMode) {
        ui.dashboard.classList.add('demo-active');
        ui.dashboard.classList.remove('drawer-left-open');
    } else {
        ui.dashboard.classList.add('drawer-left-open');
    }

    // Slight delay to ensure display:flex is painted before adding .active for transition
    requestAnimationFrame(() => {
        ui.dashboard.classList.add('active');
    });
    
    // Safety: ensure demo mode is cleared if we are opening a real project
    if (settings.repo && settings.token && isDemoMode) {
        isDemoMode = false;
        document.documentElement.classList.remove('demo-mode');
    }
    if (settings.repo && settings.token) {
        if (ui.stepLogin) ui.stepLogin.classList.add('hidden');
        if (ui.stepPicker) ui.stepPicker.classList.add('hidden');
        await startCmsEngine(settings.repo, getActiveToken());
    } else if (settings.token) {
        if (ui.stepLogin) ui.stepLogin.classList.add('hidden');
        if (ui.stepPicker) ui.stepPicker.classList.remove('hidden');
        fetchRepos();
    }
};

window.startDemoMode = async () => {
    // Alias for the old 'startDemo' name used in inline HTML handlers
    window.startDemo = window.startDemoMode;
    isDemoMode = true;
    document.documentElement.classList.add('demo-mode');
    if (!ui.dashboard) return;
    ui.dashboard.style.display = 'flex';
    requestAnimationFrame(() => {
        ui.dashboard.classList.add('active');
    });
    if (ui.stepLogin) ui.stepLogin.classList.add('hidden');
    if (ui.stepPicker) ui.stepPicker.classList.add('hidden');
    await startCmsEngine('Demo: 0CMS Landing Page', null, true);
};



safeBind(ui.btnToggleLanding, 'onclick', window.openDashboard);
safeBind(ui.navDemoBtn, 'onclick', () => window.startDemoMode());

safeBind(ui.btnClose, 'onclick', () => {
    ui.dashboard.classList.remove('active');
    setTimeout(() => {
        ui.dashboard.style.display = 'none';
        document.documentElement.classList.remove('demo-mode');
        document.documentElement.classList.remove('demo-mode-child');
        const mark = document.getElementById('demoCoachMark');
        if (mark) mark.style.display = 'none';
        isDemoMode = false;
        cmsActive = false;
    }, 500);
});

safeBind(ui.loginBtn, 'onclick', () => window.location.href = '/github/login');
safeBind(ui.landingLoginBtn, 'onclick', () => window.location.href = '/github/login');


safeBind(ui.navNewPage, 'onclick', async () => {
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
});

ui.pageSettingsPanel = document.getElementById('cmsPageSettingsPanel');

safeBind(ui.navHistory, 'onclick', () => window.toggleHistory());
safeBind(ui.navSEO, 'onclick', () => {
    const isVisible = ui.pageSettingsPanel.style.display === 'flex';
    if (isVisible) {
        ui.pageSettingsPanel.style.display = 'none';
        ui.navSEO.classList.remove('active');
    } else {
        ui.pageSettingsPanel.style.display = 'flex';
        ui.navSEO.classList.add('active');
        ui.navNewPage.classList.remove('active');
        ui.preview.contentWindow.postMessage({ type: 'CMS_GET_SEO' }, '*');
    }
});

const syncSEO = () => {
     ui.preview.contentWindow.postMessage({
        type: 'CMS_SET_SEO',
        title: ui.seoTitle.value,
        description: ui.seoDesc.value,
        image: ui.seoImage.value
    }, '*');
};

safeBind(ui.seoTitle, 'oninput', syncSEO);
safeBind(ui.seoDesc, 'oninput', syncSEO);
safeBind(ui.seoImage, 'oninput', syncSEO);


// Window Event Listener for generic postMessages from iframe
window.addEventListener('message', (e) => {
    if (e.data.type === 'CMS_SEO_DATA') {
        ui.seoTitle.value = e.data.title || '';
        ui.seoDesc.value = e.data.description || '';
        ui.seoImage.value = e.data.image || '';
    }
    
    if (e.data.type === 'CMS_READY') {
        showToast('Visual Editor Ready', 'success');
        if (ui.previewLoader) {
            ui.previewLoader.style.opacity = '0';
            setTimeout(() => {
                ui.previewLoader.style.display = 'none';
                ui.previewLoader.classList.add('hidden');
            }, 500);
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
        
        // DEMO COACH MARK: Show a visual hint for the diff feature on first edit
        if (isDemoMode && count > 0 && !window._zcmsCoachMarkShown) {
            const mark = document.getElementById('demoCoachMark');
            if (mark) {
                mark.style.display = 'block';
                window._zcmsCoachMarkShown = true;
                setTimeout(() => mark.style.opacity = '0', 8000);
                setTimeout(() => mark.style.display = 'none', 8500);
            }
        }

        // REAL-TIME SYNC: Apply the last change to the WebContainer FS
        if (entries.length > 0 && cmsService) {
            const lastEntry = entries[entries.length - 1];
            if (lastEntry.original && lastEntry.updated && lastEntry.original !== lastEntry.updated) {
                 cmsService.applySmartMatchChange(
                    lastEntry.original, 
                    lastEntry.updated, 
                    lastEntry.sourceFile || null
                 ).then(async (result) => {
                    // SYNC TO WASM RUNTIME: Ensure PHP/Python preview sees the change
                    if (result && result.path && result.content) {
                        WasmBridge.getInstance().syncFile(result.path, result.content);
                        
                        // NEW: FLICKER-FREE HMR (SUPER-MORPH)
                        const currentUrl = ui.preview.src;
                        IframeSyncService.getInstance().sync(ui.preview, currentUrl, result.markerId);
                    }
                 }).catch(err => console.error('[CMS] Autosync failed:', err));
            }
        }
        
        if (e.data.canUndo) ui.navBack.classList.remove('disabled');
        else ui.navBack.classList.add('disabled');
        
        if (e.data.canRedo) ui.navForward.classList.remove('disabled');
        else ui.navForward.classList.add('disabled');
        
        if (ui.historyCount) ui.historyCount.textContent = count;
        
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
                `;}).join('');
            }
        }
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

safeBind(ui.viewDesktop, 'onclick', () => updateViewport('desktop'));
safeBind(ui.viewTablet, 'onclick', () => updateViewport('tablet'));
safeBind(ui.viewMobile, 'onclick', () => updateViewport('mobile'));


// CMS Initialization Logic
async function startCmsEngine(repo, token, demo = false) {
    if (cmsActive && !demo) return;
    cmsActive = true;
    isDemoMode = !!demo;
    
    ui.repoDisplay.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:relative;top:2px;margin-right:4px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${repo}`;
    
    const demoBadge = document.getElementById('demoBadge');
    if (demoBadge) demoBadge.style.display = isDemoMode ? 'inline-block' : 'none';

    if (isDemoMode) {
        ui.statusLabel.textContent = 'Demo Mode Active';
        ui.statusDot.className = 'status-dot on';
        ui.previewLoader.classList.add('hidden');
        
        // STABILITY DELAY: Wait 300ms before hitting the same origin again for the iframe.
        // This prevents 'Connection Refused' during heavy cold-boots (cache clear).
        setTimeout(() => {
            ui.preview.src = window.location.origin + '/?demo=true';
            ui.preview.onload = () => {
                ui.preview.contentWindow.postMessage({ 
                    type: 'CMS_CONFIG', 
                    proxyUrl: `${window.location.origin}/proxy?url=`
                }, '*');
                ui.preview.contentWindow.postMessage({ type: 'CMS_TOGGLE', enabled: true }, '*');
            };
        }, 300);
        return;
    }
    
    if (!preWarmingService) {
        preWarmingService = new WebContainerGitService();
    }
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
        // HIJACK PROTECTION: If the user is in Demo Mode, do NOT overwrite the preview URL
        // with the background engine's real project URL.
        if (isDemoMode) {
            console.log('[CMS] Background engine ready, but suppressing UI update because Demo Mode is active.');
            return;
        }

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
        
        // ACTIVATE RUNTIME BRIDGE: Ensure PHP/Python/Rust preview is ready
        if (cmsService.activeDriver) {
            WasmBridge.getInstance().activate(cmsService.activeDriver.id);
        }

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
            
            // ACTIVATE RUNTIME BRIDGE after boot
            if (cmsService.activeDriver) {
                WasmBridge.getInstance().activate(cmsService.activeDriver.id);
            }
        } finally {
            clearTimeout(bootWatchdog);
        }
    } else if (cmsService.serverUrl) {
        ui.preview.src = cmsService.serverUrl;
        ui.siteUrl.textContent = 'Live Preview Active';

        // ACTIVATE RUNTIME BRIDGE
        if (cmsService.activeDriver) {
            WasmBridge.getInstance().activate(cmsService.activeDriver.id);
        }
    }
}

// 0. UI REFRESH: Project Awareness
async function refreshLandingUI() {
    // Sync with head-script changes
    settings = JSON.parse(localStorage.getItem('zcms-settings') || '{}');
    
    if (settings.token) {
        document.documentElement.classList.add('authenticated');
        // User is connected! UI should reflect this "forever"
        // Fetch all account installations in background
        await fetchInstallations();

        // OPTIMISTIC PRE-FILL: Use last known repo immediately
        if (settings.repo) {
            if (ui.landingProject) ui.landingProject.classList.remove('hidden');
            if (ui.landingRepoName) ui.landingRepoName.textContent = settings.repo;
        } else {
            if (ui.landingProject) ui.landingProject.classList.add('hidden');
        }
    } else {
        // Fresh start - show connect action
        document.documentElement.classList.remove('authenticated');
        if (ui.landingProject) ui.landingProject.classList.add('hidden');
        if (ui.landingRepoSection) ui.landingRepoSection.classList.add('hidden');
    }
}

// --- REPOSITORY PICKER LOGIC ---

// Helper: Relative Time
function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
}

async function fetchInstallations() {
    if (!settings.token) return;
    
    // Always clear and ensure some content exists so the dropdown has "volume"
    ui.accountDropdown.innerHTML = '';
    
    let appSlug = '0cms-dev'; // fallback for app management links
    
    try {
        const res = await fetch('/github/api/user/installations', {
            headers: { 'Authorization': `Bearer ${settings.token}` }
        });
        
        if (res.status === 401) {
            delete settings.token;
            localStorage.setItem('zcms-settings', JSON.stringify(settings));
            document.documentElement.classList.remove('authenticated');
            refreshLandingUI();
            return;
        }

        const data = await res.json();
        installations = data.installations || [];
        
        try {
            const appRes = await fetch('/github/api/app');
            const appData = await appRes.json();
            if (appData.slug) appSlug = appData.slug;
            
            // Set the main settings gear fallback URL to the App overview immediately
            if (ui.ghAppSettingsLink) {
                ui.ghAppSettingsLink.href = `https://github.com/apps/${appSlug}/installations/new`;
            }
        } catch (e) {}

        if (installations.length > 0) {
            installations.forEach(inst => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.innerHTML = `
                    <img src="${inst.account.avatar_url}" class="account-avatar">
                    <span>${inst.account.login}</span>
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    ui.accountDropdown.classList.remove('open');
                    selectInstallation(inst);
                };
                ui.accountDropdown.appendChild(item);
            });
        } else {
             ui.selectedAccountName.textContent = "My Repositories";
             fetchRepos();
        }
    } catch (err) {
        console.error('Failed to fetch installations', err);
        // We still continue to add the Manage link below
    } finally {
        // Clear "Loading..." or "Connect GitHub" state if we have a name
        if (ui.selectedAccountName.textContent === 'Loading...' || ui.selectedAccountName.textContent === 'Connect GitHub') {
            ui.selectedAccountName.textContent = 'My Repositories';
        }

        // Add "Manage GitHub accounts" item (ALWAYS)
        const manageItem = document.createElement('div');
        manageItem.className = 'dropdown-item';
        manageItem.style.borderTop = '1px solid var(--border)';
        manageItem.style.marginTop = '4px';
        manageItem.style.color = 'var(--primary)';
        manageItem.style.fontWeight = '600';
        manageItem.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;"><path d="M12 5v14M5 12h14"/></svg>
            <span>Manage GitHub accounts</span>
        `;
        manageItem.onclick = (e) => {
            e.stopPropagation();
            window.open(`https://github.com/apps/${appSlug}/installations/new`, '_blank');
        };
        ui.accountDropdown.appendChild(manageItem);

        // Auto-select logic moved to only if success (AND NOT in Demo Mode)
        if (installations && installations.length > 0) {
            const initial = installations.find(i => i.id == settings.installation_id) || installations[0];
            if (initial && !isDemoMode) selectInstallation(initial);
        } else if (!settings.token) {
             ui.selectedAccountName.textContent = "Connect GitHub";
        }
    }
}

async function selectInstallation(inst) {
    if (isDemoMode) return; // Safety: never auto-hijack if demo is active

    selectedInstallationId = inst.id;
    settings.installation_id = inst.id;
    localStorage.setItem('zcms-settings', JSON.stringify(settings));

    ui.selectedAccountName.textContent = inst.account.login;
    ui.selectedAccountAvatar.src = inst.account.avatar_url;
    ui.ghAppSettingsLink.href = inst.html_url;
    
    // Clear search and fetch repos for this account
    ui.repoSearchInput.value = '';
    
    // NEW: Get an installation-specific token from our backend
    try {
        const res = await fetch(`/github/api/app/installations/${inst.id}/access_tokens`, {
            method: 'POST'
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        
        if (data.token) {
            currentInstallationToken = data.token;
            localStorage.setItem('zcms-inst', JSON.stringify({ token: data.token, expires: Date.now() + 55 * 60000 }));
        } else {
            currentInstallationToken = null;
            localStorage.removeItem('zcms-inst');
        }
    } catch (err) {
        console.error('Failed to get installation token, falling back to user token', err);
        currentInstallationToken = null;
        localStorage.removeItem('zcms-inst');
    }

    fetchRepos(inst.id);
}

// Global repo search listener (REDUNDANT: already bound with safeBind at top)
// ui.repoSearchInput.oninput = (e) => renderRepos(e.target.value);

async function fetchRepos(installationId = null) {
    if (!settings.token) return;

    ui.landingRepoList.innerHTML = '<div style="grid-column: 1/-1; padding:40px; text-align:center; color:var(--text-muted)"><div class="loader" style="margin: 0 auto;"></div></div>';
    
    try {
        const path = installationId ? `user/installations/${installationId}/repositories` : 'user/repos?sort=updated&per_page=100';
        const res = await fetch(`/github/api/${path}`, {
            headers: { 'Authorization': `Bearer ${settings.token}` }
        });
        if (res.status === 401) {
            delete settings.token;
            localStorage.setItem('zcms-settings', JSON.stringify(settings));
            document.documentElement.classList.remove('authenticated');
            refreshLandingUI();
            return;
        }

        const data = await res.json();
        currentRepos = Array.isArray(data) ? data : (data.repositories || []);
        
        if (!Array.isArray(currentRepos)) {
            const errorMsg = data.message || 'Failed to fetch repositories.';
            ui.landingRepoList.innerHTML = `<div style="grid-column: 1/-1; padding:40px; text-align:center; color:var(--text-danger)">${errorMsg}</div>`;
            return;
        }

        // AUTO-SELECT RECENT REPOSITORY
        // If the user hasn't selected a repo yet, pre-fill the Hero section with their most recently updated one!
        // (UNLESS in Demo Mode - we don't want to hijack the demo)
        if (!settings.repo && currentRepos.length > 0 && !isDemoMode) {
            settings.repo = currentRepos[0].full_name;
            localStorage.setItem('zcms-settings', JSON.stringify(settings));
        }


        renderRepos();
        
    } catch (err) {
        console.error('FetchRepos Error:', err);
        ui.landingRepoList.innerHTML = `<div style="grid-column: 1/-1; padding:40px; text-align:center; color:var(--text-danger)">Connection error: ${err.message}</div>`;
    }
}

function renderRepos(filter = '') {
    const filtered = currentRepos.filter(r => r.full_name.toLowerCase().includes(filter.toLowerCase()));
    
    // Use the landing page grid for EVERYTHING now as requested
    ui.landingRepoList.innerHTML = '';
    
    if (filtered.length === 0) {
        ui.landingRepoList.innerHTML = '<div style="grid-column: 1/-1; padding:40px; text-align:center; color:var(--text-muted)">No matching repositories.</div>';
        return;
    }

    filtered.forEach(repo => {
        const card = document.createElement('div');
        card.className = 'project-card';
        // Reuse the premium card style
        card.innerHTML = `
            <div style="flex:1">
                <div class="project-name" style="display:flex; align-items:center; gap:8px;">
                    ${repo.name}
                    ${repo.private ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="opacity:0.4"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' : ''}
                </div>
                <div class="project-meta">Updated ${formatRelativeTime(repo.updated_at)}</div>
            </div>
            <div style="color: var(--primary); opacity: 0; transition: 0.2s;" class="open-indicator">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
        `;
        
        card.onmouseenter = () => card.querySelector('.open-indicator').style.opacity = '1';
        card.onmouseleave = () => card.querySelector('.open-indicator').style.opacity = '0';
        
        card.onclick = () => selectRepo(repo.full_name);
        ui.landingRepoList.appendChild(card);
    });

    // Also sync the modal list if it's ever used (fallback)
    if (ui.repoList) {
        ui.repoList.innerHTML = ui.landingRepoList.innerHTML;
        Array.from(ui.repoList.children).forEach((child, i) => {
            child.onclick = () => {
                const repo = filtered[i];
                if (repo) selectRepo(repo.full_name);
            };
        });
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
    
    // Clear Demo state when selecting a real project
    isDemoMode = false;
    document.documentElement.classList.remove('demo-mode');
    document.documentElement.classList.remove('demo-mode-child');
    
    refreshLandingUI();
    // Start the engine
    startCmsEngine(name, getActiveToken());
    // Explicitly open the dashboard UI and force visibility
    window.openDashboard();
}

function showToast(msg, type) {
    if (!ui.toast) return;
    ui.toast.textContent = msg;
    ui.toast.className = `toast ${type} show`;
    setTimeout(() => ui.toast.classList.remove('show'), 3000);
}

// Visual Editor Sync (Zen Editor: Automatically active)
// Redundant window.onmessage removed (merged into addEventListener above)
;

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

safeBind(ui.navBack, 'onclick', () => {
    ui.preview.contentWindow.postMessage({ type: 'CMS_UNDO' }, '*');
});
safeBind(ui.navForward, 'onclick', () => {
    ui.preview.contentWindow.postMessage({ type: 'CMS_REDO' }, '*');
});


// Initial state
ui.navBack.classList.add('disabled');
ui.navForward.classList.add('disabled');


safeBind(ui.saveBtn, 'onclick', async () => {
     if (isDemoMode) {
         const overlay = document.getElementById('publishOverlay');
         const iconBox = document.getElementById('publishIconBox');
         const spinner = document.getElementById('publishSpinner');
         const check = document.getElementById('publishCheck');
         const text = document.getElementById('publishText');
         const subtext = document.getElementById('publishSubtext');

         overlay.classList.add('active');
         iconBox.className = 'publish-icon-box loading';
         spinner.style.display = 'block';
         check.style.display = 'none';
         text.textContent = 'Simulating publish...';
         subtext.textContent = 'Demo Mode: Sandbox environment';

         setTimeout(() => {
             iconBox.className = 'publish-icon-box success';
             spinner.style.display = 'none';
             check.style.display = 'block';
             text.textContent = 'Success! (Demo)';
             subtext.textContent = 'Connect GitHub to publish for real.';
             
             setTimeout(() => {
                 overlay.classList.remove('active');
                 showToast('Demo changes saved to local memory!', 'success');
             }, 2500);
         }, 1500);
         return;
     }
     console.log('[CMS] Publish button clicked!');
     if (!cmsService) {
         console.error('[CMS] cmsService is not initialized!');
         alert('CMS Engine not initialized. Please try reloading the project.');
         return;
     }
     ui.saveBtn.disabled = true;
     const oldHTML = ui.saveBtn.innerHTML;
     ui.saveBtn.innerHTML = 'Publishing...';
     try {
        const overlay = document.getElementById('publishOverlay');
        const iconBox = document.getElementById('publishIconBox');
        const spinner = document.getElementById('publishSpinner');
        const check = document.getElementById('publishCheck');
        const pText = document.getElementById('publishText');
        const pSub = document.getElementById('publishSubtext');

        if (overlay) {
            iconBox.className = 'publish-icon-box loading';
            spinner.style.display = 'block';
            check.style.display = 'none';
            pText.textContent = 'Publishing changes...';
            pSub.textContent = 'Syncing your edits securely to GitHub';
            overlay.classList.add('active');
        } else {
            showToast('Syncing to GitHub...', 'info');
        }

        const result = await cmsService.publishChanges(`Visual update: ${new Date().toLocaleString()}`);

        if (result && result.message === 'No changes') {
            if (overlay) overlay.classList.remove('active');
            showToast('No changes detected since last publish.', 'info');
        } else {
            // STEP 2: Clear local draft in the editor
            ui.preview.contentWindow.postMessage({ type: 'CMS_PURGE' }, '*');
            
            // Reset variables for instant UI update
            changes = {};
            ui.saveBtn.style.display = 'none';
            ui.statusLabel.textContent = '0 Unsaved Changes';
            ui.statusLabel.style.color = 'var(--text-muted)';
            
            if (overlay) {
                iconBox.className = 'publish-icon-box success';
                spinner.style.display = 'none';
                check.style.display = 'block';
                pText.textContent = 'Published to GitHub!';
                pSub.textContent = 'Your website is now building.';
                
                setTimeout(() => {
                    if (overlay) overlay.classList.remove('active');
                }, 1800);
            } else {
                showToast('Changes published successfully!', 'success');
            }
        }
     } catch (e) { 
         const overlay = document.getElementById('publishOverlay');
         if (overlay) overlay.classList.remove('active');
         console.error('[CMS] Publish failed:', e);
         alert(`Publish failed: ${e.message}`); // Use alert for prominence on error
         showToast(`Publish failed: ${e.message}`, 'error'); 
     } finally {
         ui.saveBtn.disabled = false;
         ui.saveBtn.innerHTML = oldHTML;
     }
});

    window.addEventListener('beforeunload', (e) => {
        if (Object.keys(changes).length > 0 && !isDemoMode) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
} // --- END IF (isHostApp) ---

