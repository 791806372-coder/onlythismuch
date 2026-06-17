import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-service-program-config-"));
const port = await findOpenPort();
let child;

try {
  const plist = generateServicePlist(port);
  const programArguments = extractProgramArguments(plist);
  const workingDirectory = extractStringValue(plist, "WorkingDirectory");
  const environment = extractEnvironmentVariables(plist);
  assertServiceProgramArguments(programArguments, port);
  assertServiceEnvironment(workingDirectory, environment);

  child = spawn(programArguments[0], programArguments.slice(1), {
    cwd: workingDirectory,
    env: {
      ...process.env,
      ...environment,
      AIUW_CONFIG_DIR: configDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout = appendBounded(stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = appendBounded(stderr, chunk);
  });

  await waitFor(() => stdout.includes("aiuw connector listening"), 15_000, () => ({ stdout, stderr }));

  const configPath = path.join(configDir, "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assertPrivateConfig(configPath);
  assertNoServiceLogLeak(stdout, config.token, "service stdout");
  assertNoServiceLogLeak(stderr, config.token, "service stderr");

  const headers = { authorization: `Bearer ${config.token}` };
  const ping = await requestJson(`http://127.0.0.1:${port}/v1/ping`, headers);
  const snapshot = await requestJson(`http://127.0.0.1:${port}/v1/snapshot`, headers);
  if (ping.ok !== true || ping.deviceId !== config.deviceId) {
    throw new Error("Service ProgramArguments ping response did not match isolated config");
  }
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.providers)) {
    throw new Error("Service ProgramArguments snapshot response failed contract shape");
  }

  const liveStatus = runCliJson(["status", "--live", "--port", String(port)], config.token);
  if (liveStatus.liveCheck?.serverLooksRunning !== true) {
    throw new Error("aiuw status --live did not find the service ProgramArguments connector");
  }
  if (liveStatus.liveCheck?.snapshotLooksValid !== true) {
    throw new Error("aiuw status --live did not validate the service ProgramArguments snapshot");
  }

  const liveDoctor = runCliJson(["doctor", "--live", "--port", String(port)], config.token);
  if (liveDoctor.readyForIPhonePairing !== true) {
    throw new Error("aiuw doctor --live did not mark the service ProgramArguments connector ready for iPhone pairing");
  }

  console.log(`aiuw service ProgramArguments smoke ok: port ${port}, quiet pairing, live ping+snapshot`);
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await waitForChildClose(child);
  }
  fs.rmSync(configDir, { recursive: true, force: true });
}

function generateServicePlist(targetPort) {
  const result = spawnSync(
    process.execPath,
    [
      "connector/dist/connector/src/cli.js",
      "service",
      "plist",
      "--port",
      String(targetPort)
    ],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );
  if (result.status !== 0) {
    throw new Error(`aiuw service plist failed: ${result.stderr || result.stdout}`);
  }
  if (/token|Bearer|pairingPayload|manual pairing/i.test(result.stdout)) {
    throw new Error("aiuw service plist output contains pairing-sensitive text");
  }
  return result.stdout;
}

function extractProgramArguments(plist) {
  const arrayMatch = plist.match(/<key>\s*ProgramArguments\s*<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!arrayMatch) {
    throw new Error("LaunchAgent plist is missing ProgramArguments");
  }

  const args = [...arrayMatch[1].matchAll(/<string>([\s\S]*?)<\/string>/g)]
    .map((match) => unescapePlistValue(match[1]));
  if (args.length === 0) {
    throw new Error("LaunchAgent ProgramArguments are empty");
  }
  return args;
}

function extractStringValue(plist, key) {
  const pattern = new RegExp(`<key>\\s*${escapeRegExp(key)}\\s*<\\/key>\\s*<string>([\\s\\S]*?)<\\/string>`);
  const match = plist.match(pattern);
  if (!match) {
    throw new Error(`LaunchAgent plist is missing ${key}`);
  }
  return unescapePlistValue(match[1]);
}

function extractEnvironmentVariables(plist) {
  const dictMatch = plist.match(/<key>\s*EnvironmentVariables\s*<\/key>\s*<dict>([\s\S]*?)<\/dict>/);
  if (!dictMatch) {
    throw new Error("LaunchAgent plist is missing EnvironmentVariables");
  }

  const environment = {};
  const entries = [...dictMatch[1].matchAll(/<key>([\s\S]*?)<\/key>\s*<string>([\s\S]*?)<\/string>/g)];
  for (const entry of entries) {
    environment[unescapePlistValue(entry[1])] = unescapePlistValue(entry[2]);
  }
  return environment;
}

function assertServiceProgramArguments(args, targetPort) {
  if (args.length < 6) {
    throw new Error(`Unexpected short ProgramArguments: ${args.join(" ")}`);
  }
  if (args[0] !== process.execPath) {
    throw new Error("LaunchAgent ProgramArguments must use the current absolute Node runtime");
  }
  if (!path.isAbsolute(args[1]) || !args[1].endsWith("connector/dist/connector/src/cli.js")) {
    throw new Error("LaunchAgent ProgramArguments must point at the built aiuw CLI");
  }
  if (args[2] !== "start") {
    throw new Error("LaunchAgent ProgramArguments must start the connector");
  }
  if (!args.includes("--quiet-pairing")) {
    throw new Error("LaunchAgent ProgramArguments must suppress pairing output");
  }
  if (args.includes("--manual") || args.includes("--mock")) {
    throw new Error("LaunchAgent ProgramArguments must not print manual pairing data or run fixture mode");
  }
  if (args.includes("/bin/sh") || args.includes("npm") || args.includes("run")) {
    throw new Error("LaunchAgent ProgramArguments must not shell through npm");
  }
  const portIndex = args.indexOf("--port");
  if (portIndex < 0 || args[portIndex + 1] !== String(targetPort)) {
    throw new Error("LaunchAgent ProgramArguments must preserve the requested port");
  }
}

function assertServiceEnvironment(workingDirectory, environment) {
  if (workingDirectory !== repoRoot) {
    throw new Error(`LaunchAgent WorkingDirectory must be the repo root, got ${workingDirectory}`);
  }
  if (environment.HOME !== os.homedir()) {
    throw new Error("LaunchAgent HOME must be the current user's home directory");
  }
  if (environment.AIUW_CONFIG_DIR !== path.join(os.homedir(), ".aiuw")) {
    throw new Error("LaunchAgent AIUW_CONFIG_DIR must point at ~/.aiuw");
  }
  if (!environment.PATH || !environment.PATH.includes("/usr/bin")) {
    throw new Error("LaunchAgent PATH must include system command locations");
  }
  if (environment.PATH.includes("node_modules/.bin") || environment.PATH.includes(".codex/tmp")) {
    throw new Error("LaunchAgent PATH must not capture transient shell paths");
  }
}

function runCliJson(args, token) {
  const result = spawnSync(
    process.execPath,
    ["connector/dist/connector/src/cli.js", ...args],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        AIUW_CONFIG_DIR: configDir
      },
      encoding: "utf8"
    }
  );
  if (result.status !== 0) {
    throw new Error(`aiuw ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  assertNoServiceLogLeak(result.stdout, token, `aiuw ${args[0]} stdout`);
  assertNoServiceLogLeak(result.stderr, token, `aiuw ${args[0]} stderr`);
  return JSON.parse(result.stdout);
}

function assertPrivateConfig(configPath) {
  const dirMode = fs.statSync(path.dirname(configPath)).mode & 0o777;
  const fileMode = fs.statSync(configPath).mode & 0o777;
  if (dirMode !== 0o700 || fileMode !== 0o600) {
    throw new Error(`Isolated service config permissions drifted: dir 0${dirMode.toString(8)}, file 0${fileMode.toString(8)}`);
  }
}

function assertNoServiceLogLeak(text, token, label) {
  if (!text) {
    return;
  }
  if (text.includes(token)) {
    throw new Error(`${label} leaked pairing token`);
  }
  if (/Bearer\s+[A-Za-z0-9._~+/=-]+/.test(text) ||
      /"token"\s*:\s*"[^"]+"/.test(text) ||
      /manual pairing payload/i.test(text) ||
      /pairing QR contains the token/i.test(text)) {
    throw new Error(`${label} contains pairing-sensitive text`);
  }
}

async function requestJson(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

async function waitFor(predicate, timeoutMs, debugSnapshot = () => ({})) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      const debug = debugSnapshot();
      throw new Error(`Connector exited early: ${debug.stderr || debug.stdout || child.exitCode}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const debug = debugSnapshot();
  throw new Error(`Timed out waiting for service ProgramArguments connector: ${debug.stderr || debug.stdout || "no output"}`);
}

function waitForChildClose(target) {
  return new Promise((resolve) => {
    target.once("close", resolve);
    setTimeout(resolve, 2_000).unref();
  });
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("No open port found"));
        }
      });
    });
    server.on("error", reject);
  });
}

function appendBounded(current, chunk) {
  return `${current}${chunk}`.slice(-16_384);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unescapePlistValue(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}
