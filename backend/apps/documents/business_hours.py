"""
Working-time arithmetic for SLAs. The SLA clock runs only during office
hours: Monday to Friday, 8:00 AM to 12:00 NN and 1:00 PM to 5:00 PM
(Philippine time). Nights, lunch breaks and weekends pause it; it
resumes at the next working hour. So a document received Friday 4:00 PM
with a 2-hour SLA is due Monday 9:00 AM, not Friday 6:00 PM.

Used for every elapsed time an SLA is judged on: live dwell time, the
overdue and reminder scans, bottlenecks, and the durations recorded per
office (heatmap, rankings).
"""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

MANILA = ZoneInfo('Asia/Manila')
WORK_PERIODS = ((time(8, 0), time(12, 0)), (time(13, 0), time(17, 0)))
WORKING_HOURS_PER_DAY = 8
_MAX_DAYS = 3660  # safety bound for add_business_hours()


def is_working_day(day):
    return day.weekday() < 5


def _periods(day):
    for start, end in WORK_PERIODS:
        yield datetime.combine(day, start, MANILA), datetime.combine(day, end, MANILA)


def business_hours_between(start, end):
    """Working hours between two moments (0 if end is not after start)."""
    if start is None or end is None or end <= start:
        return 0.0
    start, end = start.astimezone(MANILA), end.astimezone(MANILA)
    seconds = 0.0
    day = start.date()
    while day <= end.date():
        if is_working_day(day):
            for period_start, period_end in _periods(day):
                overlap = (min(period_end, end) - max(period_start, start)).total_seconds()
                if overlap > 0:
                    seconds += overlap
        day += timedelta(days=1)
    return seconds / 3600


def business_duration(start, end):
    """business_hours_between() as a timedelta, for recorded durations."""
    return timedelta(hours=business_hours_between(start, end))


def add_business_hours(start, hours):
    """The moment `hours` working hours after `start` (an SLA's due time)."""
    if start is None:
        return None
    remaining = max(0.0, float(hours)) * 3600
    cursor = start.astimezone(MANILA)
    if remaining == 0:
        return cursor
    day = cursor.date()
    for _ in range(_MAX_DAYS):
        if is_working_day(day):
            for period_start, period_end in _periods(day):
                begin = max(period_start, cursor)
                available = (period_end - begin).total_seconds()
                if available <= 0:
                    continue
                if remaining <= available:
                    return begin + timedelta(seconds=remaining)
                remaining -= available
        day += timedelta(days=1)
    return cursor + timedelta(hours=hours)  # unreachable in practice
