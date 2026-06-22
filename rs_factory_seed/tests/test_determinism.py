from rs_factory_seed import cli


def test_build_is_byte_identical_across_runs():
    # `verify` builds twice into temp dirs and compares sha256 of every CSV + the
    # sqlite iterdump. Exit 0 means byte-identical.
    assert cli.main(["verify", "--profile", "small"]) == 0
