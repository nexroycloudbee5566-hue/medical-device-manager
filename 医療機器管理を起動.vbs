' Legacy: use 医療機器管理を起動.bat on the desktop instead.
Dim fso, sh, root, bat
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
bat = Chr(34) & root & "\launch-app.bat" & Chr(34)

If Not fso.FileExists(root & "\launch-app.bat") Then
  MsgBox "launch-app.bat not found.", vbCritical, "Medical Device Manager"
  WScript.Quit 1
End If

sh.Popup "Starting..." & vbCrLf & "Close the taskbar window to exit.", 4, "Medical Device Manager", vbInformation
sh.Run "cmd /c " & bat, 7, False