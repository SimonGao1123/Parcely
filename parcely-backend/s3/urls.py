from django.urls import path
from . import views

urlpatterns = [
    path('presign/', views.presign_upload, name='s3-presign'),
    path('confirm/', views.confirm_upload, name='s3-confirm'),
    path('delete/', views.delete_blob, name='s3-delete'),
]
