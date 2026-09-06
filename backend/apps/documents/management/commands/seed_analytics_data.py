import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.documents.models import Document, DocumentLog, DocumentType, MissingDocumentAlert, Office, WorkflowStep
from apps.documents.qr_services import generate_qr_code

SEED_PASSWORD = 'Sariaya#Seed1'

OFFICES = [
    ('Office of the Mayor', 'MAYOR'),
    ('Treasury Office', 'TREAS'),
    ("Assessor's Office", 'ASSESSOR'),
    ('Municipal Planning and Development Office', 'MPDO'),
    ('Civil Registrar', 'CIVILREG'),
    ('Engineering / Building Official', 'ENGG'),
    ('Accounting Office', 'ACCTG'),
    ('General Services Office', 'GSO'),
]

# (min, max) hours a document typically sits at this office once it arrives.
# Deliberately skewed so Treasury/Civil Registrar come out fast and
# Assessor/MPDO come out slow — this is what drives the Top 5 Fastest/Slowest
# Offices rankings and the red/yellow bottleneck coloring on the heatmap.
OFFICE_SPEED_HOURS = {
    'TREAS': (0.5, 3),
    'CIVILREG': (1, 4),
    'MAYOR': (4, 12),
    'ACCTG': (4, 14),
    'GSO': (6, 18),
    'ENGG': (10, 30),
    'ASSESSOR': (24, 72),
    'MPDO': (30, 96),
}

EMPLOYEE_NAMES = [
    ('Maria', 'Santos'), ('Jose', 'Reyes'), ('Ana', 'Cruz'), ('Pedro', 'Bautista'),
    ('Rosa', 'Garcia'), ('Juan', 'Mendoza'), ('Carmen', 'Flores'), ('Antonio', 'Ramos'),
    ('Luz', 'Torres'), ('Ricardo', 'Villanueva'),
]

APPLICANT_NAMES = [
    'Juan Dela Cruz', 'Maria Clara Santos', 'Pedro Penduko', 'Andres Bonifacio Jr.',
    'Gabriela Silang', 'Emilio Aguinaldo III', 'Josefa Rizal', 'Apolinario Mabini Jr.',
    'Melchora Aquino', 'Diego Silang', 'Teodora Alonso', 'Gregorio del Pilar',
]

# name -> (scope, ordered office-code route). Every route deliberately starts
# and ends at the same office, matching the convention the release/receive
# engine relies on (services.py: reaching the LAST route index means "back
# at the origin office" — see receive_document()'s completion logic).
DOCUMENT_TYPE_SPECS = {
    'Birth Certificate': ('external', ['CIVILREG', 'MAYOR', 'CIVILREG']),
    'Marriage Certificate': ('external', ['CIVILREG', 'TREAS', 'CIVILREG']),
    'Death Certificate': ('external', ['CIVILREG', 'CIVILREG']),
    'Business Permit': ('external', ['MPDO', 'ASSESSOR', 'ENGG', 'TREAS', 'MAYOR', 'MPDO']),
    'Building Permit': ('external', ['ENGG', 'ASSESSOR', 'TREAS', 'ENGG']),
    'Purchase Request': ('internal', ['GSO', 'ACCTG', 'MAYOR', 'GSO']),
    'Voucher': ('internal', ['ACCTG', 'TREAS', 'ACCTG']),
    'Payroll': ('internal', ['ACCTG', 'MAYOR', 'ACCTG']),
}

# Rough mix requested: in-progress / in-transit / completed / released / missing.
STATUS_WEIGHTS = [
    ('in_progress', 0.20),
    ('in_transit', 0.25),
    ('completed', 0.25),
    ('released', 0.15),
    ('missing', 0.15),
]


class Command(BaseCommand):
    help = (
        "Populates the database with realistic mock offices, employees, document "
        "types/workflows, and ~30 days of document activity (a mix of in-progress, "
        "in-transit, completed, released, and missing documents) so the Analytics "
        "Dashboard and Heatmap have something meaningful to show. Safe to re-run — "
        "offices/employees/types are get-or-created, but WARNING: it always rebuilds "
        "the WorkflowStep route for the 8 document types listed in DOCUMENT_TYPE_SPECS "
        "to the demo routing described here, overwriting whatever workflow was "
        "previously configured for those exact type names."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--count', type=int, default=60,
            help='Number of mock documents to generate (default: 60)',
        )

    def handle(self, *args, **options):
        count = options['count']

        self.stdout.write(self.style.WARNING(
            "This will (re)build workflow steps for: " + ", ".join(DOCUMENT_TYPE_SPECS.keys())
        ))

        with transaction.atomic():
            offices = self._seed_offices()
            employees_by_office = self._seed_employees(offices)
            doc_types = self._seed_document_types(offices)

            for _ in range(count):
                self._seed_document(doc_types, offices, employees_by_office)

        self.stdout.write(self.style.SUCCESS(
            f"\nSeeded {len(offices)} offices, {sum(len(v) for v in employees_by_office.values())} employees, "
            f"{len(doc_types)} document types, and {count} documents with full history spanning the last 30 days.\n"
            f"All seeded employees share the password: {SEED_PASSWORD}"
        ))

    # ---- Catalog data -----------------------------------------------------

    def _seed_offices(self):
        offices = {}
        for name, code in OFFICES:
            office, _ = Office.objects.get_or_create(
                code=code, defaults={'name': name, 'location': 'Sariaya Municipal Hall'},
            )
            offices[code] = office
        return offices

    def _seed_employees(self, offices):
        employees_by_office = {code: [] for code in offices}
        codes = list(offices.keys())
        for i, (first, last) in enumerate(EMPLOYEE_NAMES):
            office_code = codes[i % len(codes)]
            email = f"{first.lower()}.{last.lower()}@sariaya.gov.ph"
            user, was_created = User.objects.get_or_create(
                email=email,
                defaults={
                    'first_name': first, 'last_name': last, 'role': 'employee',
                    'office': office_code, 'position': 'Records Officer',
                },
            )
            if was_created:
                user.set_password(SEED_PASSWORD)
                user.save()
            employees_by_office[office_code].append(user)
        return employees_by_office

    def _seed_document_types(self, offices):
        types = {}
        for name, (scope, route_codes) in DOCUMENT_TYPE_SPECS.items():
            doc_type, _ = DocumentType.objects.get_or_create(name=name, defaults={'scope': scope})
            if doc_type.scope != scope:
                doc_type.scope = scope
                doc_type.save(update_fields=['scope'])

            WorkflowStep.objects.filter(document_type=doc_type).delete()
            for step_number, code in enumerate(route_codes, start=1):
                _, hi = OFFICE_SPEED_HOURS[code]
                WorkflowStep.objects.create(
                    document_type=doc_type, step_number=step_number, office=offices[code],
                    action_required=f"Processing at {offices[code].name}",
                    max_hours_allowed=max(1, round(hi)),
                )
            doc_type.sync_route_from_steps()
            types[name] = doc_type
        return types

    # ---- Document + history generation ------------------------------------

    def _pick_handler(self, employees_by_office, office_code):
        candidates = employees_by_office.get(office_code) or []
        return random.choice(candidates) if candidates else None

    def _seed_document(self, doc_types, offices, employees_by_office):
        type_name = random.choice(list(doc_types.keys()))
        doc_type = doc_types[type_name]
        route = doc_type.route

        final_status = random.choices(
            [s for s, _ in STATUS_WEIGHTS], weights=[w for _, w in STATUS_WEIGHTS],
        )[0]

        created_at = timezone.now() - timedelta(days=random.uniform(0, 30), hours=random.uniform(0, 23))
        origin_code = route[0]
        origin_handler = self._pick_handler(employees_by_office, origin_code)

        document = Document.objects.create(
            document_type=doc_type,
            origin_office=origin_code,
            form_data={
                'applicant_name': random.choice(APPLICANT_NAMES),
                'contact_no': f"09{random.randint(100000000, 999999999)}",
                'description': f"{type_name} request",
            },
            status=Document.Status.IN_PROGRESS,
            route_position=0,
            current_handler=origin_handler,
        )
        # created_at/entered_current_office_at are auto_now_add, so a normal
        # .save() can't set them on the INSERT that just happened above — a
        # raw queryset .update() is required. But the in-memory `document`
        # object doesn't know about that out-of-band write, so it must be
        # mirrored onto the instance too: every .save() later in the walk
        # (release/receive/QR generation) re-persists ALL current fields,
        # and without this it would silently clobber the backdate back to
        # "now" the next time .save() runs.
        Document.objects.filter(pk=document.pk).update(created_at=created_at, entered_current_office_at=created_at)
        document.created_at = created_at
        document.entered_current_office_at = created_at

        created_log = DocumentLog.objects.create(
            document=document, action=DocumentLog.Action.CREATED,
            office=offices[origin_code], acted_by=origin_handler,
            notes='Document created and entered into workflow.',
        )
        DocumentLog.objects.filter(pk=created_log.pk).update(timestamp=created_at)

        self._walk_document(document, route, offices, employees_by_office, created_at, final_status)
        generate_qr_code(document)

    def _walk_document(self, document, route, offices, employees_by_office, clock, final_status):
        full_hops = len(route) - 1  # number of release+receive cycles to fully complete the route

        if final_status in ('completed', 'released'):
            hops_to_complete, end_mid_transit = full_hops, False
        elif final_status == 'in_transit':
            hops_to_complete, end_mid_transit = random.randint(0, full_hops - 1), True
        else:  # in_progress, missing
            hops_to_complete, end_mid_transit = random.randint(0, full_hops - 1), False

        position = 0
        handler = document.current_handler

        for _ in range(hops_to_complete):
            is_final_leg = (position + 1 == full_hops)
            clock, handler, position = self._do_hop(
                document, position, route[position], route[position + 1],
                offices, employees_by_office, handler, clock, is_final_leg,
            )

        if end_mid_transit:
            from_code = route[position]
            clock += timedelta(hours=random.uniform(0.1, 2))
            release_log = DocumentLog.objects.create(
                document=document, action=DocumentLog.Action.RELEASED,
                office=offices[from_code], sender=handler, acted_by=handler,
                qr_verified=random.random() < 0.7, notes='Released via QR scan.',
            )
            DocumentLog.objects.filter(pk=release_log.pk).update(timestamp=clock)
            document.status = Document.Status.IN_TRANSIT
            document.save()
            Document.objects.filter(pk=document.pk).update(entered_current_office_at=clock)
            document.entered_current_office_at = clock

        if final_status == 'missing':
            clock += timedelta(hours=random.uniform(50, 200))
            current_office_code = route[position]
            missing_log = DocumentLog.objects.create(
                document=document, action=DocumentLog.Action.FLAGGED_MISSING,
                office=offices[current_office_code], acted_by=None,
                notes=f"Auto-flagged: exceeded SLA at '{offices[current_office_code].name}'.",
            )
            DocumentLog.objects.filter(pk=missing_log.pk).update(timestamp=clock)
            document.status = Document.Status.MISSING
            document.save()
            alert = MissingDocumentAlert.objects.create(
                document=document, days_delayed=random.randint(1, 10),
                notes=f"Stuck at '{document.current_office}'.",
            )
            MissingDocumentAlert.objects.filter(pk=alert.pk).update(raised_at=clock)

        if final_status == 'released':
            clock += timedelta(hours=random.uniform(1, 24))
            # "Released" is reserved strictly for this final citizen hand-off step.
            release_citizen_log = DocumentLog.objects.create(
                document=document, action=DocumentLog.Action.RELEASED_TO_CITIZEN,
                office=offices[route[-1]], sender=handler, acted_by=handler,
                qr_verified=True, notes='Physically handed to the citizen.',
            )
            DocumentLog.objects.filter(pk=release_citizen_log.pk).update(timestamp=clock)
            document.status = Document.Status.RELEASED
            document.current_handler = handler
            document.save()

    def _do_hop(self, document, position, from_code, to_code, offices, employees_by_office, handler, clock, is_final_leg):
        # HeatmapDataView (and any Top-5-fastest/slowest view built the same
        # way) groups by the RECEIVING log's `office` FK while averaging
        # that same row's `duration_at_office` — which actually records time
        # spent at the office being LEFT (see services.py::receive_document,
        # the real code this mirrors). So to make an office's own average
        # come out fast/slow, the random range must be keyed by `to_code`
        # (the office this row's `office` field will point to), not
        # `from_code`, even though `from_code` is what the duration is
        # conceptually "about".
        speed_lo, speed_hi = OFFICE_SPEED_HOURS[to_code]
        dwell_hours = random.uniform(speed_lo, speed_hi)
        # Occasionally overshoot on purpose, so some documents render as
        # SLA-delayed even before the hourly missing-document sweep would
        # formally flag them. Scaled off this office's OWN range (not the
        # step's max_hours_allowed, which belongs to `from_code` and can be
        # wildly larger/smaller) — otherwise a single hop out of a slow
        # office could inject a 100+ hour outlier into a fast office's
        # average and wreck the intended fastest/slowest ranking.
        if random.random() < 0.25:
            dwell_hours = speed_hi * random.uniform(1.5, 2.5)

        clock = clock + timedelta(hours=random.uniform(0.1, 2))
        release_log = DocumentLog.objects.create(
            document=document, action=DocumentLog.Action.RELEASED,
            office=offices[from_code], sender=handler, acted_by=handler,
            qr_verified=random.random() < 0.7, notes='Released via QR scan.',
        )
        DocumentLog.objects.filter(pk=release_log.pk).update(timestamp=clock)
        document.status = Document.Status.IN_TRANSIT
        document.save()

        clock = clock + timedelta(hours=dwell_hours)
        new_handler = self._pick_handler(employees_by_office, to_code)
        action = DocumentLog.Action.RETURNED if is_final_leg else DocumentLog.Action.RECEIVED
        receive_log = DocumentLog.objects.create(
            document=document, action=action,
            office=offices[to_code], sender=handler, acted_by=new_handler,
            qr_verified=random.random() < 0.7,
            duration_at_office=timedelta(hours=dwell_hours),
            notes='Returned to origin office.' if is_final_leg else 'Received via QR scan.',
        )
        DocumentLog.objects.filter(pk=receive_log.pk).update(timestamp=clock)

        new_position = position + 1
        document.route_position = new_position
        document.status = Document.Status.COMPLETED if is_final_leg else Document.Status.IN_PROGRESS
        document.current_handler = new_handler
        document.save()
        Document.objects.filter(pk=document.pk).update(entered_current_office_at=clock)
        document.entered_current_office_at = clock

        return clock, new_handler, new_position
