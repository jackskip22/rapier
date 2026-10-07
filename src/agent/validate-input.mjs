const cosmeticLimits = {label: 120, note: 240, agent: 64, alt: 240};
// Agent tools ignore undeclared fields; cosmetic limits describe the stored result, not admission.
// Opaque records (drawing recipes, for example) keep their own deeper owner's contract.
export function agentInputSchema(schema, depth = 0) {
  const projected = {...schema};
  // The strictness marker is the catalogue's own: the published schema says it as additionalProperties.
  delete projected['x-rapier-strict'];
  if (schema.properties) {
    projected.additionalProperties = schema['x-rapier-strict'] ? false : true;
    projected.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => {
      const property = agentInputSchema(value, depth + 1);
      if (!depth && Object.hasOwn(cosmeticLimits, key)) delete property.maxLength;
      return [key, property];
    }));
  }
  if (schema.items) projected.items = agentInputSchema(schema.items, depth + 1);
  return projected;
}

// Collect every failure before throwing one error;
// malformed containers stop that branch, never their siblings. Paths are depth-first in schema order.
export function validateInput(schema, value, path = 'arguments', agent = false) {
  const faults = [];
  const visit = (schema, value, path, depth = 0, key = '') => {
    const invalid = (reason, field = path) => faults.push({path: field, message: field + ': ' + reason});
    let type = schema.type;
    if (Array.isArray(type)) {
      if (value === null && type.includes('null')) return value;
      const actual = Array.isArray(value) ? 'array' : Number.isSafeInteger(value) && type.includes('integer') ? 'integer' : typeof value;
      if (!type.includes(actual)) { invalid('unexpected type'); return; }
      type = actual;
    }
    if (type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) { invalid('expected an object'); return; }
      const properties = schema.properties || {}, required = schema.required || [], keys = Object.keys(value);
      const admitted = agent && schema.properties && schema.additionalProperties !== false ? {} : value;
      if (keys.length < (schema.minProperties || 0) || keys.length > (schema.maxProperties ?? Infinity)) invalid('object property count outside bounds');
      const name = key => schema.propertyNames && visit({type: 'string', ...schema.propertyNames}, key, path + '.' + key, depth + 1, key);
      for (const key of Object.keys(properties)) {
        if (Object.hasOwn(value, key)) {
          name(key);
          const field = visit(properties[key], value[key], path + '.' + key, depth + 1, key);
          if (admitted !== value) admitted[key] = field;
        }
        else if (required.includes(key)) invalid('missing ' + key);
      }
      for (const key of required) if (!Object.hasOwn(properties, key) && !Object.hasOwn(value, key)) invalid('missing ' + key);
      for (const key of keys) if (!Object.hasOwn(properties, key)) {
        name(key);
        // In the agent's projected schema only an authored object closes its fields, so the field is named; the door's
        // raw schema names it for authored objects alone.
        if (schema.additionalProperties === false) invalid('unknown field ' + key, schema['x-rapier-strict'] || agent ? path + '.' + key : path);
        else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
          const field = visit(schema.additionalProperties, value[key], path + '.' + key, depth + 1, key);
          if (admitted !== value) Object.defineProperty(admitted, key, {value: field, enumerable: true, configurable: true, writable: true});
        }
      }
      value = admitted;
    } else if (type === 'array') {
      if (!Array.isArray(value)) { invalid('expected an array'); return; }
      if (value.length < (schema.minItems || 0) || value.length > (schema.maxItems ?? Infinity)) invalid('array length outside bounds (' + (schema.minItems || 0) + ' to ' + (schema.maxItems ?? 'any') + ')');
      if (schema.uniqueItems && new Set(value).size !== value.length) invalid('duplicate item');
      const admitted = value.map((item, index) => visit(schema.items, item, path + '[' + index + ']', depth + 1));
      if (agent) value = admitted;
    } else if (type === 'string') {
      if (typeof value !== 'string') { invalid('expected a string'); return; }
      if (agent && depth === 1 && Object.hasOwn(cosmeticLimits, key) && value.length > cosmeticLimits[key]) {
        let end = cosmeticLimits[key];
        if ((value.charCodeAt(end - 1) & 0xfc00) === 0xd800) end--;
        value = value.slice(0, end);
      }
      const minimum = schema.minLength || 0, maximum = schema.maxLength ?? Infinity;
      let length = value.length;
      // JSON Schema counts a surrogate pair as one character. Scan only where that can change a bound.
      if ((length > maximum && length <= maximum * 2) || (length >= minimum && length < minimum * 2)) {
        for (let index = 0; index < value.length - 1; index++) {
          const first = value.charCodeAt(index), next = value.charCodeAt(index + 1);
          if (first >= 0xd800 && first <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) { length--; index++; }
        }
      }
      if (length < minimum) invalid('string shorter than ' + schema.minLength);
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) invalid('string does not match ' + schema.pattern);
      if (length > maximum) invalid('string longer than ' + schema.maxLength);
    } else if (type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity) || value <= (schema.exclusiveMinimum ?? -Infinity) || value >= (schema.exclusiveMaximum ?? Infinity)) invalid('number outside bounds');
    } else if (type === 'integer') {
      if (!Number.isSafeInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity) || value <= (schema.exclusiveMinimum ?? -Infinity) || value >= (schema.exclusiveMaximum ?? Infinity)) invalid('integer outside bounds');
    } else if (type === 'boolean' && typeof value !== 'boolean') invalid('expected a boolean');
    if (schema.enum && !schema.enum.includes(value)) invalid('unknown value');
    if (Object.hasOwn(schema, 'const') && schema.const !== value) invalid('unexpected value');
    return value;
  };
  const admitted = visit(schema, value, path);
  if (faults.length) throw Object.assign(new Error(faults.map(fault => fault.message).join('; ')), {code: 'invalid_arguments', path: faults[0].path});
  return admitted;
}
