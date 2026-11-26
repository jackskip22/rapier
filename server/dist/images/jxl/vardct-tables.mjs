// SPDX-License-Identifier: MIT
const VARDCT_TABLE_FAMILIES = 17;
export const strategyTableList = cache => Array.from({length: VARDCT_TABLE_FAMILIES}, (_, family) => cache.get(family) ?? null);
