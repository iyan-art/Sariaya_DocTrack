import re
from urllib.parse import urlparse

from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework import serializers
from .models import (
    DocumentType, WorkflowStep, Office, Document, DocumentLog, MissingDocumentAlert,
    Survey, SurveyQuestion, SurveyAnswer, SurveyResponse, RequestStatusHistory,
    DocumentTemplateField, GeneratedDocument, EmailNotificationLog, Announcement, Event,
)
from .services import resolve_office
from .qr_services import generate_qr_code


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


class WorkflowStepSerializer(serializers.ModelSerializer):
    office = OfficeSerializer(read_only=True)

    class Meta:
        model = WorkflowStep
        fields = ['id', 'step_number', 'office', 'action_required', 'max_hours_allowed']


class DocumentTemplateFieldSerializer(serializers.ModelSerializer):
    """
    One positioned field on a DocumentType's template — the schema
    DocumentGenerateModal.jsx renders as an editable form. Coordinates are
    admin-authored data, not exposed for editing here (no write path yet);
    this is a read-only view of what staff need to know to fill a document.
    """
    class Meta:
        model = DocumentTemplateField
        fields = [
            'id', 'key', 'label', 'field_type', 'section', 'options', 'required',
            'placeholder', 'default_value', 'source_request_key', 'order',
        ]


class DocumentTypeSerializer(serializers.ModelSerializer):
    """
    Full read representation — includes the admin-authored step list, not
    just the derived `route`. Used everywhere document types are listed or
    fetched for editing (Workflow Builder, document-creation dropdowns).
    """
    steps = WorkflowStepSerializer(many=True, read_only=True)
    scope_label = serializers.CharField(source='get_scope_display', read_only=True)
    requests_today = serializers.SerializerMethodField()

    has_template_file = serializers.SerializerMethodField()
    template_fields = DocumentTemplateFieldSerializer(many=True, read_only=True)

    class Meta:
        model = DocumentType
        fields = [
            'id', 'name', 'description', 'scope', 'scope_label', 'route', 'is_active', 'created_at', 'steps',
            'daily_limit', 'requests_today', 'request_fields', 'has_template_file', 'template_fields',
        ]
        read_only_fields = ['route', 'created_at']

    def get_has_template_file(self, obj):
        return bool(obj.template_file)

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
    copy_preference_label = serializers.CharField(source='get_copy_preference_display', read_only=True)
    has_official_file = serializers.SerializerMethodField()
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
            'status', 'status_label', 'is_returning', 'was_returned', 'processing_stage', 'processing_stage_label',
            'copy_preference', 'copy_preference_label', 'has_official_file',
            'step_statuses', 'current_handler',
            'created_at', 'updated_at', 'entered_current_office_at', 'dwell_display', 'qr_code',
            'released_at', 'released_by_name',
        ]

    def get_has_official_file(self, obj):
        return bool(obj.document_type.template_file)

    def _released_log(self, obj):
        # obj.logs is ordered by timestamp (Meta.ordering on DocumentLog) —
        # last() gets the most recent release in case of a return-then-
        # re-release cycle, not just the first one ever.
        return obj.logs.filter(action=DocumentLog.Action.RELEASED_TO_CITIZEN).order_by('-timestamp').first()

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
        if obj.status == 'in_transit':
            route = obj.document_type.route
            if obj.is_returning:
                target_office = route[obj.route_position - 1] if obj.route_position > 0 else obj.current_office
                return f"Being Returned to {target_office}"
            next_office = route[obj.route_position + 1] if obj.route_position + 1 < len(route) else obj.current_office
            return f"In Transit to {next_office}"
        if obj.status == 'completed':
            return f"Ready at {obj.origin_office}"
        if obj.status == 'released':
            return "Released to Citizen"
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
        'completed' (green), 'active' (yellow), 'delayed' (red — sitting
        past this step's own SLA), or 'pending' (gray). A MISSING document
        always shows its current step as delayed regardless of the SLA math,
        since it's already been formally flagged.
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
                    statuses.append('delayed' if dwell_hours > step.max_hours_allowed else 'active')
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


_EMPLOYEE_ID_RE = re.compile(r'\(?EMP-\d{4}-\d+\)?\.?')


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
        return _EMPLOYEE_ID_RE.sub('', obj.notes).strip()


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
    copy_preference_label = serializers.CharField(source='get_copy_preference_display', read_only=True)
    has_official_file = serializers.SerializerMethodField()
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
            'copy_preference', 'copy_preference_label', 'has_official_file',
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

    def get_has_official_file(self, obj):
        return bool(obj.document_type.template_file)

    def get_status_label(self, obj):
        if obj.status == 'in_progress':
            return f"At {obj.current_office}"
        if obj.status == 'in_transit':
            route = obj.document_type.route
            if obj.is_returning:
                target_office = route[obj.route_position - 1] if obj.route_position > 0 else obj.current_office
                return f"Being Returned to {target_office}"
            next_office = route[obj.route_position + 1] if obj.route_position + 1 < len(route) else obj.current_office
            return f"In Transit to {next_office}"
        if obj.status == 'completed':
            return f"Ready at {obj.origin_office}"
        if obj.status == 'released':
            return "Released to Citizen"
        return obj.get_status_display()

    def get_total_steps(self, obj):
        return len(obj.document_type.route)


class GeneratedDocumentSerializer(serializers.ModelSerializer):
    """
    The Staff/Admin-filled state for one request's official document —
    read/write via GeneratedDocumentView (Save Draft) and returned by
    GenerateDocumentView after a Generate/Update Document action.
    """
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = GeneratedDocument
        fields = ['field_values', 'status', 'status_label', 'updated_at']
        read_only_fields = ['status', 'status_label', 'updated_at']


class CreateDocumentSerializer(serializers.ModelSerializer):
    """
    Used when the origin office (e.g. BPLO) creates a new document entry —
    the very first step in the workflow. Automatically creates the first
    DocumentLog entry and generates the document's tracking number.
    """

    # Overrides the auto-generated field (which would be required=False,
    # since the model column itself is blank=True for DB safety) — staff
    # must explicitly ask the citizen and select one, no silent default.
    copy_preference = serializers.ChoiceField(
        choices=Document.CopyPreference.choices,
        error_messages={'required': 'Please select a delivery type: Hard Copy or Soft Copy.',
                         'invalid_choice': 'Please select a valid delivery type: Hard Copy or Soft Copy.'},
    )

    class Meta:
        model = Document
        fields = ['document_type', 'form_data', 'requested_by', 'guest_name', 'guest_email', 'copy_preference']

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
        if attrs.get('requested_by') is not None:
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
        return attrs

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

    class Meta:
        model = MissingDocumentAlert
        fields = [
            'id', 'document', 'tracking_number', 'document_type_name', 'current_office',
            'days_delayed', 'status', 'raised_at', 'resolved_at', 'resolved_by', 'notes',
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


class SurveyQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurveyQuestion
        fields = ['id', 'order', 'text', 'question_type']


class SurveySerializer(serializers.ModelSerializer):
    """
    Full read representation — includes the ordered question list plus
    lightweight response stats, used both by the admin Survey Manager and
    the public survey widget (the public one just won't have much use for
    response_count/average_rating, but there's no harm exposing them).
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


