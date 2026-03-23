"""CRE Owner Unmasking Service.

Provides ownership chain traversal (recursive CTE), beneficial owner
reports, and community detection (Louvain) on the entity relationship graph.
"""
from __future__ import annotations

import logging
from uuid import UUID, uuid4

from app.db import get_cursor

log = logging.getLogger(__name__)

# Maximum graph traversal depth to prevent runaway recursion
_MAX_DEPTH = 5


# ─── Ownership Graph Traversal ────────────────────────────────────────────────


def get_owner_graph(
    *,
    entity_id: UUID,
    env_id: UUID,
    max_depth: int = _MAX_DEPTH,
) -> dict:
    """Walk the entity→property→co-entity graph, depth-limited and cycle-safe.

    Returns a dict with nodes (entities + properties) and edges.
    """
    max_depth = min(max_depth, _MAX_DEPTH)

    with get_cursor() as cur:
        # Recursive CTE: walk bridge_property_entity for co-ownership links
        cur.execute(
            """
            WITH RECURSIVE ownership_chain AS (
                -- Base: direct property links for the seed entity
                SELECT
                    bpe.entity_id,
                    bpe.property_id,
                    bpe.role,
                    bpe.confidence,
                    1 AS depth,
                    ARRAY[bpe.entity_id::text] AS path
                FROM bridge_property_entity bpe
                WHERE bpe.entity_id = %s
                  AND bpe.env_id = %s

                UNION ALL

                -- Recurse: co-entities on those properties
                SELECT
                    bpe2.entity_id,
                    bpe2.property_id,
                    bpe2.role,
                    bpe2.confidence,
                    oc.depth + 1,
                    oc.path || bpe2.entity_id::text
                FROM ownership_chain oc
                JOIN bridge_property_entity bpe2
                    ON bpe2.property_id = oc.property_id
                    AND bpe2.entity_id != oc.entity_id
                    AND NOT (bpe2.entity_id::text = ANY(oc.path))
                    AND bpe2.env_id = %s
                WHERE oc.depth < %s
            )
            SELECT DISTINCT ON (entity_id, property_id)
                entity_id, property_id, role, confidence, depth
            FROM ownership_chain
            ORDER BY entity_id, property_id, depth
            """,
            (str(entity_id), str(env_id), str(env_id), max_depth),
        )
        chain_rows = cur.fetchall()

        # Also fetch direct entity-to-entity relationships
        cur.execute(
            """
            WITH RECURSIVE rel_chain AS (
                SELECT entity_a_id, entity_b_id, relationship_type, confidence, weight,
                       1 AS depth, ARRAY[entity_a_id::text] AS path
                FROM cre_entity_relationship
                WHERE entity_a_id = %s AND env_id = %s

                UNION ALL

                SELECT r.entity_a_id, r.entity_b_id, r.relationship_type, r.confidence, r.weight,
                       rc.depth + 1, rc.path || r.entity_a_id::text
                FROM rel_chain rc
                JOIN cre_entity_relationship r
                    ON r.entity_a_id = rc.entity_b_id
                    AND NOT (r.entity_a_id::text = ANY(rc.path))
                    AND r.env_id = %s
                WHERE rc.depth < %s
            )
            SELECT DISTINCT entity_a_id, entity_b_id, relationship_type, confidence, weight, depth
            FROM rel_chain
            ORDER BY depth
            """,
            (str(entity_id), str(env_id), str(env_id), max_depth),
        )
        rel_rows = cur.fetchall()

        # Collect all entity IDs to fetch their details
        entity_ids = set()
        property_ids = set()
        for row in chain_rows:
            entity_ids.add(str(row["entity_id"]))
            property_ids.add(str(row["property_id"]))
        for row in rel_rows:
            entity_ids.add(str(row["entity_a_id"]))
            entity_ids.add(str(row["entity_b_id"]))
        entity_ids.add(str(entity_id))

        # Fetch entity details
        entities = {}
        if entity_ids:
            cur.execute(
                "SELECT entity_id, name, entity_type, cluster_id FROM dim_entity WHERE entity_id = ANY(%s::uuid[])",
                (list(entity_ids),),
            )
            for e in cur.fetchall():
                entities[str(e["entity_id"])] = {
                    "entity_id": str(e["entity_id"]),
                    "name": e["name"],
                    "entity_type": e["entity_type"],
                    "cluster_id": str(e["cluster_id"]) if e["cluster_id"] else None,
                }

        # Fetch property summaries
        properties = {}
        if property_ids:
            cur.execute(
                "SELECT property_id, name, address, property_type FROM dim_property WHERE property_id = ANY(%s::uuid[])",
                (list(property_ids),),
            )
            for p in cur.fetchall():
                properties[str(p["property_id"])] = {
                    "property_id": str(p["property_id"]),
                    "name": p["name"],
                    "address": p.get("address"),
                    "property_type": p.get("property_type"),
                }

    # Build node and edge lists
    nodes = []
    seen_nodes = set()

    for eid, detail in entities.items():
        nodes.append({**detail, "node_type": "entity"})
        seen_nodes.add(eid)

    for pid, detail in properties.items():
        nodes.append({**detail, "node_type": "property"})
        seen_nodes.add(pid)

    edges = []

    # Property-entity edges from chain
    for row in chain_rows:
        edges.append({
            "source": str(row["entity_id"]),
            "target": str(row["property_id"]),
            "edge_type": "owns",
            "role": row["role"],
            "confidence": float(row["confidence"]) if row["confidence"] else 0,
            "depth": row["depth"],
        })

    # Entity-entity edges from relationships
    for row in rel_rows:
        edges.append({
            "source": str(row["entity_a_id"]),
            "target": str(row["entity_b_id"]),
            "edge_type": row["relationship_type"],
            "confidence": float(row["confidence"]) if row["confidence"] else 0,
            "weight": row["weight"],
            "depth": row["depth"],
        })

    max_depth_reached = max((r["depth"] for r in chain_rows), default=0)
    rel_max = max((r["depth"] for r in rel_rows), default=0)
    max_depth_reached = max(max_depth_reached, rel_max)

    log.info(
        "Owner graph for entity %s: %d nodes, %d edges, max depth %d",
        entity_id, len(nodes), len(edges), max_depth_reached,
    )

    return {
        "seed_entity_id": str(entity_id),
        "nodes": nodes,
        "edges": edges,
        "max_depth_reached": max_depth_reached,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }


# ─── Owner Unmasking Report ───────────────────────────────────────────────────


def get_unmasking_report(
    *,
    property_id: UUID,
    env_id: UUID,
    max_depth: int = _MAX_DEPTH,
) -> dict:
    """Trace the beneficial owner chain for a property.

    Returns: direct owners, corporate chain, and confidence summary.
    """
    with get_cursor() as cur:
        # Get direct entities linked to this property
        cur.execute(
            """
            SELECT bpe.entity_id, bpe.role, bpe.confidence,
                   de.name, de.entity_type, de.cluster_id
            FROM bridge_property_entity bpe
            JOIN dim_entity de ON de.entity_id = bpe.entity_id
            WHERE bpe.property_id = %s AND bpe.env_id = %s
            ORDER BY bpe.confidence DESC
            """,
            (str(property_id), str(env_id)),
        )
        direct_entities = cur.fetchall()

        # Get property name
        cur.execute(
            "SELECT name, address FROM dim_property WHERE property_id = %s",
            (str(property_id),),
        )
        prop = cur.fetchone()

    if not direct_entities:
        return {
            "property_id": str(property_id),
            "property_name": prop["name"] if prop else None,
            "beneficial_owners": [],
            "corporate_chain": [],
            "confidence_summary": {"avg_confidence": 0, "min_confidence": 0, "max_confidence": 0},
        }

    # For each owner entity, walk upward through corporate relationships
    beneficial_owners = []
    corporate_chain = []

    for entity in direct_entities:
        eid = entity["entity_id"]
        owner_entry = {
            "entity_id": str(eid),
            "name": entity["name"],
            "entity_type": entity["entity_type"],
            "role": entity["role"],
            "confidence": float(entity["confidence"]) if entity["confidence"] else 0,
            "cluster_id": str(entity["cluster_id"]) if entity["cluster_id"] else None,
        }
        beneficial_owners.append(owner_entry)

        # Walk the owner graph to find corporate parents
        graph = get_owner_graph(entity_id=eid, env_id=env_id, max_depth=max_depth)
        for edge in graph["edges"]:
            if edge["edge_type"] in ("controls", "subsidiary_of", "managed_by"):
                corporate_chain.append({
                    "child_entity_id": edge["source"],
                    "parent_entity_id": edge["target"],
                    "relationship": edge["edge_type"],
                    "confidence": edge["confidence"],
                    "depth": edge["depth"],
                })

    confidences = [o["confidence"] for o in beneficial_owners if o["confidence"] > 0]
    confidence_summary = {
        "avg_confidence": round(sum(confidences) / len(confidences), 4) if confidences else 0,
        "min_confidence": min(confidences) if confidences else 0,
        "max_confidence": max(confidences) if confidences else 0,
    }

    return {
        "property_id": str(property_id),
        "property_name": prop["name"] if prop else None,
        "beneficial_owners": beneficial_owners,
        "corporate_chain": corporate_chain,
        "confidence_summary": confidence_summary,
    }


# ─── Community Detection ──────────────────────────────────────────────────────


def detect_communities(
    *,
    env_id: UUID,
    business_id: UUID,
    resolution: float = 1.0,
) -> dict:
    """Run Louvain community detection on the entity relationship graph.

    Writes cluster_id back to dim_entity. Returns community summary.
    """
    try:
        import networkx as nx
    except ImportError:
        raise RuntimeError("networkx is required for community detection. Install with: pip install networkx>=3.0")

    with get_cursor() as cur:
        # Load all relationships as edges
        cur.execute(
            """
            SELECT entity_a_id, entity_b_id, weight
            FROM cre_entity_relationship
            WHERE env_id = %s AND business_id = %s
            """,
            (str(env_id), str(business_id)),
        )
        edges = cur.fetchall()

    if not edges:
        log.info("No entity relationships found for env %s — skipping community detection", env_id)
        return {"communities": 0, "total_entities": 0, "clusters": []}

    # Build graph
    G = nx.Graph()
    for edge in edges:
        a = str(edge["entity_a_id"])
        b = str(edge["entity_b_id"])
        if G.has_edge(a, b):
            G[a][b]["weight"] += edge["weight"]
        else:
            G.add_edge(a, b, weight=edge["weight"])

    log.info("Entity graph: %d nodes, %d edges", G.number_of_nodes(), G.number_of_edges())

    # Run Louvain community detection
    communities = nx.community.louvain_communities(G, weight="weight", resolution=resolution)

    # Assign cluster IDs
    cluster_assignments: dict[str, str] = {}
    cluster_summaries = []

    for community_set in communities:
        cluster_id = str(uuid4())
        for entity_id in community_set:
            cluster_assignments[entity_id] = cluster_id
        cluster_summaries.append({
            "cluster_id": cluster_id,
            "size": len(community_set),
            "entity_ids": list(community_set)[:10],  # cap for response size
        })

    # Write cluster_id back to dim_entity
    with get_cursor() as cur:
        # Clear existing clusters for this env
        cur.execute(
            "UPDATE dim_entity SET cluster_id = NULL WHERE env_id = %s AND business_id = %s",
            (str(env_id), str(business_id)),
        )

        for entity_id, cluster_id in cluster_assignments.items():
            cur.execute(
                "UPDATE dim_entity SET cluster_id = %s WHERE entity_id = %s",
                (cluster_id, entity_id),
            )

    log.info(
        "Community detection complete: %d communities, %d entities assigned",
        len(communities), len(cluster_assignments),
    )

    return {
        "communities": len(communities),
        "total_entities": len(cluster_assignments),
        "clusters": sorted(cluster_summaries, key=lambda c: c["size"], reverse=True),
    }
