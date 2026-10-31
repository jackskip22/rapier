// SPDX-License-Identifier: AGPL-3.0-only
import {readSyncState} from './sync-state.mjs';
import {PLAIN_DETAIL} from './sync-plain.mjs';
import {createPlainKeySession, KEY_PLAIN_PROVIDERS, KEY_PLAIN_LABELS, plainCorsRule} from './sync-plain-keys.mjs';
import {createPlainCompanionSession} from './sync-plain-companion.mjs';
import {createPlainRelay} from './plain-relay.mjs';
import {createProviderSession, providerGate, PROVIDERS, OTHER_PROVIDERS, isOtherProvider, providerUsesSignIn,
	openDrivePicker, pickerRegistered, DRIVE_PICKER, createDeviceStorage, createRememberedDevice} from './sync-provider-session.mjs';
import {syncAvailability, r2KeyAvailability} from './sync-config.mjs';
export {readSyncState, PLAIN_DETAIL, createPlainKeySession, KEY_PLAIN_PROVIDERS, KEY_PLAIN_LABELS, plainCorsRule,
	createPlainCompanionSession, createPlainRelay, createProviderSession, providerGate, PROVIDERS, OTHER_PROVIDERS, isOtherProvider,
	providerUsesSignIn, openDrivePicker, pickerRegistered, DRIVE_PICKER, createDeviceStorage, createRememberedDevice, syncAvailability, r2KeyAvailability};
