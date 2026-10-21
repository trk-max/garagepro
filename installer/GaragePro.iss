; GaragePro — installateur Windows (Inno Setup 6).
; Ne pas compiler à la main : npm run installer (prépare les fichiers depuis git, puis appelle ISCC).
; Le paquet ne contient QUE le code suivi par git : jamais .env, node_modules, .next, sauvegardes ou données.
; Réinstaller / mettre à jour ne touche ni à .env, ni à la base PostgreSQL, ni aux sauvegardes.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #error SourceDir non défini : utilisez npm run installer
#endif
#ifndef OutputDir
  #define OutputDir "..\dist"
#endif

[Setup]
AppId={{ADFC6B52-447D-4D22-8461-3DF05CCA55AC}
AppName=GaragePro
AppVersion={#AppVersion}
AppVerName=GaragePro {#AppVersion}
AppPublisher=GaragePro
; Installation pour l'utilisateur courant (sans droits administrateur) : le dossier doit rester modifiable
; car l'application y installe ses dépendances et y prépare sa version rapide.
PrivilegesRequired=lowest
DefaultDirName={localappdata}\GaragePro
DefaultGroupName=GaragePro
AllowNoIcons=yes
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=GaragePro-Setup-{#AppVersion}
#ifdef IconFile
SetupIconFile={#IconFile}
#endif
UninstallDisplayName=GaragePro
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer les raccourcis sur le Bureau"
Name: "autostart"; Description: "Démarrer le hub GaragePro à l'ouverture de session (PC du garage)"; Flags: unchecked

[InstallDelete]
; Code de l'ancienne version (remplacé en entier, pour ne pas garder de pages supprimées).
; Jamais .env, node_modules ni les données.
Type: filesandordirs; Name: "{app}\src"
Type: filesandordirs; Name: "{app}\.next"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
#ifdef IconFile
Source: "{#IconFile}"; DestDir: "{app}"; DestName: "garagepro.ico"; Flags: ignoreversion
#endif

[Icons]
Name: "{autoprograms}\GaragePro\GaragePro - hub du garage"; Filename: "{app}\start-hub.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\garagepro.ico"; Check: HasIcon
Name: "{autoprograms}\GaragePro\GaragePro - hub du garage"; Filename: "{app}\start-hub.cmd"; WorkingDir: "{app}"; Check: not HasIcon
Name: "{autoprograms}\GaragePro\Ouvrir GaragePro (navigateur)"; Filename: "http://localhost:3000"
Name: "{autoprograms}\GaragePro\Configuration (setup)"; Filename: "{app}\setup.cmd"; WorkingDir: "{app}"
Name: "{autoprograms}\GaragePro\Dossier GaragePro"; Filename: "{app}"
Name: "{autoprograms}\GaragePro\Désinstaller GaragePro"; Filename: "{uninstallexe}"
Name: "{autodesktop}\GaragePro - hub"; Filename: "{app}\start-hub.cmd"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{autodesktop}\Ouvrir GaragePro"; Filename: "http://localhost:3000"; Tasks: desktopicon
Name: "{userstartup}\GaragePro - hub"; Filename: "{app}\start-hub.cmd"; WorkingDir: "{app}"; Tasks: autostart

[Run]
; Première installation : dépendances, fichier .env, base de données (setup.cmd n'efface aucune donnée).
Filename: "{cmd}"; Parameters: "/c ""{app}\setup.cmd"""; WorkingDir: "{app}"; Description: "Lancer la configuration maintenant (dépendances, .env, base de données)"; Flags: postinstall nowait skipifsilent; Check: not HasEnv
Filename: "{cmd}"; Parameters: "/c ""{app}\setup.cmd"""; WorkingDir: "{app}"; Description: "Mettre à jour les dépendances et la base (recommandé après une mise à jour)"; Flags: postinstall nowait skipifsilent unchecked; Check: HasEnv

[UninstallDelete]
; Fichiers générés par l'application (reconstruits automatiquement). .env, node_modules et les données
; restent : supprimez le dossier à la main si vous voulez tout enlever. La base PostgreSQL n'est jamais touchée.
Type: filesandordirs; Name: "{app}\.next"

[Code]
function HasEnv: Boolean;
begin
  Result := FileExists(ExpandConstant('{app}\.env'));
end;

function HasIcon: Boolean;
begin
  Result := FileExists(ExpandConstant('{app}\garagepro.ico'));
end;
