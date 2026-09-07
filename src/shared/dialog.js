// 油猴脚本共用的轻量弹窗组件。

const Dialog = (() => {
    let host = null;
    let root = null;
    let activeDialog = null;

    function ensureRoot() {
        if (root) {
            return root;
        }

        host = document.createElement("div");
        host.id = "userscript-dialog-host";
        host.style.setProperty("all", "initial", "important");
        host.style.setProperty("position", "fixed", "important");
        host.style.setProperty("z-index", "2147483647", "important");
        document.documentElement.appendChild(host);

        root = host.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = `
            :host {
                all: initial;
            }
            *, *::before, *::after {
                box-sizing: border-box;
            }
            .userscript-dialog-overlay {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                background: rgba(15, 23, 42, 0.55);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                color: #1f2937;
            }
            .userscript-dialog-popup {
                position: relative;
                width: 32rem;
                max-width: calc(100vw - 40px);
                max-height: calc(100vh - 40px);
                overflow: auto;
                padding: 26px;
                border: 1px solid rgba(15, 23, 42, 0.08);
                border-radius: 12px;
                background: #ffffff;
                box-shadow: 0 24px 70px rgba(15, 23, 42, 0.3);
                text-align: center;
                animation: userscript-dialog-enter 0.16s ease-out;
            }
            @keyframes userscript-dialog-enter {
                from { opacity: 0; transform: translateY(8px) scale(0.98); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            .userscript-dialog-close {
                position: absolute;
                top: 8px;
                right: 10px;
                width: 34px;
                height: 34px;
                padding: 0;
                border: 0;
                border-radius: 8px;
                background: transparent;
                color: #64748b;
                font-size: 26px;
                line-height: 1;
                cursor: pointer;
            }
            .userscript-dialog-close:hover {
                background: #f1f5f9;
                color: #0f172a;
            }
            .userscript-dialog-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 26px;
                width: 26px;
                height: 26px;
                margin: 0;
                border: 0;
                border-radius: 50%;
                font-size: 16px;
                font-weight: 600;
                line-height: 1;
            }
            .userscript-dialog-title-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 0 0 14px;
                text-align: left;
            }
            .userscript-dialog-icon-success { background: #dcfce7; color: #15803d; }
            .userscript-dialog-icon-error { background: #fee2e2; color: #b91c1c; }
            .userscript-dialog-icon-warning { background: #fef3c7; color: #b45309; }
            .userscript-dialog-icon-question { background: #dbeafe; color: #1d4ed8; }
            .userscript-dialog-title {
                margin: 0;
                color: #172033;
                font-size: 18px;
                font-weight: 650;
                line-height: 1.3;
            }
            .userscript-dialog-content {
                color: #475569;
                font-size: 16px;
                line-height: 1.65;
                overflow-wrap: anywhere;
            }
            .userscript-dialog-message {
                white-space: pre-wrap;
            }
            .userscript-dialog-html {
                white-space: normal;
            }
            .userscript-dialog-field {
                margin-top: 16px;
                text-align: left;
            }
            .userscript-dialog-label {
                display: block;
                margin-bottom: 8px;
                color: #334155;
                font-size: 14px;
            }
            .userscript-dialog-input,
            .userscript-dialog-textarea {
                display: block;
                width: 100%;
                margin: 12px 0;
                padding: 10px 12px;
                border: 1px solid #cbd5e1;
                border-radius: 7px;
                background: #ffffff;
                color: #0f172a;
                font: inherit;
                font-size: 16px;
                outline: none;
            }
            .userscript-dialog-input:focus,
            .userscript-dialog-textarea:focus,
            .userscript-dialog-select:focus {
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
            }
            .userscript-dialog-textarea {
                min-height: 220px;
                resize: vertical;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            }
            .userscript-dialog-select {
                display: block;
                width: 100%;
                padding: 10px 12px;
                border: 1px solid #cbd5e1;
                border-radius: 7px;
                background: #ffffff;
                color: #0f172a;
                font: inherit;
                font-size: 16px;
                outline: none;
            }
            .userscript-dialog-validation {
                display: none;
                margin-top: 12px;
                padding: 9px 12px;
                border-radius: 7px;
                background: #fef2f2;
                color: #b91c1c;
                font-size: 14px;
                text-align: left;
            }
            .userscript-dialog-actions {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 10px;
                margin-top: 22px;
            }
            .userscript-dialog-button {
                min-width: 86px;
                padding: 10px 17px;
                border: 0;
                border-radius: 7px;
                color: #ffffff;
                font: inherit;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
            }
            .userscript-dialog-button:disabled {
                cursor: not-allowed;
                opacity: 0.55;
            }
            .userscript-dialog-button:focus {
                outline: none;
            }
            .userscript-dialog-button:focus-visible {
                outline: 3px solid rgba(37, 99, 235, 0.28);
                outline-offset: 2px;
            }
            .userscript-dialog-confirm { order: 1; background: #2563eb; }
            .userscript-dialog-confirm:hover:not(:disabled) { background: #1d4ed8; }
            .userscript-dialog-deny { order: 2; background: #d97706; }
            .userscript-dialog-deny:hover:not(:disabled) { background: #b45309; }
            .userscript-dialog-cancel { order: 3; background: #64748b; }
            .userscript-dialog-cancel:hover:not(:disabled) { background: #475569; }
            .userscript-dialog-loading {
                width: 42px;
                height: 42px;
                margin: 20px auto 4px;
                border: 4px solid #dbeafe;
                border-top-color: #2563eb;
                border-radius: 50%;
                animation: userscript-dialog-spin 0.75s linear infinite;
            }
            @keyframes userscript-dialog-spin {
                to { transform: rotate(360deg); }
            }
        `;
        root.appendChild(style);
        return root;
    }

    function open(options = {}) {
        const shadowRoot = ensureRoot();

        if (activeDialog) {
            activeDialog.finish({
                value: undefined,
                isConfirmed: false,
                isDenied: false,
                isDismissed: true,
                dismiss: "replaced",
            });
        }

        const overlay = document.createElement("div");
        overlay.className = "userscript-dialog-overlay";
        const popup = document.createElement("div");
        popup.className = "userscript-dialog-popup";
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-modal", "true");
        if (options.width) {
            popup.style.width = typeof options.width === "number" ? `${options.width}px` : options.width;
        }
        overlay.appendChild(popup);

        let resolveDialog;
        let settled = false;
        const resultPromise = new Promise((resolve) => {
            resolveDialog = resolve;
        });

        const dialogState = {
            overlay,
            popup,
            denyButton: null,
            validation: null,
            finish(result) {
                if (settled) {
                    return;
                }
                settled = true;
                document.removeEventListener("keydown", handleKeyDown, true);
                overlay.remove();
                if (activeDialog === dialogState) {
                    activeDialog = null;
                }
                resolveDialog(result);
            },
        };

        function dismiss(reason) {
            dialogState.finish({
                value: undefined,
                isConfirmed: false,
                isDenied: false,
                isDismissed: true,
                dismiss: reason,
            });
        }

        function handleKeyDown(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                dismiss("esc");
            }
        }

        if (options.closeButton) {
            const closeButton = document.createElement("button");
            closeButton.type = "button";
            closeButton.className = "userscript-dialog-close";
            closeButton.setAttribute("aria-label", "Close");
            closeButton.textContent = "×";
            closeButton.addEventListener("click", () => dismiss("close"));
            popup.appendChild(closeButton);
        }

        const iconText = {
            success: "✓",
            error: "×",
            warning: "!",
            question: "?",
        };
        if (options.title || (options.type && iconText[options.type])) {
            const titleRow = document.createElement("div");
            titleRow.className = "userscript-dialog-title-row";

            if (options.type && iconText[options.type]) {
                const iconElement = document.createElement("span");
                iconElement.className = `userscript-dialog-icon userscript-dialog-icon-${options.type}`;
                iconElement.textContent = iconText[options.type];
                iconElement.setAttribute("aria-hidden", "true");
                titleRow.appendChild(iconElement);
            }

            const titleElement = document.createElement("h2");
            titleElement.className = "userscript-dialog-title";
            titleElement.textContent = options.title || "Notification";
            titleRow.appendChild(titleElement);
            popup.appendChild(titleRow);
            popup.setAttribute("aria-label", titleElement.textContent);
        }

        if (options.content != null || options.message != null) {
            const contentElement = document.createElement("div");
            contentElement.className =
                options.content != null
                    ? "userscript-dialog-content userscript-dialog-html"
                    : "userscript-dialog-content userscript-dialog-message";
            if (options.content instanceof Node) {
                contentElement.appendChild(options.content);
            } else if (options.content != null) {
                contentElement.innerHTML = options.content;
            } else {
                contentElement.textContent = options.message;
            }
            popup.appendChild(contentElement);
        }

        const validation = document.createElement("div");
        validation.className = "userscript-dialog-validation";
        validation.setAttribute("role", "alert");
        popup.appendChild(validation);
        dialogState.validation = validation;

        const actions = document.createElement("div");
        actions.className = "userscript-dialog-actions";

        function createButton(className, label, handler) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `userscript-dialog-button ${className}`;
            button.textContent = label;
            button.addEventListener("click", handler);
            actions.appendChild(button);
            return button;
        }

        if (options.cancelText) {
            createButton("userscript-dialog-cancel", options.cancelText, () => dismiss("cancel"));
        }

        if (options.secondaryText) {
            dialogState.denyButton = createButton("userscript-dialog-deny", options.secondaryText, async () => {
                validation.style.display = "none";
                try {
                    const value = options.onSecondary
                        ? await options.onSecondary(popup, dialogState.denyButton)
                        : undefined;
                    if (value === false || validation.style.display !== "none") {
                        return;
                    }
                    dialogState.finish({
                        value,
                        isConfirmed: false,
                        isDenied: true,
                        isDismissed: false,
                    });
                } catch (error) {
                    showError(error.message || String(error));
                }
            });
        }

        let confirmButton = null;
        if (options.confirmText !== null) {
            confirmButton = createButton("userscript-dialog-confirm", options.confirmText || "Confirm", async () => {
                validation.style.display = "none";
                confirmButton.disabled = true;
                try {
                    let value;
                    if (options.onConfirm) {
                        value = await options.onConfirm(popup);
                    }
                    if (value === false || validation.style.display !== "none") {
                        return;
                    }
                    dialogState.finish({
                        value,
                        isConfirmed: true,
                        isDenied: false,
                        isDismissed: false,
                    });
                } catch (error) {
                    showError(error.message || String(error));
                } finally {
                    if (!settled) {
                        confirmButton.disabled = false;
                    }
                }
            });
        }

        if (actions.childElementCount > 0) {
            popup.appendChild(actions);
        }

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay && options.closeOnBackdrop !== false) {
                dismiss("backdrop");
            }
        });
        document.addEventListener("keydown", handleKeyDown, true);

        activeDialog = dialogState;
        shadowRoot.appendChild(overlay);

        if (typeof options.onOpen === "function") {
            options.onOpen(popup);
        }

        resultPromise.close = () => {
            dismiss("close");
            return Promise.resolve();
        };
        return resultPromise;
    }

    function showSpinner() {
        if (!activeDialog) {
            return;
        }
        const oldLoader = activeDialog.popup.querySelector(".userscript-dialog-loading");
        if (!oldLoader) {
            const loader = document.createElement("div");
            loader.className = "userscript-dialog-loading";
            loader.setAttribute("aria-label", "Loading");
            activeDialog.popup.appendChild(loader);
        }
        const actions = activeDialog.popup.querySelector(".userscript-dialog-actions");
        if (actions) {
            actions.style.display = "none";
        }
    }

    function showError(message) {
        if (!activeDialog) {
            return;
        }
        activeDialog.validation.textContent = message;
        activeDialog.validation.style.display = "block";
    }

    function alert(title, message, type, confirmText = "Confirm") {
        return open({ title, message, type, confirmText });
    }

    async function confirm(options) {
        const result = await open({
            title: options.title,
            message: options.message,
            content: options.content,
            type: options.type || "warning",
            confirmText: options.confirmText || "Confirm",
            cancelText: options.cancelText || "Cancel",
        });
        return result.isConfirmed;
    }

    function loading(title) {
        const task = open({
            title,
            confirmText: null,
            closeOnBackdrop: false,
            onOpen: showSpinner,
        });
        return { close: task.close };
    }

    return {
        alert,
        confirm,
        custom: open,
        loading,
        showError,
    };
})();
