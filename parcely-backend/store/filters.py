import django_filters
from store.models import StoreFront, Theme
class StoreFrontFilter(django_filters.FilterSet):
    title = django_filters.CharFilter(lookup_expr='icontains')
    theme = django_filters.ChoiceFilter(choices=Theme.choices, lookup_expr='iexact')

    order = django_filters.OrderingFilter(
        fields=("created_at", "created") # ?order=created/-created
    )

    class Meta:
        model = StoreFront
        fields = ['title', 'theme'] 