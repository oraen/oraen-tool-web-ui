# API Debug Tool - Quick Start Guide

## 🚀 Getting Started (2 minutes)

### Step 1: Access the Tool
Navigate to **Professional Tools** → **API Debug Tool** in the menu, or visit:
```
/professionalUtil/apiDebugTool
```

### Step 2: Create Your First Request
1. Click **"New Request"** button
2. Select **GET** from method dropdown
3. Enter URL: `https://httpbin.org/get`
4. Click **"Send"** button
5. See response in right panel

### Step 3: Try with Parameters
1. Click **Params** tab
2. Click **"Add Param"** button
3. Enter: `key: search`, `value: apple`
4. Click **Send** again
5. URL automatically builds: `...?search=apple`

## 📋 Common Tasks

### Save a Request for Later
1. After creating request, click **"Save"** button
2. It's automatically stored in browser
3. Click **"New Collection"** to organize multiple requests

### Use Dynamic Data
In any text field, use:
- `{{uuid}}` → Generates random UUID
- `{{timestamp}}` → Current Unix timestamp
- `{{random(1,100)}}` → Random number between 1-100
- `{{randomString(10)}}` → Random 10-char string

Example URL:
```
https://api.example.com/user/{{uuid}}?t={{timestamp}}
```

### Add Authentication
1. Click **Auth** tab
2. Choose auth type:
   - **Bearer**: Paste your token
   - **Basic**: Enter username/password
   - **API Key**: Select header or query
3. Header is automatically added to request

### Copy as Curl
1. Right-click on request
2. Select "Copy as curl"
3. Paste in your terminal
4. Share with teammates

### Import curl Command
1. Click **Import** button
2. Paste your curl command:
   ```bash
   curl -X POST https://api.example.com/data \
     -H "Authorization: Bearer token123" \
     -H "Content-Type: application/json" \
     -d '{"name":"John"}'
   ```
3. Tool auto-parses all details
4. Click **Send** to test

## 🎯 Advanced Tips

### Pre-Request Script (Before Sending)
```javascript
// Add dynamic timestamp header
request.addHeader('X-Timestamp', Date.now().toString());

// Log before sending
console.log('Sending request to: ' + request.url);
```

Access in script:
- `request.url` - Current URL
- `request.method` - HTTP method
- `request.addHeader(key, value)` - Add header
- `request.setBody(content)` - Modify body
- `console.log()` - See output in browser console

### Post-Response Script (After Response)
```javascript
// Extract and save token for next request
const response_data = JSON.parse(response.body);
if (response_data.token) {
  setVariable('authToken', response_data.token);
  console.log('Token saved!');
}
```

Access in script:
- `response.status` - HTTP status code
- `response.body` - Response content
- `response.headers` - Response headers object
- `setVariable(key, value)` - Save for next request
- `getVariable(key)` - Read saved variable

### Create Token Workflow
1. **Request 1**: Login endpoint → saves token in Post-Response script
2. **Request 2**: Protected endpoint → uses `{{authToken}}` from script
3. All automatic after you run Request 1

## 📊 View Request History

1. Click **History** tab in left sidebar
2. See all past requests with:
   - HTTP method (GET, POST, etc.)
   - Status code (200, 404, etc.)
   - URL
   - Timestamp
3. Click any entry to reload that request

**Auto-cleanup**: Old history (>30 days) is automatically deleted

## 💾 Export & Share

### Export Collection as JSON
1. Right-click collection
2. Click "Export as JSON"
3. File downloads
4. Share with team
5. They can import: Click Import → Select file

### Export Single Request
1. Click request
2. Right-click
3. "Export as curl" → Share directly
4. "Export as JSON" → Save for backup

## ⚙️ Configuration

Click **Settings** button to configure:

- **Default Timeout**: How long to wait for response (default: 30 seconds)
- **History Size**: Max requests to remember (default: 1000)
- **History Expiration**: Days to keep history (default: 30 days)
- **Global Variables**: Available in all requests
- **Default Headers**: Auto-added to every request

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| **CORS Error** | Target API must allow cross-origin requests |
| **Request Timeout** | Increase timeout in Settings (default 30s) |
| **Variable not replaced** | Check syntax: `{{variableName}}` (case-sensitive) |
| **Data lost after refresh** | Ensure you clicked "Save" button |
| **Script not running** | Check browser console (F12) for errors |
| **History disappeared** | Click "Clear History" loads fresh data |

## 📚 Built-in Variable Functions

| Function | Example | Result |
|----------|---------|--------|
| `timestamp` | `{{timestamp}}` | `1704067200` (Unix ms) |
| `uuid` | `{{uuid}}` | `550e8400-e29b-41d4-a716-446655440000` |
| `now` | `{{now}}` | `2024-01-01T12:00:00.000Z` |
| `random` | `{{random(1,100)}}` | `42` (number between 1-100) |
| `randomString` | `{{randomString(10)}}` | `abCd3xYzW2` (10 random chars) |

## 🔐 Security Notes

✅ **Safe**:
- All data stored locally in your browser
- No data sent to external servers
- Scripts run in sandboxed environment
- Tokens stored only in local database

⚠️ **Note**:
- Clear history if using shared computer
- Don't paste sensitive credentials in requests
- Review imported JSON files before using
- Scripts have limited access (no network calls)

## 🎓 Real-world Examples

### Example 1: REST API Testing
```
GET https://api.github.com/users/github
Headers: User-Agent: MyApp
Response: JSON with user data
```

### Example 2: Authentication Flow
```
1. POST /auth/login (with credentials)
2. Post-Response: setVariable('token', data.token)
3. GET /api/user (header: Authorization: {{token}})
```

### Example 3: Pagination
```
GET /items?page={{page}}&limit=10
Change page variable: 1, 2, 3...
Watch history to compare responses
```

## 💡 Pro Tips

1. **Organize with Collections** - Group related requests
2. **Use Variables** - Avoid repetitive copy-paste
3. **Save Scripts** - Build reusable workflows
4. **Export Often** - Backup important collections
5. **Check History** - See what was recently tested
6. **Use Comments** - Name requests descriptively
7. **Pre-Scripts** - Handle authentication dynamically
8. **Post-Scripts** - Extract data for next request

## 🚨 Need Help?

- Check IMPLEMENTATION_GUIDE.md for detailed documentation
- Look at example values in each field
- Try public API like httpbin.org for testing
- Check browser console (F12) for error messages
- Review saved history to see what worked before

---

**Happy API Testing!** 🎉
