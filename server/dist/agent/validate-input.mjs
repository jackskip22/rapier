import {TOOL_RESULT_BYTES, resultBytes, inputErrorResult} from './page-result.mjs';
const cosmeticLimits = {label: 120, note: 240, agent: 64, alt: 240};
// Typed input objects stay closed; cosmetic limits describe the stored result, not admission.
// Opaque records (drawing recipes, for example) keep their own deeper owner's contract.
export function agentInputSchema(schema, depth = 0) {
  const projected = {...schema};
  // The strictness marker is the catalogue's own: the published schema says it as additionalProperties.
  delete projected['x-rapier-strict'];
  if (schema.properties) {
    projected.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => {
      const property = agentInputSchema(value, depth + 1);
      if (!depth && Object.hasOwn(cosmeticLimits, key)) delete property.maxLength;
      return [key, property];
    }));
  }
  if (schema.items) projected.items = agentInputSchema(schema.items, depth + 1);
  for (const key of ['oneOf', 'anyOf', 'allOf']) if (schema[key]) projected[key] = schema[key].map(branch => agentInputSchema(branch, depth));
  for (const key of ['not', 'if', 'then', 'else']) if (schema[key]) projected[key] = agentInputSchema(schema[key], depth);
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') projected.additionalProperties = agentInputSchema(schema.additionalProperties, depth + 1);
  return projected;
}

// Malformed containers stop their branch, never their siblings. Diagnostics retain
// schema order within the tool result boundary; admission still checks every remaining field.
export function validateInput(schema, value, path = 'arguments', agent = false) {
  const faults = [];
  let firstPath, omittedErrors = 0, omittedDetails = false;
  // Reserve only the encoded omission metadata, not a limit on fields or failures.
  const omissionReserve = {errors: Number.MAX_SAFE_INTEGER, details: true};
  const excerpt = (value, limit) => {
    if (value.length <= limit) return value;
    let end = limit;
    if (end && (value.charCodeAt(end - 1) & 0xfc00) === 0xd800 && (value.charCodeAt(end) & 0xfc00) === 0xdc00) end--;
    return value.slice(0, end) + '…';
  };
  const report = (reason, field) => {
    if (omittedErrors) { omittedErrors++; return; }
    const at = limit => {
      const name = excerpt(field, limit), detail = excerpt(reason, limit);
      const message = name + ': ' + detail;
      return {path: firstPath ?? name, message, abbreviated: name !== field || detail !== reason};
    };
    const fits = fault => resultBytes(inputErrorResult({path: fault.path,
      message: [...faults, fault.message].join('; '), omitted: omissionReserve})) <= TOOL_RESULT_BYTES;
    // Even before JSON escaping, a string longer than the byte boundary cannot fit.
    let high = Math.min(TOOL_RESULT_BYTES, Math.max(field.length, reason.length)), fault = at(high);
    if (!fits(fault)) {
      let low = 0;
      if (!fits(at(low))) { omittedErrors++; return; }
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (fits(at(middle))) low = middle; else high = middle - 1;
      }
      fault = at(low);
    }
    firstPath ??= fault.path;
    faults.push(fault.message);
    omittedDetails ||= fault.abbreviated;
  };
  const visit = (schema, value, path, depth = 0, key = '') => {
    const invalid = (reason, field = path) => report(reason, field);
    // Branches are admission, not descriptive hints. Test without projection so a discriminator cannot discard payload fields.
    const matches = branch => {
      try { validateInput(branch, value, path, false); return true; } catch (error) {
        if (error.code !== 'invalid_arguments') throw error;
        return false;
      }
    };
    if (schema.oneOf && schema.oneOf.filter(matches).length !== 1) invalid('expected exactly one supported variant');
    if (schema.anyOf && !schema.anyOf.some(matches)) invalid('expected a supported variant');
    if (schema.not && matches(schema.not)) invalid('forbidden field combination');
    if (schema.allOf) for (const branch of schema.allOf) if (!matches(branch)) invalid('invalid field combination');
    if (schema.if) {
      const branch = matches(schema.if) ? schema.then : schema.else;
      if (branch && !matches(branch)) invalid('invalid field combination');
    }
    // Required-only and discriminator branches are ordinary JSON Schema object constraints.
    if (!schema.type && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const required of schema.required || []) if (!Object.hasOwn(value, required)) invalid('missing ' + required);
      for (const [name, child] of Object.entries(schema.properties || {})) if (Object.hasOwn(value, name)) visit(child, value[name], path + '.' + name, depth + 1, name);
    }
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
      const admitted = agent && schema.properties ? {} : value;
      if (keys.length < (schema.minProperties || 0) || keys.length > (schema.maxProperties ?? Infinity)) { invalid('object property count outside bounds'); return; }
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
        // Unknown fields cannot become aliases or silently change which tagged request is executed.
        if (schema.additionalProperties === false) invalid('unknown field ' + key, schema['x-rapier-strict'] || agent ? path + '.' + key : path);
        else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
          const field = visit(schema.additionalProperties, value[key], path + '.' + key, depth + 1, key);
          if (admitted !== value) Object.defineProperty(admitted, key, {value: field, enumerable: true, configurable: true, writable: true});
        }
      }
      value = admitted;
    } else if (type === 'array') {
      if (!Array.isArray(value)) { invalid('expected an array'); return; }
      if (value.length < (schema.minItems || 0) || value.length > (schema.maxItems ?? Infinity)) { invalid('array length outside bounds (' + (schema.minItems || 0) + ' to ' + (schema.maxItems ?? 'any') + ')'); return; }
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
  if (faults.length) throw Object.assign(new Error(faults.join('; ')), {code: 'invalid_arguments', path: firstPath,
    ...(omittedErrors || omittedDetails ? {omitted: {errors: omittedErrors, ...(omittedDetails ? {details: true} : {})}} : {})});
  return admitted;
}
