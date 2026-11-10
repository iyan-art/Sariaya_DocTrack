// Quantities, amounts and areas. Mirrors number_field_error() in the
// backend's documents/validators.py, which is what actually enforces this.
const NUMBER_REGEX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

// The fallback form's only number field (see DocumentRequestFields.jsx).
const FALLBACK_NUMBER_FIELDS = [{ key: 'number_of_copies', label: 'Number of Copies', integer: true }];

// Blank isn't "invalid" here — whether a blank is allowed is the field's own
// `required` setting, enforced separately.
export function numberFieldError(field, value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const label = field.label || field.key;
  if (!NUMBER_REGEX.test(text)) return `${label} must be a number.`;
  const number = Number(text);
  if (number <= 0) return `${label} must be greater than zero.`;
  if (field.integer && !Number.isInteger(number)) return `${label} must be a whole number.`;
  return null;
}

export function hasInvalidNumber(fields, values) {
  const numberFields = fields && fields.length > 0
    ? fields.filter((f) => f.type === 'number')
    : FALLBACK_NUMBER_FIELDS;
  return numberFields.some((f) => numberFieldError(f, values[f.key]));
}

// Keys a number box should never accept: a minus or plus sign, exponent
// notation, and — for whole-number fields — a decimal point.
export function blockInvalidNumberKeys(field) {
  const blocked = field.integer ? ['-', '+', 'e', 'E', '.', ','] : ['-', '+', 'e', 'E', ','];
  return (e) => {
    if (blocked.includes(e.key)) e.preventDefault();
  };
}
