from rest_framework import serializers
from accounts.models import AppUser

class AppUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppUser
        fields = ['id', 'email', 'first_name', 'last_name', 'created_at', 'updated_at', 'profile_picture']
        read_only_fields = ['id', 'created_at', 'updated_at']


class MeSerializer(AppUserSerializer):
    """The signed-in user's own record. Deliberately separate from
    AppUserSerializer, which is nested publicly as a storefront's owner - Stripe
    onboarding state is nobody else's business.

    can_sell is exposed alongside the raw status so the frontend gates on the
    model's definition instead of comparing status strings itself.
    """
    can_sell = serializers.BooleanField(read_only=True)

    class Meta(AppUserSerializer.Meta):
        fields = AppUserSerializer.Meta.fields + ['card_payments_status', 'can_sell']
        read_only_fields = AppUserSerializer.Meta.read_only_fields + ['card_payments_status']


class SendOTPEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        # Customer is unique on (seller, email); without normalizing, the same
        # person verifying as Foo@x.com and foo@x.com becomes two customers.
        return value.lower()


class PublicOwnerSerializer(serializers.ModelSerializer):
    """A storefront owner as seen by anonymous visitors. Carries no email: the
    public storefront endpoints are AllowAny, so anything here is harvestable in
    bulk from the storefront list.
    """
    class Meta:
        model = AppUser
        fields = ['id', 'first_name', 'profile_picture']
        read_only_fields = fields

class VerifyEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField()

    def validate_email(self, value):
        # Must match the normalization in SendOTPEmailSerializer, since the row
        # is looked up by the address as it was stored at send time.
        return value.lower()