// Admission reads only the supplied schema. Collect every failure before throwing one error;
// malformed containers stop that branch, never their siblings. Paths are depth-first in schema order.
export function validateInput(schema, value, path = 'arguments') {
  const faults = [];
  const visit = (schema, value, path) => {
    const invalid = reason => faults.push({path, message: path + ': ' + reason});
    let type = schema.type;
    if (Array.isArray(type)) {
      if (value === null && type.includes('null')) return;
      const actual = Array.isArray(value) ? 'array' : Number.isSafeInteger(value) && type.includes('integer') ? 'integer' : typeof value;
      if (!type.includes(actual)) { invalid('unexpected type'); return; }
      type = actual;
    }
    if (type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) { invalid('expected an object'); return; }
      const properties = schema.properties || {}, required = schema.required || [];
      for (const key of Object.keys(properties)) {
        if (Object.hasOwn(value, key)) visit(properties[key], value[key], path + '.' + key);
        else if (required.includes(key)) invalid('missing ' + key);
      }
      for (const key of required) if (!Object.hasOwn(properties, key) && !Object.hasOwn(value, key)) invalid('missing ' + key);
      if (schema.additionalProperties === false) for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) invalid('unknown field ' + key);
      }
    } else if (type === 'array') {
      if (!Array.isArray(value)) { invalid('expected an array'); return; }
      if (value.length < (schema.minItems || 0) || value.length > (schema.maxItems ?? Infinity)) invalid('array length outside bounds (' + (schema.minItems || 0) + ' to ' + (schema.maxItems ?? 'any') + ')');
      if (schema.uniqueItems && new Set(value).size !== value.length) invalid('duplicate item');
      value.forEach((item, index) => visit(schema.items, item, path + '[' + index + ']'));
    } else if (type === 'string') {
      if (typeof value !== 'string') { invalid('expected a string'); return; }
      if (value.length < (schema.minLength || 0)) invalid('string shorter than ' + schema.minLength);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) invalid('string does not match ' + schema.pattern);
      if (value.length > (schema.maxLength ?? Infinity)) invalid('string longer than ' + schema.maxLength);
    } else if (type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) invalid('number outside bounds');
    } else if (type === 'integer') {
      if (!Number.isSafeInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) invalid('integer outside bounds');
    } else if (type === 'boolean' && typeof value !== 'boolean') invalid('expected a boolean');
    if (schema.enum && !schema.enum.includes(value)) invalid('unknown value');
    if (Object.hasOwn(schema, 'const') && schema.const !== value) invalid('unexpected value');
  };
  visit(schema, value, path);
  if (faults.length) throw Object.assign(new Error(faults.map(fault => fault.message).join('; ')), {code: 'invalid_arguments', path: faults[0].path});
  return value;
}
