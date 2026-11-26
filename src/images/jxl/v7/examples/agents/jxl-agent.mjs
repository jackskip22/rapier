// SPDX-License-Identifier: MIT
import {tool} from 'ai';
import {z} from 'zod';
import {defineTools, runTool} from './jxl-tools.mjs';

export const jxlAgentTools = env => Object.fromEntries(defineTools(z).map(t =>
  [t.name, tool({description: t.description, inputSchema: t.input, execute: async args => (await runTool(t, env, args)).content[0].text})]));
