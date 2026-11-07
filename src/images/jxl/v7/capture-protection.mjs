// SPDX-License-Identifier: MIT
import {CAPTURE_PROTECTION} from '../capture-protection.mjs';
import {createCaptureProtection} from '../capture-protection-plan.mjs';
export {selectedProtectionRows} from '../capture-protection-plan.mjs';

export async function captureWithProtection(capture, input, options = {}) {
  const collector = createCaptureProtection();
  try {
    const result = await capture(input, {...options, [CAPTURE_PROTECTION]: collector});
    return {result, selected: collector.select(result.bytes)};
  } finally { collector.close(); }
}
