"""Eval tests for the competence-envelope primitives — numpy only, no Databricks.

Run: python -m pytest telemetry-platform/test_envelope_core.py -q
"""

import numpy as np

from envelope_core import ACTION, IN, NEAR, OUT, band, band_rates, fit_envelope, mahalanobis_sq


def test_mahalanobis_reduces_to_squared_euclidean_under_identity():
    X = np.array([[0.0, 0.0], [3.0, 4.0]])
    d2 = mahalanobis_sq(X, np.zeros(2), np.eye(2))
    assert np.isclose(d2[0], 0.0)
    assert np.isclose(d2[1], 25.0)  # 3^2 + 4^2


def test_band_thresholds_and_actions():
    assert band(0.5, tau=1.0, k_out=3.0) == IN
    assert band(2.0, tau=1.0, k_out=3.0) == NEAR
    assert band(5.0, tau=1.0, k_out=3.0) == OUT
    assert ACTION[IN] == "score" and ACTION[NEAR] == "review" and ACTION[OUT] == "abstain"


def test_training_distribution_is_mostly_in_envelope_shift_is_out():
    # Fit the envelope on a training cluster; a far-shifted cluster (a regime the model never
    # saw) must land out-of-envelope, while held-out training-like points stay in-envelope.
    rng = np.random.default_rng(0)
    train = rng.normal(size=(2000, 5))
    mean, cov_inv = fit_envelope(train)
    d2_train = mahalanobis_sq(train, mean, cov_inv)
    tau = float(np.quantile(d2_train, 0.99))

    in_like = rng.normal(size=(1000, 5))            # same distribution
    shifted = rng.normal(size=(1000, 5)) + 8.0       # a far operating regime

    rates_in = band_rates(mahalanobis_sq(in_like, mean, cov_inv), tau, k_out=3.0)
    rates_shift = band_rates(mahalanobis_sq(shifted, mean, cov_inv), tau, k_out=3.0)

    assert rates_in[IN] > 0.9          # training-like stays in-envelope
    assert rates_shift[OUT] > 0.9      # the shifted regime is flagged out-of-envelope
    assert rates_shift[IN] < 0.05      # ...and almost none of it looks in-envelope
