import io

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

from .models import DocumentTemplateField


def _resolve_field_text(field, field_values):
    """
    The single string actually drawn onto the page for one field — the one
    place that understands FieldType.NAME's composite storage shape, so
    document_generation.py's overlay loop and GenerateDocumentView's
    required-field check never have to duplicate this logic.

    For a NAME field, `field_values[field.key]` is normally a
    {'first', 'middle', 'last', 'suffix'} dict (see DocumentGenerateModal.jsx)
    joined into one line here — "First Middle Last, Suffix" — because real
    PSA/permit templates have a single blank line for a name, not four
    separate ones; splitting the INPUT doesn't require splitting the render
    position. A field that was filled in before it became FieldType.NAME
    (or any other legacy plain-string value) still has a plain string here
    instead of a dict — used as-is rather than dropped, so an already-
    generated document is never silently corrupted by this change.
    """
    raw = field_values.get(field.key)
    if field.field_type == DocumentTemplateField.FieldType.NAME and isinstance(raw, dict):
        name_parts = [raw.get('first', ''), raw.get('middle', ''), raw.get('last', '')]
        name = ' '.join(part.strip() for part in name_parts if part and part.strip())
        suffix = (raw.get('suffix') or '').strip()
        if suffix:
            name = f"{name}, {suffix}" if name else suffix
        return name
    if raw is None:
        return ''
    return str(raw)


def render_generated_document(document, field_values):
    """
    Overlays `field_values` onto document.document_type.template_file and
    returns the resulting PDF as bytes. Draws on a transparent canvas sized
    to match each page exactly, then merges it onto the ORIGINAL page —
    never redraws or replaces anything, so the template's logo, seal,
    borders, and layout survive untouched underneath the entered values.

    Some source templates (the PSA application-form scans) are stored with
    a page /Rotate of 90 — their raw content stream is landscape even
    though they display portrait. transfer_rotation_to_content() bakes
    that rotation into the content and resets /Rotate to 0, so every field
    coordinate in DocumentTemplateField can be authored directly against
    the page exactly as it visually appears, with no separate rotation
    math needed per template.
    """
    template = document.document_type.template_file
    reader = PdfReader(template.path)
    writer = PdfWriter()

    fields_by_page = {}
    for field in document.document_type.template_fields.all():
        fields_by_page.setdefault(field.page_number, []).append(field)

    for index, page in enumerate(reader.pages):
        page.transfer_rotation_to_content()
        page_number = index + 1
        page_fields = fields_by_page.get(page_number)

        if page_fields:
            width = float(page.mediabox.width)
            height = float(page.mediabox.height)
            packet = io.BytesIO()
            overlay_canvas = canvas.Canvas(packet, pagesize=(width, height))
            for field in page_fields:
                value = _resolve_field_text(field, field_values)
                if not value.strip():
                    continue
                overlay_canvas.saveState()
                overlay_canvas.translate(field.x, field.y)
                if field.rotation:
                    overlay_canvas.rotate(field.rotation)
                overlay_canvas.setFont('Helvetica', field.font_size)
                overlay_canvas.drawString(0, 0, value)
                overlay_canvas.restoreState()
            overlay_canvas.save()
            packet.seek(0)

            overlay_reader = PdfReader(packet)
            page.merge_page(overlay_reader.pages[0])

        writer.add_page(page)

    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()
