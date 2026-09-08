// ==UserScript==
// @name         115 增强
// @namespace    115-enhancement
// @version      1.2.2
// @description  提供一些115的优化增强项
// @match        *://115.com/*
// @match        *://*.115.com/*
// @match        *://115vod.com/*
// @match        *://www.115vod.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      proapi.115.com
// @connect      webapi.115.com
// @license      MIT
// ==/UserScript==

(function start() {
    "use strict";

    if (!/(^|\.)115(?:vod)?\.com$/.test(location.hostname)) return;
    function getValue(key, fallback) {
        return typeof GM_getValue === "function" ? GM_getValue(key, fallback) : fallback;
    }

    function isMobileDevice() {
        const ua = navigator.userAgent;
        // 桌面 UA 一律按桌面处理，包括平板的“请求桌面网站”；触摸能力和宽度不参与识别。
        return /Android|iPhone|iPad|iPod/i.test(ua);
    }

    const mobileEnabled = isMobileDevice() && getValue("tm115-mobile-enabled", true);
    const MOBILE_HOME = "https://115.com/storage/allfiles";
    const MOBILE_LOGIN = "https://aq.115.com/index/login";

    function isMobileContext() {
        return mobileEnabled && isMobileDevice();
    }

    function isMobileDashboard() {
        return isMobileContext() && window === window.top && location.hostname === "115.com" &&
            Boolean(document.querySelector('aside.container-leftside'));
    }

    function isMobileLoginPage() {
        return isMobileContext() && window === window.top && location.hostname === "aq.115.com" && location.pathname === "/index/login";
    }

    function getModernFileURL(url) {
        if (url.hostname !== "115.com" || url.pathname !== "/" || url.searchParams.has("ct") ||
            !(url.searchParams.get("mode") === "wangpan" || url.searchParams.has("cid") || url.searchParams.has("old"))) return null;
        const target = new URL(MOBILE_HOME);
        const cid = new URLSearchParams(url.hash.slice(1)).get("cid") || url.searchParams.get("cid");
        if (cid && /^\d+$/.test(cid)) target.searchParams.set("cid", cid);
        return target.href;
    }
    function getMobileEntryTarget(url) {
        if ((url.hostname === "w.115.com" && url.pathname === "/") ||
            (url.hostname === "115.com" && url.pathname === "/" && url.searchParams.has("goto"))) {
            // 新版鉴权失败会返回官网；手机官网只有下载入口，改用官方登录页。
            return MOBILE_LOGIN;
        } else if (url.hostname === "m.115.com" && url.pathname === "/") {
            try {
                const key = "tm115-mobile-return";
                if (!sessionStorage.getItem(key)) {
                    sessionStorage.setItem(key, "1");
                    return MOBILE_HOME;
                }
            } catch {}
            return MOBILE_LOGIN;
        }
        return getModernFileURL(url) ||
            (url.hostname === "115.com" && url.pathname === "/" && !url.search ? MOBILE_HOME : null);
    }

    function redirectMobileEntry() {
        if (!isMobileContext() || window !== window.top) return false;
        const target = getMobileEntryTarget(new URL(location.href));
        if (!target) return false;
        location.replace(target);
        return true;
    }

    if (redirectMobileEntry()) return;
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
        return;
    }

    if (document.getElementById("tm115-player-style")) return;

    // <include:../shared/dialog.js>
    // <include:../shared/settings-dialog.js>

    // 功能开关与播放参数分别保存，设置窗口只修改发生变化的项目。
    const config = {
        mobile: { group: "网页适配", key: "tm115-mobile-enabled", label: "手机 / 平板网页适配" },
        player: { group: "播放器", key: "tm115-player-enabled", label: "播放器功能优化" },
        playlist: { group: "播放器", key: "tm115-playlist-enabled", label: "播放器页面显示视频列表" },
        subtitleScale: { group: "播放器", key: "tm115-subtitle-scale-enabled", label: "字幕随播放器缩放（需开启播放器优化）", defaultValue: true },
        holdRate: {
            group: "播放器",
            key: "tm115-hold-rate",
            label: "长按快进倍数（1-8 倍，需开启播放器优化）",
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
        download: { group: "其他功能", key: "tm115-download-enabled", label: "下载按钮替换（支持大文件）", defaultValue: true },
        list: { group: "其他功能", key: "tm115-list-enabled", label: "合并列表悬浮按钮" },
        ads: { group: "其他功能", key: "tm115-ads-enabled", label: "去除广告" },
    };
    function setValue(key, value) {
        if (typeof GM_setValue === "function") GM_setValue(key, value);
    }

    // 数值参数单独读取和校验，避免被当作开关转换成布尔值；异常存储值使用默认值。
    function readSettings() {
        return Object.fromEntries(Object.entries(config).map(([name, item]) => {
            const value = getValue(item.key, item.defaultValue ?? true);
            return [name, item.type === "number"
                ? (item.validValue(value) ? item.defaultValue : +value)
                : Boolean(value)];
        }));
    }

    async function openSettings() {
        const currentValues = readSettings();
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
    }

    function registerSettingsMenu() {
        if (window === window.top && typeof GM_registerMenuCommand === "function") {
            GM_registerMenuCommand("115 增强设置", openSettings);
        }
    }

    const values = readSettings();
    const players = new Map();
    let fullscreenOrientation;
    const promoImages = 'img[src*="/spotlight/imgload"], img[alt*="Web端右下角广告"], img[alt*="Web端头部广告"]';
    const popupSelector = '.ad-popup-container[id^="ad_popup_"]';
    const style = createBaseStyle();

    // 样式集中注入：主要修正布局，并补充锁定图标和当前选集的对比度。
    function createBaseStyle() {
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
            margin: 0 !important; touch-action: pinch-zoom;
        }
        .tm115-player .tm115-gesture-feedback {
            position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
            z-index: 100; max-width: calc(100% - 24px); padding: 8px 12px;
            border-radius: 6px; background: #000b; color: #fff; font: 14px/1.4 sans-serif;
            text-align: center; pointer-events: none;
        }
        .tm115-player .tm115-gesture-feedback[hidden] { display: none !important; }
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
        .tm115-player.tm115-controls-hidden > .absolute.inset-x-0.bottom-0:has(> [class~="group/progress"]) {
            visibility: hidden !important; pointer-events: none !important;
        }
        /* 新版字幕固定留了 96px；只在控制栏显示时避让，桌面和手机共用，旧版不改。 */
        .tm115-player:not(.tm115-legacy) > .absolute.left-0.right-0.bottom-24.pointer-events-none {
            bottom: max(12px, env(safe-area-inset-bottom)) !important;
        }
        .tm115-player:not(.tm115-legacy, .tm115-controls-hidden, .tm115-locked):has(> .absolute.inset-x-0.bottom-0 > [class~="group/progress"]) > .absolute.left-0.right-0.bottom-24.pointer-events-none {
            bottom: 88px !important;
        }
        .tm115-player.tm115-player-mobile:not(.tm115-controls-hidden, .tm115-locked):has(> .absolute.inset-x-0.bottom-0 > [class~="group/progress"]) > .absolute.left-0.right-0.bottom-24.pointer-events-none {
            bottom: 56px !important;
        }
        @media (max-width: 700px) {
            .tm115-player.tm115-legacy .vfs-name { max-width: 35%; overflow: hidden; }
        }
        ` : "";
        if (values.player && values.subtitleScale) {
            const caption = '.tm115-player:not(.tm115-legacy) > .absolute.left-0.right-0.pointer-events-none';
            style.textContent += `
            .tm115-player.tm115-legacy [rel="subtitle_show"] > p {
                transform: scale(var(--tm115-subtitle-scale, 1)); transform-origin: center bottom;
                width: calc(100% / var(--tm115-subtitle-scale, 1)); max-width: none;
                margin-inline: calc((100% - 100% / var(--tm115-subtitle-scale, 1)) / 2);
                box-sizing: border-box; overflow-wrap: anywhere;
            }
            ${caption} > .whitespace-pre-line {
                transform: scale(var(--tm115-subtitle-scale, 1)); transform-origin: center bottom;
                min-width: 0; flex-shrink: 0; max-width: calc(80% / var(--tm115-subtitle-scale, 1)) !important;
                box-sizing: border-box; overflow-wrap: anywhere;
            }
            ${caption}.top-16 > .whitespace-pre-line { transform-origin: center top; }
            ${caption}[class~="top-1/2"] > .whitespace-pre-line { transform-origin: center; }
            `;
        }
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
            :is(
                li[rel="item"][file_type] .file-opr,
                li[rel="item"][file_type] .file-name-wrap :is(.icon-star, .icon-remarks, .score-stars),
                .file-list-item > div.hidden.group-hover\\:flex.absolute.left-0.right-0,
                .file-list-item [data-menu-action]) {
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
        return style;
    }

    function setViewport() {
        let meta = document.querySelector('meta[name="viewport"]');
        const previousContent = meta?.getAttribute("content");
        const created = !meta;
        if (!meta) {
            meta = document.createElement("meta");
            meta.name = "viewport";
            document.head.append(meta);
        }
        if (!mobileViewport) mobileViewport = { element: meta, created, content: previousContent };
        const content = "width=device-width, initial-scale=1, viewport-fit=cover";
        if (meta.content !== content) meta.content = content;
        return meta;
    }

    const compactViewport = matchMedia("(max-width: 1024px)");
    function isCompactViewport() {
        return compactViewport.matches;
    }
    let navigation;
    let navigationToggle;
    let navigationLabel;
    let navigationInteracted = false;
    let navigationChannel;
    let account;
    let accountTrigger;
    let accountExpanded;
    let accountOpen = false;
    let dispatchingAccount = false;
    let mobileViewport;
    let loginActions;
    let mobileContent;
    function setAccountOpen(open) {
        if (accountOpen === open) return;
        accountOpen = open;
        document.documentElement.classList.toggle("tm115-account-open", open);
        accountTrigger?.setAttribute("aria-expanded", String(open));
        if (!accountTrigger?.isConnected) return;
        // 复用 React 的原生进入/离开事件；手机的自动悬停事件由下方监听器隔离。
        dispatchingAccount = true;
        try {
            accountTrigger.dispatchEvent(new MouseEvent(open ? "mouseover" : "mouseout", {
                bubbles: true, relatedTarget: open ? null : document.body, view: window,
            }));
        } finally { dispatchingAccount = false; }
    }
    function closeNavigation() {
        if (document.documentElement.matches(".tm115-mobile.tm115-nav-open")) {
            navigationToggle?.querySelector("button")?.click();
        }
    }
    function addMobileStyles() {
        const content = '.tm115-mobile .tm115-content';
        const pager = `${content} .flex.items-center.justify-between.flex-nowrap.overflow-x-auto:has(> .space-x-4)`;
        const toolbar = `${content} :is(header, .border-b) .flex.items-center.justify-between:not(.flex-nowrap)`;
        const informationRow = `${content} :is(.divide-y, .bg-gray-50.border-b) > .flex.max-w-full`;
        style.textContent += `
            /* 内容容器是所有频道（包括没有 main 的搜索页）的共同边界。 */
            .tm115-mobile :has(> aside.container-leftside), ${content},
            ${content} :is(main.flex-1, .flex[class*="min-w-"], .flex-col:not(.absolute, .fixed)):not(.tm115-navigation *) {
                min-width: 0 !important; max-width: 100% !important;
            }
            .tm115-mobile .container-leftside { width: 52px !important; flex: 0 0 52px !important; overflow-x: hidden; }
            .tm115-touch .tm115-old-entry { display: none !important; }
            .tm115-mobile .tm115-navigation {
                max-width: 100% !important; min-width: 0 !important;
            }
            .tm115-touch.tm115-account-open, .tm115-touch.tm115-account-open body { overflow: hidden !important; overscroll-behavior: none; }
            .tm115-mobile.tm115-nav-open .tm115-navigation {
                position: fixed !important; inset: 0 auto 0 0 !important; z-index: 100;
                width: calc(100vw - var(--tm115-toggle-width, 20px)) !important;
            }
            .tm115-mobile .tm115-navigation > div { transform: none !important; width: 100% !important; height: 100% !important; }
            .tm115-mobile .tm115-navigation :is(div, a) { box-sizing: border-box; max-width: 100% !important; }
            .tm115-mobile .tm115-nav-toggle {
                position: relative !important; top: 74px !important; left: auto !important;
                transform: none !important; align-self: flex-start; flex: 0 0 auto;
            }
            .tm115-mobile.tm115-nav-open .tm115-nav-toggle {
                position: fixed !important; top: 74px !important;
                left: auto !important; right: 0 !important; z-index: 101 !important;
            }
            .tm115-mobile :is(div, section):has(> .tm115-navigation) { min-width: 0; overflow: hidden; }
            .tm115-touch.tm115-account-open .tm115-content { pointer-events: none; }
            .tm115-touch .tm115-account-trigger { cursor: pointer; touch-action: manipulation; }
            .tm115-touch .tm115-account-menu {
                position: fixed !important; left: var(--tm115-account-left, 8px) !important; right: auto !important;
                top: var(--tm115-account-top, auto) !important; bottom: var(--tm115-account-bottom, 8px) !important;
                width: min(360px, calc(100vw - 16px)) !important; margin: 0 !important; z-index: 10002 !important;
                max-height: var(--tm115-account-height, calc(100dvh - 16px)); overflow: auto; overscroll-behavior: contain;
            }
            .tm115-touch .tm115-account-menu > div:has(button) { width: 100% !important; max-width: 100%; }
            .tm115-touch:not(.tm115-account-open) .tm115-account-menu { visibility: hidden; pointer-events: none; }
            ${content} :is(input, textarea), ${content} div:has(> input[type="text"], > input[type="search"]) { min-width: 0; max-width: 100%; box-sizing: border-box; }
            ${toolbar}, ${toolbar} > .flex { min-width: 0; max-width: 100%; flex-wrap: wrap; gap: 8px; }
            ${content} button { white-space: nowrap; flex-shrink: 0; }
            ${content} button > :is(span, svg, img) { flex-shrink: 0; }
            /* 原生分页的两种形态共用结构：文件页有选择框/每页，搜索页只有加载与总数。 */
            ${pager} { height: auto !important; min-height: 52px; flex-wrap: wrap !important; gap: 8px; padding-block: 8px; overflow: visible !important; }
            ${pager} > .space-x-4 { display: flex; flex: 1 1 100%; min-width: 0; flex-wrap: wrap; gap: 8px; }
            ${pager} > .space-x-4 > * { margin: 0 !important; }
            ${pager} .sel-label { margin: 0 !important; }
            ${pager} > .space-x-4 > .text-sm { min-width: 0; flex-shrink: 1; }
            ${pager} > .space-x-4 > .space-x-2 { order: 1; flex: 1 0 100%; min-width: 0; overflow-x: auto; justify-content: safe center; }
            ${pager} > .space-x-4 > .space-x-2 > * { flex-shrink: 0; }
            ${pager} input[placeholder="GO"] { width: 4em; }
            .tm115-player-mobile, :is(div, main, section):has(.tm115-player-mobile) { min-width: 0 !important; max-width: 100% !important; }
            .tm115-player-mobile {
                container-type: inline-size;
                --tm115-control-icon: 14px; --tm115-control-font: 10px; --tm115-control-gap: 1px;
            }
            @supports (width: 1cqw) {
                .tm115-player-mobile {
                    --tm115-control-icon: clamp(14px, 4.5cqw, 20px);
                    --tm115-control-font: clamp(10px, 3.2cqw, 12px);
                    --tm115-control-gap: clamp(1px, calc((100cqw - 300px) / 100), 4px);
                }
            }
            .tm115-player-mobile .tm115-native-controls:has(> .flex.items-center.justify-between) { padding-inline: 4px !important; padding-bottom: 4px !important; }
            .tm115-player-mobile .tm115-native-controls > .flex.items-center.justify-between,
            .tm115-player-mobile .tm115-native-controls > .flex.items-center.justify-between > div {
                min-width: 0; flex-wrap: nowrap !important; gap: var(--tm115-control-gap) !important;
            }
            .tm115-player-mobile .tm115-native-controls > .flex.items-center.justify-between > div { flex: 0 0 auto; }
            .tm115-player-mobile .tm115-native-controls > .flex.items-center.justify-between > div:first-child { flex: 1 1 auto; }
            .tm115-player-mobile .tm115-native-controls > .flex.items-center.justify-between > div > button,
            .tm115-player-mobile .tm115-native-controls > .flex.items-center.justify-between > div > div > button {
                min-width: 14px; min-width: clamp(14px, 5cqw, 24px); min-height: 24px;
                max-width: none; padding: 1px !important;
                font-size: var(--tm115-control-font) !important; line-height: 1.1; white-space: nowrap;
                flex-shrink: 0;
            }
            .tm115-player-mobile .tm115-native-controls > .flex.items-center.justify-between > div > button > :is(svg, img),
            .tm115-player-mobile .tm115-native-controls > .flex.items-center.justify-between > div > div > button > :is(svg, img) {
                width: var(--tm115-control-icon) !important; height: var(--tm115-control-icon) !important;
            }
            .tm115-player-mobile .tm115-native-controls > .flex.items-center.justify-between > div:first-child > span {
                min-width: 0; font-size: 11px !important; white-space: nowrap; font-variant-numeric: tabular-nums;
                overflow: hidden; text-overflow: ellipsis;
            }
            .tm115-mobile :is(.file-info-responsive, [data-file-info-panel]),
            .tm115-mobile :is(.file-list-item, .file-grid-item) [data-menu-action],
            .tm115-mobile .file-list-item > div.hidden.group-hover\\:flex.absolute.left-0.right-0 { display: none !important; }
            .tm115-mobile :is(.file-list-item, .file-grid-item) { -webkit-user-select: none; user-select: none; }
            .tm115-mobile .file-list-item > .flex.items-center { flex: 1; min-width: 0; padding: 4px 0 4px 6px; transform: none; }
            .tm115-mobile .file-grid-item div:has(> input[type="checkbox"]) { opacity: 1 !important; }
            ${content} .file-name-responsive { min-width: 0; max-width: 100%; }
            ${content} :has(+ .file-list-wrap) > .flex { flex-wrap: wrap; gap: 8px; padding: 8px !important; }
            ${content} :has(+ .file-list-wrap) > .flex > button { width: auto !important; }
            /* 定宽信息行按组件换行；名称和操作占整行，不依赖页面名或第几列。 */
            ${informationRow} { flex-wrap: wrap !important; gap: 8px; padding: 12px !important; }
            ${informationRow} > div:not(.absolute, .fixed):not(:has(input[type="checkbox"])) {
                flex: 1 1 8rem; min-width: 0 !important; width: auto !important; max-width: 100% !important; margin: 0 !important;
            }
            ${informationRow} > div:not(.absolute, .fixed):is(.overflow-hidden, :has(button)) { flex-basis: 100%; }
            ${informationRow} > .flex:not(.flex-col):has(button) { flex-wrap: wrap; gap: 8px; }
            ${content} .grid:has(> .file-grid-item, > div > .file-grid-item, > div input[type="checkbox"]) {
                grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr)) !important;
            }
            .tm115-mobile :is([role="dialog"], [data-dialog="true"], .dialog-box, .context-menu) {
                box-sizing: border-box; max-width: calc(100vw - 16px) !important;
                max-height: calc(100dvh - 16px) !important; overflow: auto;
            }
            .tm115-mobile .dialog-scroll > div { padding: 16px !important; }
            .tm115-mobile .dialog-scroll .grid-cols-3 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
            .tm115-mobile :is([data-dialog="true"], [role="dialog"], .dialog-box) .flex:not(.flex-col):has(> button):not(:has(input)),
            .tm115-mobile :is([data-dialog="true"], [role="dialog"], .dialog-box) :is(footer, [role="toolbar"]) { flex-wrap: wrap; gap: 8px; }
            .tm115-mobile :is([data-dialog="true"], [role="dialog"], .dialog-box) button { white-space: nowrap; flex-shrink: 0; }
            .tm115-mobile .dialog-scroll div:has(> div > input[type="date"]) { flex-wrap: wrap; }
            .tm115-mobile .dialog-scroll div:has(> input[type="date"]) { flex: 1 1 180px; min-width: 0; }
            .tm115-mobile .dialog-scroll input[type="date"] { width: 100%; min-width: 0; box-sizing: border-box; }
            .tm115-mobile .dialog-scroll div:has(> div > input[type="date"]) > span { display: none; }
            .tm115-mobile .dialog-scroll div:has(> div > input[type="date"]) > button { flex: 1 0 100%; min-height: 44px; }
        `;
    }

    function initMobileEvents() {
        window.addEventListener("resize", refreshViewport);
        document.addEventListener("pointerdown", () => { if (isMobileDashboard()) navigationInteracted = true; }, true);
        for (const type of ["mouseover", "mouseout"]) document.addEventListener(type, event => {
            if (!dispatchingAccount && isMobileDashboard() && document.documentElement.classList.contains("tm115-touch") && account?.contains(event.target)) {
                event.stopImmediatePropagation();
            }
        }, true);
        document.addEventListener("click", handleMobileClick, true);
        document.addEventListener("keydown", event => {
            if (!isMobileDashboard()) return;
            navigationInteracted = true;
            if (event.key === "Escape") { closeNavigation(); setAccountOpen(false); }
        });
    }

    function refreshViewport() {
        refreshMobile();
        refreshPlayers();
    }

    function handleMobileClick(event) {
        if (!isMobileDashboard()) return;
        if (document.documentElement.classList.contains("tm115-touch")) {
            if (accountTrigger?.contains(event.target)) {
                // 购买 VIP 是账户区域内的独立 div 控件，不能只排除 a / button。
                const control = event.target.closest?.('a, button, [role="button"], .btn-golden');
                if (control && accountTrigger.contains(control)) {
                    setAccountOpen(false);
                    return;
                }
                event.preventDefault();
                event.stopImmediatePropagation();
                closeNavigation();
                setAccountOpen(!accountOpen);
                return;
            }
            if (accountOpen) {
                if (!event.target.closest?.(".tm115-account-menu")) {
                    setAccountOpen(false);
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    return;
                }
                if (event.target.closest?.("a, button")) setTimeout(() => setAccountOpen(false), 0);
            }
        }
        const link = event.target.closest?.("a[href]");
        if (link) {
            const target = getModernFileURL(new URL(link.href, location.href));
            if (target) link.href = target;
        }
        if (event.target.closest?.(".tm115-nav-toggle")) return;
        // 先让原生链接完成路由处理，再收起侧栏，避免同步重绘吞掉点击。
        if (link) setTimeout(closeNavigation, 0);
        else if (!event.target.closest?.(".tm115-navigation")) closeNavigation();
    }

    function addLoginStyles() {
        style.textContent += `
                .tm115-login .register-container { width: auto !important; max-width: 420px; margin: 20px auto !important; padding: 16px; box-sizing: border-box; }
                .tm115-login .register-container h1 { font-size: 24px; text-align: center; }
                .tm115-login .register-box { box-sizing: border-box; width: 100% !important; margin: 0; padding: 16px 0 !important; }
                .tm115-login .register-box .row { display: flex; flex-wrap: wrap; gap: 8px; height: auto; margin-bottom: 20px; }
                .tm115-login .register-box h3 { position: static; flex: 1 0 100%; width: auto; height: auto; line-height: 24px; text-align: left; }
                .tm115-login .register-box .input-cell { box-sizing: border-box; min-width: 0; margin: 0; }
                .tm115-login .register-box .input-mobile { width: 100%; }
                .tm115-login .register-box .input-mobile .con { flex: 1; min-width: 0; }
                .tm115-login .register-box .input-cell input:not([type="hidden"]) { box-sizing: border-box; width: 100%; height: 48px; }
                .tm115-login .register-box .input-vcode { flex: 1 1 130px; }
                .tm115-login .register-box .btn-getvcode { flex: 1 1 160px; width: auto; }
                .tm115-login .register-box .reg-action > * { width: 100% !important; }
                .tm115-login .register-box .agreement { display: block; }
                .tm115-login .common-login-box {
                    position: fixed !important; left: 50% !important; top: 50% !important;
                    transform: translate(-50%, -50%); margin: 0 !important;
                    min-height: 0 !important; max-width: calc(100vw - 16px) !important;
                    max-height: calc(100dvh - 16px); overflow: auto;
                }
                .tm115-login .common-login-box .login-contents { padding: 24px 20px; }
                .tm115-login .common-login-box .login-row { box-sizing: border-box; border-bottom: 1px solid #ddd; }
                .tm115-login .common-login-box .lr-account { align-items: center; }
                .tm115-login .common-login-box .region-title { width: auto; height: 32px; line-height: 32px; padding: 0 8px; flex-shrink: 0; }
                .tm115-login .common-login-box .input-cell { box-sizing: border-box; width: auto; min-width: 0; border: 0; background: transparent; }
                .tm115-login .common-login-box .input-cell input { box-sizing: border-box; width: 100% !important; max-width: 100%; }
                .tm115-login #tm115-login-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; padding: 16px; }
                .tm115-login #tm115-login-actions :is(button, a) { padding: 10px 16px; border: 1px solid #2777f8; border-radius: 6px; background: #fff; color: #2777f8; font-size: 14px; }
        `;
    }

    function initMobileLogin() {
        if (!isMobileLoginPage()) return;
        document.documentElement.classList.add("tm115-login");
        addLoginStyles();
        const actions = document.createElement("div");
        loginActions = actions;
        actions.id = "tm115-login-actions";
        const loginButton = document.createElement("button");
        loginButton.type = "button";
        loginButton.textContent = "密码 / 扫码登录";
        loginButton.onclick = openOfficialLogin;
        const enter = document.createElement("a");
        enter.href = MOBILE_HOME;
        enter.textContent = "登录完成，进入网盘";
        actions.append(loginButton, enter);
        document.body.prepend(actions);
        returnAfterLogin();
    }

    function openOfficialLogin() {
        if (!isMobileLoginPage()) return;
        const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
        pageWindow.oofUtil?.login?.boxLogin?.show(result => {
            // 官方回调先于 Cookie 收尾，下一任务再导航。
            if (result?.state && !result.is_two) setTimeout(() => {
                if (isMobileLoginPage()) location.replace(MOBILE_HOME);
            }, 0);
        });
    }

    function resetMobileLogin() {
        loginActions?.remove();
        loginActions = null;
        document.documentElement.classList.remove("tm115-login");
    }

    function returnAfterLogin() {
        if (!isMobileLoginPage()) return;
        const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
        pageWindow.oofUtil?.loginApi?.isLogin(result => {
            if (!isMobileLoginPage() || !result?.state || !result.data?.USER_ID) return;
            try {
                // 两站鉴权结果不一致时不自动往返；仍保留手动进入入口。
                const key = "tm115-login-return";
                if (sessionStorage.getItem(key)) return;
                sessionStorage.setItem(key, "1");
                location.replace(MOBILE_HOME);
            } catch {}
        });
    }

    function restoreAttribute(element, name, value) {
        if (!element) return;
        if (value == null) element.removeAttribute(name);
        else element.setAttribute(name, value);
    }

    function resetAccount() {
        setAccountOpen(false);
        for (const menu of account?.querySelectorAll(".tm115-account-menu") || []) {
            menu.classList.remove("tm115-account-menu");
            for (const name of ["left", "top", "bottom", "height"]) menu.style.removeProperty(`--tm115-account-${name}`);
        }
        account?.classList.remove("tm115-account");
        accountTrigger?.classList.remove("tm115-account-trigger");
        restoreAttribute(accountTrigger, "aria-expanded", accountExpanded);
        account = accountTrigger = null;
    }

    function positionAccountMenu(menu) {
        const bounds = accountTrigger.getBoundingClientRect();
        const above = bounds.top >= innerHeight / 2;
        const available = above ? bounds.top - 16 : innerHeight - bounds.bottom - 16;
        const left = Math.max(8, Math.min(bounds.right + 8, innerWidth - Math.min(360, innerWidth - 16) - 8));
        const positions = {
            "--tm115-account-left": `${left}px`,
            "--tm115-account-top": above ? "auto" : `${Math.max(8, bounds.bottom + 8)}px`,
            "--tm115-account-bottom": above ? `${Math.max(8, innerHeight - bounds.top + 8)}px` : "auto",
            "--tm115-account-height": `${Math.max(0, Math.min(innerHeight - 16, available))}px`,
        };
        for (const [name, value] of Object.entries(positions)) {
            if (menu.style.getPropertyValue(name) !== value) menu.style.setProperty(name, value);
        }
    }

    function refreshAccount(shell) {
        const avatar = shell.querySelector('img[alt$="的头像"]');
        let owner = null;
        for (let node = avatar?.parentElement; node && node !== shell; node = node.parentElement) {
            if (node.classList.contains("relative") && !node.querySelector("nav")) owner = node;
        }
        // 原生会员标识覆盖头像下缘；使用完整账户区域接住头像、标识和昵称的点击。
        let trigger = avatar;
        if (owner) while (trigger.parentElement !== owner) trigger = trigger.parentElement;
        if (account !== owner || accountTrigger !== (owner ? trigger : null)) {
            resetAccount();
            account = owner;
            accountTrigger = owner ? trigger : null;
            accountExpanded = accountTrigger?.getAttribute("aria-expanded");
        }
        if (account && accountTrigger) {
            if (!account.classList.contains("tm115-account")) account.classList.add("tm115-account");
            if (!accountTrigger.classList.contains("tm115-account-trigger")) accountTrigger.classList.add("tm115-account-trigger");
            const menu = [...account.children].find(node => !node.contains(accountTrigger) && node.matches("div") && node.querySelector("button"));
            if (menu) {
                if (!menu.classList.contains("tm115-account-menu")) menu.classList.add("tm115-account-menu");
                positionAccountMenu(menu);
            }
        }
    }

    function hideLegacyEntries(shell) {
        for (const link of shell.parentElement.querySelectorAll(":scope > a[href]")) {
            if (!link.classList.contains("tm115-old-entry") && link.textContent.includes("切换旧版") &&
                getComputedStyle(link).position === "fixed") {
                link.classList.add("tm115-old-entry");
            }
        }
    }

    function resetNavigation() {
        navigation?.classList.remove("tm115-navigation");
        navigation?.style.removeProperty("--tm115-toggle-width");
        navigationToggle?.classList.remove("tm115-nav-toggle");
        restoreAttribute(navigationToggle?.querySelector("button"), "aria-label", navigationLabel);
        navigation = navigationToggle = null;
        document.documentElement.classList.remove("tm115-nav-open");
    }

    function refreshNavigation(panel) {
        const root = document.documentElement;
        const toggle = panel?.nextElementSibling;
        if (!toggle?.matches('div') || !toggle.querySelector('button') || toggle.querySelector('main, input, a[href]')) {
            resetNavigation();
            return;
        }
        if (navigation !== panel || navigationToggle !== toggle) {
            resetNavigation();
            navigation = panel;
            navigationToggle = toggle;
            navigationLabel = toggle.querySelector("button").getAttribute("aria-label");
        }
        if (!panel.classList.contains("tm115-navigation")) panel.classList.add("tm115-navigation");
        if (!toggle.classList.contains("tm115-nav-toggle")) toggle.classList.add("tm115-nav-toggle");
        updateNavigationWidth(panel, toggle);
        // 只跟随原生收起状态，不另设开关，也不覆盖站点的 opacity / pointer-events。
        const expanded = getComputedStyle(panel).pointerEvents !== "none";
        root.classList.toggle("tm115-nav-open", expanded);
        if (expanded) setAccountOpen(false);
        const button = toggle.querySelector("button");
        const label = expanded ? "收起侧栏" : "展开侧栏";
        if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
        if (expanded && !navigationInteracted) {
            // 原生配置可能异步恢复展开状态；首次交互前收起，交互后不再覆盖用户选择。
            setTimeout(() => { if (navigation === panel && !navigationInteracted) closeNavigation(); }, 0);
        }
    }

    function updateNavigationWidth(panel, toggle) {
        // 原生箭头悬停时宽度会变化，只预留实际宽度，不另设大号关闭区。
        const width = `${Math.ceil(toggle.getBoundingClientRect().width)}px`;
        if (panel.style.getPropertyValue("--tm115-toggle-width") !== width) panel.style.setProperty("--tm115-toggle-width", width);
    }

    function initMobile() {
        if (!isMobileContext()) return;
        addMobileStyles();
        initMobileEvents();
        initMobileLogin();
        if (isMobileLoginPage() ||
            (window === window.top && location.hostname === "115.com" && location.pathname.startsWith("/players/video/"))) {
            setViewport();
        }
    }

    function resetMobileViewport() {
        if (!mobileViewport) return;
        const { element, created, content } = mobileViewport;
        if (element.content === "width=device-width, initial-scale=1, viewport-fit=cover") {
            if (created) element.remove();
            else restoreAttribute(element, "content", content);
        }
        mobileViewport = null;
    }

    function refreshMobile() {
        if (!mobileEnabled) return;
        const root = document.documentElement;
        const shell = isMobileDashboard() ? document.querySelector("aside.container-leftside") : null;
        const content = shell?.parentElement.querySelector(':scope > div.flex-1');
        const compact = Boolean(content) && isCompactViewport();
        if (!compact) closeNavigation();
        root.classList.toggle("tm115-mobile", compact);
        root.classList.toggle("tm115-touch", Boolean(shell));
        if (mobileContent !== content) mobileContent?.classList.remove("tm115-content");
        mobileContent = content;
        mobileContent?.classList.toggle("tm115-content", compact);
        if (!isMobileContext()) {
            resetMobileLogin();
            resetMobileViewport();
            document.querySelectorAll('.tm115-old-entry').forEach(node => node.classList.remove('tm115-old-entry'));
        }
        if (!shell) { resetAccount(); resetNavigation(); return; }
        if (content && !mobileViewport) setViewport();
        refreshAccount(shell);
        hideLegacyEntries(shell);
        if (!compact) { resetNavigation(); return; }
        const channel = location.pathname.split("/")[1];
        if (navigationChannel !== channel) {
            navigationChannel = channel;
            navigationInteracted = false;
            setAccountOpen(false);
        }
        refreshNavigation(content.querySelector('main.flex-shrink-0'));
    }

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

    function initListMenus() {
        if (!values.list && !mobileEnabled) return;
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
        const controlsOf = row => [...row.querySelectorAll('.file-opr, :is(div, span):has(> [data-menu-action])')].flatMap(toolbar =>
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
                if (!values.list && !(isMobileDashboard() && isCompactViewport())) return;
                const row = event.target.closest?.('.file-list-item, .file-grid-item, li[rel="item"][file_type]');
                if (!row) return;
                const augment = () => {
                    const mobile = isMobileDashboard() && isCompactViewport();
                    if (!row.isConnected || (!values.list && !mobile)) { cleanup(); return; }
                    // 新版关闭对话框后，右键菜单偶尔停留在隐藏测量状态，需要补齐定位和显示。
                    for (const candidate of document.querySelectorAll('div.fixed[class~="z-[10000]"]:has(button.w-full.text-left)')) {
                        if (!mobile) break;
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
                if (!values.list && !(isMobileDashboard() && isCompactViewport())) { cleanup(); return; }
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

    function downloadCodec(input, seed, decode = false) {
        // 接口协议常量：1024 位 RSA 公钥（e = 65537）和 XOR 密钥表，不依赖外部加密库。
        const n = 0x8686980c0f5a24c4b9d43020cd2c22703ff3f450756529058b1cf88f09b8602136477198a6e2683149659bd122c33592fdb5ad47944ad1ea4d36c6b172aad6338c3bb6ac6227502d010993ac967d1aef00f0c8e038de2e4d3bc2ec368af2e9f10a6f1eda4f7262f136420c07c331b871bf139f74f3010e3c4fe57df3afb71683n;
        const table = "f0e569aebfdcbf8a1a45e8be7da673b8de8fe7c445da86c49b648b146ab4f1aa3801359e26692c86006b4fa5363462a62a966818f24afdbd6b978f4d8f8913b76c8e93ed0e0d483ed72f88d8fefe7e8650954fd1eb832634db667b9c7e9d7a8132eab633de3aa95934663baaba816048b9d5819cf86c8477ff5478265fbee81e369f34805c452c9b76d51b8fccc3b8f5";
        function mask(bytes, salt, size) {
            const key = [];
            for (let i = 0; i < size; i++) {
                const a = parseInt(table.slice(size * i * 2, size * i * 2 + 2), 16);
                const b = parseInt(table.slice(size * (size - 1 - i) * 2, size * (size - 1 - i) * 2 + 2), 16);
                key.push(((salt[i] + a) % 256) ^ b);
            }
            // 前 length % 4 字节独立处理，后续从密钥起点重新循环。
            const prefix = bytes.length % 4;
            for (let i = 0; i < bytes.length; i++) bytes[i] ^= key[i < prefix ? i : (i - prefix) % size];
            return bytes;
        }
        function rsa(block) {
            let number = 0n;
            for (let i = 0; i < 128; i++) number = number * 256n + BigInt(block[i]);
            if (number >= n) throw new Error("下载接口加密数据无效");
            let power = number;
            for (let i = 0; i < 16; i++) power = power * power % n;
            power = power * number % n;
            const result = new Uint8Array(128);
            for (let i = 127; i >= 0; i--) { result[i] = Number(power % 256n); power /= 256n; }
            return result;
        }
        if (!decode) {
            const bytes = mask(new TextEncoder().encode(input), seed, 4).reverse();
            const fixed = [120, 6, 173, 76, 51, 134, 93, 24, 76, 1, 63, 70];
            for (let i = 0; i < bytes.length; i++) bytes[i] ^= fixed[i < bytes.length % 4 ? i : (i - bytes.length % 4) % 12];
            // 单文件 pickcode 请求小于 RSA 单块容量，不实现无用的批量编码。
            if (seed.length !== 16 || bytes.length + 16 > 117) throw new Error("下载标识过长");
            const block = crypto.getRandomValues(new Uint8Array(128));
            const separator = 111 - bytes.length;
            for (let i = 2; i < separator; i++) while (!block[i]) crypto.getRandomValues(block.subarray(i, i + 1));
            block[0] = 0; block[1] = 2; block[separator] = 0;
            block.set(seed, separator + 1);
            block.set(bytes, separator + 17);
            return btoa(String.fromCharCode(...rsa(block)));
        }
        try {
            const encrypted = Uint8Array.from(atob(input), char => char.charCodeAt(0));
            if (!encrypted.length || encrypted.length % 128 || encrypted.length > 65536) throw new Error();
            const payload = [];
            for (let offset = 0; offset < encrypted.length; offset += 128) {
                const block = rsa(encrypted.subarray(offset, offset + 128));
                const end = block.indexOf(0, 2);
                if (block[0] || end < 10) throw new Error();
                for (let i = end + 1; i < 128; i++) payload.push(block[i]);
            }
            if (payload.length < 16) throw new Error();
            const bytes = mask(Uint8Array.from(payload.slice(16)), payload, 12).reverse();
            return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(mask(bytes, seed, 4)));
        } catch { throw new Error("下载接口数据解码失败"); }
    }

    function requestDownloadAPI(url, data) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== "function") return reject(new Error("请更新安装脚本并允许下载接口的跨域请求"));
            GM_xmlhttpRequest({
                method: data ? "POST" : "GET", url, data, timeout: 20000,
                headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": navigator.userAgent },
                onload(response) {
                    if (response.status < 200 || response.status >= 300) return reject(new Error("下载接口请求失败，请检查登录和网络"));
                    let result;
                    try { result = JSON.parse(response.responseText); }
                    catch { return reject(new Error("下载接口返回异常，请重新登录后重试")); }
                    if (result?.state === true || result?.state === 1) return resolve(result.data);
                    const code = String(result?.errno ?? result?.errcode ?? result?.code ?? "");
                    reject(new Error(code === "911" ? "请先在 115 网页完成账号验证，再重试下载" :
                        `取下载地址失败，请检查登录状态和文件权限${/^\d+$/.test(code) ? `（${code}）` : ""}`));
                },
                onerror: () => reject(new Error("下载接口网络请求失败")),
                ontimeout: () => reject(new Error("下载接口请求超时")),
            });
        });
    }

    async function downloadFiles(targets, nativeDownload) {
        let handedOff = 0;
        let cancelled = false;
        const cancel = () => { cancelled = true; };
        window.addEventListener("pagehide", cancel, { once: true });
        try {
            const filesToDownload = [];
            const seen = new Set();
            // 先检查整批目标，避免先下载文件、遇到文件夹后又把整批交回原生处理。
            for (const target of targets) {
                if (cancelled) return;
                if (!getValue("tm115-download-enabled", true)) throw new Error("下载开关已关闭，已停止后续取链");
                const id = String(target.id || "");
                let pickcode = target.pickcode;
                const key = id ? `id:${id}` : `pc:${pickcode}`;
                if (seen.has(key)) continue;
                seen.add(key);
                if (id) {
                    if (!/^\d+$/.test(id)) throw new Error("文件标识无效");
                    const data = await requestDownloadAPI(`https://webapi.115.com/files/get_info?file_id=${id}`);
                    if (cancelled) return;
                    const info = Array.isArray(data) && data.find(file => String(file.fid || file.cid) === id);
                    if (!info) throw new Error("找不到该文件");
                    if (!info.fid) { nativeDownload(); return; }
                    if (info.aid != null && Number(info.aid) !== 1) throw new Error("只支持当前网盘中的普通文件");
                    pickcode = info.pc;
                }
                if (!/^[a-z0-9]{1,64}$/i.test(pickcode || "")) throw new Error("文件缺少下载标识");
                filesToDownload.push({ id, pickcode });
                if (targets.length > 1) await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (!filesToDownload.length) throw new Error("请选择需要下载的文件");
            const ua = navigator.userAgent;
            for (const { id, pickcode } of filesToDownload) {
                if (cancelled) return;
                if (!getValue("tm115-download-enabled", true)) throw new Error("下载开关已关闭，已停止后续取链");
                const seed = crypto.getRandomValues(new Uint8Array(16));
                const encrypted = await requestDownloadAPI("https://proapi.115.com/app/chrome/downurl",
                    new URLSearchParams({ data: downloadCodec(JSON.stringify({ pickcode }), seed) }).toString());
                if (cancelled) return;
                if (!getValue("tm115-download-enabled", true)) throw new Error("下载开关已关闭，已停止后续下载");
                const files = downloadCodec(encrypted, seed, true);
                const file = id ? files?.[id] : Object.values(files || {}).find(item => item?.pick_code === pickcode);
                if (!file?.url?.url) throw new Error("该文件没有可用的下载地址");
                let url;
                try { url = new URL(file.url.url); } catch { throw new Error("下载地址无效"); }
                if (url.protocol !== "https:" || url.username || url.password) throw new Error("下载地址不符合安全要求");
                if (url.searchParams.get("f") === "3") throw new Error("该地址需要额外凭据，请关闭此开关使用原生下载");
                if (navigator.userAgent !== ua) throw new Error("浏览器 UA 已改变，请重新点击下载");
                // 新版 CSP 禁止下载 iframe；串行取链，实际传输仍由浏览器负责。
                const link = document.createElement("a");
                link.hidden = true;
                link.href = url.href;
                link.download = file.file_name || "";
                document.body.append(link);
                try { link.click(); } finally { link.remove(); }
                handedOff++;
                if (handedOff < filesToDownload.length) await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            if (!cancelled) Dialog.alert("大文件浏览器下载", `${error.message || "下载失败"}${handedOff ? `。此前已向浏览器提交 ${handedOff} 个文件，请检查下载列表后再重试其余文件。` : ""}`, "error", "知道了");
        } finally {
            window.removeEventListener("pagehide", cancel);
        }
    }

    function initBrowserDownloads() {
        if (!values.download) return;
        const hooks = [];
        const rowSelector = '.file-list-item[data-file-id], .file-grid-item[data-file-id]';
        const menuSelector = '.context-menu, [role="menu"], div.fixed[class~="z-[10000]"]:has(button.w-full.text-left)';
        const batchSelector = '.absolute.top-0.left-0.right-0.bg-white.z-10';
        let menuOwner;
        let nativeClick = false;
        function selectedFiles(toolbar) {
            if (!toolbar?.isConnected) throw new Error("无法确认批量下载所属列表，请重新选择文件");
            const labels = toolbar.querySelectorAll(':scope > div > div:first-child > div > span.text-sm.whitespace-nowrap');
            const match = labels.length === 1 && labels[0].textContent.trim().match(/^(?:已选中\s*(\d+)\s*项|(\d+)\s+selected)$/i);
            const count = match && +(match[1] || match[2]);
            if (!count) throw new Error("无法读取完整选择数量，未开始下载，请从文件行下载");
            let scope = toolbar.parentElement;
            while (scope && !scope.querySelector(rowSelector)) scope = scope.parentElement;
            if (!scope || scope === document.body || scope === document.documentElement) throw new Error("无法确认文件列表，未开始下载");
            if (scope.querySelectorAll(batchSelector).length !== 1) throw new Error("存在多个选择工具栏，无法确认下载目标");
            const ids = new Set([...scope.querySelectorAll(rowSelector)]
                .filter(row => row.querySelector('input[type="checkbox"]:checked')).map(row => row.dataset.fileId));
            if (ids.size !== count || [...ids].some(id => !/^\d+$/.test(id))) {
                throw new Error("部分已选项目未显示，无法完整读取选择，未开始下载。请减少选择数量或关闭此开关使用原生下载。");
            }
            return [...ids].sort().map(id => ({ id }));
        }
        function hookLegacy() {
            const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
            const api = pageWindow.Core?.FileAPI;
            if (!api) return;
            for (const name of ["DownloadSomeFile", "Download"]) {
                const original = api[name];
                if (typeof original !== "function" || original.tm115BrowserDownload) continue;
                const wrapper = function (files, ...args) {
                    const fallback = () => {
                        nativeClick = true;
                        try { return original.call(this, files, ...args); } finally { nativeClick = false; }
                    };
                    if (nativeClick || !getValue("tm115-download-enabled", true) || new URL(location.href).searchParams.has("share_id")) return original.call(this, files, ...args);
                    const rows = name === "DownloadSomeFile" ? Array.from(files || [], item => item?.nodeType === 1 ? item : item?.[0]) : [];
                    if (name === "DownloadSomeFile" && (!rows.length || rows.some(row => row?.getAttribute("file_type") !== "1"))) return fallback();
                    const targets = name === "Download" ? [{ pickcode: files }] : rows.map(row => ({ id: row.getAttribute("file_id") }));
                    downloadFiles(targets, () => {
                        if (rows.some((row, i) => !row.isConnected || row.getAttribute("file_id") !== targets[i].id)) throw new Error("文件列表已变化，请重新点击下载");
                        return fallback();
                    });
                    return false;
                };
                wrapper.tm115BrowserDownload = true;
                api[name] = wrapper;
                hooks.push({ api, name, original, wrapper });
            }
        }
        // 旧版入口直接接收原生选择，避免猜测 iframe 和右键菜单的所属文件。
        window.addEventListener("pagehide", () => {
            for (const { api, name, original, wrapper } of hooks) if (api[name] === wrapper) api[name] = original;
            hooks.length = 0;
            menuOwner = null;
        });
        window.addEventListener("pageshow", hookLegacy);
        window.addEventListener("load", hookLegacy, true);
        const remember = event => {
            if (event.target.closest?.(`${menuSelector}, [data-batch-more-menu="true"]`)) return;
            const row = event.target.closest?.(rowSelector);
            menuOwner = row ? { row, id: row.dataset.fileId } : { batch: event.target.closest?.(batchSelector) };
        };
        document.addEventListener("contextmenu", remember, true);
        document.addEventListener("pointerdown", remember, true);
        window.addEventListener("click", event => {
            hookLegacy();
            if (nativeClick || !getValue("tm115-download-enabled", true) || location.hostname !== "115.com" ||
                !/^\/(storage|search|players\/video)(\/|$)/.test(location.pathname) || new URL(location.href).searchParams.has("share_id")) return;
            const button = event.target.closest?.('button, a, [role="menuitem"]');
            const action = event.target.closest?.('[data-menu-action="download"]');
            if (!action && !/^(下载|下载文件|下载原文件|Download)$/i.test((button?.getAttribute("aria-label") || button?.textContent || "").trim())) return;
            const batchMenu = button?.closest('[data-batch-more-menu="true"]');
            const batch = button?.closest(batchSelector) || (batchMenu && menuOwner?.batch);
            if (batch || batchMenu) {
                event.preventDefault();
                event.stopImmediatePropagation();
                try {
                    const targets = selectedFiles(batch);
                    const page = location.href;
                    downloadFiles(targets, () => {
                        // 文件夹回退前重新核对，不能对用户后来改变的选择重放旧点击。
                        if (!button.isConnected || location.href !== page || JSON.stringify(selectedFiles(batch)) !== JSON.stringify(targets)) {
                            throw new Error("选择已变化，请重新点击下载");
                        }
                        nativeClick = true;
                        try { button.click(); } finally { nativeClick = false; }
                    });
                } catch (error) { Dialog.alert("大文件浏览器下载", error.message, "warning", "知道了"); }
                return;
            }
            let row = event.target.closest?.(rowSelector);
            const menu = button?.closest(menuSelector);
            const player = location.pathname.match(/^\/players\/video\/([a-z0-9]+)\/?$/i);
            if (!row && menu && menuOwner?.row?.isConnected && menuOwner.row.dataset.fileId === menuOwner.id) row = menuOwner.row;
            // 文件行和右键菜单仍下载该行，不扩大为当前全部选择。
            if (!row && !player) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const id = row?.dataset.fileId;
            downloadFiles([row ? { id } : { pickcode: player[1] }], () => {
                if (!button?.isConnected || (row && row.dataset.fileId !== id)) return;
                nativeClick = true;
                try { button.click(); } finally { nativeClick = false; }
            });
        }, true);
        hookLegacy();
    }

    function isOutsideGestureArea(x, y, rect) {
        return x < rect.left + 24 || x > rect.right - 56 || y < rect.top + 56 || y > rect.bottom - 80;
    }

    function initFullscreenOrientation() {
        const orientation = screen.orientation;
        if (!values.player || !isMobileContext() || typeof orientation?.lock !== "function" || typeof orientation.unlock !== "function") return null;
        let activeVideo = null;
        let nativeVideo = null;
        let ownsLock = false;
        let pageActive = true;

        function release() {
            if (!ownsLock) return;
            ownsLock = false;
            try { orientation.unlock(); } catch {}
        }

        function sync() {
            if (nativeVideo && (!nativeVideo.isConnected || !players.has(nativeVideo))) nativeVideo = null;
            const fullscreen = document.fullscreenElement || document.webkitFullscreenElement;
            const nextVideo = pageActive && isMobileContext() && [...players.keys()].find(video => video.isConnected &&
                (video === nativeVideo || fullscreen === video ||
                    (fullscreen?.contains(video) && fullscreen.querySelectorAll("video").length === 1))) || null;
            if (nextVideo === activeVideo) return;
            activeVideo = nextVideo;
            if (!activeVideo) { release(); return; }
            try {
                Promise.resolve(orientation.lock("landscape")).then(() => {
                    ownsLock = true;
                    // 请求可能在退出之后才完成；若另一个播放器已进入全屏，不解锁它。
                    if (!activeVideo) release();
                }, () => {});
            } catch {}
        }

        for (const event of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(event, sync);
        document.addEventListener("webkitbeginfullscreen", event => {
            if (!players.has(event.target)) return;
            nativeVideo = event.target;
            sync();
        }, true);
        document.addEventListener("webkitendfullscreen", event => {
            if (nativeVideo !== event.target) return;
            nativeVideo = null;
            sync();
        }, true);
        window.addEventListener("pagehide", () => { pageActive = false; nativeVideo = null; sync(); });
        window.addEventListener("pageshow", () => { pageActive = true; sync(); });
        return { sync };
    }
    function initSubtitleScaling(root, legacy) {
        if (!values.subtitleScale) return null;
        // 以 960x540 为统一基准；旧版由 video-player 定义画面尺寸，内部舞台为绝对定位。
        const viewport = legacy ? root.closest(".video-player") || root : root;
        const resize = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (!root.isConnected || !width || !height) return;
            const scale = String(Math.min(width / 960, height / 540));
            if (root.style.getPropertyValue("--tm115-subtitle-scale") !== scale) root.style.setProperty("--tm115-subtitle-scale", scale);
        });
        resize.observe(viewport);
        return resize;
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

        // 新旧版共用；只受播放器优化和字幕缩放开关控制，与移动网页适配无关。
        const subtitleResize = initSubtitleScaling(root, legacy);

        if (legacy && isMobileContext() && window === window.top) {
            // 旧版缺少合适的 viewport，页面缩放和视频像素尺寸会脱节。
            setViewport();
        }

        let hideTimer;
        let prompt;
        let feedback;
        let brightness = 1;
        let brightnessFilter;
        let brightnessObserver;
        const zoomButtons = legacy ? [...root.querySelectorAll('[btn="zoom"]')].map(button => [button, button.classList.contains("current")]) : [];
        let gesture;
        let suppressClickUntil = 0;
        let tapTimer;
        const interactive = 'a, button, input, select, textarea, summary, [role="button"], [role="slider"], [contenteditable="true"], .tm115-native-controls, [class~="group/progress"], .operate-bar, .video-dialog-box, .video-full-screen, .bar-progress';
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

        // 新版移动 UA：单击显隐，双击播放。只受播放器优化开关控制，与 mobileEnabled 无关。
        if (!legacy) {
            let pressed;
            const surface = event => event.target === video || event.target === root;
            const cancelTap = () => { pressed = null; clearTimeout(tapTimer); tapTimer = null; };
            const toggleControls = () => {
                tapTimer = null;
                if (!isMobileDevice() || !root.isConnected || locked) return;
                const bar = root.querySelector(':scope > .absolute.inset-x-0.bottom-0:has(> [class~="group/progress"])');
                const hide = Boolean(bar) && !root.classList.contains("tm115-controls-hidden");
                root.classList.toggle("tm115-controls-hidden", hide);
                // 原生控制栏会卸载；用公开鼠标事件让站点重新显示，不读取 React 状态。
                if (!hide) root.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, view: window }));
            };
            listen(root, "pointerdown", event => {
                if (!isMobileDevice() || !surface(event) || locked || event.button !== 0) return;
                if (!event.isPrimary) { cancelTap(); return; }
                pressed = { id: event.pointerId, x: event.clientX, y: event.clientY, time: Date.now() };
            }, { capture: true });
            listen(root, "pointermove", event => {
                if (pressed?.id === event.pointerId && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 12) cancelTap();
            }, { capture: true });
            listen(root, "pointerup", event => {
                if (pressed?.id !== event.pointerId) return;
                const short = Date.now() - pressed.time < 350 &&
                    Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) <= 12 && (!gesture || gesture.mode === "pending");
                pressed = null;
                if (!short || !surface(event) || !isMobileDevice() || locked) { cancelTap(); return; }
                if (tapTimer) {
                    clearTimeout(tapTimer);
                    tapTimer = null;
                    if (video.paused) video.play().catch(() => {});
                    else video.pause();
                } else tapTimer = setTimeout(toggleControls, 300);
            }, { capture: true });
            for (const type of ["click", "dblclick"]) listen(root, type, event => {
                if (!isMobileDevice() || !surface(event) || event.detail === 0) return;
                event.preventDefault();
                event.stopImmediatePropagation();
            }, { capture: true });
            listen(root, "pointercancel", cancelTap, { capture: true });
            listen(document, "touchstart", event => { if (event.touches.length > 1) cancelTap(); }, { capture: true, passive: true });
            listen(window, "resize", () => {
                if (!isMobileDevice()) { cancelTap(); root.classList.remove("tm115-controls-hidden"); }
            });
            for (const type of ["blur", "pagehide"]) listen(window, type, cancelTap);
        }

        function show(text, timeout = 0) {
            clearTimeout(hideTimer);
            if (!legacy) {
                if (!feedback) {
                    feedback = document.createElement("div");
                    feedback.className = "tm115-gesture-feedback";
                    feedback.setAttribute("role", "status");
                    root.append(feedback);
                }
                feedback.textContent = text;
                feedback.hidden = false;
                if (timeout) hideTimer = setTimeout(restorePrompt, timeout);
                return;
            }
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
            if (feedback) feedback.hidden = true;
            if (!prompt) return;
            const { element, node, text, feedback: shownText, display, priority, hadStyle } = prompt;
            // 只还原仍由脚本控制的内容，不覆盖原生播放器后来写入的提示或样式。
            if (node.data === shownText) node.data = text;
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

        function setBrightness(value) {
            // 叠加画面亮度，不替换原生对比度/饱和度；站点改滤镜时以新值为基底。
            const filter = video.style.getPropertyValue("filter");
            if (!brightnessFilter || filter !== brightnessFilter.applied) {
                brightnessFilter = {
                    value: filter, priority: video.style.getPropertyPriority("filter"),
                    base: getComputedStyle(video).filter,
                };
            }
            brightness = value;
            video.style.setProperty("filter", `${brightnessFilter.base === "none" ? "" : brightnessFilter.base} brightness(${value})`.trim(), "important");
            brightnessFilter.applied = video.style.getPropertyValue("filter");
            if (!brightnessObserver) {
                brightnessObserver = new MutationObserver(() => {
                    if (video.style.getPropertyValue("filter") !== brightnessFilter.applied) setBrightness(brightness);
                });
                brightnessObserver.observe(video, { attributes: true, attributeFilter: ["style"] });
            }
        }

        // 触摸和鼠标共用方向判定；锁定方向后不再切换，纵向功能按起手所在半区决定。
        function moveGesture(x, y) {
            const current = gesture;
            const dx = x - current.x;
            const dy = y - current.y;
            if (current.mode === "pending" && Math.hypot(dx, dy) > 12) {
                clearTimeout(current.timer);
                if (Math.abs(dx) > Math.abs(dy) * 1.2) {
                    if (seekTarget(current.start) === null) { finish(); return false; }
                    current.mode = "seek";
                } else if (Math.abs(dy) > Math.abs(dx) * 1.2) {
                    current.mode = current.left ? "brightness" : "volume";
                    current.level = current.left ? brightness : video.muted ? 0 : video.volume;
                }
            }
            if (current.mode === "seek") {
                current.target = seekTarget(current.start + Math.round(dx / current.width * 120));
                if (current.target === null) { finish(); return false; }
                const delta = Math.round(current.target - current.start);
                show(`${delta >= 0 ? "+" : ""}${delta} 秒  ${time(current.target)} / ${time(video.duration)}`);
            } else if (current.mode === "brightness") {
                setBrightness(Math.max(0.2, Math.min(1, current.level - dy / current.height)));
                show(`画面亮度 ${Math.round(brightness * 100)}%`, 1000);
            } else if (current.mode === "volume") {
                const volume = Math.max(0, Math.min(1, current.level - dy / current.height));
                try {
                    video.volume = volume;
                    // 部分移动浏览器会忽略 volume 写入，不显示虚假的调整结果或意外解除静音。
                    if (Math.abs(video.volume - volume) > 0.01) throw new Error("Volume unavailable");
                    video.muted = volume === 0;
                    show(`音量 ${Math.round(video.volume * 100)}%`, 1000);
                } catch { show("浏览器限制音量调节，请使用设备音量键", 1200); }
            }
            return current.mode !== "pending";
        }

        // 统一结束触摸/鼠标手势：恢复临时倍速，并按需提交预览中的跳转位置。
        function finish(commit = false) {
            if (!gesture) return;
            const current = gesture;
            gesture = null;
            clearTimeout(current.timer);
            if (current.mode !== "pending") suppressClickUntil = Date.now() + 700;
            if (current.mode === "brightness" || current.mode === "volume") restorePrompt();
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
            if (isOutsideGestureArea(point.clientX, point.clientY, rect)) return;
            finish();
            gesture = {
                id: point.identifier, x: point.clientX, y: point.clientY, width: rect.width, height: Math.max(1, rect.height),
                left: point.clientX < rect.left + rect.width / 2,
                start: video.currentTime, target: video.currentTime, mode: "pending", rate: video.playbackRate
            };
            armHold(gesture);
            // 起手时不阻止默认行为，保留单击和双指缩放；确认拖动方向后才接管。
            event.stopPropagation();
        }, { capture: true, passive: true });

        listen(root, "touchmove", event => {
            if (!gesture) return;
            if (!event.cancelable) { finish(); return; }
            if (event.touches.length !== 1) { finish(); return; }
            const point = [...event.touches].find(touch => touch.identifier === gesture.id);
            if (!point) { finish(); return; }
            if (moveGesture(point.clientX, point.clientY)) {
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
            if (isOutsideGestureArea(event.clientX, event.clientY, rect)) return;
            finish();
            const current = gesture = {
                mode: "pending", mouse: true, x: event.clientX, y: event.clientY, width: rect.width, height: Math.max(1, rect.height),
                left: event.clientX < rect.left + rect.width / 2,
                start: video.currentTime, target: video.currentTime
            };
            armHold(current);
        }, { capture: true });
        listen(window, "mousemove", event => {
            if (!gesture?.mouse) return;
            if (!(event.buttons & 1)) { finish(); return; }
            if (moveGesture(event.clientX, event.clientY)) {
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
                clearTimeout(tapTimer);
                fullscreenObserver.disconnect();
                subtitleResize?.disconnect();
                root.style.removeProperty("--tm115-subtitle-scale");
                controlsObserver?.disconnect();
                brightnessObserver?.disconnect();
                if (brightnessFilter && video.style.getPropertyValue("filter") === brightnessFilter.applied) {
                    if (brightnessFilter.value) video.style.setProperty("filter", brightnessFilter.value, brightnessFilter.priority);
                    else video.style.removeProperty("filter");
                }
                for (const node of nativeControls) node.classList.remove("tm115-native-controls");
                lockButton.remove();
                restorePrompt();
                feedback?.remove();
                abort.abort();
                for (const [button, current] of zoomButtons) button.classList.toggle("current", current);
                root.classList.remove("tm115-player", "tm115-player-mobile", "tm115-legacy", "tm115-cover", "tm115-locked", "tm115-controls-hidden");
                root.style.removeProperty('--tm115-scale');
                if (video.getAttribute("playsinline") === "") {
                    if (previousInline == null) video.removeAttribute("playsinline");
                    else video.setAttribute("playsinline", previousInline);
                }
                if (legacy && !document.querySelector('.tm115-legacy video')) resetMobileViewport();
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
        for (const player of players.values()) {
            player.root.classList.toggle("tm115-player-mobile", isMobileContext() && isCompactViewport());
            if (!isMobileDevice()) player.root.classList.remove("tm115-controls-hidden");
        }
        fullscreenOrientation?.sync();
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

        function getPlaybackURL(code, name, fid) {
            // 重新构造播放地址，避免沿用旧 fid 等参数而跳回上一视频或产生 404。
            const url = new URL(legacy ? "/" : `/players/video/${encodeURIComponent(code)}`, location.origin);
            if (legacy) {
                if (!/(^|\.)115vod\.com$/.test(location.hostname)) url.searchParams.set("ct", "play");
                url.searchParams.set("pickcode", code);
                url.searchParams.set("hls", "1");
            } else {
                url.searchParams.set("name", name);
                if (fid) url.searchParams.set("fid", String(fid));
            }
            for (const key of ["sort_field", "sort_asc", "share_id"]) {
                if (pageURL.searchParams.has(key)) url.searchParams.set(key, pageURL.searchParams.get(key));
            }
            return url;
        }

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
                location.assign(getPlaybackURL(code, name, file.fid).href);
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
        refreshMobile();
        refreshAds();
        refreshPlayers();
        refreshPlaylists();
    }

    function shouldRefresh(records) {
        return records.some(record => {
            if (record.type !== "attributes") return !(record.target instanceof Element && record.target.closest(".tm115-playlist"));
            if (!isMobileContext()) return false;
            if (record.target === navigation) return true;
            const previous = record.oldValue?.split(/\s+/) || [];
            return ["tm115-navigation", "tm115-nav-toggle", "tm115-content", "tm115-player-mobile", "tm115-old-entry",
                "tm115-account", "tm115-account-trigger", "tm115-account-menu"]
                .some(name => previous.includes(name) && !record.target.classList.contains(name));
        });
    }

    function observePage() {
        // 115 会异步重建列表和播放器，使用 RAF 合并同一帧内的多次 DOM 变化。
        let queued = false;
        new MutationObserver(records => {
            if (!shouldRefresh(records) || queued) return;
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                refresh();
            });
        }).observe(document.documentElement, {
            childList: true, subtree: true,
            // 只响应站点覆盖适配标记；忽略 hover、选中和脚本自己的 class 写入。
            ...(mobileEnabled ? { attributes: true, attributeFilter: ["class", "style"], attributeOldValue: true } : {}),
        });
        window.addEventListener("popstate", refresh);
    }

    registerSettingsMenu();
    initBrowserDownloads();
    initMobile();
    initListMenus();
    fullscreenOrientation = initFullscreenOrientation();
    observePage();
    refresh();
})();
