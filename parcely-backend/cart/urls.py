from django.urls import path

from cart.views import CreateCartItemAPIView
from cart.views import UpdateDeleteCartItemAPIView
from cart.views import ClearCartAPIView
from cart.views import GetCartAPIView
# sub path urls from storefronts/<str:storefront_slug>/cart/
urlpatterns = [
    path('<str:storefront_slug>/items/create/', CreateCartItemAPIView.as_view(), name='cart-item-create'),
    path('<str:storefront_slug>/items/<int:cart_item_id>/update/', UpdateDeleteCartItemAPIView.as_view(), name='cart-item-update'),
    path('<str:storefront_slug>/clear/', ClearCartAPIView.as_view(), name='cart-clear'),
    path('<str:storefront_slug>/', GetCartAPIView.as_view(), name='cart-get'),
]
