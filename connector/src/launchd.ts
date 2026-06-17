import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const LAUNCHD_LABEL = "com.aiuw.connector";

export type LaunchdOptions = {
  port: number;
  codexBar: boolean;
  claudeCodeTty: boolean;
  nodePath?: string;
  cliPath?: string;
  homeDir?: string;
  workingDirectory?: string;
};

export type LaunchdPaths = {
  plistPath: string;
  logPath: string;
  errorLogPath: string;
};

export type LaunchctlAction = "load" | "unload" | "kickstart" | "print";

export type LaunchctlResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  signal: NodeJS.Signals | null;
};

export type LaunchdServiceStatus = {
  label: typeof LAUNCHD_LABEL;
  plistPath: string;
  plistExists: boolean;
  plistMode?: string;
  logPath: string;
  errorLogPath: string;
  program: LaunchdProgramStatus;
  launchctl: {
    checked: true;
    loaded: boolean;
    running: boolean;
    detail: "loaded" | "not_loaded_or_unavailable";
    error?: string;
  };
};

export type LaunchdProgramStatus = {
  argumentsFound: boolean;
  nodePathExists: boolean | null;
  cliPathExists: boolean | null;
  startCommandLooksValid: boolean;
  detail:
    | "not_installed"
    | "plist_unreadable"
    | "program_arguments_missing"
    | "node_path_missing"
    | "cli_path_missing"
    | "unexpected_command"
    | "paths_ok";
};

export function getLaunchdPaths(homeDir = os.homedir()): LaunchdPaths {
  const logDir = path.join(homeDir, "Library", "Logs", "AIUsageWidget");
  return {
    plistPath: path.join(homeDir, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`),
    logPath: path.join(logDir, "connector.log"),
    errorLogPath: path.join(logDir, "connector-error.log"),
  };
}

function getRuntimeDir(homeDir = os.homedir()): string {
  return path.join(homeDir, ".aiuw", "runtime");
}

function getServiceWorkingDirectory(homeDir = os.homedir()): string {
  return path.join(homeDir, ".aiuw", "claude-usage-workdir");
}

function stageRuntime(homeDir = os.homedir()): string {
  const sourceRoot = path.resolve(__dirname, "../..");
  const connectorRoot = path.resolve(sourceRoot, "..");
  const repoRoot = path.resolve(connectorRoot, "..");
  const runtimeDir = getRuntimeDir(homeDir);
  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
  fs.cpSync(sourceRoot, runtimeDir, { recursive: true });
  stageRuntimeDependency("zod", [
    path.join(repoRoot, "node_modules", "zod"),
    path.join(connectorRoot, "node_modules", "zod"),
  ], runtimeDir);
  stageRuntimeDependency("qrcode-terminal", [
    path.join(connectorRoot, "node_modules", "qrcode-terminal"),
    path.join(repoRoot, "node_modules", "qrcode-terminal"),
  ], runtimeDir);
  fs.writeFileSync(
    path.join(runtimeDir, "package.json"),
    `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
  fs.chmodSync(runtimeDir, 0o700);
  return path.join(runtimeDir, "connector", "src", "cli.js");
}

function stageRuntimeDependency(name: string, candidates: string[], runtimeDir: string): void {
  const source = candidates.find((candidate) => fs.existsSync(candidate));
  if (!source) {
    return;
  }

  const target = path.join(runtimeDir, "node_modules", name);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.cpSync(source, target, { recursive: true });
}

export function buildLaunchdProgramArguments(options: LaunchdOptions): string[] {
  const nodePath = options.nodePath ?? process.execPath;
  const cliPath = options.cliPath ?? path.join(__dirname, "cli.js");
  assertAbsolutePath("nodePath", nodePath);
  assertAbsolutePath("cliPath", cliPath);

  const args = [
    nodePath,
    cliPath,
    "start",
    "--port",
    String(options.port),
    "--quiet-pairing",
  ];

  if (options.codexBar) {
    args.push("--codexbar");
  }
  if (options.claudeCodeTty) {
    args.push("--claude-code-tty");
  }

  return args;
}

export function buildLaunchdPlist(options: LaunchdOptions): string {
  const paths = getLaunchdPaths(options.homeDir);
  const homeDir = options.homeDir ?? os.homedir();
  const workingDirectory = options.workingDirectory ?? process.cwd();
  assertAbsolutePath("workingDirectory", workingDirectory);
  const programArguments = buildLaunchdProgramArguments(options)
    .map((argument) => `    <string>${escapePlistValue(argument)}</string>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments}
  </array>
  <key>WorkingDirectory</key>
  <string>${escapePlistValue(workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${escapePlistValue(homeDir)}</string>
    <key>AIUW_CONFIG_DIR</key>
    <string>${escapePlistValue(path.join(homeDir, ".aiuw"))}</string>
    <key>PATH</key>
    <string>${escapePlistValue(launchdPath(homeDir))}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>StandardOutPath</key>
  <string>${escapePlistValue(paths.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapePlistValue(paths.errorLogPath)}</string>
</dict>
</plist>
`;
}

export function writeLaunchdPlist(options: LaunchdOptions): LaunchdPaths {
  const homeDir = options.homeDir ?? os.homedir();
  const paths = getLaunchdPaths(homeDir);
  const cliPath = options.cliPath ?? stageRuntime(homeDir);
  const workingDirectory = options.workingDirectory ?? getServiceWorkingDirectory(homeDir);
  fs.mkdirSync(path.dirname(paths.plistPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.logPath), { recursive: true });
  fs.mkdirSync(workingDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(workingDirectory, 0o700);
  const tempPath = `${paths.plistPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, buildLaunchdPlist({
    ...options,
    homeDir,
    cliPath,
    workingDirectory,
  }), {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.chmodSync(tempPath, 0o600);
  fs.renameSync(tempPath, paths.plistPath);
  fs.chmodSync(paths.plistPath, 0o600);
  return paths;
}

export function removeLaunchdPlist(homeDir = os.homedir()): LaunchdPaths {
  const paths = getLaunchdPaths(homeDir);
  if (fs.existsSync(paths.plistPath)) {
    fs.unlinkSync(paths.plistPath);
  }
  return paths;
}

export function buildLaunchctlArgs(
  action: LaunchctlAction,
  paths = getLaunchdPaths(),
  uid = process.getuid?.()
): string[] {
  if (typeof uid !== "number" || !Number.isInteger(uid) || uid < 0) {
    throw new Error("launchctl user id is unavailable");
  }

  const launchUid = uid as number;
  const guiTarget = `gui/${launchUid}`;
  if (action === "load") {
    return ["bootstrap", guiTarget, paths.plistPath];
  }
  if (action === "unload") {
    return ["bootout", guiTarget, paths.plistPath];
  }
  if (action === "kickstart") {
    return ["kickstart", "-k", `${guiTarget}/${LAUNCHD_LABEL}`];
  }
  return ["print", `${guiTarget}/${LAUNCHD_LABEL}`];
}

export async function runLaunchctl(args: string[]): Promise<void> {
  const result = await runLaunchctlCapture(args);
  if (result.status === 0) {
    return;
  }

  throw new Error(summarizeLaunchctlResult(result) || `launchctl exited with code ${result.status ?? "unknown"}`);
}

export async function runLaunchctlCapture(args: string[]): Promise<LaunchctlResult> {
  return new Promise<LaunchctlResult>((resolve, reject) => {
    const child = spawn("launchctl", args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8").slice(0, 1_000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8").slice(0, 1_000);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({
        status: code,
        stdout,
        stderr,
        signal,
      });
    });
  });
}

export async function inspectLaunchdService(
  paths = getLaunchdPaths(),
  launchctlRunner: (args: string[]) => Promise<LaunchctlResult> = runLaunchctlCapture
): Promise<LaunchdServiceStatus> {
  const plistExists = fs.existsSync(paths.plistPath);
  const plistMode = plistExists
    ? `0${(fs.statSync(paths.plistPath).mode & 0o777).toString(8)}`
    : undefined;
  const result = await launchctlRunner(buildLaunchctlArgs("print", paths));
  const loaded = result.status === 0;

  return {
    label: LAUNCHD_LABEL,
    plistPath: paths.plistPath,
    plistExists,
    ...(plistMode ? { plistMode } : {}),
    logPath: paths.logPath,
    errorLogPath: paths.errorLogPath,
    program: inspectLaunchdProgram(paths.plistPath, plistExists),
    launchctl: {
      checked: true,
      loaded,
      running: loaded && /(?:state\s*=\s*running|pid\s*=\s*\d+)/i.test(result.stdout),
      detail: loaded ? "loaded" : "not_loaded_or_unavailable",
      ...(loaded ? {} : { error: summarizeLaunchctlResult(result) }),
    },
  };
}

export function inspectLaunchdProgram(plistPath: string, plistExists = fs.existsSync(plistPath)): LaunchdProgramStatus {
  if (!plistExists) {
    return {
      argumentsFound: false,
      nodePathExists: null,
      cliPathExists: null,
      startCommandLooksValid: false,
      detail: "not_installed"
    };
  }

  let plist: string;
  try {
    plist = fs.readFileSync(plistPath, "utf8");
  } catch {
    return {
      argumentsFound: false,
      nodePathExists: null,
      cliPathExists: null,
      startCommandLooksValid: false,
      detail: "plist_unreadable"
    };
  }

  const programArguments = extractProgramArguments(plist);
  if (!programArguments || programArguments.length < 2) {
    return {
      argumentsFound: false,
      nodePathExists: null,
      cliPathExists: null,
      startCommandLooksValid: false,
      detail: "program_arguments_missing"
    };
  }

  const nodePathExists = fs.existsSync(programArguments[0]);
  const cliPathExists = fs.existsSync(programArguments[1]);
  const startCommandLooksValid =
    programArguments[2] === "start" &&
    programArguments.includes("--port") &&
    programArguments.includes("--quiet-pairing");

  return {
    argumentsFound: true,
    nodePathExists,
    cliPathExists,
    startCommandLooksValid,
    detail: launchdProgramDetail(nodePathExists, cliPathExists, startCommandLooksValid)
  };
}

function launchdProgramDetail(
  nodePathExists: boolean,
  cliPathExists: boolean,
  startCommandLooksValid: boolean
): LaunchdProgramStatus["detail"] {
  if (!nodePathExists) {
    return "node_path_missing";
  }
  if (!cliPathExists) {
    return "cli_path_missing";
  }
  if (!startCommandLooksValid) {
    return "unexpected_command";
  }
  return "paths_ok";
}

function extractProgramArguments(plist: string): string[] | undefined {
  const arrayMatch = plist.match(/<key>\s*ProgramArguments\s*<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!arrayMatch) {
    return undefined;
  }

  return [...arrayMatch[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map((match) =>
    unescapePlistValue(match[1])
  );
}

function summarizeLaunchctlResult(result: LaunchctlResult): string {
  if (result.signal) {
    return `terminated by ${result.signal}`;
  }
  const line = firstUsefulLine(result.stderr) || firstUsefulLine(result.stdout);
  if (!line) {
    return "";
  }
  return redactSensitiveText(line).slice(0, 200);
}

function firstUsefulLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

function redactSensitiveText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/"token"\s*:\s*"[^"]+"/g, "\"token\":\"[redacted]\"");
}

function launchdPath(homeDir: string): string {
  return [
    path.join(homeDir, ".local", "bin"),
    path.join(homeDir, ".hermes", "node", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":");
}

function escapePlistValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapePlistValue(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function assertAbsolutePath(name: string, value: string): void {
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
}
