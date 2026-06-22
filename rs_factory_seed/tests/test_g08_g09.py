from rs_factory_seed.cli import build_dataset


def test_jira_and_document_volumes_and_references():
    ctx, ds = build_dataset("small")
    expected = {
        "raw_jira_issues": "jira_issues",
        "raw_jira_status_history": "jira_status_history",
        "raw_jira_links": "jira_links",
        "fact_blocker": "blockers",
        "raw_docs_documents": "docs_documents",
        "raw_docs_chunks": "docs_chunks",
        "raw_docs_entity_links": "docs_entity_links",
        "raw_docs_revision_history": "docs_revision_history",
    }
    for table, volume in expected.items():
        assert len(ds.get(table).rows) == ctx.n(volume)

    issues = {r["issue_key"] for r in ds.get("raw_jira_issues").rows}
    documents = {r["document_id"] for r in ds.get("raw_docs_documents").rows}
    assert {r["issue_key"] for r in ds.get("raw_jira_status_history").rows} <= issues
    assert {r["issue_key"] for r in ds.get("raw_jira_links").rows} <= issues
    assert {r["issue_key"] for r in ds.get("fact_blocker").rows} <= issues
    assert {r["document_id"] for r in ds.get("raw_docs_chunks").rows} <= documents
    assert {r["document_id"] for r in ds.get("raw_docs_entity_links").rows} <= documents
    assert {r["document_id"] for r in ds.get("raw_docs_revision_history").rows} <= documents


def test_tr003_jira_and_rag_anchor():
    ctx, ds = build_dataset("small")
    anchor = ctx.scenario["anchors"]["anchor_jira"]
    issue = next(r for r in ds.get("raw_jira_issues").rows if r["issue_key"] == anchor)
    assert issue["vehicle_id"] == "VEH-TR-003"
    assert issue["status"] == "blocked"
    assert any(
        r["issue_key"] == anchor and r["vehicle_id"] == "VEH-TR-003"
        for r in ds.get("fact_blocker").rows
    )
    chunk = next(r for r in ds.get("raw_docs_chunks").rows if r["chunk_id"] == "CHUNK-000001")
    assert chunk["approved_for_rag"] is True
    assert "four open NCR" in chunk["text"]
    assert chunk["citation_uri"].startswith("docs://")
