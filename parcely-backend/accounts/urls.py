from django.urls import path
from accounts import views
urlpatterns = [
    path('me/', views.me, name='me'),
]
