from django.shortcuts import render
from rest_framework.response import Response
from rest_framework.decorators import api_view
from accounts.serializers import AppUserSerializer
from rest_framework import status
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.http import HttpResponse
from svix.webhooks import Webhook, WebhookVerificationError
from django.conf import settings
from accounts.clerk import create_clerk_user, update_clerk_user, delete_clerk_user
# Create your views here.

@api_view(['GET'])
def me(request):
    return Response(AppUserSerializer(request.user).data)


@csrf_exempt
@require_POST
def clerk_webhook(request):
    headers = {
        'svix-id': request.headers.get('svix-id', ''),
        'svix-timestamp': request.headers.get('svix-timestamp', ''),
        'svix-signature': request.headers.get('svix-signature', ''),
    }

    try:
        event = Webhook(settings.CLERK_WEBHOOK_SECRET).verify(request.body, headers)
    except WebhookVerificationError as e:
        return HttpResponse('Invalid signature', status=400)
    
    event_type = event['type']
    data = event['data']
    clerk_id = data['id']

    if event_type == 'user.created':
        create_clerk_user(clerk_id, data)
    elif event_type == 'user.updated':
        update_clerk_user(clerk_id, data)
    elif event_type == 'user.deleted':
        delete_clerk_user(clerk_id)
    # Unknown event types are acknowledged so Clerk doesn't retry.
    return HttpResponse(status=204)