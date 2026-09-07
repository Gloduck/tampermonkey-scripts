import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(projectRoot, "src");
const outputRoot = resolve(projectRoot, "dist");
const includePattern = /^(\s*)\/\/\s*<include:(.+)>\s*$/;

function discoverBuilds() {
    return readdirSync(sourceRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => resolve(sourceRoot, entry.name, "userscript.json"))
        .filter((configPath) => {
            try {
                readFileSync(configPath);
                return true;
            } catch (error) {
                if (error.code === "ENOENT") return false;
                throw error;
            }
        })
        .map((configPath) => ({
            configPath,
            directory: dirname(configPath),
            config: JSON.parse(readFileSync(configPath, "utf8")),
        }));
}

function resolveInside(root, base, path) {
    const resolvedPath = resolve(base, path);
    const relativePath = relative(root, resolvedPath);
    if (relativePath === "" || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
        throw new Error(`路径超出源码目录: ${path}`);
    }
    return resolvedPath;
}

function expandFile(filePath, stack = []) {
    if (stack.includes(filePath)) {
        throw new Error(`检测到循环引用: ${[...stack, filePath].join(" -> ")}`);
    }

    const lines = readFileSync(filePath, "utf8").split("\n");
    const output = [];
    for (const line of lines) {
        const match = line.match(includePattern);
        if (!match) {
            output.push(line);
            continue;
        }

        const includePath = resolveInside(sourceRoot, dirname(filePath), match[2].trim());
        const included = expandFile(includePath, [...stack, filePath]).trimEnd();
        const prefix = match[1];
        output.push(...included.split("\n").map((includedLine) => (includedLine ? `${prefix}${includedLine}` : "")));
    }
    return output.join("\n");
}

mkdirSync(outputRoot, { recursive: true });

const builds = discoverBuilds();
if (builds.length === 0) {
    throw new Error("没有找到 src/*/userscript.json");
}

for (const build of builds) {
    const { entry, output } = build.config;
    if (!entry || !output) {
        throw new Error(`${build.configPath} 必须配置 entry 和 output`);
    }

    const entryPath = resolveInside(sourceRoot, build.directory, entry);
    const outputPath = resolveInside(outputRoot, outputRoot, output);
    writeFileSync(outputPath, `${expandFile(entryPath).trimEnd()}\n`, "utf8");
    console.log(`Generated dist/${output}`);
}
