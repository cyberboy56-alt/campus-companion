# Campus Companion

A student-support chat prototype built with FastAPI, LangChain, OpenAI, and SQLite. The included university information is sample content; add or replace it with your institution's verified policies before sharing this app with students.

## Run locally

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Add your OpenAI API key to `.env`, then start FastAPI in one terminal:

```powershell
uvicorn main:app --reload
```

In a second terminal, start the Next.js + Tailwind frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>. The Next.js dev server proxies `/api/*` to FastAPI at `http://127.0.0.1:8000`. Set `FASTAPI_URL` if the backend runs elsewhere. Without an API key, the app still answers from matching SQLite entries using a simple local response. With a key configured, LangChain sends the question and retrieved university information to the selected OpenAI model. Answers are prompted to stay within that information and to identify when it is missing.

## University information

The database is created at `data/student_support.db` on first start and seeded with clearly generic sample entries. Use **Add information** in the interface to add verified items; they are searchable immediately. You can change the database location with `DATABASE_PATH` or `DATA_DIR`.

The language selector guides OpenAI responses in English, Spanish, French, or Hindi. The local no-key fallback currently returns its fixed response in English.

This is a local prototype, not a production 24/7 service. Before deployment, protect knowledge editing with university authentication, replace sample information, add monitoring and backups, and configure a production hosting and uptime strategy.

## GitHub Pages and Render deployment

The Pages workflow publishes the static Next.js frontend at `https://cyberboy56-alt.github.io/campus-companion/`. It skips deployment until the GitHub repository variable `API_URL` contains the deployed FastAPI origin (for example, the Render service URL), avoiding a published chat that cannot reach its API. Set Pages to use **GitHub Actions** in the repository settings, then rerun the workflow after setting `API_URL`.

`render.yaml` describes the FastAPI service and a persistent SQLite disk. The disk requires a paid Render plan; deploying the blueprint can incur charges. This project setup does not create Render resources. Add the OpenAI key in Render's environment settings if AI-generated answers are required, and set `CORS_ORIGINS` to `https://cyberboy56-alt.github.io`.

The Pages workflow cannot publish a working app until the Render API is deployed and `API_URL` is set. GitHub Pages hosts only the static frontend, not FastAPI or SQLite.
