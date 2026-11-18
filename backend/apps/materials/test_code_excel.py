"""Impor soal Praktik dari Excel (lembar Soal, Cek Program, Cek HTML, Soal Matematika, Variabel)."""

import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from openpyxl import load_workbook
from rest_framework import status

from .code_practice import clean_checks
from .models import CodeExercise
from .test_code_practice import HTML_CHECKS, CodePracticeTests

FLOW_STARTER = '{"version": 1, "blocks": [{"id": "s1", "type": "input", "variable": "n"}]}'


class CodeExcelTests(CodePracticeTests):
    """Memakai data kelas/materi dari CodePracticeTests (test di sana ikut dijalankan ulang)."""

    def template(self, user=None):
        self.client.force_authenticate(user or self.siti)
        res = self.client.get(reverse("material-code-template", args=[self.m1.id]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return res.content

    def upload(self, content, dry_run=True, user=None):
        self.client.force_authenticate(user or self.siti)
        return self.client.post(
            reverse("material-code-import", args=[self.m1.id]),
            {"file": SimpleUploadedFile("praktik.xlsx", content), "dry_run": "true" if dry_run else "false"},
            format="multipart",
        )

    def edit(self, content, sheet, rows):
        workbook = load_workbook(io.BytesIO(content))
        target = workbook[sheet]
        target.delete_rows(2, target.max_row)
        for row in rows:
            target.append(row)
        buffer = io.BytesIO()
        workbook.save(buffer)
        return buffer.getvalue()

    def test_empty_template_examples_import(self):
        content = self.template()
        check = self.upload(content)
        self.assertEqual(check.status_code, status.HTTP_200_OK, check.data)
        self.assertEqual(check.data["summary"]["invalid"], 0, check.data["rows"])
        self.assertFalse(CodeExercise.objects.exists())

        res = self.upload(content, dry_run=False)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["created"], 3)
        python = CodeExercise.objects.get(language="python")
        self.assertEqual(
            python.checks, [{"input": "3\n4", "output": "7"}, {"input": "10\n-2", "output": "8"}]
        )
        self.assertIn("int(input())", python.starter_code)
        self.assertEqual(CodeExercise.objects.get(language="html").checks[0]["value"], "Halo")
        math = CodeExercise.objects.get(language="math")
        self.assertEqual(
            math.variables, {"a": {"min": 2, "max": 12, "step": 1}, "b": {"min": 2, "max": 9, "step": 1}}
        )
        self.assertEqual(math.checks[0]["answer"], "a*b")
        self.assertEqual([e.order for e in CodeExercise.objects.order_by("order")], [1, 2, 3])

    def test_round_trip_updates_and_keeps_flowchart(self):
        html = self.exercise(language="html", checks=clean_checks("html", HTML_CHECKS))
        flow = CodeExercise.objects.create(
            material=self.m1, title="Ganjil Genap", language="flowchart", starter_code=FLOW_STARTER,
            checks=[{"input": "4", "output": "Genap"}], order=2,
        )  # fmt: skip
        content = self.template()
        workbook = load_workbook(io.BytesIO(content))
        filled = [row for row in workbook["Cek HTML"].iter_rows(min_row=2, values_only=True) if row[0]]
        self.assertEqual(len(filled), len(HTML_CHECKS))
        self.assertIsNone(workbook["Soal"]["D3"].value)  # flowchart awal tidak ditulis di Excel

        content = self.edit(
            content, "Cek Program", [["Ganjil Genap", "4", "Genap"], ["Ganjil Genap", "7", "Ganjil"]]
        )
        res = self.upload(content, dry_run=False)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(CodeExercise.objects.count(), 2)
        flow.refresh_from_db()
        self.assertEqual(len(flow.checks), 2)
        self.assertEqual(flow.starter_code, FLOW_STARTER)  # tetap dipakai
        html.refresh_from_db()
        self.assertEqual(html.checks, clean_checks("html", HTML_CHECKS))

    def test_errors_save_nothing(self):
        content = self.template()
        content = self.edit(content, "Soal", [
            ["Soal A", "java", "", ""],
            ["Soal B", "html", "", ""],
            ["Soal C", "python", "", ""],
            ["soal c", "python", "", ""],
        ])  # fmt: skip
        content = self.edit(content, "Cek HTML", [["Soal B", "text", "h1", "", "", ""]])
        content = self.edit(content, "Cek Program", [["Soal C", "1", "1"], ["Tidak Ada", "1", "2"]])
        content = self.edit(content, "Soal Matematika", [])
        content = self.edit(content, "Variabel", [])
        res = self.upload(content)
        errors = {row["text"]: " ".join(row["errors"]) for row in res.data["rows"]}
        self.assertIn("Bahasa", errors["Soal A"])
        self.assertIn("Nilai", errors["Soal B"])
        self.assertEqual(errors["Soal C"], "")
        self.assertIn("kembar", errors["soal c"])
        self.assertIn("tidak ada di lembar Soal", errors["Cek Program: Tidak Ada"])
        self.assertEqual(self.upload(content, dry_run=False).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CodeExercise.objects.exists())

    def test_limit_five_per_material(self):
        for index in range(4):
            CodeExercise.objects.create(
                material=self.m1,
                title=f"Lama {index}",
                language="python",
                checks=[{"input": "", "output": "1"}],
            )
        content = self.edit(
            self.template(), "Soal", [["Baru 1", "python", "", ""], ["Baru 2", "python", "", ""]]
        )
        content = self.edit(content, "Cek Program", [["Baru 1", "", "1"], ["Baru 2", "", "2"]])
        res = self.upload(content)
        self.assertIn("paling banyak 5", " ".join(res.data["rows"][0]["errors"]))

    def test_only_team_teacher(self):
        content = self.template()
        self.assertEqual(self.upload(content, user=self.ahmad).status_code, status.HTTP_200_OK)  # rekan setim
        self.assertEqual(self.upload(content, user=self.outsider).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.upload(content, user=self.ani).status_code, status.HTTP_403_FORBIDDEN)
