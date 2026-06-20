"""Protobuf + Schema Registry codec for the Stargate streaming lane.

Sits beside the JSON envelope transport (transport.py) without touching it: the
existing ``Transport.send(topic, key, bytes)`` contract is unchanged — this
module only builds the bytes (and the consumer-side decode) through Confluent
Schema Registry, so the topic carries a governed, evolvable contract instead of
free-form JSON.

Everything vendor-specific is lazy-imported. The backend image does not ship
confluent-kafka; the Stargate tooling venv (scripts/streaming/stargate) does.
Importing this module is always safe — building a codec without the client
installed raises a clear error instead of an ImportError at module load.

Env contract (documented in docs/reference/ENV_KEYS.md):
  CONFLUENT_BOOTSTRAP_SERVERS   broker list; localhost:9092 for local Redpanda
  CONFLUENT_API_KEY/SECRET      cluster credentials (cloud mode only)
  CONFLUENT_SR_URL              Schema Registry URL; http://localhost:8081 local
  CONFLUENT_SR_API_KEY/SECRET   SR credentials (cloud mode only)
"""

from __future__ import annotations

import os


def _env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    if value:
        return value.strip()

    file_path = os.getenv(f"{name}_FILE")
    if file_path:
        return _read_secret_file(file_path, default)

    return default


def _read_secret_file(file_path: str, default: str = "") -> str:
    try:
        return open(file_path, encoding="utf-8").read().strip()
    except OSError:
        return default


def build_confluent_conf(*, group_id: str | None = None) -> dict:
    """librdkafka conf from CONFLUENT_* env. Plaintext when no API key is set
    (local Redpanda); SASL_SSL when one is (Confluent Cloud)."""
    conf: dict = {"bootstrap.servers": _env("CONFLUENT_BOOTSTRAP_SERVERS", "localhost:9092")}
    api_key = _env("CONFLUENT_API_KEY")
    if api_key:
        conf.update({
            "security.protocol": "SASL_SSL",
            "sasl.mechanisms": "PLAIN",
            "sasl.username": api_key,
            "sasl.password": _env("CONFLUENT_API_SECRET"),
        })
    if group_id:
        conf.update({
            "group.id": group_id,
            "auto.offset.reset": "latest",
            "enable.auto.commit": True,
        })
    return conf


def build_schema_registry_client():
    """SchemaRegistryClient from CONFLUENT_SR_* env (lazy import)."""
    from confluent_kafka.schema_registry import SchemaRegistryClient

    conf: dict = {"url": _env("CONFLUENT_SR_URL", "http://localhost:8081")}
    sr_key = _env("CONFLUENT_SR_API_KEY")
    if sr_key:
        conf["basic.auth.user.info"] = f"{sr_key}:{_env('CONFLUENT_SR_API_SECRET')}"
    return SchemaRegistryClient(conf)


def build_protobuf_serializer(message_type, schema_registry_client=None):
    """ProtobufSerializer for a generated message class.

    ``CONFLUENT_SR_AUTO_REGISTER`` (default true) controls schema
    registration: true suits local Redpanda where the producer may register on
    first use; the cloud lane sets it false so producers only LOOK UP the
    governed subject (DeveloperRead) — registration stays a provisioning act,
    not a data-plane side effect. ``use.deprecated.format=False`` is the
    current wire format on both Redpanda SR and Confluent Cloud."""
    from confluent_kafka.schema_registry.protobuf import ProtobufSerializer

    auto_register = _env("CONFLUENT_SR_AUTO_REGISTER", "true").lower() != "false"
    conf = {"use.deprecated.format": False, "auto.register.schemas": auto_register}
    if not auto_register:
        conf["use.latest.version"] = True
    client = schema_registry_client or build_schema_registry_client()
    return ProtobufSerializer(message_type, client, conf)


def build_protobuf_deserializer(message_type):
    from confluent_kafka.schema_registry.protobuf import ProtobufDeserializer

    return ProtobufDeserializer(message_type, {"use.deprecated.format": False})
