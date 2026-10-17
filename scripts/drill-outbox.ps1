# Run only against the local Docker Compose stack with the backend already running.
# Stops Kafka briefly, creates an outbox event via the guest API, and verifies eventual delivery.
$ErrorActionPreference = 'Stop'
$health = Invoke-RestMethod -Uri 'http://localhost:8080/api/health' -TimeoutSec 5
$name = 'Drill' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$sql = "select coalesce((select attempts::text || ':' || (sent_at is not null)::text from outbox_event where payload like '%$name%' order by created_at desc limit 1), 'missing')"
try {
  docker compose stop kafka | Out-Host
  $body = @{ displayName = $name } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri 'http://localhost:8080/api/auth/guest' -ContentType 'application/json' -Body $body -TimeoutSec 20 | Out-Null
  Start-Sleep -Seconds 15
  $during = (docker compose exec -T postgres psql -U worldexplorer -d worldexplorer -At -c $sql).Trim()
  if ($during -eq 'missing') { throw 'No durable outbox event was created' }
  $attempts = [int]($during.Split(':')[0])
  if ($attempts -gt 4 -or $during.EndsWith('true')) { throw "Unexpected outage state: $during" }
  Write-Host "Outage: event remains unsent after 15 s with $attempts retries"
}
finally {
  docker compose up -d --wait kafka | Out-Host
}
$deadline = (Get-Date).AddMinutes(3)
do {
  Start-Sleep -Seconds 3
  $after = (docker compose exec -T postgres psql -U worldexplorer -d worldexplorer -At -c $sql).Trim()
  if ($after.EndsWith('true')) { Write-Host "Recovery: event delivered ($after)"; exit 0 }
} while ((Get-Date) -lt $deadline)
throw "Event was not delivered after Kafka recovered: $after"
