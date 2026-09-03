# Calculator

React + Vite frontend, FastAPI backend.

## Structure

```
frontend/   React + Vite app (port 5173)
backend/    FastAPI app (port 8000)
```

## Run the backend

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

API docs at http://localhost:8000/docs

## Run the frontend

```powershell
cd frontend
npm run dev
```

App at http://localhost:5173
