// SPDX-License-Identifier: MIT
export const materialize = image => image?.lazyStrategy ? image.lazyStrategy.materialize() : image;
