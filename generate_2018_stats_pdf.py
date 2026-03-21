"""
Aloha High School Lacrosse — 2018-2019 Season Statistical Report
Generated from Hudl MCP Server (feature/multi-season-support branch)
"""

from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

OUTPUT = r"C:\Users\klgra\hudl-mcp-server\aloha_lax_2018_19_season_report.pdf"

# ── Color palette ─────────────────────────────────────────────────────────────
MAROON   = colors.HexColor("#6B0F1A")
GOLD     = colors.HexColor("#C9A84C")
DARK_BG  = colors.HexColor("#1A1A2E")
MID_GREY = colors.HexColor("#4A4A4A")
LIGHT_BG = colors.HexColor("#F8F4EE")
ROW_ALT  = colors.HexColor("#F0EAE0")
WHITE    = colors.white

# ── Styles ────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

title_style = ParagraphStyle("ReportTitle",
    fontSize=26, leading=30, textColor=WHITE,
    alignment=TA_CENTER, fontName="Helvetica-Bold", spaceAfter=4)

subtitle_style = ParagraphStyle("Subtitle",
    fontSize=13, leading=16, textColor=GOLD,
    alignment=TA_CENTER, fontName="Helvetica", spaceAfter=2)

section_style = ParagraphStyle("Section",
    fontSize=14, leading=18, textColor=MAROON,
    fontName="Helvetica-Bold", spaceBefore=18, spaceAfter=6,
    borderPad=4)

body_style = ParagraphStyle("Body",
    fontSize=10, leading=14, textColor=MID_GREY,
    fontName="Helvetica", spaceAfter=6)

bullet_style = ParagraphStyle("Bullet",
    fontSize=10, leading=14, textColor=MID_GREY,
    fontName="Helvetica", leftIndent=16, spaceAfter=3,
    bulletIndent=6)

note_style = ParagraphStyle("Note",
    fontSize=8, leading=11, textColor=colors.HexColor("#888888"),
    fontName="Helvetica-Oblique", spaceAfter=4)

label_style = ParagraphStyle("Label",
    fontSize=9, leading=11, textColor=MID_GREY,
    fontName="Helvetica", alignment=TA_CENTER)

big_num_style = ParagraphStyle("BigNum",
    fontSize=28, leading=32, textColor=MAROON,
    fontName="Helvetica-Bold", alignment=TA_CENTER)

# ── Data ──────────────────────────────────────────────────────────────────────
SEASON_LABEL  = "2018-2019 Season"
SEASON_ID     = "936742"
GAMES_PLAYED  = 18   # max gamesPlayed across roster
GOALS_FOR     = 232
GOALS_AGAINST = 233
SHOTS         = 652
SOT           = 429
SHOT_PCT      = "35.6%"
ASSISTS       = 124
GPG_FOR       = round(GOALS_FOR  / GAMES_PLAYED, 1)
GPG_AGAINST   = round(GOALS_AGAINST / GAMES_PLAYED, 1)
SHOT_RATE     = round(SHOTS / GAMES_PLAYED, 1)

# Scorers (goals > 0 or assists > 0), sorted by points
scorers = [
    ("Nick Graves",       "30", 18, 35, 42, 77,  89,  60, "39.3%", 48,  0),
    ("Liam Johnston",     "24", 17, 45, 12, 57, 127,  75, "35.4%", 31,  0),
    ("Sam Gfroerer",      "10", 17, 37, 25, 62,  80,  62, "46.3%", 29,  1),
    ("Zachary Stephens",  "57", 18, 27,  7, 34,  70,  51, "38.6%", 58,  4),
    ("Kai Talley",        "11", 18, 21, 10, 31,  74,  49, "28.4%", 23,  0),
    ("Mathew Pettigrew",  "13", 18, 16, 10, 26,  45,  26, "35.6%", 196, 2),
    ("Kobe Jenson",       "99",  9, 18,  3, 21,  35,  24, "51.4%", 12,  1),
    ("Jacob Cocheu",      "33", 17, 17,  1, 18,  55,  40, "30.9%", 16,  0),
    ("Connor Ruybalid",   "21", 17,  3,  5,  8,   5,   5, "60.0%", 79,  0),
    ("William McCarthy",  "22",  1,  1,  1,  2,   5,   3, "20.0%",  2,  0),
    ("Alex Stock",        "27",  1,  2,  0,  2,   3,   2, "66.7%",  1,  1),
    ("David Morgan",      "26",  8,  0,  1,  1,   0,   0, "0.0%",  18,  0),
    ("Gerardo Flores",    "35",  6,  0,  1,  1,   0,   0, "0.0%",  10,  0),
    ("Henry Morgan",      "20",  1,  0,  1,  1,   0,   0, "0.0%",   0,  0),
]

# Goalies
goalies = [
    ("Kyle Newman",    "69", 17, 148, 195, "43.1%"),
    ("David Morgan",   "26",  8,  28,  14, "66.7%"),
    ("Gerardo Flores", "35",  6,  11,  10, "52.4%"),
]

# Face-off specialists
faceoffs = [
    ("Mathew Pettigrew", "13", 18, 366, 220, 146, "60.1%"),
    ("Nixon Hobbs",      "20", 15,  61,  17,  44, "27.9%"),
]

# Ground ball leaders
gb_leaders = [
    ("Mathew Pettigrew", "13", 196),
    ("Connor Ruybalid",  "21",  79),
    ("Zachary Stephens", "57",  58),
    ("Nick Graves",      "30",  48),
    ("Kyle Newman",      "69",  45),
]

# ── Helper: stat box row ──────────────────────────────────────────────────────
def stat_box(label, value):
    return Table(
        [[Paragraph(str(value), big_num_style)],
         [Paragraph(label, label_style)]],
        colWidths=[1.4*inch],
        style=TableStyle([
            ("BOX",        (0,0), (-1,-1), 1, GOLD),
            ("BACKGROUND", (0,0), (-1,-1), LIGHT_BG),
            ("TOPPADDING",    (0,0), (-1,-1), 8),
            ("BOTTOMPADDING", (0,0), (-1,-1), 8),
            ("ALIGN",      (0,0), (-1,-1), "CENTER"),
            ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ])
    )

def tbl_style(header_bg=MAROON, alt=ROW_ALT):
    return TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), header_bg),
        ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 9),
        ("ALIGN",         (0, 0), (-1,-1), "CENTER"),
        ("VALIGN",        (0, 0), (-1,-1), "MIDDLE"),
        ("FONTNAME",      (0, 1), (-1,-1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1,-1), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1,-1), [WHITE, alt]),
        ("GRID",          (0, 0), (-1,-1), 0.4, colors.HexColor("#CCCCCC")),
        ("TOPPADDING",    (0, 0), (-1,-1), 4),
        ("BOTTOMPADDING", (0, 0), (-1,-1), 4),
        ("LEFTPADDING",   (0, 0), (-1,-1), 6),
        ("RIGHTPADDING",  (0, 0), (-1,-1), 6),
    ])

# ── Build PDF ─────────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUTPUT, pagesize=letter,
    leftMargin=0.65*inch, rightMargin=0.65*inch,
    topMargin=0.5*inch, bottomMargin=0.65*inch
)
story = []

# ── Cover banner ─────────────────────────────────────────────────────────────
banner = Table(
    [[Paragraph("ALOHA HIGH SCHOOL LACROSSE", title_style)],
     [Paragraph(f"{SEASON_LABEL} — Statistical Report", subtitle_style)],
     [Paragraph("Source: Hudl MCP Server  |  Season ID: 936742", note_style)]],
    colWidths=[7.2*inch],
    style=TableStyle([
        ("BACKGROUND", (0,0), (-1,1), DARK_BG),
        ("BACKGROUND", (0,2), (-1,2), MAROON),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 16),
        ("RIGHTPADDING",  (0,0), (-1,-1), 16),
        ("ALIGN",         (0,0), (-1,-1), "CENTER"),
    ])
)
story.append(banner)
story.append(Spacer(1, 18))

# ── Season snapshot stat boxes ────────────────────────────────────────────────
story.append(Paragraph("SEASON AT A GLANCE", section_style))

boxes = Table(
    [[stat_box("Games Played",    GAMES_PLAYED),
      stat_box("Goals Scored",    GOALS_FOR),
      stat_box("Goals Allowed",   GOALS_AGAINST),
      stat_box("Goals/Game",      GPG_FOR),
      stat_box("Total Shots",     SHOTS)]],
    colWidths=[1.44*inch]*5,
    style=TableStyle([
        ("ALIGN",  (0,0), (-1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING",  (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
    ])
)
story.append(boxes)
story.append(Spacer(1, 6))

boxes2 = Table(
    [[stat_box("Shots on Target", SOT),
      stat_box("Shot Pct",        SHOT_PCT),
      stat_box("Total Assists",   ASSISTS),
      stat_box("Asst/Game",       round(ASSISTS/GAMES_PLAYED, 1)),
      stat_box("GA/Game",         GPG_AGAINST)]],
    colWidths=[1.44*inch]*5,
    style=TableStyle([
        ("ALIGN",  (0,0), (-1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING",  (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
    ])
)
story.append(boxes2)
story.append(Spacer(1, 6))
story.append(Paragraph(
    "* Win/loss record not available for historical seasons in current data set.  "
    "Games played figure derived from maximum individual player game counts.",
    note_style))

# ── Season narrative ─────────────────────────────────────────────────────────
story.append(Paragraph("SEASON NARRATIVE", section_style))
story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=8))

story.append(Paragraph(
    "The 2018-2019 Aloha High School lacrosse season was defined by razor-thin margins. "
    "Over 18 games the Warriors scored <b>232 goals</b> and surrendered <b>233</b> — a "
    "single-goal differential across an entire season, underscoring just how competitive "
    "each contest was. The offense operated at a <b>35.6% shooting efficiency</b> on "
    "652 attempts, generating an average of <b>36 shots per game</b>. At 12.9 goals per "
    "game the attack was prolific, but the defense was pushed at a matching rate, making "
    "goaltending and ball-possession battles the decisive factors on any given night.",
    body_style))

story.append(Paragraph(
    "Offensively, the team possessed genuine depth with six players reaching double-digit "
    "goals. <b>Liam Johnston</b> led all scorers in goals (45), while <b>Nick Graves</b> "
    "was the engine of the attack — his team-leading 42 assists and 77 total points show "
    "a player who elevated everyone around him. At midfield, <b>Mathew Pettigrew</b> "
    "controlled possession by winning 60.1% of his 366 face-off attempts, giving the "
    "offense a consistent first-touch advantage.",
    body_style))

story.append(Paragraph(
    "In goal, <b>Kyle Newman</b> carried the heaviest load (17 games) and made 148 saves. "
    "Backup <b>David Morgan</b> posted the best save percentage (66.7%) in his 8-game "
    "sample, suggesting strong depth at the position. The team's ground-ball work was led "
    "by Pettigrew (196 GB) and Connor Ruybalid (79 GB), whose hustle and possession "
    "instincts were vital to offensive transitions.",
    body_style))

# ── Scoring leaders ────────────────────────────────────────────────────────────
story.append(Paragraph("OFFENSIVE STATISTICS — SCORING LEADERS", section_style))
story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=8))

off_hdr = ["#", "Player", "GP", "G", "A", "PTS", "Shots", "SOT", "Sh%", "GB", "EMG"]
off_data = [off_hdr]
for p in scorers:
    name, num, gp, g, a, pts, sh, sot, spct, gb, emg = p
    off_data.append([num, name, gp, g, a, pts, sh, sot, spct, gb, emg])

off_widths = [0.35*inch, 1.55*inch, 0.38*inch, 0.35*inch, 0.35*inch,
              0.42*inch, 0.45*inch, 0.42*inch, 0.52*inch, 0.42*inch, 0.42*inch]
off_tbl = Table(off_data, colWidths=off_widths)
ts = tbl_style()
# Highlight top-3 point scorers
ts.add("BACKGROUND", (0,1), (-1,1), colors.HexColor("#FCF0D0"))  # Graves
ts.add("BACKGROUND", (0,2), (-1,2), colors.HexColor("#FCF0D0"))  # Johnston
ts.add("BACKGROUND", (0,3), (-1,3), colors.HexColor("#FCF0D0"))  # Gfroerer
ts.add("FONTNAME",   (0,1), (-1,3), "Helvetica-Bold")
ts.add("ALIGN",      (1,0), (1,-1), "LEFT")   # left-align name col
off_tbl.setStyle(ts)
story.append(off_tbl)
story.append(Spacer(1, 4))
story.append(Paragraph(
    "Bold rows = top-3 point producers.  EMG = Extra-Man Goals.  "
    "SOT = Shots on Target.  GB = Ground Balls.",
    note_style))

# ── Goalie stats ──────────────────────────────────────────────────────────────
story.append(Paragraph("GOALTENDING STATISTICS", section_style))
story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=8))

gk_hdr = ["#", "Goalie", "GP", "Saves", "GA", "Save%"]
gk_data = [gk_hdr]
for row in goalies:
    gk_data.append(list(row))

gk_widths = [0.4*inch, 2.0*inch, 0.5*inch, 0.7*inch, 0.6*inch, 0.7*inch]
gk_tbl = Table(gk_data, colWidths=gk_widths)
gts = tbl_style()
gts.add("ALIGN", (1,0), (1,-1), "LEFT")
gk_tbl.setStyle(gts)
story.append(gk_tbl)
story.append(Spacer(1, 4))

# Goalie analysis bullets
story.append(Paragraph(
    "<b>Kyle Newman</b> (#69) — Primary starter in 17 games. Faced the heaviest shot "
    "volume on the team (195 goals allowed against a high-scoring schedule). 148 saves "
    "at 43.1% — a workable rate given the era's high-scoring game pace.",
    bullet_style))
story.append(Paragraph(
    "<b>David Morgan</b> (#26) — Best save percentage on the roster at 66.7% in 8 games "
    "(28 saves / 14 GA). Demonstrated elite efficiency in limited appearances.",
    bullet_style))
story.append(Paragraph(
    "<b>Gerardo Flores</b> (#35) — Third-string option in 6 games. 52.4% save rate "
    "showed solid development as depth behind the starters.",
    bullet_style))

# ── Face-offs ─────────────────────────────────────────────────────────────────
story.append(Paragraph("FACE-OFF STATISTICS", section_style))
story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=8))

fo_hdr = ["#", "Player", "GP", "FO Att.", "FO Wins", "FO Loss", "FO%"]
fo_data = [fo_hdr]
for row in faceoffs:
    fo_data.append(list(row))

fo_widths = [0.4*inch, 1.9*inch, 0.5*inch, 0.65*inch, 0.75*inch, 0.75*inch, 0.6*inch]
fo_tbl = Table(fo_data, colWidths=fo_widths)
fts = tbl_style()
fts.add("ALIGN", (1,0), (1,-1), "LEFT")
fo_tbl.setStyle(fts)
story.append(fo_tbl)
story.append(Spacer(1, 4))
story.append(Paragraph(
    "<b>Mathew Pettigrew</b> was the face-off cornerstone of the 2018-19 offense. "
    "His 60.1% win rate on 366 attempts (220 wins) meant Aloha started the majority "
    "of possessions with the ball, providing a significant structural advantage. "
    "<b>Nixon Hobbs</b> served as the backup face-off man but struggled at 27.9% on "
    "61 attempts — a developmental opportunity heading into 2019-20.",
    body_style))

# ── Ground balls ──────────────────────────────────────────────────────────────
story.append(Paragraph("GROUND BALL LEADERS", section_style))
story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=8))

gb_hdr = ["#", "Player", "Ground Balls"]
gb_data = [gb_hdr]
for row in gb_leaders:
    gb_data.append(list(row))

gb_widths = [0.4*inch, 2.0*inch, 1.0*inch]
gb_tbl = Table(gb_data, colWidths=gb_widths)
gbts = tbl_style()
gbts.add("ALIGN", (1,0), (1,-1), "LEFT")
gb_tbl.setStyle(gbts)
story.append(gb_tbl)

# ── Key Insights ──────────────────────────────────────────────────────────────
story.append(PageBreak())
story.append(Paragraph("KEY INSIGHTS & ANALYSIS", section_style))
story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=10))

insights = [
    ("OFFENSIVE FIREPOWER WITH REAL DEPTH",
     "Six players hit double-digit goals (Johnston 45, Gfroerer 37, Graves 35, "
     "Stephens 27, Talley 21, Jenson 18). This prevented opponents from keying on a "
     "single scorer — a hallmark of well-balanced attacks."),
    ("NICK GRAVES — ELITE PLAYMAKER",
     "Graves led the team in both points (77) and assists (42), averaging 4.3 points "
     "per game across all 18 contests. His 2.3 assists per game placed him in the role "
     "of a true quarterback for the offense — finding shooters rather than dominating "
     "the ball himself. His 39.3% shot efficiency also shows he was a threat when "
     "he chose to shoot."),
    ("LIAM JOHNSTON — VOLUME SCORER",
     "Johnston's 45 goals on 127 shots (35.4% conversion) represents the highest goal "
     "total on the roster. His style was high-volume and direct — a player opponents "
     "needed to account for in every possession."),
    ("KOBE JENSON — ELITE EFFICIENCY IN LIMITED GAMES",
     "Playing only 9 of 18 games (possibly due to injury or availability), Jenson "
     "scored 18 goals at a remarkable 51.4% shot conversion rate. On a per-game basis "
     "he was the most dangerous scorer on the roster (2.0 G/game vs. Johnston's "
     "2.6 G/game). A full season from Jenson would likely have materially changed "
     "team outcomes."),
    ("FACE-OFF DOMINANCE A KEY STRUCTURAL ADVANTAGE",
     "Pettigrew's 60.1% win rate on 366 face-offs meant Aloha controlled possession "
     "at the start of roughly 220 plays across the season. In a sport where possession "
     "translates directly to shot opportunities, this is one of the most impactful "
     "individual contributions on the roster."),
    ("RAZOR-THIN GOAL DIFFERENTIAL",
     "232 goals for vs. 233 against over 18 games is a difference of less than 0.1 "
     "goals per game. The season's outcomes were likely decided by fine margins in "
     "close contests — a testament to competitive scheduling. Improving goaltending "
     "save percentage from ~43% toward 50%+ would have likely swung multiple results."),
    ("CONNOR RUYBALID — HIGH-EFFICIENCY POSSESSION PLAYER",
     "Ruybalid converted all 5 of his shots on target into goals (100% goal-to-SOT "
     "ratio) and accumulated 79 ground balls in 17 games. Though only 3 goals and 5 "
     "assists, his off-ball contributions and possession work were essential to the "
     "midfield engine."),
    ("GOALTENDING DEPTH IS A STRENGTH",
     "Three different goalies saw meaningful playing time. David Morgan's 66.7% save "
     "rate as the second-choice keeper is exceptionally encouraging — a number that "
     "suggests either strong developmental coaching or an outstanding natural talent "
     "waiting for more opportunity."),
]

for title, body in insights:
    story.append(Paragraph(
        f"<b>{title}</b>",
        ParagraphStyle("InsightTitle", fontSize=11, leading=14,
                       textColor=MAROON, fontName="Helvetica-Bold",
                       spaceBefore=10, spaceAfter=2)
    ))
    story.append(Paragraph(body, body_style))

# ── Statistical Leaders Summary Table ────────────────────────────────────────
story.append(Spacer(1, 12))
story.append(Paragraph("STATISTICAL LEADERS SUMMARY", section_style))
story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=8))

leaders_data = [
    ["Category",         "Leader",              "#",  "Total"],
    ["Points",           "Nick Graves",         "30", "77"],
    ["Goals",            "Liam Johnston",        "24", "45"],
    ["Assists",          "Nick Graves",          "30", "42"],
    ["Shots",            "Liam Johnston",        "24", "127"],
    ["Shot Efficiency",  "Alex Stock",           "27", "66.7%"],
    ["Ground Balls",     "Mathew Pettigrew",     "13", "196"],
    ["Face-off Wins",    "Mathew Pettigrew",     "13", "220 (60.1%)"],
    ["Saves",            "Kyle Newman",          "69", "148"],
    ["Save Pct (min 6G)","David Morgan",         "26", "66.7%"],
    ["Extra-Man Goals",  "Zachary Stephens",     "57", "4"],
    ["Penalties",        "Mathew Pettigrew",     "13", "32"],
]

ldr_widths = [2.0*inch, 2.0*inch, 0.5*inch, 1.8*inch]
ldr_tbl = Table(leaders_data, colWidths=ldr_widths)
lts = tbl_style()
lts.add("ALIGN", (0,0), (0,-1), "LEFT")
lts.add("ALIGN", (1,0), (1,-1), "LEFT")
ldr_tbl.setStyle(lts)
story.append(ldr_tbl)

# ── Footer note ────────────────────────────────────────────────────────────────
story.append(Spacer(1, 20))
story.append(HRFlowable(width="100%", thickness=0.5, color=GOLD))
story.append(Spacer(1, 6))
story.append(Paragraph(
    "Report generated by the Hudl MCP Server (feature/multi-season-support branch)  |  "
    "Season ID: 936742  |  Data source: Hudl lacrosse statistics platform  |  "
    "Win/loss record not available for historical seasons in current implementation.",
    note_style))

# ── Build ─────────────────────────────────────────────────────────────────────
doc.build(story)
print(f"PDF saved to: {OUTPUT}")
