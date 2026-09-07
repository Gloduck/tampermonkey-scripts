import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(projectRoot, "dist");
const outputs = readdirSync(outputRoot).filter((name) => name.endsWith(".user.js"));

if (outputs.length === 0) {
    throw new Error("dist 目录中没有可校验的 .user.js 文件");
}

for (const output of outputs) {
    new Script(readFileSync(resolve(outputRoot, output), "utf8"), { filename: output });
    console.log(`Checked dist/${output}`);
}
