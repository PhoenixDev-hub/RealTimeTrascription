import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

logger = logging.getLogger(__name__)


class TranscriptManager:
    def __init__(self, base_path: Optional[str] = None):
        self.base_path = Path(base_path or os.getenv("OUTPUT_PATH", "./output"))
        self.transcripts_dir = self.base_path / "transcripts"
        self.pdfs_dir = self.transcripts_dir / "pdfs"
        self.texts_dir = self.transcripts_dir / "texts"
        self.metadata_dir = self.transcripts_dir / "metadata"

        self._create_directories()

    def _create_directories(self) -> None:
        for directory in [self.pdfs_dir, self.texts_dir, self.metadata_dir]:
            directory.mkdir(parents=True, exist_ok=True)
            logger.info(f"Diretório garantido: {directory}")

    def _get_timestamp_filename(self, extension: str = "") -> str:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if extension and not extension.startswith("."):
            extension = f".{extension}"
        return f"transcricao_{timestamp}{extension}"

    def _register_fonts(self) -> None:
        try:
            font_paths = [
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
                "/System/Library/Fonts/Helvetica.ttc",
            ]

            for font_path in font_paths:
                if Path(font_path).exists():
                    pdfmetrics.registerFont(TTFont("CustomFont", font_path))
                    logger.debug(f"Fonte registrada: {font_path}")
                    break
        except Exception as e:
            logger.warning(f"Não foi possível registrar fonte customizada: {e}")

    def save_as_pdf(
        self,
        text: str,
        title: str = "Transcrição",
        author: str = "Festival 2026",
        filename: Optional[str] = None,
    ) -> Path:
        filename = filename or self._get_timestamp_filename("pdf")
        filepath = self.pdfs_dir / filename

        try:
            self._register_fonts()

            doc = SimpleDocTemplate(
                str(filepath),
                pagesize=A4,
                rightMargin=0.75 * inch,
                leftMargin=0.75 * inch,
                topMargin=0.75 * inch,
                bottomMargin=0.75 * inch,
                title=title,
                author=author,
            )

            styles = getSampleStyleSheet()
            font_name = "Helvetica"
            if "CustomFont" in pdfmetrics.getRegisteredFontNames():
                font_name = "CustomFont"

            title_style = ParagraphStyle(
                "CustomTitle",
                parent=styles["Heading1"],
                fontName=font_name + "-Bold" if font_name == "Helvetica" else font_name,
                fontSize=24,
                textColor=colors.HexColor("#1a1a1a"),
                spaceAfter=30,
                alignment=1,
            )

            body_style = ParagraphStyle(
                "CustomBody",
                parent=styles["BodyText"],
                fontName=font_name,
                fontSize=11,
                alignment=4,
                spaceAfter=12,
                leading=16,
            )

            meta_style = ParagraphStyle(
                "CustomMeta",
                parent=styles["Normal"],
                fontName=font_name,
                fontSize=9,
                textColor=colors.HexColor("#555555"),
                spaceAfter=6,
            )

            story = []

            story.append(Paragraph(title, title_style))
            timestamp = datetime.now().strftime("%d de %B de %Y às %H:%M")
            story.append(Paragraph(f"<i>{timestamp}</i>", meta_style))
            story.append(Spacer(1, 0.3 * inch))

            paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]

            for paragraph in paragraphs:
                cleaned = " ".join(paragraph.split())
                story.append(Paragraph(cleaned, body_style))

            story.append(Spacer(1, 0.3 * inch))
            story.append(Paragraph("—" * 50, meta_style))
            footer_text = (
                f"Arquivo: {filename} | Gerado automaticamente pelo Festival 2026"
            )
            story.append(Paragraph(f"<small>{footer_text}</small>", meta_style))

            doc.build(story)
            logger.info(f"PDF salvo: {filepath}")

            return filepath

        except Exception as e:
            logger.error(f"Erro ao gerar PDF: {e}", exc_info=True)
            raise

    def save_as_text(
        self,
        text: str,
        filename: Optional[str] = None,
    ) -> Path:
        filename = filename or self._get_timestamp_filename("txt")
        filepath = self.texts_dir / filename

        try:
            filepath.write_text(text, encoding="utf-8")
            logger.info(f"Arquivo de texto salvo: {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"Erro ao salvar arquivo de texto: {e}", exc_info=True)
            raise

    def save_as_json(
        self,
        data: dict,
        filename: Optional[str] = None,
    ) -> Path:
        filename = filename or self._get_timestamp_filename("json")
        filepath = self.metadata_dir / filename

        try:
            filepath.write_text(
                json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            logger.info(f"JSON de metadados salvo: {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"Erro ao salvar JSON: {e}", exc_info=True)
            raise

    def save_transcript(
        self,
        text: str,
        title: str = "Transcrição",
        formats: list[str] | None = None,
        **metadata,
    ) -> dict[str, Path]:
        formats = formats or ["pdf", "txt", "json"]
        results = {}

        base_filename = self._get_timestamp_filename("")

        if "pdf" in formats:
            results["pdf"] = self.save_as_pdf(
                text,
                title=title,
                filename=f"{base_filename}.pdf",
            )

        if "txt" in formats:
            results["txt"] = self.save_as_text(
                text,
                filename=f"{base_filename}.txt",
            )

        if "json" in formats:
            json_data = {
                "title": title,
                "text": text,
                "timestamp": datetime.now().isoformat(),
                "filename_base": base_filename,
                "formats": list(results.keys()),
                **metadata,
            }
            results["json"] = self.save_as_json(
                json_data,
                filename=f"{base_filename}_metadata.json",
            )

        logger.info(
            f"Transcrição salva em {len(results)} formato(s): {', '.join(results.keys())}"
        )
        return results

    def list_transcripts(self) -> dict[str, list[str]]:
        return {
            "pdfs": sorted([f.name for f in self.pdfs_dir.glob("*.pdf")]),
            "texts": sorted([f.name for f in self.texts_dir.glob("*.txt")]),
            "metadata": sorted([f.name for f in self.metadata_dir.glob("*.json")]),
        }
