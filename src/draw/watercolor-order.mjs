// SPDX-License-Identifier: AGPL-3.0-only
export const WATERCOLOR_FIRST = Object.freeze(['ultramarine', 'sap-green', 'dioxazine-violet', 'pyrrol-scarlet']);
export const watercolorOrdered = rows => [...WATERCOLOR_FIRST.map(id => rows.find(row => row.id === id)).filter(Boolean),
	...rows.filter(row => !WATERCOLOR_FIRST.includes(row.id))];

export const WATERCOLOR_FREE = Object.freeze({rapier: Object.freeze({colors: 5, brushes: 4}), watercolor: Object.freeze({colors: 3, brushes: 2})});
export const watercolorFreeColors = (pigments, app = 'rapier') => new Set(watercolorOrdered(pigments).slice(0, WATERCOLOR_FREE[app].colors).map(row => row.id));
export const watercolorFreeBrushes = (brushes, app = 'rapier') => new Set(brushes.slice(0, WATERCOLOR_FREE[app].brushes).map(row => row.id));
