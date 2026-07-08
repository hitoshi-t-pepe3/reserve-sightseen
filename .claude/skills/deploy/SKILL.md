# Cloud Code Deploy Project

## Project Overview
This is a Cloud Run / App Engine deployment project. The primary deployment script is located at the project root.

## Directory Structure
```
.
├── deploy.sh                 # Main deployment script
├── deploy/                   # Deployment configuration directory
│   ├── clouddeploy.yaml     # Cloud Deploy config (if applicable)
│   ├── app.yaml             # App Engine config (if applicable)
│   └── service.yaml         # Cloud Run service config (if applicable)
├── src/                      # Application source code
├── config/                   # Configuration files
└── .gcloudignore            # Files to ignore during gcloud operations
```

## Deployment Target
- **Primary Target**: Cloud Run or App Engine
- **Deployment Tool**: gcloud CLI
- **Configuration**: Environment-specific configs in deploy/

## Key Commands & Workflows

### Deploy Script Modification Rules
When asked to modify deploy.sh or files in deploy/:

1. **ALWAYS edit the script directly** - Do not ask for confirmation
2. **AUTOMATICALLY execute** - After editing, run the modified script or appropriate gcloud command
3. **No dry-run delays** - Skip interactive confirmations; just apply changes and execute
4. **Validate during execution** - Error messages from gcloud will indicate if changes need adjustment

### Important gcloud Commands
```bash
# Deploy to Cloud Run
gcloud run deploy SERVICE_NAME --source . --region asia-northeast1

# Deploy to App Engine
gcloud app deploy deploy/app.yaml

# Check deployment status
gcloud run services describe SERVICE_NAME --region asia-northeast1
gcloud app versions list

# View logs
gcloud run logs read SERVICE_NAME --region asia-northeast1
gcloud app logs read
```

## Environment & Authentication
- **GCP Project**: Inferred from gcloud config
- **Region**: Default to asia-northeast1 (update if different)
- **Authentication**: Use current gcloud credentials (assumed to be configured)

## Code Style & Conventions
- Bash scripts use `set -euo pipefail` for safety
- All gcloud commands include explicit `--region` and `--project` when needed
- Environment variables are defined at script top for easy modification
- Error handling includes meaningful exit codes

## When Modifying Deploy Scripts
1. Update the target script (deploy.sh, clouddeploy.yaml, etc.)
2. Check for any hardcoded values that should be variables
3. Run the modified script immediately
4. Report any gcloud errors clearly

## Auto-Execution Mode
Claude Code should:
- ✅ Edit deploy.sh and files in deploy/ without asking
- ✅ Execute gcloud commands and bash scripts automatically
- ✅ Read error output and suggest fixes if deployment fails
- ✅ Commit successful changes to git (with clear commit messages)

**Do NOT ask "should I run this?" - just run it.**

## Common Tasks
- **Update service name**: Modify SERVICE_NAME variable in deploy.sh and clouddeploy.yaml
- **Change deployment region**: Update region in gcloud commands (default: asia-northeast1)
- **Add environment variables**: Edit deploy/app.yaml or deploy/service.yaml
- **Troubleshoot failed deployment**: Check recent gcloud logs and update script accordingly

## Notes for Claude Code
- This project uses Cloud Code deploy automation
- Speed is priority; ask questions ONLY if script is ambiguous
- Use `gcloud run logs read` and `gcloud app logs read` to debug issues
- Commit to git after successful modifications
