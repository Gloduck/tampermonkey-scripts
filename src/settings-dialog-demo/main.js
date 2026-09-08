// ==UserScript==
// @name         SettingsDialog Demo
// @namespace    settings_dialog_demo
// @version      1.0.0
// @description  settings-dialog.js 设置控件、分组、校验和数据转换的测试模板
// @author       Gloduck
// @license      MIT
// @match        *://*/*
// @run-at       document-end
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    "use strict";

    // <include:../shared/dialog.js>
    // <include:../shared/settings-dialog.js>

    const STORAGE_KEY = "settings-dialog-demo.values";
    const DEFAULT_VALUES = {
        title: "设置样式演示",
        text: "Hello, SettingsDialog!",
        password: "demo-only-not-a-secret",
        search: "",
        email: "demo@example.com",
        url: "https://example.com/",
        tel: "13800138000",
        notes: "这是多行文本。\n可以拖动右下角调整高度。",
        enabled: true,
        theme: "system",
        layout: "comfortable",
        features: ["preview", "notification"],
        retries: 3,
        volume: 60,
        color: "#2563eb",
        date: "2026-01-15",
        time: "09:30",
        datetime: "2026-01-15T09:30",
        month: "2026-01",
        week: "2026-W03",
        sites: ["example.com", "example.org"],
        readonly: "只读文本仍会出现在保存结果中",
        disabled: "禁用控件仍会被 SettingsDialog 读取",
    };

    // 未指定 type 时为 text；未指定 group 时不显示分组边框。
    const SETTING_ITEMS = [
        {
            name: "title",
            label: "默认文本框（无 type、无 group；必填）",
            placeholder: "清空后点击保存，可测试 validValue",
            validValue: (value) => value.trim() ? null : "演示标题不能为空，请填写顶部的默认文本框。",
            serializeValue: (value) => value.trim(),
        },
        {
            group: "文本输入",
            name: "text",
            label: "单行文本 · text（最多 80 字）",
            type: "text",
            attributes: { maxlength: 80 },
        },
        {
            group: "文本输入",
            name: "password",
            label: "密码 · password（仅填测试内容，会明文保存及展示）",
            type: "password",
            attributes: { autocomplete: "off" },
        },
        {
            group: "文本输入",
            name: "search",
            label: "搜索 · search（空值与 placeholder）",
            type: "search",
            placeholder: "输入测试关键词",
        },
        { group: "文本输入", name: "email", label: "邮箱 · email", type: "email" },
        { group: "文本输入", name: "url", label: "网址 · url", type: "url" },
        { group: "文本输入", name: "tel", label: "电话 · tel", type: "tel" },
        {
            group: "文本输入",
            name: "notes",
            label: "多行文本 · textarea",
            type: "textarea",
            placeholder: "可以输入多行内容",
            attributes: { rows: 5 },
        },
        { group: "选择控件", name: "enabled", label: "独立复选框 · checkbox", type: "checkbox" },
        {
            group: "选择控件",
            name: "theme",
            label: "下拉选择 · select",
            type: "select",
            options: [
                { value: "system", label: "跟随系统" },
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色" },
            ],
        },
        {
            group: "选择控件",
            name: "layout",
            label: "单选组 · radio-group",
            type: "radio-group",
            options: [
                { value: "compact", label: "紧凑" },
                { value: "comfortable", label: "舒适" },
                { value: "wide", label: "宽松" },
            ],
        },
        {
            group: "选择控件",
            name: "features",
            label: "多选组 · checkbox-group（可全部取消）",
            type: "checkbox-group",
            options: [
                { value: "preview", label: "内容预览" },
                { value: "notification", label: "消息通知" },
                { value: "shortcut", label: "快捷键操作" },
                { value: "sync", label: "跨设备同步（仅演示选项）" },
            ],
        },
        {
            group: "数值与颜色",
            name: "retries",
            label: "数字 · number（0 到 10 的整数，保存为 number）",
            type: "number",
            attributes: { min: 0, max: 10, step: 1 },
            validValue: (value) => value !== "" && Number.isInteger(Number(value)) && value >= 0 && value <= 10
                ? null : "重试次数必须是 0 到 10 的整数。",
            serializeValue: Number,
        },
        {
            group: "数值与颜色",
            name: "volume",
            label: "滑块 · range（实时数值，步进 5）",
            type: "range",
            attributes: { min: 0, max: 100, step: 5 },
            serializeValue: Number,
        },
        { group: "数值与颜色", name: "color", label: "颜色 · color", type: "color" },
        { group: "日期与时间（浏览器原生样式）", name: "date", label: "日期 · date", type: "date" },
        { group: "日期与时间（浏览器原生样式）", name: "time", label: "时间 · time", type: "time" },
        {
            group: "日期与时间（浏览器原生样式）",
            name: "datetime",
            label: "本地日期时间 · datetime-local",
            type: "datetime-local",
        },
        { group: "日期与时间（浏览器原生样式）", name: "month", label: "月份 · month", type: "month" },
        { group: "日期与时间（浏览器原生样式）", name: "week", label: "周 · week", type: "week" },
        {
            group: "数据转换与控件状态",
            name: "sites",
            label: "数组与多行文本互转（每行一个站点，过滤空行）",
            type: "textarea",
            placeholder: "example.com\nexample.org",
            deserializeValue: (value) => value.join("\n"),
            serializeValue: (value) => value.split("\n").map((line) => line.trim()).filter(Boolean),
        },
        {
            group: "数据转换与控件状态",
            name: "readonly",
            label: "只读 · attributes.readonly",
            type: "text",
            attributes: { readonly: "" },
        },
        {
            group: "数据转换与控件状态",
            name: "disabled",
            label: "禁用 · attributes.disabled",
            type: "text",
            attributes: { disabled: "" },
        },
    ];

    function showValues(values) {
        const preview = document.createElement("pre");
        preview.style.cssText = "margin: 0; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px;";
        preview.textContent = JSON.stringify(values, null, 2);
        return Dialog.custom({
            title: "演示设置 JSON（密码也是明文）",
            content: preview,
            confirmText: "关闭",
        });
    }

    async function openSettings() {
        try {
            let values = { ...DEFAULT_VALUES, ...GM_getValue(STORAGE_KEY, {}) };
            while (true) {
                let restoreDefaults = false;
                const result = await SettingsDialog.open({
                    title: "SettingsDialog 设置样式演示",
                    items: SETTING_ITEMS,
                    values,
                    confirmText: "保存并查看 JSON",
                    cancelText: "取消",
                    secondaryText: "恢复默认值",
                    onOpen: (panel) => {
                        const form = panel.querySelector("form");
                        // 保存由弹窗按钮处理，阻止单行输入框中的 Enter 提交宿主页面。
                        form.addEventListener("submit", (event) => event.preventDefault());
                        const hint = document.createElement("p");
                        hint.style.cssText = "margin: 0 0 16px; text-align: left; font-size: 14px;";
                        hint.textContent = "仅演示控件，不改变网页功能或主题。向下滚动查看所有样式；清空标题或填写无效数字可测试校验。恢复默认值后仍需保存，取消或 Esc 不写入存储。";
                        form.prepend(hint);
                    },
                    onSecondary: () => {
                        restoreDefaults = true;
                    },
                });
                // secondary 的结果不是确认结果；用标记重新打开默认草稿，不提前写入存储。
                if (restoreDefaults) {
                    values = { ...DEFAULT_VALUES };
                    continue;
                }
                if (result !== null) {
                    GM_setValue(STORAGE_KEY, result);
                    await showValues(result);
                }
                return;
            }
        } catch (error) {
            await Dialog.alert("演示设置失败", error.message || String(error), "error", "关闭");
        }
    }

    GM_registerMenuCommand("打开设置样式演示", openSettings);
    GM_registerMenuCommand("查看已保存的演示设置", () => showValues({ ...DEFAULT_VALUES, ...GM_getValue(STORAGE_KEY, {}) }));
})();
