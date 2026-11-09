import re

# Philippine mobile numbers only: 09XXXXXXXXX or +639XXXXXXXXX. [0-9] rather
# than \d, which in Python also accepts non-ASCII digits. Used with fullmatch()
# since a `$` would still let a trailing newline through.
CONTACT_NUMBER_RE = re.compile(r'(?:09|\+639)[0-9]{9}')
CONTACT_NUMBER_ERROR = 'Invalid contact number format. Please use 09XXXXXXXXX or +639XXXXXXXXX'


def is_valid_contact_number(value):
    return isinstance(value, str) and bool(CONTACT_NUMBER_RE.fullmatch(value))
