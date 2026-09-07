const SettingsDialog = {
    createGroup(group) {
        const section = document.createElement("fieldset");
        section.dataset.settingsGroup = group;
        section.style.cssText = "min-width: 0; margin: 16px 0; padding: 4px 16px 8px; border: 1px solid #cbd5e1; border-radius: 9px;";

        const title = document.createElement("legend");
        title.textContent = group;
        title.style.cssText = "padding: 0 8px; color: #334155; font-size: 14px; font-weight: 650; text-align: left;";
        section.appendChild(title);
        return section;
    },

    createItem(item, value) {
        const field = document.createElement("div");
        field.style.cssText = "margin: 12px 0; text-align: left;";

        const label = document.createElement("label");
        label.textContent = item.label;
        label.style.cssText = "display: block; margin-bottom: 6px; color: #334155;";
        field.appendChild(label);

        const fieldValue = item.deserializeValue ? item.deserializeValue(value) : value;
        const applyCommonAttributes = (input) => {
            input.name = item.name;
            if (item.placeholder) {
                input.placeholder = item.placeholder;
            }
            Object.entries(item.attributes || {}).forEach(([name, attrValue]) => {
                input.setAttribute(name, attrValue);
            });
        };

        if (item.type === "select") {
            const select = document.createElement("select");
            select.className = "userscript-dialog-select";
            applyCommonAttributes(select);
            (item.options || []).forEach((option) => {
                const optionElement = document.createElement("option");
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                optionElement.selected = String(option.value) === String(fieldValue);
                select.appendChild(optionElement);
            });
            field.appendChild(select);
            return field;
        }

        if (item.type === "radio-group" || item.type === "checkbox-group") {
            const group = document.createElement("div");
            group.style.cssText = "display: flex; flex-wrap: wrap; gap: 10px 16px;";
            (item.options || []).forEach((option) => {
                const optionLabel = document.createElement("label");
                optionLabel.style.cssText = "display: inline-flex; align-items: center; gap: 6px;";
                const input = document.createElement("input");
                input.type = item.type === "radio-group" ? "radio" : "checkbox";
                input.name = item.name;
                input.value = option.value;
                input.dataset.settingName = item.name;
                input.checked =
                    item.type === "radio-group"
                        ? String(fieldValue) === String(option.value)
                        : Array.isArray(fieldValue) && fieldValue.map(String).includes(String(option.value));
                optionLabel.append(input, document.createTextNode(option.label));
                group.appendChild(optionLabel);
            });
            field.appendChild(group);
            return field;
        }

        const input = document.createElement(item.type === "textarea" ? "textarea" : "input");
        input.className = item.type === "textarea" ? "userscript-dialog-textarea" : "userscript-dialog-input";
        if (item.type !== "textarea") {
            input.type = item.type || "text";
        }
        applyCommonAttributes(input);
        if (item.type === "checkbox") {
            input.className = "";
            input.style.cssText = "width: auto; margin: 0;";
            input.checked = Boolean(fieldValue);
        } else if (fieldValue != null) {
            input.value = fieldValue;
        }

        if (item.type === "range") {
            const rangeContainer = document.createElement("div");
            rangeContainer.style.cssText = "display: flex; align-items: center; gap: 12px;";
            input.style.flex = "1";
            const output = document.createElement("span");
            output.textContent = input.value;
            input.addEventListener("input", () => {
                output.textContent = input.value;
            });
            rangeContainer.append(input, output);
            field.appendChild(rangeContainer);
        } else {
            field.appendChild(input);
        }
        return field;
    },

    readValue(panel, item) {
        if (item.type === "radio-group") {
            return panel.querySelector(`[name="${item.name}"]:checked`)?.value ?? null;
        }
        if (item.type === "checkbox-group") {
            return [...panel.querySelectorAll(`[data-setting-name="${item.name}"]:checked`)].map(
                (input) => input.value,
            );
        }
        const input = panel.querySelector(`[name="${item.name}"]`);
        return item.type === "checkbox" ? input.checked : input.value;
    },

    async open(options) {
        const form = document.createElement("form");
        const groups = new Map();
        options.items.forEach((item) => {
            let container = form;
            if (item.group != null) {
                if (typeof item.group !== "string") {
                    throw new TypeError(`设置项 ${item.name} 的 group 必须是字符串`);
                }
                if (!groups.has(item.group)) {
                    const section = this.createGroup(item.group);
                    groups.set(item.group, section);
                    form.appendChild(section);
                }
                container = groups.get(item.group);
            }
            container.appendChild(this.createItem(item, (options.values || {})[item.name]));
        });

        const result = await Dialog.custom({
            title: options.title,
            content: form,
            confirmText: options.confirmText || "Confirm",
            cancelText: options.cancelText || "Cancel",
            secondaryText: options.secondaryText,
            onOpen: options.onOpen,
            onSecondary: options.onSecondary,
            onConfirm: (panel) => {
                const values = {};
                let errorMessage = null;
                options.items.forEach((item) => {
                    const rawValue = this.readValue(panel, item);
                    if (!errorMessage && item.validValue) {
                        const validationMessage = item.validValue(rawValue);
                        if (validationMessage) {
                            errorMessage = validationMessage;
                        }
                    }
                    values[item.name] = item.serializeValue ? item.serializeValue(rawValue) : rawValue;
                });
                if (errorMessage) {
                    Dialog.showError(errorMessage);
                    return false;
                }
                return values;
            },
        });
        return result.isConfirmed ? result.value : null;
    },
};
