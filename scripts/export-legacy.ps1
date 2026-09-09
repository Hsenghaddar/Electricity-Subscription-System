param(
  [string]$Server = '(localdb)\MSSQLLocalDB',
  [string]$Database = 'CodexIshtirakInspect',
  [string]$Output = '.migration'
)

$ErrorActionPreference = 'Stop'
$tables = @(
  'AmperAmounts','Boxes','Breakers','BrkrSbscrbrMonths','BSMonthDetails','Collectors',
  'ConsumptionDetails','Consumptions','Counters','Items','OutlayDetails','Outlays',
  'PaymentDetails','Payments','RegionBreakerPrices','Regions','RepaymentDetails',
  'Repayments','Subscribers'
)

New-Item -ItemType Directory -Force -Path $Output | Out-Null
$connection = New-Object System.Data.SqlClient.SqlConnection "Server=$Server;Database=$Database;Integrated Security=true;TrustServerCertificate=true"
$connection.Open()
try {
  foreach ($table in $tables) {
    $command = $connection.CreateCommand()
    $command.CommandText = "SELECT * FROM dbo.[$table] ORDER BY 1"
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
    $data = New-Object System.Data.DataTable
    [void]$adapter.Fill($data)
    $rows = @($data.Rows | ForEach-Object {
      $record = [ordered]@{}
      foreach ($column in $data.Columns) {
        $value = $_[$column.ColumnName]
        $record[$column.ColumnName] = if ($value -is [DBNull]) { $null } elseif ($value -is [DateTime]) { $value.ToString('yyyy-MM-dd') } else { $value }
      }
      [pscustomobject]$record
    })
    ConvertTo-Json -InputObject $rows -Depth 4 -Compress | Set-Content -LiteralPath (Join-Path $Output "$table.json") -Encoding UTF8
    Write-Host "$table`: $($rows.Count)"
  }
} finally { $connection.Close() }

