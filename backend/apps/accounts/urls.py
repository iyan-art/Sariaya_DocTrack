from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    LoginView, RegisterView, MeView,
    UserListView, CreateEmployeeView, ToggleUserActiveView, OfficialsListView, UpdateUserView,
    AccessLogListView, ResetUserPasswordView, CitizenSearchView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('login/refresh/', TokenRefreshView.as_view(), name='login-refresh'),
    path('register/', RegisterView.as_view(), name='register'),
    path('me/', MeView.as_view(), name='me'),

    path('citizens/search/', CitizenSearchView.as_view(), name='citizen-search'),
    path('users/', UserListView.as_view(), name='user-list'),
    path('users/create-employee/', CreateEmployeeView.as_view(), name='create-employee'),
    path('users/<int:pk>/toggle-active/', ToggleUserActiveView.as_view(), name='toggle-active'),
    path('users/<int:pk>/reset-password/', ResetUserPasswordView.as_view(), name='reset-user-password'),
    path('officials/', OfficialsListView.as_view(), name='officials-list'),
    path('users/<int:pk>/update/', UpdateUserView.as_view(), name='update-user'),
    path('access-logs/', AccessLogListView.as_view(), name='access-log-list'),
]