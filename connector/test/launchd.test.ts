import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  LAUNCHD_LABEL,
  buildLaunchctlArgs,
  buildLaunchdPlist,
  buildLaunchdProgramArguments,
  getLaunchdPaths,
  inspectLaunchdProgram,
  inspectLaunchdService,
  removeLaunchdPlist,
  writeLaunchdPlist,
} from "../src/launchd";

test("launchd plist starts connector quietly without secrets or QR output", () => {
  const plist = buildLaunchdPlist({
    port: 8787,
    codexBar: true,
    claudeCodeTty: true,
    nodePath: "/usr/local/bin/node",
    cliPath: "/Applications/AI Usage Widget/connector/cli.js",
    homeDir: "/Users/tester",
  });

  assert.equal(plist.includes(LAUNCHD_LABEL), true);
  assert.equal(plist.includes("<string>/usr/local/bin/node</string>"), true);
  assert.equal(plist.includes("<string>start</string>"), true);
  assert.equal(plist.includes("<string>--quiet-pairing</string>"), true);
  assert.equal(plist.includes("<string>--codexbar</string>"), true);
  assert.equal(plist.includes("<string>--claude-code-tty</string>"), true);
  assert.equal(plist.includes("<key>WorkingDirectory</key>"), true);
  assert.equal(plist.includes(`<string>${process.cwd()}</string>`), true);
  assert.equal(plist.includes("<key>EnvironmentVariables</key>"), true);
  assert.equal(plist.includes("<key>HOME</key>"), true);
  assert.equal(plist.includes("<string>/Users/tester</string>"), true);
  assert.equal(plist.includes("<key>AIUW_CONFIG_DIR</key>"), true);
  assert.equal(plist.includes("<string>/Users/tester/.aiuw</string>"), true);
  assert.equal(plist.includes("<key>PATH</key>"), true);
  assert.equal(plist.includes("<string>/Users/tester/.local/bin:/Users/tester/.hermes/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>"), true);
  assert.equal(plist.includes("node_modules/.bin"), false);
  assert.equal(plist.includes(".codex/tmp"), false);
  assert.equal(plist.includes("<key>ThrottleInterval</key>"), true);
  assert.equal(plist.includes("/Users/tester/Library/Logs/AIUsageWidget/connector.log"), true);
  assert.equal(plist.includes("token"), false);
  assert.equal(plist.includes("Bearer"), false);
  assert.equal(plist.includes("pairingPayload"), false);
  assert.equal(plist.includes("npm run"), false);
  assert.equal(plist.includes("/bin/sh"), false);
});

test("launchd program arguments omit CodexBar unless explicitly requested", () => {
  assert.deepEqual(
    buildLaunchdProgramArguments({
      port: 8787,
      codexBar: false,
      claudeCodeTty: false,
      nodePath: "/usr/bin/node",
      cliPath: "/tmp/cli.js",
    }),
    ["/usr/bin/node", "/tmp/cli.js", "start", "--port", "8787", "--quiet-pairing"]
  );
});

test("launchd program arguments require absolute executable paths", () => {
  assert.throws(
    () => buildLaunchdProgramArguments({
      port: 8787,
      codexBar: false,
      claudeCodeTty: false,
      nodePath: "node",
      cliPath: "/tmp/cli.js",
    }),
    /nodePath/
  );
  assert.throws(
    () => buildLaunchdProgramArguments({
      port: 8787,
      codexBar: false,
      claudeCodeTty: false,
      nodePath: "/usr/bin/node",
      cliPath: "connector/dist/cli.js",
    }),
    /cliPath/
  );
});

test("launchctl commands use fixed arguments without shell strings", () => {
  const paths = getLaunchdPaths("/Users/tester");

  assert.deepEqual(buildLaunchctlArgs("load", paths, 501), [
    "bootstrap",
    "gui/501",
    "/Users/tester/Library/LaunchAgents/com.aiuw.connector.plist",
  ]);
  assert.deepEqual(buildLaunchctlArgs("unload", paths, 501), [
    "bootout",
    "gui/501",
    "/Users/tester/Library/LaunchAgents/com.aiuw.connector.plist",
  ]);
  assert.deepEqual(buildLaunchctlArgs("kickstart", paths, 501), [
    "kickstart",
    "-k",
    `gui/501/${LAUNCHD_LABEL}`,
  ]);
  assert.deepEqual(buildLaunchctlArgs("print", paths, 501), [
    "print",
    `gui/501/${LAUNCHD_LABEL}`,
  ]);
});

test("launchctl command builder rejects an invalid user id", () => {
  assert.throws(() => buildLaunchctlArgs("load", getLaunchdPaths("/Users/tester"), Number.NaN), /user id/);
});

test("launchd install writes a user plist with private permissions", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-launchd-test-"));
  const paths = writeLaunchdPlist({
    port: 9797,
    codexBar: false,
    claudeCodeTty: false,
    nodePath: "/usr/bin/node",
    cliPath: "/tmp/cli.js",
    homeDir,
  });

  assert.deepEqual(paths, getLaunchdPaths(homeDir));
  assert.equal(fs.existsSync(paths.plistPath), true);
  assert.equal(fs.existsSync(path.dirname(paths.logPath)), true);
  assert.equal(fs.statSync(paths.plistPath).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(paths.plistPath, "utf8").includes("<string>9797</string>"), true);

  removeLaunchdPlist(homeDir);
  assert.equal(fs.existsSync(paths.plistPath), false);
});

test("launchd install stages the runtime outside the repo when cliPath is not explicit", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-launchd-runtime-test-"));
  const paths = writeLaunchdPlist({
    port: 9797,
    codexBar: false,
    claudeCodeTty: true,
    nodePath: "/usr/bin/node",
    homeDir,
  });
  const plist = fs.readFileSync(paths.plistPath, "utf8");
  const runtimeCli = path.join(homeDir, ".aiuw", "runtime", "connector", "src", "cli.js");
  const workDir = path.join(homeDir, ".aiuw", "claude-usage-workdir");

  assert.equal(fs.existsSync(runtimeCli), true);
  assert.equal(fs.existsSync(path.join(homeDir, ".aiuw", "runtime", "package.json")), true);
  assert.equal(fs.existsSync(path.join(homeDir, ".aiuw", "runtime", "node_modules", "zod")), true);
  assert.equal(fs.existsSync(path.join(homeDir, ".aiuw", "runtime", "node_modules", "qrcode-terminal")), true);
  assert.equal(fs.existsSync(workDir), true);
  assert.equal(plist.includes(`<string>${runtimeCli}</string>`), true);
  assert.equal(plist.includes(`<string>${workDir}</string>`), true);
  assert.equal(plist.includes("<string>--claude-code-tty</string>"), true);

  removeLaunchdPlist(homeDir);
  fs.rmSync(homeDir, { recursive: true, force: true });
});

test("launchd service status summarizes loaded/running state without raw output", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-launchd-status-test-"));
  const nodePath = path.join(homeDir, "node");
  const cliPath = path.join(homeDir, "cli.js");
  fs.writeFileSync(nodePath, "");
  fs.writeFileSync(cliPath, "");
  const paths = writeLaunchdPlist({
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    nodePath,
    cliPath,
    homeDir,
  });

  const status = await inspectLaunchdService(paths, async () => ({
    status: 0,
    stdout: "state = running\npid = 12345\nProgramArguments = ( redacted )",
    stderr: "",
    signal: null,
  }));

  assert.equal(status.label, LAUNCHD_LABEL);
  assert.equal(status.plistExists, true);
  assert.equal(status.plistMode, "0600");
  assert.equal(status.launchctl.loaded, true);
  assert.equal(status.launchctl.running, true);
  assert.deepEqual(status.program, {
    argumentsFound: true,
    nodePathExists: true,
    cliPathExists: true,
    startCommandLooksValid: true,
    detail: "paths_ok",
  });
  assert.equal(JSON.stringify(status).includes("ProgramArguments"), false);
  assert.equal(JSON.stringify(status).includes("redacted"), false);

  removeLaunchdPlist(homeDir);
});

test("launchd program status detects stale Node or CLI paths", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-launchd-program-test-"));
  const nodePath = path.join(homeDir, "node");
  const missingCliPath = path.join(homeDir, "missing cli.js");
  fs.writeFileSync(nodePath, "");
  const paths = writeLaunchdPlist({
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    nodePath,
    cliPath: missingCliPath,
    homeDir,
  });

  assert.deepEqual(inspectLaunchdProgram(paths.plistPath), {
    argumentsFound: true,
    nodePathExists: true,
    cliPathExists: false,
    startCommandLooksValid: true,
    detail: "cli_path_missing",
  });

  removeLaunchdPlist(homeDir);
});

test("launchd program status handles unreadable or invalid plist paths", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-launchd-invalid-test-"));

  assert.deepEqual(inspectLaunchdProgram(homeDir, true), {
    argumentsFound: false,
    nodePathExists: null,
    cliPathExists: null,
    startCommandLooksValid: false,
    detail: "plist_unreadable",
  });
});

test("launchd service status redacts sensitive launchctl failure text", async () => {
  const paths = getLaunchdPaths("/Users/tester");
  const status = await inspectLaunchdService(paths, async () => ({
    status: 3,
    stdout: "",
    stderr: "not loaded: Bearer secret-token-value",
    signal: null,
  }));

  assert.equal(status.plistExists, false);
  assert.equal(status.program.detail, "not_installed");
  assert.equal(status.launchctl.loaded, false);
  assert.equal(status.launchctl.running, false);
  assert.equal(status.launchctl.error, "not loaded: Bearer [redacted]");
  assert.equal(JSON.stringify(status).includes("secret-token-value"), false);
});
