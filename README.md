# SMART AIO_clutch Workspace Plugin Release

This folder is a workspace-plugin marketplace package for publishing Smart AIO to a ChatGPT Business or Enterprise workspace.

## Contents

- `.agents/plugins/marketplace.json`: Marketplace entrypoint for workspace import.
- `plugins/smart-aio/`: Smart AIO plugin package, including Skills, a bundled local MCP runtime, references, scripts, tests, assets, and `.codex-plugin/plugin.json`.

## Admin Publish Steps

1. Push this folder structure to a GitHub repository that the workspace admin can access.
2. In ChatGPT, open the Business or Enterprise workspace admin area.
3. Go to Admin > Plugins.
4. Add or import a plugin marketplace from GitHub.
5. Select the repository, branch, and the path that contains this folder.
6. After sync, open the imported Smart AIO plugin.
7. Set the installation policy for every target role or group to **Installed by default**. Do not leave Smart AIO at **Available**, because that can leave the desktop client at `installed: false` until each member installs it manually.
8. Confirm any required connector or app permissions separately.
9. Ask a target member to restart the ChatGPT desktop app, start a new chat, select SMART AIO_clutch, and verify that Smart AIO reports `installed: true` and that `smart_aio_verify_runtime` returns `status=READY` before requesting article production.

## Important Notes

- Smart AIO requires the ChatGPT desktop app because its protected-prompt verification and article workflow run through the bundled local MCP server. The MCP server exposes the packaged Node.js runtime as callable tools, so members do not need the source checkout or a manually entered shell command.
- Browser and Cloud-only execution cannot start this local MCP server. Start a new desktop-app chat after installing or updating the plugin.
- The marketplace defaults Smart AIO to `INSTALLED_BY_DEFAULT`, but the workspace admin policy remains authoritative. After every GitHub update, the admin must sync the Marketplace and confirm **Installed by default** for all target roles or groups.
- Treat `installed: false` as a deployment failure. Do not attempt to replace the missing runtime by manually reproducing its steps in the conversation.
- A clean-device acceptance test requires both `installed: true` and a successful `smart_aio_verify_runtime` result. Seeing the Skills or bundled files alone is not execution evidence.
- Installing the plugin does not grant Google Drive, Sheets, or other connector access by itself. Each required app or connector permission must be enabled for the target role, and each member may need to authorize their account.
- IDE extensions do not support plugins. Use supported ChatGPT surfaces, ChatGPT desktop Codex, or Codex CLI.
