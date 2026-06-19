from __future__ import annotations

from datetime import datetime
from pathlib import Path
from textwrap import wrap

PAGE_W = 595
PAGE_H = 842
MARGIN = 46
CONTENT_W = PAGE_W - MARGIN * 2

INK = (0.169, 0.129, 0.106)
COPY = (0.435, 0.353, 0.298)
MOCHA = (0.431, 0.290, 0.184)
BEIGE = (0.937, 0.898, 0.855)
SOFT = (1.0, 0.976, 0.957)
BORDER = (0.847, 0.761, 0.682)
GREEN = (0.435, 0.478, 0.376)
WARN = (0.541, 0.290, 0.231)
WHITE = (1, 1, 1)


def esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def text_width(text: str, size: float) -> float:
    # Conservative Helvetica approximation. Enough for manual wrapping.
    wide = sum(1 for char in text if char in "MW@#%&")
    narrow = sum(1 for char in text if char in " il.,:;!'|")
    normal = max(len(text) - wide - narrow, 0)
    return size * (wide * 0.82 + normal * 0.52 + narrow * 0.28)


def wrap_text(text: str, size: float, width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if text_width(candidate, size) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            if text_width(word, size) > width:
                lines.extend(wrap(word, max(int(width / (size * 0.52)), 8)))
                current = ""
            else:
                current = word
    if current:
        lines.append(current)
    return lines or [""]


class PdfManual:
    def __init__(self) -> None:
        self.pages: list[list[str]] = []
        self.current: list[str] = []
        self.y = PAGE_H - MARGIN
        self.add_page()

    def add_page(self) -> None:
        if self.current:
            self.footer()
            self.pages.append(self.current)
        self.current = []
        self.y = PAGE_H - MARGIN

    def footer(self) -> None:
        self.line(MARGIN, 32, PAGE_W - MARGIN, 32, BORDER, 0.6)
        self.text("Manual de Turnos de Inventario - Dra. Estefany Ballesteros", PAGE_W / 2, 20, 8, COPY, "F1", center=True)

    def ensure(self, needed: float) -> None:
        if self.y - needed < 52:
            self.add_page()

    def rect(self, x: float, y: float, w: float, h: float, fill=None, stroke=None, width: float = 0.8) -> None:
        parts = ["q"]
        if fill:
            parts.append(f"{fill[0]:.3f} {fill[1]:.3f} {fill[2]:.3f} rg")
        if stroke:
            parts.append(f"{stroke[0]:.3f} {stroke[1]:.3f} {stroke[2]:.3f} RG {width:.2f} w")
        parts.append(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re")
        parts.append("B" if fill and stroke else "f" if fill else "S")
        parts.append("Q")
        self.current.append(" ".join(parts))

    def line(self, x1: float, y1: float, x2: float, y2: float, color, width: float = 1) -> None:
        self.current.append(
            f"q {color[0]:.3f} {color[1]:.3f} {color[2]:.3f} RG {width:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S Q"
        )

    def text(self, text: str, x: float, y: float, size: float, color=INK, font="F1", center: bool = False) -> None:
        if center:
            x = x - text_width(text, size) / 2
        self.current.append(
            f"BT /{font} {size:.2f} Tf {color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg {x:.2f} {y:.2f} Td ({esc(text)}) Tj ET"
        )

    def paragraph(self, text: str, size: float = 11, color=INK, font="F1", width: float = CONTENT_W, indent: float = 0, after: float = 10) -> None:
        lines = wrap_text(text, size, width)
        line_h = size * 1.42
        self.ensure(line_h * len(lines) + after)
        for line in lines:
            self.y -= line_h
            self.text(line, MARGIN + indent, self.y, size, color, font)
        self.y -= after

    def heading(self, text: str, level: int = 1) -> None:
        size = 21 if level == 1 else 15
        self.ensure(size * 2.8)
        self.y -= 12 if level == 1 else 8
        self.text(text, MARGIN, self.y, size, MOCHA, "F2")
        self.y -= 8
        if level == 1:
            self.line(MARGIN, self.y, PAGE_W - MARGIN, self.y, BEIGE, 1)
            self.y -= 8

    def bullet(self, text: str) -> None:
        lines = wrap_text(text, 11, CONTENT_W - 18)
        line_h = 15
        self.ensure(line_h * len(lines) + 5)
        self.y -= line_h
        self.text("•", MARGIN + 3, self.y, 11, MOCHA, "F2")
        self.text(lines[0], MARGIN + 18, self.y, 11, INK)
        for line in lines[1:]:
            self.y -= line_h
            self.text(line, MARGIN + 18, self.y, 11, INK)
        self.y -= 4

    def note(self, title: str, body: str, warn: bool = False) -> None:
        title_lines = wrap_text(title, 11, CONTENT_W - 26)
        body_lines = wrap_text(body, 10.5, CONTENT_W - 26)
        h = 20 + len(title_lines) * 14 + len(body_lines) * 14
        self.ensure(h + 12)
        y0 = self.y - h
        self.rect(MARGIN, y0, CONTENT_W, h, SOFT, BORDER, 0.8)
        self.rect(MARGIN, y0, 6, h, WARN if warn else GREEN, None)
        ty = self.y - 17
        for line in title_lines:
            self.text(line, MARGIN + 16, ty, 11, WARN if warn else GREEN, "F2")
            ty -= 14
        for line in body_lines:
            self.text(line, MARGIN + 16, ty, 10.5, INK)
            ty -= 14
        self.y = y0 - 14

    def table(self, headers: list[str], rows: list[list[str]], widths: list[float] | None = None) -> None:
        widths = widths or [CONTENT_W / len(headers)] * len(headers)
        x_positions = [MARGIN]
        for width in widths[:-1]:
            x_positions.append(x_positions[-1] + width)

        def row_height(row: list[str], header: bool = False) -> float:
            size = 9.5 if header else 9.2
            max_lines = max(len(wrap_text(cell, size, widths[idx] - 12)) for idx, cell in enumerate(row))
            return max(25, 12 + max_lines * 12)

        header_h = row_height(headers, True)
        self.ensure(header_h + 20)
        self.y -= header_h
        for idx, header in enumerate(headers):
            self.rect(x_positions[idx], self.y, widths[idx], header_h, MOCHA, MOCHA, 0.6)
            for line_idx, line in enumerate(wrap_text(header, 9.5, widths[idx] - 12)):
                self.text(line, x_positions[idx] + 6, self.y + header_h - 15 - line_idx * 11, 9.5, WHITE, "F2")

        for row in rows:
            h = row_height(row)
            self.ensure(h + 8)
            self.y -= h
            for idx, cell in enumerate(row):
                fill = BEIGE if idx == 0 else WHITE
                self.rect(x_positions[idx], self.y, widths[idx], h, fill, BORDER, 0.6)
                font = "F2" if idx == 0 else "F1"
                for line_idx, line in enumerate(wrap_text(cell, 9.2, widths[idx] - 12)):
                    self.text(line, x_positions[idx] + 6, self.y + h - 14 - line_idx * 11, 9.2, INK, font)
        self.y -= 14

    def checklist(self, items: list[str]) -> None:
        col_w = (CONTENT_W - 10) / 2
        for idx in range(0, len(items), 2):
            pair = items[idx : idx + 2]
            heights = []
            for item in pair:
                heights.append(20 + len(wrap_text(item, 9.5, col_w - 16)) * 12)
            h = max(heights)
            self.ensure(h + 10)
            self.y -= h
            for col, item in enumerate(pair):
                x = MARGIN + col * (col_w + 10)
                self.rect(x, self.y, col_w, h, SOFT, BORDER, 0.6)
                self.text("✓", x + 8, self.y + h - 17, 10, GREEN, "F2")
                for line_idx, line in enumerate(wrap_text(item, 9.5, col_w - 28)):
                    self.text(line, x + 22, self.y + h - 17 - line_idx * 12, 9.5, INK)
            self.y -= 10

    def cover(self, date_text: str) -> None:
        h = 168
        self.rect(MARGIN, self.y - h, CONTENT_W, h, MOCHA, None)
        self.text("MANUAL OPERATIVO", MARGIN + 30, self.y - 42, 9.5, BEIGE, "F2")
        self.text("Turnos de Inventario", MARGIN + 30, self.y - 82, 29, WHITE, "F2")
        self.paragraph(
            "Apertura, conteo fisico, cierre responsable y trazabilidad del modulo de inventario.",
            size=12,
            color=WHITE,
            font="F1",
            width=CONTENT_W - 60,
            indent=30,
            after=0,
        )
        self.y = PAGE_H - MARGIN - h - 26
        self.table(
            ["Campo", "Detalle"],
            [
                ["Modulo", "Panel / Inventario / Conteos"],
                ["Dirigido a", "Doctoras, asistentes y administracion"],
                ["Objetivo", "Evitar cierres duplicados, dejar auditoria y proteger el historial existente"],
                ["Fecha", date_text],
            ],
            [145, CONTENT_W - 145],
        )

    def save(self, path: Path) -> None:
        self.footer()
        self.pages.append(self.current)

        objects: list[bytes] = []
        catalog_id = 1
        pages_id = 2
        font_regular_id = 3
        font_bold_id = 4
        page_ids: list[int] = []
        content_ids: list[int] = []

        next_id = 5
        for _ in self.pages:
            page_ids.append(next_id)
            content_ids.append(next_id + 1)
            next_id += 2

        objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
        kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
        objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode())
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

        for page_id, content_id, commands in zip(page_ids, content_ids, self.pages):
            page_obj = (
                f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] "
                f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            )
            stream = "\n".join(commands).encode("latin-1", errors="replace")
            content_obj = b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
            objects.append(page_obj.encode())
            objects.append(content_obj)

        with path.open("wb") as file:
            file.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
            offsets = [0]
            for idx, obj in enumerate(objects, start=1):
                offsets.append(file.tell())
                file.write(f"{idx} 0 obj\n".encode())
                file.write(obj)
                file.write(b"\nendobj\n")
            xref_offset = file.tell()
            file.write(f"xref\n0 {len(objects) + 1}\n".encode())
            file.write(b"0000000000 65535 f \n")
            for offset in offsets[1:]:
                file.write(f"{offset:010d} 00000 n \n".encode())
            file.write(
                f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode()
            )


def build_manual() -> PdfManual:
    today = datetime.now().strftime("%d/%m/%Y")
    pdf = PdfManual()
    pdf.cover(today)
    pdf.note(
        "Punto importante",
        "Este flujo no borra inventarios anteriores. Los turnos abiertos existentes siguen registrados y solo cambian cuando la responsable que los abrio realiza el cierre.",
    )

    pdf.heading("1. Que es un turno de inventario")
    pdf.paragraph(
        "Un turno de inventario es una fotografia operativa del stock en una ubicacion. Al abrirlo, el sistema guarda cuanto habia en ese momento. Al cerrarlo, la responsable registra el conteo fisico y el sistema calcula diferencias."
    )
    for item in [
        "El turno abierto queda visible en Inventario > Conteos.",
        "Cada turno guarda fecha y hora de apertura.",
        "Cada turno guarda quien lo abrio y quien lo cerro.",
        "El cierre actualiza el stock solo al finalizar el turno.",
    ]:
        pdf.bullet(item)
    pdf.note(
        "Regla de seguridad",
        "Solo la responsable que abrio el turno puede cerrarlo. Si otra persona entra, vera el turno pero no podra completar el cierre.",
        warn=True,
    )

    pdf.heading("2. Flujo diario recomendado")
    pdf.table(
        ["Momento", "Accion", "Resultado"],
        [
            ["Inicio", "Abrir turno en Inventario > Conteos.", "Se guarda stock inicial, hora y responsable."],
            ["Durante el dia", "Registrar entradas, salidas, mermas o uso clinico.", "El sistema mantiene el stock actualizado."],
            ["Antes del cierre", "Revisar lineas del turno abierto.", "Se compara stock esperado contra conteo fisico."],
            ["Cierre", "Registrar conteo fisico y cerrar turno.", "Se calculan diferencias y se actualiza stock final."],
            ["Revision", "Consultar historial de turnos cerrados.", "Queda evidencia de fecha, hora y responsable."],
        ],
        [105, 205, CONTENT_W - 310],
    )

    pdf.heading("3. Como abrir un turno")
    for item in [
        "Entrar al panel administrativo.",
        "Abrir Inventario.",
        "Entrar a la pestana Conteos.",
        "Presionar Abrir turno.",
        "Elegir ubicacion si corresponde, escribir nombre del turno y notas de apertura.",
        "Guardar.",
    ]:
        pdf.bullet(item)
    pdf.paragraph(
        "Al guardar, el sistema crea las lineas del turno con el stock actual de los items activos. Eso permite comparar luego cuanto se dejo al inicio y cuanto se conto al cierre."
    )

    pdf.heading("4. Como registrar el conteo de cierre")
    for item in [
        "Entrar a Inventario > Conteos.",
        "Buscar el turno abierto.",
        "En cada item, revisar el campo Esperado.",
        "Escribir el stock fisico real en Contado.",
        "Agregar nota si hay diferencia o explicacion.",
        "Presionar Guardar en la linea si se desea guardar parcialmente.",
    ]:
        pdf.bullet(item)
    pdf.paragraph(
        "La diferencia se calcula automaticamente como Contado menos Esperado. Si el resultado es 0, el stock fisico coincide con el sistema. Si es positivo o negativo, esa diferencia se aplicara al cerrar el turno."
    )

    pdf.heading("5. Como cerrar el turno")
    for item in [
        "Verificar que todos los items tengan el conteo correcto.",
        "Escribir notas de cierre si corresponde.",
        "Presionar Cerrar turno.",
        "El sistema guarda los conteos pendientes antes de cerrar.",
        "El sistema actualiza el stock final y registra movimientos de tipo conteo cuando hay diferencia.",
        "El turno cambia de abierto a cerrado y ya no puede reabrirse desde la pantalla.",
    ]:
        pdf.bullet(item)
    pdf.note(
        "Quien puede cerrar",
        "El boton solo queda disponible para la responsable que abrio el turno. Para las demas personas aparece bloqueado como Solo responsable.",
        warn=True,
    )

    pdf.heading("6. Que se guarda al cerrar")
    pdf.table(
        ["Dato guardado", "Para que sirve"],
        [
            ["Fecha y hora de apertura", "Saber cuando comenzo el turno."],
            ["Responsable de apertura", "Saber quien dejo iniciado el control."],
            ["Stock inicial", "Comparar con el stock esperado y el conteo fisico."],
            ["Conteo fisico", "Registrar lo que realmente existe."],
            ["Diferencia", "Identificar sobrantes o faltantes."],
            ["Fecha y hora de cierre", "Auditoria del cierre."],
            ["Responsable de cierre", "Confirmar quien cerro el turno."],
        ],
        [175, CONTENT_W - 175],
    )
    pdf.paragraph(
        "Si hay diferencias, se generan registros de ajuste y movimientos de inventario. Esto permite revisar despues por que cambio el stock, sin borrar ni sobrescribir la historia."
    )

    pdf.heading("7. Que NO hace este cambio")
    for item in [
        "No borra turnos abiertos existentes.",
        "No elimina conteos anteriores.",
        "No elimina items, lotes, movimientos ni proveedores.",
        "No cambia automaticamente un turno abierto a cerrado.",
        "No permite que otra persona cierre un turno ajeno.",
        "No modifica la responsable original de apertura.",
    ]:
        pdf.bullet(item)
    pdf.note(
        "Si hay turnos antiguos",
        "Un turno antiguo que ya esta abierto permanecera abierto. Para cerrarlo debe entrar la misma cuenta responsable de apertura. Si el turno antiguo no tiene responsable, debe revisarse con administracion antes de intervenirlo.",
    )

    pdf.heading("8. Errores comunes y solucion")
    pdf.table(
        ["Situacion", "Causa probable", "Que hacer"],
        [
            ["Boton bloqueado", "No eres quien abrio el turno.", "Pedir a la responsable que lo cierre."],
            ["No aparece un item", "Item inactivo, archivado o de otra ubicacion.", "Revisar catalogo y ubicacion."],
            ["Diferencia negativa", "Falta stock fisico.", "Anotar motivo y cerrar solo si esta verificado."],
            ["Diferencia positiva", "Hay mas stock que el esperado.", "Confirmar conteo y revisar movimientos no registrados."],
            ["No deja abrir turno", "Ya existe uno abierto en la ubicacion.", "Cerrar el turno anterior primero."],
            ["Error de migracion", "Base remota sin SQL actualizado.", "Aplicar migraciones de Supabase y recargar."],
        ],
        [125, 180, CONTENT_W - 305],
    )

    pdf.heading("9. Checklist rapido para responsable")
    pdf.checklist(
        [
            "Abrir turno al iniciar el control del dia o de la ubicacion.",
            "No compartir usuario para abrir o cerrar turnos.",
            "Revisar lineas con diferencia antes de cerrar.",
            "Escribir nota cuando haya faltante, sobrante, merma o vencimiento.",
            "Cerrar el turno el mismo dia siempre que sea posible.",
            "Exportar reporte si se necesita respaldo administrativo.",
        ]
    )
    return pdf


if __name__ == "__main__":
    output = Path("manuales") / "Manual_Turnos_Inventario.pdf"
    output.parent.mkdir(parents=True, exist_ok=True)
    build_manual().save(output)
    print(output.resolve())
