(() => {
  'use strict';
  const script = document.currentScript;
  if (!script?.src) return;
  const base = new URL('.', script.src);
  const supported = 'serviceWorker' in navigator && window.isSecureContext;
  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  let deferredInstall = null, installedThisVisit = false, registration = null;
  let currentVersion = '', cachedVersion = '', waitingVersion = '', latestVersion = '';
  let cacheReady = false, busy = false, updateRequested = false, message = '';
  let dialog = null, previousFocus = null;
  const versionLabel = value => value ? `v${String(value).slice(0,12)}` : '尚未记录';
  const installed = () => installedThisVisit || standaloneQuery.matches || navigator.standalone === true;
  const setMessage = value => { message = value; render(); };
  function askWorker(worker, type, timeout = 7000) {
    return new Promise((resolve, reject) => {
      if (!worker) { reject(new Error('worker unavailable')); return; }
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('worker response timeout')); }, timeout);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      worker.postMessage({type}, [channel.port2]);
    });
  }
  async function refreshVersions() {
    const controller = navigator.serviceWorker?.controller;
    if (controller) {
      try { const info = await askWorker(controller, 'GET_VERSION'); currentVersion = info.version || ''; cacheReady = info.offlineReady === true; } catch { /* Keep the last confirmed active version. */ }
    }
    if (registration?.active) {
      try { const info = await askWorker(registration.active, 'GET_VERSION'); cachedVersion = info.version || ''; cacheReady ||= info.offlineReady === true; } catch { /* Cache state is unavailable. */ }
    }
    waitingVersion = '';
    if (registration?.waiting) {
      try { waitingVersion = (await askWorker(registration.waiting, 'GET_VERSION')).version || ''; } catch { /* Retry on the next explicit check. */ }
    }
    render();
  }
  async function fetchLatestVersion() {
    const response = await fetch(new URL('app-version.json', base), {cache:'no-store',redirect:'error',credentials:'same-origin'});
    if (!response.ok || response.redirected || !/application\/(?:json|manifest\+json)/i.test(response.headers.get('content-type') || '')) throw new Error('invalid release metadata');
    const finalUrl = new URL(response.url);
    if (finalUrl.origin !== base.origin || finalUrl.pathname !== new URL('app-version.json', base).pathname) throw new Error('unexpected metadata location');
    const info = await response.json();
    if (info.schema !== 1 || !/^[a-f0-9]{12,64}$/.test(info.version || '')) throw new Error('invalid release version');
    latestVersion = info.version;
  }
  function watchInstallation(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'activated') refreshVersions().then(() => {
        if (registration?.waiting) setMessage('新版已完整下载，点击“更新并重启”即可切换。');
      });
      if (worker.state === 'redundant') setMessage('离线准备未完成，当前可在线使用。稍后点“检查更新”重试。');
    });
  }
  async function register() {
    if (!supported) { render(); return false; }
    try {
      registration = await navigator.serviceWorker.register(new URL('sw.js',base), {scope:base.href,updateViaCache:'none'});
      registration.addEventListener('updatefound', () => { watchInstallation(registration.installing); render(); });
      watchInstallation(registration.installing);
      await refreshVersions();
      return true;
    } catch (error) { console.warn('Offline setup failed', error); setMessage('离线功能暂未就绪；网页仍可在线使用。请联网后检查更新。'); return false; }
  }
  function render() {
    const trigger = document.getElementById('open-app-settings');
    if (trigger) {
      trigger.dataset.pwaUpdate = String(Boolean(registration?.waiting));
      if (trigger.classList.contains('install-button')) trigger.textContent = installed() ? '应用与更新' : registration?.waiting ? '发现更新' : '安装到手机';
    }
    if (!dialog) return;
    const find = name => dialog.querySelector(`[data-pwa="${name}"]`);
    find('install-state').textContent = installed() ? '已以应用方式打开' : deferredInstall ? '可安装到桌面' : '浏览器中打开';
    find('network').textContent = navigator.onLine ? '网络已连接' : '当前离线';
    find('offline').textContent = !supported ? '当前使用在线版' : cacheReady ? '离线内容已准备' : '首次离线缓存准备中';
    find('current').textContent = currentVersion ? versionLabel(currentVersion) : '首次打开 · 下次启动使用离线版本';
    find('cached-row').hidden = Boolean(currentVersion) || !cachedVersion;
    find('cached-label').hidden = Boolean(currentVersion) || !cachedVersion;
    find('cached-row').textContent = versionLabel(cachedVersion);
    find('latest').textContent = waitingVersion ? `${versionLabel(waitingVersion)} · 已下载，等待更新` : latestVersion ? `${versionLabel(latestVersion)}${latestVersion===currentVersion?' · 与当前一致':''}` : '联网检查后显示';
    find('install').hidden = installed();
    find('install').disabled = busy;
    find('install').textContent = deferredInstall ? '安装应用' : '查看安装方法';
    find('install-help').hidden = Boolean(deferredInstall) || installed();
    find('update').hidden = !registration?.waiting;
    find('update').disabled = busy;
    find('check').disabled = busy || !supported;
    find('message').textContent = message;
    find('offline-detail').textContent = cacheReady
      ? '可离线查看课表、NLP 题库和本地配图。Moodle、外部刷题站及外部 PDF 需要联网。'
      : supported ? '首次联网时会准备课表、NLP 题库和本地配图；下载完成后，下次打开即可离线阅读。' : '此浏览器或打开方式暂不支持安装和离线缓存。请使用 HTTPS 地址在安卓 Chrome 中打开。';
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'study-app-dialog';
    dialog.setAttribute('aria-labelledby','study-app-dialog-title');
    dialog.innerHTML = `<div class="pwa-head"><img class="pwa-icon" src="${new URL('icons/icon-192.png',base).href}" alt=""><div><h2 id="study-app-dialog-title">课表与复习</h2><p class="pwa-caption">桌面应用与离线阅读</p></div><button type="button" class="pwa-close" aria-label="关闭应用设置" data-pwa="close">×</button></div><div class="pwa-content"><div class="pwa-status"><span data-pwa="install-state"></span><strong data-pwa="network"></strong></div><section class="pwa-panel"><h3>随手打开，接着学习</h3><p>安装后可从手机桌面打开。学习记录保存在当前设备的浏览器中。</p><div class="pwa-actions"><button type="button" class="pwa-button primary" data-pwa="install">安装应用</button></div><p data-pwa="install-help">安卓 Chrome：右上角“更多” → “安装并创建快捷方式”（部分版本叫“添加到主屏幕”）→ “安装”。若没有安装入口，请直接在 Chrome 打开本站。</p></section><section class="pwa-panel"><h3 data-pwa="offline"></h3><p data-pwa="offline-detail"></p><dl class="pwa-versions"><dt>当前版本</dt><dd data-pwa="current"></dd><dt data-pwa="cached-label" hidden>已缓存版本</dt><dd data-pwa="cached-row" hidden></dd><dt>可用版本</dt><dd data-pwa="latest"></dd></dl><div class="pwa-actions"><button type="button" class="pwa-button" data-pwa="check">检查更新</button><button type="button" class="pwa-button primary" data-pwa="update" hidden>更新并重启</button></div><p class="pwa-message" role="status" aria-live="polite" data-pwa="message"></p></section><p class="pwa-footnote">更新保留本地学习记录。更新前请关闭其他课表或练习窗口；换设备前，可在 NLP 站导出学习备份。</p></div>`;
    document.body.append(dialog);
    dialog.querySelector('[data-pwa="close"]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>previousFocus?.focus?.());
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    dialog.querySelector('[data-pwa="install"]').addEventListener('click',async()=>{
      if (!deferredInstall) { dialog.querySelector('[data-pwa="install-help"]').hidden=false; setMessage('请按上方 Chrome 菜单路径安装；是否提供安装入口由浏览器决定。'); return; }
      const prompt = deferredInstall; deferredInstall = null;
      try { await prompt.prompt(); const choice = await prompt.userChoice; setMessage(choice.outcome==='accepted'?'已接受安装请求，请以系统安装结果为准。':'可以稍后从这里再次查看安装方法。'); } catch { setMessage('请使用 Chrome 菜单中的安装入口。'); }
      render();
    });
    dialog.querySelector('[data-pwa="check"]').addEventListener('click',async()=>{
      busy=true;setMessage('正在检查新版；首次下载离线内容可能需要片刻。');
      try { await fetchLatestVersion(); if (!(registration?.active || registration?.waiting || registration?.installing)) { if (!await register()) throw new Error('Offline registration unavailable'); } else await registration.update(); await refreshVersions(); setMessage(registration?.waiting?'新版已完整下载，点击“更新并重启”即可切换。':registration?.installing?'正在准备新版离线内容，完成后会出现更新按钮。':latestVersion===currentVersion?'当前已是最新版本。':'已检查。首次缓存完成后，下次打开将使用离线版本。'); } catch { setMessage('暂时无法检查更新，请联网后重试。网页仍可在线使用。'); }
      finally { busy=false;render(); }
    });
    dialog.querySelector('[data-pwa="update"]').addEventListener('click',async()=>{
      const worker=registration?.waiting;
      if (!worker) { await refreshVersions(); return; }
      if (!window.dispatchEvent(new CustomEvent('study-app-before-update',{cancelable:true}))) {setMessage('请先完成当前编辑并保存，再更新。');return;}
      busy=true;updateRequested=true;setMessage('正在准备重新打开当前页面…');
      try {
        const result=await askWorker(worker,'ACTIVATE_UPDATE',12000);
        if (result.status!=='accepted') {updateRequested=false;busy=false;setMessage(result.status==='other-windows'?'请先关闭其他课表或 NLP 练习窗口，再点击“更新并重启”。':'新版尚未准备完成，请稍后再试。');}
      } catch {updateRequested=false;busy=false;setMessage('更新暂未完成，请重新检查。当前学习记录保持不变。');}
      render();
    });
    render();
  }
  function openSettings() {
    previousFocus=document.activeElement;ensureDialog();render();
    if (typeof dialog.showModal==='function') {if(!dialog.open)dialog.showModal();} else dialog.setAttribute('open','');
    refreshVersions();
  }
  document.addEventListener('click',event=>{if(event.target.closest?.('#open-app-settings,[data-open-app-settings]')){event.preventDefault();openSettings();}});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;render();});
  window.addEventListener('appinstalled',()=>{installedThisVisit=true;deferredInstall=null;setMessage('安装已完成。可从设备桌面打开应用。');});
  window.addEventListener('online',render);window.addEventListener('offline',render);
  standaloneQuery.addEventListener?.('change',render);
  if (supported) {
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updateRequested){window.location.reload();}else refreshVersions();});
    navigator.serviceWorker.addEventListener('message',event=>{
      if(event.data?.type!=='OFFLINE_PREPARE_FAILED')return;
      console.warn('Offline prepare failed: '+String(event.data.path||'(unknown asset)')+' — '+String(event.data.reason||'(unknown reason)'));
      setMessage('离线准备未完成，当前可在线使用。稍后点“检查更新”重试。');
    });
  }
  window.TumStudyPWA=Object.freeze({openSettings});
  if (document.readyState==='complete') register();else window.addEventListener('load',register,{once:true});
})();
