"""Generates a downloadable PDF report for a completed comparison."""
import json
import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)

from config import REPORT_DIR

INK = colors.HexColor("#1C1E26")
LINE = colors.HexColor("#D8D6CD")
ACCENT = colors.HexColor("#2B6CB0")


def build_report(comparison, submission_1, submission_2):
    """Writes a PDF to REPORT_DIR and returns its path."""
    scores = json.loads(comparison["scores"]) if comparison["scores"] else {}
    matches = json.loads(comparison["matches"]) if comparison["matches"] else {}
    breakdown = scores.get("breakdown", {})

    out_path = os.path.join(REPORT_DIR, f"comparison_{comparison['id']}.pdf")
    doc = SimpleDocTemplate(
        out_path, pagesize=LETTER,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleStyle", parent=styles["Title"], textColor=INK, fontSize=20,
    )
    heading_style = ParagraphStyle(
        "HeadingStyle", parent=styles["Heading2"], textColor=INK, spaceBefore=16,
    )
    body_style = ParagraphStyle(
        "BodyStyle", parent=styles["BodyText"], textColor=INK, leading=15,
    )
    note_style = ParagraphStyle(
        "NoteStyle", parent=styles["BodyText"], textColor=colors.HexColor("#5A5D6B"),
        fontSize=9, leading=13,
    )

    story = [
        Paragraph("Similarity Analysis Report", title_style),
        Spacer(1, 4),
        Paragraph(
            f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} "
            f"&middot; Comparison #{comparison['id']}",
            note_style,
        ),
        Spacer(1, 16),
        Paragraph("Documents compared", heading_style),
        Table(
            [
                ["A", submission_1["file_name"], submission_1["file_type"]],
                ["B", submission_2["file_name"], submission_2["file_type"]],
            ],
            colWidths=[0.4 * inch, 3.6 * inch, 1.5 * inch],
            style=TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("TEXTCOLOR", (0, 0), (-1, -1), INK),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F2F1EC")),
            ]),
        ),
        Spacer(1, 16),
        Paragraph("Overall result", heading_style),
        Paragraph(
            f"<b>{scores.get('final_score', 0)}%</b> &mdash; "
            f"{comparison.get('classification', 'Unknown')}",
            ParagraphStyle("Score", parent=body_style, fontSize=16, textColor=ACCENT),
        ),
        Spacer(1, 10),
        Paragraph("Algorithm breakdown", heading_style),
        Table(
            [["Algorithm", "Score"]] + [
                [_LABELS.get(k, k), f"{v}%"] for k, v in breakdown.items()
            ],
            colWidths=[3.5 * inch, 2 * inch],
            style=TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1C1E26")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("TEXTCOLOR", (0, 1), (-1, -1), INK),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
            ]),
        ),
        Spacer(1, 10),
        Paragraph(
            f"Semantic method used: {scores.get('semantic_method', 'n/a')}",
            note_style,
        ),
        Spacer(1, 16),
        Paragraph("Notes", heading_style),
        Paragraph(
            "This report reflects automated similarity indicators produced "
            "by a hybrid of exact-match (Rabin&ndash;Karp, shingle hashing), "
            "structural (LCS, edit distance), and semantic (embedding) "
            "comparison. It does not prove plagiarism and should not be "
            "used as the sole basis for disciplinary decisions.",
            note_style,
        ),
    ]

    doc.build(story)
    return out_path


_LABELS = {
    "rabin_karp": "Rabin\u2013Karp (n-gram overlap)",
    "hashing": "Shingle hashing (Jaccard)",
    "lcs": "Longest common subsequence",
    "edit_distance": "Edit distance",
    "semantic": "Semantic similarity",
}
