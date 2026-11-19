/**
 * Bakerss Property Services — read-only staging source and HTTP redirect QA.
 * No credentials, no production updates, and no POST requests.
 * Node.js 20+; run: node scripts/bakerss-staging-seo-qa.mjs --static
 * Or: node scripts/bakerss-staging-seo-qa.mjs --live
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PREVIEW = 'https://bakerss-site-git-staging-cloydraymond-4879s-projects.vercel.app';
const MANIFEST = path.join(ROOT,'seo-cleanup','redirect-shadow-manifest.txt');
const REPORT_DIR = path.join(ROOT,'seo-cleanup','qa-results');
const LIVE = process.argv.includes('--live');
const ERRORS = [];
const WARNINGS = [];
const started = new Date().toISOString();

function failure(msg){ ERRORS.push(msg); }
function warning(msg){ WARNINGS.push(msg); }
function localFileForRoute(urlPath) {
  if(urlPath === '/') return 'index.html';
  if(urlPath.endsWith('/')) return `${urlPath.slice(1)}index.html`;
  return urlPath.slice(1);
}
function removedFileToSource(file) {
  if(file.endsWith('/index.html')) return `/${file.slice(0,-10)}`;
  return `/${file}`;
}
function urlPath(s) { return new URL(s,PREVIEW).pathname; }
function normalizeRoute(p) {return decodeURIComponent(p).replace(/\/{2,}/g,'/');}
function samePath(a,b) { return normalizeRoute(urlPath(a)) === normalizeRoute(urlPath(b)); }
function toMdTable(values, title) {
  if(!values.length) return `### ${title}\nNone.\n`;
  return `### ${title} (${values.length})\n` + values.slice(0,100).map(x=>`- ${String(x).replaceAll('|','\\|')}`).join('\n') + (values.length>100?'\n- Additional entries omitted from preview; see JSON report.':'') +'\n';
}
const config=JSON.parse(await fs.readFile(path.join(ROOT,'vercel.json'),'utf8'));
const rules=Array.isArray(config.redirects) ? config.redirects:[];
const sourceRules=new Map();
for(const rule of rules) {
  if(sourceRules.has(rule.source)) failure(`Duplicate redirect source: ${rule.source}`);
  sourceRules.set(rule.source,rule);
}
const lines=(await fs.readFile(MANIFEST,'utf8')).split(/\r?\n/).map(x=>x.trim());
const files=lines.filter(x=>x && (x.endsWith('.html') || x.endsWith('.html.html')));
if(files.length!==181) failure(`Expected 181 proposed redundant HTML files, found ${files.length}.`);
if(new Set(files).size!==files.length) failure('Deletion-review manifest contains duplicate file paths.');
const sitemapText=await fs.readFile(path.join(ROOT,'sitemap.xml'),'utf8');
const sitemapPaths=[...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x=>urlPath(x[1]));
const sitemapSet=new Set(sitemapPaths);
const candidates=[];
for(const file of files) {
  if(file.startsWith('/') || file.split('/').some(seg => seg === '..' || seg === '.') || file.includes('\\')) {
    failure(`Unsafe file path in manifest: ${file}`);continue;
  }
  const source=removedFileToSource(file);
  const rule=sourceRules.get(source);
  if(!rule){failure(`No redirect rule for ${file} (${source})`);continue;}
  if(rule.permanent !== true) failure(`Redirect is not permanent for ${source}`);
  if(!rule.destination?.startsWith('/')) failure(`Unexpected external/invalid redirect destination for ${source}`);
  if(sitemapSet.has(source)) failure(`Sitemap contains removal candidate route ${source}`);
  const target=rule.destination;
  if(sourceRules.has(urlPath(target))) failure(`Redirect chain: ${source} → ${target}`);
  const destFile=localFileForRoute(urlPath(target));
  try {await fs.access(path.join(ROOT,destFile));}
  catch {failure(`Redirect destination has no local source HTML: ${source} → ${target} (${destFile})`);}
  try {await fs.access(path.join(ROOT,file));}
  catch {warning(`Proposed removal candidate already absent from checkout: ${file}`);}
  candidates.push({file,source,target,permanent:rule.permanent});
}
if(sitemapPaths.length!==682) warning(`Sitemap has ${sitemapPaths.length} URLs; expected 682 in prior audited snapshot.`);
for(const p of sitemapPaths) {
  const file=localFileForRoute(p);
  try {await fs.access(path.join(ROOT,file));}
  catch {failure(`Sitemap URL missing source file: ${p} (${file})`);}
}
for(const file of ['get-quote/index.html','api/website-lead.mjs','assets/js/bakerss-quote-crm-bridge.js','assets/js/bakerss-crm-staging-config.js']) {
 try{await fs.access(path.join(ROOT,file));}
 catch{failure(`Working quote-to-CRM component missing: ${file}`);}
}
try{
 const litch=await fs.readFile(path.join(ROOT,'service-areas/litchfield-beach/neighborhoods/index.html'),'utf8');
 if(/CallQuote/.test(litch)) failure('Litchfield layout regression: stray CallQuote text remains.');
}catch{failure('Litchfield neighborhoods page missing.');}

async function remoteGet(url) {
 for(let attempt=0;attempt<2;attempt++){
  try{
   const r=await fetch(url,{redirect:'manual',headers:{'User-Agent':'BakerssStagingAudit/1.0'},signal:AbortSignal.timeout(15000)});
   await r.body?.cancel();
   if([429,500,502,503,504].includes(r.status) && attempt===0) {await new Promise(r=>setTimeout(r,750));continue;}
   return {status:r.status,location:r.headers.get('location'),contentType:r.headers.get('content-type')};
  }catch(e){
   if(attempt===1) return {error:e instanceof Error ? e.name : 'NETWORK_FAILURE'};
   await new Promise(r=>setTimeout(r,750));
  }
 }
 return {error:'UNKNOWN'};
}
async function pool(items, fn, size=4){
 let cursor=0;const out=Array(items.length);
 await Promise.all(Array.from({length:Math.min(size,items.length)},async()=>{
  while(cursor<items.length) {const i=cursor++;out[i]=await fn(items[i],i);}
 }));return out;
}
const checks=[];
if(LIVE && ERRORS.length===0) {
 console.log(`Testing ${candidates.length} proposed redirect URLs on staging Preview...`);
 const srcChecks=await pool(candidates,async c=>{
  const res=await remoteGet(PREVIEW+c.source);
  if(res.error) return {...c,...res,pass:false,why:`request failed (${res.error})`};
  if(![301,308].includes(res.status)) return {...c,...res,pass:false,why:`expected 301/308, got ${res.status}`};
  if(!res.location || !samePath(res.location,c.target)) return {...c,...res,pass:false,why:`expected redirect target ${c.target}, got ${res.location||'(none)'}`};
  return {...c,...res,pass:true};
 });
 checks.push(...srcChecks);
 const targets=[...new Set(srcChecks.filter(x=>x.pass).map(x=>x.target))];
 console.log(`Testing ${targets.length} unique destination pages...`);
 const destChecks=await pool(targets,async t=>({target:t,...await remoteGet(PREVIEW+t)}));
 for(const v of destChecks) if(v.status!==200) failure(`Redirect destination not HTTP 200: ${v.target} status=${v.status??v.error}`);
 for(const v of srcChecks) if(!v.pass) failure(`Redirect check failed: ${v.source} (${v.why})`);
 const sit=await remoteGet(PREVIEW+'/sitemap.xml');
 if(sit.status!==200) failure(`Preview sitemap not HTTP 200: ${sit.status??sit.error}`);
}
await fs.mkdir(REPORT_DIR,{recursive:true});
const summary={started,completed:new Date().toISOString(),mode:LIVE?'live':'static',host:PREVIEW,manifestFiles:files.length,redirectRules:rules.length,sitemapUrls:sitemapPaths.length,redirectChecks:checks.length,passedRedirectChecks:checks.filter(x=>x.pass).length,errors:ERRORS,warnings:WARNINGS,checks};
const md=`# Bakerss Website — Staging SEO Routing QA\n\nMode: **${LIVE?'Live HTTP + source checks':'Source checks only'}**  \nTarget: \`${PREVIEW}\`  \nCompleted: ${summary.completed}\n\n| Metric | Result |\n|---|---:|\n| Redirect rules | ${rules.length} |\n| Proposed removal candidates | ${files.length} |\n| Sitemap URLs | ${sitemapPaths.length} |\n| Live redirects tested | ${checks.length} |\n| Live redirect tests passed | ${summary.passedRedirectChecks} |\n| Errors | ${ERRORS.length} |\n| Warnings | ${WARNINGS.length} |\n\n${toMdTable(ERRORS,'Errors')}\n${toMdTable(WARNINGS,'Warnings')}\n**This report does not delete files, change credentials, or submit CRM leads.** A pass authorizes reviewing a deletion commit, not deploying Production.\n`;
await Promise.all([
 fs.writeFile(path.join(REPORT_DIR,'report.md'),md),
 fs.writeFile(path.join(REPORT_DIR,'report.json'),JSON.stringify(summary,null,2))
]);
console.log(md);
if(ERRORS.length)process.exitCode=1;
