// SPDX-License-Identifier: MIT
import {journalNext as next, journalProtocol} from '../step-journal.mjs';
import {metadataTools} from '../resumable-metadata.mjs';
import {prepareICC, varDCTFile, inspectICC} from '../resumable-icc.mjs';
import {jpegProgressive, jpegSummary} from '../resumable-jpeg-source.mjs';
import {containerBoxes, jpegContainer, containerRead, boundedHeader} from '../resumable-container.mjs';
import {jpegScanRows, jpegMarker, jpegScan, jpegEnd, jpegStructure, jpegSyntax, jpegPayload, jpegICC, jpegICCEntropy} from '../resumable-reconstruction.mjs';

export const tools = Object.freeze({...metadataTools, prepareICC, varDCTFile, inspectICC, jpegProgressive, jpegSummary,
  containerBoxes, jpegContainer, containerRead, boundedHeader,
  jpegScanRows, jpegMarker, jpegScan, jpegEnd, jpegStructure, jpegSyntax, jpegPayload, jpegICC, jpegICCEntropy});

export const journalNext = (steps, reply, journal) => next(steps, reply, journalProtocol(journal));
