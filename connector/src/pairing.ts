import type { ConnectorConfig } from "./config";
import { getLanHosts } from "./network";

export type PairingPayload = {
  v: 1;
  deviceId: string;
  name: string;
  hosts: string[];
  port: number;
  token: string;
};

export type RedactedPairingPayload = Omit<PairingPayload, "token"> & {
  tokenRedacted: true;
};

export function buildPairingPayload(config: ConnectorConfig, port: number): PairingPayload {
  return {
    v: 1,
    deviceId: config.deviceId,
    name: config.name,
    hosts: getLanHosts(),
    port,
    token: config.token
  };
}

export function redactPairingPayload(payload: PairingPayload): RedactedPairingPayload {
  const { token: _token, ...safePayload } = payload;
  return {
    ...safePayload,
    tokenRedacted: true
  };
}

type QrGenerator = (input: string, options: { small: boolean }) => void;

function loadQrGenerator(): QrGenerator | undefined {
  try {
    const qr = require("qrcode-terminal") as {
      generate(input: string, options: { small: boolean }): void;
    };
    return qr.generate;
  } catch {
    return undefined;
  }
}

export function renderPairingPayload(
  payload: PairingPayload,
  options: { manual?: boolean; qrGenerator?: QrGenerator | false } = {}
): void {
  const serialized = JSON.stringify(payload);
  const qrGenerator = options.qrGenerator === undefined ? loadQrGenerator() : options.qrGenerator;
  let qrRendered = false;

  if (qrGenerator) {
    try {
      qrGenerator(serialized, { small: true });
      qrRendered = true;
    } catch {
      qrRendered = false;
    }
  }

  if (options.manual) {
    if (!qrRendered) {
      console.log("AI Usage Widget QR unavailable; using manual payload.");
    }
    console.log("AI Usage Widget manual pairing payload (contains local bearer token):");
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (qrRendered) {
      console.log("AI Usage Widget pairing QR contains the token.");
    } else {
      console.log("AI Usage Widget QR unavailable; terminal JSON is redacted.");
    }
    console.log("Terminal JSON is redacted and is not pasteable; run `aiuw pair --manual` if QR scanning is unavailable.");
    console.log(JSON.stringify(redactPairingPayload(payload), null, 2));
  }
}
