from django.urls import path
from store.views import (
    StoreFrontListCreateAPIView, 
    AllStoreFrontAPIView, 
    StoreFrontDetailAPIView, 
    UpdateStoreFrontAPIView, 
    DeleteStoreFrontAPIView,
)
urlpatterns = [
    # storefront related urls
    path('', StoreFrontListCreateAPIView.as_view(), name='store-front-list-create'),
    path('all/', AllStoreFrontAPIView.as_view(), name='all-store-fronts'),
    path('<str:slug>/', StoreFrontDetailAPIView.as_view(), name='store-front-detail'),
    path('<str:slug>/update/', UpdateStoreFrontAPIView.as_view(), name='update-store-front'),
    path('<str:slug>/delete/', DeleteStoreFrontAPIView.as_view(), name='delete-store-front'),

    # page related urls
]