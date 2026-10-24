// SPDX-License-Identifier: AGPL-3.0-only
import {MAX_TEXT_BYTES} from '../agent/operation-contracts.mjs';
export const MAX_RPC_BODY_BYTES = MAX_TEXT_BYTES * 3 + 1024 * 1024;
export const MAX_RPC_DEPTH = 128;
export const RPC_BODY_TIMEOUT_MS = 60_000;
export const DOOR_LIMITS = Object.freeze({
  modelCallsPerMinute: 600,
  editorCallsPerMinute: 1200,
  principalCreatesPerHour: 100,
  deploymentCreatesPerHour: 5000,
  anonymousCreatesPerHour: 1000,
  registrationsPerHour: 20,
  consentsPerAddressPerHour: 60,
  pairingStartsPerMinute: 5,
  pairingAttemptsPerMinute: 5,
  pairingMissesPerWindow: 5,
  dayMs: 24 * 60 * 60 * 1000,
  hourMs: 60 * 60 * 1000,
  minuteMs: 60 * 1000,
});
