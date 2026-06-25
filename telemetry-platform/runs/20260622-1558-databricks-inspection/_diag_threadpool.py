# Databricks notebook source
# threadpoolctl diagnostic — captures runtime versions, BLAS/threadpool layers, and whether the
# "Exception ignored on calling ctypes callback ... AttributeError: 'NoneType' object has no attribute
# 'split'" actually fires during real sklearn fit/predict, and whether results stay finite/plausible.
# Read-only: trains throwaway models on random data, writes nothing to tables or the registry.
import sys, gc, json, io, contextlib, traceback
import numpy as np

info = {"python": sys.version.split()[0]}
for mod in ["sklearn", "threadpoolctl", "numpy", "scipy"]:
    try:
        m = __import__(mod)
        info[mod] = getattr(m, "__version__", "?")
    except Exception as e:  # noqa: BLE001
        info[mod] = f"ERR:{e}"

import threadpoolctl
try:
    info["threadpool_info"] = threadpoolctl.threadpool_info()
except Exception as e:  # noqa: BLE001
    info["threadpool_info"] = f"ERR:{e}"

# Record any "unraisable" exceptions (that's how 'Exception ignored on calling ctypes callback' surfaces).
unraisable = []
_orig_hook = sys.unraisablehook
def _hook(arg):
    unraisable.append({
        "exc_type": getattr(arg.exc_type, "__name__", str(arg.exc_type)),
        "exc_value": str(arg.exc_value),
        "where": str(getattr(arg, "object", ""))[:200],
    })
sys.unraisablehook = _hook

# Also capture stderr text during the fit/predict + gc window.
stderr_buf = io.StringIO()
results = {}
with contextlib.redirect_stderr(stderr_buf):
    try:
        from sklearn.decomposition import PCA
        from sklearn.ensemble import IsolationForest
        rng = np.random.RandomState(0)
        X = rng.randn(4000, 12)
        pca = PCA(n_components=3, random_state=0).fit(X)
        Xr = pca.inverse_transform(pca.transform(X))
        recon = np.mean((X - Xr) ** 2, axis=1)
        iso = IsolationForest(n_estimators=100, random_state=0).fit(X)
        pred = iso.predict(X)
        results = {
            "pca_recon_finite": bool(np.isfinite(recon).all()),
            "pca_recon_mean": float(recon.mean()),
            "iso_pred_unique": sorted(set(int(v) for v in np.unique(pred))),
            "iso_flagged_frac": float((pred == -1).mean()),
        }
        # Force teardown of any threadpool controllers / ctypes callbacks.
        del pca, iso
        for _ in range(3):
            gc.collect()
    except Exception:  # noqa: BLE001
        results["fit_error"] = traceback.format_exc()[-1500:]

sys.unraisablehook = _orig_hook
stderr_text = stderr_buf.getvalue()
marker = "object has no attribute 'split'"
out = {
    "versions": info,
    "fit_predict_results": results,
    "unraisable_events": unraisable,
    "threadpoolctl_warning_in_stderr": (marker in stderr_text) or ("threadpoolctl" in stderr_text and "Exception ignored" in stderr_text),
    "stderr_tail": stderr_text[-1500:],
}
print(json.dumps(out, indent=2))
dbutils.notebook.exit(json.dumps(out))
