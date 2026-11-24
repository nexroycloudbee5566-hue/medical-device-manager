' 職員向け: ダブルクリックで起動（コンソールは最小化）
Dim fso, sh, root, bat
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
bat = Chr(34) & root & "\launch-app.bat" & Chr(34)

If Not fso.FileExists(root & "\launch-app.bat") Then
  MsgBox "起動ファイルが見つかりません。" & vbCrLf & "担当者に連絡してください。", vbCritical, "医療機器管理"
  WScript.Quit 1
End If

sh.Popup "医療機器管理を起動しています。" & vbCrLf & vbCrLf & _
  "しばらくするとブラウザが開きます。" & vbCrLf & _
  "終了するときは、タスクバーの「医療機器管理」画面を閉じてください。", _
  5, "医療機器管理", vbInformation

' 7 = 最小化・非アクティブ
sh.Run "cmd /c " & bat, 7, False