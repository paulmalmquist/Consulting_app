from app.services.repe_change_impact import _num


def test_change_impact_numeric_delta_inputs_are_decimal_safe():
    assert _num({"value": "0.91"}) - _num({"value": "0.88"}) == _num("0.03")
