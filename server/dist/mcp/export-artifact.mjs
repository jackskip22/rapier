// SPDX-License-Identifier: AGPL-3.0-only
import {openArchive} from '../images/archive.mjs';

export async function verifyWordExport(bytes, {signal} = {}) {
  const archive = await openArchive(new Blob([bytes]), {signal});
  try {
    for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
      if (!archive.entries.some(entry => entry.name === name && !entry.directory && entry.size > 0))
        throw new Error('export_artifact_invalid');
    }
    await archive.verify();
  } finally {archive.close();}
}

export function unavailableExport(value, reason) {
  const {hostedDownload, downloadUrl, exportExpiresAt, artifactCreated, ...rest} = value;
  const {access, expiresAt, ...artifact} = value.artifact || {};
  const uncertain = value.outcome === 'uncertain';
  return {...rest, outcome: uncertain ? 'uncertain' : 'refused', reason, exportStage: 'publication',
    ...(value.artifact ? {artifact: {...artifact, status: uncertain ? 'unconfirmed' : 'unavailable'}} : {})};
}
