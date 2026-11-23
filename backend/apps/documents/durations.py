def format_hours_minutes(hours):
    """
    An hour count as people say it, never with decimals:
    1.3 -> "1 hr 18 minutes", 0.5 -> "30 minutes", 50 -> "50 hrs".
    Mirrors frontend/src/utils/duration.js::formatHoursMinutes.
    """
    if hours is None:
        return '—'
    total_minutes = round(float(hours) * 60)
    h, m = divmod(total_minutes, 60)
    parts = []
    if h:
        parts.append(f"{h} {'hr' if h == 1 else 'hrs'}")
    if m or not h:
        parts.append(f"{m} {'minute' if m == 1 else 'minutes'}")
    return ' '.join(parts)
