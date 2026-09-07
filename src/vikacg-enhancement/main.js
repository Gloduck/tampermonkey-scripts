// ==UserScript==
// @name         Vikacg增强脚本
// @namespace    vikacg_enhancement
// @version      1.0
// @description  Vikacg添加一些增强功能
// @author       Gloduck
// @license      MIT
// @run-at       document-body
// @match        *://www.vikacg.com/*
// @require      https://cdn.bootcdn.net/ajax/libs/crypto-js/4.2.0/crypto-js.min.js
// ==/UserScript==

(function () {
    'use strict';
    // ====================== 全局配置（固定不变） ======================
    const CONFIG = {
        aesKey: '7R75R3JZE2PZUTHH',
        aesIv: 'XWO76NCVZM2X1UCU'
    };

    /**
     * AES解密 e 参数
     * 加密核心：原始URL → H.encrypt → encodeURIComponent → e参数
     * 解密核心：e参数 → decodeURIComponent → H.decrypt → 原始URL
     */
    function decryptE(eParam) {
        try {
            const key = CryptoJS.enc.Utf8.parse(CONFIG.aesKey);
            const iv = CryptoJS.enc.Utf8.parse(CONFIG.aesIv);
            const decoded = decodeURIComponent(eParam);
            const hexParsed = CryptoJS.enc.Hex.parse(decoded);
            const base64Str = CryptoJS.enc.Base64.stringify(hexParsed);
            return CryptoJS.AES.decrypt(base64Str, key, {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }).toString(CryptoJS.enc.Utf8);
        } catch (err) {
            console.error('解密失败：', err);
            return null;
        }
    }

    function getParam(key) {
        return new URLSearchParams(window.location.search).get(key);
    }

    function autoRedirectExternalLink() {
        if (!window.location.pathname.includes('/external')) return;
        const eParam = getParam('e');
        if (!eParam) {
            return;
        }
        const realUrl = decryptE(eParam);
        if (realUrl) {
            window.location.href = realUrl;
        }
    }

    function removeInitNotification() {
        const scriptStartTime = Date.now();
        const initSeconds = 10 * 1000;

        const clearPopup = () => {
            const currentTime = Date.now();
            if (currentTime - scriptStartTime <= initSeconds) {
                const popup = document.querySelector('.arco-overlay-notification');
                if (popup) {
                    popup.remove();
                }
            }
        };

        clearPopup();

        const observer = new MutationObserver(() => clearPopup());
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => observer.disconnect(), initSeconds);
    }

    function removeAppBottomBar() {
        const appBar = document.querySelector('.tablet\\:hidden');
        if (appBar) {
            appBar.remove();
        }

        const observer = new MutationObserver(() => {
            const bar = document.querySelector('.tablet\\:hidden');
            if (bar) bar.remove();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    removeInitNotification();
    removeAppBottomBar();
    autoRedirectExternalLink();
})();