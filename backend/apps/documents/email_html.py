"""
The HTML version of every automated document email, in one branded,
responsive layout: the Sariaya header and logo, a colored status badge, the
document's details as a table, and a button into the portal.

It is built from the same text as the plain-text version (which still goes
along for mail apps that don't show HTML), so the two can never say
different things:
  - a paragraph of "Label: value" lines becomes the details table;
  - a line holding a link becomes the button;
  - everything else stays a paragraph.
Inline styles and tables only, since that is what email apps render.
"""
import re
from html import escape

from django.conf import settings

from .models import EmailNotificationLog

Kind = EmailNotificationLog.NotificationType

# notification type -> (badge text, badge color, button text)
STYLES = {
    Kind.OVERDUE_WARNING: ('OVERDUE ALERT', '#dc2626', 'Open the Document'),
    Kind.PENDING_RECEIPT: ('PENDING RECEIPT', '#2563eb', 'Receive Document'),
    Kind.DUE_SOON: ('APPROACHING DUE DATE', '#d97706', 'Open the Document'),
    Kind.READY_FOR_RELEASE: ('READY FOR PICKUP', '#16a34a', 'Track My Request'),
    Kind.READY_FOR_RELEASE_STAFF: ('READY FOR PICKUP', '#16a34a', 'Open the Document'),
}
DEFAULT_STYLE = ('SARIAYA DOCTRACK', '#1e3a8a', 'Open Sariaya DocTrack')

_ROW = re.compile(r"^([A-Z][A-Za-z0-9 /().'&-]{1,40}): (.+)$")
_URL = re.compile(r"(https?://\S+)")


def _paragraph(lines):
    parts = []
    for line in lines:
        match = _ROW.match(line)
        if match and len(match.group(2)) > 60:  # e.g. "Required Action: Please ..."
            parts.append(f"<strong>{escape(match.group(1))}:</strong> {escape(match.group(2))}")
        else:
            parts.append(escape(line))
    return (
        '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">'
        + '<br>'.join(parts) + '</p>'
    )


def _table(rows):
    cells = ''.join(
        '<tr>'
        f'<td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;'
        f'vertical-align:top;width:36%;">{escape(label)}</td>'
        f'<td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;'
        f'font-weight:600;word-break:break-word;">{escape(value)}</td>'
        '</tr>'
        for label, value in rows
    )
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="border-collapse:collapse;margin:4px 0 20px;border:1px solid #e2e8f0;border-radius:8px;">'
        f'{cells}</table>'
    )


def _button(url, text, color):
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>'
        f'<td style="border-radius:8px;background:{color};">'
        f'<a href="{escape(url, quote=True)}" style="display:inline-block;padding:14px 28px;font-size:15px;'
        f'font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">{escape(text)}</a>'
        '</td></tr></table>'
        '<p style="margin:0 0 16px;font-size:12px;color:#64748b;line-height:1.5;">'
        f'Or open this link: <a href="{escape(url, quote=True)}" style="color:#2563eb;word-break:break-all;">'
        f'{escape(url)}</a></p>'
    )


def build_email_html(subject, body, notification_type=None):
    badge, color, button_text = STYLES.get(notification_type, DEFAULT_STYLE)
    content = []
    for block in [b for b in body.strip().split('\n\n') if b.strip()]:
        lines = [line.rstrip() for line in block.split('\n') if line.strip()]
        url_lines = [line for line in lines if _URL.fullmatch(line.strip())]
        if url_lines:
            text = [line for line in lines if line not in url_lines]
            if text:
                content.append(_paragraph(text))
            content.append(_button(url_lines[0].strip(), button_text, color))
        elif len(lines) >= 2 and all(_ROW.match(line) for line in lines):
            content.append(_table([_ROW.match(line).groups() for line in lines]))
        else:
            content.append(_paragraph(lines))

    logo = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/sariaya-logo.jpg"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
 style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="background:#1e3a8a;padding:20px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:14px;"><img src="{escape(logo, quote=True)}" width="52" height="52" alt="Municipality of Sariaya seal"
      style="display:block;border-radius:50%;background:#ffffff;"></td>
    <td><p style="margin:0;font-size:12px;letter-spacing:1px;color:#bfdbfe;text-transform:uppercase;">Municipality of Sariaya, Quezon</p>
      <p style="margin:2px 0 0;font-size:18px;font-weight:700;color:#ffffff;">Sariaya DocTrack</p></td>
  </tr></table>
</td></tr>
<tr><td style="padding:24px 24px 8px;">
  <span style="display:inline-block;padding:5px 12px;border-radius:999px;background:{color};color:#ffffff;
    font-size:11px;font-weight:700;letter-spacing:1px;">{escape(badge)}</span>
  <h1 style="margin:14px 0 18px;font-size:20px;line-height:1.35;color:#0f172a;">{escape(subject)}</h1>
  {''.join(content)}
</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
  <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">Municipal Administrator's Office, Municipality of Sariaya, Quezon.
  This is an automated message from Sariaya DocTrack; please do not reply to this email.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>"""
