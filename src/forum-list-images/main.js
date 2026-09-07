// ==UserScript==
// @name         论坛列表显示图片
// @namespace    form_show_images_in_list
// @version      1.5.3
// @description  论坛列表显示图片，同时支持discuz搭建的论坛（如吾爱破解）以及phpwind搭建的论坛（如south plus）等
// @license MIT
// @author       Gloduck
// @note         discuz路径匹配
// @match        *://*/forum-*.html
// @match        *://*/forum-*.html?*
// @match        *://*/forum.php
// @match        *://*/forum.php?*
// @match        *://*/*/forum-*.html
// @match        *://*/*/forum-*.html?*
// @match        *://*/*/forum.php
// @match        *://*/*/forum.php?*
// @note         phpwind路径匹配
// @match        *://*/*/thread.php
// @match        *://*/*/thread.php?*
// @match        *://*/thread.php
// @match        *://*/thread.php?*
// @note         1024路径匹配
// @match        *://*/*/thread0806.php*
// @match        *://*/thread0806.php*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @downloadURL https://update.greasyfork.org/scripts/474856/%E8%AE%BA%E5%9D%9B%E5%88%97%E8%A1%A8%E6%98%BE%E7%A4%BA%E5%9B%BE%E7%89%87.user.js
// @updateURL https://update.greasyfork.org/scripts/474856/%E8%AE%BA%E5%9D%9B%E5%88%97%E8%A1%A8%E6%98%BE%E7%A4%BA%E5%9B%BE%E7%89%87.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // <include:../shared/dialog.js>
    // <include:../shared/settings-dialog.js>

    GM_addStyle(`
        .zoomable-image {
            cursor: pointer;
        }

        .zoomable-image.zoomed {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: rgba(0, 0, 0, 0.9);
            z-index: 9999;
        }
    `);


    // 默认设置
    const defaultSettings = {
        enabled: false,
        lazyLoad: true,
        maxImageDisplayCount: 3,
        requestMaxDelay: 3000,
        defaultUa: null,
        ignoredImagePattern: []
    };

    // 当前设置变量
    let currentSettings = {};

    const settingsItems = [
        {
            label: "启用脚本",
            name: "enabled",
            type: "checkbox",
        },
        {
            label: "懒加载",
            name: "lazyLoad",
            type: "checkbox",
        },
        {
            label: "最大图片显示数量",
            name: "maxImageDisplayCount",
            type: "number",
            attributes: { min: "1", max: "10" },
            serializeValue: (value) => Number(value),
        },
        {
            label: "请求最大延迟(ms)",
            name: "requestMaxDelay",
            type: "number",
            attributes: { min: "0", max: "10000" },
            serializeValue: (value) => Number(value),
        },
        {
            label: "默认UA",
            name: "defaultUa",
            type: "text",
        },
        {
            label: "忽略图片",
            name: "ignoredImagePattern",
            type: "textarea",
            attributes: { rows: "5", placeholder: "一行输入一个，支持URL模式匹配..." },
            serializeValue: (value) => value.trim().split("\n").filter((line) => line.trim() !== ""),
            deserializeValue: (value) => (value ? value.join("\n") : ""),
        },
    ];

    const typeHandlers = [
        {
            // 类型名称
            name: "discuz",
            parseArticleElements: () => {
                return document.querySelectorAll('tbody[id^="normalthread_"]');
            },
            parseContentLink: (articleElement) => {
                return articleElement.querySelector('a[onclick="atarget(this)"]')?.href;
            },
            parsePostImage: (link, response) => {
                const images = [];
                const pageContent = new DOMParser().parseFromString(response, 'text/html');
                const postContent = pageContent.querySelector('div[id^="post_"] .plc .pct .pcb');
                if (!postContent) {
                    return images;
                }
                const imgElements = postContent.querySelectorAll('img[id^="aimg_"]');
                imgElements.forEach(img => {
                    let imageLink = null;
                    imageLink = img.getAttribute('file');
                    if (!imageLink) {
                        imageLink = img.getAttribute('src');
                    }
                    if (imageLink) {
                        images.push(convertPathToAccessible(imageLink, link));
                    }
                });
                return images;
            },
            insertImageContainer: (articleElement, imageContainer) => {
                const tbody = document.createElement("tbody");
                const tr = document.createElement("tr");
                tr.appendChild(imageContainer);
                tbody.appendChild(tr);
                insertElementBelow(articleElement, tbody);
            },
            urlPattern: [
                "*://*/forum-*.html",
                "*://*/forum-*.html?*",
                "*://*/forum.php",
                "*://*/forum.php?*",
                "*://*/*/forum-*.html",
                "*://*/*/forum-*.html?*",
                "*://*/*/forum.php",
                "*://*/*/forum.php?*"
            ],
            ignoredImagePattern: [
                "*://*/*/uc_server/images/*",
                "*://*/*/static/image/*",
                "*://*/*/data/avatar/*"
            ]
        },
        {
            name: "phpwind",
            parseArticleElements: () => {
                return document.querySelectorAll('#ajaxtable tbody:last-of-type tr[align=center]');
            },
            parseContentLink: (articleElement) => {
                return articleElement.querySelector('td a')?.href;
            },
            parsePostImage: (link, response) => {
                const images = [];
                const pageContent = new DOMParser().parseFromString(response, 'text/html');
                const postContent = pageContent.querySelector('.tpc_content');
                if (!postContent) {
                    return images;
                }
                const imgElements = postContent.querySelectorAll('img');
                imgElements.forEach(img => {
                    images.push(convertPathToAccessible(img.src, link));
                });
                return images;
            },
            insertImageContainer: (articleElement, imageContainer) => {
                let tr = document.createElement("tr");
                tr.align = "center";
                let td = document.createElement("td");
                td.colSpan = 5;
                tr.appendChild(td);
                td.appendChild(imageContainer);
                insertElementBelow(articleElement, tr);
            },
            urlPattern: [
                "*://*/*/thread.php",
                "*://*/*/thread.php?*",
                "*://*/thread.php",
                "*://*/thread.php?*"
            ],
            ignoredImagePattern: [
                "*://*/images/post/smile/*",
            ]
        },
        {
            name: "1024",
            parseArticleElements: () => {
                return document.querySelectorAll('tbody[id="tbody"] tr');
            },
            parseContentLink: (articleElement) => {
                return articleElement.querySelector('.tal h3 a')?.href;
            },
            parsePostImage: (link, response) => {
                const images = [];
                const pageContent = new DOMParser().parseFromString(response, 'text/html');
                const postContent = pageContent.querySelector('#conttpc');
                if (!postContent) {
                    return images;
                }
                const imgElements = postContent.querySelectorAll('img');
                imgElements.forEach(img => {
                    let imageLink = null;
                    imageLink = img.getAttribute('ess-data');
                    if (!imageLink) {
                        imageLink = img.getAttribute('src');
                    }
                    if (imageLink) {
                        images.push(convertPathToAccessible(imageLink, link));
                    }
                });
                return images;
            },
            insertImageContainer: (articleElement, imageContainer) => {
                let tr = document.createElement("tr");
                tr.align = "center";
                let td = document.createElement("td");
                td.colSpan = 5;
                tr.appendChild(td);
                td.appendChild(imageContainer);
                insertElementBelow(articleElement, tr);
            },
            urlPattern: [
                "*://*/*/thread0806.php*",
                "*://*/thread0806.php*"
            ],
            ignoredImagePattern: [
            ]
        }
    ];

    function chooseActiveHandler() {
        for (let handler of typeHandlers) {
            if (handler.urlPattern.some(pattern => matchUrl(window.location.href, pattern))) {
                console.log(`激活的配置为：${handler.name}`);
                return handler;
            }
        }
        return null;
    }

    function adjustDefaultSetting(handler) {
        if (handler.ignoredImagePattern) {
            defaultSettings.ignoredImagePattern = handler.ignoredImagePattern;
        }
    }

    function enhancementByHandler(handler, settings) {
        const articleList = handler.parseArticleElements();
        articleList.forEach(element => {
            if (settings.lazyLoad) {
                lazyEnhancement(element, handler, settings);
            } else {
                immediateEnhancement(element, handler, settings);
            }
        })
    }

    function lazyEnhancement(element, handler, settings) {
        window.addEventListener('scroll', throttle(function () {
            const targetElementRect = element.getBoundingClientRect();
            if (targetElementRect.top < window.innerHeight) {
                handleSingleArticle(element, handler, settings);

            }
        }, 200, 500));
    }

    function immediateEnhancement(element, handler, settings) {
        handleSingleArticle(element, handler, settings);
    }

    async function handleSingleArticle(element, handler, settings) {
        if (element.getAttribute("has_enhanced")) {
            return;
        }
        element.setAttribute("has_enhanced", "true");
        let link = handler.parseContentLink(element);
        if (link == null) {
            throw new Error("无法解析文章连接");
        }
        link = convertPathToAccessible(link, window.location.href);
        const headers = {};
        if (settings.defaultUa && settings.defaultUa.trim() !== "") {
            headers['User-Agent'] = settings.defaultUa;
        }
        const articleContent = await httpGetRequest(link, settings.requestMaxDelay, headers);
        if (!articleContent) {
            throw new Error("无法获取文章内容");
        }
        let images = handler.parsePostImage(link, articleContent);
        images = filterArticleImages(images, settings.ignoredImagePattern, settings.maxImageDisplayCount);
        const imageContainer = generateImageContainer(images);
        handler.insertImageContainer(element, imageContainer);
    }

    function generateImageContainer(images) {
        const imageDiv = document.createElement("div");
        imageDiv.style = "display: flex;";
        imageDiv.className = "image_list";
        images.forEach(value => {
            const imgElement = document.createElement("img");
            imgElement.src = value;
            imgElement.style = "max-width: 300px;max-height: 300px;margin-right: 10px"
            imageDiv.appendChild(imgElement);
            imgElement.addEventListener('click', function () {
                var zoomedImg = document.createElement('img');
                zoomedImg.src = imgElement.src;

                zoomedImg.classList.add('zoomable-image', 'zoomed');

                zoomedImg.addEventListener('click', function () {
                    document.body.removeChild(zoomedImg);
                });

                document.body.appendChild(zoomedImg);
            });
        })
        const htmlDivElement = document.createElement("div");
        htmlDivElement.appendChild(imageDiv);
        return htmlDivElement;
    }

    function filterArticleImages(images, ignoredImagePattern, showCount) {
        return images.filter(img => {
            return !ignoredImagePattern.some(pattern => {
                return matchUrl(img, pattern)
            });
        }).slice(0, showCount);
    }

    function convertPathToAccessible(path, currentPath) {
        var url = new URL(path, currentPath);
        return url.href;
    }

    function insertElementBelow(targetElement, newElement) {
        var parentElement = targetElement.parentNode;
        parentElement.insertBefore(newElement, targetElement.nextSibling);
    }



    function httpGetRequest(url, maxDelay, headers) {
        return new Promise((resolve, reject) => {
            const delay = Math.random() * maxDelay;
            setTimeout(() => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: {
                        ...headers,
                    },
                    onload: function (response) {
                        resolve(response.responseText);
                    },
                    onerror: function (error) {
                        reject(error);
                    }
                });
            }, delay);
        });
    }



    function matchUrl(url, pattern) {
        if (typeof url !== 'string' || typeof pattern !== 'string' || !pattern) {
            return false;
        }

        // 解析URL
        let parsedUrl;
        try {
            const urlObj = new URL(url);
            parsedUrl = {
                protocol: urlObj.protocol,
                domain: urlObj.hostname,
                path: urlObj.pathname + urlObj.search + urlObj.hash
            };
        } catch (e) {
            return false; // URL解析失败
        }

        // 验证模式格式
        if (!/^([*]|https?):\/\//.test(pattern)) {
            return false;
        }

        // 转换模式为正则表达式
        let regexStr = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义正则特殊字符
            .replace(/\*/g, '.*?') // 将*替换为非贪婪匹配
            .replace(/^(\*):\/\//, '(http|https):\/\/'); // 处理*://的情况

        // 创建正则表达式并添加锚点
        const regex = new RegExp(`^${regexStr}$`);

        // 组合URL各部分并执行匹配
        const fullUrl = parsedUrl.protocol + '//' + parsedUrl.domain + parsedUrl.path;
        return regex.test(fullUrl);
    }

    /**
     * 节流
     * @param func {function} 回调函数
     * @param wait 延迟执行时间(ms)
     * @param mustRun 必须执行时间(ms)
     * @returns {(function(): void)|*}
     */
    function throttle(func, wait, mustRun) {
        var timeout,
            startTime = new Date();

        return function () {
            var context = this,
                args = arguments,
                curTime = new Date();

            clearTimeout(timeout);
            // 如果达到了规定的触发时间间隔，触发 handler
            if (curTime - startTime >= mustRun) {
                func.apply(context, args);
                startTime = curTime;
                // 没达到触发间隔，重新设定定时器
            } else {
                timeout = setTimeout(func, wait);
            }
        };
    };

    // 初始化设置
    function initSettings() {
        const saveSettings = GM_getValue(getSettingName()) ?? {};
        settingsItems.forEach(item => {
            const savedValue = saveSettings[item.name];
            currentSettings[item.name] = savedValue !== undefined ? savedValue : defaultSettings[item.name];
        });
        console.log(`当前脚本设置：${JSON.stringify(currentSettings)}`);
    }

    function getSettingName() {
        return window.location.host + '_settings';
    }

    async function showMenu() {
        const values = await SettingsDialog.open({
            title: "论坛列表显示图片设置",
            items: settingsItems,
            values: currentSettings,
            confirmText: "保存",
            cancelText: "取消",
            secondaryText: "恢复默认",
            onSecondary: (panel) => {
                const form = panel.querySelector("form");
                form.replaceChildren();
                settingsItems.forEach((item) => {
                    form.appendChild(SettingsDialog.createItem(item, defaultSettings[item.name]));
                });
                return false;
            },
        });
        if (values === null) return;

        Object.assign(currentSettings, values);
        GM_setValue(getSettingName(), currentSettings);
        await Dialog.alert("保存成功", "设置已保存", "success", "确认");
    }

    // 初始化
    const handler = chooseActiveHandler();
    if (handler == null) {
        return;
    }
    adjustDefaultSetting(handler);
    initSettings();
    GM_registerMenuCommand('脚本设置', showMenu, 's');
    if (!currentSettings.enabled) {
        return;
    }
    enhancementByHandler(handler, currentSettings);
})();
