# -*- coding: utf-8 -*-
"""
Script to generate a comprehensive, beautifully styled Microsoft Word (.docx) document
from the "đề mới" folder containing 10 reading fill-in-the-blank (Open Cloze) exams.
"""

import os
import re
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    """Sets background color of a table cell."""
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=120, bottom=120, left=180, right=180):
    """Sets inner padding for a table cell (in dxa: 20 dxa = 1 pt)."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)

def set_table_borders(table, color="D1D5DB", sz="4", val="single"):
    """Sets subtle borders for a table."""
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:left w:val="none"/>'
        f'<w:right w:val="none"/>'
        f'<w:insideV w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

def set_box_borders(table, color="3B82F6", sz="12"):
    """Sets a left border callout box style."""
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
        f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
        f'<w:left w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'<w:right w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
        f'<w:insideH w:val="none"/>'
        f'<w:insideV w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

def parse_answers(file_path):
    """Parses full-đáp-án.txt into structured per-exam answers."""
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = [l.strip() for l in f]

    answers = {}
    current_de = None

    for line in lines:
        m = re.match(r'Đề\s*0?(\d+)', line, re.IGNORECASE)
        if m:
            current_de = int(m.group(1))
            answers[current_de] = []
            continue
        am = re.match(r'^(\d+)[\.\s]+(.+)$', line)
        if am and current_de is not None:
            raw_ans = am.group(2).strip()
            # Split if there's alternative answers
            parts = [p.strip() for p in raw_ans.split('/')]
            main_ans = parts[0]
            alt_ans = ' / '.join(parts[1:]) if len(parts) > 1 else ''
            answers[current_de].append({
                'raw': raw_ans,
                'main': main_ans,
                'alts': alt_ans
            })

    return answers

def extract_context_sentences(raw_text):
    """Extracts intelligent context sentences for each blank in the text."""
    clean = raw_text.replace('\r\n', ' ').replace('\n', ' ')
    clean = re.sub(r'\s+', ' ', clean)

    regex = re.compile(r'\((\d+)\)[_.\s]*')
    matches = []
    for m in regex.finditer(clean):
        matches.append({
            'num': int(m.group(1)),
            'start': m.start(),
            'end': m.end()
        })

    items = []
    for i, m in enumerate(matches):
        prev_end = 0 if i == 0 else matches[i - 1]['end']
        next_start = len(clean) if i == len(matches) - 1 else matches[i + 1]['start']

        left = clean[prev_end:m['start']].strip()
        p_match = re.search(r'(?:[.!?•]|^)\s*([^.!?•]+)$', left)
        left_clause = p_match.group(1).strip() if p_match else left
        if len(left_clause) > 85:
            sp = left_clause.find(' ', len(left_clause) - 75)
            left_clause = '...' + (left_clause[sp + 1:] if sp != -1 else left_clause[-70:])

        right = clean[m['end']:next_start].strip()
        r_match = re.search(r'^([^.!?•]+(?:[.!?•]|$))', right)
        right_clause = r_match.group(1).strip() if r_match else right
        if len(right_clause) > 95:
            sp = right_clause.rfind(' ', 0, 85)
            right_clause = (right_clause[:sp] if sp != -1 else right_clause[:80]) + '...'

        sentence = f"{left_clause} ({m['num']}) _________ {right_clause}".strip()
        sentence = re.sub(r'\s+', ' ', sentence)
        sentence = re.sub(r'^[,;:]\s*', '', sentence)

        items.append({
            'num': m['num'],
            'sentence': sentence
        })

    return items

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    de_moi_dir = os.path.join(base_dir, 'đề mới')
    answers_file = os.path.join(de_moi_dir, 'full-đáp-án.txt')

    answers_dict = parse_answers(answers_file)

    titles = [
        "Steven Adams – Cầu thủ bóng rổ New Zealand (NBA Star)",
        "Selena Gomez – Nữ ca sĩ & diễn viên tài năng",
        "Superfans – Chương trình phát thanh về các thần tượng thể thao",
        "How I Met Myself & Tác phẩm văn học",
        "Thông tin học phần & Các môn học tự chọn đại học",
        "Sam Kerr – Ngôi sao bóng đá nữ đội tuyển Australia",
        "Andy Robertson – Hậu vệ & thủ quân Liverpool FC",
        "Trải nghiệm làm việc cho tạp chí du lịch tại Indonesia",
        "Hội chợ bánh ngọt từ thiện vì bệnh nhi Bệnh viện Rose",
        "Willie – Chú vẹt cứu tinh dũng cảm tại Denver, Mỹ"
    ]

    doc = docx.Document()

    # Set Margins
    for sec in doc.sections:
        sec.top_margin = Inches(0.8)
        sec.bottom_margin = Inches(0.8)
        sec.left_margin = Inches(0.8)
        sec.right_margin = Inches(0.8)

    # Base Styles
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(11)
    normal_style.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
    normal_style.paragraph_format.line_spacing = 1.2
    normal_style.paragraph_format.space_after = Pt(4)

    # -------------------------------------------------------------
    # COVER / HEADER SECTION
    # -------------------------------------------------------------
    p_badge = doc.add_paragraph()
    p_badge.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_badge = p_badge.add_run("B1 PRELIMINARY · READING OPEN CLOZE")
    run_badge.font.size = Pt(9.5)
    run_badge.font.bold = True
    run_badge.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_title = p_title.add_run("TÀI LIỆU ÔN THI ĐỌC B1 TIẾNG ANH\n10 BÀI ĐIỀN TỪ (120 CÂU HỎI)")
    run_title.font.size = Pt(22)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
    p_title.paragraph_format.space_after = Pt(6)

    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_sub = p_sub.add_run("Tuyển tập 10 bài đọc Open Cloze mới nhất · Kèm câu hỏi ngữ cảnh & Đáp án chi tiết")
    run_sub.font.size = Pt(12)
    run_sub.font.italic = True
    run_sub.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
    p_sub.paragraph_format.space_after = Pt(16)

    # Info Summary Box
    info_tbl = doc.add_table(rows=1, cols=1)
    info_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    info_cell = info_tbl.cell(0, 0)
    set_cell_background(info_cell, "F1F5F9")
    set_cell_margins(info_cell, top=140, bottom=140, left=200, right=200)
    set_box_borders(info_tbl, color="2563EB", sz="16")

    info_p = info_cell.paragraphs[0]
    info_p.paragraph_format.space_after = Pt(3)
    r_h = info_p.add_run("📌 MỤC TIÊU VÀ HƯỚNG DẪN ÔN LUYỆN DẠNG BÀI ĐIỀN TỪ (OPEN CLOZE):\n")
    r_h.font.bold = True
    r_h.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    info_items = [
        "• Dạng bài: Điền 01 từ thích hợp nhất vào mỗi chỗ trống trong bài đọc (thường là giới từ, đại từ, liên từ, trợ động từ hoặc từ vựng ngữ cảnh).",
        "• Quy mô: 10 Đề luyện tập hoàn chỉnh, tương ứng 120 chỗ trống (12 câu/đề, đánh số từ 14 đến 25 chuẩn form đề thi).",
        "• Cấu trúc mỗi đề gồm 3 phần: (1) Bài đọc nguyên bản, (2) Câu hỏi ngữ cảnh bao quanh chỗ trống, (3) Bảng đáp án & phương án tương đương.",
        "• Ở cuối tài liệu có Bảng tổng hợp toàn bộ 120 đáp án để tra cứu nhanh khi chấm điểm."
    ]
    for it in info_items:
        p_it = info_cell.add_paragraph()
        p_it.paragraph_format.space_after = Pt(2)
        r_it = p_it.add_run(it)
        r_it.font.size = Pt(10)
        r_it.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # Table of Contents
    p_toc_title = doc.add_paragraph()
    r_toc = p_toc_title.add_run("MỤC LỤC CÁC ĐỀ THI")
    r_toc.font.size = Pt(13)
    r_toc.font.bold = True
    r_toc.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
    p_toc_title.paragraph_format.space_after = Pt(6)

    toc_table = doc.add_table(rows=11, cols=3)
    toc_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(toc_table, color="CBD5E1")

    # Table Header
    headers = ["Đề số", "Chủ đề bài đọc", "Số câu"]
    col_widths = [Inches(1.0), Inches(4.5), Inches(1.3)]

    hdr_cells = toc_table.rows[0].cells
    for ci, h_text in enumerate(headers):
        hdr_cells[ci].text = h_text
        set_cell_background(hdr_cells[ci], "2563EB")
        set_cell_margins(hdr_cells[ci], top=100, bottom=100, left=120, right=120)
        p = hdr_cells[ci].paragraphs[0]
        p.runs[0].font.bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(10)
        if ci != 1:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    for idx, title in enumerate(titles):
        row_cells = toc_table.rows[idx + 1].cells
        row_cells[0].text = f"Đề {idx + 1:02d}"
        row_cells[1].text = title
        row_cells[2].text = "12 câu (14–25)"

        bg = "F8FAFC" if idx % 2 == 1 else "FFFFFF"
        for ci in range(3):
            set_cell_background(row_cells[ci], bg)
            set_cell_margins(row_cells[ci], top=70, bottom=70, left=120, right=120)
            p = row_cells[ci].paragraphs[0]
            p.runs[0].font.size = Pt(10)
            if ci != 1:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Apply col widths
    for row in toc_table.rows:
        for ci, w in enumerate(col_widths):
            row.cells[ci].width = w

    # -------------------------------------------------------------
    # 10 EXAMS CONTENT
    # -------------------------------------------------------------
    for de_num in range(1, 11):
        doc.add_page_break()

        txt_file = os.path.join(de_moi_dir, f"đề {de_num}.txt")
        with open(txt_file, 'r', encoding='utf-8') as f:
            raw_text = f.read()

        title_text = titles[de_num - 1]
        context_items = extract_context_sentences(raw_text)
        ans_list = answers_dict.get(de_num, [])

        # Heading 1: Exam Header
        p_de_hdr = doc.add_paragraph()
        r_de_tag = p_de_hdr.add_run(f"ĐỀ SỐ {de_num:02d}\n")
        r_de_tag.font.size = Pt(12)
        r_de_tag.font.bold = True
        r_de_tag.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

        r_de_title = p_de_hdr.add_run(title_text)
        r_de_title.font.size = Pt(16)
        r_de_title.font.bold = True
        r_de_title.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
        p_de_hdr.paragraph_format.space_after = Pt(10)

        # ---------------------------------------------------------
        # Section 1: Reading Passage
        # ---------------------------------------------------------
        p_sec1 = doc.add_paragraph()
        r_sec1 = p_sec1.add_run("1. BÀI ĐỌC (READING PASSAGE)")
        r_sec1.font.size = Pt(12)
        r_sec1.font.bold = True
        r_sec1.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
        p_sec1.paragraph_format.space_after = Pt(4)

        p_instruction = doc.add_paragraph()
        r_inst = p_instruction.add_run("Đọc đoạn văn dưới đây và điền MỘT từ thích hợp vào mỗi chỗ trống từ (14) đến (25):")
        r_inst.font.italic = True
        r_inst.font.size = Pt(10)
        r_inst.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
        p_instruction.paragraph_format.space_after = Pt(6)

        # Passage Box
        passage_tbl = doc.add_table(rows=1, cols=1)
        passage_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        p_cell = passage_tbl.cell(0, 0)
        set_cell_background(p_cell, "F8FAFC")
        set_cell_margins(p_cell, top=140, bottom=140, left=180, right=180)
        set_box_borders(passage_tbl, color="6366F1", sz="10")

        # Split passage into paragraphs
        raw_paras = [p.strip() for p in raw_text.split('\n') if p.strip()]
        for pi, para in enumerate(raw_paras):
            para_p = p_cell.paragraphs[0] if pi == 0 else p_cell.add_paragraph()
            para_p.paragraph_format.line_spacing = 1.3
            para_p.paragraph_format.space_after = Pt(5)

            # Highlight blanks like (14)_______
            tokens = re.split(r'(\(\d+\)[_.\s]*)', para)
            for tok in tokens:
                if re.match(r'^\(\d+\)', tok):
                    m_num = re.match(r'^\((\d+)\)', tok).group(1)
                    r = para_p.add_run(f"({m_num}) _________")
                    r.font.bold = True
                    r.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)
                else:
                    r = para_p.add_run(tok)
                    r.font.size = Pt(10.5)

        doc.add_paragraph().paragraph_format.space_after = Pt(8)

        # ---------------------------------------------------------
        # Section 2: Context Questions
        # ---------------------------------------------------------
        p_sec2 = doc.add_paragraph()
        r_sec2 = p_sec2.add_run("2. CÂU HỎI NGỮ CẢNH TỪNG CHỖ TRỐNG")
        r_sec2.font.size = Pt(12)
        r_sec2.font.bold = True
        r_sec2.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
        p_sec2.paragraph_format.space_after = Pt(6)

        # Table of Questions
        q_table = doc.add_table(rows=len(context_items) + 1, cols=3)
        q_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(q_table, color="E2E8F0")

        q_col_widths = [Inches(0.9), Inches(4.7), Inches(1.2)]
        q_headers = ["Câu số", "Dòng câu văn chứa từ cần điền", "Ghi đáp án"]

        for ci, h_text in enumerate(q_headers):
            c = q_table.rows[0].cells[ci]
            c.text = h_text
            set_cell_background(c, "3B82F6")
            set_cell_margins(c, top=80, bottom=80, left=100, right=100)
            p = c.paragraphs[0]
            p.runs[0].font.bold = True
            p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            p.runs[0].font.size = Pt(9.5)
            if ci != 1:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        for qi, q_item in enumerate(context_items):
            row_cells = q_table.rows[qi + 1].cells
            row_cells[0].text = f"Câu ({q_item['num']})"
            row_cells[1].text = q_item['sentence']
            row_cells[2].text = "...................."

            bg = "F8FAFC" if qi % 2 == 1 else "FFFFFF"
            for ci in range(3):
                set_cell_background(row_cells[ci], bg)
                set_cell_margins(row_cells[ci], top=70, bottom=70, left=100, right=100)
                p = row_cells[ci].paragraphs[0]
                p.runs[0].font.size = Pt(9.5)
                if ci == 0:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p.runs[0].font.bold = True
                    p.runs[0].font.color.rgb = RGBColor(0x25, 0x63, 0xEB)
                elif ci == 2:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p.runs[0].font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)

        for row in q_table.rows:
            for ci, w in enumerate(q_col_widths):
                row.cells[ci].width = w

        doc.add_paragraph().paragraph_format.space_after = Pt(8)

        # ---------------------------------------------------------
        # Section 3: Answer Key for this Exam
        # ---------------------------------------------------------
        p_sec3 = doc.add_paragraph()
        r_sec3 = p_sec3.add_run(f"3. BẢNG ĐÁP ÁN ĐỀ SỐ {de_num:02d}")
        r_sec3.font.size = Pt(12)
        r_sec3.font.bold = True
        r_sec3.font.color.rgb = RGBColor(0x05, 0x96, 0x69)
        p_sec3.paragraph_format.space_after = Pt(6)

        ans_table = doc.add_table(rows=len(ans_list) + 1, cols=4)
        ans_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(ans_table, color="D1FAE5")

        ans_col_widths = [Inches(0.9), Inches(1.1), Inches(2.2), Inches(2.6)]
        ans_headers = ["STT", "Chỗ trống", "Đáp án chuẩn", "Phương án chấp nhận khác (nếu có)"]

        for ci, h_text in enumerate(ans_headers):
            c = ans_table.rows[0].cells[ci]
            c.text = h_text
            set_cell_background(c, "10B981")
            set_cell_margins(c, top=80, bottom=80, left=100, right=100)
            p = c.paragraphs[0]
            p.runs[0].font.bold = True
            p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            p.runs[0].font.size = Pt(9.5)
            if ci != 2 and ci != 3:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        for ai, ans_item in enumerate(ans_list):
            row_cells = ans_table.rows[ai + 1].cells
            blank_num = 14 + ai
            row_cells[0].text = str(ai + 1)
            row_cells[1].text = f"({blank_num})"
            row_cells[2].text = ans_item['main']
            row_cells[3].text = ans_item['alts'] if ans_item['alts'] else "—"

            bg = "ECFDF5" if ai % 2 == 1 else "FFFFFF"
            for ci in range(4):
                set_cell_background(row_cells[ci], bg)
                set_cell_margins(row_cells[ci], top=65, bottom=65, left=100, right=100)
                p = row_cells[ci].paragraphs[0]
                p.runs[0].font.size = Pt(9.5)
                if ci == 0 or ci == 1:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                if ci == 2:
                    p.runs[0].font.bold = True
                    p.runs[0].font.color.rgb = RGBColor(0x06, 0x5F, 0x46)
                if ci == 3 and ans_item['alts']:
                    p.runs[0].font.italic = True
                    p.runs[0].font.color.rgb = RGBColor(0x04, 0x78, 0x57)

        for row in ans_table.rows:
            for ci, w in enumerate(ans_col_widths):
                row.cells[ci].width = w

    # -------------------------------------------------------------
    # MASTER ANSWER KEY SECTION (AT THE END)
    # -------------------------------------------------------------
    doc.add_page_break()

    p_master_hdr = doc.add_paragraph()
    r_m_tag = p_master_hdr.add_run("TỔNG HỢP TOÀN BỘ\n")
    r_m_tag.font.size = Pt(12)
    r_m_tag.font.bold = True
    r_m_tag.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

    r_m_title = p_master_hdr.add_run("BẢNG TỔNG HỢP 120 ĐÁP ÁN (10 ĐỀ THI)")
    r_m_title.font.size = Pt(18)
    r_m_title.font.bold = True
    r_m_title.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
    p_master_hdr.paragraph_format.space_after = Pt(8)

    p_m_sub = doc.add_paragraph()
    r_msub = p_m_sub.add_run("Bảng tra cứu nhanh toàn bộ 120 câu hỏi điền từ theo ma trận 10 Đề x 12 Chỗ trống:")
    r_msub.font.italic = True
    r_msub.font.size = Pt(10)
    p_m_sub.paragraph_format.space_after = Pt(12)

    # Split into 2 compact master tables: Exam 1-5 and Exam 6-10 for clear printable layout
    def add_sub_master_table(start_de, end_de):
        p_part = doc.add_paragraph()
        r_part = p_part.add_run(f"★ BẢNG ĐÁP ÁN: TỪ ĐỀ {start_de:02d} ĐẾN ĐỀ {end_de:02d}")
        r_part.font.bold = True
        r_part.font.size = Pt(11.5)
        r_part.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
        p_part.paragraph_format.space_after = Pt(4)

        num_exams = end_de - start_de + 1
        m_tbl = doc.add_table(rows=13, cols=num_exams + 1)
        m_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(m_tbl, color="CBD5E1")

        # Header
        h_row = m_tbl.rows[0].cells
        h_row[0].text = "Chỗ trống"
        set_cell_background(h_row[0], "1E3A8A")
        set_cell_margins(h_row[0], top=80, bottom=80, left=60, right=60)
        p = h_row[0].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.runs[0].font.bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(9.5)

        for col_idx, de in enumerate(range(start_de, end_de + 1)):
            c = h_row[col_idx + 1]
            c.text = f"Đề {de:02d}"
            set_cell_background(c, "2563EB")
            set_cell_margins(c, top=80, bottom=80, left=60, right=60)
            p = c.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.runs[0].font.bold = True
            p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            p.runs[0].font.size = Pt(9.5)

        # 12 rows (blanks 14 to 25)
        for r_idx in range(12):
            blank_num = 14 + r_idx
            row = m_tbl.rows[r_idx + 1].cells
            row[0].text = f"({blank_num})"
            bg = "F1F5F9" if r_idx % 2 == 1 else "FFFFFF"
            set_cell_background(row[0], "E2E8F0")
            set_cell_margins(row[0], top=60, bottom=60, left=60, right=60)
            p0 = row[0].paragraphs[0]
            p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p0.runs[0].font.bold = True
            p0.runs[0].font.size = Pt(9.5)

            for col_idx, de in enumerate(range(start_de, end_de + 1)):
                c = row[col_idx + 1]
                ans_list = answers_dict.get(de, [])
                ans_val = ans_list[r_idx]['main'] if r_idx < len(ans_list) else ""
                c.text = ans_val
                set_cell_background(c, bg)
                set_cell_margins(c, top=60, bottom=60, left=60, right=60)
                p = c.paragraphs[0]
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.runs[0].font.size = Pt(9.5)
                p.runs[0].font.bold = True
                p.runs[0].font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)

        # Widths
        w_col = Inches(1.1)
        w_blank = Inches(0.9)
        for row in m_tbl.rows:
            row.cells[0].width = w_blank
            for c_i in range(1, len(row.cells)):
                row.cells[c_i].width = w_col

        doc.add_paragraph().paragraph_format.space_after = Pt(14)

    add_sub_master_table(1, 5)
    add_sub_master_table(6, 10)

    # Final Footer Note
    p_end = doc.add_paragraph()
    p_end.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_end = p_end.add_run("— HẾT TÀI LIỆU ÔN THI 10 ĐỀ ĐIỀN TỪ B1 —\nChúc các bạn học tập tốt và đạt kết quả cao trong kỳ thi Tiếng Anh B1!")
    r_end.font.bold = True
    r_end.font.italic = True
    r_end.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
    r_end.font.size = Pt(10.5)

    output_path = os.path.join(base_dir, "Tai_Lieu_Doc_B1_10_De_Dien_Tu.docx")
    doc.save(output_path)
    print(f"File created successfully at: {output_path}")

if __name__ == '__main__':
    main()
