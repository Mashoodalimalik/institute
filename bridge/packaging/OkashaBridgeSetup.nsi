Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
Name "Okasha Bridge"
OutFile "${SETUP_OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Okasha Bridge"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "0.1.0.0"
VIAddVersionKey "ProductName" "Okasha Bridge"
VIAddVersionKey "FileDescription" "Okasha K40 and WhatsApp Bridge Setup"
VIAddVersionKey "FileVersion" "0.1.0"
VIAddVersionKey "LegalCopyright" "Okasha Institute"
Icon "${__FILEDIR__}\okasha.ico"
!define MUI_ICON "${__FILEDIR__}\okasha.ico"
!define MUI_UNICON "${__FILEDIR__}\okasha.ico"
!define MUI_WELCOMEPAGE_TEXT "Install the K40 and WhatsApp bridge for Okasha Institute.$\r$\n$\r$\nPython and Node are included. The app runs in the Windows notification tray.$\r$\n$\r$\nThe existing Gymatic installation is separate."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\OkashaBridge.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Okasha Bridge"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Function .onInit
  SetShellVarContext current
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "64-bit Windows is required."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "Windows 10 or later is required."
    Abort
  ${EndIf}
FunctionEnd
Section "Okasha Bridge"
  ${If} ${FileExists} "$INSTDIR\OkashaBridge.exe"
    ExecWait '"$INSTDIR\OkashaBridge.exe" --exit'
    Sleep 1500
  ${EndIf}
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\Okasha Bridge.lnk" "$INSTDIR\OkashaBridge.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OkashaBridge" "DisplayName" "Okasha Bridge"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OkashaBridge" "DisplayVersion" "0.1.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OkashaBridge" "Publisher" "Okasha Institute"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OkashaBridge" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OkashaBridge" "DisplayIcon" "$INSTDIR\OkashaBridge.exe,0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OkashaBridge" "UninstallString" '"$INSTDIR\Uninstall.exe"'
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  StrCmp $INSTDIR "$LOCALAPPDATA\Programs\Okasha Bridge" safe_path
    Abort
  safe_path:
  ExecWait '"$INSTDIR\OkashaBridge.exe" --exit'
  Sleep 1500
  Delete "$SMPROGRAMS\Okasha Bridge.lnk"
  Delete "$INSTDIR\OkashaBridge.exe"
  Delete "$INSTDIR\OkashaHardware.exe"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\THIRD-PARTY-NOTICES.txt"
  RMDir /r "$INSTDIR\runtime"
  RMDir /r "$INSTDIR\whatsapp"
  RMDir /r "$INSTDIR\local"
  RMDir /r "$INSTDIR\scripts"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OkashaBridge"
SectionEnd
