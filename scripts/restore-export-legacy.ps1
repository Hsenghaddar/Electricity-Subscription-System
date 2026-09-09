param(
  [Parameter(Mandatory = $true)][string]$Backup,
  [string]$Server = '(localdb)\MSSQLLocalDB',
  [string]$Database = 'CodexIshtirakSeedImport',
  [string]$Output = '.migration-new'
)

$ErrorActionPreference = 'Stop'
$backupPath = (Resolve-Path -LiteralPath $Backup).Path
$work = Join-Path (Resolve-Path '.').Path '.migration-sql'
New-Item -ItemType Directory -Force -Path $work | Out-Null
$mdf = Join-Path $work "$Database.mdf"
$ldf = Join-Path $work "${Database}_log.ldf"
$escapedBackup = $backupPath.Replace("'", "''")
$connection = New-Object System.Data.SqlClient.SqlConnection "Server=$Server;Database=master;Integrated Security=true;TrustServerCertificate=true"
$connection.Open()
try {
  $fileCommand = $connection.CreateCommand()
  $fileCommand.CommandText = "RESTORE FILELISTONLY FROM DISK=N'$escapedBackup'"
  $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $fileCommand
  $files = New-Object System.Data.DataTable
  [void]$adapter.Fill($files)
  $dataLogical = ($files.Rows | Where-Object { $_.Type -eq 'D' } | Select-Object -First 1).LogicalName
  $logLogical = ($files.Rows | Where-Object { $_.Type -eq 'L' } | Select-Object -First 1).LogicalName
  if (-not $dataLogical -or -not $logLogical) { throw 'Could not identify SQL Server backup files.' }
  $command = $connection.CreateCommand()
  $command.CommandTimeout = 300
  $escapedMdf = $mdf.Replace("'", "''")
  $escapedLdf = $ldf.Replace("'", "''")
  $escapedDataLogical = $dataLogical.Replace("'", "''")
  $escapedLogLogical = $logLogical.Replace("'", "''")
  $command.CommandText = "IF DB_ID(N'$Database') IS NOT NULL BEGIN ALTER DATABASE [$Database] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$Database]; END; RESTORE DATABASE [$Database] FROM DISK=N'$escapedBackup' WITH MOVE N'$escapedDataLogical' TO N'$escapedMdf', MOVE N'$escapedLogLogical' TO N'$escapedLdf', REPLACE;"
  [void]$command.ExecuteNonQuery()
} finally { $connection.Close() }

try {
  & (Join-Path $PSScriptRoot 'export-legacy.ps1') -Server $Server -Database $Database -Output $Output
} finally {
  $cleanup = New-Object System.Data.SqlClient.SqlConnection "Server=$Server;Database=master;Integrated Security=true;TrustServerCertificate=true"
  $cleanup.Open()
  try {
    $command = $cleanup.CreateCommand()
    $command.CommandText = "IF DB_ID(N'$Database') IS NOT NULL BEGIN ALTER DATABASE [$Database] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$Database]; END"
    [void]$command.ExecuteNonQuery()
  } finally { $cleanup.Close() }
}
