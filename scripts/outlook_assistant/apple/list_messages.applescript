property fieldSep : ASCII character 31
property rowSep : ASCII character 30
property listSep : ASCII character 29

on split_text(theText, delimiter)
	set oldDelimiters to AppleScript's text item delimiters
	set AppleScript's text item delimiters to delimiter
	set parts to text items of theText
	set AppleScript's text item delimiters to oldDelimiters
	return parts
end split_text

on sanitize_text(valueText)
	set tmp to valueText as string
	set tmp to my replace_text(tmp, fieldSep, " ")
	set tmp to my replace_text(tmp, rowSep, " ")
	set tmp to my replace_text(tmp, listSep, ", ")
	set tmp to my replace_text(tmp, return, " ")
	set tmp to my replace_text(tmp, linefeed, " ")
	return tmp
end sanitize_text

on replace_text(theText, findText, replaceText)
	set oldDelimiters to AppleScript's text item delimiters
	set AppleScript's text item delimiters to findText
	set parts to text items of theText
	set AppleScript's text item delimiters to replaceText
	set newText to parts as string
	set AppleScript's text item delimiters to oldDelimiters
	return newText
end replace_text

on resolve_account(accountName)
	tell application "Microsoft Outlook"
		repeat with a in every account
			try
				if name of a as string is accountName then
					return a
				end if
			end try
		end repeat
	end tell
	error "Account not found: " & accountName
end resolve_account

on resolve_folder(accountRef, folderPath)
	tell application "Microsoft Outlook"
		if folderPath is "Inbox" then return inbox folder of accountRef
		if folderPath is "Sent" then return sent mail folder of accountRef
		if folderPath is "Drafts" then return drafts folder of accountRef
		set parts to my split_text(folderPath, "/")
		if (count of parts) is 0 then error "Folder path is empty"
		set currentFolder to missing value
		repeat with folderRef in (mail folders of accountRef)
			try
				if name of folderRef as string is item 1 of parts then
					set currentFolder to folderRef
					exit repeat
				end if
			end try
		end repeat
		if currentFolder is missing value then error "Folder not found: " & folderPath
		if (count of parts) is 1 then return currentFolder
		repeat with idx from 2 to count of parts
			set segmentName to item idx of parts
			set nextFolder to missing value
			repeat with childFolder in (mail folders of currentFolder)
				try
					if name of childFolder as string is segmentName then
						set nextFolder to childFolder
						exit repeat
					end if
				end try
			end repeat
			if nextFolder is missing value then error "Folder path not found: " & folderPath
			set currentFolder to nextFolder
		end repeat
		return currentFolder
	end tell
end resolve_folder

on join_addresses(recipientList)
	set itemsOut to {}
	repeat with recipientRef in recipientList
		try
			set end of itemsOut to my sanitize_text(address of email address of recipientRef)
		on error
			try
				set end of itemsOut to my sanitize_text(name of recipientRef)
			end try
		end try
	end repeat
	set oldDelimiters to AppleScript's text item delimiters
	set AppleScript's text item delimiters to listSep
	set resultText to itemsOut as string
	set AppleScript's text item delimiters to oldDelimiters
	return resultText
end join_addresses

on join_names(nameList)
	set oldDelimiters to AppleScript's text item delimiters
	set AppleScript's text item delimiters to listSep
	set resultText to nameList as string
	set AppleScript's text item delimiters to oldDelimiters
	return resultText
end join_names

on run argv
	set accountName to item 1 of argv
	set folderPath to item 2 of argv
	set includeBody to item 3 of argv
	set maxCount to item 4 of argv as integer
	set rows to {}
	set accountRef to my resolve_account(accountName)
	set targetFolder to my resolve_folder(accountRef, folderPath)
	tell application "Microsoft Outlook"
		set msgList to messages of targetFolder
		set totalCount to count of msgList
		set finalCount to totalCount
		if maxCount > 0 and maxCount < totalCount then set finalCount to maxCount
		repeat with idx from 1 to finalCount
			set m to item idx of msgList
			set messageId to ""
			set accName to ""
			set senderText to ""
			set toList to ""
			set ccList to ""
			set subjectText to ""
			set receivedText to ""
			set previewText to ""
			set bodyText to ""
			set categoryText to ""
			set attachmentNameText to ""
			set unreadText to "false"
			set flaggedText to "false"
			set hasAttachmentsText to "false"
			try
				set messageId to my sanitize_text(id of m as string)
			end try
			try
				set accName to my sanitize_text(name of account of m)
			end try
			try
				set senderText to my sanitize_text(sender of m as string)
			end try
			try
				set toList to my join_addresses(recipients of m)
			end try
			try
				set ccList to my join_addresses(cc recipients of m)
			end try
			try
				set subjectText to my sanitize_text(subject of m)
			end try
			try
				set receivedText to my sanitize_text(time received of m as string)
			end try
			try
				set previewText to my sanitize_text(content of m)
			end try
			if includeBody is "1" then
				try
					set bodyText to my sanitize_text(content of m)
				end try
			end if
			try
				set categoryText to my sanitize_text(category of m)
			end try
			try
				set unreadText to ((read status of m) is false) as string
			end try
			try
				set flaggedText to (flagged status of m) as string
			on error
				try
					set flaggedText to (flag status of m) as string
				end try
			end try
			try
				if (count of attachments of m) > 0 then
					set hasAttachmentsText to "true"
					set attachmentNames to {}
					repeat with a in attachments of m
						try
							set end of attachmentNames to my sanitize_text(name of a)
						end try
					end repeat
					set attachmentNameText to my join_names(attachmentNames)
				end if
			end try
			set rowText to messageId & fieldSep & accName & fieldSep & senderText & fieldSep & toList & fieldSep & ccList & fieldSep & subjectText & fieldSep & receivedText & fieldSep & previewText & fieldSep & categoryText & fieldSep & bodyText & fieldSep & attachmentNameText & fieldSep & folderPath & fieldSep & unreadText & fieldSep & flaggedText & fieldSep & hasAttachmentsText
			set end of rows to rowText
		end repeat
	end tell
	set oldDelimiters to AppleScript's text item delimiters
	set AppleScript's text item delimiters to rowSep
	set outputText to rows as string
	set AppleScript's text item delimiters to oldDelimiters
	return outputText
end run
