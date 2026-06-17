import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ConnectorConfig = {
  version: 1;
  deviceId: string;
  name: string;
  token: string;
  updatedAt: string;
};

export type ConfigPaths = {
  dir: string;
  file: string;
};

const EMAIL_VALUE_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const NETWORK_VALUE_RE = /\b(?:https?:\/\/|[a-z][a-z0-9+.-]*:\/\/|localhost|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.local)\b/i;
const FORBIDDEN_VALUE_RE = /\b(?:api[_-]?token|authorization|bearer|cookie|secret|credential|password|passphrase|passwd|keychain|transcript|raw\s+(?:stdout|stderr|log|output)|provider\s+output)\b/i;
const MAX_PUBLIC_DEVICE_NAME_LENGTH = 80;

export function getConfigPaths(homeDir?: string): ConfigPaths {
  const dir = homeDir
    ? path.join(homeDir, ".aiuw")
    : process.env.AIUW_CONFIG_DIR ?? path.join(os.homedir(), ".aiuw");
  return {
    dir,
    file: path.join(dir, "config.json")
  };
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function defaultDeviceName(): string {
  return "Mac connector";
}

function generateDeviceId(): string {
  return `mac-${crypto.randomUUID()}`;
}

function safePublicDeviceName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > MAX_PUBLIC_DEVICE_NAME_LENGTH) {
    return undefined;
  }
  if (EMAIL_VALUE_RE.test(trimmed) || NETWORK_VALUE_RE.test(trimmed) || FORBIDDEN_VALUE_RE.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function publicDeviceName(value: string | undefined): string {
  return safePublicDeviceName(value) ?? defaultDeviceName();
}

function makeConfig(existing?: Partial<ConnectorConfig>): ConnectorConfig {
  return {
    version: 1,
    deviceId: existing?.deviceId ?? generateDeviceId(),
    name: publicDeviceName(existing?.name),
    token: existing?.token ?? generateToken(),
    updatedAt: existing?.updatedAt ?? new Date().toISOString()
  };
}

function readExisting(file: string): Partial<ConnectorConfig> | undefined {
  if (!fs.existsSync(file)) {
    return undefined;
  }

  const mode = fs.statSync(file).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    fs.chmodSync(file, 0o600);
  }

  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ConnectorConfig>;
  if (parsed.version !== 1 || !parsed.deviceId || !parsed.name || !parsed.token) {
    throw new Error(`Invalid aiuw config at ${file}`);
  }

  return parsed;
}

function ensureExistingDirPrivate(dir: string): void {
  if (!fs.existsSync(dir)) {
    return;
  }

  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`Invalid aiuw config directory at ${dir}`);
  }
  const mode = stat.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    fs.chmodSync(dir, 0o700);
  }
}

export function saveConfig(config: ConnectorConfig, paths = getConfigPaths()): void {
  fs.mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(paths.dir, 0o700);
  fs.writeFileSync(paths.file, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  fs.chmodSync(paths.file, 0o600);
}

export function loadOrCreateConfig(paths = getConfigPaths()): ConnectorConfig {
  ensureExistingDirPrivate(paths.dir);
  const existing = readExisting(paths.file);
  const config = makeConfig(existing);
  if (!fs.existsSync(paths.file) || existing?.name !== config.name) {
    saveConfig(config, paths);
  }
  return config;
}

export function loadConfig(paths = getConfigPaths()): ConnectorConfig | undefined {
  if (!fs.existsSync(paths.file)) {
    return undefined;
  }
  ensureExistingDirPrivate(paths.dir);
  const existing = readExisting(paths.file);
  return existing ? makeConfig(existing) : undefined;
}

export function rotateToken(paths = getConfigPaths()): ConnectorConfig {
  ensureExistingDirPrivate(paths.dir);
  const config = makeConfig({
    ...readExisting(paths.file),
    token: generateToken(),
    updatedAt: new Date().toISOString()
  });
  saveConfig(config, paths);
  return config;
}
