import logging
import os
import re
import sqlite3
from contextlib import asynccontextmanager, closing
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
DATA_DIR = Path(os.getenv("DATA_DIR", ROOT / "data"))
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", DATA_DIR / "student_support.db"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
logger = logging.getLogger(__name__)

SAMPLE_KNOWLEDGE = [
    (
        "Admissions overview",
        "Admissions",
        "Applications are submitted through the university admissions portal. Prepare your academic transcripts, identification, and any program-specific materials. Application dates and requirements vary by program; confirm the current details in the official admissions portal.",
    ),
    (
        "Course registration",
        "Courses",
        "Students browse the course catalog and register through the student portal during their assigned registration window. Check course prerequisites and program requirements before enrolling. Contact the academic advising office if a required course is full.",
    ),
    (
        "Finding your timetable",
        "Timetable",
        "Your personal class timetable is available in the student portal under Academics. Room assignments and class times can change, so check the portal before attending. For a timetable conflict, contact your department office.",
    ),
    (
        "Exam information",
        "Exams",
        "Exam dates and locations are published in the student portal and confirmed by course instructors. Review the course syllabus for assessment rules. Students who need exam accommodations should contact the accessibility services office as early as possible.",
    ),
    (
        "Library services",
        "Campus facilities",
        "The campus library provides study spaces, research support, and access to print and online resources. Current opening hours and room availability are listed on the library website. Bring your student ID to access student services.",
    ),
    (
        "Student wellbeing",
        "Campus facilities",
        "The student wellbeing center can connect students with counseling, health, and peer-support services. Visit the student services portal to see current hours and appointment options. If you are in immediate danger, contact local emergency services.",
    ),
    (
        "Getting around campus",
        "Campus facilities",
        "Campus maps, accessibility routes, and transportation information are available on the university website. For accessible transit or mobility support, contact the campus accessibility office.",
    ),
]

def connect_database() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with closing(connect_database()) as connection, connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS university_info (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        connection.execute(
            """CREATE VIRTUAL TABLE IF NOT EXISTS university_info_fts
            USING fts5(title, category, content, tokenize='unicode61 remove_diacritics 2')"""
        )
        count = connection.execute("SELECT COUNT(*) FROM university_info").fetchone()[0]
        if count == 0:
            for title, category, content in SAMPLE_KNOWLEDGE:
                cursor = connection.execute(
                    "INSERT INTO university_info (title, category, content) VALUES (?, ?, ?)",
                    (title, category, content),
                )
                connection.execute(
                    "INSERT INTO university_info_fts (rowid, title, category, content) VALUES (?, ?, ?, ?)",
                    (cursor.lastrowid, title, category, content),
                )


def find_references(question: str, limit: int = 4) -> list[dict[str, str]]:
    tokens = re.findall(r"[\w'-]{2,}", question.casefold())
    stop_words = {
        "the", "and", "for", "what", "when", "where", "how", "can", "you", "are",
        "does", "with", "from", "please", "about", "your", "have", "who", "our",
        "into", "this", "that", "is", "do", "my", "in", "on", "to", "at", "of",
        "a", "an", "it", "be", "was", "were", "will", "would", "should", "could",
    }
    tokens = list(dict.fromkeys(token for token in tokens if token not in stop_words))[:12]
    if not tokens:
        return []

    match_query = " OR ".join('"' + token.replace('"', '""') + '"' for token in tokens)
    with closing(connect_database()) as connection, connection:
        try:
            rows = connection.execute(
                """SELECT university_info.title, university_info.category, university_info.content
                FROM university_info_fts
                JOIN university_info ON university_info.id = university_info_fts.rowid
                WHERE university_info_fts MATCH ?
                ORDER BY bm25(university_info_fts) LIMIT ?""",
                (match_query, limit),
            ).fetchall()
        except sqlite3.OperationalError:
            like_conditions = " OR ".join(
                "lower(title || ' ' || category || ' ' || content) LIKE ?" for _ in tokens
            )
            rows = connection.execute(
                f"SELECT title, category, content FROM university_info WHERE {like_conditions} LIMIT ?",
                tuple(f"%{token}%" for token in tokens) + (limit,),
            ).fetchall()
    return [dict(row) for row in rows]


def save_knowledge(title: str, category: str, content: str) -> int:
    with closing(connect_database()) as connection, connection:
        cursor = connection.execute(
            "INSERT INTO university_info (title, category, content) VALUES (?, ?, ?)",
            (title.strip(), category.strip(), content.strip()),
        )
        knowledge_id = cursor.lastrowid
        connection.execute(
            "INSERT INTO university_info_fts (rowid, title, category, content) VALUES (?, ?, ?, ?)",
            (knowledge_id, title.strip(), category.strip(), content.strip()),
        )
    return knowledge_id


class ChatRequest(BaseModel):
    message: Annotated[str, Field(min_length=1, max_length=4000)]
    language: Annotated[str, Field(max_length=40)] = "English"


class KnowledgeRequest(BaseModel):
    title: Annotated[str, Field(min_length=2, max_length=160)]
    category: Annotated[str, Field(min_length=2, max_length=80)]
    content: Annotated[str, Field(min_length=10, max_length=10000)]


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Campus Companion", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health() -> dict[str, str | bool]:
    return {"status": "ok", "openai_configured": bool(OPENAI_API_KEY)}


@app.get("/api/knowledge")
def list_knowledge() -> list[dict[str, str | int]]:
    with closing(connect_database()) as connection, connection:
        rows = connection.execute(
            "SELECT id, title, category FROM university_info ORDER BY category, title"
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/knowledge", status_code=201)
def add_knowledge(item: KnowledgeRequest) -> dict[str, int | str]:
    knowledge_id = save_knowledge(item.title, item.category, item.content)
    return {"id": knowledge_id, "title": item.title.strip(), "category": item.category.strip()}


@app.post("/api/chat")
def chat(request: ChatRequest) -> dict[str, object]:
    question = request.message.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Please enter a question.")

    references = find_references(question)
    citations = [{"title": item["title"], "category": item["category"]} for item in references]
    context = "\n\n".join(
        f"[{item['category']}] {item['title']}: {item['content']}" for item in references
    )

    if OPENAI_API_KEY:
        try:
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_openai import ChatOpenAI

            prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        "system",
                        "You are a helpful university student-support assistant. Answer in {language}. "
                        "Use only the university reference material below. If it does not contain the "
                        "answer, say what is missing and direct the student to the relevant university "
                        "office or official portal. Do not invent policies, dates, fees, or contact details. "
                        "Be concise, warm, and practical.\n\nReference material:\n{context}",
                    ),
                    ("human", "{question}"),
                ]
            )
            model = ChatOpenAI(
                model=OPENAI_MODEL,
                api_key=OPENAI_API_KEY,
                temperature=0.2,
                timeout=25,
                max_retries=1,
            )
            answer = (prompt | model).invoke(
                {"language": request.language, "context": context or "No matching university information was found.", "question": question}
            ).content
            return {"answer": str(answer), "citations": citations, "mode": "ai"}
        except Exception:
            logger.exception("OpenAI request failed; returning grounded local response")

    if references:
        answer = "I found this in the university information:\n\n" + references[0]["content"]
        mode = "local"
    else:
        answer = (
            "I couldn't find that in the university information I have. Try rephrasing your "
            "question, or check with the relevant university office for an official answer."
        )
        mode = "local"
    return {"answer": answer, "citations": citations, "mode": mode}

