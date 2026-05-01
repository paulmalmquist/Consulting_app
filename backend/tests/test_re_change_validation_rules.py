from app.services.repe_change_validators import infer_rule_key, validate_value


def test_occupancy_validator_blocks_values_above_one():
    status, details = validate_value("occupancy_between_0_and_1", "1.80")

    assert status == "fail"
    assert details["value"] == "1.80"


def test_occupancy_validator_accepts_fractional_percentage():
    status, _ = validate_value("occupancy_between_0_and_1", "0.91")

    assert status == "pass"


def test_rule_inference_for_occupancy_column():
    assert infer_rule_key("q2_occupancy") == "occupancy_between_0_and_1"
