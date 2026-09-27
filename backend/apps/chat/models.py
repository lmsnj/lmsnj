from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """Percakapan dua orang. Pasangan disimpan terurut (user_a.id < user_b.id) agar tidak ganda."""

    user_a = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    user_b = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    # Diperbarui setiap ada pesan baru, untuk mengurutkan daftar percakapan.
    last_message_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "percakapan"
        verbose_name_plural = "percakapan"
        ordering = ["-last_message_at", "-created_at"]
        constraints = [models.UniqueConstraint(fields=["user_a", "user_b"], name="unique_conversation_pair")]

    def __str__(self):
        return f"{self.user_a} - {self.user_b}"

    def other(self, user):
        return self.user_b if self.user_a_id == user.id else self.user_a

    def has_member(self, user):
        return user.id in (self.user_a_id, self.user_b_id)


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    body = models.TextField("pesan", max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField("dibaca", null=True, blank=True)

    class Meta:
        verbose_name = "pesan"
        verbose_name_plural = "pesan"
        ordering = ["id"]

    def __str__(self):
        return self.body[:40]
