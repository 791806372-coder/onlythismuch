const NAME_KEYS = ["name", "deviceName", "localizedName"];
const SELECTOR_KEYS = ["identifier", "udid", "uuid", "UDID", "ecid", "serialNumber", "serial", "dnsName"];
const TYPE_KEYS = ["deviceType", "productType", "deviceClass", "productName", "modelName"];
const STATE_KEYS = [
  "outcome",
  "status",
  "state",
  "availability",
  "availabilityStatus",
  "connectionState",
  "connectionStatus",
  "pairingState",
];
const PROBLEM_STATE = /\b(?:failed|unavailable|not\s+available|disconnected|offline|untrusted|remembered|placeholder)\b/i;

export function xctracePhysicalDeviceLines(output) {
  const lines = String(output ?? "").split(/\r?\n/);
  const devicesStart = lines.findIndex((line) => line.trim() === "== Devices ==");
  if (devicesStart === -1) {
    return [];
  }

  const nextSection = lines.findIndex((line, index) => index > devicesStart && /^== .* ==$/.test(line.trim()));
  return lines
    .slice(devicesStart + 1, nextSection === -1 ? undefined : nextSection)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /iPhone/i.test(line) && !/Simulator/i.test(line));
}

export function parseXctraceDeviceLine(line) {
  const identifiers = [...String(line ?? "").matchAll(/\(([^()]+)\)/g)].map((match) => match[1]);
  const lastIdentifier = identifiers.at(-1);
  const name = String(line ?? "").split(" (")[0]?.trim();
  return {
    name: name || "iPhone",
    selector: lastIdentifier && !/^\d+\.\d+/.test(lastIdentifier) ? lastIdentifier : name || "iPhone",
    raw: String(line ?? "").trim(),
  };
}

export function parseXctracePhysicalIphones(output) {
  return xctracePhysicalDeviceLines(output).map(parseXctraceDeviceLine);
}

export function collectDevicectlPhysicalIphones(value, found = []) {
  if (!value || typeof value !== "object") {
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectDevicectlPhysicalIphones(item, found);
    }
    return found;
  }

  if (hasFailedOutcome(value) || hasProblemState(value)) {
    return found;
  }

  const candidate = devicectlCandidate(value);
  if (candidate) {
    found.push(candidate);
    return found;
  }

  for (const nested of Object.values(value)) {
    collectDevicectlPhysicalIphones(nested, found);
  }
  return found;
}

export function uniqueDevices(devices) {
  const seen = new Set();
  return devices.filter((device) => {
    const key = `${device.selector}|${device.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function devicectlCandidate(value) {
  const name = deviceName(value);
  const type = deviceType(value);
  if (!/iPhone/i.test(`${name ?? ""} ${type ?? ""}`)) {
    return undefined;
  }
  if (/simulator/i.test(`${name ?? ""} ${type ?? ""} ${JSON.stringify(value)}`)) {
    return undefined;
  }

  const selector = deviceSelector(value);
  if (!selector) {
    return undefined;
  }

  return {
    name: name || type || "iPhone",
    selector,
  };
}

function hasFailedOutcome(value) {
  if (value.error) {
    return true;
  }
  return typeof value.info?.outcome === "string" && /^failed$/i.test(value.info.outcome);
}

function hasProblemState(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(hasProblemState);
  }

  for (const [key, nested] of Object.entries(value)) {
    if (STATE_KEYS.includes(key) && typeof nested === "string" && PROBLEM_STATE.test(nested)) {
      return true;
    }
    if (nested && typeof nested === "object" && hasProblemState(nested)) {
      return true;
    }
  }
  return false;
}

function deviceName(value) {
  return (
    directStringAtAnyKey(value, NAME_KEYS) ||
    stringAtAnyKey(value.deviceProperties, NAME_KEYS) ||
    stringAtAnyKey(value.properties, NAME_KEYS)
  );
}

function deviceType(value) {
  return (
    directStringAtAnyKey(value, TYPE_KEYS) ||
    stringAtAnyKey(value.deviceProperties, TYPE_KEYS) ||
    stringAtAnyKey(value.hardwareProperties, TYPE_KEYS) ||
    stringAtAnyKey(value.properties, TYPE_KEYS)
  );
}

function deviceSelector(value) {
  return (
    directStringAtAnyKey(value, SELECTOR_KEYS) ||
    stringAtAnyKey(value.deviceProperties, SELECTOR_KEYS) ||
    stringAtAnyKey(value.hardwareProperties, SELECTOR_KEYS) ||
    stringAtAnyKey(value.properties, SELECTOR_KEYS)
  );
}

function directStringAtAnyKey(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim()) {
      return value[key].trim();
    }
  }
  return undefined;
}

function stringAtAnyKey(value, keys) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const direct = directStringAtAnyKey(value, keys);
  if (direct) {
    return direct;
  }
  for (const nested of Object.values(value)) {
    const found = stringAtAnyKey(nested, keys);
    if (found) {
      return found;
    }
  }
  return undefined;
}
