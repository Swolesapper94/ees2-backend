import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

if (!command) {
  console.error("Usage: node scripts/with-node22.mjs <command> [...args]");
  process.exit(1);
}

function major(version) {
  return Number(version.replace(/^v/, "").split(".")[0]);
}

function versionParts(version) {
  return version.replace(/^v/, "").split(".").map((part) => Number(part));
}

function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function findNode22Bin() {
  if (major(process.version) >= 22) return null;
  if (process.env.NODE22_BIN && existsSync(join(process.env.NODE22_BIN, "node"))) {
    return process.env.NODE22_BIN;
  }
  const versionsDir = join(homedir(), ".nvm", "versions", "node");
  if (!existsSync(versionsDir)) return null;
  const newest = readdirSync(versionsDir)
    .filter((entry) => major(entry) >= 22)
    .sort(compareVersions)
    .at(-1);
  if (!newest) return null;
  const binDir = join(versionsDir, newest, "bin");
  return existsSync(join(binDir, "node")) ? binDir : null;
}

const node22Bin = findNode22Bin();
if (major(process.version) < 22 && !node22Bin) {
  console.error("Node.js 22+ is required. Install Node 22 with nvm, or set NODE22_BIN.");
  process.exit(1);
}

const child = spawn(command, commandArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    PATH: node22Bin ? `${node22Bin}:${process.env.PATH ?? ""}` : process.env.PATH,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
