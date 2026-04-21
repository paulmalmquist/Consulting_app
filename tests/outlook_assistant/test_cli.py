from scripts.outlook_assistant.cli import build_parser


def test_parser_accepts_search_mail_flags():
    parser = build_parser()
    args = parser.parse_args(
        ["search-mail", "--folder", "Inbox", "--sender", "jane@", "--limit", "10", "--dry-run"]
    )
    assert args.command == "search-mail"
    assert args.dry_run is True
    assert args.folder == ["Inbox"]
    assert args.sender == "jane@"
    assert args.limit == 10
