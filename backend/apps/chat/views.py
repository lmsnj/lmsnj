from django.db.models import Count, OuterRef, Q, Subquery
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.models import User

from .models import Conversation, Message
from .rules import can_chat, contacts_for

HISTORY_LIMIT = 100  # jumlah pesan terakhir yang dimuat saat percakapan dibuka


def person(user):
    return {
        "id": user.id,
        "full_name": user.full_name,
        "role": user.role,
        "role_display": user.get_role_display(),
        "classroom_name": user.classroom.name if user.classroom_id else None,
    }


def message_data(message):
    return {
        "id": message.id,
        "sender": message.sender_id,
        "body": message.body,
        "created_at": message.created_at,
        "read_at": message.read_at,
    }


class MessageInputSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=2000, trim_whitespace=True)


class ConversationViewSet(viewsets.GenericViewSet):
    """Ruang Obrolan: daftar percakapan, mulai percakapan, baca & kirim pesan."""

    def get_queryset(self):
        user = self.request.user
        last = Message.objects.filter(conversation=OuterRef("pk")).order_by("-id")
        return (
            Conversation.objects.filter(Q(user_a=user) | Q(user_b=user))
            .select_related("user_a__classroom", "user_b__classroom")
            .annotate(
                unread=Count(
                    "messages", filter=Q(messages__read_at__isnull=True) & ~Q(messages__sender=user)
                ),
                last_body=Subquery(last.values("body")[:1]),
                last_sender=Subquery(last.values("sender")[:1]),
            )
            .order_by("-last_message_at", "-created_at")
        )

    def get_throttles(self):
        # Batasi pengiriman pesan (bukan membaca) agar tidak dipakai untuk spam.
        if self.action == "messages" and self.request.method == "POST":
            self.throttle_scope = "chat"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def conversation_data(self, conversation):
        user = self.request.user
        return {
            "id": conversation.id,
            "other": person(conversation.other(user)),
            "last_message": getattr(conversation, "last_body", None),
            "last_message_is_mine": getattr(conversation, "last_sender", None) == user.id,
            "last_message_at": conversation.last_message_at,
            "unread": getattr(conversation, "unread", 0),
            "can_send": can_chat(user, conversation.other(user)),
        }

    def list(self, request):
        return Response([self.conversation_data(c) for c in self.get_queryset()])

    def create(self, request):
        """Mulai (atau buka kembali) percakapan dengan user lain: {"user": <id>}."""
        other = get_object_or_404(User, pk=request.data.get("user"))
        if not can_chat(request.user, other):
            raise PermissionDenied("Anda tidak bisa mengirim pesan ke pengguna ini.")
        first, second = sorted([request.user, other], key=lambda u: u.id)
        conversation, created = Conversation.objects.get_or_create(user_a=first, user_b=second)
        conversation = self.get_queryset().get(pk=conversation.pk)
        return Response(
            self.conversation_data(conversation),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        conversation = get_object_or_404(self.get_queryset(), pk=pk)
        user = request.user

        if request.method == "POST":
            if not can_chat(user, conversation.other(user)):
                raise PermissionDenied("Anda tidak bisa lagi mengirim pesan dalam percakapan ini.")
            serializer = MessageInputSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            message = Message.objects.create(
                conversation=conversation, sender=user, **serializer.validated_data
            )
            conversation.last_message_at = message.created_at
            conversation.save(update_fields=["last_message_at"])
            return Response(message_data(message), status=status.HTTP_201_CREATED)

        # GET: ?after=<id> hanya pesan baru (untuk pengecekan berkala); tanpa itu = riwayat terakhir.
        messages = conversation.messages.all()
        after = request.query_params.get("after")
        if after:
            if not after.isdigit():
                raise ValidationError({"after": "Harus berupa angka."})
            messages = list(messages.filter(id__gt=int(after)))
        else:
            messages = list(messages.order_by("-id")[:HISTORY_LIMIT])[::-1]
        # Pesan dari lawan bicara dianggap sudah dibaca saat dimuat.
        conversation.messages.filter(read_at__isnull=True).exclude(sender=user).update(read_at=timezone.now())
        return Response([message_data(m) for m in messages])

    @action(detail=False)
    def contacts(self, request):
        """Orang yang boleh diajak mengobrol. ?search= untuk mencari nama."""
        people = contacts_for(request.user).select_related("classroom").order_by("role", "full_name")
        search = request.query_params.get("search", "").strip()
        if search:
            people = people.filter(Q(full_name__icontains=search) | Q(username__icontains=search))
        return Response([person(p) for p in people[:50]])

    @action(detail=False, url_path="unread-count")
    def unread_count(self, request):
        user = request.user
        count = (
            Message.objects.filter(
                Q(conversation__user_a=user) | Q(conversation__user_b=user), read_at__isnull=True
            )
            .exclude(sender=user)
            .count()
        )
        return Response({"unread": count})
