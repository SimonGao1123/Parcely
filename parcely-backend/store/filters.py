import django_filters
from store.models import StoreFront, Theme
class StoreFrontFilter(django_filters.FilterSet):
    title = django_filters.CharFilter(lookup_expr='icontains')
    theme = django_filters.ChoiceFilter(choices=Theme.choices, lookup_expr='iexact')

    # tuple-of-pairs maps the model field to the public param name; a flat
    # sequence would instead expose a non-existent "created" field
    order = django_filters.OrderingFilter(
        fields=(("created_at", "created"),) # ?order=created/-created
    )

    class Meta:
        model = StoreFront
        fields = ['title', 'theme'] 