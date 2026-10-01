; Remove an old branded shortcut only when it launches this installation.
!macro REMOVE_LEGACY_SHORTCUT SHORTCUT
  !insertmacro IsShortcutTarget "${SHORTCUT}" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro UnpinShortcut "${SHORTCUT}"
    Delete "${SHORTCUT}"
  ${Else}
    !insertmacro IsShortcutTarget "${SHORTCUT}" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "${SHORTCUT}"
      Delete "${SHORTCUT}"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; The old executable name also needs to be closed during the first branded upgrade.
  ${If} ${FileExists} "$INSTDIR\oraedameun.exe"
    !insertmacro CheckIfAppIsRunning "oraedameun.exe" "${PRODUCTNAME}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro REMOVE_LEGACY_SHORTCUT "$SMPROGRAMS\그루터기.lnk"
  !insertmacro REMOVE_LEGACY_SHORTCUT "$SMPROGRAMS\$AppStartMenuFolder\그루터기.lnk"
  ; Preserve an existing desktop shortcut when upgrading interactively, too.
  !insertmacro IsShortcutTarget "$DESKTOP\그루터기.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}
  !insertmacro REMOVE_LEGACY_SHORTCUT "$DESKTOP\그루터기.lnk"
!macroend
