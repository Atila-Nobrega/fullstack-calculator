"""Integration tests for the HTTP layer.

These drive the real ASGI app through `TestClient` (httpx under the hood), so
they exercise routing, Pydantic validation, JSON serialisation, the exception
handlers and CORS together. Arithmetic itself is already covered by
`test_unit.py` -- what is under test here is the wiring.
"""

import pytest
from fastapi.testclient import TestClient

from main import OPERATIONS, app
from models.schemas import Operation

client = TestClient(app)

FRONTEND_ORIGIN = "http://localhost:5173"


def post(payload):
    """POST a raw body to the calculate endpoint."""
    return client.post("/api/calculate", json=payload)


class TestHealthCheck:
    def test_returns_200(self):
        assert client.get("/api/health").status_code == 200

    def test_reports_ok(self):
        assert client.get("/api/health").json() == {"status": "ok"}

    def test_responds_with_json(self):
        response = client.get("/api/health")
        assert response.headers["content-type"].startswith("application/json")


class TestCalculateSuccess:
    @pytest.mark.parametrize(
        "operation, a, b, expected",
        [
            ("add", 2, 3, 5.0),
            ("subtract", 10, 3, 7.0),
            ("multiply", 4, 5, 20.0),
            ("divide", 7, 2, 3.5),
            ("power", 2, 3, 8.0),
            ("percentage", 15, 200, 30.0),
        ],
    )
    def test_binary_operations(self, operation, a, b, expected):
        response = post({"operation": operation, "a": a, "b": b})
        assert response.status_code == 200
        assert response.json()["result"] == pytest.approx(expected)

    def test_square_root_needs_no_second_operand(self):
        response = post({"operation": "square_root", "a": 9})
        assert response.status_code == 200
        assert response.json()["result"] == pytest.approx(3.0)

    def test_echoes_the_request_back(self):
        response = post({"operation": "add", "a": 2, "b": 3})
        assert response.json() == {
            "operation": "add",
            "a": 2.0,
            "b": 3.0,
            "result": 5.0,
        }

    def test_unary_response_carries_a_null_b(self):
        assert post({"operation": "square_root", "a": 9}).json()["b"] is None

    def test_responds_with_json(self):
        response = post({"operation": "add", "a": 1, "b": 1})
        assert response.headers["content-type"].startswith("application/json")

    def test_negative_operands_are_accepted(self):
        response = post({"operation": "add", "a": -4, "b": -6})
        assert response.json()["result"] == pytest.approx(-10.0)

    def test_every_operation_is_reachable(self):
        # Guards against adding an Operation member without wiring it up.
        assert set(OPERATIONS) == set(Operation)

    @pytest.mark.parametrize("operation", list(Operation))
    def test_every_operation_returns_a_result(self, operation):
        payload = {"operation": operation.value, "a": 4}
        if operation is not Operation.SQUARE_ROOT:
            payload["b"] = 2
        response = post(payload)
        assert response.status_code == 200
        assert isinstance(response.json()["result"], float)


class TestDomainErrors:
    """Failures the arithmetic itself reports: well-formed but unprocessable."""

    def test_division_by_zero_returns_400(self):
        response = post({"operation": "divide", "a": 1, "b": 0})
        assert response.status_code == 400
        assert response.json()["error"] == "division_by_zero"

    def test_zero_to_a_negative_power_is_a_division_by_zero(self):
        response = post({"operation": "power", "a": 0, "b": -1})
        assert response.status_code == 400
        assert response.json()["error"] == "division_by_zero"

    def test_square_root_of_a_negative_returns_invalid_input(self):
        response = post({"operation": "square_root", "a": -1})
        assert response.status_code == 400
        assert response.json()["error"] == "invalid_input"

    def test_negative_base_with_fractional_exponent_is_invalid_input(self):
        response = post({"operation": "power", "a": -8, "b": 0.5})
        assert response.status_code == 400
        assert response.json()["error"] == "invalid_input"

    def test_overflow_returns_result_overflow(self):
        response = post({"operation": "power", "a": 1e200, "b": 5})
        assert response.status_code == 400
        assert response.json()["error"] == "result_overflow"

    def test_silent_overflow_is_caught_too(self):
        # a * b returns inf rather than raising; it must not reach the client.
        response = post({"operation": "multiply", "a": 1e308, "b": 10})
        assert response.status_code == 400
        assert response.json()["error"] == "result_overflow"

    def test_error_body_carries_a_detail(self):
        body = post({"operation": "divide", "a": 1, "b": 0}).json()
        assert body["detail"] and isinstance(body["detail"], str)

    def test_error_body_has_only_the_contract_fields(self):
        body = post({"operation": "divide", "a": 1, "b": 0}).json()
        assert set(body) == {"error", "detail"}


class TestRequestValidation:
    """Failures Pydantic reports before the arithmetic is reached."""

    @pytest.mark.parametrize(
        "payload",
        [
            {"operation": "add", "a": 1},  # binary op missing b
            {"operation": "square_root", "a": 9, "b": 2},  # unary op given b
            {"operation": "factorial", "a": 5, "b": 1},  # unknown operation
            {"operation": "add", "a": "abc", "b": 1},  # non-numeric operand
            {"operation": "add", "b": 1},  # missing a
            {"a": 1, "b": 2},  # missing operation
            {"operation": "add", "a": 1, "b": 2, "precision": 4},  # extra field
            {},  # empty body
        ],
    )
    def test_bad_bodies_return_422(self, payload):
        assert post(payload).status_code == 422

    def test_validation_errors_use_the_same_error_shape(self):
        body = post({"operation": "add", "a": 1}).json()
        assert set(body) == {"error", "detail"}
        assert body["error"] == "validation_error"

    def test_validation_detail_names_the_problem(self):
        detail = post({"operation": "add", "a": 1}).json()["detail"]
        assert "b" in detail

    def test_infinity_is_rejected_at_the_edge(self):
        # Sent as a raw JSON literal, which is what a naive client would emit.
        response = client.post(
            "/api/calculate",
            content='{"operation": "add", "a": Infinity, "b": 1}',
            headers={"content-type": "application/json"},
        )
        assert response.status_code == 422

    def test_a_non_json_body_returns_422(self):
        response = client.post(
            "/api/calculate",
            content="not json at all",
            headers={"content-type": "application/json"},
        )
        assert response.status_code == 422


class TestRouting:
    def test_unknown_path_returns_404(self):
        assert client.get("/api/nope").status_code == 404

    def test_get_on_calculate_is_not_allowed(self):
        assert client.get("/api/calculate").status_code == 405


class TestCors:
    def test_allows_the_vite_dev_origin(self):
        response = client.post(
            "/api/calculate",
            json={"operation": "add", "a": 1, "b": 2},
            headers={"Origin": FRONTEND_ORIGIN},
        )
        assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN

    def test_answers_the_preflight_request(self):
        response = client.options(
            "/api/calculate",
            headers={
                "Origin": FRONTEND_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN

    def test_does_not_allow_an_unknown_origin(self):
        response = client.post(
            "/api/calculate",
            json={"operation": "add", "a": 1, "b": 2},
            headers={"Origin": "http://evil.example"},
        )
        assert "access-control-allow-origin" not in response.headers


class TestOpenApiSchema:
    def test_schema_is_served(self):
        assert client.get("/openapi.json").status_code == 200

    def test_documents_both_routes(self):
        paths = client.get("/openapi.json").json()["paths"]
        assert "/api/health" in paths
        assert "/api/calculate" in paths

    def test_documents_the_models(self):
        schemas = client.get("/openapi.json").json()["components"]["schemas"]
        assert {
            "CalculateRequest",
            "CalculateResponse",
            "ErrorResponse",
            "HealthResponse",
        } <= set(schemas)

    def test_documents_the_error_responses(self):
        responses = client.get("/openapi.json").json()["paths"]["/api/calculate"][
            "post"
        ]["responses"]
        assert {"200", "400", "422"} <= set(responses)
