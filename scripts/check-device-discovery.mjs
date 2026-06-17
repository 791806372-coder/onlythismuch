import assert from "node:assert/strict";
import {
  collectDevicectlPhysicalIphones,
  parseXctracePhysicalIphones,
  uniqueDevices,
} from "./lib/device-discovery.mjs";

const xctraceMixed = [
  "== Devices ==",
  "Kai's iPhone (18.5) (00008110-0011223344556677)",
  "== Simulators ==",
  "iPhone 16 Pro (18.5) (A1B2C3D4-1111-2222-3333-444455556666) (Shutdown)",
  "",
].join("\n");
assert.deepEqual(parseXctracePhysicalIphones(xctraceMixed), [
  {
    name: "Kai's iPhone",
    selector: "00008110-0011223344556677",
    raw: "Kai's iPhone (18.5) (00008110-0011223344556677)",
  },
]);

const xctraceSimOnly = [
  "== Devices ==",
  "== Simulators ==",
  "iPhone 16 Pro (18.5) (A1B2C3D4-1111-2222-3333-444455556666) (Shutdown)",
].join("\n");
assert.deepEqual(parseXctracePhysicalIphones(xctraceSimOnly), []);

assert.deepEqual(
  collectDevicectlPhysicalIphones({
    result: {
      devices: [
        {
          name: "Kai iPhone",
          identifier: "device-1",
          state: "available",
        },
      ],
    },
  }),
  [{ name: "Kai iPhone", selector: "device-1" }]
);

assert.deepEqual(
  collectDevicectlPhysicalIphones({
    info: { outcome: "failed" },
    error: { message: "Could not list Kai iPhone" },
  }),
  []
);

assert.deepEqual(
  collectDevicectlPhysicalIphones({
    result: {
      devices: [
        { name: "Kai iPhone", identifier: "remembered-1", connectionState: "remembered" },
        { name: "Kai iPhone", identifier: "unavailable-1", availability: "unavailable" },
        { name: "Kai iPhone", identifier: "untrusted-1", pairingState: "untrusted" },
      ],
    },
  }),
  []
);

assert.deepEqual(
  collectDevicectlPhysicalIphones({
    result: {
      devices: [{ name: "iPhone 16 Pro Simulator", identifier: "sim-1", state: "available" }],
    },
  }),
  []
);

assert.deepEqual(
  collectDevicectlPhysicalIphones({
    result: {
      devices: [
        {
          deviceProperties: {
            name: "Nested iPhone",
            identifier: "nested-1",
          },
          hardwareProperties: {
            deviceType: "iPhone",
          },
          connectionProperties: {
            state: "available",
          },
        },
      ],
    },
  }),
  [{ name: "Nested iPhone", selector: "nested-1" }]
);

assert.deepEqual(
  uniqueDevices([
    { name: "Kai iPhone", selector: "device-1" },
    { name: "Kai iPhone", selector: "device-1" },
    { name: "Lab iPhone", selector: "device-2" },
  ]),
  [
    { name: "Kai iPhone", selector: "device-1" },
    { name: "Lab iPhone", selector: "device-2" },
  ]
);

console.log("validated device discovery parser");
