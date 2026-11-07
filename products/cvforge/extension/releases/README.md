# CVForge extension packages

Built from this folder's parent with `pnpm zip` (Chrome) and `pnpm exec wxt zip -b edge` (Edge), version 0.1.0.

These packages talk to a CVForge server at `http://localhost:3000`. To use another server, rebuild with `WXT_CVFORGE_URL=<your server> pnpm zip`.

Install: unzip, open `chrome://extensions` or `edge://extensions`, turn on Developer mode, choose **Load unpacked** and select the unzipped folder. Then pair it with a code from **Browser extension** in the CVForge app. Full steps are in the [repository README](../../../../README.md#install-the-extension).
