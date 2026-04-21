on split_text(theText, delimiter)
	set oldDelimiters to AppleScript's text item delimiters
	set AppleScript's text item delimiters to delimiter
	set parts to text items of theText
	set AppleScript's text item delimiters to oldDelimiters
	return parts
end split_text

on walk_folder(folderRef, prefixPath, accName)
	set rows to {}
	try
		set folderName to name of folderRef as string
	on error
		set folderName to prefixPath
	end try
	if prefixPath is "" then
		set currentPath to folderName
	else
		set currentPath to prefixPath & "/" & folderName
	end if
	set end of rows to accName & tab & currentPath
	try
		repeat with childFolder in (mail folders of folderRef)
			set rows to rows & my walk_folder(childFolder, currentPath, accName)
		end repeat
	end try
	return rows
end walk_folder

on run argv
	set accountName to item 1 of argv
	set outLines to {}
	tell application "Microsoft Outlook"
		repeat with a in every account
			try
				set accName to name of a as string
				if accountName is "" or accName is accountName then
					set end of outLines to accName & tab & "Inbox"
					set end of outLines to accName & tab & "Sent"
					set end of outLines to accName & tab & "Drafts"
					try
						repeat with folderRef in (mail folders of a)
							set outLines to outLines & my walk_folder(folderRef, "", accName)
						end repeat
					end try
				end if
			end try
		end repeat
	end tell
	return outLines as string
end run
