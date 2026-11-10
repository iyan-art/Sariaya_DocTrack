import secrets
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000  # refuses decompression bombs long before they decode
ALLOWED_FORMATS = {'JPEG', 'PNG', 'WEBP'}

# Longest side, in pixels, an image is stored at.
NEWS_IMAGE_SIZE = 1600
AVATAR_SIZE = 256


def prepare_image(upload, max_side, square=False):
    """
    Checks an uploaded picture and re-encodes it for storage: JPEG, PNG or
    WebP only, 5 MB at most, rotated upright from its EXIF orientation,
    scaled down to `max_side` (center-cropped to a square for avatars) and
    saved without its metadata — phone photos carry GPS coordinates in
    EXIF. Returns a ContentFile with a random name, so URLs can't be
    guessed and a replaced picture never shows from a stale cache.
    """
    if upload.size > MAX_UPLOAD_BYTES:
        raise ValidationError('Images must be 5 MB or smaller.')
    try:
        with Image.open(upload) as probe:
            fmt = probe.format
            if probe.width * probe.height > MAX_PIXELS:
                raise ValidationError('This image is too large. Please use a smaller picture.')
            probe.verify()
        upload.seek(0)
        image = Image.open(upload)
        image.load()
    except ValidationError:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise ValidationError('Upload a valid JPEG, PNG or WebP image.')
    if fmt not in ALLOWED_FORMATS:
        raise ValidationError('Upload a valid JPEG, PNG or WebP image.')

    image = ImageOps.exif_transpose(image)
    if square:
        image = ImageOps.fit(image, (max_side, max_side), method=Image.Resampling.LANCZOS)
    else:
        image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

    has_alpha = image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info)
    out = BytesIO()
    if has_alpha:
        image.convert('RGBA').save(out, 'PNG', optimize=True)
        ext = 'png'
    else:
        image.convert('RGB').save(out, 'JPEG', quality=85, optimize=True, progressive=True)
        ext = 'jpg'
    return ContentFile(out.getvalue(), name=f'{secrets.token_hex(12)}.{ext}')
