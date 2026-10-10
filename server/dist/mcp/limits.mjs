// SPDX-License-Identifier: AGPL-3.0-only
// Admission budgets; move these limits with measured deployment demand.
export const DOOR_LIMITS = Object.freeze({
  modelCallsPerMinute: 600,
  editorCallsPerMinute: 1200,
  principalCreatesPerHour: 100,
  deploymentCreatesPerHour: 5000,
  registrationsPerHour: 20,
  pairingStartsPerMinute: 5,
  pairingMissesPerWindow: 5,
  hourMs: 60 * 60 * 1000,
  minuteMs: 60 * 1000,
});
