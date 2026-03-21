from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER

OUTPUT = "aloha_lacrosse_2024_season_analysis.pdf"

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
SM   = sty("SM", fontSize=7.5,textColor=colors.HexColor("#555555"))
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
     [Paragraph("2023–2024 Season  ·  Stats & Analysis", CAP)]],
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
    [["Games","Record","Goals Scored","Goals Allowed","Shot %","Total Shots"],
     ["18","3W – 14L – 1T","76","193","18.8%","404"]],
    [0.75*inch,1.35*inch,1.1*inch,1.1*inch,0.9*inch,0.9*inch], []))
story.append(Spacer(1,14))

# ── Game log ─────────────────────────────────────────────────────────────────
story.append(Paragraph("Complete Game Log", H2))
story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=8))

games_2024 = [
    ("Mar 12","Century","Away","5–17","L"),
    ("Mar 16","Skyview","Home","4–11","L"),
    ("Mar 19","Ida B Wells","Away","5–15","L"),
    ("Mar 21","Glencoe","Home","4–12","L"),
    ("Apr 2","Forest Grove","Away","3–10","L"),
    ("Apr 5","Beaverton","Away","2–8","L"),
    ("Apr 8","Westview","Away","3–10","L"),
    ("Apr 12","Sprague","Home","7–8","L"),
    ("Apr 16","Tualatin","Home","2–7","L"),
    ("Apr 18","Tigard","Away","6–5","W"),
    ("Apr 22","Sunset","Home","0–19","L"),
    ("Apr 23","Hillsboro","Home","8–8","T"),
    ("Apr 29","Mountainside","Away","3–12","L"),
    ("May 2","Westview","Home","4–10","L"),
    ("May 6","Beaverton","Home","7–6","W"),
    ("May 10","Mountain View","Home","9–6","W"),
    ("May 14","Jesuit","Away","0–20","L"),
    ("May 16","Tualatin","Away","3–9","L"),
]
gl_header = [["Date","Opponent","H/A","Score","Result"]]
gl_rows   = [[d,o,h,s,r] for d,o,h,s,r in games_2024]
res_colors = []
for i, (_,_,_,_,r) in enumerate(games_2024, start=1):
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
     ["4", "Damien Hernandez",        "18","23","5","28","122","50","18.9%","7"],
     ["27","Ronald Morning",          "18","22","6","28", "86","44","25.6%","4"],
     ["41","Caleb Hulme",             "16","17","1","18","121","65","14.0%","3"],
     ["40","William Monnig",          "13","10","3","13", "44","28","22.7%","2"],
     ["3", "Isaiah Ramirez",          "10", "1","2", "3",  "3", "2","33.3%","1"],
     ["24","Lorenzo Guzman Ferreira", "17", "1","2", "3",  "9", "3","11.1%","0"],
     ["5", "Kole Wilde",              "18", "1","0", "1",  "8", "4","12.5%","0"],
     ["15","Barrett Laws",            "11", "1","0", "1",  "4", "1","25.0%","0"]],
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
     ["26","Logan Harrison","18","287","176","62.0%","Primary"],
     ["15","Barrett Laws",  "11",  "9", "17","34.6%","Backup"]],
    [0.4*inch,1.8*inch,0.45*inch,0.6*inch,0.5*inch,0.7*inch,0.75*inch],
    [("ALIGN",(1,0),(1,-1),"LEFT")]))
story.append(Spacer(1,14))

# ── Faceoffs ──────────────────────────────────────────────────────────────────
story.append(Paragraph("Faceoff Specialists", H2))
story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=8))
story.append(base_tbl(
    [["#","Player","GP","FO Taken","FO Won","FO Lost","FO%"],
     ["8", "Tanner Hanna",   "17","296","134","162","45.3%"],
     ["27","Ronald Morning", "18", "28", "21",  "7","75.0%"]],
    [0.4*inch,1.9*inch,0.45*inch,0.75*inch,0.75*inch,0.75*inch,0.65*inch],
    [("ALIGN",(1,0),(1,-1),"LEFT")]))
story.append(Spacer(1,14))

# ── Analysis ──────────────────────────────────────────────────────────────────
story.append(Paragraph("Season Analysis", H2))
story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=8))

bullets = [
    ("<b>Record: 3W – 14L – 1T.</b>  Wins came against Tigard (6–5), Beaverton (7–6), and "
     "Mountain View (9–6), all close contests decided by 1–3 goals.  A tie with Hillsboro "
     "(8–8) was the closest Aloha came to a fourth win."),
    ("<b>Dual offensive leaders.</b>  Damien Hernandez and Ronald Morning each finished with "
     "28 points.  Morning held the edge in shot efficiency (25.6% vs 18.9%) while Hernandez "
     "attempted 36 more shots.  Caleb Hulme added 17 goals as a reliable third option."),
    ("<b>Concentrated scoring.</b>  The top four scorers accounted for 72 of 76 goals (94.7%). "
     "Depth beyond that group was limited."),
    ("<b>Defensive pressure throughout.</b>  Aloha allowed 193 goals (10.7/game) while scoring "
     "4.2/game.  Three blowout losses (Sunset 0–19, Jesuit 0–20, Century 5–17) skewed the "
     "goals-against total significantly."),
    ("<b>Strong goaltending under pressure.</b>  Logan Harrison's 287 saves at 62.0% represents "
     "consistently solid individual performance given the shot volume he faced."),
    ("<b>Faceoff opportunity.</b>  Tanner Hanna won only 45.3% on 296 attempts.  Ronald "
     "Morning's 75.0% rate on 28 attempts suggests an opportunity to shift more faceoff "
     "responsibility to him."),
]
for p in bullets:
    story.append(Paragraph(p, BODY))
    story.append(Spacer(1,6))

story += [
    Spacer(1,10),
    HRFlowable(width="100%", thickness=0.5, color=MID, spaceBefore=4, spaceAfter=4),
    Paragraph("Data source: Hudl  ·  Aloha High School Men's Lacrosse  ·  2023–2024 Season",
              sty("FTR", fontSize=7, textColor=colors.grey, alignment=TA_CENTER)),
]

doc.build(story)
print(f"PDF saved: {OUTPUT}")
