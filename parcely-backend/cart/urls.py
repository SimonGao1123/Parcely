from django.urls import path

from cart.views import CreateCartItemAPIView
from cart.views import UpdateDeleteCartItemAPIView
from cart.views import ClearCartAPIView
from cart.views import GetCartAPIView
# sub path urls from storefronts/<str:storefront_slug>/cart/
urlpatterns = [
    path('items/create/', CreateCartItemAPIView.as_view(), name='cart-item-create'),
    path('items/<int:cart_item_id>/update/', UpdateDeleteCartItemAPIView.as_view(), name='cart-item-update'),
    path('clear/', ClearCartAPIView.as_view(), name='cart-clear'),
    path('details/', GetCartAPIView.as_view(), name='cart-get'),
]
