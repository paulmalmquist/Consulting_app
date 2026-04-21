on split_text(theText, delimiter)
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

on resolve_folder(accountRef, folderPath)
	tell application "Microsoft Outlook"
		if folderPath is "Inbox" then return inbox folder of accountRef
		if folderPath is "Sent" then return sent mail folder of accountRef
		if folderPath is "Drafts" then return drafts folder of accountRef
		set parts to my split_text(folderPath, "/")
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
		repeat with idx from 2 to count of parts
			set nextFolder to missing value
			repeat with childFolder in (mail folders of currentFolder)
				try
					if name of childFolder as string is item idx of parts then
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

on run argv
	set accountName to item 1 of argv
	set sourceFolderPath to item 2 of argv
	set messageId to item 3 of argv
	set destinationFolderPath to item 4 of argv
	set accountRef to my resolve_account(accountName)
	set sourceFolder to my resolve_folder(accountRef, sourceFolderPath)
	set destinationFolder to my resolve_folder(accountRef, destinationFolderPath)
	tell application "Microsoft Outlook"
		set targetMessage to first message of sourceFolder whose id is messageId
		move targetMessage to destinationFolder
		return "ok"
	end tell
end run
