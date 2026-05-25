"""
FastAPI + SymPy backend for symbolic computation.
Run with: uvicorn main:app --reload --port 8787 --host 127.0.0.1
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import sympy as sp
from sympy import symbols, integrate, diff, simplify, latex, solve, hessian, det
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
)
import scipy.integrate as sci
import numpy as np

app = FastAPI(title="Calc3D Symbolic Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Helpers ────────────────────────────────────────────────────────────────

TRANSFORMS = (
    standard_transformations
    + (implicit_multiplication_application,)
    + (convert_xor,)
)

x, y, z, t, u, v, r, theta, phi, rho = symbols(
    "x y z t u v r theta phi rho", real=True
)

LOCAL_VARS = {
    "x": x, "y": y, "z": z, "t": t, "u": u, "v": v,
    "r": r, "theta": theta, "phi": phi, "rho": rho,
    "pi": sp.pi, "e": sp.E, "oo": sp.oo,
    "sin": sp.sin, "cos": sp.cos, "tan": sp.tan,
    "asin": sp.asin, "acos": sp.acos, "atan": sp.atan, "atan2": sp.atan2,
    "exp": sp.exp, "log": sp.log, "log10": sp.log,
    "sqrt": sp.sqrt, "Abs": sp.Abs, "abs": sp.Abs,
    "cbrt": lambda a: a ** sp.Rational(1, 3),
    "ceil": sp.ceiling, "floor": sp.floor,
    "max": sp.Max, "min": sp.Min,
    "sign": sp.sign, "round": sp.Integer,
}


def parse(expr_str: str) -> sp.Expr:
    """Parse a math.js-style expression to SymPy."""
    # Handle '=' equations → move rhs to left
    if "=" in expr_str and not any(c in expr_str for c in ["==", "<=", ">="]):
        parts = expr_str.split("=", 1)
        expr_str = f"({parts[0]}) - ({parts[1]})"
    return parse_expr(expr_str, local_dict=LOCAL_VARS, transformations=TRANSFORMS)


def safe_latex(expr) -> str:
    try:
        return latex(expr)
    except Exception:
        return str(expr)


# ─── Models ─────────────────────────────────────────────────────────────────

class DoubleIntegralRequest(BaseModel):
    f: str
    x_min: float
    x_max: float
    y_min_expr: str
    y_max_expr: str
    order: Optional[str] = "dydx"


class TripleIntegralRequest(BaseModel):
    f: str
    x_min: float
    x_max: float
    y_min_expr: str
    y_max_expr: str
    z_min_expr: str
    z_max_expr: str
    order: Optional[str] = "dzdydx"


class PartialDerivativeRequest(BaseModel):
    f: str
    variable: str  # "x", "y", or "z"
    point: Optional[dict] = None  # {"x": 1.0, "y": 2.0, "z": 0.0}


class GradientRequest(BaseModel):
    f: str
    point: Optional[dict] = None


class CurlRequest(BaseModel):
    P: str
    Q: str
    R: str
    point: Optional[dict] = None


class DivergenceRequest(BaseModel):
    P: str
    Q: str
    R: str
    point: Optional[dict] = None


class CriticalPointsRequest(BaseModel):
    f: str
    x_min: float = -5
    x_max: float = 5
    y_min: float = -5
    y_max: float = 5


class CoordConvertRequest(BaseModel):
    f: str
    from_system: str  # "cartesiano" | "polar" | "cilindrico" | "esferico"
    to_system: str


# ─── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "sympy": sp.__version__}


@app.post("/integrate/double")
def double_integral(req: DoubleIntegralRequest):
    try:
        f_expr = parse(req.f)
        y_min = parse(req.y_min_expr)
        y_max = parse(req.y_max_expr)

        steps = []
        order = req.order or "dydx"
        inner_var_str = order[1] # e.g. 'y' in 'dydx'
        outer_var_str = order[3] # e.g. 'x' in 'dydx'

        inner_var = LOCAL_VARS[inner_var_str]
        outer_var = LOCAL_VARS[outer_var_str]

        # Step 1: inner integral
        inner = integrate(f_expr, (inner_var, y_min, y_max))
        inner_simplified = simplify(inner)
        steps.append({
            "title": f"Integral interna ∫ f d{inner_var_str}",
            "content": f"= {safe_latex(inner_simplified)}",
            "latex": safe_latex(inner_simplified),
        })

        # Step 2: outer integral
        outer = integrate(inner_simplified, (outer_var, req.x_min, req.x_max))
        outer_simplified = simplify(outer)
        steps.append({
            "title": f"Integral externa ∫ [...] d{outer_var_str}",
            "content": f"= {safe_latex(outer_simplified)}",
            "latex": safe_latex(outer_simplified),
        })

        # Numerical value
        num_val = float(outer_simplified.evalf())
        steps.append({
            "title": "Resultado",
            "content": f"∬_D f dA = {num_val:.10f}",
            "latex": f"\\iint_D f\\,dA = {num_val:.8f}",
        })

        return {
            "value": num_val,
            "symbolic": safe_latex(outer_simplified),
            "steps": steps,
            "error": None,
        }

    except Exception as e:
        # Numerical fallback via scipy
        try:
            from scipy.integrate import dblquad
            order = req.order or "dydx"
            # Map outer and inner for lambda depending on order
            inner_var_str = order[1]
            outer_var_str = order[3]
            f_num = sp.lambdify([LOCAL_VARS[outer_var_str], LOCAL_VARS[inner_var_str]], parse(req.f), "numpy")
            y_lo = sp.lambdify([LOCAL_VARS[outer_var_str]], parse(req.y_min_expr), "numpy")
            y_hi = sp.lambdify([LOCAL_VARS[outer_var_str]], parse(req.y_max_expr), "numpy")
            
            # dblquad takes function(y, x), outer_lim_x, outer_lim_x, inner_y_lo, inner_y_hi
            val, err = dblquad(
                lambda yv, xv: float(f_num(xv, yv)),
                req.x_min, req.x_max,
                lambda xv: float(y_lo(xv)),
                lambda xv: float(y_hi(xv)),
            )
            return {
                "value": val,
                "symbolic": None,
                "steps": [
                    {"title": "Fallback numérico (SciPy dblquad)", "content": f"≈ {val:.10f}", "latex": f"\\approx {val:.8f}"},
                ],
                "error": f"Simbólico falló ({e}), se usó integración numérica SciPy",
            }
        except Exception as e2:
            raise HTTPException(status_code=422, detail=str(e2))


@app.post("/integrate/triple")
def triple_integral(req: TripleIntegralRequest):
    try:
        f_expr = parse(req.f)
        y_min = parse(req.y_min_expr)
        y_max = parse(req.y_max_expr)
        z_min = parse(req.z_min_expr)
        z_max = parse(req.z_max_expr)

        steps = []
        order = req.order or "dzdydx"
        inner_var_str = order[1] # e.g. 'z' in 'dzdydx'
        middle_var_str = order[3] # e.g. 'y' in 'dzdydx'
        outer_var_str = order[5] # e.g. 'x' in 'dzdydx'

        inner_var = LOCAL_VARS[inner_var_str]
        middle_var = LOCAL_VARS[middle_var_str]
        outer_var = LOCAL_VARS[outer_var_str]

        # Inner integration
        inner_z = integrate(f_expr, (inner_var, z_min, z_max))
        inner_z_s = simplify(inner_z)
        steps.append({"title": f"∫ d{inner_var_str}", "content": safe_latex(inner_z_s), "latex": safe_latex(inner_z_s)})

        # Middle integration
        inner_y = integrate(inner_z_s, (middle_var, y_min, y_max))
        inner_y_s = simplify(inner_y)
        steps.append({"title": f"∫ d{middle_var_str}", "content": safe_latex(inner_y_s), "latex": safe_latex(inner_y_s)})

        # Outer integration
        outer = integrate(inner_y_s, (outer_var, req.x_min, req.x_max))
        outer_s = simplify(outer)
        steps.append({"title": f"∫ d{outer_var_str}", "content": safe_latex(outer_s), "latex": safe_latex(outer_s)})

        num_val = float(outer_s.evalf())
        steps.append({"title": "Resultado", "content": f"∭_E f dV = {num_val:.10f}", "latex": f"\\iiint_E f\\,dV = {num_val:.8f}"})

        return {"value": num_val, "symbolic": safe_latex(outer_s), "steps": steps, "error": None}

    except Exception as e:
        try:
            from scipy.integrate import tplquad
            order = req.order or "dzdydx"
            inner_var_str = order[1]
            middle_var_str = order[3]
            outer_var_str = order[5]
            
            f_num = sp.lambdify([LOCAL_VARS[outer_var_str], LOCAL_VARS[middle_var_str], LOCAL_VARS[inner_var_str]], parse(req.f), "numpy")
            
            # tplquad takes func(z, y, x), outer_x, outer_x, middle_y_lo, middle_y_hi, inner_z_lo, inner_z_hi
            val, _ = tplquad(
                lambda zv, yv, xv: float(f_num(xv, yv, zv)),
                req.x_min, req.x_max,
                lambda xv: float(sp.lambdify([LOCAL_VARS[outer_var_str]], parse(req.y_min_expr), "numpy")(xv)),
                lambda xv: float(sp.lambdify([LOCAL_VARS[outer_var_str]], parse(req.y_max_expr), "numpy")(xv)),
                lambda xv, yv: float(sp.lambdify([LOCAL_VARS[outer_var_str], LOCAL_VARS[middle_var_str]], parse(req.z_min_expr), "numpy")(xv, yv)),
                lambda xv, yv: float(sp.lambdify([LOCAL_VARS[outer_var_str], LOCAL_VARS[middle_var_str]], parse(req.z_min_expr), "numpy")(xv, yv)),
            )
            return {"value": val, "symbolic": None, "steps": [{"title": "SciPy tplquad", "content": f"≈ {val:.10f}", "latex": f"\\approx {val:.8f}"}], "error": str(e)}
        except Exception as e2:
            return {"value": None, "symbolic": None, "steps": [], "error": f"Fallo simbólico ({e}) y numérico ({e2})"}


@app.post("/derivative/partial")
def partial_derivative(req: PartialDerivativeRequest):
    try:
        f_expr = parse(req.f)
        var_sym = LOCAL_VARS.get(req.variable, x)

        deriv = diff(f_expr, var_sym)
        deriv_s = simplify(deriv)

        steps = [
            {"title": f"∂f/∂{req.variable}", "content": f"f = {safe_latex(f_expr)}", "latex": f"f = {safe_latex(f_expr)}"},
            {"title": "Derivada simbólica", "content": safe_latex(deriv_s), "latex": safe_latex(deriv_s)},
        ]

        num_val = None
        if req.point:
            subs = {LOCAL_VARS[k]: v for k, v in req.point.items() if k in LOCAL_VARS}
            num_val = float(deriv_s.subs(subs).evalf())
            steps.append({"title": f"Valor en el punto", "content": f"= {num_val:.8f}", "latex": f"= {num_val:.8f}"})

        return {
            "symbolic": safe_latex(deriv_s),
            "value": num_val,
            "steps": steps,
            "error": None,
        }
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/gradient")
def compute_gradient(req: GradientRequest):
    try:
        f_expr = parse(req.f)
        gx = simplify(diff(f_expr, x))
        gy = simplify(diff(f_expr, y))
        gz = simplify(diff(f_expr, z))

        steps = [
            {"title": "f(x,y,z)", "content": safe_latex(f_expr), "latex": safe_latex(f_expr)},
            {"title": "∂f/∂x", "content": safe_latex(gx), "latex": safe_latex(gx)},
            {"title": "∂f/∂y", "content": safe_latex(gy), "latex": safe_latex(gy)},
            {"title": "∂f/∂z", "content": safe_latex(gz), "latex": safe_latex(gz)},
            {"title": "∇f", "content": f"⟨{safe_latex(gx)}, {safe_latex(gy)}, {safe_latex(gz)}⟩", "latex": f"\\langle {safe_latex(gx)},\\, {safe_latex(gy)},\\, {safe_latex(gz)} \\rangle"},
        ]

        num_vals = None
        if req.point:
            subs = {LOCAL_VARS[k]: v for k, v in req.point.items() if k in LOCAL_VARS}
            num_vals = [float(gx.subs(subs).evalf()), float(gy.subs(subs).evalf()), float(gz.subs(subs).evalf())]
            steps.append({"title": "∇f en el punto", "content": f"≈ ⟨{num_vals[0]:.6f}, {num_vals[1]:.6f}, {num_vals[2]:.6f}⟩", "latex": f"\\approx \\langle {num_vals[0]:.4f}, {num_vals[1]:.4f}, {num_vals[2]:.4f} \\rangle"})

        return {
            "gx": safe_latex(gx), "gy": safe_latex(gy), "gz": safe_latex(gz),
            "gradient_values": num_vals,
            "steps": steps,
            "error": None,
        }
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/vector/curl")
def compute_curl(req: CurlRequest):
    try:
        P_expr = parse(req.P)
        Q_expr = parse(req.Q)
        R_expr = parse(req.R)

        curl_x = simplify(diff(R_expr, y) - diff(Q_expr, z))
        curl_y = simplify(diff(P_expr, z) - diff(R_expr, x))
        curl_z = simplify(diff(Q_expr, x) - diff(P_expr, y))

        steps = [
            {"title": "F = ⟨P, Q, R⟩", "content": f"P={safe_latex(P_expr)}, Q={safe_latex(Q_expr)}, R={safe_latex(R_expr)}", "latex": f"F = \\langle {safe_latex(P_expr)},\\, {safe_latex(Q_expr)},\\, {safe_latex(R_expr)} \\rangle"},
            {"title": "∇×F = ⟨∂R/∂y − ∂Q/∂z, ∂P/∂z − ∂R/∂x, ∂Q/∂x − ∂P/∂y⟩", "content": f"= ⟨{safe_latex(curl_x)}, {safe_latex(curl_y)}, {safe_latex(curl_z)}⟩", "latex": f"\\nabla \\times F = \\langle {safe_latex(curl_x)},\\, {safe_latex(curl_y)},\\, {safe_latex(curl_z)} \\rangle"},
        ]

        num_vals = None
        if req.point:
            subs = {LOCAL_VARS[k]: v for k, v in req.point.items() if k in LOCAL_VARS}
            num_vals = [float(curl_x.subs(subs).evalf()), float(curl_y.subs(subs).evalf()), float(curl_z.subs(subs).evalf())]

        return {
            "curl_x": safe_latex(curl_x), "curl_y": safe_latex(curl_y), "curl_z": safe_latex(curl_z),
            "curl_values": num_vals,
            "steps": steps,
            "error": None,
        }
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/vector/divergence")
def compute_divergence(req: DivergenceRequest):
    try:
        P_expr = parse(req.P)
        Q_expr = parse(req.Q)
        R_expr = parse(req.R)

        div = simplify(diff(P_expr, x) + diff(Q_expr, y) + diff(R_expr, z))

        steps = [
            {"title": "∇·F = ∂P/∂x + ∂Q/∂y + ∂R/∂z", "content": safe_latex(div), "latex": safe_latex(div)},
        ]

        num_val = None
        if req.point:
            subs = {LOCAL_VARS[k]: v for k, v in req.point.items() if k in LOCAL_VARS}
            num_val = float(div.subs(subs).evalf())
            steps.append({"title": "Valor en el punto", "content": f"= {num_val:.8f}", "latex": f"= {num_val:.6f}"})

        return {"divergence": safe_latex(div), "value": num_val, "steps": steps, "error": None}
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/critical-points")
def critical_points(req: CriticalPointsRequest):
    try:
        f_expr = parse(req.f)
        fx = diff(f_expr, x)
        fy = diff(f_expr, y)

        # Solve ∇f = 0 symbolically
        crit = solve([fx, fy], [x, y], dict=True)

        # Hessian
        H = hessian(f_expr, [x, y])
        D_sym = simplify(det(H))

        results = []
        for pt in crit[:8]:  # limit to 8 points
            xv = float(pt[x].evalf())
            yv = float(pt[y].evalf())
            if not (req.x_min <= xv <= req.x_max and req.y_min <= yv <= req.y_max):
                continue
            D_val = float(D_sym.subs(pt).evalf())
            fxx_val = float(diff(f_expr, x, 2).subs(pt).evalf())
            fval = float(f_expr.subs(pt).evalf())
            if D_val < 0:
                tipo = "Punto silla"
            elif D_val > 0 and fxx_val > 0:
                tipo = "Mínimo local"
            elif D_val > 0 and fxx_val < 0:
                tipo = "Máximo local"
            else:
                tipo = "Prueba inconclusa"
            results.append({"x": xv, "y": yv, "f": fval, "D": D_val, "fxx": fxx_val, "tipo": tipo})

        steps = [
            {"title": "∇f = 0", "content": f"∂f/∂x = {safe_latex(simplify(fx))}\n∂f/∂y = {safe_latex(simplify(fy))}", "latex": f"\\nabla f = 0"},
            {"title": "Hessiana H", "content": f"D = det(H) = {safe_latex(D_sym)}", "latex": safe_latex(D_sym)},
            {"title": f"Puntos críticos encontrados: {len(results)}", "content": "\n".join([f"({r['x']:.4f}, {r['y']:.4f}) — {r['tipo']}" for r in results]) or "Ninguno en el dominio", "latex": ""},
        ]

        return {"points": results, "steps": steps, "error": None}
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/coord/convert")
def coord_convert(req: CoordConvertRequest):
    """Show the substitution formulas and Jacobian for a coordinate system conversion."""
    JACOBIANS = {
        "polar":     {"formula": "r", "latex": "r"},
        "cilindrico": {"formula": "r", "latex": "r"},
        "esferico":  {"formula": "ρ² sin φ", "latex": "\\rho^2 \\sin\\varphi"},
        "cartesiano": {"formula": "1", "latex": "1"},
    }

    SUBS = {
        "polar":     ["x = r\\cos\\theta", "y = r\\sin\\theta"],
        "cilindrico": ["x = r\\cos\\theta", "y = r\\sin\\theta", "z = z"],
        "esferico":  ["x = \\rho\\sin\\varphi\\cos\\theta", "y = \\rho\\sin\\varphi\\sin\\theta", "z = \\rho\\cos\\varphi"],
        "cartesiano": ["x = x", "y = y", "z = z"],
    }

    jac = JACOBIANS.get(req.to_system, {"formula": "1", "latex": "1"})
    subs = SUBS.get(req.to_system, [])

    steps = [
        {"title": f"Sistema origen: {req.from_system}", "content": f"Función: {req.f}", "latex": req.f},
        {"title": f"Sustitución → {req.to_system}", "content": "\n".join(s.replace("\\", "") for s in subs), "latex": "  ".join(subs)},
        {"title": "Jacobiano", "content": f"J = {jac['formula']}", "latex": f"J = {jac['latex']}"},
        {"title": "Integral transformada", "content": f"∭ f · J dV  con J = {jac['formula']}", "latex": f"\\iiint f \\cdot {jac['latex']} \\, dV"},
    ]

    return {"steps": steps, "jacobian": jac["formula"], "jacobian_latex": jac["latex"], "subs": subs, "error": None}
