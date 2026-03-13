# Signal Export Viewer

A single-file browser app for viewing [Signal](https://signal.org) chat exports. Everything runs locally — no data ever leaves your machine.

## Usage

Open `signal-export-viewer.html` in a browser. You can either:

- **Open export folder** — pick the root export folder all at once. The app will automatically find `main.jsonl`, `chat-names.json`, and the `files/` subfolder.
- **Load files manually** — drop or browse for each file individually.

## Export files

### `main.jsonl` (required)

The main export file produced by Signal Desktop's export feature. Each line is a JSON object representing a single chat message.

### `files/` folder (optional)

The folder of attachment files from the export. When provided, images are displayed inline in the chat view and other files are available for download.

### `chat-names.json` (optional)

A JSON file that maps chat IDs to human-readable display names. Without it, chats are labeled `Chat <id>` using the raw ID from the export.

**Format:** a single JSON object where each key is a chat ID (as it appears in `main.jsonl`) and each value is the display name string.

```json
{
  "4": "Alice",
  "345": "Bob",
  "567": "Family Group"
}
```

Chat IDs are the numeric `chatId` values found in each line of `main.jsonl`. You can identify them by loading the export without `chat-names.json` first — chats will be listed by their raw ID in the sidebar.

## Files

| File | Description |
|------|-------------|
| `signal-export-viewer.html` | Main HTML entry point |
| `signal-export-viewer.css` | Styles |
| `signal-export-viewer.js` | Application logic |
