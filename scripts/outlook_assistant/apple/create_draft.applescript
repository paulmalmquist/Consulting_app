on split_text(theText, delimiter)
	if theText is "" then return {}
	set oldDelimiters to AppleScript's text item delimiters
	set AppleScript's text item delimiters to delimiter
	set parts to text items of theText
	set AppleScript's text item delimiters to oldDelimiters
	return parts
end split_text

on resolve_account(accountName)
	tell application "Microsoft Outlook"
		repeat with a in every account
			try
				if name of a as string is accountName then return a
			end try
		end repeat
	end tell
	error "Account not found: " & accountName
end resolve_account

on run argv
	set accountName to item 1 of argv
	set subjectText to item 2 of argv
	set toCsv to item 3 of argv
	set ccCsv to item 4 of argv
	set bodyPath to item 5 of argv
	set accountRef to my resolve_account(accountName)
	set toList to my split_text(toCsv, ",")
	set ccList to my split_text(ccCsv, ",")
	tell application "Microsoft Outlook"
		set bodyText to (read POSIX file bodyPath as «class utf8»)
		set newMessage to make new outgoing message with properties {subject:subjectText, content:bodyText}
		set account of newMessage to accountRef
		repeat with recipientAddress in toList
			if recipientAddress is not "" then
				make new recipient at newMessage with properties {email address:{address:(recipientAddress as string)}}
			end if
		end repeat
		repeat with recipientAddress in ccList
			if recipientAddress is not "" then
				make new cc recipient at newMessage with properties {email address:{address:(recipientAddress as string)}}
			end if
		end repeat
		open newMessage
		close newMessage saving yes
		return id of newMessage as string
	end tell
end run
