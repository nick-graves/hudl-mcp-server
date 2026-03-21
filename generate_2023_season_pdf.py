from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER

OUTPUT = "aloha_lacrosse_2023_season_analysis.pdf"

NAVY  = colors.HexColor("#1B2A4A")
GOLD  = colors.HexColor("#C9A84C")
LIGHT = colors.HexColor("#F4F6FA")
MID   = colors.HexColor("#D8DCE8")
WHITE = colors.white
RED   = colors.HexColor("#C0392B")
GREEN = colors.HexColor("#1E7A3E")
AMBER = colors.HexColor("#D4870A")

doc = SimpleDocTemplate(OUTPUT, pagesize=letter,
    leftMargin=0.65*inch, rightMargin=0.65*inch,
    topMargin=0.65*inch, bottomMargin=0.65*inch)
styles = getSampleStyleSheet()

def sty(name, **kw):
    return ParagraphStyle(name, parent=styles["Normal"], **kw)

H1   = sty("H1", fontSize=22, textColor=WHITE, alignment=TA_CENTER, fontName="Helvetica-Bold", spaceAfter=4)
H2   = sty("H2", fontSize=13, textColor=NAVY,  fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=4)
BODY = sty("BD", fontSize=9,  textColor=NAVY,  leading=14)
CAP  = sty("CP", fontSize=8,  textColor=WHITE, alignment=TA_CENTER, fontName="Helvetica-Bold")

def base_tbl(data, col_w, extra=None):
    t = Table(data, colWidths=col_w)
    cmds = [
        ("BACKGROUND",    (0,0),(-1,0), NAVY),
        ("TEXTCOLOR",     (0,0),(-1,0), WHITE),
        ("FONTNAME",      (0,0),(-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0),(-1,-1), 8.5),
        ("ALIGN",         (0,0),(-1,-1), "CENTER"),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [LIGHT, WHITE]),
        ("GRID",          (0,0),(-1,-1), 0.5, MID),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
    ]
    if extra:
        cmds += extra
    t.setStyle(TableStyle(cmds))
    return t

story = []

# ── Banner ───────────────────────────────────────────────────────────────────
banner = Table(
    [[Paragraph("ALOHA HIGH SCHOOL LACROSSE", H1)],
     [Paragraph("2022–2023 Season  ·  Stats & Analysis", CAP)]],
    colWidths=[7.2*inch])
banner.setStyle(TableStyle([
    ("BACKGROUND",    (0,0),(-1,-1), NAVY),
    ("TOPPADDING",    (0,0),(-1,-1), 10),
    ("BOTTOMPADDING", (0,0),(-1,-1), 10),
    ("LINEBELOW",     (0,0),(-1,0),  2, GOLD),
]))
story += [banner, Spacer(1,14)]

# ── Season at a glance ───────────────────────────────────────────────────────
story.append(Paragraph("Season at a Glance", H2))
story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=8))
story.append(base_tbl(
    [["Games","Record","Goals Scored","Goals Allowed","Shot %","Assists"],
     ["17","3W – 14L – 0T","118","211","25.5%","47"]],
    [0.75*inch,1.35*inch,1.1*inch,1.1*inch,0.9*inch,0.9*inch], []))
story.append(Spacer(1,14))

# ── Game log ─────────────────────────────────────────────────────────────────
story.append(Paragraph("Complete Game Log", H2))
story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=8))

games_2023 = [
    ("Mar 15","Wilsonville","Away","5–11","L"),
    ("Mar 20","Canby","Away","2–18","L"),
    ("Mar 22","Hillsboro","Away","14–4","W"),
    ("Mar 24","Mountain View","Home","11–3","W"),
    ("Apr 5","Forest Grove","Home","19–6","W"),
    ("Apr 7","Liberty","Away","3–17","L"),
    ("Apr 12","CHS","Home","7–17","L"),
    ("Apr 14","Beaverton","Away","7–10","L"),
    ("Apr 18","Tigard","Home","11–12","L"),
    ("Apr 20","Glenco","Away","10–14","L"),
    ("Apr 25","Westview","Home","4–13","L"),
    ("Apr 28","Sunset","Away","0–21","L"),
    ("May 1","Westview","Home","4–9","L"),
    ("May 5","Beaverton","Home","8–9","L"),
    ("May 8","Jesuit","Home","0–24","L"),
    ("May 12","Mountainside","Home","4–12","L"),
    ("May 18","Beaverton","Away","9–11","L"),
]
gl_header = [["Date","Opponent","H/A","Score","Result"]]
gl_rows   = [[d,o,h,s,r] for d,o,h,s,r in games_2023]
res_colors = []
for i, (_,_,_,_,r) in enumerate(games_2023, start=1):
    c = GREEN if r=="W" else (RED if r=="L" else AMBER)
    res_colors.append(("TEXTCOLOR",(4,i),(4,i),c))
    res_colors.append(("FONTNAME", (4,i),(4,i),"Helvetica-Bold"))

story.append(base_tbl(
    gl_header + gl_rows,
    [0.75*inch,1.8*inch,0.5*inch,0.75*inch,0.65*inch],
    [("ALIGN",(1,0),(1,-1),"LEFT"), ("FONTSIZE",(0,0),(-1,-1),8)] + res_colors))
story.append(Spacer(1,14))

# ── Scoring leaders ──────────────────────────────────────────────────────────
story.append(Paragraph("Scoring Leaders", H2))
story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=8))
story.append(base_tbl(
    [["#","Player","GP","G","A","Pts","Shots","SOT","Shot%","EMG"],
     ["31","Kade Barvitz",           "16","47","18","65","147","88","32.0%","7"],
     ["25","Nathan Ruybalid",        "17","30", "7","37","119","68","25.2%","4"],
     ["4", "Damien Hernandez",       "17","15", "7","22", "51","32","29.4%","2"],
     ["6", "Keegan Waller",          "14","11", "7","18", "47","33","23.4%","2"],
     ["41","Caleb Hulme",            "17","10", "3","13", "54","34","18.5%","2"],
     ["10","Zared Carranza",         "12", "2", "2", "4",  "5", "4","40.0%","0"],
     ["27","Ronald Morning",         " 5", "2", "0", "2", "12", "6","16.7%","0"],
     ["23","Isabella Villasenor",    "14", "1", "2", "3", "10", "4","10.0%","0"]],
    [0.35*inch,1.9*inch,0.38*inch,0.35*inch,0.35*inch,
     0.42*inch,0.52*inch,0.42*inch,0.58*inch,0.42*inch],
    [("ALIGN",(1,0),(1,-1),"LEFT"),
     ("BACKGROUND",(0,1),(-1,2),colors.HexColor("#EAF0FB"))]))
story.append(Spacer(1,14))

# ── Goaltending ───────────────────────────────────────────────────────────────
story.append(Paragraph("Goaltending", H2))
story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=8))
story.append(base_tbl(
    [["#","Player","GP","Saves","GA","Save%","Role"],
     ["26","Logan Harrison", "17","143","179","44.4%","Primary"],
     ["17","Dylan Woodbury", "12", "10", "19","34.5%","Backup"]],
    [0.4*inch,1.8*inch,0.45*inch,0.6*inch,0.5*inch,0.7*inch,0.75*inch],
    [("ALIGN",(1,0),(1,-1),"LEFT")]))
story.append(Spacer(1,14))

# ── Faceoffs ──────────────────────────────────────────────────────────────────
story.append(Paragraph("Faceoff Specialists", H2))
story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=8))
story.append(base_tbl(
    [["#","Player","GP","FO Taken","FO Won","FO Lost","FO%"],
     ["30","Evan Pesheck",   "17","145", "33","112","22.8%"],
     ["8", "Tanner Hanna",   "13","126", "47", "79","37.3%"],
     ["27","Ronald Morning", " 5", "64", "40", "24","62.5%"],
     ["6", "Keegan Waller",  "14", "31", "12", "19","38.7%"]],
    [0.4*inch,1.9*inch,0.45*inch,0.75*inch,0.75*inch,0.75*inch,0.65*inch],
    [("ALIGN",(1,0),(1,-1),"LEFT"),
     ("TEXTCOLOR",(6,1),(6,1),RED), ("FONTNAME",(6,1),(6,1),"Helvetica-Bold"),
     ("TEXTCOLOR",(6,3),(6,3),GREEN),("FONTNAME",(6,3),(6,3),"Helvetica-Bold")]))
story.append(Spacer(1,14))

# ── Analysis ──────────────────────────────────────────────────────────────────
story.append(Paragraph("Season Analysis", H2))
story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=8))

bullets = [
    ("<b>Record: 3W – 14L – 0T.</b>  Wins came against Hillsboro (14–4), Mountain View (11–3), "
     "and Forest Grove (19–6), all convincing margins.  Seven of the 14 losses were decided "
     "by 3 goals or fewer, showing the team was competitive in many games."),
    ("<b>Kade Barvitz was elite.</b>  His 65-point season (47G, 18A) accounted for 39.8% of all "
     "team scoring and was nearly double the next best total (37 pts).  His 32.0% shot "
     "percentage was the most efficient among high-volume scorers."),
    ("<b>Stronger offense than 2024.</b>  The team scored 118 goals on 462 shots at 25.5%, "
     "and assists nearly tripled vs 2024 (47 vs 20), reflecting a more connected attack. "
     "The primary reason for the scoring drop in 2024 was the departures of Barvitz and "
     "Ruybalid (combined 102 pts)."),
    ("<b>Faceoff depth was a critical weakness.</b>  Evan Pesheck led in volume (145 attempts) "
     "but won only 22.8%.  Ronald Morning's 62.5% in 5 games was the bright spot. "
     "Aloha almost certainly lost possession at the majority of restarts across the season."),
    ("<b>Goaltending improved significantly by 2024.</b>  Logan Harrison's 44.4% save% in 2023 "
     "rose to 62.0% in 2024 — a major development between seasons."),
    ("<b>Strong roster continuity.</b>  Eight players — Hernandez, Hulme, Monnig, Morning, "
     "Wilde, Harrison, Hanna, and Etheridge — appeared in both seasons, providing an "
     "experienced core heading into 2024."),
]
for p in bullets:
    story.append(Paragraph(p, BODY))
    story.append(Spacer(1,6))

story += [
    Spacer(1,10),
    HRFlowable(width="100%", thickness=0.5, color=MID, spaceBefore=4, spaceAfter=4),
    Paragraph("Data source: Hudl  ·  Aloha High School Men's Lacrosse  ·  2022–2023 Season",
              sty("FTR", fontSize=7, textColor=colors.grey, alignment=TA_CENTER)),
]

doc.build(story)
print(f"PDF saved: {OUTPUT}")
