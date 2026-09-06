from django.contrib import admin
from .models import User, AccessLog


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('employee_id', 'email', 'full_name', 'role', 'office', 'is_active')
    list_filter = ('role', 'office', 'is_active')
    search_fields = ('employee_id', 'email', 'first_name', 'last_name')


@admin.register(AccessLog)
class AccessLogAdmin(admin.ModelAdmin):
    list_display = ('user', 'action', 'ip_address', 'timestamp')
    list_filter = ('action',)
    search_fields = ('user__email', 'ip_address')
