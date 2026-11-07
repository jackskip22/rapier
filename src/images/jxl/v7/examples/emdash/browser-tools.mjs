import {variants} from 'rapier-jxl/upload';

export function browserTools(effort) {
  return {
    variants: (source, options) => variants(source, {...options, effort})
  };
}
