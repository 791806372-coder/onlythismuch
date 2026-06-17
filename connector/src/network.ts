import os from "node:os";

export const MAX_PAIRING_HOSTS = 4;

export function getLanHosts(): string[] {
  const addresses: string[] = [];

  for (const interfaceAddresses of Object.values(os.networkInterfaces())) {
    for (const address of interfaceAddresses ?? []) {
      if (
        address.family === "IPv4" &&
        !address.internal &&
        isReachableLocalHost(address.address)
      ) {
        addresses.push(address.address);
      }
    }
  }

  const bonjourHost = normalizeBonjourHost(os.hostname());
  const hosts = limitPairingHosts(addresses, bonjourHost);

  return hosts;
}

export function limitPairingHosts(addresses: string[], bonjourHost?: string): string[] {
  const sortedAddresses = [...new Set(addresses.filter(isReachableLocalHost).sort(compareHosts))];
  const primaryAddresses = sortedAddresses.filter((host) => !isLinkLocalHost(host));
  const fallbackAddresses = sortedAddresses.filter(isLinkLocalHost);
  const hosts: string[] = [];
  const usableBonjourHost = bonjourHost && isReachableLocalHost(bonjourHost) ? bonjourHost : undefined;
  const primaryLimit = usableBonjourHost ? MAX_PAIRING_HOSTS - 1 : MAX_PAIRING_HOSTS;

  for (const host of primaryAddresses.slice(0, primaryLimit)) {
    pushUnique(hosts, host);
  }

  if (usableBonjourHost) {
    pushUnique(hosts, usableBonjourHost);
  }

  for (const host of fallbackAddresses) {
    pushUnique(hosts, host);
  }

  return hosts.slice(0, MAX_PAIRING_HOSTS);
}

export function isReachableLocalHost(host: string): boolean {
  const lowercased = host.toLowerCase();
  if (lowercased === "localhost") {
    return false;
  }
  if (lowercased.endsWith(".local")) {
    return isBonjourLocalHost(host);
  }

  const parts = host.split(".");
  if (parts.length !== 4) {
    return false;
  }

  if (parts.some((part) => !/^\d+$/.test(part))) {
    return false;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  if (first === 127) {
    return false;
  }
  if (first === 10) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  if (first === 169 && second === 254) {
    return true;
  }

  return false;
}

export function normalizeBonjourHost(hostname: string): string | undefined {
  const trimmed = hostname.trim().replace(/\.+$/, "");
  if (!trimmed) {
    return undefined;
  }

  const candidate = trimmed.toLowerCase().endsWith(".local") ? trimmed : `${trimmed}.local`;
  return isBonjourLocalHost(candidate) ? candidate : undefined;
}

function compareHosts(left: string, right: string): number {
  return hostRank(left) - hostRank(right) || left.localeCompare(right);
}

function hostRank(host: string): number {
  if (host.startsWith("192.168.")) {
    return 0;
  }
  if (host.startsWith("10.")) {
    return 1;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
    return 2;
  }
  if (host.startsWith("169.254.")) {
    return 3;
  }
  return 4;
}

function isLinkLocalHost(host: string): boolean {
  return host.startsWith("169.254.");
}

function isBonjourLocalHost(host: string): boolean {
  if (host.length > 253 || !host.toLowerCase().endsWith(".local")) {
    return false;
  }

  const baseName = host.slice(0, -".local".length);
  if (!baseName) {
    return false;
  }

  return baseName.split(".").every((label) => {
    const lowercased = label.toLowerCase();
    return (
      label.length > 0 &&
      label.length <= 63 &&
      lowercased !== "local" &&
      lowercased !== "localhost" &&
      !label.startsWith("-") &&
      !label.endsWith("-") &&
      /^[A-Za-z0-9-]+$/.test(label)
    );
  });
}

function pushUnique(hosts: string[], host: string): void {
  if (!hosts.includes(host) && hosts.length < MAX_PAIRING_HOSTS) {
    hosts.push(host);
  }
}
