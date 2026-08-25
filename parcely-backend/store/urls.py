from django.urls import path, include
from store.views import (
    StoreFrontListCreateAPIView, 
    AllStoreFrontAPIView, 
    StoreFrontDetailAPIView, 
    UpdateStoreFrontAPIView, 
    DeleteStoreFrontAPIView,
)
from store.views.page import PageDetailAPIView, CreatePageAPIView, UpdatePageAPIView, DeletePageAPIView
from store.views.pageblock import PageBlockCreateAPIView, PageBlockUpdateAPIView, PageBlockDeleteAPIView
from products import urls as products_urls
urlpatterns = [
    # storefront related urls
    path('', StoreFrontListCreateAPIView.as_view(), name='store-front-list-create'),
    path('all/', AllStoreFrontAPIView.as_view(), name='all-store-fronts'),
    path('<str:slug>/details/', StoreFrontDetailAPIView.as_view(), name='store-front-detail'),
    path('<str:slug>/update/', UpdateStoreFrontAPIView.as_view(), name='update-store-front'),
    path('<str:slug>/delete/', DeleteStoreFrontAPIView.as_view(), name='delete-store-front'),

    # page related urls
    path('<str:storefront_slug>/pages/create/', CreatePageAPIView.as_view(), name='create-page'),
    path('<str:storefront_slug>/pages/<str:slug>/details/', PageDetailAPIView.as_view(), name='page-detail'),
    path('<str:storefront_slug>/pages/<str:slug>/update/', UpdatePageAPIView.as_view(), name='update-page'),
    path('<str:storefront_slug>/pages/<str:slug>/delete/', DeletePageAPIView.as_view(), name='delete-page'),

    # page block related urls
    path('<str:storefront_slug>/pages/<str:page_slug>/blocks/create/', PageBlockCreateAPIView.as_view(), name='create-page-block'),
    path('<str:storefront_slug>/pages/<str:page_slug>/blocks/<int:id>/update/', PageBlockUpdateAPIView.as_view(), name='update-page-block'),
    path('<str:storefront_slug>/pages/<str:page_slug>/blocks/<int:id>/delete/', PageBlockDeleteAPIView.as_view(), name='delete-page-block'),

    # product related urls
    path('<str:storefront_slug>/products/', include(products_urls)),
]