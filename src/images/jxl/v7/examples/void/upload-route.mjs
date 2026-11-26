// SPDX-License-Identifier: MIT
import {defineHandler} from 'void';
import {upload} from './_jxl.mjs';

export const POST = defineHandler(c => upload(c.req.raw));
