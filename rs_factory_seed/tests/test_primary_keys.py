from rs_factory_seed.cli import build_dataset


def test_all_declared_natural_keys_are_unique():
    _ctx, ds = build_dataset("small")
    for table in ds.ordered():
        keys = [tuple(row.get(column) for column in table.key) for row in table.rows]
        assert len(keys) == len(set(keys)), (
            f"{table.name} has duplicate natural keys for {table.key}"
        )
