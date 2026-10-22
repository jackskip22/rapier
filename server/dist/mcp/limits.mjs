// SPDX-License-Identifier: AGPL-3.0-only
export const DOOR_LIMITS = Object.freeze({
  modelCallsPerMinute: 600,
  editorCallsPerMinute: 1200,
  principalCreatesPerHour: 100,
  deploymentCreatesPerHour: 5000,
  anonymousCreatesPerHour: 1000,
  registrationsPerHour: 20,
  consentsPerAddressPerHour: 60,
  pairingStartsPerMinute: 5,
  pairingMissesPerWindow: 5,
  dayMs: 24 * 60 * 60 * 1000,
  hourMs: 60 * 60 * 1000,
  minuteMs: 60 * 1000,
});
