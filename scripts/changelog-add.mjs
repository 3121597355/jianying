#!/usr/bin/env node
/**
 * 追加一条后台更新日志（同时写入本地数据文件和线上种子文件）。
 *
 * 用法：
 *   node scripts/changelog-add.mjs --version 2026.11.18.1 --kind feature \
 *     --title "导出前预览" --content "第一行\n第二行"
 *   node scripts/changelog-add.mjs --json scripts/changelog-batch.json
 *   node scripts/changelog-add.mjs --list
 *
 * 约定：每次提交用户可见的改动，都要顺手补一条日志。
 * 线上后台的日志存在 PostgreSQL，部署后会用 changelog-seed.json 自动补齐缺少的版本。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {normalizeChangelog} from '../changelog.mjs';

const root = path.resolve(import.meta.dirname, '..');
const dataFile = path.join(root, 'private', 'admin', 'changelog.json');
const seedFile = path.join(root, 'changelog-seed.json');

const args = process.argv.slice(2);
const flag = name => {
  const index = args.indexOf('--' + name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) return true;
  return value;
};

function read(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const normalizeText = value => String(value ?? '').replace(/\\n/g, '\n').trim();

function parseEntry(raw) {
  return {
    version: normalizeText(raw.version),
    title: normalizeText(raw.title),
    content: normalizeText(raw.content),
    date: normalizeText(raw.date) || new Date().toISOString().slice(0, 10),
    kind: normalizeText(raw.kind) || 'improvement',
  };
}

function collect() {
  const jsonFile = flag('json');
  if (typeof jsonFile === 'string') {
    const list = JSON.parse(fs.readFileSync(path.resolve(root, jsonFile), 'utf8'));
    return list.map(parseEntry);
  }
  if (!flag('version')) return [];
  const contentFile = flag('content-file');
  const content = typeof contentFile === 'string'
    ? fs.readFileSync(path.resolve(root, contentFile), 'utf8')
    : flag('content');
  return [parseEntry({
    version: flag('version'),
    title: flag('title'),
    content,
    date: flag('date'),
    kind: flag('kind'),
  })];
}

const local = read(dataFile, null);
const seed = read(seedFile, []);
if (!Array.isArray(seed)) throw new Error('changelog-seed.json 格式不正确。');

if (flag('list')) {
  for (const entry of [...seed].sort((a, b) => b.date.localeCompare(a.date))) {
    console.log(`${entry.date}  ${entry.version}  ${entry.kind}  ${entry.title}`);
  }
  console.log(`\n共 ${seed.length} 条（种子文件）；本地数据 ${local ? local.length : '未使用'} 条。`);
  process.exit(0);
}

const incoming = collect();
const drafts = [];
for (const raw of incoming) {
  const entry = normalizeChangelog(raw);
  const exists = seed.concat(local || []).find(item => item.version === entry.version);
  if (exists) {
    console.warn(`跳过：版本 ${entry.version} 已存在（${exists.title}）。`);
    continue;
  }
  // 批量补记时让时间戳逐条递增，保证先后顺序稳定（同一天新条目排在前面）。
  const now = new Date(Date.now() + drafts.length).toISOString();
  drafts.push({...entry, id: crypto.randomUUID(), createdAt: now, updatedAt: now});
}

const localVersions = new Set((local || []).map(entry => entry.version));
const missingLocally = seed.filter(entry => !localVersions.has(entry.version));
if (!drafts.length && (!local || !missingLocally.length)) {
  console.log('没有需要新增的日志。');
  process.exit(0);
}

const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2));
  fs.renameSync(file + '.tmp', file);
};

if (flag('dry-run')) {
  console.log(JSON.stringify(drafts, null, 2));
  process.exit(0);
}

const nextSeed = [...seed, ...drafts];
write(seedFile, nextSeed);
// 本地数据文件跟种子取并集，避免两边版本对不上。
if (local) {
  const versions = new Set(local.map(entry => entry.version));
  write(dataFile, [...local, ...nextSeed.filter(entry => !versions.has(entry.version))]);
}

for (const entry of drafts) console.log(`已写入 ${entry.version} ${entry.date} ${entry.title}`);
console.log(`种子文件 ${seed.length} → ${seed.length + drafts.length} 条${local ? `；本地数据 ${local.length} → ${local.length + drafts.length} 条` : ''}。`);
console.log('提示：本地后台立即可见；线上后台在部署后自动补齐这些版本。');
