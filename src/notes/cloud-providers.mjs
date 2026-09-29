// Explicit modules, not a second sync engine. Importing this file neither fetches nor starts
// OAuth. The companion owns credentials, enrollment receipts and UI; the editor keeps the VDK.
import {createDriveTransport, allocateDriveVault, createDriveVault} from './transport-drive.mjs';
import {createOneDriveTransport, createOneDriveVault} from './transport-onedrive.mjs';
import {createDropboxTransport, createDropboxVault} from './transport-dropbox.mjs';
import {createOAuthClient as createDriveOAuthClient} from './drive-oauth.mjs';
import {createOAuthClient as createOneDriveOAuthClient} from './onedrive-oauth.mjs';
import {createOAuthClient as createDropboxOAuthClient} from './dropbox-oauth.mjs';
// R87N: R2 and the S3 adapter are published here; unindexed, they were in no build.
import {createR2Transport} from './transport-r2.mjs';
import {createOAuthClient as createCloudflareOAuthClient} from './cloudflare-oauth.mjs';
import {createS3Transport, s3Destination} from './transport-s3.mjs';
import {createWebDAVTransport} from './transport-webdav.mjs';
import {registrationReady, syncVerified} from './sync-config.mjs';
import {createProviderSetup} from './provider-setup.mjs';
export {createDriveTransport, allocateDriveVault, createDriveVault, createOneDriveTransport, createOneDriveVault,
	createDropboxTransport, createDropboxVault, createDriveOAuthClient, createOneDriveOAuthClient, createDropboxOAuthClient,
	createR2Transport, createCloudflareOAuthClient, createS3Transport, s3Destination, createWebDAVTransport, createProviderSetup};
// Law 57: each notice is read on the sync sheet: on or not, and what it waits for.
export const availability = Object.freeze([
	Object.freeze({id: 'cloudflare', label: 'Cloudflare R2', ready: registrationReady() && syncVerified(), notice: registrationReady() ? 'sign-in is registered; live verification is still pending.' : 'cloudflare sign-in awaits registration. advanced setup accepts an existing storage key.'}),
	Object.freeze({id: 's3', label: 'S3-compatible storage', ready: false, notice: 'built in, not on yet: waits on a live test in the android app.'}),
	Object.freeze({id: 'webdav', label: 'WebDAV', ready: false, notice: 'built in, not on yet: waits on a live test in the android app.'}),
	Object.freeze({id: 'drive', label: 'Google Drive', ready: false, notice: 'built in, not on yet: waits on rapier’s registration with google.'}),
	Object.freeze({id: 'onedrive', label: 'OneDrive', ready: false, notice: 'built in, not on yet: waits on rapier’s registration with microsoft.'}),
	Object.freeze({id: 'dropbox', label: 'Dropbox', ready: false, notice: 'built in, not on yet: waits on rapier’s registration with dropbox.'}),
]);
