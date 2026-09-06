from django.contrib import admin
from .models import (
    Document, DocumentType, WorkflowStep, Office, DocumentLog, MissingDocumentAlert,
    EmailNotificationLog, DocumentTemplateField, Announcement, Event,
)

@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ('title', 'is_active', 'published_at')
    list_filter = ('is_active',)
    search_fields = ('title',)

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ('title', 'start_date', 'end_date', 'location', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('title', 'location')

class WorkflowStepInline(admin.TabularInline):
    model = WorkflowStep
    extra = 1
    ordering = ('step_number',)

class DocumentTemplateFieldInline(admin.TabularInline):
    model = DocumentTemplateField
    extra = 1
    ordering = ('order',)
    fields = (
        'order', 'key', 'label', 'field_type', 'section', 'options', 'required',
        'placeholder', 'default_value', 'source_request_key', 'page_number', 'x', 'y', 'font_size', 'rotation',
    )

@admin.register(Office)
class OfficeAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'location', 'contact_person', 'office_hours', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('code', 'name')

@admin.register(DocumentType)
class DocumentTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'scope', 'route', 'is_active', 'created_at')
    list_filter = ('scope', 'is_active')
    inlines = [WorkflowStepInline, DocumentTemplateFieldInline]
    # `route` is a cache DERIVED from the WorkflowStep inline below (see
    # DocumentType.sync_route_from_steps(), called by save_formset() here) —
    # it must never be hand-edited. Left as an ordinary editable field, this
    # raw JSON textarea silently re-submits whatever stale value was loaded
    # on page open every time the form is saved, which is exactly how an
    # office rename (an Office row deleted/recreated under a new code, with
    # its WorkflowStep rows fixed up separately) left `route` still pointing
    # at the deleted office even after the steps themselves were corrected.
    readonly_fields = ('route',)

    def save_formset(self, request, form, formset, change):
        super().save_formset(request, form, formset, change)
        if formset.model is WorkflowStep:
            form.instance.sync_route_from_steps()

@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('tracking_number', 'document_type', 'current_office', 'status', 'created_at')
    search_fields = ('tracking_number',)
    list_filter = ('status', 'document_type')

@admin.register(DocumentLog)
class DocumentLogAdmin(admin.ModelAdmin):
    list_display = ('document', 'action', 'office', 'sender', 'acted_by', 'qr_verified', 'duration_at_office', 'timestamp')
    list_filter = ('office', 'action', 'qr_verified')

@admin.register(MissingDocumentAlert)
class MissingDocumentAlertAdmin(admin.ModelAdmin):
    list_display = ('document', 'days_delayed', 'status', 'raised_at', 'resolved_at')
    list_filter = ('status',)

@admin.register(EmailNotificationLog)
class EmailNotificationLogAdmin(admin.ModelAdmin):
    list_display = ('document', 'recipient_email', 'notification_type', 'status', 'sent_at')
    list_filter = ('notification_type', 'status')
    search_fields = ('recipient_email',)