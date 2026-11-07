"""Synthetic resume (not a real person) in a second common layout: company line first,
title + right-aligned dates via tab stops, description paragraph before bullets,
Word list bullets, a hyperlink-only LinkedIn label and an Indian-style Personal Details block."""
import sys
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_TAB_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import docx.opc.constants as C

doc = Document()
st = doc.styles['Normal']; st.font.name = 'Liberation Sans'; st.font.size = Pt(10)
sec = doc.sections[0]; sec.left_margin = sec.right_margin = Inches(0.7)
RIGHT = Inches(7.1)

def para(text='', bold=False, size=None, italic=False, tab=None, style=None):
    p = doc.add_paragraph(style=style)
    p.paragraph_format.space_after = Pt(2)
    if tab is not None:
        p.paragraph_format.tab_stops.add_tab_stop(RIGHT, WD_TAB_ALIGNMENT.RIGHT)
    r = p.add_run(text); r.bold = bold; r.italic = italic
    if size: r.font.size = Pt(size)
    if tab is not None:
        r2 = p.add_run('\t' + tab); r2.bold = bold; r2.italic = italic
    return p

def heading(t):
    p = para(t, bold=True, size=11); p.paragraph_format.space_before = Pt(8)

def bullet(t):
    p = doc.add_paragraph(t, style='List Bullet'); p.paragraph_format.space_after = Pt(1)

def hyperlink(p, url, text):
    rid = p.part.relate_to(url, C.RELATIONSHIP_TYPE.HYPERLINK, is_external=True)
    h = OxmlElement('w:hyperlink'); h.set(qn('r:id'), rid)
    r = OxmlElement('w:r'); t = OxmlElement('w:t'); t.text = text; r.append(t); h.append(r)
    p._p.append(h)

p = para('NEHA KAPOOR', bold=True, size=18)
para('Lead Backend Engineer')
p = para('neha.kapoor@example.com | +91 90000 00002 | Bengaluru, India | ')
hyperlink(p, 'https://www.linkedin.com/in/neha-kapoor-example', 'LinkedIn')

heading('PROFILE SUMMARY')
para('Backend engineer with 9 years of experience building payment and logistics platforms on Java and Go. '
     'Leads small teams, owns architecture decisions and cares about operability and cost.')

heading('SKILLS')
para('Languages: Java, Go, Python, SQL')
para('Cloud & Infrastructure: AWS (EKS, Lambda, SQS), Kubernetes, Terraform, Docker')
para('Practices: Domain-Driven Design, Event Sourcing (Kafka, Debezium), Observability (Prometheus, Grafana)')

heading('WORK EXPERIENCE')
para('Acme Logistics Pvt Ltd', bold=True, tab='Bengaluru, India')
para('Lead Backend Engineer', italic=True, tab='Jan 2021 – Present')
para('Own the shipment-tracking platform used by 40 enterprise customers; lead a team of six engineers.')
bullet('Re-architected the tracking pipeline on Kafka and Go, cutting p99 latency from 2.1 s to 380 ms while handling 3x the event volume during festive peaks.')
bullet('Introduced contract testing (Pact) across 14 services, reducing integration defects found in staging by 45%.')
bullet('Mentored four engineers to promotion and ran the backend hiring loop.')

para('Globex Fintech', bold=True, tab='Pune, India')
para('Senior Software Engineer', italic=True, tab='Jul 2017 – Dec 2020')
bullet('Built the UPI collect-request service in Java 11 and Spring Boot, processing 1.2 million requests per day.')
bullet('Moved batch settlement from cron jobs to AWS Step Functions, removing two hours of daily manual checks.')

para('Initech Systems', bold=True, tab='Noida, India')
para('Software Engineer', italic=True, tab='Jun 2015 – Jun 2017')
bullet('Maintained the billing module (Java 8, Oracle) and wrote its first automated regression suite.')

heading('PROJECTS')
para('OpenRoute – Route Optimisation Library', bold=True)
para('Tech: Go, PostGIS, gRPC')
bullet('Open-source vehicle-routing library with 1.4k GitHub stars; implements a time-window aware savings heuristic.')
bullet('Link: github.com/example/openroute')
para('Expense Splitter', bold=True)
para('A small Flutter app to split shared expenses offline-first, with CSV export for accountants.')

heading('EDUCATION')
para('B.E. in Electronics and Communication, RV College of Engineering, 2011 - 2015, CGPA 8.2/10')
para('Class XII (CBSE), Kendriya Vidyalaya, 2011, 91%')

heading('CERTIFICATIONS')
bullet('AWS Certified Solutions Architect – Professional, Amazon Web Services, 2022')
bullet('Certified Kubernetes Administrator (CKA) – CNCF, 2021')

heading('PERSONAL DETAILS')
para('Date of Birth: 01 January 1993')
para('Nationality: Indian')
para('Languages Known: English, Hindi, Kannada')

doc.save(sys.argv[1])
