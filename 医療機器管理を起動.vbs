' Fallback launcher (ASCII only for WSH). Prefer 医療機器管理を起動.bat on desktop.
Dim fso, sh, root, bat, staffBat
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
staffBat = root & "\医療機器管理を起動.bat"

If fso.FileExists(staffBat) Then
  sh.Run Chr(34) & staffBat & Chr(34), 1, False
  WScript.Quit 0
End If

bat = Chr(34) & root & "\launch-app.bat" & Chr(34)
If Not fso.FileExists(root & "\launch-app.bat") Then
  MsgBox "launch-app.bat not found.", vbCritical, "Medical Device Manager"
  WScript.Quit 1
End If

sh.Popup "Starting..." & vbCrLf & "Close the taskbar window to exit.", 4, "Medical Device Manager", vbInformation
sh.Run "cmd /c " & bat, 7, False