# Shopee Link Checker App

A React application to check if Shopee product links are still active and available.

## CORS Bypass Solution

This app includes multiple solutions to bypass CORS restrictions when calling Shopee APIs from localhost:

### Option 1: Local Proxy Server (Recommended)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start both the proxy server and React app:**
   ```bash
   npm run dev
   ```
   
   This will start:
   - Proxy server on `http://localhost:3001`
   - React app on `http://localhost:3000`

3. **Or start them separately:**
   ```bash
   # Terminal 1: Start proxy server
   npm run proxy
   
   # Terminal 2: Start React app
   npm start
   ```

### Option 2: Public CORS Proxies (Fallback)

If the local proxy fails, the app automatically falls back to public CORS proxy services:
- `api.allorigins.win`
- `corsproxy.io`

## How It Works

### CORS Issue Fix
The "Refused to set unsafe header 'User-Agent'" error has been resolved by:

1. **Removing unsafe headers:** Removed `User-Agent`, `Pragma`, and `Cache-Control` headers from browser requests
2. **Local proxy server:** The proxy server adds these headers server-side where they're allowed
3. **Multiple fallbacks:** If one method fails, it tries others automatically

### Link Checking Process

1. **URL Parsing:** Extracts `shopId`, `itemId`, and country from Shopee URLs
2. **API Call:** Uses Shopee's internal API: `/api/v2/item/get?itemid={itemId}&shopid={shopId}`
3. **Status Check:** Verifies if the item exists, is not deleted, and has active status
4. **Fallback:** If API fails, falls back to HTTP status checking

### Supported Shopee Domains
- shopee.vn (Vietnam)
- shopee.sg (Singapore)  
- shopee.com.my (Malaysia)
- shopee.ph (Philippines)
- shopee.co.th (Thailand)
- shopee.tw (Taiwan)
- shopee.co.id (Indonesia)

## Usage

1. **Upload Excel File:** Select an Excel file containing Shopee product links
2. **Automatic Processing:** The app finds the "Link tin bài đăng bán sản phẩm" column and checks each link
3. **Download Results:** Get an updated Excel file with the "Tình trạng link SP (tính đến 4/11/2025)" column filled:
   - `x` = Product still exists and is available
   - `` (empty) = Product no longer exists or is inactive

## Troubleshooting

### CORS Errors
- Make sure the proxy server is running on port 3001
- Check if port 3001 is available (not used by other apps)
- Try restarting both servers

### Proxy Server Issues
```bash
# Check if proxy server is running
curl http://localhost:3001/health

# Test Shopee API through proxy
curl "http://localhost:3001/api/shopee/api/v2/item/get?itemid=123456&shopid=789"
```

### Network Issues
- The app tries multiple methods automatically
- Check browser console for detailed error messages
- Ensure stable internet connection

## Technical Details

### Headers Management
- **Browser-safe headers:** Only uses headers allowed by browsers
- **Server-side headers:** Proxy server adds required Shopee headers
- **Automatic retry:** Falls back to different proxy methods if one fails

### Error Handling
- Graceful degradation from API to HTTP checks
- Multiple CORS proxy fallbacks
- Detailed console logging for debugging