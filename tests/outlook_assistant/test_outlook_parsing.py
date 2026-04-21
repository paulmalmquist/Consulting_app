from scripts.outlook_assistant.outlook_client import FIELD_SEP, LIST_SEP, ROW_SEP, OutlookClient


def test_parse_messages_handles_lists_and_bools():
    client = object.__new__(OutlookClient)
    raw = ROW_SEP.join(
        [
            FIELD_SEP.join(
                [
                    "id-1",
                    "Work",
                    "Jane Example <jane@example.com>",
                    f"paul@example.com{LIST_SEP}team@example.com",
                    "ops@example.com",
                    "Quarterly update",
                    "2026-04-21T09:00:00",
                    "Please review?",
                    "Blue",
                    "Longer body",
                    f"file1.pdf{LIST_SEP}file2.csv",
                    "Inbox",
                    "true",
                    "false",
                    "true",
                ]
            )
        ]
    )
    records = client._parse_messages(raw)
    assert len(records) == 1
    assert records[0].recipients == ["paul@example.com", "team@example.com"]
    assert records[0].unread is True
    assert records[0].has_attachments is True
