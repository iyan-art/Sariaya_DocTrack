"""
Unit tests for the documents app. Run them with:

    python manage.py test apps.documents -v 2

Each test method checks ONE behavior: it sets up the situation (Arrange),
runs the code (Act), and compares the result with what it should be
(Assert). Django gives every test a fresh, empty test database, so tests
never touch the real data and never depend on each other.

The TC-xx code in each docstring matches the Test Case table in the
capstone paper.
"""
import uuid
from datetime import datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

from django.core import mail
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AccessLog, User

from .business_hours import add_business_hours, business_hours_between
from .durations import format_hours_minutes
from .models import (
    Document, DocumentLog, DocumentType, Office, Survey, SurveyQuestion, WorkflowStep,
)
from .qr_services import build_qr_payload
from .sla_scan import run_overdue_scan
from .views import _parse_survey_answers, _speed_rankings

MANILA = ZoneInfo('Asia/Manila')
PASSWORD = 'Str0ng-Pass-123!'


def manila(*args):
    """A date and time in Philippine time, e.g. manila(2026, 11, 27, 16) = Fri 4:00 PM."""
    return datetime(*args, tzinfo=MANILA)


# ---------------------------------------------------------------------------
# 1. Plain functions (no database)
# ---------------------------------------------------------------------------

class DurationFormatTests(SimpleTestCase):
    def test_hours_and_minutes_without_decimals(self):
        """TC-01: 1.3 hours is shown as hours and minutes."""
        self.assertEqual(format_hours_minutes(1.3), '1 hr 18 minutes')

    def test_minutes_only(self):
        """TC-02: less than an hour is shown in minutes."""
        self.assertEqual(format_hours_minutes(0.5), '30 minutes')


class BusinessHoursTests(SimpleTestCase):
    def test_lunch_hour_is_not_counted(self):
        """TC-03: 11:00 AM to 2:00 PM counts 2 working hours (12-1 is lunch)."""
        self.assertEqual(business_hours_between(manila(2026, 11, 26, 11), manila(2026, 11, 26, 14)), 2)

    def test_weekend_is_not_counted(self):
        """TC-04: Saturday 9 AM to Sunday 5 PM counts 0 working hours."""
        self.assertEqual(business_hours_between(manila(2026, 11, 28, 9), manila(2026, 11, 29, 17)), 0)

    def test_night_is_not_counted(self):
        """TC-05: 6 PM to 8 PM counts 0 working hours."""
        self.assertEqual(business_hours_between(manila(2026, 11, 26, 18), manila(2026, 11, 26, 20)), 0)

    def test_sla_due_time_skips_the_weekend(self):
        """TC-06: received Friday 4 PM with a 2-hour SLA is due Monday 9 AM."""
        self.assertEqual(add_business_hours(manila(2026, 11, 27, 16), 2), manila(2026, 11, 30, 9))


class RankingTests(SimpleTestCase):
    def test_slowest_offices_greatest_to_least(self):
        """TC-07: the Slowest Offices list is sorted from greatest to least % of SLA."""
        rows = [{'office': c, 'avg_sla_pct': p, 'avg_hours': 1, 'count': 5}
                for c, p in [('A', 40), ('B', 300), ('C', 90), ('D', 150), ('E', 60), ('F', 120)]]
        self.assertEqual([r['avg_sla_pct'] for r in _speed_rankings(rows)['top5_slowest']], [300, 150, 120])


# ---------------------------------------------------------------------------
# 2. The document workflow, through the API (test database)
# ---------------------------------------------------------------------------

class WorkflowTestBase(TestCase):
    """Three offices: BACX -> GSOX -> MTOX, with SLAs of 2, 12 and 24 hours."""

    def setUp(self):
        self.offices = {code: Office.objects.create(code=code, name=f'{code} Office')
                        for code in ('BACX', 'GSOX', 'MTOX')}
        self.doc_type = DocumentType.objects.create(name='Test Voucher', scope='internal', request_fields=[])
        for number, (code, hours) in enumerate([('BACX', 2), ('GSOX', 12), ('MTOX', 24)], start=1):
            WorkflowStep.objects.create(document_type=self.doc_type, step_number=number,
                                        office=self.offices[code], action_required='Process', max_hours_allowed=hours)
        self.bac = self.make_user('bac@test.ph', 'employee', 'BACX')
        self.gso = self.make_user('gso@test.ph', 'employee', 'GSOX')
        self.mto = self.make_user('mto@test.ph', 'employee', 'MTOX')
        self.admin = self.make_user('admin@test.ph', 'admin', None)

    def make_user(self, email, role, office):
        return User.objects.create_user(email=email, password=PASSWORD, first_name='Test',
                                        last_name=email.split('@')[0].title(), role=role, office=office)

    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def create_document(self, user=None):
        response = self.api(user or self.bac).post(
            '/api/documents/', {'document_type': self.doc_type.id, 'form_data': {}}, format='json')
        return response, (Document.objects.get(pk=response.data['id']) if response.status_code == 201 else None)

    def scan(self, user, document, action):
        return self.api(user).post('/api/documents/transfer/', {
            'qr_payload': build_qr_payload(document), 'action': action, 'notes': ''}, format='json')

    def refreshed(self, document):
        document.refresh_from_db()
        return document


class DocumentWorkflowTests(WorkflowTestBase):
    def test_only_step_one_office_can_create(self):
        """TC-08: an office that is not Step 1 of the workflow cannot create the request."""
        response, _ = self.create_document(self.gso)
        self.assertEqual(response.status_code, 400)

    def test_new_document_stays_at_origin_office(self):
        """TC-09: a new document is 'Processing at' the creating office, not sent automatically."""
        _, document = self.create_document()
        self.assertEqual(document.status, 'in_progress')
        self.assertEqual(document.current_office, 'BACX')

    def test_send_makes_it_incoming_for_next_office(self):
        """TC-10: 'Send to next office' makes the document In Transit to GSOX."""
        _, document = self.create_document()
        self.assertEqual(self.scan(self.bac, document, 'release').status_code, 200)
        document = self.refreshed(document)
        self.assertEqual(document.status, 'in_transit')
        self.assertEqual(document.incoming_office, 'GSOX')

    def test_wrong_office_cannot_receive(self):
        """TC-11: an office the document was not sent to cannot receive it."""
        _, document = self.create_document()
        self.scan(self.bac, document, 'release')
        self.assertEqual(self.scan(self.mto, document, 'receive').status_code, 400)

    def test_receive_moves_document_to_next_office(self):
        """TC-12: the destination office receives it and it is Processing there."""
        _, document = self.create_document()
        self.scan(self.bac, document, 'release')
        self.assertEqual(self.scan(self.gso, document, 'receive').status_code, 200)
        document = self.refreshed(document)
        self.assertEqual((document.status, document.current_office), ('in_progress', 'GSOX'))

    def test_last_office_completes_the_transaction(self):
        """TC-13: the last office's Complete Transaction finishes an internal document."""
        _, document = self.create_document()
        for user, action in [(self.bac, 'release'), (self.gso, 'receive'), (self.gso, 'release'), (self.mto, 'receive')]:
            self.scan(user, document, action)
        self.assertEqual(self.scan(self.mto, document, 'complete').status_code, 200)
        self.assertEqual(self.refreshed(document).status, 'released')

    def test_return_requires_a_reason(self):
        """TC-14: returning a document to the previous office requires a reason."""
        _, document = self.create_document()
        self.scan(self.bac, document, 'release')
        self.scan(self.gso, document, 'receive')
        response = self.api(self.gso).patch(f'/api/documents/{document.id}/scan/',
                                            {'action': 'return_to_office', 'notes': ''}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_forged_qr_code_is_rejected(self):
        """TC-15: a QR code with a tampered signature is rejected."""
        _, document = self.create_document()
        forged = build_qr_payload(document).replace('sig=', 'sig=0')
        response = self.api(self.bac).post('/api/documents/qr/scan/', {'payload': forged}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_time_credited_to_the_office_that_held_it(self):
        """TC-16: on receipt, the sending office is credited with its working hours."""
        _, document = self.create_document()
        Document.objects.filter(pk=document.pk).update(entered_current_office_at=timezone.now() - timedelta(days=3))
        self.scan(self.bac, document, 'release')
        self.scan(self.gso, document, 'receive')
        log = document.logs.filter(action='received').latest('id')
        self.assertEqual(log.duration_office.code, 'BACX')
        self.assertLessEqual(log.duration_at_office, timedelta(hours=24))  # 3 days = at most 24 working hours


# ---------------------------------------------------------------------------
# 3. Automated email alerts (time is fixed with mock so results never vary)
# ---------------------------------------------------------------------------

class EmailAlertTests(WorkflowTestBase):
    def run_scan_at(self, now):
        mail.outbox.clear()
        with mock.patch('apps.documents.sla_scan.timezone.now', return_value=now):
            run_overdue_scan()
        return mail.outbox

    def test_no_overdue_alert_before_sla_in_working_hours(self):
        """TC-17: Friday 4 PM -> Monday 8:30 AM is only 1.5 working hours of a 2-hour SLA: no alert."""
        _, document = self.create_document()
        Document.objects.filter(pk=document.pk).update(entered_current_office_at=manila(2026, 11, 20, 16))
        overdue = [m for m in self.run_scan_at(manila(2026, 11, 23, 8, 30)) if 'OVERDUE' in m.subject]
        self.assertEqual(overdue, [])

    def test_overdue_alert_when_sla_is_reached(self):
        """TC-18: at 2 working hours the office's staff get an [OVERDUE ALERT] email."""
        _, document = self.create_document()
        Document.objects.filter(pk=document.pk).update(entered_current_office_at=manila(2026, 11, 20, 16))
        emails = [m for m in self.run_scan_at(manila(2026, 11, 23, 9, 1)) if 'OVERDUE ALERT' in m.subject]
        self.assertEqual([m.to for m in emails], [['bac@test.ph']])
        self.assertEqual(emails[0].alternatives[0][1], 'text/html')  # branded HTML version included

    def test_pending_receipt_reminder_after_one_working_hour(self):
        """TC-19: a document not received after 1 working hour sends a reminder to the receiving office."""
        _, document = self.create_document()
        Document.objects.filter(pk=document.pk).update(entered_current_office_at=manila(2026, 11, 24, 8))
        self.scan(self.bac, document, 'release')
        DocumentLog.objects.filter(document=document, action='released').update(timestamp=manila(2026, 11, 24, 9))
        emails = [m for m in self.run_scan_at(manila(2026, 11, 24, 10, 30)) if 'PENDING RECEIPT' in m.subject]
        self.assertEqual([m.to for m in emails], [['gso@test.ph']])


# ---------------------------------------------------------------------------
# 4. Offline scanning
# ---------------------------------------------------------------------------

class OfflineSyncTests(WorkflowTestBase):
    def sync(self, user, items):
        return self.api(user).post('/api/documents/offline-sync/', {'actions': items}, format='json')

    def item(self, document, action, client_id=None):
        return {'client_id': client_id or str(uuid.uuid4()), 'qr_payload': build_qr_payload(document),
                'action': action, 'notes': '', 'scanned_at': timezone.now().isoformat()}

    def test_offline_scan_is_applied_on_sync(self):
        """TC-20: a scan queued offline is applied when the device syncs."""
        _, document = self.create_document()
        response = self.sync(self.bac, [self.item(document, 'release')])
        self.assertEqual(response.data['results'][0]['outcome'], 'applied')
        self.assertEqual(self.refreshed(document).status, 'in_transit')

    def test_resent_offline_scan_is_not_applied_twice(self):
        """TC-21: the same offline scan sent twice is applied only once."""
        _, document = self.create_document()
        scan = self.item(document, 'release')
        self.sync(self.bac, [scan])
        logs = document.logs.count()
        response = self.sync(self.bac, [scan])
        self.assertTrue(response.data['results'][0]['duplicate'])
        self.assertEqual(document.logs.count(), logs)


# ---------------------------------------------------------------------------
# 5. Administration and feedback
# ---------------------------------------------------------------------------

class DeleteByNameTests(WorkflowTestBase):
    def test_wrong_name_is_refused(self):
        """TC-22: deleting an office with a wrong name is refused and nothing is deleted."""
        office = Office.objects.create(code='FBO', name='Finance & Budget Office')
        response = self.api(self.admin).delete(f'/api/offices/{office.id}/', {'confirm_name': 'Finance'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Office.objects.filter(pk=office.pk).exists())

    def test_exact_name_deletes(self):
        """TC-23: typing the exact name deletes the office."""
        office = Office.objects.create(code='FBO', name='Finance & Budget Office')
        response = self.api(self.admin).delete(
            f'/api/offices/{office.id}/', {'confirm_name': 'Finance & Budget Office'}, format='json')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Office.objects.filter(pk=office.pk).exists())


class AccessLogTests(WorkflowTestBase):
    def test_failed_logins_hidden_from_main_view_but_kept(self):
        """TC-24: failed logins are left out of the main Access Logs view but listed under their filter."""
        AccessLog.objects.create(action='login_failed', ip_address='127.0.0.1', attempted_email='x@test.ph')
        AccessLog.objects.create(user=self.bac, action='login', ip_address='127.0.0.1')
        main = self.api(self.admin).get('/api/accounts/access-logs/').data['results']
        failed = self.api(self.admin).get('/api/accounts/access-logs/?action=login_failed').data['results']
        self.assertNotIn('login_failed', [row['action'] for row in main])
        self.assertEqual([row['action'] for row in failed], ['login_failed'])


class HalfStarRatingTests(TestCase):
    def setUp(self):
        self.survey = Survey.objects.create(title='Overall Experience')
        self.question = SurveyQuestion.objects.create(survey=self.survey, text='Overall rating',
                                                      question_type='rating', order=1)

    def test_half_star_is_accepted(self):
        """TC-25: a 4.5-star rating is accepted."""
        answers, error = _parse_survey_answers(self.survey, [{'question': self.question.id, 'rating_value': 4.5}])
        self.assertIsNone(error)
        self.assertEqual(answers[0][1]['rating_value'], 4.5)

    def test_invalid_rating_is_refused(self):
        """TC-26: ratings that are not half steps from 0.5 to 5 (e.g. 3.3, 6) are refused."""
        for bad in (3.3, 6):
            _, error = _parse_survey_answers(self.survey, [{'question': self.question.id, 'rating_value': bad}])
            self.assertIsNotNone(error)
