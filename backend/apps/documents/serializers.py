from urllib.parse import urlparse

from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework import serializers
from .models import (
    DocumentType, WorkflowStep, Office, Document, DocumentLog, MissingDocumentAlert,
    Survey, SurveyQuestion, SurveyQuestionOption, SurveyAnswer, SurveyResponse,
    CitizenSuggestion, RequestStatusHistory,
    EmailNotificationLog, Announcement, Event,
    Notification,
)
from .services import EMPLOYEE_ID_RE, can_originate, originating_office, resolve_office, release_document
from .qr_services import generate_qr_code
from .sla_scan import DUE_SOON_THRESHOLD_RATIO
from .validators import number_field_error
from .images import NEWS_IMAGE_SIZE, prepare_image
from .storage import database_storage
from apps.accounts.validators import CONTACT_NUMBER_ERROR, is_valid_contact_number


def format_duration(delta):
    """Shared by DocumentLogSerializer and DocumentSerializer — e.g. '2h 30m' / '45m'."""
    if not delta:
        return None
    total_seconds = int(delta.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"

class ActorSerializer(serializers.Serializer):
    """
    Nested serializer used wherever we show WHO acted on a document.
    Surfaces unique id + employee_id + position + office, not just a name,
    so accountability is traceable to a specific person and role —
    employee_id (e.g. 'EMP-2026-0012') is the identifier that must appear
    on every history/audit log entry per the audit-trail requirement.
    """
    id = serializers.IntegerField()
    employee_id = serializers.CharField(allow_null=True)
    full_name = serializers.CharField()
    role = serializers.CharField()
    office = serializers.CharField(allow_null=True)
    position = serializers.CharField(allow_null=True)


class OfficeSerializer(serializers.ModelSerializer):
    """
    The municipal office catalog. Nested wherever a step/log references an
    office, rather than duplicating name/location as a frozen string — so
    renaming an office or moving its location shows up everywhere instantly.
    """
    class Meta:
        model = Office
        fields = ['id', 'name', 'code', 'location', 'floor', 'contact_person', 'office_hours', 'is_active', 'created_at']
        read_only_fields = ['created_at']


class PublicOfficeSerializer(serializers.ModelSerializer):
    """
    Narrowed office listing for the anonymous Landing page's "Municipal
    Information" / directory section — active offices only (view filters),
    real data already on file (name/floor/hours/contact person), nothing
    fabricated. Excludes `code` (an internal routing identifier, not
    meaningful to a citizen) that OfficeSerializer exposes to staff.
    """
    class Meta:
        model = Office
        fields = ['id', 'name', 'location', 'floor', 'contact_person', 'office_hours']


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ['id', 'title', 'summary', 'body', 'image', 'published_at']


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = ['id', 'title', 'description', 'image', 'location', 'start_date', 'end_date']


def _save_with_image(instance, validated_data, save):
    """
    Shared by the admin news/event serializers: `remove_image` clears the
    picture, a new upload replaces it, and either way the old file is
    deleted from storage once the record is saved.
    """
    old_name = instance.image.name if instance and instance.image else ''
    if validated_data.pop('remove_image', False) and 'image' not in validated_data:
        validated_data['image'] = None
    instance = save(validated_data)
    new_name = instance.image.name if instance.image else ''
    if old_name and old_name != new_name:
        database_storage.delete(old_name)
    return instance


class AnnouncementAdminSerializer(serializers.ModelSerializer):
    """
    The admin's News & Events page. Pictures arrive as multipart uploads and
    are checked and resized by images.prepare_image(); `status` says whether
    the landing page shows the post yet.
    """
    image = serializers.ImageField(required=False, allow_null=True)
    remove_image = serializers.BooleanField(write_only=True, required=False)
    # Explicit default: a multipart form that leaves a checkbox out would
    # otherwise read as False and post the item straight into the archive.
    is_active = serializers.BooleanField(required=False, default=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = ['id', 'title', 'summary', 'body', 'image', 'remove_image', 'is_active', 'published_at', 'created_at', 'status']
        read_only_fields = ['created_at']

    def validate_title(self, value):
        if not value.strip():
            raise serializers.ValidationError('Please enter a title.')
        return value.strip()

    def validate_image(self, value):
        return prepare_image(value, NEWS_IMAGE_SIZE) if value else value

    def get_status(self, obj):
        if not obj.is_active:
            return 'archived'
        return 'scheduled' if obj.published_at > timezone.now() else 'published'

    def create(self, validated_data):
        validated_data.pop('remove_image', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        return _save_with_image(instance, validated_data, lambda data: super(AnnouncementAdminSerializer, self).update(instance, data))


class EventAdminSerializer(serializers.ModelSerializer):
    """Same as AnnouncementAdminSerializer, for events; `status` follows the event's dates."""
    image = serializers.ImageField(required=False, allow_null=True)
    remove_image = serializers.BooleanField(write_only=True, required=False)
    # Explicit default: a multipart form that leaves a checkbox out would
    # otherwise read as False and post the item straight into the archive.
    is_active = serializers.BooleanField(required=False, default=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = ['id', 'title', 'description', 'image', 'remove_image', 'location', 'start_date', 'end_date',
                  'is_active', 'created_at', 'status']
        read_only_fields = ['created_at']

    def validate_title(self, value):
        if not value.strip():
            raise serializers.ValidationError('Please enter a title.')
        return value.strip()

    def validate_image(self, value):
        return prepare_image(value, NEWS_IMAGE_SIZE) if value else value

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'The end date cannot be before the start date.'})
        return attrs

    def get_status(self, obj):
        if not obj.is_active:
            return 'archived'
        today = timezone.localdate()
        if (obj.end_date or obj.start_date) < today:
            return 'past'
        return 'ongoing' if obj.start_date <= today else 'upcoming'

    def create(self, validated_data):
        validated_data.pop('remove_image', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        return _save_with_image(instance, validated_data, lambda data: super(EventAdminSerializer, self).update(instance, data))


class WorkflowStepSerializer(serializers.ModelSerializer):
    office = OfficeSerializer(read_only=True)

    class Meta:
        model = WorkflowStep
        fields = ['id', 'step_number', 'office', 'action_required', 'max_hours_allowed']


class DocumentTypeSerializer(serializers.ModelSerializer):
    """
    Full read representation — includes the admin-authored step list, not
    just the derived `route`. Used everywhere document types are listed or
    fetched for editing (Workflow Builder, document-creation dropdowns).
    """
    steps = WorkflowStepSerializer(many=True, read_only=True)
    scope_label = serializers.CharField(source='get_scope_display', read_only=True)
    requests_today = serializers.SerializerMethodField()
    origin_office = serializers.SerializerMethodField()
    can_create = serializers.SerializerMethodField()

    class Meta:
        model = DocumentType
        fields = [
            'id', 'name', 'description', 'scope', 'scope_label', 'route', 'is_active', 'created_at', 'steps',
            'daily_limit', 'requests_today', 'request_fields', 'origin_office', 'can_create',
        ]
        read_only_fields = ['route', 'created_at']

    def get_origin_office(self, obj):
        office = originating_office(obj)
        return {'code': office.code, 'name': office.name} if office else None

    def get_can_create(self, obj):
        # Whether the requesting user may start a request of this type, so the
        # creation forms only offer what CreateDocumentSerializer will accept.
        request = self.context.get('request')
        return bool(request and request.user.is_authenticated and can_originate(request.user, obj))

    def get_requests_today(self, obj):
        # How many requests this type has already received today — paired
        # with daily_limit on the frontend so a requester can see remaining
        # capacity before submitting, not just get a rejection after.
        today = timezone.localdate()
        return obj.documents.filter(created_at__date=today).count()


class PublicDocumentTypeSerializer(serializers.ModelSerializer):
    """
    Narrowed, anonymous-safe listing for the Landing page's "Documents We
    Process" informational list — just name/description, active EXTERNAL
    (citizen-facing) types only (view filters). No workflow/step/template
    internals, unlike DocumentTypeSerializer above (staff/admin-only).
    """
    class Meta:
        model = DocumentType
        fields = ['id', 'name', 'description']


class DocumentTypeWriteSerializer(serializers.ModelSerializer):
    """
    Used to create/rename a DocumentType itself. Deliberately excludes
    `route` (derived) and `steps` (defined separately via
    PUT /api/documents/types/<id>/steps/, one atomic operation per save).
    `scope` is required — the admin must explicitly choose INTERNAL or
    EXTERNAL rather than silently inheriting the model's default.
    """
    scope = serializers.ChoiceField(choices=DocumentType.Scope.choices)
    daily_limit = serializers.IntegerField(min_value=1, required=False, allow_null=True)

    class Meta:
        model = DocumentType
        fields = ['id', 'name', 'description', 'scope', 'is_active', 'daily_limit', 'request_fields']


class WorkflowStepInputSerializer(serializers.Serializer):
    step_number = serializers.IntegerField(min_value=1)
    # Restricted to active offices — this is what makes the Workflow
    # Builder's office dropdown "dynamic": only real, currently-active
    # Office rows can be assigned to a step.
    office = serializers.PrimaryKeyRelatedField(queryset=Office.objects.filter(is_active=True))
    action_required = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    max_hours_allowed = serializers.IntegerField(min_value=1)


class WorkflowStepsReplaceSerializer(serializers.Serializer):
    """
    Input for PUT /api/documents/types/<id>/steps/ — the full ordered step
    list for a document type, replacing whatever was there before in one
    atomic save (see DocumentTypeStepsView).
    """
    steps = WorkflowStepInputSerializer(many=True)

    def validate_steps(self, steps):
        if not steps:
            raise serializers.ValidationError("At least one step is required.")

        numbers = sorted(s['step_number'] for s in steps)
        expected = list(range(1, len(steps) + 1))
        if numbers != expected:
            raise serializers.ValidationError(
                f"step_number values must be sequential starting at 1, with no gaps or "
                f"duplicates (got {numbers}, expected {expected})."
            )

        return steps


class DocumentLogSerializer(serializers.ModelSerializer):
    sender = ActorSerializer(read_only=True, allow_null=True)
    acted_by = ActorSerializer(read_only=True)
    office = OfficeSerializer(read_only=True, allow_null=True)
    duration_display = serializers.SerializerMethodField()

    class Meta:
        model = DocumentLog
        fields = [
            'id', 'action', 'office', 'sender', 'acted_by', 'qr_verified',
            'notes', 'timestamp', 'duration_display',
        ]

    def get_duration_display(self, obj):
        return format_duration(obj.duration_at_office)


class OfficeHistorySerializer(serializers.ModelSerializer):
    """
    One document as seen from one office (context['office']): each spell it
    spent in that office's custody — when it arrived, who took it in, and
    when and how it left. A document returned to the office has several.
    """
    ARRIVALS = {
        DocumentLog.Action.CREATED: 'Created here',
        DocumentLog.Action.RECEIVED: 'Received',
        DocumentLog.Action.RETURNED: 'Received (final step)',
        DocumentLog.Action.RETURN_RECEIVED: 'Received back',
        DocumentLog.Action.CITIZEN_RETURN_INITIATED: 'Returned by requester for correction',
    }
    DEPARTURES = {
        DocumentLog.Action.RELEASED: 'Forwarded',
        DocumentLog.Action.RETURN_INITIATED: 'Returned to previous office',
        DocumentLog.Action.RELEASED_TO_CITIZEN: 'Released to requester',
        DocumentLog.Action.RELEASED_TO_ORIGIN: 'Released to originating office',
    }

    document_type_name = serializers.CharField(source='document_type.name', read_only=True)
    status_label = serializers.CharField(source='status_display', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    visits = serializers.SerializerMethodField()
    in_custody = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'tracking_number', 'document_type_name', 'requested_by_name', 'status', 'status_label',
            'current_office', 'visits', 'in_custody',
        ]

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.full_name
        return obj.guest_name or 'Walk-in / Unregistered'

    @staticmethod
    def _actor(log):
        if not log.acted_by:
            return None
        user = log.acted_by
        return f"{user.full_name} ({user.employee_id})" if user.employee_id else user.full_name

    def get_visits(self, obj):
        office = self.context['office']
        visits = []
        for log in obj.logs.all():  # prefetched, oldest first
            if log.office_id != office.pk:
                continue
            if log.action in self.ARRIVALS:
                visits.append({
                    'arrived_at': log.timestamp, 'arrival': self.ARRIVALS[log.action],
                    'received_by': self._actor(log), 'qr_verified': log.qr_verified,
                    'left_at': None, 'departure': None, 'left_by': None, 'hours_in_office': None,
                })
            elif log.action in self.DEPARTURES and visits and visits[-1]['left_at'] is None:
                visit = visits[-1]
                visit.update(left_at=log.timestamp, departure=self.DEPARTURES[log.action], left_by=self._actor(log))
        now = timezone.now()
        for visit in visits:
            end = visit['left_at'] or now
            visit['hours_in_office'] = round((end - visit['arrived_at']).total_seconds() / 3600, 1)
        return visits

    def get_in_custody(self, obj):
        office = self.context['office']
        return obj.current_office == office.code and obj.status in (
            *Document.ACTIONABLE_STATUSES, Document.Status.COMPLETED, Document.Status.MISSING,
        )


class DocumentSerializer(serializers.ModelSerializer):
    """
    Used for listing/retrieving documents. Shows CURRENT state at a glance —
    status, current office (derived from route), current handler with their
    unique id/position — without needing to open the history log.
    """
    current_handler = ActorSerializer(read_only=True)
    current_office = serializers.CharField(read_only=True)
    current_office_detail = serializers.SerializerMethodField()
    document_type_name = serializers.CharField(source='document_type.name', read_only=True)
    document_type_scope = serializers.CharField(source='document_type.scope', read_only=True)
    # The admin-authored step list (office, action, SLA per step) — the
    # routing checklist printed on PrintableDocumentForm, not just the flat
    # `route` list the execution engine runs on.
    document_type_steps = WorkflowStepSerializer(source='document_type.steps', many=True, read_only=True)
    route = serializers.ListField(source='document_type.route', read_only=True)
    current_step_number = serializers.IntegerField(read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()
    processing_stage_label = serializers.CharField(source='get_processing_stage_display', read_only=True)
    dwell_display = serializers.SerializerMethodField()
    step_statuses = serializers.SerializerMethodField()
    released_at = serializers.SerializerMethodField()
    released_by_name = serializers.SerializerMethodField()
    was_returned = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'tracking_number', 'document_type', 'document_type_name', 'document_type_scope',
            'document_type_steps', 'route',
            'form_data', 'requested_by', 'requested_by_name', 'guest_name', 'guest_email', 'origin_office',
            'route_position', 'current_step_number', 'current_office', 'current_office_detail',
            'status', 'status_label', 'is_returning', 'return_target_office', 'was_returned', 'processing_stage', 'processing_stage_label',
            'step_statuses', 'current_handler',
            'created_at', 'updated_at', 'entered_current_office_at', 'dwell_display', 'qr_code',
            'released_at', 'released_by_name',
        ]

    def _released_log(self, obj):
        # obj.logs is ordered by timestamp (Meta.ordering on DocumentLog) —
        # last() gets the most recent release in case of a return-then-
        # re-release cycle, not just the first one ever.
        return obj.logs.filter(
            action__in=[DocumentLog.Action.RELEASED_TO_CITIZEN, DocumentLog.Action.RELEASED_TO_ORIGIN]
        ).order_by('-timestamp').first()

    def get_released_at(self, obj):
        log = self._released_log(obj)
        return log.timestamp if log else None

    def get_released_by_name(self, obj):
        log = self._released_log(obj)
        return log.acted_by.full_name if log and log.acted_by else None

    def get_was_returned(self, obj):
        return obj.logs.filter(action__in=[
            DocumentLog.Action.RETURN_INITIATED,
            DocumentLog.Action.RETURN_RECEIVED,
            DocumentLog.Action.CITIZEN_RETURN_INITIATED,
        ]).exists()

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.full_name
        return obj.guest_name or obj.form_data.get('applicant_name') or 'Walk-in / Unregistered'

    def get_current_office_detail(self, obj):
        # Live lookup against the Office catalog — never a frozen snapshot —
        # so an admin editing an office's location/contact updates every
        # document currently sitting there without any backfill needed.
        office = resolve_office(obj.current_office)
        return OfficeSerializer(office).data if office else None

    def get_status_label(self, obj):
        if obj.status == 'in_progress':
            return f"At {obj.current_office}"
        if obj.status == 'returned':
            return f"Returned to {obj.current_office}"
        if obj.status == 'in_transit':
            route = obj.document_type.route
            if obj.is_returning:
                return f"Being Returned to {obj.return_target_office}"
            next_office = route[obj.route_position + 1] if obj.route_position + 1 < len(route) else obj.current_office
            return f"In Transit to {next_office}"
        if obj.status == 'completed':
            return f"Ready at {obj.origin_office}"
        if obj.status == 'released':
            return obj.status_display
        return obj.get_status_display()

    def get_dwell_display(self, obj):
        # Live — how long the document has sat at its CURRENT office, not a
        # frozen snapshot. Meaningless once the document is fully done.
        if obj.status in (Document.Status.RELEASED, Document.Status.COMPLETED):
            return None
        return format_duration(timezone.now() - obj.entered_current_office_at)

    def get_step_statuses(self, obj):
        """
        One status per WorkflowStep, driving the color-coded progress pill:
        'completed' (green), 'active' (green — on track), 'near_due' (yellow
        — past DUE_SOON_THRESHOLD_RATIO of this step's own SLA but not over
        it yet), 'delayed' (red — over this step's SLA), or 'pending' (gray).
        A MISSING document always shows its current step as delayed
        regardless of the SLA math, since it's already been formally
        flagged.
        """
        steps = list(obj.document_type.steps.all())  # Meta.ordering = ['step_number']
        statuses = []
        for idx, step in enumerate(steps):
            if obj.status in (Document.Status.COMPLETED, Document.Status.RELEASED):
                statuses.append('completed')
            elif idx < obj.route_position:
                statuses.append('completed')
            elif idx > obj.route_position:
                statuses.append('pending')
            else:  # idx == obj.route_position — the document's current step
                if obj.status == Document.Status.MISSING:
                    statuses.append('delayed')
                elif obj.status == Document.Status.IN_TRANSIT:
                    # Already released toward the next office — dwell time
                    # here no longer reflects this step's own SLA.
                    statuses.append('active')
                else:
                    dwell_hours = (timezone.now() - obj.entered_current_office_at).total_seconds() / 3600
                    if dwell_hours > step.max_hours_allowed:
                        statuses.append('delayed')
                    elif dwell_hours >= step.max_hours_allowed * DUE_SOON_THRESHOLD_RATIO:
                        statuses.append('near_due')
                    else:
                        statuses.append('active')
        return statuses


class DocumentDetailSerializer(DocumentSerializer):
    """
    Used for the single-document view — includes the FULL history log.
    """
    logs = DocumentLogSerializer(many=True, read_only=True)
    stage_history = serializers.SerializerMethodField()

    class Meta(DocumentSerializer.Meta):
        fields = DocumentSerializer.Meta.fields + ['logs', 'stage_history']

    def get_stage_history(self, obj):
        # SerializerMethodField (not a direct nested serializer field) only
        # because RequestStatusHistorySerializer is declared further down
        # this file — resolved fine at call time either way.
        return RequestStatusHistorySerializer(obj.stage_history.all(), many=True).data


class RequestStatusHistorySerializer(serializers.ModelSerializer):
    stage_label = serializers.CharField(source='get_stage_display', read_only=True)

    class Meta:
        model = RequestStatusHistory
        fields = ['stage', 'stage_label', 'timestamp']


class PublicDocumentLogSerializer(serializers.ModelSerializer):
    """
    A single physical hand-off (DocumentLog row), narrowed to exactly what's
    safe to show an anonymous guest tracking by number: the office's public
    name/floor and the acting staff member's full name only — never
    employee_id, position, role, sender, or qr_verified (those stay
    staff-only, see DocumentLogSerializer). `staff_name` is None for the
    rare system-generated entry with no acting user, same as the staff view
    falls back to "System" for.
    """
    action_label = serializers.CharField(source='get_action_display', read_only=True)
    office_name = serializers.CharField(source='office.name', read_only=True, default=None)
    office_code = serializers.CharField(source='office.code', read_only=True, default=None)
    office_floor = serializers.CharField(source='office.floor', read_only=True, default=None)
    staff_name = serializers.SerializerMethodField()
    notes = serializers.SerializerMethodField()

    class Meta:
        model = DocumentLog
        fields = ['action', 'action_label', 'office_name', 'office_code', 'office_floor', 'staff_name', 'notes', 'timestamp']

    def get_staff_name(self, obj):
        return obj.acted_by.full_name if obj.acted_by else None

    def get_notes(self, obj):
        # QRTransferConfirmModal.jsx auto-fills notes like "Released via QR
        # scan by Rosa Garcia (EMP-2026-0007)." — exactly right for the
        # staff-facing audit trail (DocumentLogSerializer), but the
        # Employee ID inside it must not reach an anonymous guest here.
        if not obj.notes:
            return obj.notes
        return EMPLOYEE_ID_RE.sub('', obj.notes).strip()


class PublicDocumentTrackingSerializer(serializers.ModelSerializer):
    """
    What an unauthenticated guest (or a citizen tracking by number) sees on
    the public Track page. Deliberately excludes everything
    DocumentDetailSerializer exposes that isn't safe for anyone who merely
    knows/guesses a tracking number: `form_data` (may contain address/
    contact/business details typed at request time) and requested-by
    identity. `stage_history` (from RequestStatusHistory) is the narrative
    processing-stage timeline; `activity_log` and `current_location` below
    are the physical where-is-it-right-now view — office, floor, and the
    handling staff member's name only (via PublicDocumentLogSerializer),
    not the full staff-facing DocumentLogSerializer detail.
    """
    document_type_name = serializers.CharField(source='document_type.name', read_only=True)
    status_label = serializers.SerializerMethodField()
    processing_stage_label = serializers.CharField(source='get_processing_stage_display', read_only=True)
    current_step_number = serializers.IntegerField(read_only=True)
    total_steps = serializers.SerializerMethodField()
    stage_history = RequestStatusHistorySerializer(many=True, read_only=True)
    activity_log = PublicDocumentLogSerializer(source='logs', many=True, read_only=True)
    current_location = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'tracking_number', 'document_type_name', 'status_label',
            'processing_stage', 'processing_stage_label', 'is_returning',
            'current_office', 'current_step_number', 'total_steps',
            'created_at', 'stage_history', 'activity_log', 'current_location',
        ]

    def get_current_location(self, obj):
        office = resolve_office(obj.current_office)
        return {
            'office_name': office.name if office else obj.current_office,
            'office_code': office.code if office else None,
            'office_floor': office.floor if office else None,
            'handled_by': obj.current_handler.full_name if obj.current_handler else None,
        }

    def get_status_label(self, obj):
        if obj.status == 'in_progress':
            return f"At {obj.current_office}"
        if obj.status == 'returned':
            return f"Returned to {obj.current_office}"
        if obj.status == 'in_transit':
            route = obj.document_type.route
            if obj.is_returning:
                return f"Being Returned to {obj.return_target_office}"
            next_office = route[obj.route_position + 1] if obj.route_position + 1 < len(route) else obj.current_office
            return f"In Transit to {next_office}"
        if obj.status == 'completed':
            return f"Ready at {obj.origin_office}"
        if obj.status == 'released':
            return obj.status_display
        return obj.get_status_display()

    def get_total_steps(self, obj):
        return len(obj.document_type.route)


class CreateDocumentSerializer(serializers.ModelSerializer):
    """
    Used when the origin office (e.g. BPLO) creates a new document entry —
    the very first step in the workflow. Automatically creates the first
    DocumentLog entry and generates the document's tracking number.
    """

    class Meta:
        model = Document
        fields = ['document_type', 'form_data', 'requested_by', 'guest_name', 'guest_email']

    def validate_requested_by(self, value):
        # Optional (a walk-in citizen with no account stays unlinked, tracked
        # only by tracking number) but if an account IS selected, it must
        # actually be a citizen account — not another staff/admin id.
        if value is not None and value.role != 'citizen':
            raise serializers.ValidationError("The selected account is not a citizen account.")
        return value

    def validate_document_type(self, value):
        # `route` is a CACHE of the live WorkflowStep rows, only refreshed
        # when an admin re-saves the step list via the Workflow Builder
        # (DocumentType.sync_route_from_steps()). It has no FK integrity to
        # Office at all, so if an office gets renamed/replaced (its old row
        # deleted, a new one created under a different code) and the steps
        # referencing it aren't rebuilt through the Workflow Builder, `route`
        # silently keeps holding the dead office code forever — every new
        # document for that type would then be born pointing at an office
        # that no longer exists. Re-sync here, right before it's relied on,
        # so `route` can never be stale at the moment a document is created.
        live_route = list(value.steps.order_by('step_number').values_list('office__code', flat=True))
        if live_route != value.route:
            value.route = live_route
            value.save(update_fields=['route'])

        # A DocumentType with no WorkflowStep rows yet has no route at
        # all — Document.save() can't resolve a current_office for it and
        # would crash. Checked against `steps` directly (not `route`,
        # which — pre-resync above — could be non-empty yet stale) so this
        # can't be fooled by a leftover cached value with nothing behind it.
        if not value.steps.exists():
            raise serializers.ValidationError(
                f"'{value.name}' has no workflow steps configured yet. "
                f"An admin must build its workflow before it can be requested."
            )

        # No-bypass rule: a request may only be started by its Step 1 office.
        if not can_originate(self.context['request'].user, value):
            raise serializers.ValidationError(
                f"Only the originating office ({originating_office(value).name}) can create "
                f"{value.name} requests."
            )

        # Daily submission cap, configured per type by an admin to manage
        # office workload — counted against today's date at creation time,
        # not a rolling 24h window.
        if value.daily_limit is not None:
            today = timezone.localdate()
            requests_today = value.documents.filter(created_at__date=today).count()
            if requests_today >= value.daily_limit:
                raise serializers.ValidationError(
                    f"'{value.name}' has reached its daily limit of {value.daily_limit} requests. "
                    f"Please try again tomorrow."
                )

        return value

    def validate(self, attrs):
        # guest_name/guest_email only ever mean anything for a walk-in with
        # no linked account — a registered citizen's own account name/email
        # are always used instead (see
        # notifications.py::_resolve_citizen_recipient()/
        # _requester_display_name()). Dropped here rather than left
        # stored-but-unused, so they never silently disagree with the
        # account's own values for this request.
        document_type = attrs.get('document_type')
        if document_type and document_type.scope == DocumentType.Scope.INTERNAL:
            # Internal documents belong to an office, never to a citizen.
            if attrs.get('requested_by') is not None:
                raise serializers.ValidationError(
                    {'requested_by': "Internal documents can't be linked to a citizen account."}
                )
            user = self.context['request'].user
            attrs['guest_name'] = user.full_name
            attrs['guest_email'] = user.email
        elif attrs.get('requested_by') is not None:
            attrs['guest_name'] = ''
            attrs['guest_email'] = ''
        else:
            # No account linked — the requesting citizen's name and email
            # must be captured directly, or there is nowhere for the
            # "Document Ready for Release" email to go and no real name for
            # its greeting (previously silently fell back to "Dear N/A,").
            if not (attrs.get('guest_name') or '').strip():
                raise serializers.ValidationError(
                    {'guest_name': "Please enter the requesting citizen's name."}
                )
            if not (attrs.get('guest_email') or '').strip():
                raise serializers.ValidationError(
                    {'guest_email': "Please enter the requesting citizen's email address."}
                )

        # Server-side enforcement of DocumentType.request_fields — the
        # per-type field schema the request-creation forms render from.
        # Catches a required field left empty by a client that bypasses the
        # form's own HTML5 validation (or a raw API call), with a message
        # naming exactly which field(s) are missing.
        document_type = attrs.get('document_type')
        form_data = attrs.get('form_data') or {}
        if document_type:
            missing_labels = [
                field.get('label', field.get('key'))
                for field in (document_type.request_fields or [])
                if field.get('required') and not str(form_data.get(field.get('key'), '')).strip()
            ]
            if missing_labels:
                raise serializers.ValidationError(
                    f"Please fill in: {', '.join(missing_labels)}."
                )

            # Contact numbers live in form_data rather than a model field:
            # any request field of type 'tel', or `contact_no` for a type with
            # no schema (the generic form DocumentRequestFields.jsx falls back
            # to). Blank is left to the required check above.
            request_fields = document_type.request_fields or []
            contact_keys = (
                [field.get('key') for field in request_fields if field.get('type') == 'tel']
                if request_fields else ['contact_no']
            )
            for key in contact_keys:
                value = form_data.get(key)
                if value in (None, ''):
                    continue
                try:
                    self.validate_contact_number(value)
                except serializers.ValidationError as exc:
                    raise serializers.ValidationError({key: exc.detail})

            # Quantities, amounts and areas: every 'number' field must be > 0
            # (and a whole number if marked `integer`). The fallback form's
            # only number field is `number_of_copies`.
            number_fields = (
                [field for field in request_fields if field.get('type') == 'number']
                if request_fields else [{'key': 'number_of_copies', 'label': 'Number of Copies', 'integer': True}]
            )
            number_errors = {}
            for field in number_fields:
                value = form_data.get(field.get('key'))
                if value in (None, ''):
                    continue
                message = number_field_error(field, value)
                if message:
                    number_errors[field.get('key')] = [message]
            if number_errors:
                raise serializers.ValidationError(number_errors)
        return attrs

    def validate_contact_number(self, value):
        if not is_valid_contact_number(value):
            raise serializers.ValidationError(CONTACT_NUMBER_ERROR)
        return value

    def create(self, validated_data):
        request = self.context['request']
        document = Document.objects.create(
            **validated_data,
            # request.user.office is a nullable CharField (e.g. an admin
            # account with no office set) — Document.origin_office is NOT
            # NULL, so a bare None here would raise IntegrityError and abort
            # the whole request with no useful error surfaced to the user.
            origin_office=request.user.office or '',
            status=Document.Status.IN_PROGRESS,
            route_position=0,
            current_handler=request.user,
        )
        DocumentLog.objects.create(
            document=document,
            action=DocumentLog.Action.CREATED,
            office=resolve_office(document.current_office),
            acted_by=request.user,
            notes='Document created and entered into workflow.',
        )
        generate_qr_code(document)

        # Auto-forward: if the creator IS staff at the document's own
        # origin office, immediately release it toward Step 2 instead of
        # requiring a separate manual "Release" click/QR scan right after
        # creation — Step 1's dwell time reads as completed instantly, and
        # the audit trail shows it was auto-forwarded rather than scanned.
        # Every office AFTER this one still has to perform its own receive
        # action to confirm physical arrival — this only automates the
        # first hand-off. validate_document_type() already guarantees the
        # creator belongs to the origin office; a release that still fails
        # just leaves the document at origin for the ordinary manual flow.
        route = document.document_type.route
        if len(route) > 1:
            next_office = resolve_office(route[1])
            next_office_name = next_office.name if next_office else route[1]
            try:
                document = release_document(
                    document, request.user,
                    notes=(
                        f"Document created and auto-forwarded to {next_office_name} by "
                        f"{request.user.full_name} ({request.user.employee_id or request.user.email})."
                    ),
                )
            except serializers.ValidationError:
                pass

        return document


class MissingDocumentAlertSerializer(serializers.ModelSerializer):
    """
    Used by GET /api/alerts/ — the admin dashboard's flagged-documents feed.
    Surfaces enough about the underlying document to render a useful row
    without a second lookup per alert.
    """
    tracking_number = serializers.CharField(source='document.tracking_number', read_only=True)
    document_type_name = serializers.CharField(source='document.document_type.name', read_only=True)
    current_office = serializers.CharField(source='document.current_office', read_only=True)
    resolved_by = ActorSerializer(read_only=True, allow_null=True)
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)

    class Meta:
        model = MissingDocumentAlert
        fields = [
            'id', 'document', 'tracking_number', 'document_type_name', 'current_office',
            'kind', 'kind_label', 'days_delayed', 'status', 'raised_at', 'resolved_at', 'resolved_by', 'notes',
        ]


class EmailNotificationLogSerializer(serializers.ModelSerializer):
    """Powers the admin Email Notifications audit-trail page."""
    document_tracking_number = serializers.CharField(source='document.tracking_number', read_only=True, default=None)
    notification_type_label = serializers.CharField(source='get_notification_type_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = EmailNotificationLog
        fields = [
            'id', 'document', 'document_tracking_number', 'recipient_email',
            'notification_type', 'notification_type_label', 'subject',
            'status', 'status_label', 'error_message', 'sent_at',
        ]


class DocumentTransferSerializer(serializers.Serializer):
    """
    Input for POST /api/documents/transfer/ — a raw decoded QR payload plus
    the intent the scanning staff selected: "release" (send out to the next
    office), "receive" (confirm arrival), or "return" (hand a completed
    document back to the citizen).
    """
    qr_payload = serializers.CharField()
    action = serializers.ChoiceField(choices=['release', 'receive', 'return'], default='receive')
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def get_tracking_number(self):
        # The QR encodes either "http://<host>/track/QRT-XXXX" or a raw
        # "QRT-XXXX" — pull the last path segment either way.
        raw = self.validated_data['qr_payload'].strip()
        path = urlparse(raw).path or raw
        return path.rstrip('/').rsplit('/', 1)[-1]


class SurveyQuestionOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurveyQuestionOption
        fields = ['id', 'order', 'label']


class SurveyQuestionSerializer(serializers.ModelSerializer):
    options = SurveyQuestionOptionSerializer(many=True, read_only=True)

    class Meta:
        model = SurveyQuestion
        fields = ['id', 'order', 'text', 'question_type', 'options']


class SurveySerializer(serializers.ModelSerializer):
    """
    Admin read representation — the ordered question list plus response
    stats, for the Survey Manager. Respondents get RespondentSurveySerializer
    below instead, which leaves the stats and publishing state out.
    """
    questions = SurveyQuestionSerializer(many=True, read_only=True)
    response_count = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()

    class Meta:
        model = Survey
        fields = [
            'id', 'title', 'description', 'is_active', 'created_at',
            'questions', 'response_count', 'average_rating',
        ]

    def get_response_count(self, obj):
        return obj.responses.count()

    def get_average_rating(self, obj):
        avg = SurveyAnswer.objects.filter(
            response__survey=obj, question__question_type=SurveyQuestion.QuestionType.RATING,
            rating_value__isnull=False,
        ).aggregate(avg=Avg('rating_value'))['avg']
        return round(avg, 2) if avg is not None else None


class RespondentSurveySerializer(serializers.ModelSerializer):
    """
    What a citizen or guest answering a survey sees: the form itself and
    nothing about how it is managed or how others have answered it.
    """
    questions = SurveyQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = Survey
        fields = ['id', 'title', 'description', 'questions']


class SurveyCommentSerializer(serializers.ModelSerializer):
    """
    Powers the admin Dashboard's "Citizen Comments & Suggestions" card
    (SurveyCommentsView) — one SurveyResponse that included a written
    comment, plus that same response's star ratings for context. Deliberately
    excludes `respondent`, `document` (the FK id, not just its display name),
    and `document.tracking_number` — anything staff could use to trace a
    comment back to a specific citizen — while still surfacing office and
    document-TYPE context, which is about the service, not the person. This
    is enforced here at the API layer: the frontend never receives the
    citizen's identity to hide, there's simply nothing to hide.
    """
    office_name = serializers.SerializerMethodField()
    document_type_name = serializers.SerializerMethodField()
    ratings = serializers.SerializerMethodField()
    comment = serializers.SerializerMethodField()

    class Meta:
        model = SurveyResponse
        fields = ['id', 'office_name', 'document_type_name', 'ratings', 'comment', 'submitted_at']

    def get_office_name(self, obj):
        return obj.office.name if obj.office else None

    def get_document_type_name(self, obj):
        return obj.document.document_type.name if obj.document else None

    def get_ratings(self, obj):
        return [
            {'question': a.question.text, 'value': a.rating_value}
            for a in obj.answers.all()
            if a.question.question_type == SurveyQuestion.QuestionType.RATING and a.rating_value is not None
        ]

    def get_comment(self, obj):
        text_answer = next(
            (a for a in obj.answers.all()
             if a.question.question_type == SurveyQuestion.QuestionType.TEXT and a.text_value.strip()),
            None,
        )
        return text_answer.text_value if text_answer else ''


class SurveyWriteSerializer(serializers.ModelSerializer):
    """Create/rename a Survey shell. Questions are managed separately via
    PUT .../questions/ (same atomic-replace pattern as WorkflowStep)."""

    class Meta:
        model = Survey
        fields = ['id', 'title', 'description', 'is_active']

    def create(self, validated_data):
        request = self.context.get('request')
        return Survey.objects.create(
            **validated_data,
            created_by=request.user if request and request.user.is_authenticated else None,
        )


class SurveyQuestionInputSerializer(serializers.Serializer):
    # Optional: the real SurveyQuestion id, present for a question the admin
    # is editing (not creating fresh) — see SurveyQuestionsView.put(), which
    # uses this to update that row in place instead of deleting and
    # recreating it, so its historical SurveyAnswer rows survive the save.
    # Absent/null for a brand-new question, which gets created instead.
    id = serializers.IntegerField(required=False, allow_null=True)
    order = serializers.IntegerField(min_value=1)
    text = serializers.CharField(max_length=500)
    question_type = serializers.ChoiceField(choices=SurveyQuestion.QuestionType.choices, default=SurveyQuestion.QuestionType.RATING)
    # Plain list of choice labels, in display order — only meaningful for
    # the CHOICE_TYPES (likert/single/multiple); ignored for rating/text.
    # SurveyQuestionsView turns these into SurveyQuestionOption rows.
    options = serializers.ListField(
        child=serializers.CharField(max_length=200, allow_blank=False),
        required=False, default=list,
    )

    def validate(self, attrs):
        qtype = attrs.get('question_type')
        options = [o.strip() for o in attrs.get('options', []) if o and o.strip()]
        if qtype in SurveyQuestion.CHOICE_TYPES:
            if qtype in ('single', 'multiple') and len(options) < 2:
                raise serializers.ValidationError(
                    {"options": f"'{attrs.get('text', '')[:40]}' needs at least two choices."}
                )
            if qtype == 'likert' and not options:
                # A Likert question with no scale supplied gets the standard
                # 5-point agreement scale so the admin isn't forced to retype
                # it every time.
                options = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree']
        else:
            options = []
        attrs['options'] = options
        return attrs


class SurveyQuestionsReplaceSerializer(serializers.Serializer):
    """Input for PUT /api/documents/surveys/<id>/questions/ — the full
    ordered question list, replacing whatever was there before."""
    questions = SurveyQuestionInputSerializer(many=True)

    def validate_questions(self, questions):
        if not questions:
            raise serializers.ValidationError("At least one question is required.")
        numbers = sorted(q['order'] for q in questions)
        expected = list(range(1, len(questions) + 1))
        if numbers != expected:
            raise serializers.ValidationError(
                f"order values must be sequential starting at 1, with no gaps or "
                f"duplicates (got {numbers}, expected {expected})."
            )
        return questions


class CitizenSuggestionSerializer(serializers.ModelSerializer):
    """Citizen-facing: create a suggestion, and read back one's own. The
    triage fields (status/admin_notes/reviewed_at) are visible but never
    writable from here."""
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = CitizenSuggestion
        fields = [
            'id', 'category', 'category_display', 'subject', 'message',
            'status', 'status_display', 'admin_notes', 'created_at', 'reviewed_at',
        ]
        read_only_fields = ['status', 'admin_notes', 'created_at', 'reviewed_at']


class CitizenSuggestionAdminSerializer(serializers.ModelSerializer):
    """Admin review dashboard: everything the citizen serializer exposes,
    plus who sent it, and with `status`/`admin_notes` writable."""
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    respondent_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CitizenSuggestion
        fields = [
            'id', 'category', 'category_display', 'subject', 'message',
            'status', 'status_display', 'admin_notes',
            'respondent_name', 'reviewed_by_name', 'created_at', 'reviewed_at',
        ]
        read_only_fields = ['category', 'subject', 'message', 'created_at', 'reviewed_at']

    def get_respondent_name(self, obj):
        u = obj.respondent
        if not u:
            return 'Deleted account'
        full = f"{u.first_name} {u.last_name}".strip()
        return full or u.email

    def get_reviewed_by_name(self, obj):
        u = obj.reviewed_by
        return f"{u.first_name} {u.last_name}".strip() or u.email if u else None


class NotificationSerializer(serializers.ModelSerializer):
    """Powers the NotificationBell dropdown — Admin and Employee alike."""
    notification_type_label = serializers.CharField(source='get_notification_type_display', read_only=True)
    sender_name = serializers.SerializerMethodField()
    document_tracking_number = serializers.CharField(source='related_document.tracking_number', read_only=True, default=None)

    class Meta:
        model = Notification
        fields = [
            'id', 'title', 'message', 'notification_type', 'notification_type_label',
            'sender_name', 'related_document', 'document_tracking_number', 'is_read', 'created_at',
        ]

    def get_sender_name(self, obj):
        return obj.sender.full_name if obj.sender else None


