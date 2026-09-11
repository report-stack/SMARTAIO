# SMART AIO_clutch Workspace Plugin Release

This folder is a workspace-plugin marketplace package for publishing Smart AIO to a ChatGPT Business or Enterprise workspace.

## Contents

- `.agents/plugins/marketplace.json`: Marketplace entrypoint for workspace import.
- `plugins/smart-aio/`: Smart AIO plugin package, including Skills, references, scripts, tests, assets, and `.codex-plugin/plugin.json`.

## Admin Publish Steps

1. Push this folder structure to a GitHub repository that the workspace admin can access.
2. In ChatGPT, open the Business or Enterprise workspace admin area.
3. Go to Admin > Plugins.
4. Add or import a plugin marketplace from GitHub.
5. Select the repository, branch, and the path that contains this folder.
6. After sync, open the imported Smart AIO plugin.
7. Set the installation policy for the target roles or groups:
   - Available: members can install it themselves.
   - Installed by default: members see it without manual install.
8. Confirm any required connector or app permissions separately.
9. Ask a target member to start a new chat or Codex task and check that Smart AIO appears.

## Important Notes

- The marketplace file's local `policy.installation` value does not replace workspace admin policy. The workspace admin must still choose who can use or install the plugin.
- Installing the plugin does not grant Google Drive, Sheets, or other connector access by itself. Each required app or connector permission must be enabled for the target role, and each member may need to authorize their account.
- IDE extensions do not support plugins. Use supported ChatGPT surfaces, ChatGPT desktop Codex, or Codex CLI.
