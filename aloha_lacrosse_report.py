from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether, Image
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

OUTPUT = "Aloha_Lacrosse_2025-2026_Season_Report.pdf"
LOGO_PATH = r"C:\Users\klgra\Documents\ALC\2026 Season\warriorhawk.jpg"

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=letter,
    leftMargin=0.75 * inch,
    rightMargin=0.75 * inch,
    topMargin=0.75 * inch,
    bottomMargin=0.75 * inch,
)

# ── Styles ──────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

BLUE       = colors.HexColor("#29ABE2")
RED        = colors.HexColor("#CC2229")
BLACK      = colors.HexColor("#1A1A1A")
LIGHT_BLUE = colors.HexColor("#E8F6FD")
LIGHT_GRAY = colors.HexColor("#F2F2F2")
MED_GRAY   = colors.HexColor("#CCCCCC")
DARK_GRAY  = colors.HexColor("#444444")

title_style = ParagraphStyle(
    "ReportTitle",
    parent=styles["Title"],
    fontSize=20,
    textColor=BLACK,
    spaceAfter=4,
    alignment=TA_CENTER,
    fontName="Helvetica-Bold",
)
subtitle_style = ParagraphStyle(
    "Subtitle",
    parent=styles["Normal"],
    fontSize=11,
    textColor=DARK_GRAY,
    spaceAfter=2,
    alignment=TA_CENTER,
)
section_style = ParagraphStyle(
    "Section",
    parent=styles["Heading1"],
    fontSize=13,
    textColor=colors.white,
    backColor=BLUE,
    spaceBefore=14,
    spaceAfter=6,
    leftIndent=-6,
    rightIndent=-6,
    fontName="Helvetica-Bold",
    leading=18,
)
subsection_style = ParagraphStyle(
    "Subsection",
    parent=styles["Heading2"],
    fontSize=11,
    textColor=BLUE,
    spaceBefore=10,
    spaceAfter=4,
    fontName="Helvetica-Bold",
    borderPad=2,
)
body_style = ParagraphStyle(
    "Body",
    parent=styles["Normal"],
    fontSize=9,
    leading=13,
    spaceAfter=5,
    textColor=colors.black,
)
bullet_style = ParagraphStyle(
    "Bullet",
    parent=body_style,
    leftIndent=14,
    firstLineIndent=-10,
    spaceAfter=3,
)
label_style = ParagraphStyle(
    "Label",
    parent=body_style,
    fontSize=9,
    fontName="Helvetica-Bold",
    textColor=RED,
    spaceAfter=2,
)
result_win_style = ParagraphStyle(
    "ResultWin",
    parent=styles["Normal"],
    fontSize=14,
    fontName="Helvetica-Bold",
    textColor=colors.HexColor("#1A6B1A"),
    alignment=TA_CENTER,
    spaceAfter=6,
)
result_loss_style = ParagraphStyle(
    "ResultLoss",
    parent=styles["Normal"],
    fontSize=14,
    fontName="Helvetica-Bold",
    textColor=colors.HexColor("#8B0000"),
    alignment=TA_CENTER,
    spaceAfter=6,
)

def section_header(text):
    return Paragraph(f"&nbsp;&nbsp;{text}", section_style)

def subsection(text):
    return Paragraph(text, subsection_style)

def body(text):
    return Paragraph(text, body_style)

def bullet(text):
    return Paragraph(f"&bull;&nbsp;&nbsp;{text}", bullet_style)

def label(text):
    return Paragraph(text, label_style)

def spacer(h=6):
    return Spacer(1, h)

def hr():
    return HRFlowable(width="100%", thickness=1, color=MED_GRAY, spaceAfter=4, spaceBefore=4)

# ── Table helpers ────────────────────────────────────────────────────────────

STAT_COL_STYLE = TableStyle([
    ("BACKGROUND",   (0, 0), (-1, 0), BLUE),
    ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
    ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE",     (0, 0), (-1, -1), 8),
    ("ALIGN",        (0, 0), (-1, -1), "CENTER"),
    ("ALIGN",        (0, 1), (0, -1), "LEFT"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BLUE]),
    ("GRID",         (0, 0), (-1, -1), 0.4, MED_GRAY),
    ("TOPPADDING",   (0, 0), (-1, -1), 3),
    ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
    ("LEFTPADDING",  (0, 0), (-1, -1), 4),
    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
])

def make_table(data, col_widths, style=None):
    t = Table(data, colWidths=col_widths)
    t.setStyle(style or STAT_COL_STYLE)
    return t


# ── Content ──────────────────────────────────────────────────────────────────
story = []

# Title block with logo
story.append(spacer(4))
logo = Image(LOGO_PATH, width=1.6*inch, height=1.0*inch)
header_data = [[logo, [
    Paragraph("ALOHA HIGH SCHOOL LACROSSE", title_style),
    Paragraph("Warrior Hawks &nbsp;|&nbsp; 2025–2026 Season Report", subtitle_style),
    Paragraph("Through 2 Games &nbsp;&nbsp;&#9679;&nbsp;&nbsp; Record: 1-1 &nbsp;&nbsp;&#9679;&nbsp;&nbsp; GF: 8 &nbsp;&nbsp;&#9679;&nbsp;&nbsp; GA: 17", subtitle_style),
]]]
header_table = Table(header_data, colWidths=[1.8*inch, 5.4*inch])
header_table.setStyle(TableStyle([
    ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
    ("ALIGN",        (0, 0), (0, 0),   "CENTER"),
    ("LEFTPADDING",  (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ("TOPPADDING",   (0, 0), (-1, -1), 0),
    ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
]))
story.append(header_table)
story.append(spacer(6))
story.append(HRFlowable(width="100%", thickness=3, color=RED, spaceAfter=4))
story.append(HRFlowable(width="100%", thickness=2, color=BLUE, spaceAfter=10))

# ════════════════════════════════════════════════════════════════════════════
# GAME 1
# ════════════════════════════════════════════════════════════════════════════
story.append(section_header("GAME 1 — March 17 vs Oregon City (Home)"))
story.append(Paragraph("Aloha 6 &nbsp;|&nbsp; Oregon City 5 &nbsp;&nbsp; WIN", result_win_style))

story.append(subsection("Player Statistics"))

g1_headers = ["Player", "#", "G", "A", "Pts", "Shots", "SOT", "Shot%", "GB", "TO", "CT", "Pen"]
g1_data = [g1_headers] + [
    ["Josh Hockemeier",  "24", "2","1","3","6","4","33.3%","7","4","0","2"],
    ["Silas Palmer",     "20", "2","0","2","5","5","40.0%","1","2","1","1"],
    ["Barrett Laws",     "15", "1","0","1","1","1","100%", "2","0","0","1"],
    ["Anthony Forkner",  "33", "1","0","1","6","2","16.7%","1","3","0","3"],
    ["Brooks Morfin",    "10", "0","1","1","1","1","—",    "1","1","0","0"],
    ["Drake Gibson",     "13", "0","1","1","2","1","—",    "3","3","1","1"],
    ["Tanner Hanna",     "8",  "0","0","0","1","1","—",    "3","3","1","0"],
    ["Jesus Banderas",   "1",  "0","0","0","2","0","—",    "2","3","0","1"],
    ["Braedyn Hill",     "55", "0","0","0","0","0","—",    "0","2","0","0"],
    ["Logan Harrison (GK)","26","—","—","—","—","—","—",  "3","1","2","0"],
]
cw1 = [1.55*inch, 0.3*inch] + [0.32*inch]*10
story.append(make_table(g1_data, cw1))

story.append(spacer(5))
notes1 = [
    ("Faceoffs", "Tanner Hanna — 12/14 &nbsp;(85.7%)"),
    ("Goalie",   "Logan Harrison — 14 saves, 5 GA, 73.7% save%"),
    ("EMGs",     "Hockemeier (1), Laws (1), Forkner (1) — 3 of 6 goals scored on extra-man"),
]
for lbl, val in notes1:
    story.append(Paragraph(f"<b>{lbl}:</b> &nbsp;{val}", body_style))

story.append(subsection("Game 1 Analysis"))

story.append(label("Standout Performances"))
story.append(bullet("<b>Josh Hockemeier</b> — 3 pts, game-high 7 GBs, and the go-ahead EMG. Physical and relentless, but 4 TOs and 2 penalties show aggression without control."))
story.append(bullet("<b>Silas Palmer</b> — 2G on 5 shots, all 5 on target (40% conversion). Most efficient scorer on the roster. Added 1 CT on defense."))
story.append(bullet("<b>Tanner Hanna</b> — 85.7% faceoff win rate (12/14). Elite possession control in a 1-goal game — this likely decided the outcome."))
story.append(bullet("<b>Barrett Laws</b> — 1 shot, 1 goal, 1 EMG, zero turnovers. Quiet, clean, and impactful."))
story.append(bullet("<b>Logan Harrison (GK)</b> — 14 saves under pressure in a close game. Composure in the cage kept the lead intact."))

story.append(label("Areas of Concern"))
story.append(bullet("<b>Turnovers:</b> 32 team TOs total. Hockemeier (4), Forkner (3), Gibson (3), Hanna (3), Banderas (3) all at 3+. Against a stronger opponent, this volume is punishable."))
story.append(bullet("<b>Penalty discipline:</b> 9 team penalties, Forkner leading with 3. Three EMGs scored shows Aloha converted their own opportunities, but 9 penalties gives opponents too many chances."))
story.append(bullet("<b>Shooting efficiency:</b> Outside Palmer and Laws, shot quality was inconsistent. Forkner took 6 shots with only 2 on target (16.7%). Team went 6-for-22 (27%)."))

story.append(label("Overall"))
story.append(body("A gritty, deserved home win that was more contested than the 6-5 final suggests. Aloha won on three pillars: faceoff dominance, goalie composure, and clutch EMG execution. Remove any one of those and the result likely flips. The turnover count is the biggest takeaway and must come down as the schedule toughens."))

# ════════════════════════════════════════════════════════════════════════════
# GAME 2
# ════════════════════════════════════════════════════════════════════════════
story.append(PageBreak())
story.append(section_header("GAME 2 — March 19 vs Century (Away)"))
story.append(Paragraph("Aloha 2 &nbsp;|&nbsp; Century 12 &nbsp;&nbsp; LOSS", result_loss_style))

story.append(subsection("Player Statistics"))

g2_headers = ["Player", "#", "G", "A", "Pts", "Shots", "SOT", "Shot%", "GB", "TO", "CT", "Pen"]
g2_data = [g2_headers] + [
    ["Silas Palmer",      "20","1","1","2","3","3","33.3%","5","5","2","0"],
    ["Brooks Morfin",     "10","1","1","2","2","1","50.0%","2","5","2","0"],
    ["Josh Hockemeier",   "24","0","0","0","2","1","—",    "8","4","1","0"],
    ["Barrett Laws",      "15","0","0","0","3","2","—",    "6","5","0","1"],
    ["Jesus Banderas",    "1", "0","0","0","3","1","—",    "11","2","4","0"],
    ["Tanner Hanna",      "8", "0","0","0","2","0","—",    "8","2","0","1"],
    ["Ben Martin",        "9", "0","0","0","2","2","—",    "2","2","2","0"],
    ["Eric Mendez",       "51","0","0","0","0","0","—",    "1","3","0","0"],
    ["Braedyn Hill",      "55","0","0","0","0","0","—",    "0","2","3","0"],
    ["Jacob Saunders",    "18","0","0","0","0","0","—",    "3","1","0","0"],
    ["Drake Gibson",      "13","0","0","0","0","0","—",    "3","1","0","0"],
    ["Jaxon Barron",      "17","0","0","0","0","0","—",    "2","2","2","0"],
    ["Logan Harrison (GK)","26","—","—","—","—","—","—",  "1","0","2","0"],
    ["Holden James (GK)", "61","—","—","—","—","—","—",   "1","1","1","0"],
]
cw2 = [1.55*inch, 0.3*inch] + [0.32*inch]*10
story.append(make_table(g2_data, cw2))

story.append(spacer(5))
notes2 = [
    ("Faceoffs", "Tanner Hanna — 11/16 &nbsp;(68.8%)"),
    ("Goalies",  "Logan Harrison — 13 saves, 11 GA, 54.2% &nbsp;|&nbsp; Holden James — 2 saves, 1 GA, 66.7%"),
    ("EMGs",     "Silas Palmer (1)"),
    ("Team TOs", "37 total"),
]
for lbl, val in notes2:
    story.append(Paragraph(f"<b>{lbl}:</b> &nbsp;{val}", body_style))

story.append(subsection("Game 2 Analysis"))

story.append(label("Standout Performances"))
story.append(bullet("<b>Silas Palmer</b> — 1G, 1A, 3 shots all on target, 5 GBs, 2 CTs. Productive and two-way even in a blowout. Season's most consistent player through 2 games."))
story.append(bullet("<b>Brooks Morfin</b> — Stepped up with 1G, 1A and 50% shot conversion. Clean composure in a difficult road environment."))
story.append(bullet("<b>Jesus Banderas</b> — Team-high 11 GBs and a team-leading 4 CTs. Defensive work rate was the standout performance despite the final score."))
story.append(bullet("<b>Josh Hockemeier</b> — Held scoreless but posted 8 GBs, continuing his pattern of relentless physical effort."))
story.append(bullet("<b>Tanner Hanna</b> — 68.8% faceoff rate (11/16) remained above average, though efficiency dropped from game 1. Added 8 GBs."))

story.append(label("Areas of Concern"))
story.append(bullet("<b>Goalie performance:</b> Harrison dropped from 73.7% to 54.2%. Combined with a backup appearance from Holden James, Century generated 25 total shots. Defensive structure in front of the cage needs review."))
story.append(bullet("<b>Offensive collapse:</b> Only 2 goals on 18 shots (11.1%). No EMG conversions beyond Palmer's one score. The team was held in check all game."))
story.append(bullet("<b>Turnovers worsened:</b> 37 team TOs vs 32 in game 1. Palmer (5), Laws (5), Morfin (5) all near or at single-game highs. Ball security under pressure remains a critical concern."))
story.append(bullet("<b>Road performance:</b> The mental and tactical adjustment to away play was clearly lacking. A 10-goal deficit indicates either Century is a top-tier opponent or Aloha's system broke down entirely on the road."))

story.append(label("Overall"))
story.append(body("A difficult road loss against a significantly stronger opponent. The two bright spots — Palmer and Morfin — showed Aloha has playmakers, but Century didn't give them space. This game should be read as a tough early-season lesson rather than an indictment of the team's ceiling. The offensive concentration and defensive vulnerability exposed here need to be addressed in practice before the next road game."))


# ════════════════════════════════════════════════════════════════════════════
# SEASON STATS
# ════════════════════════════════════════════════════════════════════════════
story.append(PageBreak())
story.append(section_header("FULL SEASON — 2025-2026 Through 2 Games"))

# Season summary box
summary_data = [
    ["Record", "GF", "GA", "Win%", "Shots", "SOT", "Shot%", "Assists"],
    ["1-1-0",  "8",  "17", "50%",  "44",    "25",  "18.2%", "5"],
]
sum_style = TableStyle([
    ("BACKGROUND",    (0, 0), (-1, 0), BLUE),
    ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
    ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME",      (0, 1), (-1, 1), "Helvetica-Bold"),
    ("FONTSIZE",      (0, 0), (-1, -1), 10),
    ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
    ("BACKGROUND",    (0, 1), (-1, 1), LIGHT_BLUE),
    ("GRID",          (0, 0), (-1, -1), 0.5, MED_GRAY),
    ("TOPPADDING",    (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
])
story.append(spacer(4))
story.append(make_table(summary_data, [0.85*inch]*8, style=sum_style))
story.append(spacer(8))

story.append(subsection("Season Player Leaderboard"))
slb_headers = ["Player", "GP", "G", "A", "Pts", "Shots", "SOT", "GB", "TO", "CT", "Pen"]
slb_data = [slb_headers] + [
    ["Silas Palmer #20",    "2","3","1","4","8","8","6","7","3","1"],
    ["Josh Hockemeier #24", "2","2","1","3","8","5","15","8","1","2"],
    ["Brooks Morfin #10",   "2","1","2","3","3","2","3","6","2","0"],
    ["Anthony Forkner #33", "1","1","0","1","6","2","1","3","0","3"],
    ["Barrett Laws #15",    "2","1","0","1","4","3","8","5","0","2"],
    ["Drake Gibson #13",    "2","0","1","1","2","1","6","4","1","1"],
    ["Tanner Hanna #8",     "2","0","0","0","3","1","11","5","1","1"],
    ["Jesus Banderas #1",   "2","0","0","0","5","1","13","5","4","1"],
    ["Braedyn Hill #55",    "2","0","0","0","0","0","0","4","3","0"],
    ["Eric Mendez #51",     "2","0","0","0","0","0","2","6","1","0"],
    ["Ben Martin #9",       "2","0","0","0","3","2","2","2","2","0"],
    ["Jaxon Barron #17",    "2","0","0","0","0","0","3","3","3","0"],
    ["Logan Harrison #26 (GK)","2","—","—","—","—","—","4","1","2","0"],
]
cw_slb = [1.65*inch, 0.28*inch] + [0.35*inch]*9
story.append(make_table(slb_data, cw_slb))

story.append(spacer(6))
fo_data = [
    ["Faceoff Leader", "Tanner Hanna #8", "23W / 7L in 30 FO", "76.7%"],
    ["Primary Goalie", "Logan Harrison #26", "27 saves, 16 GA (2 games)", "62.8% save%"],
    ["Backup Goalie",  "Holden James #61", "2 saves, 1 GA (1 game)",   "66.7% save%"],
]
fo_style = TableStyle([
    ("FONTSIZE",      (0,0),(-1,-1), 8),
    ("FONTNAME",      (0,0),(0,-1), "Helvetica-Bold"),
    ("TEXTCOLOR",     (0,0),(0,-1), BLUE),
    ("ROWBACKGROUNDS",(0,0),(-1,-1), [LIGHT_GRAY, colors.white, LIGHT_GRAY]),
    ("GRID",          (0,0),(-1,-1), 0.4, MED_GRAY),
    ("ALIGN",         (0,0),(-1,-1), "LEFT"),
    ("TOPPADDING",    (0,0),(-1,-1), 3),
    ("BOTTOMPADDING", (0,0),(-1,-1), 3),
    ("LEFTPADDING",   (0,0),(-1,-1), 5),
])
story.append(make_table(fo_data, [1.35*inch, 1.45*inch, 2.1*inch, 1.1*inch], style=fo_style))


# ── Individual Player Assessments ────────────────────────────────────────────
story.append(subsection("Individual Player Assessments"))

players_analysis = [
    ("Silas Palmer #20 — Season MVP Through 2 Games",
     "The most consistent player on the roster. 4 points in 2 games, 100% shots on target (8/8 — every shot he releases is on frame), and positive two-way play with 3 caused turnovers. The 7 turnovers are the only blemish, and most were forced under pressure. He is the team's most dangerous offensive weapon and one of its better defensive contributors."),
    ("Josh Hockemeier #24 — Motor and Hustle Leader",
     "15 ground balls in 2 games is a pace that would lead most rosters all season. He is clearly the team's most physical and relentless player. However, 8 turnovers (team-high) and 2 penalties show aggression without control. His game 2 (0 pts, 4 TOs, 8 GBs) was a microcosm — working hard but unable to convert. Getting turnover rate down while maintaining ground ball dominance is his development challenge."),
    ("Brooks Morfin #10 — Emerging Playmaker",
     "3 combined points (1G, 2A) across 2 appearances and the team's best shooting efficiency at 50%. Contributed in both games and made smart decisions. Zero penalties. Could become a key secondary scorer if he reduces his 6 turnovers."),
    ("Tanner Hanna #8 — Faceoff Specialist",
     "76.7% faceoff win rate over 30 draws is genuinely excellent — elite high school programs typically target 60%+. His faceoff dominance is a structural advantage the whole team relies on. Offensively he is not a factor (0 goals, 1 SOT), and 5 turnovers need attention. His role is defined: win the draw, distribute, stay out of trouble."),
    ("Barrett Laws #15 — High-Efficiency Role Player",
     "1 goal, 1 EMG, 8 ground balls, and zero unforced turnovers in 2 games. Game 1 was near-perfect (1 shot, 1 goal, 100%). Ground ball work remained strong in game 2 despite going scoreless. The 2 penalties need to be reduced. A reliable contributor who makes the most of his touches."),
    ("Jesus Banderas #1 — Defensive Anchor",
     "Zero points, but 13 ground balls and a team-leading 4 caused turnovers show a player doing the defensive work that doesn't appear on the scoreboard. His 3 unforced turnovers are the concern — he is winning the ball and then losing it needlessly."),
    ("Logan Harrison #26 — Goalie Under Pressure",
     "A notable gap between his two performances: 73.7% vs Oregon City, 54.2% vs Century. His season average of 62.8% sits right at the high-school benchmark. The Century workload (11 GA) likely reflects a step up in opponent quality, but consistency in the cage will be critical as competition intensifies."),
    ("Anthony Forkner #33 — Discipline Required",
     "Only played game 1 but drew 3 penalties in a single game — an unsustainable rate. He scored and converted an EMG, showing offensive ability, but the penalty count puts the team in constant man-down situations. Shot selection also needs work: 6 attempts, only 2 on target."),
    ("Eric Mendez #51 — Area of Concern",
     "6 turnovers (4 unforced) with zero offensive production and only 2 ground balls in 2 games. The turnover-to-contribution ratio is the worst on the team and needs to be addressed directly."),
]

for name, text in players_analysis:
    story.append(KeepTogether([
        label(name),
        body(text),
        spacer(3),
    ]))


# ── Team Assessment ───────────────────────────────────────────────────────────
story.append(subsection("Overall Team Assessment"))

story.append(label("What's Working"))
story.append(bullet("<b>Faceoff dominance</b> — Hanna's 76.7% win rate is a genuine competitive advantage. Aloha controls possession before it starts."))
story.append(bullet("<b>Top-end offensive talent</b> — Palmer and Hockemeier are legitimate threats; Morfin is developing into a third option."))
story.append(bullet("<b>Extra-man execution</b> — 4 EMGs in 2 games shows the offense can capitalize when disciplined enough to create the opportunity."))
story.append(bullet("<b>Ground ball effort</b> — Team-wide hustle is evident; multiple players posting 5+ GBs per game."))

story.append(spacer(4))
story.append(label("What Needs Work"))
story.append(bullet("<b>Turnovers (#1 priority)</b> — 69 combined TOs in 2 games (34.5/game). Many are forced under pressure, but the unforced variety from Mendez, Banderas, and Hill indicates correctable ball-security habits."))
story.append(bullet("<b>Goalie consistency</b> — Harrison needs to stabilize at 65%+ as competition intensifies. The difference between the two games is a concern worth addressing with the coaching staff."))
story.append(bullet("<b>Offensive depth</b> — All 8 goals came from 4 players. Most of the roster contributes zero offense, creating predictability that strong defenses will exploit."))
story.append(bullet("<b>Penalty discipline</b> — 12 penalties in 2 games (6/game). Forkner alone drew 3 in game 1. This gives opponents free possessions and forces the defense to play man-down repeatedly."))
story.append(bullet("<b>Road performance</b> — The home/away split (6-5 W at home, 2-12 L on road) is stark. Some of that is opponent quality, but adapting to away environments is a critical skill as the schedule progresses."))

story.append(spacer(6))
story.append(label("Season Outlook"))
story.append(body(
    "One game in, Aloha looked like a competitive team capable of winning close games. Two games in, the Century blowout introduces uncertainty about how they perform against top-tier opponents. "
    "The talent is clearly present — Palmer and Hanna in particular are the kinds of players who anchor winning programs at this level. "
    "The path forward is defined: cut turnovers, stabilize the goalie, and develop secondary offensive contributors so opponents cannot key entirely on the top two scorers. "
    "If those three areas improve, this team has the foundation to be competitive deep into the season."
))

story.append(spacer(12))
story.append(HRFlowable(width="100%", thickness=2, color=RED, spaceAfter=2))
story.append(HRFlowable(width="100%", thickness=1.5, color=BLUE, spaceAfter=6))
story.append(Paragraph("Aloha High School Lacrosse &nbsp;|&nbsp; 2025–2026 Season &nbsp;|&nbsp; Generated via Hudl MCP Server",
    ParagraphStyle("Footer", parent=styles["Normal"], fontSize=7, textColor=colors.gray, alignment=TA_CENTER)))

# ── Build ─────────────────────────────────────────────────────────────────────
doc.build(story)
print(f"PDF saved: {OUTPUT}")
