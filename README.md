1. Install Node.js (one-time, using winget which is built into Windows):

winget install OpenJS.NodeJS.LTS

Then close and reopen your terminal so node and npm are available.

2. Build the app (in the project folder):

cd path\to\shwTracker
npm install
npm run build:win

The .exe will appear in the dist/ folder. Right-click it and "Pin to taskbar."
