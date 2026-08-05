# Supprime la tâche planifiée « SuiviElec » (arrête le démarrage automatique).
$ErrorActionPreference = 'Stop'
Stop-ScheduledTask -TaskName 'SuiviElec' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'SuiviElec' -Confirm:$false
Write-Host 'Tâche planifiée « SuiviElec » supprimée.'
