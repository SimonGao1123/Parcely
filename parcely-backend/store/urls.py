from django.urls import path
from store.views import (
    StoreFrontListCreateAPIView, 
    AllStoreFrontAPIView, 
    StoreFrontDetailAPIView, 
    UpdateStoreFrontAPIView, 
    DeleteStoreFrontAPIView,
)
from store.views.page import PageDetailAPIView, CreatePageAPIView, UpdatePageAPIView, DeletePageAPIView
urlpatterns = [
    # storefront related urls
    path('', StoreFrontListCreateAPIView.as_view(), name='store-front-list-create'),
    path('all/', AllStoreFrontAPIView.as_view(), name='all-store-fronts'),
    path('<str:slug>/', StoreFrontDetailAPIView.as_view(), name='store-front-detail'),
    path('<str:slug>/update/', UpdateStoreFrontAPIView.as_view(), name='update-store-front'),
    path('<str:slug>/delete/', DeleteStoreFrontAPIView.as_view(), name='delete-store-front'),

    # page related urls
    path('<str:storefront_slug>/pages/create/', CreatePageAPIView.as_view(), name='create-page'),
    path('<str:storefront_slug>/<str:slug>/', PageDetailAPIView.as_view(), name='page-detail'),
    path('<str:storefront_slug>/<str:slug>/update/', UpdatePageAPIView.as_view(), name='update-page'),
    path('<str:storefront_slug>/<str:slug>/delete/', DeletePageAPIView.as_view(), name='delete-page'),

    # page block related urls
]