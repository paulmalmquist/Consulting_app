"""Environment bootstrap service.

Handles the full provisioning of a new environment:
1. Create the business entity
2. Apply the enterprise template (all departments and capabilities)
3. Return the business_id for the frontend to store
"""

import re

from app.services.business import create_business, apply_template


def _slugify(name: str) -> str:
    """Convert a client name to a URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    slug = slug.strip("_")
    return slug or "env"


def bootstrap_environment(
    client_name: str,
    industry: str,
    template_key: str = "enterprise",
) -> dict:
    """Create a fully provisioned environment with all departments and capabilities.

    Args:
        client_name: Display name for the client/business.
        industry: Industry vertical (healthcare, legal, construction, website, etc.).
        template_key: Which template to apply. Defaults to 'enterprise' (all departments).

    Returns:
        dict with business_id and slug.
    """
    slug = _slugify(client_name)
    biz = create_business(client_name, slug, "us")
    apply_template(biz["business_id"], template_key)
    return biz
