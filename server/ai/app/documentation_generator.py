import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (PageBreak, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

logger = logging.getLogger(__name__)


class DocumentationGenerator:
    def __init__(self, output_dir: Optional[str] = None):
        self.output_dir = Path(output_dir or "./output/documentation")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_project_documentation(
        self, filename: str = "Festival2026_Documentacao.pdf"
    ) -> Path:
        filepath = self.output_dir / filename
        filepath = filepath.resolve()

        try:
            doc = SimpleDocTemplate(
                str(filepath),
                pagesize=A4,
                rightMargin=0.75 * inch,
                leftMargin=0.75 * inch,
                topMargin=1 * inch,
                bottomMargin=0.75 * inch,
                title="Festival 2026 - Documentação",
                author="DualLibras.AI",
            )

            styles = getSampleStyleSheet()

            header_style = ParagraphStyle(
                "CustomHeader",
                parent=styles["Heading1"],
                fontSize=28,
                textColor=colors.HexColor("#1a472a"),
                spaceAfter=6,
                alignment=1,
                fontName="Helvetica-Bold",
            )

            subheader_style = ParagraphStyle(
                "CustomSubheader",
                parent=styles["Heading2"],
                fontSize=14,
                textColor=colors.HexColor("#2d5f3f"),
                spaceAfter=12,
                spaceBefore=12,
                fontName="Helvetica-Bold",
            )

            section_title_style = ParagraphStyle(
                "SectionTitle",
                parent=styles["Heading3"],
                fontSize=12,
                textColor=colors.HexColor("#1a472a"),
                spaceAfter=8,
                spaceBefore=8,
                fontName="Helvetica-Bold",
            )

            body_style = ParagraphStyle(
                "CustomBody",
                parent=styles["BodyText"],
                fontSize=10,
                alignment=4,
                spaceAfter=10,
                leading=14,
            )

            story = []

            story.append(Spacer(1, 0.2 * inch))
            story.append(Paragraph("FESTIVAL 2026", header_style))
            story.append(
                Paragraph(
                    "Sistema de Transcrição em Tempo Real com Libras", subheader_style
                )
            )

            now = datetime.now()
            date_str = now.strftime("%d de %B de %Y")
            story.append(
                Paragraph(
                    f"<i>Documento gerado em {date_str} | Versão 1.0</i>",
                    styles["Normal"],
                )
            )
            story.append(Spacer(1, 0.4 * inch))

            footer_data = [["" for _ in range(1)]]
            footer_table = Table(footer_data, colWidths=[7 * inch])
            footer_table.setStyle(
                TableStyle(
                    [("LINEABOVE", (0, 0), (-1, -1), 2, colors.HexColor("#1a472a"))]
                )
            )
            story.append(footer_table)
            story.append(Spacer(1, 0.3 * inch))

            story.append(Paragraph("Introdução", section_title_style))
            story.append(
                Paragraph(
                    "O <b>Festival 2026</b> é uma plataforma inovadora de transcrição de áudio em tempo real "
                    "com tradução automática para Libras. O sistema combina tecnologias avançadas de reconhecimento "
                    "de fala com tradução visual, tornando eventos mais acessíveis para pessoas surdas e com deficiência auditiva.",
                    body_style,
                )
            )
            story.append(Spacer(1, 0.2 * inch))

            story.append(Paragraph("Funcionalidades Principais", section_title_style))
            features = [
                "- <b>Transcrição em Tempo Real:</b> Captura e transcreve áudio em português com latência mínima",
                "- <b>Tradução para Libras:</b> Conversão automática de texto para Libras com avatar 3D",
                "- <b>Salvamento Automático:</b> Transcrições salvas em PDF, TXT e JSON para fácil acesso",
                "- <b>API REST integrada:</b> Endpoints para gerenciar e recuperar transcrições",
                "- <b>Suporte a Múltiplos Formatos:</b> Transcrições em texto plano, PDF e dados estruturados",
                "- <b>Interface Web intuitiva:</b> Dashboard para gerenciar documentos e transcrições",
            ]
            for feature in features:
                story.append(Paragraph(feature, body_style))
            story.append(Spacer(1, 0.2 * inch))

            story.append(PageBreak())
            story.append(Paragraph("Como Usar", section_title_style))

            story.append(Paragraph("<b>1. Setup Inicial</b>", styles["Heading4"]))
            setup_code = (
                "cd server<br/>"
                "python3 -m venv venv<br/>"
                "source venv/bin/activate<br/>"
                "pip install -r requirements.txt"
            )
            story.append(Paragraph(setup_code, styles["Code"]))
            story.append(Spacer(1, 0.15 * inch))

            story.append(Paragraph("<b>2. Iniciar o Backend</b>", styles["Heading4"]))
            story.append(
                Paragraph(
                    "source venv/bin/activate<br/>python main.py",
                    styles["Code"],
                )
            )
            story.append(
                Paragraph(
                    "O servidor estará disponível em <b>http://localhost:5455</b>",
                    body_style,
                )
            )
            story.append(Spacer(1, 0.3 * inch))

            story.append(Paragraph("API Endpoints Disponíveis", section_title_style))

            endpoints_data = [
                ["Método", "Endpoint", "Descrição"],
                ["POST", "/save-transcript", "Salva transcrição em múltiplos formatos"],
                ["GET", "/transcripts", "Lista todas as transcrições salvas"],
                [
                    "GET",
                    "/transcripts/download/{id}",
                    "Baixa uma transcrição específica",
                ],
                ["GET", "/upload-status", "Mostra status de armazenamento"],
                ["GET", "/health", "Health check do servidor"],
            ]
            endpoints_table = Table(
                endpoints_data, colWidths=[1 * inch, 2 * inch, 3.5 * inch]
            )
            endpoints_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2d5f3f")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, 0), 9),
                        ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                        ("GRID", (0, 0), (-1, -1), 1, colors.grey),
                        ("FONTSIZE", (0, 1), (-1, -1), 8),
                    ]
                )
            )
            story.append(endpoints_table)
            story.append(Spacer(1, 0.3 * inch))

            story.append(PageBreak())
            story.append(Spacer(1, 0.5 * inch))

            footer_text = (
                "<b>Festival 2026 - Sistema de Acessibilidade em Tempo Real</b><br/>"
                "Desenvolvido com <b>Python</b>, <b>FastAPI</b>, <b>React</b> e <b>TypeScript</b><br/>"
                "Para mais informações, consulte o README.md ou acesse http://localhost:5173"
            )
            story.append(Paragraph(footer_text, styles["Normal"]))

            story.append(Spacer(1, 0.2 * inch))
            divider = [["" for _ in range(1)]]
            divider_table = Table(divider, colWidths=[7 * inch])
            divider_table.setStyle(
                TableStyle([("LINEABOVE", (0, 0), (-1, -1), 1, colors.grey)])
            )
            story.append(divider_table)

            story.append(Spacer(1, 0.1 * inch))
            story.append(
                Paragraph(
                    "<small>© 2026 DualLibras.AI | Documento gerado automaticamente</small>",
                    styles["Normal"],
                )
            )

            doc.build(story)
            logger.info(f"Documentação gerada: {filepath}")
            return filepath

        except Exception as e:
            logger.error(f"Erro ao gerar documentação: {e}", exc_info=True)
            raise
