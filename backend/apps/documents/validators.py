import re
from decimal import Decimal

# A plain decimal as typed in a number box: optional sign, digits, optional
# fraction. Rejects '1e3', 'NaN', 'Infinity', '1,000' and non-ASCII digits,
# all of which Decimal() alone would accept or misread.
NUMBER_RE = re.compile(r'[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)')


def number_field_error(field, value):
    """
    Validates one `type: 'number'` request field. Quantities, amounts and
    areas must be greater than zero; a field marked `integer` must also be a
    whole number. Returns an error message, or None if the value is fine.
    Blank is left to the field's own `required` check.
    """
    label = field.get('label') or field.get('key')
    if isinstance(value, bool):
        return f"{label} must be a number."
    text = str(value).strip()
    if not NUMBER_RE.fullmatch(text):
        return f"{label} must be a number."
    number = Decimal(text)
    if number <= 0:
        return f"{label} must be greater than zero."
    if field.get('integer') and number != number.to_integral_value():
        return f"{label} must be a whole number."
    return None
