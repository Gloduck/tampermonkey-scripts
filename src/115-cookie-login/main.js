// ==UserScript==
// @name         115 Cookie登录
// @namespace    115_cookie_login
// @author       Gloduck
// @license      MIT
// @version      1.6
// @description  115 Cookie登录、复制和浏览器退出，兼容新版与旧版页面
// @match        *://*.115.com/*
// @grant        GM_cookie
// @grant        GM_setClipboard
// @run-at       document-end
// @downloadURL https://update.greasyfork.org/scripts/474459/115%20Cookie%E7%99%BB%E5%BD%95.user.js
// @updateURL https://update.greasyfork.org/scripts/474459/115%20Cookie%E7%99%BB%E5%BD%95.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // 旧版文件工具栏位于 iframe 内，需要在各文档中分别注入并去重。
    if (document.documentElement.hasAttribute('data-115-cookie-login')) return;
    document.documentElement.setAttribute('data-115-cookie-login', '');

    const requiredNames = ['UID', 'CID', 'SEID'];
    const loginNames = [...requiredNames, 'KID'];
    const sessionNames = [...loginNames, 'USERSESSIONID', 'PHPSESSID'];
    const modernLogoutSelector = 'aside.container-leftside .absolute.left-full.bottom-0 ' +
        '> .bg-white.rounded-xl > .px-4.pb-4 > button:not([data-cookie-action])';
    const moreSelector = 'main button[title="更多操作"], main button:has(> img[src="/more.svg"])';
    const loginSwitchSelector = '#js-login_box > .desktop-login-panel ' +
        '> button.desktop-login-switch:not([data-cookie-action])';
    let busy = false;

    function cookieCall(method, details) {
        return new Promise((resolve, reject) => {
            const failure = () => reject(new Error(
                `Cookie ${method} 操作失败${details.name ? `（${details.name}）` : ''}。请检查 Tampermonkey 的 Cookie 权限及 GM_cookie / HttpOnly 支持，必要时使用支持该接口的 Beta 版本。`
            ));
            if (typeof GM_cookie === 'undefined' || typeof GM_cookie[method] !== 'function') {
                failure();
                return;
            }
            try {
                GM_cookie[method](details, (...args) => {
                    const error = method === 'list' ? args[1] : args[0];
                    if (error) failure();
                    else resolve(method === 'list' ? args[0] || [] : undefined);
                });
            } catch {
                // 接口错误可能包含凭据，不直接输出原始错误。
                failure();
            }
        });
    }

    function parseCookie(input) {
        const values = new Map();
        for (const part of input.trim().replace(/^Cookie:\s*/i, '').split(/[;\r\n]+/)) {
            const separator = part.indexOf('=');
            if (separator < 0) continue;
            const name = part.slice(0, separator).trim();
            if (!loginNames.includes(name)) continue;
            const value = part.slice(separator + 1).trim();
            if (!value || /[\s\x00-\x1f\x7f]/.test(value)) {
                throw new Error(`${name} 的值为空或包含非法字符，请重新复制 Cookie。`);
            }
            if (values.has(name) && values.get(name) !== value) {
                throw new Error(`${name} 存在多个不同的值，请勿混用不同账号的 Cookie。`);
            }
            values.set(name, value);
        }
        const missing = requiredNames.filter(name => !values.has(name));
        if (missing.length) throw new Error(`Cookie 缺少必填项：${missing.join('、')}。`);
        return values;
    }

    async function clearSessionCookies() {
        const isSessionCookie = cookie => sessionNames.includes(cookie.name) &&
            /(^|\.)115\.com$/.test(cookie.domain);
        const cookies = (await cookieCall('list', { domain: '115.com' })).filter(isSessionCookie);
        // 先清父域和长路径，避免按 URL 删除时命中另一条同名 Cookie。
        cookies.sort((a, b) => a.domain.replace(/^\./, '').length - b.domain.replace(/^\./, '').length ||
            b.path.length - a.path.length);
        for (const cookie of cookies) {
            await cookieCall('delete', {
                url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
                name: cookie.name,
                ...(cookie.firstPartyDomain !== undefined ? { firstPartyDomain: cookie.firstPartyDomain } : {}),
                ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
            });
        }
        if ((await cookieCall('list', { domain: '115.com' })).some(isSessionCookie)) {
            throw new Error('仍有登录 Cookie 未清除，已停止操作。请检查 Cookie 权限后重试。');
        }
    }

    async function showLogin() {
        const input = prompt('请输入 Cookie（将替换此浏览器的 115 登录状态）：');
        if (input === null) return;
        const values = parseCookie(input);
        if (!values.has('KID') && !confirm('Cookie 未包含 KID，可能导致无法登录。是否继续？')) return;
        const duration = prompt('请输入 Cookie 有效天数（1 - 400，仅影响浏览器保存期限）：', '30');
        if (duration === null) return;
        const days = Number(duration);
        if (!Number.isInteger(days) || days < 1 || days > 400) {
            throw new Error('有效天数必须是 1 - 400 之间的整数。');
        }
        await clearSessionCookies();
        const expirationDate = Math.floor(Date.now() / 1000) + 86400 * days;
        for (const [name, value] of values) {
            await cookieCall('set', {
                url: 'https://115.com/', domain: '.115.com', path: '/',
                name, value, secure: true, httpOnly: true, expirationDate,
            });
        }
        const written = await cookieCall('list', { url: 'https://115.com/' });
        if ([...values].some(([name, value]) => !written.some(cookie =>
            cookie.name === name && cookie.value === value))) {
            throw new Error('Cookie 写入校验失败，未刷新。请检查 Cookie 权限后重试。');
        }
        location.reload();
    }

    async function showCopy() {
        const cookies = await cookieCall('list', { url: 'https://115.com/' });
        const values = parseCookie(cookies.filter(cookie => loginNames.includes(cookie.name))
            .map(cookie => `${cookie.name}=${cookie.value}`).join(';'));
        if (typeof GM_setClipboard !== 'function') throw new Error('当前脚本管理器不支持剪贴板接口。');
        await new Promise((resolve, reject) => {
            try {
                GM_setClipboard(loginNames.filter(name => values.has(name))
                    .map(name => `${name}=${values.get(name)}`).join(';') + ';', 'text', resolve);
            } catch {
                reject(new Error('复制失败，请检查脚本管理器的剪贴板权限。'));
            }
        });
        alert('115 登录 Cookie 已复制到剪贴板，请勿向他人泄露。');
    }

    async function showLogout() {
        if (!confirm('仅清除此浏览器的 115 登录 Cookie，不调用服务端退出接口。是否继续？')) return;
        await clearSessionCookies();
        location.reload();
    }

    async function open(action) {
        if (busy) {
            alert('Cookie 操作正在进行，请稍候。');
            return;
        }
        busy = true;
        try {
            await action();
        } catch (error) {
            alert(error.message);
        } finally {
            busy = false;
        }
    }

    function addButton(parent, id, label, action, className, icon = '', template = null) {
        if (!parent || parent.querySelector(`[data-cookie-action="${id}"]`)) return;
        const button = document.createElement(template?.tagName || 'a');
        if (button.tagName === 'A') button.href = '#';
        else button.type = 'button';
        button.className = className;
        button.dataset.cookieAction = id;
        if (icon) {
            const image = icon.startsWith('/');
            const element = document.createElement(image ? 'img' : 'i');
            if (image) {
                element.src = icon;
                element.alt = '';
                element.className = template?.querySelector('img')?.className || 'w-5 h-5';
            } else {
                element.className = icon;
            }
            element.setAttribute('aria-hidden', 'true');
            button.appendChild(element);
        }
        const span = document.createElement('span');
        span.className = template?.querySelector('span')?.className || '';
        span.textContent = label;
        button.appendChild(span);
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            open(action);
        });
        if (template) template.after(button);
        else parent.appendChild(button);
    }

    function inject() {
        // 新版在对应的原生按钮旁注入，只借用样式，不克隆 React 事件或内部属性。
        const more = document.querySelector(moreSelector);
        if (more) addButton(more.parentElement, 'copy', '复制 Cookie', showCopy,
            more.className, '/icons/file_operate/copy.svg', more);
        const logout = document.querySelector(modernLogoutSelector);
        if (logout) addButton(logout.parentElement, 'logout', '浏览器退出', showLogout, logout.className, '', logout);
        const loginSwitch = document.querySelector(loginSwitchSelector);
        if (loginSwitch) addButton(loginSwitch.parentElement, 'login', '使用 Cookie 登录',
            showLogin, loginSwitch.className, '', loginSwitch);

        const footer = document.querySelector('.login-footer[rel="login_footer"]');
        if (footer && !footer.querySelector('[data-cookie-action="login"]')) {
            const span = document.createElement('span');
            if (footer.childElementCount) {
                const separator = document.createElement('i');
                separator.textContent = '|';
                span.appendChild(separator);
            }
            footer.appendChild(span);
            addButton(span, 'login', '使用 Cookie 登录', showLogin, '');
        }
        addButton(document.querySelector('.left-tvf[rel="left_tvf"]'),
            'copy', '复制Cookie', showCopy, 'button btn-line btn-upload', 'icon-operate ifo-copy');
        const account = document.querySelector('.cup-box');
        if (account && !account.querySelector('[data-cookie-action="logout"]')) {
            const row = document.createElement('div');
            row.className = 'cup-quit';
            account.appendChild(row);
            addButton(row, 'logout', '浏览器退出', showLogout, '', 'icon-info ifo-quit');
        }
    }

    let scheduled = false;
    const observer = new MutationObserver(records => {
        if (scheduled || !records.some(record =>
            Array.from(record.addedNodes).some(node => node.nodeType === Node.ELEMENT_NODE))) return;
        scheduled = true;
        // 固定窗口节流，连续变化不会延后执行；注入时暂停观察自身修改。
        setTimeout(() => {
            scheduled = false;
            observer.disconnect();
            try {
                inject();
            } finally {
                observer.observe(document.documentElement, { childList: true, subtree: true });
            }
        }, 150);
    });
    inject();
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
