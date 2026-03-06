#!/usr/bin/env node

/**
 * Export Canvas M8 board to PNG using Puppeteer and Excalidraw
 * 
 * Usage:
 *   node export-png.js [output-file.png]
 *   
 * Output defaults to board-export.png if not specified
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const DEFAULT_URL = process.env.M8_URL || "http://localhost:6809";
const OUTPUT_FILE = process.argv[2] || 'board-export.png';

async function fetchBoardData(baseUrl) {
  const response = await fetch(`${baseUrl}/api/board`);
  if (!response.ok) {
    throw new Error(`Failed to fetch board: ${response.statusText}`);
  }
  return response.json();
}

async function exportToPng() {
  console.log('🎨 Fetching board data from Canvas M8...');
  const boardData = await fetchBoardData(DEFAULT_URL);
  
  console.log(`📊 Found ${boardData.elements?.length || 0} elements`);
  
  console.log('🌐 Launching headless browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Create a minimal HTML page with Excalidraw
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@excalidraw/excalidraw/dist/excalidraw.production.min.js"></script>
</head>
<body>
  <div id="app" style="height: 100vh; width: 100vw;"></div>
  <script>
    window.boardData = ${JSON.stringify(boardData)};
  </script>
</body>
</html>`;
    
    await page.setContent(html);
    
    // Wait for Excalidraw to load
    await page.waitForFunction(() => typeof window.ExcalidrawLib !== 'undefined');
    
    console.log('🎨 Rendering board to PNG...');
    
    // Export to blob using Excalidraw's utility
    const pngBuffer = await page.evaluate(async () => {
      const { exportToBlob } = window.ExcalidrawLib;
      const { elements, appState, files } = window.boardData;
      
      const blob = await exportToBlob({
        elements: elements || [],
        appState: appState || {},
        files: files || {},
        mimeType: 'image/png',
        quality: 0.95,
        exportPadding: 20
      });
      
      // Convert blob to base64 for transfer
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    });
    
    // Convert base64 back to buffer
    const base64Data = pngBuffer.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    fs.writeFileSync(OUTPUT_FILE, buffer);
    console.log(`✅ Exported to ${OUTPUT_FILE} (${buffer.length} bytes)`);
    
  } finally {
    await browser.close();
  }
}

exportToPng().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
