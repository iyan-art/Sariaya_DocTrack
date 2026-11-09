"""
python manage.py seed_documents [--count 55] [--days 60] [--seed 7] [--clear]

Fills an existing database with realistic document requests and everything
that hangs off them: the step-by-step DocumentLog trail (with QR-verified
scans), the processing-stage timeline, citizen follow-ups, missing-document
alerts, and in-app notifications. It never creates or changes users, offices,
or document types; it builds on whatever the database already has.

Every record is written directly, with backdated timestamps, instead of
through services.py, so no emails are ever sent while seeding. The rules the
live system enforces still hold: each request is created by staff of its
Step 1 office, passes its offices in workflow order, and is held to each
step's SLA.
"""
import random
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.documents.models import (
    Document, DocumentLog, DocumentType, MissingDocumentAlert, Notification, RequestStatusHistory,
)
from apps.documents.qr_services import generate_qr_code
from apps.documents.services import resolve_office

# Stored in form_data so --clear can find seeded requests; the document views
# hide this key.
SEED_KEY = 'seed_batch'

# Matches sla_scan.DEFAULT_MISSING_SLA_HOURS: past this, the live scan flags a document Missing.
MISSING_AFTER_HOURS = 48

FIRST_NAMES = [
    'Juan', 'Maria', 'Jose', 'Ana', 'Pedro', 'Rosa', 'Ramon', 'Liza', 'Carlo', 'Grace', 'Mark', 'Joy',
    'Antonio', 'Teresa', 'Paolo', 'Kristine', 'Rogelio', 'Marites', 'Jerome', 'Angelica', 'Noel', 'Divina',
]
LAST_NAMES = [
    'Dela Cruz', 'Santos', 'Reyes', 'Garcia', 'Mendoza', 'Villanueva', 'Bautista', 'Aquino', 'Ramos',
    'Castillo', 'Navarro', 'Manalo', 'Pascual', 'Del Rosario', 'Mercado', 'Salazar', 'Panganiban', 'Gonzales',
]
BARANGAYS = [
    'Poblacion I', 'Poblacion II', 'Poblacion III', 'Antipolo', 'Balubal', 'Bignay I', 'Castañas', 'Concepcion Banahaw',
    'Guisguis-Talon', 'Limbon', 'Mamala I', 'Manggalang Tulo-tulo', 'Pili', 'Sampaloc I', 'Talaan Pantoc', 'Tumbaga I',
]
PLACES = ['Sariaya, Quezon', 'Lucena City, Quezon', 'Tayabas, Quezon', 'Candelaria, Quezon']
BUSINESSES = [
    ('Aling Nena Sari-Sari Store', 'Retail'), ('Sariaya Bakeshop', 'Bakery'), ('Banahaw Hardware', 'Hardware'),
    ('Tumbaga Internet Café', 'Internet Café'), ('Mamala Rice Trading', 'Rice Trading'), ('JM Motor Parts', 'Auto Parts'),
    ('Kusina ni Lola', 'Eatery'), ('Pili Water Refilling Station', 'Water Refilling'),
]
RETURN_REASONS = [
    'Incomplete supporting documents — please attach a valid ID.',
    'Name on the form does not match the attached record.',
    'Missing signature of the requesting party.',
    'Assessment amount needs to be recomputed.',
]

# (weight, outcome) — how far each request has got and how it is doing now.
OUTCOMES = [
    (15, 'pending'),     # forwarded, waiting to be received
    (22, 'processing'),  # at an office, within its SLA
    (14, 'overdue'),     # at an office, past its SLA
    (5, 'missing'),      # stuck long enough to be flagged Missing
    (14, 'completed'),   # back at the final office, ready for pickup
    (30, 'released'),    # handed over to the requester
]


def person():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def past_date(min_years, max_years):
    return (timezone.localdate() - timedelta(days=random.randint(min_years * 365, max_years * 365))).isoformat()


def fill_form(document_type, requester):
    """Plausible answers for this type's own request form."""
    business, nature = random.choice(BUSINESSES)
    by_key = {
        'child_full_name': person(), 'mother_maiden_name': person(), 'father_full_name': person(),
        'deceased_full_name': person(), 'husband_full_name': person(), 'wife_full_name': person(),
        'owner_name': requester, 'payee_name': person(),
        'date_of_birth': past_date(1, 60), 'date_of_death': past_date(0, 5), 'date_of_marriage': past_date(1, 40),
        'place_of_birth': random.choice(PLACES), 'place_of_death': random.choice(PLACES),
        'place_of_marriage': random.choice(PLACES),
        'business_name': business, 'nature_of_business': nature,
        'business_address': f"{random.randint(1, 250)} {random.choice(BARANGAYS)}, Sariaya, Quezon",
        'project_location': f"Lot {random.randint(1, 40)}, Blk {random.randint(1, 12)}, {random.choice(BARANGAYS)}, Sariaya, Quezon",
        'pay_period': f"{random.choice(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October'])} 1–15, {timezone.now().year}",
        'department': random.choice(['Treasury', 'Engineering', 'Health', 'Planning', 'General Services']),
        'items_description': random.choice(['Bond paper (long), 20 reams', 'Printer ink cartridges, 6 pcs', 'Office chairs, 4 units', 'Electric fans, 3 units']),
        'particulars': random.choice(['Payment for office supplies', 'Reimbursement of travel expenses', 'Payment for catering services']),
        'quantity': str(random.randint(1, 20)),
        'contact_no': f"09{random.randint(100000000, 999999999)}",
    }
    form = {}
    for field in document_type.request_fields or []:
        key, kind = field['key'], field.get('type')
        if key in by_key:
            form[key] = by_key[key]
        elif kind == 'select' and field.get('options'):
            form[key] = random.choice(field['options'])
        elif kind == 'number':
            form[key] = str(random.choice([1, 1, 2, 3]) if 'copies' in key else random.randint(20, 500) * (1000 if 'cost' in key or 'capital' in key or key == 'amount' else 1))
        elif kind == 'date':
            form[key] = past_date(0, 3)
        elif kind == 'tel':
            form[key] = by_key['contact_no']
        elif field.get('required'):
            form[key] = random.choice(['For processing', 'Official use', 'Annual requirement'])
    return form


class Command(BaseCommand):
    help = "Seeds realistic document requests and their history, scans, follow-ups, and alerts (never users or offices)."

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=55, help='How many requests to create (default 55).')
        parser.add_argument('--days', type=int, default=60, help='Spread finished requests over this many past days (default 60).')
        parser.add_argument('--seed', type=int, help='Random seed, for the same data every run.')
        parser.add_argument('--citizen-share', type=float, default=0.4,
                            help='Share of external requests linked to existing citizen accounts (default 0.4); the rest are walk-ins.')
        parser.add_argument('--clear', action='store_true', help='Delete previously seeded requests first (only those).')
        parser.add_argument('--allow-production', action='store_true', help='Required to run when DEBUG is off.')

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts['allow_production']:
            raise CommandError("Refusing to seed test data with DEBUG off. Pass --allow-production if this is really intended.")
        if opts['seed'] is not None:
            random.seed(opts['seed'])

        if opts['clear']:
            self._clear()
            if opts['count'] == 0:
                return

        types = self._eligible_types()
        if not types:
            raise CommandError("No active document type has staff assigned at every office on its route, so nothing can be seeded.")
        citizens = list(User.objects.filter(role=User.Role.CITIZEN, is_active=True))
        self.batch = timezone.now().strftime('%Y%m%d%H%M%S')

        with transaction.atomic():
            tallies = {}
            for _ in range(opts['count']):
                outcome = random.choices([o for _, o in OUTCOMES], weights=[w for w, _ in OUTCOMES])[0]
                document_type, staff = random.choice(types)
                link = citizens and document_type.scope == DocumentType.Scope.EXTERNAL and random.random() < opts['citizen_share']
                outcome = self._seed_one(document_type, staff, outcome, random.choice(citizens) if link else None, opts['days'])
                tallies[outcome] = tallies.get(outcome, 0) + 1

        self.stdout.write(self.style.SUCCESS(f"Seeded {opts['count']} document requests (batch {self.batch})."))
        for outcome, n in sorted(tallies.items()):
            self.stdout.write(f"  {outcome:<11} {n}")

    # ---- setup -------------------------------------------------------------

    def _clear(self):
        seeded = Document.objects.filter(form_data__has_key=SEED_KEY)
        count = seeded.count()
        for document in seeded:
            if document.qr_code:
                document.qr_code.delete(save=False)
        seeded.delete()  # logs, stage history, alerts, and notifications cascade
        self.stdout.write(f"Removed {count} previously seeded request(s).")

    def _eligible_types(self):
        """Active types whose every route office has active staff, paired with that staff by office."""
        staff_by_office = {}
        for user in User.objects.filter(role__in=[User.Role.EMPLOYEE, User.Role.ADMIN], is_active=True):
            office = resolve_office(user.office)
            if office:
                staff_by_office.setdefault(office.pk, []).append(user)

        eligible, skipped = [], []
        for document_type in DocumentType.objects.filter(is_active=True).prefetch_related('steps__office'):
            steps = list(document_type.steps.all())
            if steps and all(step.office_id in staff_by_office for step in steps):
                eligible.append((document_type, staff_by_office))
            else:
                missing = sorted({s.office.code for s in steps if s.office_id not in staff_by_office}) or ['no workflow']
                skipped.append(f"{document_type.name} (no staff at {', '.join(missing)})")
        if skipped:
            self.stdout.write(self.style.WARNING("Skipping types nobody could process: " + '; '.join(skipped)))
        return eligible

    # ---- one request -------------------------------------------------------

    def _seed_one(self, document_type, staff_by_office, outcome, citizen, days):
        steps = list(document_type.steps.select_related('office'))
        last = len(steps) - 1
        offices = [s.office for s in steps]
        sla = [s.max_hours_allowed for s in steps]
        pick = lambda position: random.choice(staff_by_office[offices[position].pk])
        creator = pick(0)

        # A two-office route has no office in between to be "at".
        if last < 2 and outcome in ('processing', 'overdue', 'missing'):
            outcome = 'pending'
        if outcome == 'pending':
            target = random.randint(0, last - 1)
        elif outcome in ('processing', 'overdue', 'missing'):
            target = random.randint(1, last - 1)
        else:
            target = last

        # Build the trail as (hours from creation, kind, details), then place it in time.
        events = [(0.0, 'created', {'by': creator, 'at': 0})]
        clock = 0.0
        entered_at = 0.0          # when the document reached the office it is at
        position = 0
        handler = creator

        def forward_to(next_position, auto=False, receive=True):
            nonlocal clock, entered_at, position, handler
            sender = handler
            note = (f"Document created and auto-forwarded to {offices[next_position].name} by "
                    f"{creator.full_name} ({creator.employee_id})." if auto else
                    f"Forwarded via QR scan by {sender.full_name} ({sender.employee_id}).")
            events.append((clock, 'released', {'by': sender, 'at': position, 'note': note, 'qr': not auto}))
            if not receive:
                return  # still in transit
            clock += random.uniform(0.2, 1.5)  # carried to the next office
            receiver = pick(next_position)
            qr = random.random() < 0.85
            events.append((clock, 'received', {
                'by': receiver, 'sender': sender, 'at': next_position, 'qr': qr,
                'duration': clock - entered_at, 'final': next_position == last,
                'note': f"Received via QR scan by {receiver.full_name} ({receiver.employee_id})." if qr else '',
            }))
            entered_at, position, handler = clock, next_position, receiver

        def hold(fraction_low=0.15, fraction_high=0.85):
            nonlocal clock
            clock += random.uniform(fraction_low, fraction_high) * sla[position]

        # Staff at the origin office create it, and it is auto-forwarded at once.
        clock += random.uniform(0.02, 0.3)
        waiting_at_step_2 = outcome == 'pending' and target == 0
        forward_to(1, auto=True, receive=not waiting_at_step_2)
        # On a two-office route that first receipt already completes it.
        if not waiting_at_step_2 and last > 1:
            events.append((clock + 0.1, 'stage', {'stage': Document.ProcessingStage.UNDER_REVIEW, 'by': handler}))

        returned = False
        while position < target:
            hold()
            if not returned and position >= 2 and random.random() < 0.12:
                # Controlled Return: send it back a step to fix something, then forward again.
                returned = True
                previous, reason = position - 1, random.choice(RETURN_REASONS)
                events.append((clock, 'return_initiated', {'by': handler, 'at': position, 'note': reason}))
                clock += random.uniform(0.2, 1.0)
                receiver = pick(previous)
                events.append((clock, 'return_received', {'by': receiver, 'sender': handler, 'at': previous, 'duration': clock - entered_at}))
                entered_at, position, handler = clock, previous, receiver
                hold(0.1, 0.5)
            if position == target:
                break
            if position + 1 == target and target == last and random.random() < 0.6:
                events.append((clock - 0.05, 'stage', {'stage': Document.ProcessingStage.APPROVED, 'by': handler}))
            forward_to(position + 1)

        follow_up = None
        if outcome == 'pending':
            if not waiting_at_step_2:
                hold(0.1, 0.6)
                forward_to(position + 1, receive=False)
            status, now_offset = Document.Status.IN_TRANSIT, clock + random.uniform(0.1, 0.8) * sla[position + 1]
        elif outcome == 'processing':
            status, now_offset = Document.Status.IN_PROGRESS, clock + random.uniform(0.05, 0.8) * sla[position]
        elif outcome == 'overdue':
            dwell = random.uniform(1.2 * sla[position], max(1.25 * sla[position], min(46, 3 * sla[position])))
            status, now_offset = Document.Status.IN_PROGRESS, clock + dwell
            follow_up = clock + random.uniform(sla[position] * 1.05, dwell)
        elif outcome == 'missing':
            dwell = random.uniform(MISSING_AFTER_HOURS + 2, 120)
            status, now_offset = Document.Status.MISSING, clock + dwell
            events.append((clock + MISSING_AFTER_HOURS + random.uniform(0, 1), 'missing', {'at': position}))
            follow_up = clock + random.uniform(sla[position] * 1.05, MISSING_AFTER_HOURS)
        else:
            events.append((clock + 0.01, 'stage', {'stage': Document.ProcessingStage.READY_FOR_RELEASE, 'by': handler}))
            if outcome == 'completed':
                status, now_offset = Document.Status.COMPLETED, clock + random.uniform(0.2, 30)
            else:
                hold(0.2, 2)
                events.append((clock, 'released_to_citizen', {'by': handler, 'at': position}))
                events.append((clock + 0.01, 'stage', {'stage': Document.ProcessingStage.COMPLETED, 'by': handler}))
                status, now_offset = Document.Status.RELEASED, None
        if follow_up is not None and citizen and random.random() < 0.7:
            events.append((follow_up, 'follow_up', {'by': citizen, 'at': position, 'sla': sla[position], 'dwell': follow_up - clock}))

        # Place in time: active requests are "now" at the end of their trail;
        # released ones finished somewhere in the past `days`.
        now = timezone.now()
        if now_offset is not None:
            start = now - timedelta(hours=now_offset)
        else:
            finish = now - timedelta(days=random.uniform(0.2, days))
            start = finish - timedelta(hours=clock + 0.02)
        at = lambda hours: start + timedelta(hours=hours)

        requester = citizen.full_name if citizen else person()
        form = fill_form(document_type, requester)
        form[SEED_KEY] = self.batch
        document = Document(
            document_type=document_type, form_data=form, origin_office=creator.office or '',
            route_position=position, status=status, current_handler=handler,
            processing_stage=Document.ProcessingStage.SUBMITTED,
        )
        if citizen:
            document.requested_by = citizen
        elif document_type.scope == DocumentType.Scope.EXTERNAL:
            # example.com is reserved, so no real mailbox can ever receive these.
            document.guest_name = requester
            document.guest_email = f"{requester.lower().replace(' ', '.')}.{random.randint(10, 99)}@example.com"
        else:
            document.guest_name, document.guest_email = creator.full_name, creator.email
        document.save()
        generate_qr_code(document)

        last_event_at = start
        for hours, kind, data in sorted(events, key=lambda e: e[0]):
            when = at(hours)
            last_event_at = max(last_event_at, when)
            self._write_event(document, kind, data, when, offices, citizen)

        Document.objects.filter(pk=document.pk).update(
            created_at=start, entered_current_office_at=at(entered_at), updated_at=last_event_at,
        )
        return outcome

    def _write_event(self, document, kind, data, when, offices, citizen):
        def log(action, **fields):
            entry = DocumentLog.objects.create(document=document, action=action, **fields)
            DocumentLog.objects.filter(pk=entry.pk).update(timestamp=when)

        def stage(value, by, note=''):
            Document.objects.filter(pk=document.pk).update(processing_stage=value)
            entry = RequestStatusHistory.objects.create(document=document, stage=value, changed_by=by, note=note)
            RequestStatusHistory.objects.filter(pk=entry.pk).update(timestamp=when)

        def notify(recipient, title, message, kind_, sender=None, read=None):
            entry = Notification.objects.create(
                recipient=recipient, sender=sender, title=title, message=message, notification_type=kind_,
                related_document=document, is_read=random.random() < 0.6 if read is None else read,
            )
            Notification.objects.filter(pk=entry.pk).update(created_at=when)

        name = document.document_type.name
        office = offices[data['at']] if 'at' in data else None
        if kind == 'created':
            log(DocumentLog.Action.CREATED, office=office, acted_by=data['by'], notes='Document created and entered into workflow.')
            stage(Document.ProcessingStage.SUBMITTED, data['by'])
        elif kind == 'released':
            log(DocumentLog.Action.RELEASED, office=office, sender=data['by'], acted_by=data['by'], qr_verified=data['qr'], notes=data['note'])
        elif kind == 'received':
            action = DocumentLog.Action.RETURNED if data['final'] else DocumentLog.Action.RECEIVED
            log(action, office=office, sender=data['sender'], acted_by=data['by'], qr_verified=data['qr'],
                duration_at_office=timedelta(hours=data['duration']), notes=data['note'])
            if citizen:
                title = 'Ready for pickup' if data['final'] else f"Received at {office.name}"
                notify(citizen, title, f"Your {name} request ({document.tracking_number}) "
                       + (f"is ready for pickup at {office.name}." if data['final'] else f"is now being processed at {office.name}."),
                       Notification.NotificationType.DOCUMENT_UPDATE)
        elif kind == 'return_initiated':
            log(DocumentLog.Action.RETURN_INITIATED, office=office, sender=data['by'], acted_by=data['by'], notes=data['note'])
        elif kind == 'return_received':
            log(DocumentLog.Action.RETURN_RECEIVED, office=office, sender=data['sender'], acted_by=data['by'],
                qr_verified=True, duration_at_office=timedelta(hours=data['duration']))
        elif kind == 'stage':
            stage(data['stage'], data['by'])
        elif kind == 'released_to_citizen':
            action = DocumentLog.Action.RELEASED_TO_ORIGIN if document.is_internal else DocumentLog.Action.RELEASED_TO_CITIZEN
            log(action, office=office, acted_by=data['by'], qr_verified=random.random() < 0.7)
            if citizen:
                notify(citizen, 'Released to you', f"Your {name} request ({document.tracking_number}) has been released.",
                       Notification.NotificationType.DOCUMENT_UPDATE)
        elif kind == 'missing':
            log(DocumentLog.Action.FLAGGED_MISSING, office=office,
                notes=f"Auto-flagged by scheduled SLA check: exceeded {MISSING_AFTER_HOURS}h at '{office.code}'.")
            alert = MissingDocumentAlert.objects.create(
                document=document, days_delayed=2, notes=f"Stuck at '{office.code}' for over {MISSING_AFTER_HOURS}h.",
            )
            MissingDocumentAlert.objects.filter(pk=alert.pk).update(raised_at=when)
        elif kind == 'follow_up':
            dwell, sla = round(data['dwell'], 1), data['sla']
            log(DocumentLog.Action.EXPEDITE_REQUESTED, office=office, acted_by=data['by'],
                notes=f"Citizen requested a follow-up — document has been at {office.code} for {dwell}h (SLA: {sla}h).")
            for staff in User.objects.filter(role=User.Role.EMPLOYEE, is_active=True):
                if resolve_office(staff.office) == office:
                    notify(staff, f"Follow-Up Requested: {document.tracking_number}",
                           f"The citizen who requested {document.tracking_number} ({name}) has flagged it as delayed — "
                           f"it's been at your office for {dwell}h (expected: {sla}h). Please review.",
                           Notification.NotificationType.EXPEDITE_REQUEST, sender=data['by'])
