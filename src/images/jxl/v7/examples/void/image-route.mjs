// SPDX-License-Identifier: MIT
import {defineHandler} from 'void';
import {image} from './_jxl.mjs';

export const GET = defineHandler(c => image(c.req.raw, c.req.param('id')));
