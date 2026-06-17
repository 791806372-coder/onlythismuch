import assert from "node:assert/strict";
import test from "node:test";
import { buildPairingPayload, redactPairingPayload, renderPairingPayload } from "../src/pairing";
import { isReachableLocalHost, limitPairingHosts, MAX_PAIRING_HOSTS, normalizeBonjourHost } from "../src/network";

test("builds v1 pairing payload with token, hosts, and port", () => {
  const payload = buildPairingPayload(
    {
      version: 1,
      deviceId: "mac-test",
      name: "Test Mac",
      token: "test-token",
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    8787
  );

  assert.equal(payload.v, 1);
  assert.equal(payload.deviceId, "mac-test");
  assert.equal(payload.name, "Test Mac");
  assert.equal(payload.port, 8787);
  assert.equal(payload.token, "test-token");
  assert.equal(payload.hosts.length > 0, true);
  assert.equal(payload.hosts.length <= MAX_PAIRING_HOSTS, true);
  assert.equal(payload.hosts.every(isReachableLocalHost), true);
});

test("redacted pairing payload omits pasteable token", () => {
  const payload = {
    v: 1 as const,
    deviceId: "mac-test",
    name: "Test Mac",
    hosts: ["192.168.1.7"],
    port: 8787,
    token: "secret-token"
  };

  const redacted = redactPairingPayload(payload);

  assert.equal("token" in redacted, false);
  assert.equal(redacted.tokenRedacted, true);
  assert.equal(redacted.deviceId, payload.deviceId);
});

test("default render sends full token to QR but redacts terminal JSON", () => {
  const payload = testPayload();
  let qrInput = "";
  const logs = captureLogs(() => {
    renderPairingPayload(payload, {
      qrGenerator: (input) => {
        qrInput = input;
      }
    });
  });

  assert.equal(JSON.parse(qrInput).token, payload.token);
  assert.equal(logs.includes(payload.token), false);
  assert.equal(logs.includes("\"token\":"), false);
  assert.equal(logs.includes("tokenRedacted"), true);
});

test("manual render prints full token payload", () => {
  const payload = testPayload();
  const logs = captureLogs(() => {
    renderPairingPayload(payload, { manual: true, qrGenerator: false });
  });

  assert.equal(logs.includes("\"token\": \"secret-token\""), true);
});

test("QR render failure does not claim QR is available", () => {
  const logs = captureLogs(() => {
    renderPairingPayload(testPayload(), {
      qrGenerator: () => {
        throw new Error("no qr");
      }
    });
  });

  assert.equal(logs.includes("QR unavailable"), true);
  assert.equal(logs.includes("pairing QR contains the token"), false);
});

test("normalizes Bonjour host without duplicating .local", () => {
  assert.equal(normalizeBonjourHost("KaideMacBook-Pro"), "KaideMacBook-Pro.local");
  assert.equal(normalizeBonjourHost("KaideMacBook-Pro.local"), "KaideMacBook-Pro.local");
  assert.equal(normalizeBonjourHost("KaideMacBook-Pro.local."), "KaideMacBook-Pro.local");
});

test("rejects malformed Bonjour local hostnames", () => {
  const malformedHosts = [
    ".local",
    "bad.local.local",
    "bad host.local",
    "bad..local",
    "-bad.local",
    "bad-.local",
    "bad_thing.local",
    "localhost.local"
  ];

  assert.equal(malformedHosts.some(isReachableLocalHost), false);
  assert.equal(normalizeBonjourHost("bad host"), undefined);
  assert.equal(normalizeBonjourHost("bad.local.local"), undefined);
});

function testPayload() {
  return {
    v: 1 as const,
    deviceId: "mac-test",
    name: "Test Mac",
    hosts: ["192.168.1.7"],
    port: 8787,
    token: "secret-token"
  };
}

function captureLogs(callback: () => void): string {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.join(" "));
  };
  try {
    callback();
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

test("matches iOS local host pairing rules", () => {
  const accepted = [
    "KaideMacBook-Pro.local",
    "10.0.0.7",
    "172.16.0.7",
    "172.31.0.7",
    "192.168.1.7",
    "169.254.4.7"
  ];
  const rejected = [
    "localhost",
    "127.0.0.1",
    "127.4.5.6",
    "198.18.0.1",
    "8.8.8.8",
    "172.32.0.7",
    "192.168.1.999",
    "192.168.1",
    "192.168..7",
    "192.168.1e0.7",
    "bad.local.local",
    "bad host.local",
    "-bad.local",
    "bad-.local",
    "localhost.local",
    "example.com"
  ];

  assert.equal(accepted.every(isReachableLocalHost), true);
  assert.equal(rejected.some(isReachableLocalHost), false);
});

test("caps pairing hosts with reachable addresses before bonjour and link-local", () => {
  const hosts = limitPairingHosts(
    [
      "169.254.4.7",
      "10.0.0.8",
      "192.168.1.7",
      "172.16.0.7",
      "8.8.8.8",
      "10.0.0.8"
    ],
    "KaideMacBook-Pro.local"
  );

  assert.equal(hosts.length, MAX_PAIRING_HOSTS);
  assert.deepEqual(hosts, [
    "192.168.1.7",
    "10.0.0.8",
    "172.16.0.7",
    "KaideMacBook-Pro.local"
  ]);
});

test("keeps link-local hosts after bonjour fallback", () => {
  const hosts = limitPairingHosts(
    [
      "169.254.4.7"
    ],
    "KaideMacBook-Pro.local"
  );

  assert.deepEqual(hosts, [
    "KaideMacBook-Pro.local",
    "169.254.4.7"
  ]);
});
