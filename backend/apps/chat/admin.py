from django.contrib import admin

from .models import Conversation, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ["user_a", "user_b", "last_message_at"]
    search_fields = ["user_a__full_name", "user_b__full_name"]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["conversation", "sender", "created_at", "read_at"]
    search_fields = ["body"]
