import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getConfigPaths, loadConfig, loadOrCreateConfig, rotateToken, saveConfig } from "../src/config";

test("creates config with 0600 permissions and rotates token", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-config-"));
  const paths = getConfigPaths(home);

  const first = loadOrCreateConfig(paths);
  const dirMode = fs.statSync(paths.dir).mode & 0o777;
  const mode = fs.statSync(paths.file).mode & 0o777;
  assert.equal(dirMode, 0o700);
  assert.equal(mode, 0o600);
  assert.equal(first.token.length > 30, true);

  const rotated = rotateToken(paths);
  assert.equal(rotated.deviceId, first.deviceId);
  assert.notEqual(rotated.token, first.token);
});

test("read-only load does not create a missing config", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-config-"));
  const paths = getConfigPaths(home);

  assert.equal(loadConfig(paths), undefined);
  assert.equal(fs.existsSync(paths.file), false);
});

test("repairs overly broad existing config permissions", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-config-"));
  const paths = getConfigPaths(home);
  const first = loadOrCreateConfig(paths);
  fs.chmodSync(paths.dir, 0o755);
  fs.chmodSync(paths.file, 0o644);

  const loaded = loadOrCreateConfig(paths);

  assert.equal(loaded.deviceId, first.deviceId);
  assert.equal(fs.statSync(paths.dir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(paths.file).mode & 0o777, 0o600);
});

test("read-only load repairs broad existing config directory without creating missing config", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-config-"));
  const paths = getConfigPaths(home);
  saveConfig({
    version: 1,
    deviceId: "mac-test",
    name: "Test Mac",
    token: "old-token",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }, paths);
  fs.chmodSync(paths.dir, 0o755);

  const loaded = loadConfig(paths);

  assert.equal(loaded?.deviceId, "mac-test");
  assert.equal(fs.statSync(paths.dir).mode & 0o777, 0o700);
});

test("sanitizes and repairs network-like public device names from existing config", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-config-"));
  const paths = getConfigPaths(home);
  saveConfig({
    version: 1,
    deviceId: "mac-test",
    name: "kai-mac.local",
    token: "old-token",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }, paths);

  const loaded = loadOrCreateConfig(paths);
  const persisted = JSON.parse(fs.readFileSync(paths.file, "utf8"));

  assert.equal(loaded.name, "Mac connector");
  assert.equal(persisted.name, "Mac connector");
});

test("preserves updatedAt on load and changes it on token rotation", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-config-"));
  const paths = getConfigPaths(home);
  const fixedUpdatedAt = "2026-01-01T00:00:00.000Z";
  saveConfig({
    version: 1,
    deviceId: "mac-test",
    name: "Test Mac",
    token: "old-token",
    updatedAt: fixedUpdatedAt
  }, paths);

  const loaded = loadOrCreateConfig(paths);
  const rotated = rotateToken(paths);

  assert.equal(loaded.updatedAt, fixedUpdatedAt);
  assert.notEqual(rotated.updatedAt, fixedUpdatedAt);
  assert.notEqual(rotated.token, loaded.token);
});
