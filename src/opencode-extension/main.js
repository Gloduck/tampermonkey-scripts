// ==UserScript==
// @name         OpenCode扩展
// @namespace    opencode_extension
// @version      1.0.0
// @description  OpenCode 扩展，当前提供基于讯飞语音听写流式 WebAPI 的语音输入
// @author       Gloduck
// @license      MIT
// @include      /^https?:\/\/opencode[^/:]*(?::\d+)?(?:\/|$)/
// @match        *://localhost/*
// @match        *://127.0.0.1/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==

(function () {
    "use strict";

    // <include:../shared/dialog.js>
    // <include:../shared/settings-dialog.js>

    const CONFIG_KEYS = {
        XFYUN_APP_ID: "OPENCODE_EXTENSION_XFYUN_APP_ID",
        XFYUN_API_KEY: "OPENCODE_EXTENSION_XFYUN_API_KEY",
        XFYUN_API_SECRET: "OPENCODE_EXTENSION_XFYUN_API_SECRET",
        XFYUN_LANGUAGE: "OPENCODE_EXTENSION_XFYUN_LANGUAGE",
        XFYUN_DOMAIN: "OPENCODE_EXTENSION_XFYUN_DOMAIN",
        XFYUN_ACCENT: "OPENCODE_EXTENSION_XFYUN_ACCENT",
        XFYUN_PUNCTUATION: "OPENCODE_EXTENSION_XFYUN_PUNCTUATION",
        XFYUN_DYNAMIC_CORRECTION: "OPENCODE_EXTENSION_XFYUN_DYNAMIC_CORRECTION",
        XFYUN_EOS: "OPENCODE_EXTENSION_XFYUN_EOS",
    };

    const SETTINGS_GROUPS = {
        XFYUN: "讯飞语音输入",
    };

    const XFYUN_HOST = "iat-api.xfyun.cn";
    const XFYUN_PATH = "/v2/iat";
    const AUDIO_FRAME_BYTES = 1280;

    async function getSettings() {
        return {
            xfyunAppId: await GM_getValue(CONFIG_KEYS.XFYUN_APP_ID, ""),
            xfyunApiKey: await GM_getValue(CONFIG_KEYS.XFYUN_API_KEY, ""),
            xfyunApiSecret: await GM_getValue(CONFIG_KEYS.XFYUN_API_SECRET, ""),
            xfyunLanguage: await GM_getValue(CONFIG_KEYS.XFYUN_LANGUAGE, "zh_cn"),
            xfyunDomain: await GM_getValue(CONFIG_KEYS.XFYUN_DOMAIN, "iat"),
            xfyunAccent: await GM_getValue(CONFIG_KEYS.XFYUN_ACCENT, "mandarin"),
            xfyunPunctuation: await GM_getValue(CONFIG_KEYS.XFYUN_PUNCTUATION, true),
            xfyunDynamicCorrection: await GM_getValue(CONFIG_KEYS.XFYUN_DYNAMIC_CORRECTION, true),
            xfyunEos: await GM_getValue(CONFIG_KEYS.XFYUN_EOS, 3000),
        };
    }

    const settingsItems = [
        { group: SETTINGS_GROUPS.XFYUN, name: "xfyunAppId", label: "AppID", placeholder: "控制台应用的 AppID", validValue: (value) => value.trim() ? null : "请填写讯飞 AppID" },
        { group: SETTINGS_GROUPS.XFYUN, name: "xfyunApiKey", label: "APIKey", type: "password", validValue: (value) => value.trim() ? null : "请填写讯飞 APIKey" },
        { group: SETTINGS_GROUPS.XFYUN, name: "xfyunApiSecret", label: "APISecret", type: "password", validValue: (value) => value.trim() ? null : "请填写讯飞 APISecret" },
        {
            group: SETTINGS_GROUPS.XFYUN,
            name: "xfyunLanguage",
            label: "语种",
            type: "select",
            options: [{ value: "zh_cn", label: "中文" }, { value: "en_us", label: "英文" }],
        },
        {
            group: SETTINGS_GROUPS.XFYUN,
            name: "xfyunDomain",
            label: "识别领域",
            type: "select",
            options: [{ value: "iat", label: "日常用语" }, { value: "xfime-mianqie", label: "方言免切（需开通）" }],
        },
        { group: SETTINGS_GROUPS.XFYUN, name: "xfyunAccent", label: "口音参数", placeholder: "普通话填写 mandarin，其他方言填写控制台参数" },
        { group: SETTINGS_GROUPS.XFYUN, name: "xfyunPunctuation", label: "自动添加标点", type: "checkbox" },
        { group: SETTINGS_GROUPS.XFYUN, name: "xfyunDynamicCorrection", label: "启用动态修正", type: "checkbox" },
        {
            group: SETTINGS_GROUPS.XFYUN,
            name: "xfyunEos",
            label: "静默结束时间（毫秒）",
            type: "number",
            attributes: { min: "500", max: "10000", step: "100" },
            serializeValue: (value) => Number(value),
            validValue: (value) => value >= 500 && value <= 10000 ? null : "静默结束时间必须在 500 到 10000 毫秒之间",
        },
    ];

    async function showSettings() {
        const settings = await getSettings();
        const values = await SettingsDialog.open({
            title: "OpenCode 扩展设置",
            items: settingsItems,
            values: settings,
            confirmText: "保存",
            cancelText: "取消",
        });
        if (values === null) return;

        await GM_setValue(CONFIG_KEYS.XFYUN_APP_ID, values.xfyunAppId.trim());
        await GM_setValue(CONFIG_KEYS.XFYUN_API_KEY, values.xfyunApiKey.trim());
        await GM_setValue(CONFIG_KEYS.XFYUN_API_SECRET, values.xfyunApiSecret.trim());
        await GM_setValue(CONFIG_KEYS.XFYUN_LANGUAGE, values.xfyunLanguage);
        await GM_setValue(CONFIG_KEYS.XFYUN_DOMAIN, values.xfyunDomain);
        await GM_setValue(CONFIG_KEYS.XFYUN_ACCENT, values.xfyunAccent);
        await GM_setValue(CONFIG_KEYS.XFYUN_PUNCTUATION, values.xfyunPunctuation);
        await GM_setValue(CONFIG_KEYS.XFYUN_DYNAMIC_CORRECTION, values.xfyunDynamicCorrection);
        await GM_setValue(CONFIG_KEYS.XFYUN_EOS, values.xfyunEos);
        await Dialog.alert("保存成功", "OpenCode 扩展设置已保存", "success", "确认");
    }

    function bytesToBase64(bytes) {
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    async function hmacBase64(message, secret) {
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
        return bytesToBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))));
    }

    async function createAuthUrl(settings) {
        const date = new Date().toUTCString();
        const signatureOrigin = `host: ${XFYUN_HOST}\ndate: ${date}\nGET ${XFYUN_PATH} HTTP/1.1`;
        const signature = await hmacBase64(signatureOrigin, settings.xfyunApiSecret);
        const authorizationOrigin = `api_key="${settings.xfyunApiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
        const params = new URLSearchParams({
            authorization: btoa(authorizationOrigin),
            date,
            host: XFYUN_HOST,
        });
        return `wss://${XFYUN_HOST}${XFYUN_PATH}?${params.toString()}`;
    }

    function downsampleToPcm(input, inputSampleRate) {
        const ratio = inputSampleRate / 16000;
        const outputLength = Math.floor(input.length / ratio);
        const pcm = new Int16Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
            const start = Math.floor(i * ratio);
            const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
            let sum = 0;
            for (let j = start; j < end && j < input.length; j++) sum += input[j];
            const sample = Math.max(-1, Math.min(1, sum / (end - start)));
            pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        return new Uint8Array(pcm.buffer);
    }

    function makeAudioFrame(session, audio, status) {
        return JSON.stringify({
            ...(status === 0 ? {
                common: { app_id: session.settings.xfyunAppId },
                business: {
                    language: session.settings.xfyunLanguage,
                    domain: session.settings.xfyunDomain,
                    accent: session.settings.xfyunAccent,
                    eos: session.settings.xfyunEos,
                    ptt: session.settings.xfyunPunctuation ? 1 : 0,
                    ...(session.settings.xfyunDynamicCorrection && session.settings.xfyunLanguage === "zh_cn" && session.settings.xfyunDomain === "iat" ? { dwa: "wpgs" } : {}),
                },
            } : {}),
            data: {
                status,
                format: "audio/L16;rate=16000",
                encoding: "raw",
                audio: audio ? bytesToBase64(audio) : "",
            },
        });
    }

    function getResultText(result) {
        return (result?.ws || [])
            .flatMap((word) => word.cw || [])
            .map((word) => word.w || "")
            .join("");
    }

    function updateTranscript(session, result) {
        const text = getResultText(result);
        if (!text && result?.pgs !== "rpl") return session.transcript;

        if (result.pgs === "rpl" && Array.isArray(result.rg)) {
            for (let i = result.rg[0]; i <= result.rg[1]; i++) session.segments.delete(i);
        }
        if (result.sn != null) session.segments.set(Number(result.sn), text);
        session.transcript = [...session.segments.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, value]) => value)
            .join("");
        return session.transcript;
    }

    function getPromptInput() {
        return document.querySelector('[data-component="prompt-input"][contenteditable="true"]') ||
            document.querySelector('[role="textbox"][contenteditable="true"]');
    }

    function insertTextIntoPrompt(text) {
        const input = getPromptInput();
        if (!input || !text) return false;
        input.focus();

        const current = input.innerText || "";
        const separator = current && !/[\s\n]$/.test(current) ? " " : "";
        const selection = window.getSelection();
        const hasSelection = selection && selection.rangeCount > 0 && input.contains(selection.getRangeAt(0).commonAncestorContainer);
        let inserted = false;
        if (hasSelection) inserted = document.execCommand("insertText", false, separator + text);
        if (!inserted) input.textContent = current + separator + text;

        input.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: text,
        }));
        return true;
    }

    function enqueueAudio(session, pcm) {
        const combined = new Uint8Array(session.pending.length + pcm.length);
        combined.set(session.pending);
        combined.set(pcm, session.pending.length);
        session.pending = combined;

        if (!session.ready || session.ws.readyState !== WebSocket.OPEN || session.ending) return;

        if (!session.started) {
            if (session.pending.length < AUDIO_FRAME_BYTES) return;
            const firstFrame = session.pending.slice(0, AUDIO_FRAME_BYTES);
            session.pending = session.pending.slice(AUDIO_FRAME_BYTES);
            session.ws.send(makeAudioFrame(session, firstFrame, 0));
            session.started = true;
        }

        while (session.pending.length >= AUDIO_FRAME_BYTES) {
            const frame = session.pending.slice(0, AUDIO_FRAME_BYTES);
            session.pending = session.pending.slice(AUDIO_FRAME_BYTES);
            session.ws.send(makeAudioFrame(session, frame, 1));
        }
    }

    function stopAudioResources(session) {
        session.source?.disconnect();
        session.processor?.disconnect();
        session.gain?.disconnect();
        session.stream?.getTracks().forEach((track) => track.stop());
        session.audioContext?.close();
    }

    function finishSession(session, shouldInsert = true) {
        if (!session || session.finished) return;
        session.finished = true;
        stopAudioResources(session);
        if (session.ws?.readyState === WebSocket.OPEN) session.ws.close(1000, "normal closure");
        if (session === activeSession) {
            activeSession = null;
            setButtonState("idle");
        }
        if (!shouldInsert) return;
        if (session.transcript) {
            insertTextIntoPrompt(session.transcript);
            return;
        }
        Dialog.alert("未识别到内容", "讯飞没有返回可写入的文字，请检查麦克风后重试。", "warning", "确认");
    }

    function setButtonState(state, title = "讯飞语音输入") {
        const button = document.querySelector("#opencode-extension-xfyun-voice-button");
        if (!button) return;
        button.dataset.state = state;
        button.textContent = state === "recording" ? "■" : state === "processing" ? "识别中…" : "🎙";
        button.title = title;
        button.setAttribute("aria-label", title);
        button.style.width = state === "processing" ? "auto" : "28px";
        button.style.padding = state === "processing" ? "0 8px" : "0";
        button.disabled = state === "processing";
    }

    let activeSession = null;

    async function startRecording() {
        if (activeSession) return;
        const settings = await getSettings();
        if (!settings.xfyunAppId || !settings.xfyunApiKey || !settings.xfyunApiSecret) {
            await Dialog.alert("需要配置讯飞", "请先在油猴菜单中打开“OpenCode扩展：设置”，在讯飞语音输入区块填写 AppID、APIKey 和 APISecret。", "warning", "确认");
            return;
        }

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
        } catch (error) {
            await Dialog.alert("无法访问麦克风", `请检查浏览器麦克风权限。\n${error.message || error}`, "error", "确认");
            return;
        }

        const session = {
            settings,
            stream,
            pending: new Uint8Array(0),
            segments: new Map(),
            transcript: "",
            ready: false,
            started: false,
            ending: false,
            finished: false,
        };
        activeSession = session;
        setButtonState("recording", "正在录音，点击停止");

        try {
            session.audioContext = new AudioContext();
            await session.audioContext.resume();
            session.processor = session.audioContext.createScriptProcessor(2048, 1, 1);
            session.processor.onaudioprocess = (event) => {
                enqueueAudio(session, downsampleToPcm(event.inputBuffer.getChannelData(0), session.audioContext.sampleRate));
            };
            session.gain = session.audioContext.createGain();
            session.gain.gain.value = 0;

            const authUrl = await createAuthUrl(settings);
            session.ws = new WebSocket(authUrl);
            session.ws.onopen = () => {
                if (session.finished || session.ending) {
                    session.ws.close(1000, "cancelled");
                    return;
                }
                session.ready = true;
                session.source = session.audioContext.createMediaStreamSource(stream);
                session.source.connect(session.processor);
                session.processor.connect(session.gain);
                session.gain.connect(session.audioContext.destination);
                enqueueAudio(session, new Uint8Array(0));
            };
            session.ws.onmessage = (event) => {
                let message;
                try { message = JSON.parse(event.data); } catch { return; }
                if (message.code) {
                    finishSession(session, false);
                    Dialog.alert("讯飞识别失败", `${message.message || "请求失败"}（错误码 ${message.code}）`, "error", "确认");
                    return;
                }
                const result = message.data?.result;
                if (result) {
                    const transcript = updateTranscript(session, result);
                    setButtonState("recording", transcript ? `识别中：${transcript}` : "正在录音，点击停止");
                }
                if (message.data?.status === 2 || result?.ls) {
                    setButtonState("processing", "正在整理识别结果");
                    setTimeout(() => finishSession(session), 80);
                }
            };
            session.ws.onerror = () => {
                finishSession(session, false);
                Dialog.alert("讯飞连接失败", "无法连接讯飞语音识别服务，请检查网络、API 鉴权和系统时间。", "error", "确认");
            };
            session.ws.onclose = () => {
                if (!session.finished) finishSession(session);
            };
        } catch (error) {
            finishSession(session, false);
            await Dialog.alert("启动语音输入失败", error.message || String(error), "error", "确认");
        }
    }

    function stopRecording() {
        const session = activeSession;
        if (!session || session.ending) return;
        session.ending = true;
        setButtonState("processing", "正在获取最终识别结果");
        session.source?.disconnect();
        session.processor?.disconnect();
        session.gain?.disconnect();
        session.stream?.getTracks().forEach((track) => track.stop());

        if (session.ws.readyState === WebSocket.OPEN) {
            if (!session.started && session.pending.length) {
                session.ws.send(makeAudioFrame(session, session.pending, 0));
                session.started = true;
                session.pending = new Uint8Array(0);
                session.ws.send(makeAudioFrame(session, null, 2));
            } else if (session.pending.length) {
                session.ws.send(makeAudioFrame(session, session.pending, 2));
                session.pending = new Uint8Array(0);
            } else if (!session.started) {
                session.ws.send(makeAudioFrame(session, new Uint8Array(0), 0));
                session.ws.send(makeAudioFrame(session, null, 2));
            } else {
                session.ws.send(makeAudioFrame(session, null, 2));
            }
            setTimeout(() => finishSession(session), 4000);
        } else {
            finishSession(session);
        }
    }

    function isOpenCodePage() {
        return /opencode/i.test(document.title) && Boolean(getPromptInput());
    }

    let loadedSuccessfully = false;

    function syncButton() {
        const existingButton = document.querySelector("#opencode-extension-xfyun-voice-button");
        const promptInput = getPromptInput();
        if (!isOpenCodePage() || !promptInput) {
            existingButton?.remove();
            return;
        }

        const promptContainer = promptInput.parentElement?.parentElement;
        const actionBar = promptContainer?.lastElementChild;
        if (!actionBar || actionBar === promptInput.parentElement) {
            existingButton?.remove();
            return;
        }
        if (existingButton && actionBar.contains(existingButton)) return;
        existingButton?.remove();

        const button = document.createElement("button");
        button.id = "opencode-extension-xfyun-voice-button";
        button.type = "button";
        button.textContent = "🎙";
        button.title = "讯飞语音输入";
        button.setAttribute("aria-label", "讯飞语音输入");
        button.style.cssText = `
            flex: 0 0 auto; width: 28px; height: 28px; padding: 0;
            border: 0; border-radius: 6px; background: transparent;
            color: inherit; cursor: pointer; font-size: 15px; line-height: 1;
            display: inline-flex; align-items: center; justify-content: center;
        `;
        button.addEventListener("mouseenter", () => { button.style.background = "rgba(148,163,184,.16)"; });
        button.addEventListener("mouseleave", () => { button.style.background = "transparent"; });
        button.addEventListener("click", () => activeSession ? stopRecording() : startRecording());
        const leftActions = actionBar.firstElementChild;
        if (leftActions) leftActions.appendChild(button);
        else actionBar.prepend(button);
        if (!loadedSuccessfully) {
            loadedSuccessfully = true;
            console.log("[OpenCode扩展] 加载成功，当前功能：讯飞语音输入");
        }
    }

    GM_registerMenuCommand("OpenCode扩展：设置", showSettings);
    const observer = new MutationObserver(syncButton);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    syncButton();
})();
