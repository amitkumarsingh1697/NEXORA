/** Styles for the brain viewer, scoped under .nb-root. Dark by design: the brain glows. */
export const VIEWER_CSS = `
.nb-root{--nb-bg:#05060d;--nb-panel:rgba(12,15,30,.86);--nb-line:rgba(148,163,184,.22);--nb-text:#e5e9f5;--nb-muted:#a3adc2;--nb-accent:#7dd3fc;
  position:relative;overflow:hidden;background:var(--nb-bg);color:var(--nb-text);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;min-height:520px}
.nb-root *{box-sizing:border-box}
.nb-root button{font:inherit;color:inherit;cursor:pointer}
.nb-root button:focus-visible,.nb-root input:focus-visible,.nb-root summary:focus-visible{outline:2px solid var(--nb-accent);outline-offset:2px}
.nb-stage{position:absolute;inset:0}
.nb-stage canvas{display:block;width:100%;height:100%;touch-action:none}
.nb-no3d{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:340px;text-align:center;color:var(--nb-muted)}
.nb-labels{position:absolute;inset:0;pointer-events:none}
.nb-labels>div{position:absolute;left:0;top:0;white-space:nowrap;font-size:11px;color:#dbeafe;text-shadow:0 0 4px #000,0 0 8px #000;margin:-8px 0 0 8px}
.nb-labels .nb-lbl-region{font-size:15px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin:-10px 0 0 -40px}
.nb-labels .nb-r-frontend{color:#7dd3fc}.nb-labels .nb-r-backend{color:#c4b5fd}.nb-labels .nb-r-database{color:#6ee7b7}.nb-labels .nb-r-devops{color:#fcd34d}.nb-labels .nb-r-core{color:#f9a8d4}
.nb-labels .nb-lbl-sel{font-size:13px;font-weight:700;color:#fff}
.nb-labels .nb-lbl-hover{color:#fff;font-weight:600}
.nb-tooltip{position:absolute;pointer-events:none;background:var(--nb-panel);border:1px solid var(--nb-line);border-radius:6px;padding:3px 8px;font-size:12px}
.nb-top{position:absolute;left:12px;top:10px;right:12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;pointer-events:none}
.nb-top>*{pointer-events:auto}
.nb-title{margin:0;font-size:16px;font-weight:600}
.nb-crumbs{display:flex;align-items:center;gap:6px;color:var(--nb-muted);font-size:13px}
.nb-crumbs button{background:none;border:0;padding:0;color:var(--nb-accent);text-decoration:underline}
.nb-crumbs [aria-current]{color:var(--nb-text)}
.nb-search{position:relative;width:min(340px,100%)}
.nb-dg-open{margin-left:auto;background:rgba(125,211,252,.12);border:1px solid rgba(125,211,252,.45);border-radius:8px;padding:7px 12px;font-weight:600}
.nb-dg-open:hover{background:rgba(125,211,252,.22)}
.nb-diagrams{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;background:#f8fafc;color:#0f172a}
.nb-diagrams[hidden]{display:none}
.nb-dg-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #cbd5e1;background:#ffffff}
.nb-dg-bar button,.nb-dg-bar select{color:#0f172a;background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;padding:5px 10px;font:inherit}
.nb-dg-bar button:hover{background:#f1f5f9}
.nb-dg-bar [role=tablist]{display:flex;gap:4px}
.nb-dg-bar [role=tab][aria-selected=true]{background:#0f172a;color:#ffffff;border-color:#0f172a}
.nb-dg-scope{display:flex;align-items:center;gap:6px;font-size:13px;color:#334155}
.nb-dg-scope select{max-width:340px}
.nb-dg-download{margin-left:auto;font-weight:600}
.nb-diagrams .nb-close{position:static;font-size:18px;line-height:1;padding:4px 10px}
.nb-dg-note{margin:0;padding:6px 12px;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0}
.nb-dg-canvas{flex:1;overflow:auto;padding:4px}
.nb-dg-canvas svg{display:block}
.nb-dg-canvas g[data-id]{cursor:pointer}
.nb-dg-canvas g[data-id]:hover rect:first-of-type{stroke:#0284c7;stroke-width:2}
.nb-search input{width:100%;background:var(--nb-panel);border:1px solid var(--nb-line);border-radius:8px;color:var(--nb-text);padding:7px 10px}
.nb-results{position:absolute;left:0;right:0;top:100%;margin:4px 0 0;padding:4px;list-style:none;background:#0c1020;border:1px solid var(--nb-line);border-radius:8px;max-height:320px;overflow:auto;z-index:5}
.nb-results li{padding:6px 8px;border-radius:6px;cursor:pointer}
.nb-results li[aria-selected=true],.nb-results li:hover{background:rgba(125,211,252,.14)}
.nb-results small{color:var(--nb-muted)}
.nb-left,.nb-right{position:absolute;top:56px;bottom:40px;overflow:auto;background:var(--nb-panel);border:1px solid var(--nb-line);border-radius:12px;padding:12px;backdrop-filter:blur(6px)}
.nb-left{left:12px;width:270px}
.nb-right{right:12px;width:360px}
.nb-left h3,.nb-right h3{margin:4px 0 8px;font-size:15px}
.nb-regions{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.nb-regions p{margin:2px 0 0 4px;color:var(--nb-muted);font-size:12px}
.nb-region{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:rgba(255,255,255,.04);border:1px solid var(--nb-line);border-radius:8px;padding:8px}
.nb-region:hover{background:rgba(255,255,255,.09)}
.nb-region small{margin-left:auto;color:var(--nb-muted)}
.nb-swatch{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none;box-shadow:0 0 8px currentColor}
.nb-back{background:none;border:0;padding:0;color:var(--nb-accent)}
.nb-hint{color:var(--nb-muted);font-size:12px;margin:6px 0}
.nb-files details{border-top:1px solid var(--nb-line);padding:4px 0}
.nb-files summary{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--nb-muted);cursor:pointer;word-break:break-all}
.nb-root ul{list-style:none;margin:4px 0;padding:0}
.nb-link{display:flex;align-items:center;gap:6px;background:none;border:0;padding:3px 2px;text-align:left;width:100%;border-radius:4px;word-break:break-word}
.nb-link:hover{background:rgba(255,255,255,.07)}
.nb-link small{color:var(--nb-muted)}
.nb-right header{position:relative;padding-right:28px}
.nb-kind{margin:0;color:var(--nb-muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.nb-close{position:absolute;right:0;top:0;background:none;border:0;font-size:20px;line-height:1;color:var(--nb-muted)}
.nb-file{font-family:ui-monospace,monospace;font-size:12px;color:var(--nb-muted);word-break:break-all;margin:0 0 8px}
.nb-open{background:rgba(125,211,252,.12);border:1px solid rgba(125,211,252,.4);border-radius:6px;padding:4px 10px;margin-bottom:8px}
.nb-doc{margin:6px 0;color:#cbd5e1}
.nb-sig{white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.35);border:1px solid var(--nb-line);border-radius:6px;padding:8px;font-size:12px;margin:8px 0}
.nb-root h4{margin:12px 0 4px;font-size:13px}
.nb-root h5{margin:8px 0 2px;font-size:12px;color:var(--nb-muted);font-weight:600}
.nb-cols-wrap{overflow-x:auto;margin:4px 0 8px}
.nb-cols table{border-collapse:collapse;font-size:12px;width:100%}
.nb-cols th,.nb-cols td{border-bottom:1px solid var(--nb-line);padding:3px 4px;text-align:left;white-space:nowrap;vertical-align:top}
.nb-cols td:first-child,.nb-cols td:last-child{white-space:normal;overflow-wrap:anywhere}
.nb-cols th{color:var(--nb-muted);font-weight:600}
.nb-cols td:first-child{font-family:ui-monospace,monospace}
.nb-io li{font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;padding:2px 0}
.nb-rel-in h4{color:#7dd3fc}.nb-rel-out h4{color:#fdba74}
.nb-rel li{display:flex;flex-direction:column;padding:2px 0}
.nb-conf{margin-left:18px;font-size:11px;color:var(--nb-muted);word-break:break-all}
.nb-conf.nb-observed{color:#86efac}.nb-conf.nb-inferred{color:#fcd34d}.nb-conf.nb-unknown{color:#fca5a5}
.nb-legend{position:absolute;left:12px;bottom:10px;display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--nb-muted)}
.nb-legend span{display:flex;align-items:center;gap:6px}
.nb-line{display:inline-block;width:18px;height:0;border-top:2px solid #7dd3fc}
.nb-line.nb-inferred{border-top-style:dashed;border-color:#fcd34d}
.nb-dot{display:inline-block;width:9px;height:9px;border-radius:50%}
.nb-dot.nb-in{background:#38bdf8}.nb-dot.nb-out{background:#fb923c}
.nb-status{position:absolute;right:12px;bottom:10px;margin:0;font-size:12px;color:var(--nb-muted)}
.nb-notes{margin-top:12px;font-size:12px;color:var(--nb-muted)}
.nb-notes li{margin:4px 0}
@media (max-width:820px){
  .nb-left{top:auto;bottom:44px;left:8px;right:8px;width:auto;max-height:34%}
  .nb-right{top:auto;bottom:44px;left:8px;right:8px;width:auto;max-height:50%;z-index:3}
  .nb-search{width:100%}
}
`;
