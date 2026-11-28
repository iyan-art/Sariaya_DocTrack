"""
Historical sample data for the live system: 1 to 3 years of document
requests that walk the REAL offices and document types already in the
database, step by step, with handler history, per-office durations,
current work in progress and citizen ratings.

    python manage.py seed_supabase_data --years 3            # add sample data
    python manage.py seed_supabase_data --years 1 --dry-run  # count only, write nothing
    python manage.py seed_supabase_data --purge              # remove all sample data

It writes to whatever database Django is configured for: set DATABASE_URL
to the Supabase connection string to fill the deployed database.

Rules the data follows:
  - Requests are created on weekdays, 8:00 AM-12:00 NN and 1:00-5:00 PM,
    and every office's time is measured in those working hours (the SLA
    rules of business_hours.py), so the dashboards read it like real work.
  - Each document follows its type's workflow: created and processed at
    Step 1, sent, received and processed at each office, then Complete
    Transaction at the last office; citizen documents are later released
    to the citizen, and some are rated (half stars allowed).
  - Each office has its own pace (some well within their SLA, some over
    it), so the Heatmap and the Fastest/Slowest rankings have a spread.
  - Requests from the last few weeks are still open: processing at an
    office, sent but not yet received, or overdue.

Safety:
  - Every sample document has is_sample=True. The overdue/reminder email
    scan skips them, so the real staff get no emails about them, and
    --purge removes exactly them (with their history, ratings and the
    sample staff accounts) and nothing else.
  - The sample staff accounts are inactive (they cannot sign in) and use
    the @sample.sariaya.local domain, which receives no mail.
  - Rows go in with bulk_create, 500 documents per transaction.
"""
import random
import secrets
from contextlib import contextmanager
from datetime import datetime, time, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.documents.business_hours import MANILA, add_business_hours, business_duration
from apps.documents.models import (
    Document, DocumentLog, DocumentType, Office, Survey, SurveyAnswer, SurveyQuestion, SurveyResponse,
)
from apps.documents.qr_services import generate_qr_code

SAMPLE_DOMAIN = 'sample.sariaya.local'
BATCH = 500
_SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

FIRST_NAMES = ['Maria', 'Jose', 'Ana', 'Pedro', 'Rosa', 'Juan', 'Carmen', 'Antonio', 'Luz', 'Ricardo',
               'Elena', 'Ramon', 'Teresa', 'Manuel', 'Gloria', 'Fernando', 'Liza', 'Ernesto', 'Marites', 'Rogelio']
LAST_NAMES = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Flores', 'Ramos', 'Torres', 'Villanueva',
              'Aquino', 'Castillo', 'Dela Cruz', 'Navarro', 'Pascual', 'Salazar', 'Domingo', 'Mercado', 'Lopez', 'Gonzales']
BARANGAYS = ['Brgy. Castañas', 'Brgy. Sampaloc 1', 'Brgy. Pili', 'Brgy. Lutucan 1', 'Brgy. Bignay 1',
             'Barangay 1 (Pob.)', 'Barangay 4 (Pob.)', 'Brgy. Manggalang 1', 'Brgy. Talaan Aplaya', 'Brgy. Tumbaga 1']
PURPOSES = ['Employment requirement', 'Business renewal', 'Bank loan application', 'Scholarship application',
            'Office supplies procurement', 'Road repair materials', 'Travel reimbursement', 'Legal requirement',
            'Building repair', 'School enrollment', 'Livelihood program', 'Medical assistance']

RATINGS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5]
RATING_WEIGHTS = [30, 22, 20, 10, 8, 4, 3, 3]
COMMENTS = {
    'high': [
        "Mabilis po ang proseso at maayos ang pakikitungo ng staff.\nSalamat po!",
        "Very organized. I was informed by email when my document was ready.",
        "The staff explained the requirements clearly.\nI got my document earlier than expected.",
        "Maganda ang serbisyo. Nakita ko agad sa tracking kung nasaan na ang dokumento ko.",
    ],
    'mid': [
        "Okay naman po ang serbisyo pero medyo natagalan sa isang opisina.",
        "Good service overall.\nThe waiting area could be more comfortable.",
        "Maayos pero sana mas malinaw ang mga requirements sa simula pa lang.",
    ],
    'low': [
        "Matagal po ang proseso.\nNaghintay ako ng ilang araw bago ma-release.",
        "I had to follow up twice before my request moved to the next office.",
    ],
}


@contextmanager
def keep_given_timestamps():
    """bulk_create normally overwrites auto_now/auto_now_add fields with now(); keep the historical ones."""
    fields = [
        Document._meta.get_field('created_at'), Document._meta.get_field('updated_at'),
        Document._meta.get_field('entered_current_office_at'), DocumentLog._meta.get_field('timestamp'),
        SurveyResponse._meta.get_field('submitted_at'),
    ]
    saved = [(f, f.auto_now, f.auto_now_add) for f in fields]
    for f in fields:
        f.auto_now = f.auto_now_add = False
    try:
        yield
    finally:
        for f, auto_now, auto_now_add in saved:
            f.auto_now, f.auto_now_add = auto_now, auto_now_add


class Command(BaseCommand):
    help = 'Adds 1-3 years of realistic historical sample documents (is_sample=True) to the configured database, or removes them with --purge.'

    def add_arguments(self, parser):
        parser.add_argument('--years', type=int, default=3, choices=[1, 2, 3], help='How many years back (default 3).')
        parser.add_argument('--per-day', type=float, default=4, help='Average new requests per working day (default 4).')
        parser.add_argument('--seed', type=int, default=None, help='Random seed, for the same data on every run.')
        parser.add_argument('--dry-run', action='store_true', help='Build everything, report the counts, write nothing.')
        parser.add_argument('--append', action='store_true', help='Add more even if sample data already exists.')
        parser.add_argument('--purge', action='store_true', help='Remove all sample data and sample staff, then stop.')
        parser.add_argument('--yes', action='store_true', help='Do not ask for confirmation (non-interactive runs).')

    # ------------------------------------------------------------------ entry
    def handle(self, *args, **opts):
        self.rng = random.Random(opts['seed'])
        self._confirm_target(opts)
        if opts['purge']:
            return self._purge(opts['dry_run'])
        if Document.objects.filter(is_sample=True).exists() and not opts['append']:
            raise CommandError('Sample data already exists. Run with --purge first, or --append to add more.')

        self.types = self._load_document_types()
        self.office_by_code = {o.code: o for o in Office.objects.all()}
        self.pace = self._office_pace()
        self.survey, self.rating_q, self.text_q = self._evaluation_questions()

        if opts['dry_run']:
            with transaction.atomic():
                self.staff = self._sample_staff()
                counts = self._generate(opts)
                transaction.set_rollback(True)
            self.stdout.write(self.style.WARNING('Dry run: nothing was written.'))
        else:
            self.staff = self._sample_staff()
            counts = self._generate(opts)
            self._qr_codes_for_open_documents()
        self._report(counts)

    def _confirm_target(self, opts):
        db = settings.DATABASES['default']
        where = 'local SQLite file' if connection.vendor == 'sqlite' else f"{connection.vendor} at {db.get('HOST') or '?'} / {db.get('NAME')}"
        action = 'REMOVE all sample data from' if opts['purge'] else 'ADD sample data to'
        self.stdout.write(f"About to {action} the {where}.")
        if connection.vendor != 'sqlite' and not opts['yes'] and not opts['dry_run']:
            if input("Type 'yes' to continue: ").strip().lower() != 'yes':
                raise CommandError('Cancelled.')

    # ------------------------------------------------------------- set-up
    def _load_document_types(self):
        types = []
        for dt in DocumentType.objects.filter(is_active=True).prefetch_related('steps__office'):
            steps = [(s.office.code, s.max_hours_allowed) for s in dt.steps.order_by('step_number')]
            if steps:
                types.append((dt, steps))
        if not types:
            raise CommandError('No active document types with workflow steps. Build the workflows first.')
        return types

    def _office_pace(self):
        """Each office's usual share of its SLA: most within it, a few habitually over."""
        codes = sorted({code for _, steps in self.types for code, _ in steps})
        pace = {code: self.rng.uniform(0.25, 0.9) for code in codes}
        for code in self.rng.sample(codes, k=max(1, len(codes) // 4)):
            pace[code] = self.rng.uniform(1.1, 2.2)  # the slow ones
        return pace

    def _evaluation_questions(self):
        survey = (Survey.objects.filter(is_active=True, questions__question_type=SurveyQuestion.QuestionType.RATING)
                  .distinct().order_by('-created_at').first())
        if not survey:
            self.stdout.write(self.style.WARNING('No active survey with a rating question: ratings are skipped.'))
            return None, None, None
        rating = survey.questions.filter(question_type=SurveyQuestion.QuestionType.RATING).order_by('order').first()
        text = survey.questions.filter(question_type=SurveyQuestion.QuestionType.TEXT).order_by('order').first()
        self.stdout.write(f'Ratings go to the survey "{survey.title}".')
        return survey, rating, text

    def _sample_staff(self):
        """Two inactive sample employees per office in the workflows (they cannot sign in)."""
        staff = {}
        for code in self.pace:
            people = list(User.objects.filter(email__endswith=f'@{SAMPLE_DOMAIN}', office=code))
            while len(people) < 2:
                first, last = self.rng.choice(FIRST_NAMES), self.rng.choice(LAST_NAMES)
                user = User(email=f'sample.{code.lower()}.{len(people) + 1}@{SAMPLE_DOMAIN}', first_name=first,
                            last_name=last, role=User.Role.EMPLOYEE, office=code, is_active=False)
                user.set_unusable_password()
                user.save()  # save() assigns the EMP-YYYY-NNNN id
                people.append(user)
            staff[code] = people
        return staff

    # --------------------------------------------------------- generation
    def _working_days(self, years):
        today = timezone.localtime(timezone.now(), MANILA).date()
        day = today - timedelta(days=365 * years)
        while day <= today:
            if day.weekday() < 5:
                yield day
            day += timedelta(days=1)

    def _created_at(self, day):
        hour = self.rng.choice([8, 9, 10, 11, 13, 14, 15, 16])
        return datetime.combine(day, time(hour, self.rng.randint(0, 59)), MANILA)

    def _generate(self, opts):
        now = timezone.now()
        counts = {'documents': 0, 'logs': 0, 'ratings': 0, 'completed': 0, 'released': 0,
                  'in_progress': 0, 'in_transit': 0, 'overdue': 0}
        self.next_seq = {}
        pending = []
        for day in self._working_days(opts['years']):
            for _ in range(self._poisson(opts['per_day'])):
                pending.append(self._simulate(self._created_at(day), now))
                if len(pending) >= BATCH:
                    self._write(pending, counts)
                    pending = []
        if pending:
            self._write(pending, counts)
        return counts

    def _poisson(self, mean):
        count, threshold, product = 0, pow(2.718281828, -mean), self.rng.random()
        while product > threshold:
            count += 1
            product *= self.rng.random()
        return count

    def _simulate(self, created, now):
        """One document's life from `created` up to now: its final state and its history."""
        dt, steps = self.rng.choice(self.types)
        external = dt.scope == DocumentType.Scope.EXTERNAL
        # The last few weeks are still open: work there runs slower (a
        # backlog), documents wait longer to be received, and some are stuck.
        recent = (now - created) < timedelta(days=15)
        backlog = self.rng.uniform(2, 6) if recent else 1
        stuck_step = self.rng.randrange(len(steps)) if recent and self.rng.random() < 0.25 else None

        def handler(code):
            return self.rng.choice(self.staff[code])

        logs = []
        origin_code = steps[0][0]
        creator = handler(origin_code)
        logs.append(dict(action=DocumentLog.Action.CREATED, office=origin_code, acted_by=creator, sender=None,
                         timestamp=created, notes='Document created and entered into workflow.'))
        state = dict(position=0, arrived=created, handler=creator)
        holder = creator

        for i, (code, sla) in enumerate(steps):
            factor = self.pace[code] * self.rng.lognormvariate(0, 0.35) * backlog
            if i == stuck_step:
                factor *= self.rng.uniform(3, 6)
            done = add_business_hours(state['arrived'], max(0.1, sla * factor))
            if done > now:  # still being processed here
                return self._result(dt, created, external, logs, 'in_progress', i, state['arrived'], holder, steps, now)
            if i == len(steps) - 1:
                logs.append(dict(action=DocumentLog.Action.COMPLETED, office=code, acted_by=holder, sender=holder,
                                 timestamp=done, duration=business_duration(state['arrived'], done),
                                 duration_office=code, sla=sla, notes='Transaction completed.'))
                if not external:
                    logs.append(dict(action=DocumentLog.Action.RELEASED_TO_ORIGIN, office=code, acted_by=holder,
                                     sender=holder, timestamp=done + timedelta(seconds=1), notes='Transaction completed.'))
                    return self._result(dt, created, external, logs, 'released', i, done, holder, steps, now)
                picked_up = add_business_hours(done, self.rng.uniform(8, 80) if recent else self.rng.uniform(1, 40))
                if picked_up > now:
                    return self._result(dt, created, external, logs, 'completed', i, done, holder, steps, now)
                logs.append(dict(action=DocumentLog.Action.RELEASED_TO_CITIZEN, office=code, acted_by=holder,
                                 sender=holder, timestamp=picked_up, notes='Released to the citizen.'))
                result = self._result(dt, created, external, logs, 'released', i, picked_up, holder, steps, now)
                result['rated_at'] = picked_up + timedelta(minutes=self.rng.randint(5, 600))
                return result
            next_code = steps[i + 1][0]
            next_name = self.office_by_code[next_code].name if next_code in self.office_by_code else next_code
            logs.append(dict(action=DocumentLog.Action.RELEASED, office=code, acted_by=holder, sender=holder,
                             timestamp=done, notes=f'Sent to {next_name}.'))
            received = add_business_hours(done, self.rng.uniform(0.5, 10) if recent else self.rng.uniform(0.1, 1.5))
            if received > now:  # sent, not yet received
                return self._result(dt, created, external, logs, 'in_transit', i, state['arrived'], holder, steps, now)
            receiver = handler(next_code)
            logs.append(dict(action=DocumentLog.Action.RECEIVED, office=next_code, acted_by=receiver, sender=holder,
                             timestamp=received, duration=business_duration(state['arrived'], received),
                             duration_office=code, sla=sla, notes=''))
            state['arrived'], holder = received, receiver
        raise AssertionError('unreachable')

    def _result(self, dt, created, external, logs, status, position, entered, holder, steps, now):
        stage = {
            'in_progress': 'under_review', 'in_transit': 'under_review',
            'completed': Document.ProcessingStage.READY_FOR_RELEASE, 'released': Document.ProcessingStage.COMPLETED,
        }[status]
        return dict(dt=dt, created=created, external=external, logs=logs, status=status, position=position,
                    entered=entered, holder=holder, steps=steps, stage=stage, updated=logs[-1]['timestamp'],
                    overdue=status == 'in_progress' and business_duration(entered, now).total_seconds() / 3600 >= steps[position][1])

    # ------------------------------------------------------------- writing
    def _tracking_number(self, year):
        prefix = f'DOC-{year}-SRY-'
        if year not in self.next_seq:
            highest = 0
            for number in Document.objects.filter(tracking_number__startswith=prefix).values_list('tracking_number', flat=True):
                part = number[len(prefix):].split('-', 1)[0]
                if part.isdigit():
                    highest = max(highest, int(part))
            self.next_seq[year] = highest + 1
        seq = self.next_seq[year]
        self.next_seq[year] += 1
        return f"{prefix}{seq:04d}-{''.join(secrets.choice(_SUFFIX_ALPHABET) for _ in range(4))}"

    def _form_data(self, dt):
        data = {}
        for field in dt.request_fields or []:
            key, kind = field.get('key'), field.get('type')
            if not key:
                continue
            if field.get('options'):
                data[key] = self.rng.choice(field['options'])
            elif kind == 'tel':
                data[key] = '09' + ''.join(str(self.rng.randint(0, 9)) for _ in range(9))
            elif kind == 'number':
                data[key] = str(self.rng.randint(1, 50) if field.get('integer') else self.rng.randint(500, 250000))
            elif kind == 'date':
                data[key] = f'{self.rng.randint(1960, 2005)}-{self.rng.randint(1, 12):02d}-{self.rng.randint(1, 28):02d}'
            elif any(w in key for w in ('address', 'location', 'place')):
                data[key] = f'{self.rng.randint(1, 250)} Rizal St., {self.rng.choice(BARANGAYS)}, Sariaya, Quezon'
            elif 'name' in key:
                data[key] = f'{self.rng.choice(FIRST_NAMES)} {self.rng.choice(LAST_NAMES)}'
            else:
                data[key] = self.rng.choice(PURPOSES)
        return data

    def _write(self, batch, counts):
        with keep_given_timestamps(), transaction.atomic():
            documents = []
            for item in batch:
                name = f'{self.rng.choice(FIRST_NAMES)} {self.rng.choice(LAST_NAMES)}'
                code = item['steps'][item['position']][0]
                documents.append(Document(
                    document_type=item['dt'], tracking_number=self._tracking_number(item['created'].year),
                    origin_office=item['steps'][0][0], form_data=self._form_data(item['dt']),
                    guest_name=name if item['external'] else '',
                    guest_email=f"{name.lower().replace(' ', '.')}@{SAMPLE_DOMAIN}" if item['external'] else '',
                    route_position=item['position'], status=item['status'], processing_stage=item['stage'],
                    current_office=code, current_handler=item['holder'], created_at=item['created'],
                    updated_at=item['updated'], entered_current_office_at=item['entered'], is_sample=True,
                ))
            documents = Document.objects.bulk_create(documents)

            logs, responses, rated = [], [], []
            for document, item in zip(documents, batch):
                for log in item['logs']:
                    logs.append(DocumentLog(
                        document=document, action=log['action'], office=self.office_by_code.get(log['office']),
                        acted_by=log['acted_by'], sender=log['sender'], timestamp=log['timestamp'],
                        qr_verified=self.rng.random() < 0.85, notes=log['notes'],
                        duration_at_office=log.get('duration'),
                        duration_office=self.office_by_code.get(log['duration_office']) if log.get('duration_office') else None,
                        duration_sla_hours=log.get('sla'),
                    ))
                if self.survey and item.get('rated_at') and self.rng.random() < 0.6:
                    responses.append(SurveyResponse(survey=self.survey, source=SurveyResponse.Source.RELEASE,
                                                    document=document, submitted_at=item['rated_at']))
                    rated.append(self.rng.choices(RATINGS, RATING_WEIGHTS)[0])
                counts[item['status']] += 1
                counts['overdue'] += item['overdue']
            DocumentLog.objects.bulk_create(logs, batch_size=1000)

            answers = []
            for response, rating in zip(SurveyResponse.objects.bulk_create(responses), rated):
                answers.append(SurveyAnswer(response=response, question=self.rating_q, rating_value=rating))
                if self.text_q and self.rng.random() < 0.6:
                    band = 'high' if rating >= 4 else 'mid' if rating >= 3 else 'low'
                    answers.append(SurveyAnswer(response=response, question=self.text_q,
                                                text_value=self.rng.choice(COMMENTS[band])))
            SurveyAnswer.objects.bulk_create(answers)

        counts['documents'] += len(documents)
        counts['logs'] += len(logs)
        counts['ratings'] += len(responses)
        self.stdout.write(f"  {counts['documents']} documents written...")

    def _qr_codes_for_open_documents(self):
        """QR tags for the documents still in progress, so they can be scanned in a demo."""
        # A QR tag carries the site's link and is signed with SECRET_KEY: made
        # with a dev machine's values, it would not open or verify on the live
        # site. Skip it then; the rest of the data is unaffected.
        if connection.vendor != 'sqlite' and 'localhost' in settings.FRONTEND_BASE_URL:
            self.stdout.write(self.style.WARNING(
                'QR codes skipped: FRONTEND_BASE_URL is localhost. Set FRONTEND_BASE_URL and SECRET_KEY '
                'to the live values (as on Render) to generate them.'))
            return
        open_docs = Document.objects.filter(is_sample=True, qr_code='').exclude(status=Document.Status.RELEASED)
        for document in open_docs.iterator():
            generate_qr_code(document)

    # ---------------------------------------------------------------- purge
    def _purge(self, dry_run):
        samples = Document.objects.filter(is_sample=True)
        staff = User.objects.filter(email__endswith=f'@{SAMPLE_DOMAIN}')
        counts = (samples.count(), DocumentLog.objects.filter(document__in=samples).count(),
                  SurveyResponse.objects.filter(document__in=samples).count(), staff.count())
        if not dry_run:
            with transaction.atomic():
                SurveyResponse.objects.filter(document__in=samples).delete()
                samples.delete()
                staff.delete()
        verb = 'Would remove' if dry_run else 'Removed'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {counts[0]} sample documents, {counts[1]} history entries, '
            f'{counts[2]} ratings and {counts[3]} sample staff accounts. Real data was not touched.'))

    def _report(self, c):
        self.stdout.write(self.style.SUCCESS(
            f"{c['documents']} sample documents with {c['logs']} history entries and {c['ratings']} ratings.\n"
            f"  Released/finished: {c['released']}  Ready for pickup: {c['completed']}\n"
            f"  Processing: {c['in_progress']} (overdue now: {c['overdue']})  Sent, not yet received: {c['in_transit']}"))
