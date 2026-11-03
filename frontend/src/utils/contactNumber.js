// Philippine mobile numbers only. Mirrors CONTACT_NUMBER_RE in the backend's
// documents/serializers.py, which is what actually enforces this.
export const CONTACT_NUMBER_REGEX = /^09\d{9}$|^(\+639)\d{9}$/;

export const CONTACT_NUMBER_ERROR = 'Invalid contact number format. Please use 09XXXXXXXXX or +639XXXXXXXXX';

// Blank isn't "invalid" here — whether a blank is allowed is the field's own
// `required` setting, enforced separately.
export function isInvalidContactNumber(value) {
  return Boolean(value) && !CONTACT_NUMBER_REGEX.test(value);
}

// A document type with no request_fields gets DocumentRequestFields' generic
// fallback form, whose only contact field is `contact_no`.
export function hasInvalidContactNumber(fields, values) {
  const contactKeys = fields && fields.length > 0
    ? fields.filter((f) => f.type === 'tel').map((f) => f.key)
    : ['contact_no'];
  return contactKeys.some((key) => isInvalidContactNumber(values[key]));
}
