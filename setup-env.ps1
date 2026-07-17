# Tanglish Caption Studio - PowerShell Environment Setup
# Run this in PowerShell (right-click → Run with PowerShell or paste in terminal)
# It will securely ask for your Gemini API key and create .env file

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Tanglish Caption Studio - Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will create a .env file with your API keys." -ForegroundColor Yellow
Write-Host "The key is required for AI transcription of your videos." -ForegroundColor Yellow
Write-Host ""

# Check if .env already exists
if (Test-Path ".env") {
    Write-Host ".env file already exists!" -ForegroundColor Red
    $overwrite = Read-Host "Do you want to overwrite it? (y/n)"
    if ($overwrite -ne "y") {
        Write-Host "Setup cancelled. Your existing .env is safe." -ForegroundColor Green
        exit
    }
}

Write-Host ""
Write-Host "Please enter your Gemini API key (required for video transcription):" -ForegroundColor Green
$geminiKey = Read-Host "GEMINI_API_KEY"

if ([string]::IsNullOrWhiteSpace($geminiKey)) {
    Write-Host "ERROR: GEMINI_API_KEY cannot be empty!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Optional: Enter fallback keys (press Enter to skip)" -ForegroundColor Yellow
$groqKey = Read-Host "GROQ_API_KEY (optional)"
$nvidiaKey = Read-Host "NVIDIA_API_KEY (optional)"
$openrouterKey = Read-Host "OPENROUTER_API_KEY (optional)"

# Create .env content
$envContent = @"
# GEMINI_API_KEY: Required for Gemini AI API calls.
# Supports multiple keys separated by commas or spaces for automatic API rotation.
GEMINI_API_KEY="$geminiKey"

# FAILOVER AI PROVIDERS:
# If Gemini fails or keys run out, the caption studio instantly switches to these.
GROQ_API_KEY="$groqKey"
NVIDIA_API_KEY="$nvidiaKey"
OPENROUTER_API_KEY="$openrouterKey"

# APP_URL: The URL where this applet is hosted (auto-filled on some platforms)
APP_URL="http://localhost:3000"
"@

# Write the file
$envContent | Out-File -FilePath ".env" -Encoding UTF8 -Force

Write-Host ""
Write-Host "✅ .env file created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run: npm install" -ForegroundColor White
Write-Host "2. Run: npm run dev" -ForegroundColor White
Write-Host "3. Open http://localhost:3000 and start transcribing your videos!" -ForegroundColor White
Write-Host ""
Write-Host "Your API key is now configured. The app will use it for Tanglish video transcription." -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  Never commit the .env file (it's already in .gitignore)" -ForegroundColor Yellow
