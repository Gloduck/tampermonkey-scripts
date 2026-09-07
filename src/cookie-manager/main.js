// ==UserScript==
// @name         Cookie管理器
// @namespace    cookie_manager
// @version      1.4
// @description  支持Cookie跨机器同步，使用Github仓库作为远程存储（Cookie为敏感信息，不要使用公共仓库，请使用私有仓库）
// @author       Gloduck
// @license      MIT
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_cookie
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @connect      api.github.com
// @noframes
// @downloadURL https://update.greasyfork.org/scripts/542258/Cookie%E7%AE%A1%E7%90%86%E5%99%A8.user.js
// @updateURL https://update.greasyfork.org/scripts/542258/Cookie%E7%AE%A1%E7%90%86%E5%99%A8.meta.js
// ==/UserScript==

(function () {
    "use strict";

    // <include:../shared/dialog.js>
    // <include:../shared/settings-dialog.js>

    // 配置存储键名
    const CONFIG_KEYS = {
        TOKEN: "GITHUB_TOKEN",
        OWNER: "GITHUB_OWNER",
        REPO: "GITHUB_REPO",
        BRANCH: "GITHUB_BRANCH",
    };

    const DB_FILE = {
        PATH: "db",
        FILE: "cookie",
    };

    // 获取当前配置
    async function getConfig() {
        return {
            token: await GM_getValue(CONFIG_KEYS.TOKEN, ""),
            owner: await GM_getValue(CONFIG_KEYS.OWNER, ""),
            repo: await GM_getValue(CONFIG_KEYS.REPO, ""),
            branch: await GM_getValue(CONFIG_KEYS.BRANCH, "main"),
        };
    }

    async function showGitConfigDialog() {
        const config = await getConfig();
        const formValues = await SettingsDialog.open({
            title: "GitHub 仓库设置",
            items: githubSettingsItems,
            values: config,
            confirmText: "确认",
            cancelText: "取消",
        });

        if (formValues !== null) {
            await GM_setValue(CONFIG_KEYS.OWNER, formValues.owner);
            await GM_setValue(CONFIG_KEYS.REPO, formValues.repo);
            await GM_setValue(CONFIG_KEYS.BRANCH, formValues.branch);
            await GM_setValue(CONFIG_KEYS.TOKEN, formValues.token);
            showAlert("保存成功!", "仓库配置已更新", "success");
        }
    }

    async function clearGitConfig() {
        const isConfirmed = await showConfirm({
            title: "确认清除",
            message: "该操作将删除所有保存的GitHub配置",
        });

        if (isConfirmed) {
            await GM_deleteValue(CONFIG_KEYS.TOKEN);
            await GM_deleteValue(CONFIG_KEYS.OWNER);
            await GM_deleteValue(CONFIG_KEYS.REPO);
            await GM_deleteValue(CONFIG_KEYS.BRANCH);
            showAlert("已清除!", "所有配置已删除", "success");
        }
    }

    function getRootDomain() {
        const hostname = window.location.hostname;
        if (!hostname) return "";

        const specialSuffixes = [
            "com.cn",
            "net.cn",
            "org.cn",
            "gov.cn",
            "edu.cn",
            "co.uk",
            "org.uk",
            "gov.uk",
            "ac.uk",
            "com.au",
            "org.au",
            "net.au",
            "com.sg",
            "org.sg",
            "net.sg",
            "co.jp",
            "or.jp",
            "go.jp",
            "ac.jp",
            "com.hk",
            "org.hk",
            "net.hk",
        ];

        const parts = hostname.split(".");
        const len = parts.length;

        if (len <= 2) {
            return hostname;
        }

        const lastTwoParts = `${parts[len - 2]}.${parts[len - 1]}`;
        const lastThreeParts = `${parts[len - 3]}.${lastTwoParts}`;

        if (specialSuffixes.includes(lastThreeParts)) {
            return lastThreeParts;
        } else if (specialSuffixes.includes(lastTwoParts)) {
            return `${parts[len - 3]}.${lastTwoParts}`;
        }

        return `${parts[len - 2]}.${parts[len - 1]}`;
    }

    function getSupportCookieNames(fetchData) {
        return fetchData && fetchData.supportNames && fetchData.supportNames.length != 0
            ? fetchData.supportNames
            : null;
    }

    function showLoading(title) {
        return Dialog.loading(title);
    }

    function showAlert(title, message, type) {
        return Dialog.alert(title, message, type, "确认");
    }

    function showConfirm(options) {
        return Dialog.confirm({
            ...options,
            confirmText: options.confirmText || "确认",
            cancelText: options.cancelText || "取消",
        });
    }

    async function readCookie() {
        const isConfirmed = await showConfirm({
            title: "确认读取",
            message: "该操作将使用远程Cookie覆盖掉本地的Cookie",
        });
        if (!isConfirmed) {
            return;
        }

        let readLoading = null;
        try {
            const rootDomain = getRootDomain();
            readLoading = showLoading("加载中...");
            const fetchData = await GithubCsvDb.selectFrom(DB_FILE.FILE).eq("domain", rootDomain).fetchOne();
            await readLoading.close();

            if (!fetchData) {
                showAlert("读取失败", "Cookie不存在，请先创建Cookie", "error");
                return;
            }

            const supportCookieNames = getSupportCookieNames(fetchData);
            let cookies = JSON.parse(fetchData.cookies);

            // 检查过期Cookie
            const now = Math.floor(Date.now() / 1000); // 当前时间戳（秒）
            const expiredCookies = [];
            const validCookies = [];

            cookies.forEach((cookie) => {
                if (supportCookieNames != null && !supportCookieNames.includes(cookie.name)) {
                    return;
                }
                if (cookie.expirationDate && cookie.expirationDate < now) {
                    expiredCookies.push(cookie);
                } else {
                    validCookies.push(cookie);
                }
            });

            // 处理过期Cookie
            if (expiredCookies.length > 0) {
                const expireCookieNames = expiredCookies.map((value) => value.name).join(",");
                const forceWrite = await showConfirm({
                    title: "存在过期Cookie",
                    message: `有 ${expiredCookies.length} 个Cookie已过期\n是否强制写入？\n${expireCookieNames}`,
                    type: "question",
                    confirmText: "强制写入",
                    cancelText: "取消操作",
                });
                if (!forceWrite) {
                    return;
                }
            }

            // 先删除原有Cookie
            const deletePromises = cookies.map(
                (cookie) =>
                    new Promise((resolve, reject) => {
                        GM_cookie.delete(
                            {
                                name: cookie.name,
                                domain: cookie.domain,
                                path: cookie.path,
                                secure: cookie.secure,
                                httpOnly: cookie.httpOnly,
                            },
                            (error) => {
                                error ? reject(error) : resolve();
                            },
                        );
                    }),
            );

            await Promise.all(deletePromises);

            const setCookiePromises = validCookies.map(
                (cookie) =>
                    new Promise((resolve, reject) => {
                        GM_cookie.set(cookie, (error) => {
                            error ? reject(error) : resolve();
                        });
                    }),
            );

            await Promise.all(setCookiePromises);

            showAlert("读取成功", "Cookie已成功写入，页面即将刷新", "success").then(() => {
                window.location.reload();
            });
        } catch (error) {
            if (readLoading) {
                await readLoading.close();
            }
            showAlert("读取失败", `错误信息: ${error.message || error}`, "error");
        }
    }

    async function createDbIfNotExist() {
        let readLoading = null;
        let success = false;
        try {
            readLoading = showLoading("检查数据库...");
            const dbCreated = await GithubCsvDb.createIfNotExist(DB_FILE.FILE, [
                "domain",
                "supportNames",
                "cookies",
                "createTime",
                "updateTime",
            ]);
            await readLoading.close();

            if (dbCreated) {
                console.log("[Cookie管理器] 数据库不存在，已创建数据库");
            }
            success = true;
        } catch (error) {
            if (readLoading) {
                await readLoading.close();
            }
            showAlert("创建数据库失败", `错误信息: ${error.message || error}`, "error");
        }
        return success;
    }

    async function setSupportCookieNames() {
        if (!(await createDbIfNotExist())) {
            return;
        }
        let readLoading = null;
        let saveLoading = null;
        try {
            const domain = getRootDomain();
            readLoading = showLoading("加载中...");
            const existingRecord = await GithubCsvDb.selectFrom(DB_FILE.FILE).eq("domain", domain).fetchOne();
            await readLoading.close();
            const supportCookieNames = existingRecord ? existingRecord.supportNames : "";
            const value = await SettingsDialog.open({
                title: "允许的Cookie名",
                items: cookieNameSettingsItems,
                values: { supportNames: supportCookieNames },
                confirmText: "确认",
                cancelText: "取消",
                secondaryText: "解析必要Cookie",
                onSecondary: (panel, secondaryButton) => {
                    try {
                        secondaryButton.disabled = true;
                        const result = parseRequireCookie();
                        if (!result) {
                            Dialog.showError("无法解析当前网站必要Cookie");
                        } else {
                            panel.querySelector('[name="supportNames"]').value = result;
                        }
                    } catch (error) {
                        Dialog.showError(`解析失败: ${error.message || error}`);
                    } finally {
                        secondaryButton.disabled = false;
                    }
                    return false;
                },
            });

            if (value === null) {
                return;
            }
            const now = Date.now();
            saveLoading = showLoading("保存中...");

            if (existingRecord) {
                await GithubCsvDb.update(DB_FILE.FILE)
                    .eq("domain", domain)
                    .set("supportNames", value.supportNames)
                    .set("updateTime", now)
                    .execute();
            } else {
                await GithubCsvDb.insertInto(DB_FILE.FILE)
                    .value({
                        domain,
                        cookies: "",
                        supportNames: value.supportNames,
                        createTime: now,
                        updateTime: now,
                    })
                    .execute();
            }

            await saveLoading.close();
            showAlert("设置成功", "允许的Cookie名已成功保存到数据库", "success");
        } catch (error) {
            if (readLoading) {
                await readLoading.close();
            }
            if (saveLoading) {
                await saveLoading.close();
            }
            showAlert("设置失败", `错误信息: ${error.message || error}`, "error");
        }
    }

    async function writeCookie() {
        const isConfirmed = await showConfirm({
            title: "确认保存",
            message: "该操作将保存当前网站Cookie到远程，如果已经存在则会覆盖",
        });
        if (!isConfirmed) {
            return;
        }
        if (!(await createDbIfNotExist())) {
            return;
        }
        let readLoading = null;
        let saveLoading = null;

        try {
            const domain = getRootDomain();

            const cookies = await new Promise((resolve, reject) => {
                GM_cookie.list({}, (cookies, error) => {
                    if (error) {
                        reject(`获取Cookie失败: ${error}`);
                        return;
                    }
                    resolve(cookies);
                });
            });

            readLoading = showLoading("加载中...");
            const existingRecord = await GithubCsvDb.selectFrom(DB_FILE.FILE).eq("domain", domain).fetchOne();
            await readLoading.close();

            const supportCookieNames = getSupportCookieNames(existingRecord);
            const validCookies = [];

            cookies.forEach((cookie) => {
                if (supportCookieNames != null && !supportCookieNames.includes(cookie.name)) {
                    return;
                }
                validCookies.push(cookie);
            });
            const cookiesStr = JSON.stringify(validCookies);
            const now = Date.now();

            saveLoading = showLoading("保存中...");
            if (existingRecord) {
                await GithubCsvDb.update(DB_FILE.FILE)
                    .eq("domain", domain)
                    .set("cookies", cookiesStr)
                    .set("updateTime", now)
                    .execute();
            } else {
                await GithubCsvDb.insertInto(DB_FILE.FILE)
                    .value({
                        domain,
                        cookies: cookiesStr,
                        supportNames: "",
                        createTime: now,
                        updateTime: now,
                    })
                    .execute();
            }
            await saveLoading.close();
            showAlert("保存成功", "Cookie已成功保存到数据库", "success");
        } catch (error) {
            if (readLoading) {
                await readLoading.close();
            }
            if (saveLoading) {
                await saveLoading.close();
            }
            showAlert("保存失败", `错误信息: ${error.message || error}`, "error");
        }
    }

    async function clearLocalCookie() {
        const isConfirmed = await showConfirm({
            title: "确认清空",
            message: "该操作将清空本地所有的Cookie",
        });
        if (!isConfirmed) {
            return;
        }
        try {
            const rootDomain = getRootDomain();

            const allCookies = await new Promise((resolve, reject) => {
                GM_cookie.list({ domain: rootDomain }, (cookies, error) => {
                    error ? reject(error) : resolve(cookies);
                });
            });

            if (!allCookies || allCookies.length === 0) {
                showAlert("清除成功", "当前域名下没有找到可清除的 Cookie", "success");
                return;
            }

            const deletePromises = allCookies.map(
                (cookie) =>
                    new Promise((resolve, reject) => {
                        GM_cookie.delete(
                            {
                                name: cookie.name,
                                domain: cookie.domain,
                                path: cookie.path,
                                secure: cookie.secure,
                                httpOnly: cookie.httpOnly,
                            },
                            (error) => {
                                error ? reject(error) : resolve();
                            },
                        );
                    }),
            );

            await Promise.all(deletePromises);

            showAlert("清除成功", `已成功删除 ${allCookies.length} 个 Cookie，页面即将刷新`, "success").then(() => {
                window.location.reload();
            });
        } catch (error) {
            showAlert("清除失败", `错误信息: ${error.message || error}`, "error");
        }
    }

    async function showCookieManager() {
        let readLoading = null;
        try {
            readLoading = showLoading("加载中...");
            const cookies = await GithubCsvDb.selectFrom(DB_FILE.FILE).fetch();

            await readLoading.close();

            let tableHTML = `
                <style>
                    .cookie-manager-table {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                    }
                    .cookie-manager-table th, 
                    .cookie-manager-table td {
                        padding: 10px;
                        text-align: left;
                        border-bottom: 1px solid #ddd;
                        border-right: 1px solid #ddd;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    .cookie-manager-table th {
                        background-color: #f2f2f2;
                        position: sticky;
                        top: 0;
                        font-weight: bold;
                    }
                    .cookie-manager-table tr:last-child td {
                        border-bottom: none;
                    }
                    .cookie-manager-table td:last-child, 
                    .cookie-manager-table th:last-child {
                        border-right: none;
                    }
                    .cookie-manager-container {
                        max-height: 60vh;
                        overflow-y: auto;
                    }
                    .action-btn {
                        color: white;
                        border: none;
                        padding: 5px 10px;
                        border-radius: 3px;
                        cursor: pointer;
                        transition: background-color 0.2s;
                        margin: 2px;
                        font-size: 12px;
                    }
                    .edit-btn {
                        background-color: #4CAF50;
                    }
                    .edit-btn:hover {
                        background-color: #45a049;
                    }
                    .delete-btn {
                        background-color: #ff6b6b;
                    }
                    .delete-btn:hover {
                        background-color: #ff5252;
                    }
                    .action-btn:disabled {
                        background-color: #cccccc;
                        cursor: not-allowed;
                    }
                    .btn-container {
                        display: flex;
                        flex-direction: column;
                        gap: 5px;
                    }
                </style>
                <div class="cookie-manager-container">
                <table class="cookie-manager-table">
                    <thead>
                        <tr>
                            <th style="width: 20%;">域名</th>
                            <th style="width: 20%;">允许Cookie名</th>
                            <th style="width: 40%;">值</th>
                            <th style="width: 20%;">操作</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            cookies.forEach((cookie) => {
                tableHTML += `
                    <tr data-domain="${escapeHTML(cookie.domain)}">
                        <td>${escapeHTML(cookie.domain)}</td>
                        <td>${getSupportCookieNames(cookie) ? escapeHTML(cookie.supportNames) : "全部"}</td>
                        <td>${escapeHTML(cookie.cookies)}</td>
                        <td>
                            <div class="btn-container">
                                <button class="action-btn edit-btn" 
                                    data-domain="${escapeHTML(cookie.domain)}">
                                    编辑
                                </button>
                                <button class="action-btn delete-btn" 
                                    data-domain="${escapeHTML(cookie.domain)}">
                                    删除
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            tableHTML += `
                    </tbody>
                </table>
                </div>
            `;

            await Dialog.custom({
                title: "Cookie管理",
                content: tableHTML,
                width: "80%",
                confirmText: null,
                closeButton: true,
                onOpen: (popup) => {
                    popup.querySelectorAll(".delete-btn").forEach((button) => {
                        button.addEventListener("click", async (e) => {
                            const btn = e.currentTarget;
                            const targetDomain = btn.dataset.domain;
                            handleDeleteCookie(btn, targetDomain);
                        });
                    });

                    popup.querySelectorAll(".edit-btn").forEach((button) => {
                        button.addEventListener("click", async (e) => {
                            const btn = e.currentTarget;
                            const targetDomain = btn.dataset.domain;
                            handleEditCookie(btn, targetDomain);
                        });
                    });
                },
            });
        } catch (error) {
            if (readLoading) {
                await readLoading.close();
            }
            showAlert("加载失败", `无法获取Cookie列表: ${error.message || error}`, "error");
        }
    }

    async function handleDeleteCookie(button, domain) {
        button.textContent = "删除中...";
        button.disabled = true;

        try {
            const deleteCount = await GithubCsvDb.deleteFrom(DB_FILE.FILE).eq("domain", domain).execute();

            if (deleteCount > 0) {
                button.closest("tr").remove();
                showAlert("删除成功", `已删除 ${domain} 的Cookie`, "success");
            }
        } catch (error) {
            button.textContent = "删除";
            button.disabled = false;
            showAlert("删除失败", `无法删除Cookie: ${error.message || error}`, "error");
        }
    }
    async function handleEditCookie(button, domain) {
        button.textContent = "加载中...";
        button.disabled = true;

        try {
            const cookieRecord = await GithubCsvDb.selectFrom(DB_FILE.FILE).eq("domain", domain).fetchOne();

            button.textContent = "编辑";
            button.disabled = false;

            if (!cookieRecord) {
                showAlert("错误", `找不到 ${domain} 的Cookie记录`, "error");
                return;
            }

            let formattedCookies = cookieRecord.cookies;
            try {
                formattedCookies = JSON.stringify(JSON.parse(cookieRecord.cookies), null, 2);
            } catch (e) {}

            const result = await SettingsDialog.open({
                title: `编辑Cookie - ${domain}`,
                items: cookieRecordSettingsItems,
                values: {
                    supportNames: cookieRecord.supportNames || "",
                    cookies: formattedCookies,
                },
                confirmText: "保存",
                cancelText: "取消",
            });

            if (result !== null) {
                let jsonData;
                try {
                    jsonData = JSON.parse(result.cookies);
                } catch (error) {
                    await showAlert("格式错误", "Cookie值必须是有效的JSON格式", "error");
                    showCookieManager();
                    return;
                }

                const updateLoading = showLoading("保存中...");
                const now = Date.now();

                try {
                    await GithubCsvDb.update(DB_FILE.FILE)
                        .eq("domain", domain)
                        .set("supportNames", result.supportNames)
                        .set("cookies", JSON.stringify(jsonData))
                        .set("updateTime", now)
                        .execute();

                    await updateLoading.close();
                    await showAlert("更新成功", `${domain} 的Cookie已更新`, "success");
                } catch (error) {
                    await updateLoading.close();
                    await showAlert("保存失败", `保存时发生错误: ${error.message || error}`, "error");
                }
            }
            showCookieManager();
        } catch (error) {
            button.textContent = "编辑";
            button.disabled = false;
            await showAlert("编辑失败", `错误信息: ${error.message || error}`, "error");
            showCookieManager();
        }
    }

    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function parseRequireCookie() {
        const chains = [new DiscuzCookieFetcher(), new A115CookieFetcher()];
        for (let i = 0; i < chains.length; i++) {
            const fetcher = chains[i];
            if (fetcher.support()) {
                return fetcher.parseCookies().join(",");
            }
        }
        return null;
    }

    class RequireCookieFetcher {
        support() {
            return false;
        }
        parseCookies() {
            return null;
        }
    }

    class DiscuzCookieFetcher extends RequireCookieFetcher {
        support() {
            const html = document.documentElement.outerHTML;
            return /discuz_uid\s*=\s*(['"])?\d+\1/.test(html);
        }
        parseCookies() {
            const html = document.documentElement.outerHTML;
            const match = html.match(/cookiepre\s*=\s*(['"])([^'"]+)\1/);
            if (match) {
                return [`${match[2]}auth`, `${match[2]}saltkey`];
            }
            return null;
        }
    }

    class A115CookieFetcher extends RequireCookieFetcher {
        support() {
            return window.location.hostname.includes("115.com");
        }
        parseCookies() {
            return ["UID", "CID", "SEID", "KID"];
        }
    }

    const githubSettingsItems = [
        { name: "owner", label: "仓库所有者" },
        { name: "repo", label: "仓库名称" },
        {
            name: "branch",
            label: "分支",
            placeholder: "默认 main",
            serializeValue: (value) => value || "main",
        },
        { name: "token", label: "GitHub Personal Token", type: "password" },
    ];

    const cookieNameSettingsItems = [
        {
            name: "supportNames",
            label: "留空则同步所有Cookie，否则同步指定Cookie",
            placeholder: "多个名称用逗号分隔，例如: session, token",
            attributes: {
                "aria-label": "留空则同步所有Cookie，否则同步指定Cookie",
            },
        },
    ];

    const cookieRecordSettingsItems = [
        {
            name: "supportNames",
            label: "允许的Cookie名（逗号分隔）",
        },
        {
            name: "cookies",
            label: "Cookie值（JSON格式）",
            type: "textarea",
        },
    ];

    const GithubUtil = {
        createClient(config) {
            if (!config || !config.token || !config.owner || !config.repo) {
                throw new Error("GitHub client requires token, owner and repo");
            }
            const branch = config.branch || "main";

            const client = {
                async request(method, endpoint, data = null) {
                    const url = `https://api.github.com/repos/${config.owner}/${config.repo}${endpoint}`;
                    const options = {
                        method,
                        headers: {
                            Authorization: `Bearer ${config.token}`,
                            Accept: "application/vnd.github.v3+json",
                            "Content-Type": "application/json",
                        },
                        body: data ? JSON.stringify(data) : null,
                    };

                    try {
                        const response = await fetch(url, options);
                        if (!response.ok) {
                            let errorBody;
                            try {
                                errorBody = await response.json();
                            } catch (e) {
                                errorBody = {
                                    message: `GitHub API request failed: ${response.status} ${response.statusText}`,
                                };
                            }
                            throw {
                                status: response.status,
                                message: errorBody.message || "GitHub API request failed",
                                response: errorBody,
                            };
                        }
                        if (response.status === 204 || response.headers.get("Content-Length") === "0") {
                            return null;
                        }
                        return await response.json();
                    } catch (error) {
                        if (error.status) {
                            throw error;
                        }
                        throw {
                            status: 0,
                            message: "Network request failed",
                            error,
                        };
                    }
                },

                async createFile(path, content, message = "Created via Tampermonkey") {
                    const encodedContent = btoa(unescape(encodeURIComponent(content)));
                    return this.request("PUT", `/contents/${encodeURIComponent(path)}`, {
                        message,
                        content: encodedContent,
                        branch,
                    });
                },

                async updateFile(path, content, message = "Updated via Tampermonkey") {
                    const fileInfo = await this.getFileInfo(path);
                    const encodedContent = btoa(unescape(encodeURIComponent(content)));
                    return this.request("PUT", `/contents/${encodeURIComponent(path)}`, {
                        message,
                        content: encodedContent,
                        sha: fileInfo.sha,
                        branch,
                    });
                },

                async deleteFile(path, message = "Deleted via Tampermonkey") {
                    const fileInfo = await this.getFileInfo(path);
                    return this.request("DELETE", `/contents/${encodeURIComponent(path)}`, {
                        message,
                        sha: fileInfo.sha,
                        branch,
                    });
                },

                getFileInfo(path) {
                    return this.request("GET", `/contents/${encodeURIComponent(path)}?ref=${branch}&_=${Date.now()}`);
                },

                async fileExists(path) {
                    try {
                        await this.getFileInfo(path);
                        return true;
                    } catch (error) {
                        if (error.status === 404) {
                            return false;
                        }
                        throw error;
                    }
                },

                async getFileContent(path) {
                    const fileInfo = await this.getFileInfo(path);
                    if (fileInfo.encoding === "base64") {
                        return decodeURIComponent(escape(atob(fileInfo.content)));
                    }
                    return fileInfo.content;
                },

                async getAllFiles(path = "", files = []) {
                    const contents = await this.request("GET", `/contents/${encodeURIComponent(path)}?ref=${branch}`);
                    for (const item of contents) {
                        if (item.type === "file") {
                            files.push({ path: item.path, size: item.size, sha: item.sha });
                        } else if (item.type === "dir") {
                            await this.getAllFiles(item.path, files);
                        }
                    }
                    return files;
                },
            };
            return client;
        },
    };

    const CsvUtil = (() => {
        const util = {
            parseCsvLine(line) {
                const result = [];
                let current = "";
                let inQuotes = false;
                let i = 0;

                while (i < line.length) {
                    const char = line[i];

                    if (inQuotes) {
                        if (char === '"' && i + 1 < line.length && line[i + 1] === '"') {
                            current += '"';
                            i += 2;
                            continue;
                        } else if (char === '"') {
                            inQuotes = false;
                            i++;
                            continue;
                        } else {
                            current += char;
                            i++;
                        }
                    } else {
                        if (char === '"') {
                            inQuotes = true;
                            i++;
                        } else if (char === ",") {
                            result.push(CsvUtil.unescapeField(current));
                            current = "";
                            i++;
                        } else {
                            current += char;
                            i++;
                        }
                    }
                }
                result.push(CsvUtil.unescapeField(current));
                return result;
            },

            unescapeField(field) {
                return field.replace(/\\"/g, '"').replace(/\\,/g, ",");
            },

            escapeCsvField(field) {
                if (field == null) return "";
                if (typeof field !== "string") field = String(field);

                if (field.includes(",") || field.includes('"') || field.includes("\n")) {
                    return '"' + field.replace(/"/g, '""') + '"';
                }
                return field;
            },

            compareValue(a, b) {
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                return a.localeCompare(b, undefined, { numeric: true });
            },
            createFilter: () => csvDataFilter(),
            createFetcher: () => csvDataFetcher(),
            createModifier: () => csvModifyHandler(),
        };

        function csvDataFilter() {
            const _filters = [];

            function test(row) {
                return _filters.every((f) => f(row));
            }

            function eq(fieldName, value) {
                const strValue = value === null || value === undefined ? null : String(value);
                _filters.push((row) => {
                    const v = row[fieldName];
                    if (v === null || v === undefined) {
                        return strValue === null;
                    }
                    if (strValue === null) {
                        return false;
                    }
                    return v === strValue;
                });
            }

            function notEq(fieldName, value) {
                const strValue = value === null || value === undefined ? null : String(value);
                _filters.push((row) => {
                    const v = row[fieldName];
                    if (v === null || v === undefined) {
                        return strValue !== null;
                    }
                    if (strValue === null) {
                        return true;
                    }
                    return v !== strValue;
                });
            }

            function inValues(fieldName, ...values) {
                const set = new Set(values.map((v) => (v == null ? null : String(v))));
                _filters.push((row) => {
                    const v = row[fieldName];
                    const valueToCheck = v === undefined ? null : v;
                    return set.has(valueToCheck);
                });
            }

            function notIn(fieldName, ...values) {
                const set = new Set(values.map((v) => (v == null ? null : String(v))));
                _filters.push((row) => {
                    const v = row[fieldName];
                    const valueToCheck = v === undefined ? null : v;
                    return !set.has(valueToCheck);
                });
            }

            function like(fieldName, pattern) {
                const regex = new RegExp(
                    "^" +
                        pattern
                            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                            .replace(/%/g, ".*")
                            .replace(/_/g, ".") +
                        "$",
                );

                _filters.push((row) => {
                    const v = row[fieldName] ?? "";
                    return regex.test(v);
                });
            }

            function gt(fieldName, value) {
                _cmpHelper(fieldName, value, (cmpResult) => cmpResult > 0);
            }

            function ge(fieldName, value) {
                _cmpHelper(fieldName, value, (cmpResult) => cmpResult >= 0);
            }

            function lt(fieldName, value) {
                _cmpHelper(fieldName, value, (cmpResult) => cmpResult < 0);
            }

            function le(fieldName, value) {
                _cmpHelper(fieldName, value, (cmpResult) => cmpResult <= 0);
            }

            function _cmpHelper(fieldName, value, tester) {
                const strValue = value === null || value === undefined ? null : String(value);
                _filters.push((row) => {
                    const v = row[fieldName];
                    if (v == null || strValue == null) {
                        return false;
                    }
                    const cmpResult = CsvUtil.compareValue(v, strValue);
                    return tester(cmpResult);
                });
            }

            return {
                test,
                eq,
                notEq,
                inValues,
                notIn,
                like,
                gt,
                ge,
                lt,
                le,
            };
        }

        function csvDataFetcher() {
            const handler = {
                shouldHandleData(row) {
                    throw new Error("shouldHandleData must be implemented");
                },
                lineOffset() {
                    return 0;
                },
                lineLimit() {
                    return Number.MAX_VALUE;
                },
                orderField() {
                    return null;
                },
                orderDesc() {
                    return false;
                },
                selectField() {
                    return null;
                },
            };

            function fetch(csvContent) {
                const lines = csvContent.split("\n");
                if (lines.length === 0) {
                    throw new Error("CSV must contain a header");
                }

                const headers = CsvUtil.parseCsvLine(lines[0]);
                const records = [];

                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].trim()) continue;
                    const values = CsvUtil.parseCsvLine(lines[i]);
                    const row = {};
                    headers.forEach((header, index) => {
                        row[header] = values[index] || "";
                    });
                    if (!handler.shouldHandleData(row)) {
                        continue;
                    }
                    records.push(row);
                }
                const valueOrderFiled = handler.orderField();
                const valueOrderDesc = handler.orderDesc();
                if (valueOrderFiled != null) {
                    records.sort((a, b) => {
                        const v1 = a[valueOrderFiled];
                        const v2 = b[valueOrderFiled];
                        const cmpResult = CsvUtil.compareValue(v1, v2);
                        return valueOrderDesc ? -cmpResult : cmpResult;
                    });
                }
                const start = handler.lineOffset();
                const end = start + handler.lineLimit();
                const selectFields = handler.selectField();
                if (selectFields == null) {
                    return records.slice(start, end);
                } else {
                    return records.slice(start, end).map((row) => {
                        const newRow = {};
                        selectFields.forEach((field) => {
                            newRow[field] = row[field];
                        });
                        return newRow;
                    });
                }
            }

            return {
                fetch,
                handler,
            };
        }

        function csvModifyHandler() {
            const handler = {
                appendRows() {
                    throw new Error("shouldHandleData must be implemented");
                },

                shouldHandleData(row) {
                    throw new Error("shouldHandleData must be implemented");
                },

                handleData(row) {
                    throw new Error("handleData must be implemented");
                },
            };

            function execute(csvContent) {
                const lines = csvContent.split("\n");
                if (lines.length === 0) {
                    throw new Error("CSV must contain a header");
                }

                const headers = CsvUtil.parseCsvLine(lines[0]);
                const records = [];
                let affectedCount = 0;

                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].trim()) continue;
                    const values = CsvUtil.parseCsvLine(lines[i]);
                    const row = {};
                    headers.forEach((header, index) => {
                        row[header] = values[index] || "";
                    });

                    if (handler.shouldHandleData(row)) {
                        const newRow = handler.handleData({ ...row });
                        if (newRow !== null) {
                            records.push(prepareRecord(headers, newRow));
                        }
                        affectedCount++;
                    } else {
                        records.push(values);
                    }
                }

                for (const row of handler.appendRows()) {
                    records.push(prepareRecord(headers, row));
                    affectedCount++;
                }

                const newHeaders = headers.join(",");
                const newCsv = [
                    newHeaders,
                    ...records.map((values) => values.map((v) => CsvUtil.escapeCsvField(v)).join(",")),
                ].join("\n");
                return {
                    affectedCount: affectedCount,
                    csvContent: newCsv,
                };
            }

            function prepareRecord(headers, row) {
                return headers.map((header) => row[header] ?? "");
            }

            return {
                handler,
                execute,
            };
        }

        return util;
    })();

    const CsvDatabase = {
        create(source, csvPath) {
            async function createIfNotExist(csvFileName, headers) {
                const path = `${csvPath}/${csvFileName}.csv`;
                if (await source.exists(path)) {
                    return false;
                }
                await source.create(path, headers.join(",") + "\n");
                return true;
            }

            async function create(csvFileName, headers) {
                const path = `${csvPath}/${csvFileName}.csv`;
                const csvContent = headers.join(",") + "\n";
                await source.create(path, csvContent);
            }

            function update(csvFileName) {
                const updateFields = {};
                const path = `${csvPath}/${csvFileName}.csv`;
                const csvHandler = CsvUtil.createModifier();
                const csvFilter = CsvUtil.createFilter();
                csvHandler.handler.shouldHandleData = (row) => {
                    return csvFilter.test(row);
                };
                csvHandler.handler.handleData = (row) => {
                    Object.entries(updateFields).forEach(([field, newVal]) => {
                        row[field] = newVal === null || newVal === undefined ? null : String(newVal);
                    });
                    return row;
                };
                csvHandler.handler.appendRows = () => [];

                function set(field, value) {
                    updateFields[field] = value == null ? "" : String(value);
                    return this;
                }

                async function execute() {
                    const csvContent = await source.read(path);
                    const { affectedCount, csvContent: newCsvContent } = csvHandler.execute(csvContent);
                    await source.write(path, newCsvContent);
                    return affectedCount;
                }

                return {
                    execute: execute,
                    set: set,
                    eq: function (fieldName, value) {
                        csvFilter.eq(fieldName, value);
                        return this;
                    },
                    notEq: function (fieldName, value) {
                        csvFilter.notEq(fieldName, value);
                        return this;
                    },
                    in: function (fieldName, ...values) {
                        csvFilter.inValues(fieldName, ...values);
                        return this;
                    },
                    notIn: function (fieldName, ...values) {
                        csvFilter.notIn(fieldName, ...values);
                        return this;
                    },
                    like: function (fieldName, pattern) {
                        csvFilter.like(fieldName, pattern);
                        return this;
                    },
                    gt: function (fieldName, value) {
                        csvFilter.gt(fieldName, value);
                        return this;
                    },
                    ge: function (fieldName, value) {
                        csvFilter.ge(fieldName, value);
                        return this;
                    },
                    lt: function (fieldName, value) {
                        csvFilter.lt(fieldName, value);
                        return this;
                    },
                    le: function (fieldName, value) {
                        csvFilter.le(fieldName, value);
                        return this;
                    },
                };
            }

            function updateBy(csvFileName, fieldName) {
                const updateDatas = {};
                const path = `${csvPath}/${csvFileName}.csv`;
                const csvHandler = CsvUtil.createModifier();
                csvHandler.handler.shouldHandleData = (row) => {
                    if (row[fieldName] === null || row[fieldName] === undefined) {
                        return false;
                    }
                    return updateDatas.hasOwnProperty(row[fieldName]);
                };
                csvHandler.handler.handleData = (row) => {
                    return updateDatas[row[fieldName]];
                };
                csvHandler.handler.appendRows = () => [];

                function value(data) {
                    updateDatas[data[fieldName]] = data;
                    return this;
                }

                async function execute() {
                    const csvContent = await source.read(path);
                    const { affectedCount, csvContent: newCsvContent } = csvHandler.execute(csvContent);
                    await source.write(path, newCsvContent);
                    return affectedCount;
                }

                return {
                    execute: execute,
                    value: value,
                };
            }

            function deleteFrom(csvFileName) {
                const path = `${csvPath}/${csvFileName}.csv`;
                const csvHandler = CsvUtil.createModifier();
                const csvFilter = CsvUtil.createFilter();
                csvHandler.handler.shouldHandleData = (row) => {
                    return csvFilter.test(row);
                };
                csvHandler.handler.handleData = (row) => null;
                csvHandler.handler.appendRows = () => [];

                async function execute() {
                    const csvContent = await source.read(path);
                    const { affectedCount, csvContent: newCsvContent } = csvHandler.execute(csvContent);
                    await source.write(path, newCsvContent);
                    return affectedCount;
                }

                return {
                    execute: execute,
                    eq: function (fieldName, value) {
                        csvFilter.eq(fieldName, value);
                        return this;
                    },
                    notEq: function (fieldName, value) {
                        csvFilter.notEq(fieldName, value);
                        return this;
                    },
                    in: function (fieldName, ...values) {
                        csvFilter.inValues(fieldName, ...values);
                        return this;
                    },
                    notIn: function (fieldName, ...values) {
                        csvFilter.notIn(fieldName, ...values);
                        return this;
                    },
                    like: function (fieldName, pattern) {
                        csvFilter.like(fieldName, pattern);
                        return this;
                    },
                    gt: function (fieldName, value) {
                        csvFilter.gt(fieldName, value);
                        return this;
                    },
                    ge: function (fieldName, value) {
                        csvFilter.ge(fieldName, value);
                        return this;
                    },
                    lt: function (fieldName, value) {
                        csvFilter.lt(fieldName, value);
                        return this;
                    },
                    le: function (fieldName, value) {
                        csvFilter.le(fieldName, value);
                        return this;
                    },
                };
            }

            function insertInto(csvFileName) {
                const path = `${csvPath}/${csvFileName}.csv`;
                const csvHandler = CsvUtil.createModifier();
                const appendRows = [];
                csvHandler.handler.shouldHandleData = () => false;
                csvHandler.handler.handleData = (row) => row;
                csvHandler.handler.appendRows = () => appendRows;

                function value(data) {
                    appendRows.push(data);
                    return this;
                }

                async function execute() {
                    const csvContent = await source.read(path);
                    const { affectedCount, csvContent: newCsvContent } = csvHandler.execute(csvContent);
                    await source.write(path, newCsvContent);
                    return affectedCount;
                }

                return {
                    value,
                    execute: execute,
                };
            }

            function selectFrom(csvFileName, ...fieldNames) {
                const path = `${csvPath}/${csvFileName}.csv`;
                const csvFetcher = CsvUtil.createFetcher();
                const csvFilter = CsvUtil.createFilter();
                csvFetcher.handler.shouldHandleData = (row) => {
                    return csvFilter.test(row);
                };
                csvFetcher.handler.selectField = () => {
                    return fieldNames.length === 0 ? null : fieldNames;
                };

                function offset(offset) {
                    if (offset < 0) throw new Error("Offset cannot be negative");
                    csvFetcher.handler.lineOffset = () => offset;
                    return this;
                }

                function limit(limit) {
                    if (limit < 0) throw new Error("Limit cannot be negative");
                    csvFetcher.handler.lineLimit = () => limit;
                    return this;
                }

                function order(fieldName, desc) {
                    csvFetcher.handler.orderField = () => fieldName;
                    csvFetcher.handler.orderDesc = () => desc;
                    return this;
                }

                async function fetch() {
                    const csvContent = await source.read(path);
                    return csvFetcher.fetch(csvContent);
                }

                async function fetchOne() {
                    const values = await fetch();
                    return values.length > 0 ? values[0] : null;
                }

                return {
                    offset,
                    limit,
                    fetch,
                    fetchOne,
                    order,
                    eq: function (fieldName, value) {
                        csvFilter.eq(fieldName, value);
                        return this;
                    },
                    notEq: function (fieldName, value) {
                        csvFilter.notEq(fieldName, value);
                        return this;
                    },
                    in: function (fieldName, ...values) {
                        csvFilter.inValues(fieldName, ...values);
                        return this;
                    },
                    notIn: function (fieldName, ...values) {
                        csvFilter.notIn(fieldName, ...values);
                        return this;
                    },
                    like: function (fieldName, pattern) {
                        csvFilter.like(fieldName, pattern);
                        return this;
                    },
                    gt: function (fieldName, value) {
                        csvFilter.gt(fieldName, value);
                        return this;
                    },
                    ge: function (fieldName, value) {
                        csvFilter.ge(fieldName, value);
                        return this;
                    },
                    lt: function (fieldName, value) {
                        csvFilter.lt(fieldName, value);
                        return this;
                    },
                    le: function (fieldName, value) {
                        csvFilter.le(fieldName, value);
                        return this;
                    },
                };
            }

            return {
                create,
                createIfNotExist,
                insertInto,
                deleteFrom,
                update,
                updateBy,
                selectFrom,
            };
        },
    };

    async function getGithubClient() {
        return GithubUtil.createClient(await getConfig());
    }

    const GithubCsvSource = {
        exists: async (path) => (await getGithubClient()).fileExists(path),
        create: async (path, content) => (await getGithubClient()).createFile(path, content),
        read: async (path) => (await getGithubClient()).getFileContent(path),
        write: async (path, content) => (await getGithubClient()).updateFile(path, content),
    };

    const GithubCsvDb = CsvDatabase.create(GithubCsvSource, DB_FILE.PATH);

    GM_registerMenuCommand("⚙️ 设置GitHub仓库", showGitConfigDialog);
    GM_registerMenuCommand("❌ 清除GitHub仓库配置", clearGitConfig);
    GM_registerMenuCommand("👉保存网站Cookie到仓库", writeCookie);
    GM_registerMenuCommand("👉从仓库读取网站Cookie", readCookie);
    GM_registerMenuCommand("👉设置允许的Cookie名", setSupportCookieNames);
    GM_registerMenuCommand("👉管理仓库Cookie", showCookieManager);
    GM_registerMenuCommand("👉清空网站本地Cookie", clearLocalCookie);
    console.log("[Cookie管理器] 加载成功");
})();
