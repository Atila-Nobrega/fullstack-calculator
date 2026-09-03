from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Calculator API")

# Vite's default dev server port
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# TODO: build out calculator endpoints here, e.g.
# @app.post("/api/calculate")
# def calculate(payload: ...):
#     ...
