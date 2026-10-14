// SPDX-License-Identifier: AGPL-3.0-only
import {resolve} from 'node:path';
import {buildRapierWorker} from '../tools/jxl-bundle.mjs';

export async function buildJPEGXLArtifact(root, options = {}) {
  return buildRapierWorker(resolve(root, 'images/jxl'), options);
}
export async function buildJPEGXLWorker(root, options = {}) {
  return (await buildJPEGXLArtifact(root, options)).bytes.toString('utf8');
}
