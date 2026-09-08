// ==UserScript==
// @name         115 增强
// @namespace    tampermonkey-scripts/115-enhancement
// @version      1.2.1
// @description  优化115文件列表和播放器，提供视频选集按钮与广告清理，支持独立菜单设置。
// @match        *://115.com/*
// @match        *://*.115.com/*
// @match        *://115vod.com/*
// @match        *://www.115vod.com/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// ==/UserScript==

(function start() {
    "use strict";

    if (!/(^|\.)115(?:vod)?\.com$/.test(location.hostname)) return;
    if (!document.body) {
        document.addEventListener("DOMContentLoaded", start, { once: true });
        return;
    }

    if (document.getElementById("tm115-player-style")) return;

    // <include:../shared/dialog.js>
    // <include:../shared/settings-dialog.js>

    // 功能开关与播放参数分别保存，设置窗口只修改发生变化的项目。
    const config = {
        list: { key: "tm115-list-enabled", label: "列表优化" },
        player: { key: "tm115-player-enabled", label: "播放器优化" },
        playlist: { key: "tm115-playlist-enabled", label: "播放器显示视频列表" },
        ads: { key: "tm115-ads-enabled", label: "去除广告" },
        holdRate: {
            key: "tm115-hold-rate",
            label: "长按快进倍数（1-8 倍）",
            type: "number",
            defaultValue: 3,
            attributes: { min: 1, max: 8, step: 0.25 },
            validValue: value => {
                const rate = +value;
                return rate >= 1 && rate <= 8 && rate * 4 % 1 === 0
                    ? null : "请输入 1-8 之间的倍数，步进为 0.25（例如 2、2.5、3、4）。";
            },
            serializeValue: value => +value,
        },
    };
    const getValue = typeof GM_getValue === "function"
        ? GM_getValue
        : (key, fallback) => fallback;
    const setValue = typeof GM_setValue === "function" ? GM_setValue : () => {};
    // 数值参数单独读取和校验，避免被当作开关转换成布尔值；异常存储值使用默认值。
    const readValues = () => Object.fromEntries(Object.entries(config).map(([name, item]) => {
        const value = getValue(item.key, item.defaultValue ?? true);
        return [name, item.type === "number"
            ? (item.validValue(value) ? item.defaultValue : +value)
            : Boolean(value)];
    }));
    const values = readValues();
    if (window === window.top && typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("115 增强设置", async () => {
            const currentValues = readValues();
            const nextValues = await SettingsDialog.open({
                title: "115 增强设置",
                values: currentValues,
                items: Object.entries(config).map(([name, item]) => ({ name, type: "checkbox", ...item })),
                confirmText: "保存并刷新",
                cancelText: "取消",
            });
            if (!nextValues) return;
            let changed = false;
            for (const [name, item] of Object.entries(config)) {
                if (nextValues[name] === currentValues[name]) continue;
                setValue(item.key, nextValues[name]);
                changed = true;
            }
            if (changed) location.reload();
        });
    }

    const coarse = typeof matchMedia === "function" && matchMedia("(any-pointer: coarse)").matches;
    const players = new Map();
    // 样式集中注入：主要修正布局，并补充锁定图标和当前选集的对比度。
    const style = document.createElement("style");
    style.id = "tm115-player-style";
    style.textContent = values.player ? `
        .tm115-player { position: relative; }
        .tm115-player.tm115-legacy { height: 100% !important; }
        #js-wrap:has(.tm115-legacy), .video-container:has(.tm115-legacy), .video-player:has(.tm115-legacy) {
            max-width: 100% !important;
        }
        html.video-fullscreen:has(.tm115-player) { overflow: hidden !important; }
        .tm115-player video {
            width: 100% !important; height: 100% !important;
            max-width: none !important; max-height: none !important;
            min-width: 0 !important; min-height: 0 !important;
            margin: 0 !important;
        }
        .tm115-player.tm115-legacy video {
            width: var(--tm115-scale, 100%) !important; height: var(--tm115-scale, 100%) !important;
            margin: auto !important; object-fit: contain !important;
        }
        .tm115-player.tm115-legacy.tm115-cover video { object-fit: cover !important; }
        .tm115-player.tm115-legacy .play-stage {
            position: absolute !important; inset: 0 !important;
            width: 100% !important; height: 100% !important;
            overflow: hidden !important;
        }
        .tm115-player.tm115-legacy .play-stage video {
            position: absolute !important; inset: 0 !important;
        }
        .tm115-player { -webkit-touch-callout: none; }
        .tm115-player .tm115-lock {
            position: absolute !important; left: 12px !important; top: 50% !important;
            right: auto !important; bottom: auto !important;
            transform: translateY(-50%) !important; z-index: 2147483647 !important;
            opacity: 1 !important; pointer-events: auto !important;
            display: grid !important; place-items: center;
            width: 44px !important; height: 44px !important; padding: 0 !important;
            background: transparent !important; border: 0 !important; box-shadow: none !important;
            color: #fff; cursor: pointer;
        }
        .tm115-player .tm115-lock > .icon-operate {
            display: block; width: 20px; height: 20px; margin: 0;
            background-repeat: no-repeat; background-position: -220px 0 !important;
        }
        .tm115-player .tm115-lock[aria-pressed="true"] > .icon-operate {
            background-position-x: -200px !important;
        }
        .tm115-player .tm115-lock > img {
            display: block; width: 20px !important; height: 20px !important;
            max-width: none; object-fit: none; object-position: -220px 0;
        }
        .tm115-player .tm115-lock[aria-pressed="true"] > img {
            object-position: -200px 0;
        }
        .tm115-player .tm115-lock.tm115-lock-hidden {
            opacity: 0 !important; pointer-events: none !important;
        }
        /* 锁定时保留控件尺寸，避免旧版因 display:none 测得宽度为零而切换成两行工具栏。 */
        .tm115-player.tm115-locked .tm115-native-controls,
        .tm115-player.tm115-legacy.tm115-locked :is(.operate-bar, .video-full-screen, .video-dialog-box, .video-toast, .bar-progress, .play-slide-opt) {
            visibility: hidden !important; pointer-events: none !important;
        }
        .tm115-player.tm115-legacy .operate-bar { width: 100% !important; box-sizing: border-box; }
        @media (max-width: 700px) {
            .tm115-player.tm115-legacy .vfs-name { max-width: 35%; overflow: hidden; }
        }
    ` : "";
    const promoImages = 'img[src*="/spotlight/imgload"], img[alt*="Web端右下角广告"], img[alt*="Web端头部广告"]';
    const popupSelector = '.ad-popup-container[id^="ad_popup_"]';
    if (values.ads) {
        style.textContent += `
            ${promoImages}, ${popupSelector}, .te115-ad-hidden,
            .video-pause-banner[rel="701adv"],
            #js_bottom_notification:has(#js_notification_detail),
            a[ref="href"][href*="115.com/77?f=ad1"],
            #js_common_mini-dialog:has(a[href*="115.com/77?f=ad1"]) {
                display: none !important;
            }
        `;
    }
    if (values.list) {
        style.textContent += `
            /* 只隐藏悬浮操作，保留原节点及其事件，供右键菜单调用。 */
            li[rel="item"][file_type] .file-opr,
            li[rel="item"][file_type] .file-name-wrap :is(.icon-star, .icon-remarks, .score-stars),
            .file-list-item > div.hidden.group-hover\\:flex.absolute.left-0.right-0,
            .file-list-item .te115-toolbar,
            .file-list-item [data-menu-action] {
                display: none !important;
            }
        `;
    }
    if (values.playlist) {
        style.textContent += `
            .tm115-playlist {
                position: relative; box-sizing: border-box; width: 100%; min-width: 0;
                height: auto !important; padding: 12px; margin: 12px 0;
                display: flex; flex-direction: column; gap: 10px;
            }
            .tm115-playlist-header { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
            .tm115-playlist-header strong { margin-right: auto; }
            .tm115-episodes { display: flex; flex-wrap: wrap; gap: 8px; overflow: auto; max-height: 220px; min-height: 0; }
            .tm115-playlist button {
                box-sizing: border-box; float: none; min-height: 36px;
                margin: 0; touch-action: manipulation;
            }
            .tm115-playlist button[aria-current="true"] { background: #e8f1ff !important; color: #1d4ed8 !important; border-color: #2777f8 !important; font-weight: 600; }
            .tm115-playlist button[data-pickcode] {
                flex: 0 1 auto; max-width: min(100%, 300px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .tm115-playlist button[data-pickcode] > span {
                min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .tm115-playlist button[hidden] { display: none !important; }
            .tm115-playlist[hidden] { display: none !important; }
        `;
    }
    (document.head || document.documentElement).append(style);

    const closedAds = new WeakSet();
    function closeAd(button) {
        if (!button || !button.isConnected || closedAds.has(button)) return;
        // 让站点自己移除关联遮罩并恢复弹窗状态，不能只隐藏广告内容。
        closedAds.add(button);
        button.click();
    }

    function refreshAds() {
        if (!values.ads) return;
        document.querySelectorAll('button[aria-label="关闭广告"]').forEach(button => {
            const container = button.parentElement;
            if (!container?.matches('div.relative.w-full.h-full') || !container.querySelector(promoImages)) return;
            closeAd(button);
            if (container.isConnected && !container.classList.contains('te115-ad-hidden')) {
                container.classList.add('te115-ad-hidden');
            }
        });
        document.querySelectorAll(popupSelector).forEach(popup => {
            // 只在已识别广告及其三层祖先内寻找关闭按钮，避免误关普通对话框。
            let container = popup;
            for (let depth = 0; container && depth <= 3; depth++, container = container.parentElement) {
                if (container === document.body || container === document.documentElement) break;
                const button = container.querySelector('button[aria-label="关闭"]');
                if (button) {
                    closeAd(button);
                    break;
                }
            }
        });
    }

    function refreshList() {
        if (!values.list) return;
        document.querySelectorAll(".file-list-item").forEach(row => {
            const content = row.querySelector(":scope > .flex.items-center");
            const toolbar = [...row.children].find(child => child !== content &&
                !child.matches('.file-list-item') && child.querySelector('[data-menu-action]')) ||
                row.querySelector(':scope > div.hidden.group-hover\\:flex.absolute.left-0.right-0');
            if (toolbar && !toolbar.classList.contains('te115-toolbar')) toolbar.classList.add('te115-toolbar');
        });
    }

    if (values.list) {
        // 文件行的悬浮操作会遮挡邻近内容，因此把缺少的操作合并进站点原生右键菜单。
        const documents = [document];
        try { if (window.parent !== window) documents.push(window.parent.document); } catch {}
        const labelOf = element => (element.getAttribute('data-menu-label')?.trim() ||
            element.closest('[data-menu-label]')?.getAttribute('data-menu-label')?.trim() ||
            element.innerText?.trim() || element.textContent.trim() || element.getAttribute('title') ||
            element.getAttribute('aria-label') || element.closest('[title]')?.getAttribute('title') || '').trim().replace(/\s+/g, ' ');
        const keyOf = element => labelOf(element).toLowerCase();
        const visible = element => element.getClientRects().length &&
            element.ownerDocument.defaultView.getComputedStyle(element).visibility === 'visible';
        const itemSelector = 'li[val], [role="menuitem"], a, button';
        const menuSelector = '.context-menu, [role="menu"], div.fixed[class~="z-[10000]"]:has(button.w-full.text-left)';
        const controlSelector = 'button, a, [role="button"]';
        const controlsOf = row => [...row.querySelectorAll('.te115-toolbar, .file-opr')].flatMap(toolbar =>
            [...toolbar.querySelectorAll(`[data-menu-action], ${controlSelector}`)].flatMap(wrapper => {
                const original = wrapper.querySelector(controlSelector) || (wrapper.matches(controlSelector) ? wrapper : null);
                if (!original) return [];
                // “更多”等入口只会再次打开菜单，不能把它们当作文件操作重复加入。
                const action = original.closest('[data-menu-action], [menu]');
                if (!action || !toolbar.contains(action) || original.closest('[menu_btn], [aria-haspopup="menu"]')) return [];
                for (let node = original; node && node !== toolbar; node = node.parentElement) {
                    if (node.hidden || node.style.display === 'none' ||
                        node.matches(':disabled, [aria-disabled="true"], .disabled')) return [];
                }
                return original;
            }));
        let frame;
        let inserted = [];
        let observer;
        let activeMenu;
        let invoking = false;
        const listeners = [];
        const listen = (target, type, handler) => {
            listeners.push([target, type, handler]);
            target.addEventListener(type, handler, true);
        };
        const cleanup = () => {
            cancelAnimationFrame(frame);
            observer?.disconnect();
            observer = null;
            inserted.forEach(({ item }) => item.remove());
            inserted = [];
            activeMenu = null;
        };
        for (const owner of documents) {
            listen(owner, 'contextmenu', event => {
                cleanup();
                const row = event.target.closest?.('.file-list-item, li[rel="item"][file_type]');
                if (!row) return;
                const augment = () => {
                    if (!row.isConnected) { cleanup(); return; }
                    // 新版关闭对话框后，右键菜单偶尔停留在隐藏测量状态，需要补齐定位和显示。
                    for (const candidate of document.querySelectorAll('div.fixed[class~="z-[10000]"]:has(button.w-full.text-left)')) {
                        if (candidate.style.visibility !== 'hidden' || !candidate.getClientRects().length) continue;
                        candidate.style.maxHeight = `${innerHeight - 16}px`;
                        const bounds = candidate.getBoundingClientRect();
                        candidate.style.left = `${Math.max(8, Math.min(event.clientX, innerWidth - bounds.width - 8))}px`;
                        candidate.style.top = `${Math.max(8, Math.min(event.clientY, innerHeight - bounds.height - 8))}px`;
                        candidate.style.visibility = 'visible';
                    }
                    // 只读取当前可见菜单项，隐藏项不参与去重，避免站点状态切换后漏加操作。
                    const nativeItems = menu => [...menu.querySelectorAll(itemSelector)].filter(item =>
                        visible(item) && !inserted.some(entry => entry.item.contains(item)) &&
                        item.closest(menuSelector) === menu &&
                        !item.parentElement.closest(itemSelector)?.closest(menuSelector));
                    const menu = documents.flatMap(doc => [...doc.querySelectorAll(menuSelector)])
                        .find(candidate => visible(candidate) && nativeItems(candidate).length);
                    if (!menu) return;
                    const items = nativeItems(menu);
                    const labels = new Set(items.map(item => keyOf(item.matches('li') ? item.querySelector('a') || item : item)));
                    const template = items.find(item => !item.matches(':disabled, [aria-disabled="true"], .disabled') &&
                        !item.querySelector('ul, [role="menu"]'));
                    if (!template) return;
                    activeMenu = menu;
                    // 暂停观察自己的 DOM 修改，防止循环触发；随后继续监听原生菜单重建。
                    observer.disconnect();
                    const previous = inserted;
                    inserted = [];
                    // 根据操作名称去重，不依赖固定的操作顺序，兼容 115 后续增加新按钮。
                    for (const original of controlsOf(row)) {
                        const label = labelOf(original);
                        if (!label || labels.has(keyOf(original))) continue;
                        const existing = previous.find(entry => entry.label === label && entry.menu === menu);
                        const item = existing?.item || template.cloneNode(true);
                        if (!existing) {
                            const labelNode = item.querySelector('[data-menu-label], .menu-label') ||
                                [...item.querySelectorAll('span')].find(node => node.textContent.trim() && !node.querySelector('svg, i, img')) ||
                                item.querySelector('a, button') || item;
                            const icon = original.querySelector('svg, i, img') || item.querySelector('svg, i, img');
                            const replacementIcon = icon?.cloneNode(true);
                            labelNode.textContent = label;
                            if (replacementIcon) {
                                const oldIcon = item.querySelector('svg, i, img');
                                if (oldIcon) oldIcon.replaceWith(replacementIcon);
                                else if (labelNode === item || labelNode.matches('a, button')) labelNode.prepend(replacementIcon);
                                else labelNode.before(replacementIcon);
                            }
                            for (const node of [item, ...item.querySelectorAll('*')]) {
                                for (const attr of [...node.attributes]) {
                                    if (/^on/i.test(attr.name) || (attr.name === 'href' && node.matches('a')) ||
                                        ['val', 'id', 'menu', 'data-menu-action', 'data-menu-label',
                                            'target', 'download', 'aria-controls', 'aria-expanded', 'aria-haspopup'].includes(attr.name)) {
                                        node.removeAttribute(attr.name);
                                    }
                                }
                                if (node.matches('button')) node.type = 'button';
                            }
                            if (!item.matches('li')) item.setAttribute('role', 'menuitem');
                        }
                        if (item.parentElement !== template.parentElement) template.parentElement.append(item);
                        inserted.push({ item, original, menu, row, label });
                        labels.add(keyOf(original));
                    }
                    previous.filter(entry => !inserted.some(next => next.item === entry.item)).forEach(entry => entry.item.remove());
                    if (inserted.length) {
                        const viewportHeight = menu.ownerDocument.defaultView.innerHeight;
                        if (menu.getBoundingClientRect().height > viewportHeight - 16) {
                            menu.style.maxHeight = `${viewportHeight - 16}px`;
                            menu.style.overflowY = 'auto';
                        }
                        const bounds = menu.getBoundingClientRect();
                        if (bounds.bottom > viewportHeight - 8) {
                            menu.style.top = `${Math.max(8, bounds.top - (bounds.bottom - viewportHeight + 8))}px`;
                        }
                    }
                    watch();
                };
                const schedule = () => {
                    cancelAnimationFrame(frame);
                    frame = requestAnimationFrame(augment);
                };
                const watch = () => documents.forEach(doc => observer.observe(doc.body, {
                    childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
                }));
                observer = new MutationObserver(schedule);
                watch();
                schedule();
            });
            // 在 window 捕获阶段处理新增项，避免外层页面先关闭菜单、导致点击丢失。
            for (const type of ['pointerdown', 'mousedown', 'click', 'keydown']) listen(owner.defaultView, type, event => {
                if (invoking) return;
                if (type === 'keydown') {
                    if (event.key === 'Escape') cleanup();
                    return;
                }
                const entry = inserted.find(({ item }) => item.contains(event.target));
                if (!entry) {
                    if (!activeMenu?.contains(event.target)) cleanup();
                    else if (type === 'click') queueMicrotask(cleanup);
                    return;
                }
                event.stopImmediatePropagation();
                if (type !== 'click') return;
                event.preventDefault();
                // 事件绑定在内部按钮而非 data-menu-action 容器上；行重绘后按名称重新找到按钮。
                const controls = controlsOf(entry.row);
                const original = controls.includes(entry.original) ? entry.original :
                    controls.find(control => keyOf(control) === entry.label.toLowerCase());
                cleanup();
                if (!original) {
                    console.warn('[115 enhancement] Toolbar action is no longer available:', entry.label);
                    return;
                }
                invoking = true;
                try {
                    if (entry.menu.id === 'js_float_content') {
                        // 调用旧版遮罩的关闭事件，同时释放透明输入拦截层，避免关闭后页面点不动。
                        const doc = entry.menu.ownerDocument;
                        const cover = doc.elementFromPoint(0, 0);
                        if (cover?.hasAttribute('onselectstart') && doc.defaultView.getComputedStyle(cover).opacity === '0') {
                            cover.dispatchEvent(new doc.defaultView.MouseEvent('mousedown', { bubbles: true }));
                        }
                    }
                    original.click();
                } finally { invoking = false; }
            });
        }
        // 旧版文件 iframe 会独立导航，离开时移除父页面监听，返回缓存页面时再恢复。
        window.addEventListener('pagehide', () => {
            cleanup();
            listeners.forEach(([target, type, handler]) => target.removeEventListener(type, handler, true));
        });
        window.addEventListener('pageshow', () => {
            listeners.forEach(([target, type, handler]) => target.addEventListener(type, handler, true));
        });
    }

    function enhancePlayer(video, root, legacy) {
        const abort = new AbortController();
        const listen = (target, type, callback, options = {}) => {
            target.addEventListener(type, callback, { ...options, signal: abort.signal });
        };
        root.classList.add("tm115-player");
        root.classList.toggle("tm115-legacy", legacy);
        const previousInline = video.getAttribute("playsinline");
        video.setAttribute("playsinline", "");
        let pageFullscreen = document.documentElement.classList.contains('video-fullscreen');
        let scrollPosition;
        const fullscreenObserver = new MutationObserver(() => {
            const fullscreen = document.documentElement.classList.contains('video-fullscreen');
            if (fullscreen === pageFullscreen) return;
            pageFullscreen = fullscreen;
            if (fullscreen) {
                scrollPosition = [window.scrollX, window.scrollY];
                window.scrollTo(0, 0);
            } else if (scrollPosition) {
                window.scrollTo(...scrollPosition);
                scrollPosition = null;
            }
        });
        fullscreenObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        let viewportMeta;
        let previousViewport;
        let createdViewport = false;
        if (legacy && coarse && window === window.top) {
            viewportMeta = document.querySelector('meta[name="viewport"]');
            previousViewport = viewportMeta?.getAttribute("content");
            if (!viewportMeta) {
                viewportMeta = document.createElement("meta");
                viewportMeta.name = "viewport";
                document.head.append(viewportMeta);
                createdViewport = true;
            }
            // 旧版缺少合适的 viewport，页面缩放和视频像素尺寸会脱节。
            viewportMeta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
        }

        let hideTimer;
        let prompt;
        const zoomButtons = legacy ? [...root.querySelectorAll('[btn="zoom"]')].map(button => [button, button.classList.contains("current")]) : [];
        let gesture;
        let suppressClickUntil = 0;
        const interactive = 'a, button, input, select, textarea, summary, [role="button"], [role="slider"], [contenteditable="true"], .operate-bar, .video-dialog-box, .video-full-screen, .bar-progress';
        // 锁定只阻止播放器交互，不暂停视频；解锁按钮始终保留可操作状态。
        let locked = false;
        let lockTimer;
        const lockButton = document.createElement("button");
        const nativeButton = root.querySelector(legacy ? '.btn-opt, .operate-bar button' :
            'button[aria-label="进入全屏"], button[aria-label="退出全屏"], button[aria-label*="fullscreen" i], button');
        lockButton.className = nativeButton?.getAttribute("class") || (legacy ? "btn-opt" : "");
        lockButton.classList.add("tm115-lock");
        lockButton.type = "button";
        lockButton.setAttribute("aria-label", "锁定");
        lockButton.setAttribute("aria-pressed", "false");
        // 复用 115 官方白色锁图标：未锁定显示开锁，已锁定显示闭锁，表达当前状态。
        const lockSprite = "https://cdnres.115.com/site/static/style_v10.0/common/images/icon_file_operate.svg?_vh=4b1e466_92";
        const lockIcon = document.createElement(legacy ? "i" : "img");
        lockIcon.setAttribute("aria-hidden", "true");
        if (legacy) lockIcon.className = "icon-operate ifo-unencrypt";
        else {
            lockIcon.src = lockSprite;
            lockIcon.alt = "";
            lockIcon.draggable = false;
        }
        lockButton.append(lockIcon);
        root.append(lockButton);
        if (legacy) lockIcon.style.setProperty("background-image", `url("${lockSprite}")`, "important");

        const nativeControls = new Set();
        function markNativeControls() {
            const controls = new Set();
            for (const button of root.querySelectorAll('button[aria-label], [aria-controls], [role="slider"]')) {
                if (lockButton.contains(button) || button.contains(lockButton) || button.matches("video") || button.querySelector("video")) continue;
                let node = button;
                // 只标记控制层，不能把包含视频或解锁按钮的容器一起隐藏。
                while (node.parentElement && node.parentElement !== root &&
                    !node.parentElement.querySelector("video") && !node.parentElement.contains(lockButton)) {
                    node = node.parentElement;
                }
                controls.add(node);
            }
            for (const node of nativeControls) {
                if (controls.has(node)) continue;
                node.classList.remove("tm115-native-controls");
                nativeControls.delete(node);
            }
            for (const node of controls) {
                if (node.classList.contains("tm115-native-controls")) continue;
                node.classList.add("tm115-native-controls");
                nativeControls.add(node);
            }
        }
        let controlsObserver;
        if (!legacy) {
            markNativeControls();
            controlsObserver = new MutationObserver(markNativeControls);
            controlsObserver.observe(root, {
                childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "aria-controls", "role", "class"]
            });
        }

        function revealLock() {
            clearTimeout(lockTimer);
            lockButton.classList.remove("tm115-lock-hidden");
            lockTimer = setTimeout(() => lockButton.classList.add("tm115-lock-hidden"), 3000);
        }

        // 在手势监听之前注册 window 捕获拦截，锁定时阻止事件继续传入播放器。
        for (const type of ["touchstart", "touchmove", "touchend", "touchcancel",
            "pointerdown", "pointermove", "pointerup", "pointercancel",
            "mousedown", "mousemove", "mouseup", "click", "dblclick", "auxclick", "contextmenu", "wheel"]) {
            listen(window, type, event => {
                if (!root.contains(event.target)) return;
                revealLock();
                if (!locked || lockButton.contains(event.target)) return;
                if (event.cancelable) event.preventDefault();
                event.stopImmediatePropagation();
            }, { capture: true, passive: false });
        }
        listen(window, "click", event => {
            if (!lockButton.contains(event.target)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            finish();
            locked = !locked;
            root.classList.toggle("tm115-locked", locked);
            lockButton.setAttribute("aria-label", locked ? "解锁" : "锁定");
            lockButton.setAttribute("aria-pressed", String(locked));
            if (legacy) lockIcon.className = `icon-operate ${locked ? "ifo-encrypt" : "ifo-unencrypt"}`;
            revealLock();
        }, { capture: true });
        for (const type of ["keydown", "keypress", "keyup"]) {
            listen(window, type, event => {
                if (event.key === "Escape") return;
                if (lockButton.contains(event.target) && ["Enter", " ", "Spacebar"].includes(event.key)) {
                    // 保留按钮的键盘激活默认行为，同时阻止原生播放快捷键抢占解锁操作。
                    revealLock();
                    event.stopImmediatePropagation();
                    return;
                }
                if (!locked || event.key === "Tab") return;
                revealLock();
                if (event.cancelable) event.preventDefault();
                event.stopImmediatePropagation();
            }, { capture: true });
        }
        listen(root, "focusin", revealLock);
        listen(root, "keydown", revealLock);
        revealLock();

        function show(text, timeout = 0) {
            clearTimeout(hideTimer);
            if (!legacy) return;
            if (!prompt) {
                const element = root.querySelector('[rel="next_tips"].video-prompt');
                if (!element) return;
                // 复用原生提示中的文本节点，不替换原有结构或另建提示浮层。
                const node = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
                if (!node) return;
                prompt = {
                    element, node, text: node.data, hadStyle: element.hasAttribute("style"),
                    display: element.style.getPropertyValue("display"),
                    priority: element.style.getPropertyPriority("display")
                };
            }
            prompt.node.data = text;
            prompt.feedback = text;
            prompt.element.style.setProperty("display", "block");
            if (timeout) hideTimer = setTimeout(restorePrompt, timeout);
        }

        function restorePrompt() {
            clearTimeout(hideTimer);
            if (!prompt) return;
            const { element, node, text, feedback, display, priority, hadStyle } = prompt;
            // 只还原仍由脚本控制的内容，不覆盖原生播放器后来写入的提示或样式。
            if (node.data === feedback) node.data = text;
            if (element.style.getPropertyValue("display") === "block" && !element.style.getPropertyPriority("display")) {
                if (display) element.style.setProperty("display", display, priority);
                else element.style.removeProperty("display");
            }
            if (!hadStyle && !element.getAttribute("style")) element.removeAttribute("style");
            prompt = null;
        }

        function fit(mode, scale = '1') {
            if (legacy) {
                const fraction = +scale;
                root.style.setProperty('--tm115-scale', `${fraction > 0 && fraction < Infinity ? fraction * 100 : 100}%`);
                root.classList.toggle("tm115-cover", mode === "cover");
                for (const button of root.querySelectorAll('[btn="zoom"]')) {
                    button.classList.toggle("current", button.getAttribute("zoom") === (mode === "cover" ? "full" : scale));
                }
            }
        }

        listen(root, "click", event => {
            if (Date.now() < suppressClickUntil && event.detail !== 0) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            if (!legacy) return;
            const zoom = event.target.closest('[btn="zoom"]');
            if (zoom) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const value = zoom.getAttribute("zoom");
                fit(value === "full" ? "cover" : "contain", value === 'full' ? '1' : value);
            }
        }, { capture: true });

        const time = seconds => {
            seconds = Math.max(0, Math.floor(seconds));
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor(seconds % 3600 / 60);
            return `${hours ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
        };
        // 将目标时间限制到媒体允许跳转的区间；seekable 不等同于已经缓冲的范围。
        function seekTarget(target) {
            // 旧站会覆盖 window.Number，因此不能依赖 Number.isFinite 等静态方法。
            if (!(video.duration > 0 && video.duration < Infinity) || !video.seekable.length) return null;
            let nearest = null;
            let distance = Infinity;
            for (let i = 0; i < video.seekable.length; i++) {
                const start = video.seekable.start(i);
                const end = Math.min(video.duration, video.seekable.end(i));
                const candidate = Math.max(start, Math.min(end, target));
                if (Math.abs(candidate - target) < distance) {
                    nearest = candidate;
                    distance = Math.abs(candidate - target);
                }
            }
            return nearest;
        }

        // 统一结束触摸/鼠标手势：恢复临时倍速，并按需提交预览中的跳转位置。
        function finish(commit = false) {
            if (!gesture) return;
            const current = gesture;
            gesture = null;
            clearTimeout(current.timer);
            if (current.mode === "hold") {
                if (video.playbackRate === current.boostRate) video.playbackRate = current.rate;
                show(`已恢复 ${video.playbackRate} 倍速`, 800);
            }
            if (current.mode === "seek") {
                const target = commit ? seekTarget(current.target) : null;
                if (target !== null) {
                    try {
                        video.currentTime = target;
                        show(`跳转至 ${time(target)}`, 1000);
                    } catch {
                        show("当前视频暂时无法跳转", 1200);
                    }
                } else {
                    restorePrompt();
                }
            }
            if (current.mode === "seek" || current.mode === "hold") suppressClickUntil = Date.now() + 700;
        }

        // 长按只在播放状态下临时提速，松开后由 finish 恢复原速度。
        function armHold(current) {
            current.timer = setTimeout(() => {
                if (gesture !== current || current.mode !== "pending" || video.paused || video.ended || video.readyState < 2) return;
                current.mode = "hold";
                current.rate = video.playbackRate;
                // 使用配置倍数，但不把当前已经更快的播放速度降下来。
                current.boostRate = Math.max(values.holdRate, current.rate);
                video.playbackRate = current.boostRate;
                show(`长按 ${video.playbackRate} 倍速`);
            }, 450);
        }

        listen(root, "touchstart", event => {
            if (event.touches.length !== 1) { finish(); return; }
            if (event.target.closest(interactive)) return;
            const point = event.touches[0];
            const rect = root.getBoundingClientRect();
            // 为边缘按钮、底部进度条和系统边缘手势留出区域，避免抢占原生交互。
            if (point.clientX < rect.left + 24 || point.clientX > rect.right - 56 ||
                point.clientY < rect.top + 56 || point.clientY > rect.bottom - 80) return;
            finish();
            gesture = {
                id: point.identifier, x: point.clientX, y: point.clientY, width: rect.width,
                start: video.currentTime, target: video.currentTime, mode: "pending", rate: video.playbackRate
            };
            armHold(gesture);
            // 起手时不阻止默认行为，保留单击和双指缩放；确认横向拖动后才接管。
            event.stopPropagation();
        }, { capture: true, passive: true });

        listen(root, "touchmove", event => {
            if (!gesture) return;
            if (!event.cancelable) { finish(); return; }
            if (event.touches.length !== 1) { finish(); return; }
            const point = [...event.touches].find(touch => touch.identifier === gesture.id);
            if (!point) { finish(); return; }
            const dx = point.clientX - gesture.x;
            const dy = point.clientY - gesture.y;
            if (gesture.mode === "pending" && Math.hypot(dx, dy) > 12) {
                clearTimeout(gesture.timer);
                if (Math.abs(dx) <= Math.abs(dy) * 1.2 || seekTarget(gesture.start) === null) {
                    finish();
                    return;
                }
                gesture.mode = "seek";
            }
            if (gesture.mode === "seek") {
                gesture.target = seekTarget(gesture.start + Math.round(dx / gesture.width * 120));
                if (gesture.target === null) { finish(); return; }
                const delta = Math.round(gesture.target - gesture.start);
                show(`${delta >= 0 ? "+" : ""}${delta} 秒  ${time(gesture.target)} / ${time(video.duration)}`);
            }
            if (gesture.mode !== "pending") {
                if (event.cancelable) event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, { capture: true, passive: false });

        listen(root, "touchend", event => {
            if (!gesture) return;
            const handled = gesture.mode !== "pending";
            finish(event.touches.length === 0);
            if (handled) {
                if (event.cancelable) event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, { capture: true, passive: false });
        listen(root, "touchcancel", () => finish(), { capture: true });
        listen(root, "mousedown", event => {
            if (event.button !== 0 || event.sourceCapabilities?.firesTouchEvents ||
                event.target.closest(interactive) || Date.now() < suppressClickUntil) return;
            const rect = root.getBoundingClientRect();
            if (event.clientX < rect.left + 24 || event.clientX > rect.right - 56 ||
                event.clientY < rect.top + 56 || event.clientY > rect.bottom - 80) return;
            finish();
            const current = gesture = {
                mode: "pending", mouse: true, x: event.clientX, y: event.clientY, width: rect.width,
                start: video.currentTime, target: video.currentTime
            };
            armHold(current);
        }, { capture: true });
        listen(window, "mousemove", event => {
            if (!gesture?.mouse) return;
            if (!(event.buttons & 1)) { finish(); return; }
            const current = gesture;
            const dx = event.clientX - current.x;
            const dy = event.clientY - current.y;
            if (current.mode === "pending" && Math.hypot(dx, dy) > 12) {
                clearTimeout(current.timer);
                if (Math.abs(dx) <= Math.abs(dy) * 1.2 || seekTarget(current.start) === null) {
                    finish();
                    return;
                }
                current.mode = "seek";
            }
            if (current.mode === "seek") {
                current.target = seekTarget(current.start + Math.round(dx / current.width * 120));
                if (current.target === null) { finish(); return; }
                const delta = Math.round(current.target - current.start);
                show(`${delta >= 0 ? "+" : ""}${delta} 秒  ${time(current.target)} / ${time(video.duration)}`);
            }
            if (current.mode !== "pending") {
                if (event.cancelable) event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, { capture: true });
        listen(window, "mouseup", event => {
            if (!gesture?.mouse || event.button !== 0) return;
            const handled = gesture.mode !== "pending";
            finish(true);
            if (handled) {
                if (event.cancelable) event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, { capture: true });
        listen(document, "touchstart", event => {
            if (gesture && event.touches.length > 1) finish();
        }, { capture: true, passive: true });
        listen(root, "contextmenu", event => {
            if (gesture && !event.target.closest(interactive)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, { capture: true });
        for (const event of ["pause", "ended", "emptied", "error"]) listen(video, event, () => finish());
        listen(window, "blur", () => finish());
        listen(window, "pagehide", () => finish());
        listen(document, "visibilitychange", () => { if (document.hidden) finish(); });
        listen(document, "keydown", event => {
            if (event.key === "Escape") finish();
        });
        fit("contain");

        return {
            root,
            destroy() {
                finish();
                clearTimeout(hideTimer);
                clearTimeout(lockTimer);
                fullscreenObserver.disconnect();
                controlsObserver?.disconnect();
                for (const node of nativeControls) node.classList.remove("tm115-native-controls");
                lockButton.remove();
                restorePrompt();
                abort.abort();
                for (const [button, current] of zoomButtons) button.classList.toggle("current", current);
                root.classList.remove("tm115-player", "tm115-legacy", "tm115-cover", "tm115-locked");
                root.style.removeProperty('--tm115-scale');
                if (video.getAttribute("playsinline") === "") {
                    if (previousInline == null) video.removeAttribute("playsinline");
                    else video.setAttribute("playsinline", previousInline);
                }
                if (viewportMeta?.content === "width=device-width, initial-scale=1, viewport-fit=cover") {
                    if (createdViewport) viewportMeta.remove();
                    else if (previousViewport == null) viewportMeta.removeAttribute("content");
                    else viewportMeta.setAttribute("content", previousViewport);
                }
            }
        };
    }

    function refreshPlayers() {
        if (!values.player) return;
        for (const [video, player] of players) {
            if (!video.isConnected || !player.root.contains(video)) {
                player.destroy();
                players.delete(video);
            }
        }
        for (const video of document.querySelectorAll("video")) {
            if (players.has(video)) continue;
            const legacy = video.matches("#js-video") && video.closest("#js-video_box");
            const modern = location.pathname.startsWith("/players/video/") && video.parentElement;
            const root = legacy || modern;
            if (root) players.set(video, enhancePlayer(video, root, Boolean(legacy)));
        }
    }

    const playlists = new Map();
    // 在播放器下方显示当前目录的视频，按钮跳转沿用 115 的播放 URL 规则。
    function enhancePlaylist(root, legacy, pickcode) {
        const abort = new AbortController();
        const panel = document.createElement("section");
        panel.className = legacy ? "tm115-playlist video-title" : "tm115-playlist bg-white";
        panel.setAttribute("aria-label", "视频列表");
        panel.innerHTML = `<div class="tm115-playlist-header"><strong>视频列表</strong>
            <span class="tm115-playlist-status" role="status">正在读取同目录视频...</span>
            <button type="button" data-reload>刷新</button><button type="button" data-more hidden>加载更多</button>
            </div><div class="tm115-episodes"></div>`;
        const anchor = legacy ? root.closest(".video-container") || root :
            root.parentElement?.matches(".aspect-video") ? root.parentElement : root;
        anchor.after(panel);
        const status = panel.querySelector(".tm115-playlist-status");
        const episodes = panel.querySelector(".tm115-episodes");
        const reload = panel.querySelector("[data-reload]");
        const more = panel.querySelector("[data-more]");
        const nativeButton = legacy ? document.querySelector('.vdb-action .button.btn-gray') :
            [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '下载');
        const buttonClass = nativeButton?.className || (legacy ? 'button btn-gray' : '');
        reload.className = more.className = buttonClass;
        // 旧版按钮父级字号为零，文字必须放入 span 才能沿用原生样式正常显示。
        function setButtonText(button, text) {
            const span = document.createElement('span');
            span.className = nativeButton?.querySelector('span')?.className || '';
            span.textContent = text;
            button.replaceChildren(span);
        }
        setButtonText(reload, '刷新');
        setButtonText(more, '加载更多');
        const pageURL = new URL(location.href);
        const files = new Map();
        let cid;
        let currentFileId;
        let offset = 0;
        let total = 0;
        let busy = false;
        let retry = false;

        function layout() {
            // 全屏只隐藏附加列表，不接管原生播放器的全屏布局。
            panel.hidden = Boolean(document.fullscreenElement ||
                document.documentElement.classList.contains("video-fullscreen") ||
                root.closest('[class~="fixed"][class~="inset-0"]'));
        }
        const resize = new ResizeObserver(layout);
        resize.observe(root);
        const mutations = new MutationObserver(layout);
        mutations.observe(root, { attributes: true, attributeFilter: ["class"] });
        mutations.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        for (const event of ["resize", "scroll"]) {
            window.addEventListener(event, layout, { passive: true, signal: abort.signal });
            window.visualViewport?.addEventListener(event, layout, { passive: true, signal: abort.signal });
        }
        document.addEventListener("fullscreenchange", layout, { signal: abort.signal });

        function addFile(file) {
            const code = String(file.pc || "");
            if (!/^[a-z0-9]+$/i.test(code) || files.has(code)) return;
            files.set(code, file);
            const button = document.createElement("button");
            button.className = buttonClass;
            button.type = "button";
            button.dataset.pickcode = code;
            const name = String(file.n || code);
            setButtonText(button, `${String(files.size).padStart(2, "0")}. ${name}`);
            button.title = name;
            button.setAttribute("aria-label", `播放 ${name}`);
            // 旧版链接的 pickcode 可能是别名，额外通过 file_id 识别当前视频。
            const current = code === pickcode || (currentFileId && String(file.fid) === currentFileId);
            if (current) button.setAttribute("aria-current", "true");
            button.addEventListener("click", () => {
                if (current) return;
                // 重新构造播放地址，避免沿用旧 fid 等参数而跳回上一视频或产生 404。
                const url = new URL(legacy ? "/" : `/players/video/${encodeURIComponent(code)}`, location.origin);
                if (legacy) {
                    if (!/(^|\.)115vod\.com$/.test(location.hostname)) url.searchParams.set("ct", "play");
                    url.searchParams.set("pickcode", code);
                    url.searchParams.set("hls", "1");
                } else {
                    url.searchParams.set("name", name);
                    if (file.fid) url.searchParams.set("fid", String(file.fid));
                }
                for (const key of ["sort_field", "sort_asc", "share_id"]) {
                    if (pageURL.searchParams.has(key)) url.searchParams.set(key, pageURL.searchParams.get(key));
                }
                location.assign(url.href);
            }, { signal: abort.signal });
            episodes.append(button);
        }

        // 按域名选择接口：115vod 使用同源 /webapi，视频信息请求还需 share_id/local 参数。
        async function request(path, params) {
            const vod = /(^|\.)115vod\.com$/.test(location.hostname);
            const url = new URL(vod ? `/webapi${path}` : path, vod ? location.origin : "https://webapi.115.com");
            if (vod && path === "/files/video") {
                params = { ...params, share_id: pageURL.searchParams.get("share_id") || "0", local: "1" };
            }
            url.search = new URLSearchParams(params);
            // 同时响应单次请求超时与列表销毁，防止切换视频后旧请求继续更新界面。
            const timeout = new AbortController();
            const cancel = () => timeout.abort();
            abort.signal.addEventListener("abort", cancel, { once: true });
            const timer = setTimeout(cancel, 15000);
            try {
                const response = await fetch(url, { credentials: "include", signal: timeout.signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (!data.state) throw new Error("接口未返回有效列表");
                return data;
            } finally {
                clearTimeout(timer);
                abort.signal.removeEventListener("abort", cancel);
            }
        }

        // 列表按 115 接口分页读取，使用 Map 按 pickcode 去重。
        async function load(reset = false) {
            if (busy || abort.signal.aborted) return;
            busy = true;
            reload.disabled = more.disabled = true;
            status.textContent = "正在读取同目录视频...";
            try {
                if (reset) {
                    cid = null;
                    offset = 0;
                    files.clear();
                    episodes.replaceChildren();
                    more.hidden = true;
                }
                if (cid == null) {
                    const info = await request("/files/video", { pickcode });
                    if (abort.signal.aborted) return;
                    if (info.parent_id == null || !/^\d+$/.test(String(info.parent_id))) throw new Error("找不到视频目录");
                    cid = String(info.parent_id);
                    currentFileId = info.file_id == null ? null : String(info.file_id);
                }
                const allowedSort = ["file_name", "file_size", "user_ptime", "user_utime", "file_type"];
                const sort = pageURL.searchParams.get("sort_field");
                const data = await request("/files", {
                    aid: "1", cid, offset: String(offset), limit: "115", show_dir: "0", type: "4", format: "json",
                    o: allowedSort.includes(sort) ? sort : "file_name",
                    asc: pageURL.searchParams.get("sort_asc") === "0" ? "0" : "1", natsort: "1"
                });
                if (abort.signal.aborted) return;
                if (!Array.isArray(data.data)) throw new Error("视频列表格式无效");
                data.data.forEach(addFile);
                offset += data.data.length;
                total = +data.count || offset;
                retry = false;
                more.hidden = offset >= total || data.data.length === 0;
                status.textContent = files.size ? `已显示 ${files.size} / ${total} 个视频` : "当前目录没有可播放的视频";
                setButtonText(more, "加载更多");
            } catch {
                if (abort.signal.aborted) return;
                retry = true;
                status.textContent = "视频列表读取失败，请确认登录状态后重试";
                more.hidden = false;
                setButtonText(more, "重试");
            } finally {
                busy = false;
                reload.disabled = more.disabled = false;
            }
        }
        reload.addEventListener("click", () => load(true), { signal: abort.signal });
        more.addEventListener("click", () => load(retry && cid == null), { signal: abort.signal });
        layout();
        load();
        return {
            root, pickcode, panel,
            destroy() {
                abort.abort();
                resize.disconnect();
                mutations.disconnect();
                panel.remove();
            }
        };
    }

    // 播放器替换或地址变化时销毁旧列表，避免旧视频的按钮残留在新播放器下方。
    function refreshPlaylists() {
        if (!values.playlist) return;
        const url = new URL(location.href);
        const modernCode = url.pathname.match(/^\/players\/video\/([a-z0-9]+)\/?$/i)?.[1];
        const pickcode = modernCode || url.searchParams.get("pickcode");
        for (const [video, list] of playlists) {
            if (!video.isConnected || !list.root.contains(video) || !list.panel.isConnected || list.pickcode !== pickcode) {
                list.destroy();
                playlists.delete(video);
            }
        }
        if (!pickcode || !/^[a-z0-9]+$/i.test(pickcode)) return;
        for (const video of document.querySelectorAll("video")) {
            if (playlists.has(video)) continue;
            const legacy = video.matches("#js-video") && video.closest("#js-video_box");
            const root = legacy || (modernCode && video.parentElement);
            if (root) playlists.set(video, enhancePlaylist(root, Boolean(legacy), pickcode));
        }
    }

    function refresh() {
        refreshAds();
        refreshList();
        refreshPlayers();
        refreshPlaylists();
    }

    // 115 会异步重建列表和播放器，使用 RAF 合并同一帧内的多次 DOM 变化。
    let queued = false;
    new MutationObserver(records => {
        if (records.every(record => record.target instanceof Element &&
            record.target.closest(".tm115-playlist"))) return;
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            refresh();
        });
    }).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("popstate", refresh);
    refresh();
})();
